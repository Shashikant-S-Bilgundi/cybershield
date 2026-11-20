import { ApiError } from '../errors';
import type { ShieldOpsApi } from '../contract';
import type {
  AiAnswer,
  ComplianceReport,
  ControlResult,
  ControlStatus,
  Finding,
  Framework,
  FrameworkId,
  Priority,
  Recommendation,
  ReportDetail,
  ReportSection,
  ReportType,
  VulnDetail,
} from '@/types';
import { REPORT_TYPE_LABEL } from '@/lib/format';
import { audit, clone, currentUser, db, delay, id, nowIso, save } from './core';
import { prodHealth } from './phase2';
import { reportToPdf } from './pdf';
import type { StoredReport } from './seed7';

type Phase7Keys =
  | 'aiAsk'
  | 'listRecommendations' | 'dismissRecommendation' | 'restoreRecommendation'
  | 'listReports' | 'generateReport' | 'getReport' | 'downloadReportPdf' | 'listReportSchedules' | 'createReportSchedule' | 'deleteReportSchedule'
  | 'listFrameworks' | 'setFrameworkEnabled' | 'getCompliance' | 'attestControl';

export type Phase7Api = Pick<ShieldOpsApi, Phase7Keys>;

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const CLOSED: Finding['status'][] = ['resolved', 'verified', 'accepted_risk', 'false_positive'];
const PRI: Priority[] = ['P1', 'P2', 'P3', 'P4'];
const active = () => db.findings.filter((f) => !CLOSED.includes(f.status));
const appName = (appId: string) => db.applications.find((a) => a.id === appId)?.name ?? 'an application';
const daysLeft = (iso: string) => Math.ceil((Date.parse(iso) - Date.now()) / DAY);
const openTasks = () => db.tasks.filter((t) => ['todo', 'in_progress', 'ready_for_verification'].includes(t.status));
const overdueTasks = () => openTasks().filter((t) => t.dueAt && Date.parse(t.dueAt) < Date.now());
const activeIncidents = () => db.incidents.filter((i) => !['resolved', 'closed'].includes(i.status));

/* ───────────── AI analyst ───────────── */

function requireAi() {
  const ai = db.settings.ai;
  if (!ai.enabled) throw new ApiError(503, 'AI_DISABLED', 'The AI assistant is turned off in System settings. Everything else keeps working.');
  if (!ai.shareApproved) throw new ApiError(409, 'AI_NOT_APPROVED', 'Approve sending masked evidence to the AI provider in System settings first.');
  return ai;
}

type Draft = Omit<AiAnswer, 'id' | 'question' | 'context' | 'model' | 'generatedAt'>;

function explainFinding(f: Finding): Draft {
  const sent = [
    { label: 'Finding', value: f.title },
    { label: 'Severity and priority', value: `${f.severity}, ${f.priority} (risk score ${f.riskScore})` },
    { label: 'Application', value: appName(f.applicationId) },
    ...f.evidence,
    { label: 'Description', value: f.description },
  ];
  const fix: string[] = [];
  const meaning: string[] = [];
  const check: string[] = [];
  const tasks: string[] = [];
  if (f.code?.kind === 'secret') {
    meaning.push(`A ${f.code.rule.toLowerCase()} was committed to the repository. Anyone who can read the repository${f.code.inCurrentCode ? '' : ' history'} can copy it and use it as you.`);
    meaning.push(f.code.inCurrentCode ? 'It is still in the current code, so every clone and fork has it.' : 'It was removed from the current code but remains in Git history, which is just as readable.');
    fix.push(`Deactivate or regenerate the ${f.code.rule.toLowerCase()} with the provider first. Treat it as already copied.`, 'Check the provider’s access logs for use since the commit time.', 'Load the new value from an environment variable or secrets manager, never from a committed file.', 'Remove the file from Git history (for example with git filter-repo) and force-push, then ask collaborators to re-clone.', 'Add a pre-commit Gitleaks hook so it cannot happen again.');
    check.push('A repository scan confirms the value is gone from the code. Rotation itself cannot be seen by ShieldOps; confirm it with the provider.');
    tasks.push(`Rotate the ${f.code.rule.toLowerCase()} and remove it from ${f.code.file}`);
  } else if (f.code?.kind === 'vuln') {
    const v = f.code as VulnDetail;
    meaning.push(f.description.split(' Upgrade ')[0]);
    meaning.push(`${v.package} ${v.installed} is affected in ${v.targetName}. It is fixed in ${v.fixedIn ?? 'no released version yet'}.`);
    if (f.knownExploited) meaning.push('This CVE is on the CISA list of vulnerabilities exploited in the wild, which is why it is a P1.');
    meaning.push('ShieldOps cannot tell whether your code actually calls the vulnerable function, so treat it as reachable unless you have checked.');
    if (v.targetType === 'image') fix.push(`Rebuild ${v.targetName} on a patched base image so ${v.package} is ${v.fixedIn} or later.`, 'Redeploy the rebuilt image, then rescan it.');
    else fix.push(`Upgrade ${v.package} to ${v.fixedIn} or later. If it comes in through another package, upgrade that parent instead.`, 'Run the test suite, deploy, and let the next push trigger a scan.');
    check.push(`A dependency scan of ${v.targetName} shows ${v.package} on a fixed version.`);
    tasks.push(v.targetType === 'image' ? `Rebuild ${v.targetName} on a patched base image` : `Upgrade ${v.package} to ${v.fixedIn} in ${v.targetName}`);
  } else {
    meaning.push(f.description);
    const target = f.evidence[0]?.value ?? '';
    if (f.source === 'headers') fix.push(`Add the header in your web server or app for ${target}. In nginx: add_header with the "always" flag so error pages get it too.`, 'Test in a browser’s developer tools that the header appears on every page.');
    if (f.source === 'ssl') fix.push(f.title.includes('expires') ? 'Renew the certificate now, or check why automatic renewal (for example certbot) did not run.' : 'Change the server’s TLS settings to allow only TLS 1.2 and 1.3 with modern ciphers, then reload it.');
    if (f.source === 'dns') fix.push('Confirm with whoever manages DNS that the change was planned. If not, revert it and change the DNS provider password.');
    if (f.source === 'domain') fix.push('Check the registrar for the expiry date and turn on auto-renew.');
    check.push('The next scheduled check will confirm it, or start a recheck from a remediation task.');
    tasks.push(`Fix: ${f.title}`);
  }
  return {
    contextTitle: f.title,
    sent,
    summary: `${f.priority} finding on ${appName(f.applicationId)}. ${meaning[0]}`,
    sections: [
      { title: 'What this means', bullets: meaning },
      { title: 'How serious it is', bullets: [`Priority ${f.priority} (risk score ${f.riskScore}): ${f.severity} severity, ${db.applications.find((a) => a.id === f.applicationId)?.criticality ?? ''} criticality application, ${f.confidence} evidence${f.knownExploited ? ', known to be exploited' : ''}.`, f.dueAt ? `The SLA says it should be fixed by ${f.dueAt.slice(0, 10)}.` : 'No SLA due date.'] },
      { title: 'How to fix it', bullets: fix },
      { title: 'How you will know it is fixed', bullets: check },
    ],
    suggestedTasks: tasks,
  };
}

function explainIncident(incidentId: string): Draft {
  const inc = db.incidents.find((i) => i.id === incidentId);
  if (!inc) throw new ApiError(404, 'NOT_FOUND', 'Incident not found.');
  const tasks = db.tasks.filter((t) => t.linkedType === 'incident' && t.linkedId === inc.id);
  const steps: string[] = [];
  if (!inc.ownerId) steps.push('Assign an owner so one person drives it.');
  if (!inc.rootCause) steps.push('Write down the root cause once you know it; it is the input for the post-incident summary.');
  if (tasks.some((t) => t.status === 'todo')) steps.push(`Start the ${tasks.filter((t) => t.status === 'todo').length} task(s) still to do.`);
  if (!tasks.length) steps.push('Create a remediation task for the lasting fix, not just the workaround.');
  if (inc.severity === 'critical' && !inc.postIncident) steps.push('Before closing, write the post-incident summary: what happened, the impact, and what changed.');
  if (!steps.length) steps.push('Everything needed is in place. Resolve the incident once the tasks are verified.');
  const draft = inc.rootCause
    ? [`What happened: ${inc.summary || inc.title}`, `Root cause: ${inc.rootCause}`, `Fixes: ${tasks.map((t) => t.title).join('; ') || 'none recorded yet'}.`, 'Impact: add who was affected and for how long.']
    : [];
  return {
    contextTitle: `${inc.ref} ${inc.title}`,
    sent: [
      { label: 'Incident', value: `${inc.ref} ${inc.title} (${inc.severity}, ${inc.status})` },
      { label: 'Summary', value: inc.summary || '—' },
      { label: 'Linked', value: inc.linked.map((l) => l.title).join('; ') || 'nothing' },
      { label: 'Timeline', value: `${inc.timeline.length} entries, latest: ${inc.timeline[0]?.text ?? '—'}` },
      { label: 'Tasks', value: tasks.map((t) => `${t.title} (${t.status})`).join('; ') || 'none' },
      { label: 'Root cause', value: inc.rootCause || 'not written yet' },
    ],
    summary: `${inc.ref} is ${inc.status.replace('_', ' ')} after ${Math.round((Date.now() - Date.parse(inc.openedAt)) / MIN)} minutes, with ${inc.linked.length} linked item(s) and ${tasks.filter((t) => t.status !== 'verified').length} open task(s).`,
    sections: [
      { title: 'What happened so far', bullets: inc.timeline.slice(0, 6).reverse().map((e) => `${e.actorName}: ${e.text}`) },
      { title: 'Suggested next steps', bullets: steps },
      ...(draft.length ? [{ title: 'Draft post-incident summary (edit before using)', bullets: draft }] : []),
    ],
    suggestedTasks: !tasks.length ? [`Permanent fix for ${inc.title.toLowerCase()}`] : [],
  };
}

function explainError(groupId: string): Draft {
  const g = db.errorGroups.find((x) => x.id === groupId);
  if (!g) throw new ApiError(404, 'NOT_FOUND', 'Error group not found.');
  const top = g.stack.find((f) => f.inApp);
  const msg = `${g.type} ${g.message}`;
  let cause = 'The stack trace points at the first frame from your code below.';
  let fix = 'Reproduce it with the request details from a recent event, then add a test for it.';
  if (/ENOSPC/.test(msg)) [cause, fix] = ['The disk the app writes to is full.', 'Free space now, then stop writing uploads to the local disk or cap their size and clean them up.'];
  else if (/reading '(\w+)'/.test(msg)) [cause, fix] = [`Something expected to be an object is undefined when the code reads .${msg.match(/reading '(\w+)'/)![1]}${top ? ` at ${top.file}:${top.line}` : ''}.`, 'Check where that value comes from and handle the missing case explicitly (return a 4xx or skip) rather than letting it throw.'];
  else if (/Timeout|did not respond/i.test(msg)) [cause, fix] = ['A call to another service took longer than the timeout.', 'Add a retry with backoff for safe calls, and make sure waiting requests do not hold scarce resources like database connections.'];
  else if (/not valid JSON|Unexpected token '<'/.test(msg)) [cause, fix] = ['The code parsed an HTML page as JSON, usually an error page from the other service.', 'Check the response status and content type before parsing, and log the status when it is not 200.'];
  else if (/Invalid time value/.test(msg)) [cause, fix] = ['A date being formatted is missing or invalid.', 'Validate the date before formatting it and decide what to show when it is missing.'];
  else if (/Failed to fetch|ChunkLoadError/.test(msg)) [cause, fix] = ['The browser could not reach the server, often a network drop or an old tab after a deploy.', 'Retry failed chunk loads once and show a friendly reload prompt.'];
  return {
    contextTitle: `${g.type}: ${g.message}`,
    sent: [
      { label: 'Error', value: `${g.type}: ${g.message}` },
      { label: 'Where', value: g.culprit },
      { label: 'Your code', value: g.stack.filter((f) => f.inApp).map((f) => `${f.fn} (${f.file}:${f.line})${f.code ? `: ${f.code}` : ''}`).join(' | ') },
      { label: 'Frequency', value: `${g.count} events, ${g.usersAffected} users, last release ${g.lastRelease}` },
      { label: 'Not sent', value: 'User IDs, request bodies, headers and cookies' },
    ],
    summary: `${cause} It has happened ${g.count} times for ${g.usersAffected} users.`,
    sections: [
      { title: 'Likely cause', bullets: [cause, ...(top?.code ? [`The failing line: ${top.code}`] : [])] },
      { title: 'How to fix it', bullets: [fix] },
      { title: 'How you will know it is fixed', bullets: ['Resolve the error group after deploying. If it happens again, ShieldOps marks it regressed and alerts you.'] },
    ],
    suggestedTasks: [`Fix ${g.type} in ${g.culprit.split(' in ')[0]}`],
  };
}

function answerQuestion(question: string): Draft {
  const q = question.toLowerCase();
  const top = [...active()].sort((a, b) => b.riskScore - a.riskScore);
  const sentBase = [
    { label: 'Open findings', value: `${top.length} (${PRI.map((p) => `${top.filter((f) => f.priority === p).length} ${p}`).join(', ')})` },
    { label: 'Active incidents', value: activeIncidents().map((i) => `${i.ref} ${i.title}`).join('; ') || 'none' },
    { label: 'Overdue tasks', value: String(overdueTasks().length) },
    { label: 'Not sent', value: 'Secret values, user names and emails, IP addresses' },
  ];
  if (/expir|certif|ssl|domain/.test(q)) {
    const certs = db.certificates.filter((c) => c.validTo && daysLeft(c.validTo) <= 30).sort((a, b) => a.validTo!.localeCompare(b.validTo!));
    const doms = db.domains.filter((d) => !d.expiresAt || daysLeft(d.expiresAt) <= 60);
    return {
      contextTitle: null,
      sent: [...sentBase, { label: 'Certificates and domains', value: `${db.certificates.length} certificates, ${db.domains.length} domains with expiry dates` }],
      summary: certs.length ? `${certs.length} certificate(s) expire within 30 days; the soonest is ${certs[0].host} in ${daysLeft(certs[0].validTo!)} days.` : 'No certificates expire in the next 30 days.',
      sections: [
        { title: 'Certificates', bullets: certs.map((c) => `${c.host}: ${daysLeft(c.validTo!)} days left (${c.issuer})`) },
        { title: 'Domains', bullets: doms.map((d) => (d.expiresAt ? `${d.domain}: ${daysLeft(d.expiresAt)} days left` : `${d.domain}: expiry date not published, track it at the registrar`)) },
      ],
      suggestedTasks: [],
    };
  }
  if (/incident/.test(q)) {
    return {
      contextTitle: null,
      sent: sentBase,
      summary: `${activeIncidents().length} incident(s) are open.`,
      sections: [{ title: 'Open incidents', bullets: activeIncidents().map((i) => `${i.ref} ${i.title}: ${i.status}, ${i.severity}`) }],
      suggestedTasks: [],
    };
  }
  const down = db.applications.filter((a) => a.status === 'active' && prodHealth(a).state === 'down');
  return {
    contextTitle: null,
    sent: [...sentBase, { label: 'Top findings', value: top.slice(0, 5).map((f) => `${f.priority} ${f.title}`).join('; ') }],
    summary: `Start with ${down.length ? `the outage on ${down.map((a) => a.name).join(', ')}, then ` : ''}the ${top.filter((f) => f.priority === 'P1').length} P1 findings. ${overdueTasks().length} remediation task(s) are already past their SLA.`,
    sections: [
      ...(down.length ? [{ title: 'Right now', bullets: down.map((a) => `${a.name} production is down. See its open incident and alerts.`) }] : []),
      { title: 'Highest risk first', bullets: top.slice(0, 5).map((f) => `${f.priority}: ${f.title} on ${appName(f.applicationId)}${f.knownExploited ? ' (known exploited)' : ''}`) },
      { title: 'Overdue work', bullets: overdueTasks().slice(0, 5).map((t) => `${t.title} (due ${t.dueAt?.slice(0, 10)})`) },
    ],
    suggestedTasks: [],
  };
}

/* ───────────── recommendations ───────────── */

function ruleRecommendations(): Recommendation[] {
  const recs: Recommendation[] = [];
  const closes = (fs: Finding[]) => Object.fromEntries(PRI.map((p) => [p, fs.filter((f) => f.priority === p).length])) as Record<Priority, number>;
  const make = (rid: string, title: string, why: string, effort: Recommendation['effort'], fs: Finding[], steps: string[]): Recommendation => ({
    id: rid, title, why, source: 'rule', effort, findingIds: fs.map((f) => f.id), applicationIds: [...new Set(fs.map((f) => f.applicationId))], closes: closes(fs), steps,
    dismissed: rid in db.dismissedRecs, dismissedReason: db.dismissedRecs[rid] ?? null,
  });
  const vulns = active().filter((f) => f.code?.kind === 'vuln');
  const byPkg = new Map<string, Finding[]>();
  vulns.forEach((f) => {
    const v = f.code as VulnDetail;
    const key = v.targetType === 'image' ? `image:${v.targetName}` : `${v.ecosystem}:${v.package}`;
    byPkg.set(key, [...(byPkg.get(key) ?? []), f]);
  });
  byPkg.forEach((fs, key) => {
    const v = fs[0].code as VulnDetail;
    if (key.startsWith('image:')) {
      recs.push(make(`rec-${key}`, `Rebuild ${v.targetName} on a patched base image`, `${fs.length} vulnerable OS package(s) in this image, including ${fs.map((f) => (f.code as VulnDetail).vulnId).join(', ')}.`, 'small', fs, ['Update the FROM line to the latest patch of the same base.', 'Rebuild, push and redeploy.', 'Rescan the image in ShieldOps.']));
      return;
    }
    const fixed = fs.map((f) => (f.code as VulnDetail).fixedIn ?? '').sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
    const repos = [...new Set(fs.map((f) => (f.code as VulnDetail).targetName))];
    recs.push(make(`rec-${key}`, `Upgrade ${v.package} to ${fixed}`, `Closes ${fs.length} finding(s) in ${repos.join(', ')}.`, repos.length > 2 ? 'medium' : 'small', fs, [`npm install ${v.package}@^${fixed} in each repository (or upgrade the package that depends on it).`, 'Run the tests and deploy.', 'The scan on push confirms the fix.']));
  });
  const secrets = active().filter((f) => f.source === 'secrets');
  if (secrets.length) recs.push(make('rec-secrets', `Rotate ${secrets.length} exposed secret(s)`, 'Every committed secret should be treated as already copied, whether or not it is still in the code.', 'medium', secrets, ['Deactivate or regenerate each one with its provider.', 'Move them into a secrets manager or environment variables.', 'Add a pre-commit Gitleaks hook to every repository.']));
  const headers = active().filter((f) => f.source === 'headers');
  if (headers.length) recs.push(make('rec-headers', 'Add the missing security headers', `${headers.length} header finding(s) across ${new Set(headers.map((f) => f.assetId)).size} site(s). One shared nginx snippet fixes most of them.`, 'small', headers, ['add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;', 'add_header X-Frame-Options "DENY" always;', "add_header Content-Security-Policy \"default-src 'self'\" always; (start in report-only mode)", 'Reload nginx; the daily header check verifies it.']));
  const tls = active().filter((f) => f.source === 'ssl' && !f.title.includes('expires'));
  if (tls.length) recs.push(make('rec-tls', 'Allow only TLS 1.2 and 1.3', `${tls.length} finding(s) about old protocols or weak ciphers.`, 'small', tls, ['ssl_protocols TLSv1.2 TLSv1.3;', 'Use the Mozilla "intermediate" cipher list.', 'Reload and recheck SSL in ShieldOps.']));
  const expiring = active().filter((f) => f.source === 'ssl' && f.title.includes('expires'));
  if (expiring.length) recs.push(make('rec-renew', 'Fix certificate auto-renewal', `${expiring.length} certificate(s) close to expiry suggests renewal is not automated.`, 'small', expiring, ['Check the certbot timer or your host’s auto-renew setting.', 'Renew now with certbot renew, then reload the web server.']));
  return recs;
}

const weight = (r: Recommendation) => r.closes.P1 * 8 + r.closes.P2 * 4 + r.closes.P3 * 2 + r.closes.P4 + (r.source === 'ai' ? 6 : 0);

/* ───────────── compliance ───────────── */

const FRAMEWORKS: Omit<Framework, 'enabled'>[] = [
  { id: 'iso27001', name: 'ISO/IEC 27001', version: '2022, Annex A', description: 'International standard for information security management. Shows the Annex A controls ShieldOps has evidence for.' },
  { id: 'soc2', name: 'SOC 2', version: 'Trust Services Criteria (Security)', description: 'US audit framework. Shows the common criteria for monitoring, incidents and access.' },
  { id: 'certin', name: 'CERT-In Directions', version: '28 April 2022', description: 'Indian Computer Emergency Response Team directions on incident reporting, logs and time sync.' },
  { id: 'dpdp', name: 'DPDP Act', version: '2023', description: 'India’s Digital Personal Data Protection Act: security safeguards and breach notification.' },
];

type Eval = Pick<ControlResult, 'status' | 'evidence' | 'gaps' | 'links'>;
interface ControlDef {
  id: string;
  code: string;
  title: string;
  check: () => Eval;
}

const manual = (evidence: string[]): Eval => ({ status: 'manual', evidence, gaps: [], links: [] });
const ev = (status: ControlStatus, evidence: string[], gaps: string[], links: Eval['links'] = []): Eval => ({ status, evidence, gaps, links });

function controlsFor(fw: FrameworkId): ControlDef[] {
  const s = db.settings;
  const users = db.users.filter((u) => u.status === 'active');
  const vulns = active().filter((f) => f.source === 'vulnerabilities');
  const overdueVulnTasks = overdueTasks().filter((t) => db.findings.find((f) => f.id === t.linkedId)?.source === 'vulnerabilities');
  const kev = vulns.filter((f) => f.knownExploited);
  const secretsLive = active().filter((f) => f.code?.kind === 'secret' && f.code.inCurrentCode);
  const secretsAll = active().filter((f) => f.source === 'secrets');
  const prodApps = db.applications.filter((a) => a.status === 'active');
  const unmonitored = prodApps.filter((a) => !db.monitors.some((m) => m.applicationId === a.id));
  const offline = db.servers.filter((sv) => sv.offlineSince);
  const recentScans = db.repositories.filter((r) => db.scans.some((sc) => sc.targetId === r.id && sc.status === 'completed' && Date.now() - Date.parse(sc.queuedAt) < 7 * DAY));
  const acked = db.alerts.filter((a) => a.acknowledgedAt);
  const mtta = acked.length ? Math.round(acked.reduce((n, a) => n + (Date.parse(a.acknowledgedAt!) - Date.parse(a.firstAt)), 0) / acked.length / MIN) : null;
  const incidentsNoOwner = activeIncidents().filter((i) => !i.ownerId);
  const closedCritical = db.incidents.filter((i) => i.status === 'closed' && i.severity === 'critical');
  const weakTls = active().filter((f) => f.source === 'ssl');
  const headerGaps = active().filter((f) => f.source === 'headers' || f.source === 'dns');
  const MFA = users.every((u) => u.mfaEnabled);
  const p1 = active().filter((f) => f.priority === 'P1');

  const vulnMgmt = (): Eval =>
    ev(kev.length || overdueVulnTasks.length ? 'partial' : 'met',
      [`${db.repositories.length} repositories and ${db.images.length} images scanned with OSV and Trivy; ${recentScans.length} repositories completed a scan in the last 7 days.`, `${vulns.length} open vulnerability findings, each with an SLA due date.`],
      [...(kev.length ? [`${kev.length} known-exploited CVE(s) still open.`] : []), ...(overdueVulnTasks.length ? [`${overdueVulnTasks.length} vulnerability task(s) past their SLA.`] : [])],
      [{ label: 'Vulnerabilities', to: '/vulnerabilities' }]);
  const monitoring = (): Eval =>
    ev(unmonitored.length || offline.length ? 'partial' : 'met',
      [`${db.monitors.length} uptime monitors, ${db.servers.length} servers with the agent, ${db.detections.length} security detections in the last 24 hours.`],
      [...unmonitored.map((a) => `${a.name} has no uptime monitor.`), ...offline.map((sv) => `${sv.hostname} has stopped reporting.`)],
      [{ label: 'Servers', to: '/servers' }]);
  const incidentResponse = (): Eval =>
    ev(incidentsNoOwner.length ? 'partial' : 'met',
      [`${db.incidents.length} incidents recorded with owners, timelines and linked evidence.`, mtta !== null ? `Mean time to acknowledge alerts: ${mtta} minutes.` : 'No acknowledged alerts yet.'],
      incidentsNoOwner.map((i) => `${i.ref} has no owner.`),
      [{ label: 'Incidents', to: '/incidents' }]);
  const logging = (needDays: number): Eval => {
    const short = [
      s.retention.auditLogsDays < needDays && `Audit logs kept ${s.retention.auditLogsDays} days`,
      s.retention.securityEventsDays < needDays && `Security events kept ${s.retention.securityEventsDays} days`,
    ].filter(Boolean) as string[];
    return ev(short.length === 0 ? 'met' : short.length === 2 ? 'not_met' : 'partial',
      [`Audit logs: ${s.retention.auditLogsDays} days, append-only. Security events: ${s.retention.securityEventsDays} days.`],
      short.map((x) => `${x}; needs ${needDays}.`),
      [{ label: 'Retention settings', to: '/settings' }]);
  };

  if (fw === 'iso27001')
    return [
      { id: '5.7', code: 'A.5.7', title: 'Threat intelligence', check: () => ev(recentScans.length ? 'met' : 'partial', ['Vulnerability data from OSV and Trivy, with the CISA known-exploited list used in risk scoring.'], recentScans.length ? [] : ['No repository scanned in the last 7 days.']) },
      { id: '5.17', code: 'A.5.17', title: 'Authentication information', check: () => ev(secretsLive.length ? 'not_met' : secretsAll.length ? 'partial' : 'met', ['Gitleaks scans every repository for committed credentials.'], [...secretsLive.map((f) => `${f.title} is still in the current code.`), ...(secretsAll.length > secretsLive.length ? [`${secretsAll.length - secretsLive.length} secret(s) only in history, not yet rotated.`] : [])], [{ label: 'Secrets', to: '/secrets' }]) },
      { id: '5.24', code: 'A.5.24 / 5.26', title: 'Incident management and response', check: incidentResponse },
      { id: '5.27', code: 'A.5.27', title: 'Learning from incidents', check: () => ev(closedCritical.every((i) => i.postIncident) ? 'met' : 'partial', [`${closedCritical.length} closed critical incident(s); ShieldOps requires a post-incident summary before closing them.`], closedCritical.filter((i) => !i.postIncident).map((i) => `${i.ref} has no summary.`)) },
      { id: '8.5', code: 'A.8.5', title: 'Secure authentication', check: () => ev(MFA ? 'met' : 'partial', [`Two-factor sign-in is required for all ${users.length} ShieldOps members.`, 'Credential stuffing and brute-force detection on applications that send security events.'], MFA ? [] : ['Some members have not set up two-factor sign-in.']) },
      { id: '8.8', code: 'A.8.8', title: 'Management of technical vulnerabilities', check: vulnMgmt },
      { id: '8.9', code: 'A.8.9', title: 'Configuration management', check: () => ev(headerGaps.length ? 'partial' : 'met', ['Daily checks of security headers and DNS records with change history.'], headerGaps.length ? [`${headerGaps.length} open header or DNS finding(s).`] : [], [{ label: 'Security headers', to: '/security-headers' }]) },
      {
        id: '8.15',
        code: 'A.8.15',
        title: 'Logging',
        // ISO 27001 leaves the retention period to your own policy, so only flag a short audit trail.
        check: () =>
          ev(
            s.retention.auditLogsDays >= 365 ? 'met' : 'partial',
            [`Audit logs: ${s.retention.auditLogsDays} days, append-only and tamper-proof. Security events: ${s.retention.securityEventsDays} days.`, 'ISO 27001 does not set a period; your retention policy should state one.'],
            s.retention.auditLogsDays >= 365 ? [] : [`Audit logs are kept ${s.retention.auditLogsDays} days; auditors usually expect at least a year.`],
            [{ label: 'Retention settings', to: '/settings' }],
          ),
      },
      { id: '8.16', code: 'A.8.16', title: 'Monitoring activities', check: monitoring },
      { id: '8.24', code: 'A.8.24', title: 'Use of cryptography', check: () => ev(weakTls.length ? 'partial' : 'met', ['Certificates, protocols and ciphers checked daily on every site.'], weakTls.map((f) => f.title + '.'), [{ label: 'SSL and DNS', to: '/ssl-dns' }]) },
      { id: '8.32', code: 'A.8.32', title: 'Change management', check: () => manual(['ShieldOps records releases and scans on push, but approval of changes happens in your own process.']) },
      { id: '5.30', code: 'A.5.30', title: 'ICT readiness for business continuity', check: () => manual(['Backups, failover and recovery tests are outside what ShieldOps can see.']) },
    ];
  if (fw === 'soc2')
    return [
      { id: 'cc6.1', code: 'CC6.1', title: 'Logical access security', check: () => ev(MFA && !secretsLive.length ? 'met' : 'partial', ['Two-factor sign-in for all ShieldOps members; re-authentication for critical actions.'], [...(MFA ? [] : ['Some members have no two-factor sign-in.']), ...(secretsLive.length ? [`${secretsLive.length} credential(s) exposed in code.`] : [])]) },
      { id: 'cc7.1', code: 'CC7.1', title: 'Detect vulnerabilities and configuration changes', check: vulnMgmt },
      { id: 'cc7.2', code: 'CC7.2', title: 'Monitor system components for anomalies', check: monitoring },
      { id: 'cc7.3', code: 'CC7.3', title: 'Evaluate security events', check: () => ev(mtta !== null && mtta <= 60 ? 'met' : 'partial', [`${db.alerts.length} alerts with acknowledgement tracking.`, mtta !== null ? `Mean time to acknowledge: ${mtta} minutes.` : ''], mtta !== null && mtta > 60 ? ['Alerts take more than an hour on average to acknowledge.'] : []) },
      { id: 'cc7.4', code: 'CC7.4', title: 'Respond to security incidents', check: incidentResponse },
      { id: 'cc7.5', code: 'CC7.5', title: 'Recover from incidents', check: () => manual(['Restore tests and recovery plans are outside what ShieldOps can see.']) },
      { id: 'cc8.1', code: 'CC8.1', title: 'Change management', check: () => manual(['Change approval and testing happen in your own process.']) },
    ];
  if (fw === 'certin')
    return [
      { id: 'report6h', code: 'Direction (ii)', title: 'Report cyber incidents to CERT-In within 6 hours of noticing them', check: () => ev('partial', [`Incidents are timestamped when opened and acknowledged${mtta !== null ? `; mean time to acknowledge alerts is ${mtta} minutes` : ''}.`], ['Reporting to CERT-In itself is manual. Add the 6-hour deadline to your incident checklist.'], [{ label: 'Incidents', to: '/incidents' }]) },
      { id: 'logs180', code: 'Direction (iv)', title: 'Keep logs of ICT systems for 180 days, within India', check: () => {
        const r = logging(180);
        return { ...r, gaps: [...r.gaps, 'Confirm the ShieldOps database and backups are hosted in India.'] };
      } },
      { id: 'ntp', code: 'Direction (i)', title: 'Synchronise system clocks with NTP servers of NIC or NPL', check: () => manual(['ShieldOps cannot see server NTP settings.']) },
      { id: 'poc', code: 'Direction (iii)', title: 'Name a point of contact for CERT-In', check: () => manual(['Record who the point of contact is and when CERT-In was told.']) },
    ];
  return [
    { id: 'safeguards', code: 'Section 8(5)', title: 'Reasonable security safeguards to prevent personal data breaches', check: () => ev(p1.length ? 'partial' : 'met', ['Monitoring, scanning, incident handling and remediation tracking are in place.'], p1.length ? [`${p1.length} P1 finding(s) open, including ${p1.slice(0, 2).map((f) => f.title).join(' and ')}.`] : [], [{ label: 'Findings', to: '/findings' }]) },
    { id: 'breach', code: 'Section 8(6)', title: 'Tell the Data Protection Board and each affected person about a personal data breach', check: () => ev('partial', ['Incidents record what happened, when, and the impact.'], ['Notifying the Board and affected people is manual. Add it to the incident checklist for any incident involving personal data.']) },
    { id: 'erasure', code: 'Section 8(7)', title: 'Erase personal data when its purpose is served', check: () => manual(['Data retention in your applications is outside what ShieldOps can see.']) },
  ];
}

function complianceFor(fw: FrameworkId): ComplianceReport {
  const meta = FRAMEWORKS.find((f) => f.id === fw)!;
  const controls: ControlResult[] = controlsFor(fw).map((c) => ({ id: c.id, code: c.code, title: c.title, ...c.check(), attestation: db.attestations[`${fw}:${c.id}`] ?? null }));
  const points = controls.reduce((n, c) => n + (c.status === 'met' ? 1 : c.status === 'partial' ? 0.5 : c.status === 'manual' && c.attestation?.status === 'met' ? 1 : 0), 0);
  return { framework: { ...meta, enabled: db.frameworksEnabled[fw] }, controls, score: Math.round((points / controls.length) * 100), checkedAt: nowIso() };
}

/* ───────────── reports ───────────── */

const inScope = (appId: string | null) => (x: { applicationId: string }) => !appId || x.applicationId === appId;
const fmtDate = (iso: string) => iso.slice(0, 10);

function buildSections(type: ReportType, from: string, to: string, appId: string | null): ReportSection[] {
  const f = active().filter(inScope(appId));
  const incidents = db.incidents.filter((i) => (!appId || i.applicationIds.includes(appId)) && i.openedAt >= from && i.openedAt <= to);
  const tasks = db.tasks.filter(inScope(appId));
  const overdue = overdueTasks().filter(inScope(appId));
  const apps = db.applications.filter((a) => a.status === 'active' && (!appId || a.id === appId));
  const health = apps.map((a) => ({ a, h: prodHealth(a) }));
  const tone = (bad: boolean) => (bad ? 'bad' : 'good') as 'bad' | 'good';

  const posture: ReportSection[] = [
    {
      title: 'At a glance',
      summary: 'Current state when the report was generated.',
      metrics: [
        { label: 'Applications down', value: String(health.filter((x) => x.h.state === 'down').length), tone: tone(health.some((x) => x.h.state === 'down')) },
        { label: 'Open P1 findings', value: String(f.filter((x) => x.priority === 'P1').length), tone: tone(f.some((x) => x.priority === 'P1')) },
        { label: 'Open findings', value: String(f.length) },
        { label: 'Incidents in period', value: String(incidents.length) },
        { label: 'Tasks past SLA', value: String(overdue.length), tone: tone(overdue.length > 0) },
      ],
    },
    { title: 'Highest risks', table: { columns: ['Priority', 'Finding', 'Application', 'Due'], rows: [...f].sort((a, b) => b.riskScore - a.riskScore).slice(0, 10).map((x) => [x.priority, x.title, appName(x.applicationId), x.dueAt ? fmtDate(x.dueAt) : '-']) } },
    { title: 'Recommended next steps', bullets: [...ruleRecommendations(), ...db.aiRecommendations].filter((r) => !r.dismissed).sort((a, b) => weight(b) - weight(a)).slice(0, 5).map((r) => `${r.title}: ${r.why}`) },
  ];
  const byType: Record<ReportType, () => ReportSection[]> = {
    posture: () => posture,
    health: () => [
      { title: 'Production health', table: { columns: ['Application', 'Now', 'Uptime 30d', 'Monitors', 'Errors to fix'], rows: health.map(({ a, h }) => [a.name, h.state, h.uptime30d === null ? '-' : `${h.uptime30d}%`, String(db.monitors.filter((m) => m.applicationId === a.id).length), String(db.errorGroups.filter((g) => g.applicationId === a.id && (g.status === 'unresolved' || g.status === 'regressed')).length)]) } },
      { title: 'Downtime in the period', bullets: db.monitors.filter(inScope(appId)).flatMap((m) => m.events.filter((e) => e.to === 'down' && e.at >= from && e.at <= to).map((e) => `${fmtDate(e.at)} ${m.name}: ${e.reason}`)).slice(0, 15) },
      { title: 'Servers', table: { columns: ['Server', 'Application', 'Status'], rows: db.servers.filter(inScope(appId)).map((sv) => [sv.hostname, appName(sv.applicationId), sv.offlineSince ? 'not reporting' : 'online']) } },
    ],
    vulnerabilities: () => {
      const v = f.filter((x) => x.code?.kind === 'vuln');
      const sec = f.filter((x) => x.code?.kind === 'secret');
      return [
        { title: 'Summary', metrics: [{ label: 'Open vulnerabilities', value: String(v.length) }, { label: 'Known exploited', value: String(v.filter((x) => x.knownExploited).length), tone: tone(v.some((x) => x.knownExploited)) }, { label: 'Exposed secrets', value: String(sec.length), tone: tone(sec.length > 0) }] },
        { title: 'Vulnerabilities', table: { columns: ['Priority', 'CVE', 'Package', 'Fixed in', 'Where'], rows: v.sort((a, b) => b.riskScore - a.riskScore).map((x) => { const d = x.code as VulnDetail; return [x.priority, d.vulnId, `${d.package} ${d.installed}`, d.fixedIn ?? '-', d.targetName]; }) } },
        { title: 'Exposed secrets (values masked)', table: { columns: ['Priority', 'Type', 'Value', 'Where'], rows: sec.map((x) => (x.code?.kind === 'secret' ? [x.priority, x.code.rule, x.code.masked, `${x.code.file}:${x.code.line}`] : [])) } },
      ];
    },
    ssl_domains: () => [
      { title: 'Certificates', table: { columns: ['Host', 'Expires', 'Days left', 'Issuer', 'Protocol'], rows: db.certificates.filter(inScope(appId)).map((c) => [c.host, c.validTo ? fmtDate(c.validTo) : '-', c.validTo ? String(daysLeft(c.validTo)) : '-', c.issuer ?? '-', c.protocol ?? '-']) } },
      { title: 'Domains', table: { columns: ['Domain', 'Expires', 'Registrar'], rows: db.domains.filter(inScope(appId)).map((d) => [d.domain, d.expiresAt ? fmtDate(d.expiresAt) : 'not published', d.registrar ?? '-']) } },
    ],
    incidents: () => [
      { title: 'Summary', metrics: [{ label: 'Incidents', value: String(incidents.length) }, { label: 'Critical', value: String(incidents.filter((i) => i.severity === 'critical').length) }, { label: 'Open tasks', value: String(tasks.filter((t) => ['todo', 'in_progress', 'ready_for_verification'].includes(t.status)).length) }, { label: 'Tasks past SLA', value: String(overdue.length), tone: tone(overdue.length > 0) }] },
      { title: 'Incidents', table: { columns: ['Ref', 'Title', 'Severity', 'Status', 'Opened'], rows: incidents.map((i) => [i.ref, i.title, i.severity, i.status, fmtDate(i.openedAt)]) } },
      { title: 'Tasks past their SLA', table: { columns: ['Task', 'Due', 'Owner'], rows: overdue.map((t) => [t.title, t.dueAt ? fmtDate(t.dueAt) : '-', db.users.find((u) => u.id === t.ownerId)?.name ?? 'nobody']) } },
    ],
    compliance: () =>
      (Object.keys(db.frameworksEnabled) as FrameworkId[])
        .filter((fw) => db.frameworksEnabled[fw])
        .map((fw) => {
          const c = complianceFor(fw);
          return {
            title: `${c.framework.name} (${c.framework.version}): ${c.score}% ready`,
            summary: 'Readiness signals from ShieldOps data, not a certification or audit opinion.',
            table: { columns: ['Control', 'Status', 'Gaps'], rows: c.controls.map((x) => [`${x.code} ${x.title}`, x.attestation ? `${x.attestation.status} (attested)` : x.status, x.gaps.join(' ') || '-']) },
          };
        }),
  };
  return byType[type]().filter((s) => !s.table || s.table.rows.length || s.bullets?.length);
}

function settleReports() {
  db.reports.forEach((r) => {
    if (r.status !== 'generating' || (r.simReadyAt && Date.parse(r.simReadyAt) > Date.now())) return;
    r.sections = buildSections(r.type, r.from, r.to, r.applicationId);
    r.status = 'ready';
    r.sizeKb = Math.max(40, Math.round(JSON.stringify(r.sections).length / 300) * 3);
    r.generatedAt = nowIso();
    r.simReadyAt = null;
  });
}

function reportDetail(r: StoredReport): ReportDetail {
  if (!r.sections && r.status === 'ready') r.sections = buildSections(r.type, r.from, r.to, r.applicationId);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { simReadyAt: _s, sections, ...rest } = r;
  return clone({ ...rest, sections: sections ?? [] });
}

/* ───────────── API ───────────── */

export const phase7Api: Phase7Api = {
  async aiAsk({ question, context }) {
    await delay(1400);
    currentUser();
    const ai = requireAi();
    let draft: Draft;
    if (context?.type === 'finding') {
      const f = db.findings.find((x) => x.id === context.id);
      if (!f) throw new ApiError(404, 'NOT_FOUND', 'Finding not found.');
      draft = explainFinding(f);
    } else if (context?.type === 'incident') draft = explainIncident(context.id);
    else if (context?.type === 'error_group') draft = explainError(context.id);
    else draft = answerQuestion(question);
    if (context && question.trim() && !/^(explain|summari[sz]e)/i.test(question.trim())) {
      draft.sections.unshift({ title: 'Your question', bullets: [`"${question.trim()}" — the points below answer it from this item's evidence. Ask a follow-up if something is unclear.`] });
    }
    audit('ai.ask', 'ai', context?.id ?? null, `Asked the AI analyst${draft.contextTitle ? ` about ${draft.contextTitle}` : ''} (${draft.sent.length} masked fields sent)`);
    save();
    return { ...draft, id: id('ai'), question, context: context ?? null, model: `${ai.provider === 'openai' ? 'OpenAI' : ai.provider === 'anthropic' ? 'Anthropic' : 'Azure OpenAI'} ${ai.model}`, generatedAt: nowIso() };
  },

  async listRecommendations(filter = {}) {
    await delay();
    currentUser();
    const all = [...db.aiRecommendations.map((r) => ({ ...r, dismissed: r.id in db.dismissedRecs, dismissedReason: db.dismissedRecs[r.id] ?? null })), ...ruleRecommendations()];
    return clone(
      all
        .filter((r) => filter.includeDismissed || !r.dismissed)
        .filter((r) => !filter.applicationId || r.applicationIds.includes(filter.applicationId))
        .sort((a, b) => Number(a.dismissed) - Number(b.dismissed) || weight(b) - weight(a)),
    );
  },

  async dismissRecommendation(recId, reason) {
    await delay();
    currentUser();
    if (reason.trim().length < 5) throw new ApiError(422, 'REASON_REQUIRED', 'Say why, so others know it was considered.');
    db.dismissedRecs[recId] = reason.trim();
    audit('recommendation.dismiss', 'recommendation', recId, `Dismissed a recommendation: ${reason.trim()}`);
    save();
    const r = (await phase7Api.listRecommendations({ includeDismissed: true })).find((x) => x.id === recId);
    if (!r) throw new ApiError(404, 'NOT_FOUND', 'Recommendation not found.');
    return r;
  },

  async restoreRecommendation(recId) {
    await delay();
    currentUser();
    delete db.dismissedRecs[recId];
    save();
    const r = (await phase7Api.listRecommendations({ includeDismissed: true })).find((x) => x.id === recId);
    if (!r) throw new ApiError(404, 'NOT_FOUND', 'Recommendation not found.');
    return r;
  },

  async listReports() {
    await delay();
    currentUser();
    settleReports();
    save();
    return db.reports
      .map((r) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { sections: _s, simReadyAt: _r, ...rest } = r;
        return clone(rest);
      })
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  },

  async generateReport(input) {
    await delay();
    const user = currentUser();
    if (Date.parse(input.from) >= Date.parse(input.to)) throw new ApiError(422, 'INVALID_RANGE', 'The start date must be before the end date.');
    const app = input.applicationId ? db.applications.find((a) => a.id === input.applicationId) : null;
    const r: StoredReport = {
      id: id('rp'),
      type: input.type,
      title: `${REPORT_TYPE_LABEL[input.type].name}${app ? `: ${app.name}` : ''}`,
      from: input.from,
      to: input.to,
      applicationId: input.applicationId,
      status: 'generating',
      generatedAt: nowIso(),
      generatedBy: user.id,
      sizeKb: null,
      sections: null,
      simReadyAt: new Date(Date.now() + 2500).toISOString(),
    };
    db.reports.push(r);
    audit('report.generate', 'report', r.id, `Generated report: ${r.title}`);
    save();
    return reportDetail(r);
  },

  async getReport(reportId) {
    await delay(200);
    currentUser();
    settleReports();
    const r = db.reports.find((x) => x.id === reportId);
    if (!r) throw new ApiError(404, 'NOT_FOUND', 'Report not found.');
    save();
    return reportDetail(r);
  },

  async downloadReportPdf(reportId) {
    await delay(500);
    currentUser();
    settleReports();
    const r = db.reports.find((x) => x.id === reportId);
    if (!r) throw new ApiError(404, 'NOT_FOUND', 'Report not found.');
    if (r.status !== 'ready') throw new ApiError(409, 'NOT_READY', 'The report is still being generated.');
    const d = reportDetail(r);
    audit('report.download', 'report', r.id, `Downloaded PDF: ${r.title}`);
    save();
    return reportToPdf(d, { generatedBy: db.users.find((u) => u.id === r.generatedBy)?.name ?? 'ShieldOps', scope: r.applicationId ? appName(r.applicationId) : 'All applications' });
  },

  async listReportSchedules() {
    await delay();
    currentUser();
    return clone(db.reportSchedules);
  },

  async createReportSchedule(input) {
    await delay();
    const user = currentUser();
    const bad = input.recipients.find((e) => !/^\S+@\S+\.\S+$/.test(e));
    if (!input.recipients.length || bad) throw new ApiError(422, 'INVALID_RECIPIENTS', bad ? `${bad} is not a valid email address.` : 'Add at least one recipient.');
    const next = new Date();
    if (input.frequency === 'weekly') next.setDate(next.getDate() + ((8 - next.getDay()) % 7 || 7));
    else next.setMonth(next.getMonth() + 1, 1);
    next.setHours(9, 0, 0, 0);
    const sch = { ...clone(input), id: id('sch'), nextRunAt: next.toISOString(), createdBy: user.id };
    db.reportSchedules.push(sch);
    audit('report.schedule', 'report', sch.id, `Scheduled ${input.frequency} ${REPORT_TYPE_LABEL[input.type].name} to ${input.recipients.join(', ')}`);
    save();
    return clone(sch);
  },

  async deleteReportSchedule(scheduleId) {
    await delay();
    currentUser();
    db.reportSchedules = db.reportSchedules.filter((s) => s.id !== scheduleId);
    audit('report.unschedule', 'report', scheduleId, 'Cancelled a report schedule');
    save();
  },

  async listFrameworks() {
    await delay();
    currentUser();
    return FRAMEWORKS.map((f) => ({ ...f, enabled: db.frameworksEnabled[f.id] }));
  },

  async setFrameworkEnabled(fw, enabled) {
    await delay();
    currentUser();
    db.frameworksEnabled[fw] = enabled;
    audit('compliance.framework', 'compliance', fw, `${enabled ? 'Started' : 'Stopped'} tracking ${FRAMEWORKS.find((f) => f.id === fw)?.name}`);
    save();
    return { ...FRAMEWORKS.find((f) => f.id === fw)!, enabled };
  },

  async getCompliance(fw) {
    await delay(300);
    currentUser();
    return complianceFor(fw);
  },

  async attestControl(fw, controlId, input) {
    await delay();
    const user = currentUser();
    const key = `${fw}:${controlId}`;
    if (input === null) delete db.attestations[key];
    else {
      if (input.note.trim().length < 10) throw new ApiError(422, 'NOTE_REQUIRED', 'Describe the evidence (at least 10 characters), for example where the document lives.');
      db.attestations[key] = { status: input.status, note: input.note.trim(), by: user.id, at: nowIso() };
    }
    audit('compliance.attest', 'compliance', key, input ? `Recorded evidence for ${fw.toUpperCase()} ${controlId}: ${input.status.replace('_', ' ')}` : `Removed evidence for ${fw.toUpperCase()} ${controlId}`);
    save();
    return complianceFor(fw);
  },
};