import { ApiError } from '../errors';
import type { ShieldOpsApi } from '../contract';
import type { Anomaly, Asset, CloudCheck, DiscoveredAsset, LogEntry, LogLevel, ProbeResult } from '@/types';
import { audit, clone, currentUser, db, delay, hex, id, nowIso, requireReauth, save } from './core';
import type { AnomalyRecord } from './seed8';

type Phase8Keys =
  | 'listReleases' | 'searchLogs'
  | 'listProbes' | 'createProbe' | 'removeProbe' | 'getProbeResults'
  | 'discoverAssets' | 'importAssets' | 'listCloudChecks'
  | 'createJiraIssue'
  | 'listEscalationPolicies' | 'saveEscalationPolicy' | 'deleteEscalationPolicy' | 'listAlertEscalations'
  | 'listAnomalies';

export type Phase8Api = Pick<ShieldOpsApi, Phase8Keys>;

const MIN = 60_000;
const HOUR = 60 * MIN;

function noise(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
const pick = <T,>(xs: T[], r: number) => xs[Math.floor(r * xs.length) % xs.length];
const integration = (type: string) => db.integrations.find((i) => i.type === type);

/* ───────────── logs ───────────── */

const RANGE_MS = { '15m': 15 * MIN, '1h': HOUR, '24h': 24 * HOUR, '7d': 7 * 24 * HOUR } as const;
const HOSTS: Record<string, string[]> = { a1: ['portal-app-01'], a2: ['payments-01'], a3: ['payroll-01'], a4: ['field-api-01'], a5: ['cloudflare-pages'] };
const ROUTES: Record<string, string[]> = { a1: ['/api/orders', '/api/invoices', '/api/profile'], a2: ['/api/charges', '/api/payments/:id', '/api/refunds'], a3: ['/api/payslips', '/api/employees'], a4: ['/api/jobs', '/api/checkins', '/api/photos'], a5: ['/'] };

/** Normal log lines, generated from the clock so nothing needs storing. */
function baseline(from: number, to: number): LogEntry[] {
  const out: LogEntry[] = [];
  const step = 2 * MIN;
  for (let b = Math.floor(from / step); b <= Math.floor(to / step); b++) {
    ['a1', 'a2', 'a3', 'a4'].forEach((app, ai) => {
      const r = noise(b, ai);
      const at = b * step + Math.floor(r * step);
      if (at < from || at > to) return;
      const route = pick(ROUTES[app], noise(b, ai + 9));
      const level: LogLevel = r > 0.98 ? 'error' : r > 0.93 ? 'warn' : r < 0.15 ? 'debug' : 'info';
      const ms = Math.round(40 + noise(b, ai + 3) * 400);
      const messages: Record<LogLevel, string> = {
        debug: `Cache hit for ${route}`,
        info: `GET ${route} 200 in ${ms} ms`,
        warn: `Slow query on ${route}: ${ms * 4} ms`,
        error: `Upstream call failed on ${route}: ECONNRESET`,
      };
      out.push({
        id: `lg-${b}-${ai}`, at: new Date(at).toISOString(), level, applicationId: app, environmentId: `${app}-e1`, source: level === 'debug' && ai === 3 ? 'agent' : 'sdk',
        host: HOSTS[app][0], message: messages[level], fields: { route, durationMs: String(ms), requestId: `req_${(Math.floor(r * 1e9)).toString(36)}`, userId: '[hashed]' },
      });
    });
  }
  return out;
}

/** The lines that tell this demo's stories: the full disk, the OOM worker, the login attack. */
function incidents(from: number, to: number): LogEntry[] {
  const now = Date.now();
  const out: LogEntry[] = [];
  const add = (agoMs: number, e: Omit<LogEntry, 'id' | 'at'>) => {
    const at = now - agoMs;
    if (at >= from && at <= to) out.push({ id: `li-${agoMs}-${e.applicationId}`, at: new Date(at).toISOString(), ...e });
  };
  for (let i = 0; i < 24; i++) {
    add(i * 62_000 + 30_000, { level: 'error', applicationId: 'a4', environmentId: 'a4-e1', source: 'sdk', host: 'field-api-01', message: 'ENOSPC: no space left on device, write', fields: { route: 'POST /api/photos', file: 'src/uploads/photos.ts:41', size: `${(2 + (i % 5)) * 1.3} MB`, authorization: '[redacted]' } });
  }
  add(40 * MIN, { level: 'warn', applicationId: 'a4', environmentId: 'a4-e1', source: 'agent', host: 'field-api-01', message: 'Disk / is 95% full (76.0 of 80 GB)', fields: { mount: '/', usedPercent: '95' } });
  add(3 * HOUR, { level: 'warn', applicationId: 'a4', environmentId: 'a4-e1', source: 'agent', host: 'field-api-01', message: 'Disk / is 85% full (68.0 of 80 GB)', fields: { mount: '/', usedPercent: '85' } });
  for (let i = 0; i < 4; i++) {
    add(7 * MIN - i * 90_000, { level: 'error', applicationId: 'a2', environmentId: 'a2-e1', source: 'agent', host: 'payments-01', message: 'Container payments-worker exited with code 137 (OOMKilled)', fields: { container: 'payments-worker', memoryLimit: '512 MB', restartCount: String(i + 1) } });
  }
  for (let i = 0; i < 8; i++) {
    add(40 * MIN + i * 20_000, { level: 'warn', applicationId: 'a1', environmentId: 'a1-e1', source: 'sdk', host: 'portal-app-01', message: 'Rate limit hit on POST /api/auth/login', fields: { ip: '203.0.113.77', limit: '20/min', account: '[masked]' } });
  }
  add(9 * MIN, { level: 'error', applicationId: 'a3', environmentId: 'a3-e1', source: 'agent', host: 'payroll-01', message: 'Agent shutting down: received SIGTERM', fields: { agentVersion: '1.2.0' } });
  return out;
}

/* ───────────── anomalies ───────────── */

function anomalyView(a: AnomalyRecord): Anomaly {
  const now = Date.now();
  const step = 10 * MIN;
  const start = Date.parse(a.startedAt);
  const end = a.endedAt ? Date.parse(a.endedAt) : now;
  const k = a.id.charCodeAt(2);
  // 48 points of 10 minutes: fine enough to show when an anomaly started and stopped.
  const series = Array.from({ length: 48 }, (_, i) => {
    const at = now - (47 - i) * step;
    const n = noise(k, Math.floor(at / step));
    const mid = (a.expectedLow + a.expectedHigh) / 2;
    const swing = (a.expectedHigh - a.expectedLow) / 2;
    const daily = 0.85 + 0.15 * Math.sin(((((at / HOUR + 5.5) % 24) - 6) * Math.PI) / 16);
    const low = Math.max(0, Math.round((mid - swing) * daily));
    const high = Math.round((mid + swing) * daily);
    const overlap = Math.min(at, end) - Math.max(at - step, start);
    const actual = overlap >= step / 2 || (overlap > 0 && at === now) ? a.actual : Math.round(low + (high - low) * (0.25 + n * 0.5));
    return { at: new Date(at).toISOString(), actual, low, high };
  });
  return clone({ ...a, series });
}

/* ───────────── asset discovery ───────────── */

const DISCOVERABLE: Omit<DiscoveredAsset, 'alreadyAdded'>[] = [
  { externalId: 'cf-zone-example', source: 'cloudflare', type: 'domain', identifier: 'example.com', label: 'example.com zone', exposure: 'internet', details: 'Zone, 14 DNS records, proxied' },
  { externalId: 'cf-portal', source: 'cloudflare', type: 'domain', identifier: 'portal.example.com', label: 'Portal domain', exposure: 'internet', details: 'A record, proxied' },
  { externalId: 'cf-pay', source: 'cloudflare', type: 'domain', identifier: 'pay.example.com', label: 'Payments domain', exposure: 'internet', details: 'Zone, 6 DNS records' },
  { externalId: 'cf-status', source: 'cloudflare', type: 'website', identifier: 'https://status.example.com', label: 'Status page', exposure: 'internet', details: 'CNAME to a status page provider' },
  { externalId: 'cf-mail', source: 'cloudflare', type: 'domain', identifier: 'mail.example.com', label: 'Mail host', exposure: 'internet', details: 'MX target, not proxied' },
  { externalId: 'cf-field', source: 'cloudflare', type: 'website', identifier: 'https://field.example.com', label: 'Field Ops site', exposure: 'internet', details: 'A record, proxied' },
  { externalId: 'aws-ec2-portal', source: 'aws', type: 'server', identifier: '203.0.113.21', label: 'portal-app-01 (EC2)', exposure: 'internet', details: 'i-0a3f… t3.large, ap-south-1a' },
  { externalId: 'aws-ec2-reporting', source: 'aws', type: 'server', identifier: '198.51.100.77', label: 'reporting-01 (EC2)', exposure: 'internet', details: 'i-07c2… t3.medium, SSH open to the internet' },
  { externalId: 'aws-rds-payroll', source: 'aws', type: 'cloud', identifier: 'aws:rds:payroll-db', label: 'Payroll database (RDS)', exposure: 'internet', details: 'MySQL 8.0, publicly accessible' },
  { externalId: 'aws-s3-invoices', source: 'aws', type: 'cloud', identifier: 'aws:s3:example-invoices-archive', label: 'Invoices archive bucket', exposure: 'internet', details: 'Public read' },
  { externalId: 'aws-s3-static', source: 'aws', type: 'cloud', identifier: 'aws:s3:example-static-assets', label: 'Static assets bucket', exposure: 'internet', details: 'Private, served through CloudFront' },
  { externalId: 'aws-alb-portal', source: 'aws', type: 'cloud', identifier: 'aws:elb:portal-alb', label: 'Portal load balancer', exposure: 'internet', details: 'Application Load Balancer, 2 targets' },
];

const added = (identifier: string) => db.assets.some((a) => a.identifier.toLowerCase() === identifier.toLowerCase());

/* ───────────── API ───────────── */

export const phase8Api: Phase8Api = {
  async listReleases(filter = {}) {
    await delay();
    currentUser();
    return clone(db.releases.filter((r) => !filter.applicationId || r.applicationId === filter.applicationId).sort((a, b) => b.deployedAt.localeCompare(a.deployedAt)));
  },

  async searchLogs({ applicationId, environmentId, search, levels, range, page, pageSize }) {
    await delay(300);
    currentUser();
    const to = Date.now();
    const from = to - RANGE_MS[range];
    // Logs are kept 14 days; older ranges are cut there.
    const q = search?.trim().toLowerCase();
    const all = [...baseline(from, to), ...incidents(from, to)]
      .filter((e) => (!applicationId || e.applicationId === applicationId) && (!environmentId || e.environmentId === environmentId))
      .filter((e) => !levels?.length || levels.includes(e.level))
      .filter((e) => !q || `${e.message} ${e.host} ${Object.entries(e.fields).map(([k, v]) => `${k}=${v}`).join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => b.at.localeCompare(a.at));
    const buckets = 30;
    const size = (to - from) / buckets;
    const histogram = Array.from({ length: buckets }, (_, i) => ({ at: new Date(from + (i + 1) * size).toISOString(), count: 0, errors: 0 }));
    all.forEach((e) => {
      const i = Math.min(buckets - 1, Math.floor((Date.parse(e.at) - from) / size));
      if (i >= 0) {
        histogram[i].count++;
        if (e.level === 'error') histogram[i].errors++;
      }
    });
    return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize, histogram };
  },

  async listProbes() {
    await delay();
    currentUser();
    return clone(db.probes.map((p) => (p.status === 'online' ? { ...p, lastSeenAt: new Date(Date.now() - (p.kind === 'built_in' ? 0 : 20_000)).toISOString() } : p)));
  },

  async createProbe({ name, region }) {
    await delay();
    requireReauth();
    currentUser();
    if (!name.trim()) throw new ApiError(422, 'NAME_REQUIRED', 'Name the probe after where it runs, like Mumbai or Frankfurt.');
    const secret = `so_probe_${hex(32)}`;
    const probe = { id: id('p'), name: name.trim(), region: region.trim() || 'Not given', kind: 'remote' as const, status: 'offline' as const, lastSeenAt: null, prefix: secret.slice(0, 13), createdAt: nowIso() };
    db.probes.push(probe);
    audit('probe.create', 'probe', probe.id, `Added probe location ${probe.name} (${probe.prefix}…)`);
    save();
    return { probe: clone(probe), secret };
  },

  async removeProbe(probeId) {
    await delay();
    requireReauth();
    const p = db.probes.find((x) => x.id === probeId);
    if (!p) throw new ApiError(404, 'NOT_FOUND', 'Probe not found.');
    if (p.kind === 'built_in') throw new ApiError(409, 'BUILT_IN', 'The built-in probe runs on the ShieldOps server and cannot be removed.');
    db.probes = db.probes.filter((x) => x.id !== probeId);
    audit('probe.remove', 'probe', probeId, `Removed probe location ${p.name}`);
    save();
  },

  async getProbeResults(monitorId) {
    await delay(150);
    currentUser();
    const m = db.monitors.find((x) => x.id === monitorId);
    if (!m) throw new ApiError(404, 'NOT_FOUND', 'Monitor not found.');
    const last = m.results.at(-1);
    return db.probes.map((p): ProbeResult => {
      if (p.status !== 'online') return { probeId: p.id, probeName: p.name, status: 'unknown', latencyMs: null, at: p.lastSeenAt ?? nowIso(), error: 'Probe is offline' };
      if (p.kind === 'built_in' || !last) return { probeId: p.id, probeName: p.name, status: last?.status ?? 'unknown', latencyMs: last?.latencyMs ?? null, at: last?.at ?? nowIso(), error: last?.error ?? null };
      // The remote probe sees the same outages, with its own network latency on top.
      const far = last.latencyMs === null ? null : Math.round(last.latencyMs * 1.35 + 48);
      return { probeId: p.id, probeName: p.name, status: last.status, latencyMs: far, at: new Date(Date.parse(last.at) + 4000).toISOString(), error: last.error ?? null };
    });
  },

  async discoverAssets(source) {
    await delay(900);
    currentUser();
    if (integration(source)?.status !== 'connected') throw new ApiError(409, 'NOT_CONNECTED', `Connect ${source === 'aws' ? 'AWS' : 'Cloudflare'} in Integrations first.`);
    return DISCOVERABLE.filter((d) => d.source === source).map((d) => ({ ...d, alreadyAdded: added(d.identifier) }));
  },

  async importAssets({ source, externalIds, applicationId, environmentId }) {
    await delay();
    const user = currentUser();
    const app = db.applications.find((a) => a.id === applicationId);
    if (!app?.environments.some((e) => e.id === environmentId)) throw new ApiError(422, 'INVALID_SCOPE', 'Choose an application and environment.');
    const picks = DISCOVERABLE.filter((d) => d.source === source && externalIds.includes(d.externalId) && !added(d.identifier));
    if (!picks.length) throw new ApiError(422, 'NOTHING_SELECTED', 'Choose at least one resource that is not already an asset.');
    picks.forEach((d) => {
      const asset: Asset = {
        id: id('s'), type: d.type, identifier: d.identifier, label: d.label, applicationId, environmentId, exposure: d.exposure, shared: false, status: 'active', createdAt: nowIso(),
        authorization: { status: 'approved', method: 'approval', justification: `Imported from ${source === 'aws' ? `AWS account ${integration('aws')?.account}` : `Cloudflare account ${integration('cloudflare')?.account}`}; we own it.`, approvedBy: user.id, at: nowIso() },
      };
      db.assets.push(asset);
    });
    audit('asset.import', 'asset', null, `Imported ${picks.length} asset(s) from ${source === 'aws' ? 'AWS' : 'Cloudflare'} into ${app.name}`);
    save();
    return { imported: picks.length };
  },

  async listCloudChecks() {
    await delay();
    currentUser();
    const open = (ids: string[]) => ids.filter((f) => db.findings.some((x) => x.id === f && !['resolved', 'verified', 'accepted_risk', 'false_positive'].includes(x.status)));
    const check = (cid: string, provider: CloudCheck['provider'], title: string, total: number, findingIds: string[]): CloudCheck => {
      const failing = open(findingIds);
      return { id: cid, provider, title, passed: total - failing.length, failed: failing.length, findingIds: failing };
    };
    const rows: CloudCheck[] = [];
    if (integration('aws')?.status === 'connected')
      rows.push(
        check('aws-root-mfa', 'aws', 'Root account has MFA', 1, ['f62']),
        check('aws-s3-public', 'aws', 'S3 buckets block public access', 12, ['f60']),
        check('aws-sg-ssh', 'aws', 'No security group opens SSH or RDP to the internet', 34, ['f64']),
        check('aws-rds-public', 'aws', 'Databases are not publicly accessible', 5, ['f61']),
        check('aws-key-age', 'aws', 'Access keys are younger than 90 days', 9, ['f63']),
        check('aws-cloudtrail', 'aws', 'CloudTrail logs every region', 1, []),
      );
    if (integration('google')?.status === 'connected')
      rows.push(
        check('gws-admin-2sv', 'google', 'Admins use 2-step verification', 4, ['f65']),
        check('gws-forwarding', 'google', 'No mail forwarding to outside addresses', 86, ['f66']),
        check('gws-inactive', 'google', 'Accounts unused for 90 days are suspended', 86, ['f67']),
      );
    if (integration('cloudflare')?.status === 'connected')
      rows.push(check('cf-https', 'cloudflare', 'Always Use HTTPS is on for every zone', 3, []), check('cf-dnssec', 'cloudflare', 'DNSSEC is on for every zone', 3, []));
    return rows;
  },

  async createJiraIssue({ type, id: targetId }) {
    await delay(700);
    const user = currentUser();
    const jira = integration('jira');
    if (jira?.status !== 'connected') throw new ApiError(409, 'NOT_CONNECTED', 'Connect Jira in Integrations first.');
    const project = jira.account?.split('project ')[1] ?? 'SEC';
    const site = jira.account?.split(',')[0] ?? 'example.atlassian.net';
    const key = `${project}-${db.jiraCounter++}`;
    const ref = { system: 'jira' as const, key, url: `https://${site}/browse/${key}`, status: 'To Do', syncedAt: nowIso() };
    if (type === 'incident') {
      const inc = db.incidents.find((x) => x.id === targetId);
      if (!inc) throw new ApiError(404, 'NOT_FOUND', 'Incident not found.');
      if (inc.externalRef) throw new ApiError(409, 'ALREADY_LINKED', `Already linked to ${inc.externalRef.key}.`);
      inc.externalRef = ref;
      inc.timeline.unshift({ at: nowIso(), actorName: user.name, kind: 'link', text: `Created Jira issue ${key}` });
    } else {
      const t = db.tasks.find((x) => x.id === targetId);
      if (!t) throw new ApiError(404, 'NOT_FOUND', 'Task not found.');
      if (t.externalRef) throw new ApiError(409, 'ALREADY_LINKED', `Already linked to ${t.externalRef.key}.`);
      t.externalRef = ref;
      t.notes.unshift({ at: nowIso(), actorName: user.name, text: `Created Jira issue ${key}` });
    }
    audit('jira.create', type, targetId, `Created Jira issue ${key}`);
    save();
    return ref;
  },

  async listEscalationPolicies() {
    await delay();
    currentUser();
    return clone(db.escalationPolicies);
  },

  async saveEscalationPolicy(input) {
    await delay();
    currentUser();
    if (!input.name.trim()) throw new ApiError(422, 'NAME_REQUIRED', 'Name the policy.');
    if (!input.severities.length) throw new ApiError(422, 'SEVERITY_REQUIRED', 'Choose at least one severity.');
    if (!input.steps.length || input.steps.some((s) => !s.targets.length || !s.channels.length)) throw new ApiError(422, 'INVALID_STEPS', 'Each step needs who to notify and at least one channel.');
    const steps = [...input.steps].sort((a, b) => a.afterMinutes - b.afterMinutes);
    if (steps[0].afterMinutes !== 0) throw new ApiError(422, 'INVALID_STEPS', 'The first step must notify straight away (after 0 minutes).');
    const clash = db.escalationPolicies.find((p) => p.id !== input.id && p.enabled && input.enabled && p.severities.some((s) => input.severities.includes(s)));
    if (clash) throw new ApiError(409, 'OVERLAP', `"${clash.name}" already covers one of these severities. Each severity can follow one policy.`);
    const policy = { ...clone(input), steps, name: input.name.trim(), id: input.id ?? id('ep') };
    db.escalationPolicies = [...db.escalationPolicies.filter((p) => p.id !== policy.id), policy];
    audit('escalation.save', 'alert_rule', policy.id, `Saved escalation policy ${policy.name}`);
    save();
    return clone(policy);
  },

  async deleteEscalationPolicy(policyId) {
    await delay();
    currentUser();
    db.escalationPolicies = db.escalationPolicies.filter((p) => p.id !== policyId);
    audit('escalation.delete', 'alert_rule', policyId, 'Deleted an escalation policy');
    save();
  },

  async listAlertEscalations() {
    await delay();
    currentUser();
    const now = Date.now();
    return db.alerts
      .filter((a) => a.status === 'open')
      .flatMap((a) => {
        const p = db.escalationPolicies.find((x) => x.enabled && x.severities.includes(a.severity));
        if (!p) return [];
        const mins = (now - Date.parse(a.firstAt)) / MIN;
        const reached = p.steps.filter((s) => s.afterMinutes <= mins).length;
        const step = Math.max(1, reached);
        const next = p.steps.at(step);
        return [{
          alertId: a.id, policyId: p.id, policyName: p.name, step, totalSteps: p.steps.length,
          lastNotifiedAt: new Date(Date.parse(a.firstAt) + p.steps.at(step - 1)!.afterMinutes * MIN).toISOString(),
          nextAt: next ? new Date(Date.parse(a.firstAt) + next.afterMinutes * MIN).toISOString() : null,
        }];
      });
  },

  async listAnomalies(filter = {}) {
    await delay();
    currentUser();
    return db.anomalies.filter((a) => !filter.applicationId || a.applicationId === filter.applicationId).map(anomalyView).sort((a, b) => Number(!!a.endedAt) - Number(!!b.endedAt) || b.startedAt.localeCompare(a.startedAt));
  },
};