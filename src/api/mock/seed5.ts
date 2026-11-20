import type { Alert, AlertRule, Application, Asset, AvailableRepo, ContainerImage, Finding, Integration, Repository, ScanJob, ScannerRun, SecretDetail, VulnDetail } from '@/types';
import { priorityFor, riskScore, SLA_DAYS } from '@/lib/risk';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (t: number) => new Date(t).toISOString();

export type RepoRecord = Omit<Repository, 'openSecrets' | 'vulns' | 'lastScan'>;
export type ImageRecord = Omit<ContainerImage, 'vulns' | 'lastScan'>;
/** A scan the mock finishes on its own once `simDoneAt` passes. */
export interface ScanRecord extends ScanJob {
  simDoneAt: string | null;
}

export interface Phase5Data {
  integrations: Integration[];
  repositories: RepoRecord[];
  availableRepos: AvailableRepo[];
  images: ImageRecord[];
  scans: ScanRecord[];
}

export const SCANNER_VERSION = { gitleaks: '8.21.2', osv: '1.9.1', trivy: '0.57.1' } as const;

export const PHASE5_RULES: AlertRule[] = [
  { id: 'r29', name: 'Secret found in code', signal: 'secret_found', threshold: null, durationMin: null, severity: 'high', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r30', name: 'New critical or high vulnerability', signal: 'vuln_found', threshold: null, durationMin: null, severity: 'medium', scope: { applicationId: null, environmentType: null }, channels: ['in_app'], enabled: true, builtIn: true },
  { id: 'r31', name: 'Known-exploited vulnerability', signal: 'vuln_exploited', threshold: null, durationMin: null, severity: 'critical', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r32', name: 'Scans keep failing', signal: 'scan_failed', threshold: 3, durationMin: null, severity: 'medium', scope: { applicationId: null, environmentType: null }, channels: ['in_app'], enabled: true, builtIn: true },
];

const later = (type: Integration['type'], phase: number): Integration => ({ type, status: 'not_connected', availableInPhase: phase, account: null, scopes: [], connectedAt: null, connectedBy: null, lastSyncAt: null, error: null });

export function emptyPhase5(): Phase5Data {
  return {
    integrations: [
      { ...later('github', 0), availableInPhase: null },
      { ...later('ghcr', 0), availableInPhase: null },
      { ...later('dockerhub', 0), availableInPhase: null },
      { ...later('slack', 0), availableInPhase: null },
      { ...later('webhook', 0), availableInPhase: null },
      { ...later('jira', 0), availableInPhase: null },
      { ...later('cloudflare', 0), availableInPhase: null },
      { ...later('aws', 0), availableInPhase: null },
      { ...later('google', 0), availableInPhase: null },
      { ...later('entra', 0), availableInPhase: null },
    ],
    repositories: [],
    availableRepos: [],
    images: [],
    scans: [],
  };
}

export const ORG_REPOS: AvailableRepo[] = [
  { fullName: 'example-org/payments-api', private: true, defaultBranch: 'main', language: 'TypeScript' },
  { fullName: 'example-org/portal-api', private: true, defaultBranch: 'main', language: 'TypeScript' },
  { fullName: 'example-org/portal-web', private: true, defaultBranch: 'main', language: 'TypeScript' },
  { fullName: 'example-org/field-api', private: true, defaultBranch: 'develop', language: 'JavaScript' },
  { fullName: 'example-org/payroll', private: true, defaultBranch: 'main', language: 'TypeScript' },
  { fullName: 'example-org/marketing-site', private: false, defaultBranch: 'main', language: 'Astro' },
  { fullName: 'example-org/field-mobile', private: true, defaultBranch: 'main', language: 'TypeScript' },
  { fullName: 'example-org/infra-terraform', private: true, defaultBranch: 'main', language: 'HCL' },
  { fullName: 'example-org/docs', private: false, defaultBranch: 'main', language: 'MDX' },
];

export function seedPhase5(applications: Application[], baseAssets: Asset[]): Phase5Data & { assets: Asset[]; findings: Finding[]; alerts: Alert[] } {
  const t = Date.now();
  const approved = (by: string, ago: number): Asset['authorization'] => ({ status: 'approved', method: 'approval', justification: 'Connected through the GitHub App for example-org.', approvedBy: by, at: iso(t - ago) });
  const asset = (id: string, type: Asset['type'], identifier: string, label: string, applicationId: string, environmentId: string, exposure: Asset['exposure'], ago: number): Asset => ({
    id, type, identifier, label, applicationId, environmentId, exposure, shared: false, status: 'active', createdAt: iso(t - ago), authorization: approved('u1', ago),
  });
  const assets: Asset[] = [
    asset('s16', 'repository', 'example-org/portal-api', 'portal-api repo', 'a1', 'a1-e1', 'internal', 40 * DAY),
    asset('s17', 'repository', 'example-org/portal-web', 'portal-web repo', 'a1', 'a1-e1', 'internal', 40 * DAY),
    asset('s18', 'repository', 'example-org/field-api', 'field-api repo', 'a4', 'a4-e1', 'internal', 30 * DAY),
    asset('s19', 'repository', 'example-org/payroll', 'payroll repo', 'a3', 'a3-e1', 'internal', 60 * DAY),
    asset('s20', 'repository', 'example-org/marketing-site', 'marketing-site repo', 'a5', 'a5-e1', 'internet', 25 * DAY),
    asset('s21', 'image', 'ghcr.io/example-org/payments-api:2.14.1', 'payments-api image', 'a2', 'a2-e1', 'internal', 2 * DAY),
    asset('s22', 'image', 'ghcr.io/example-org/portal-api:3.8.1', 'portal-api image', 'a1', 'a1-e1', 'internal', 6 * DAY),
    asset('s23', 'image', 'ghcr.io/example-org/field-api:1.10.0-rc1', 'field-api dev image', 'a4', 'a4-e2', 'internal', 3 * DAY),
  ];
  const allAssets = [...baseAssets, ...assets];

  const repo = (id: string, assetId: string, fullName: string, applicationId: string, environmentId: string, dependencies: number, addedAgo: number): RepoRecord => {
    const r = ORG_REPOS.find((x) => x.fullName === fullName)!;
    return { id, assetId, fullName, applicationId, environmentId, private: r.private, defaultBranch: r.defaultBranch, language: r.language, scanOnPush: true, dailyScan: true, dependencies, addedAt: iso(t - addedAgo) };
  };
  const repositories: RepoRecord[] = [
    repo('rp1', 's8', 'example-org/payments-api', 'a2', 'a2-e1', 412, 64 * DAY),
    repo('rp2', 's16', 'example-org/portal-api', 'a1', 'a1-e1', 388, 40 * DAY),
    repo('rp3', 's17', 'example-org/portal-web', 'a1', 'a1-e1', 1204, 40 * DAY),
    repo('rp4', 's18', 'example-org/field-api', 'a4', 'a4-e1', 296, 30 * DAY),
    repo('rp5', 's19', 'example-org/payroll', 'a3', 'a3-e1', 341, 60 * DAY),
    repo('rp6', 's20', 'example-org/marketing-site', 'a5', 'a5-e1', 520, 25 * DAY),
  ];

  const images: ImageRecord[] = [
    { id: 'im1', assetId: 's21', applicationId: 'a2', environmentId: 'a2-e1', registry: 'ghcr.io', repository: 'example-org/payments-api', tag: '2.14.1', digest: 'sha256:7c1f0e9a42d8b3', os: 'Alpine 3.18.4', sizeMb: 186, dailyScan: true, addedAt: iso(t - 2 * DAY) },
    { id: 'im2', assetId: 's22', applicationId: 'a1', environmentId: 'a1-e1', registry: 'ghcr.io', repository: 'example-org/portal-api', tag: '3.8.1', digest: 'sha256:b05e61d2f9a7c0', os: 'Debian 12.1', sizeMb: 342, dailyScan: true, addedAt: iso(t - 6 * DAY) },
    { id: 'im3', assetId: 's23', applicationId: 'a4', environmentId: 'a4-e2', registry: 'ghcr.io', repository: 'example-org/field-api', tag: '1.10.0-rc1', digest: 'sha256:e9d2a7713c40f5', os: 'Alpine 3.20.3', sizeMb: 171, dailyScan: false, addedAt: iso(t - 3 * DAY) },
  ];

  let n = 0;
  const ok = (scanner: ScannerRun['scanner'], ms: number): ScannerRun => ({ scanner, version: SCANNER_VERSION[scanner], status: 'completed', durationMs: ms, error: null });
  const bad = (scanner: ScannerRun['scanner'], error: string, ms: number | null = null): ScannerRun => ({ scanner, version: SCANNER_VERSION[scanner], status: 'failed', durationMs: ms, error });
  const repoRuns = (g = 8_400, o = 2_100, tr = 14_700) => [ok('gitleaks', g), ok('osv', o), ok('trivy', tr)];
  const scan = (targetType: ScanJob['targetType'], targetId: string, trigger: ScanJob['trigger'], ago: number, runs: ScannerRun[], newFindings = 0, fixedFindings = 0, revision: string | null = null): ScanRecord => {
    const failed = runs.filter((r) => r.status === 'failed').length;
    const status = failed === 0 ? 'completed' : failed === runs.length ? 'failed' : 'partial';
    const total = runs.reduce((a, r) => a + (r.durationMs ?? 0), 0);
    return { id: `sc${++n}`, targetType, targetId, trigger, status, revision, runs, queuedAt: iso(t - ago), finishedAt: iso(t - ago + total + 4000), newFindings, fixedFindings, simDoneAt: null };
  };
  const cloneFail = 'Could not clone: GitHub returned 404. The GitHub App may have lost access to this repository.';
  const scans: ScanRecord[] = [
    scan('repository', 'rp1', 'push', 35 * MIN, repoRuns(), 1, 0, '9f2c1ab'),
    scan('repository', 'rp1', 'schedule', 1 * DAY, repoRuns(8_100, 2_000, 14_100), 0, 0, '2d81e07'),
    scan('repository', 'rp1', 'push', 3 * DAY, repoRuns(), 2, 1, '61b0c4f'),
    scan('repository', 'rp2', 'schedule', 6 * HOUR, repoRuns(7_900, 1_900, 13_200), 0, 0, 'a03f7d2'),
    scan('repository', 'rp2', 'push', 6 * DAY, repoRuns(), 0, 1, '1e9b53a'),
    scan('repository', 'rp2', 'push', 9 * DAY, repoRuns(), 1, 0, '4b7e0d3'),
    scan('repository', 'rp3', 'schedule', 6 * HOUR, repoRuns(21_000, 4_300, 31_800), 0, 0, '8c2ea19'),
    scan('repository', 'rp4', 'schedule', 5 * HOUR, [bad('gitleaks', 'Timed out after 600 s. The full history is 2.1 GB; scan with a shallow clone or raise the limit.', 600_000), ok('osv', 1_800), ok('trivy', 12_900)], 0, 0, 'f41a6c8'),
    scan('repository', 'rp4', 'push', 4 * DAY, repoRuns(), 3, 0, 'c81d22e'),
    scan('repository', 'rp5', 'schedule', 2 * HOUR, [bad('gitleaks', cloneFail), bad('osv', cloneFail), bad('trivy', cloneFail)]),
    scan('repository', 'rp5', 'schedule', 1 * DAY + 2 * HOUR, [bad('gitleaks', cloneFail), bad('osv', cloneFail), bad('trivy', cloneFail)]),
    scan('repository', 'rp5', 'schedule', 2 * DAY + 2 * HOUR, [bad('gitleaks', cloneFail), bad('osv', cloneFail), bad('trivy', cloneFail)]),
    scan('repository', 'rp5', 'schedule', 3 * DAY + 2 * HOUR, repoRuns(), 0, 0, '17aa9f0'),
    scan('repository', 'rp6', 'push', 4 * HOUR, repoRuns(3_200, 1_500, 9_800), 0, 1, 'aa71c0e'),
    scan('image', 'im1', 'schedule', 1 * HOUR, [ok('trivy', 22_400)], 1, 0, 'sha256:7c1f0e9a42d8b3'),
    scan('image', 'im2', 'schedule', 1 * DAY, [ok('trivy', 31_900)], 0, 0, 'sha256:b05e61d2f9a7c0'),
    scan('image', 'im3', 'manual', 3 * DAY, [ok('trivy', 19_200)], 0, 0, 'sha256:e9d2a7713c40f5'),
  ];

  /* ── findings ── */
  const appOf = (assetId: string) => {
    const a = allAssets.find((x) => x.id === assetId)!;
    return { a, app: applications.find((x) => x.id === a.applicationId)! };
  };
  const mk = (
    f: Pick<Finding, 'id' | 'title' | 'description' | 'assetId' | 'severity' | 'status' | 'evidence' | 'code'> & Partial<Finding> & { daysAgo: number },
  ): Finding => {
    const { a, app } = appOf(f.assetId);
    const exploited = f.code?.kind === 'vuln' && !!f.knownExploited;
    const score = riskScore({ severity: f.severity, criticality: app.criticality, exposure: a.exposure, confidence: f.confidence ?? 'confirmed', knownExploited: exploited });
    const priority = priorityFor(score);
    const first = t - f.daysAgo * DAY;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { daysAgo: _d, ...rest } = f;
    return {
      category: 'security', source: f.code?.kind === 'secret' ? 'secrets' : 'vulnerabilities', applicationId: a.applicationId, environmentId: a.environmentId,
      confidence: 'confirmed', knownExploited: exploited, riskScore: score, priority, assigneeId: null, dueAt: iso(first + SLA_DAYS[priority] * DAY),
      firstSeen: iso(first), lastSeen: iso(t - 35 * MIN), acceptedRisk: null, history: [{ at: iso(first), actorName: 'ShieldOps', text: 'Found by a repository scan' }],
      ...rest,
    };
  };

  const secret = (id: string, assetId: string, d: Omit<SecretDetail, 'kind'>, severity: Finding['severity'], status: Finding['status'], daysAgo: number, description: string, extra: Partial<Finding> = {}) =>
    mk({
      id, assetId, severity, status, daysAgo, description,
      title: `${d.rule} in ${d.file}`,
      evidence: [
        { label: 'Secret type', value: d.rule },
        { label: 'Value', value: d.masked },
        { label: 'Location', value: `${d.file}:${d.line}` },
        { label: 'Commit', value: `${d.commit} by ${d.author}` },
        { label: 'Still in current code', value: d.inCurrentCode ? 'Yes' : 'No, only in Git history' },
      ],
      code: { kind: 'secret', ...d },
      ...extra,
    });

  const findings: Finding[] = [
    secret('f20', 's8', { rule: 'AWS access key', masked: 'AKIA…Q7ZK', file: 'config/staging.env', line: 4, commit: '9f2c1ab', author: 'k***@example.com', committedAt: iso(t - 35 * MIN), inCurrentCode: true }, 'critical', 'open', 0.03,
      'An AWS access key was committed 35 minutes ago. Deactivate it in AWS IAM first, then remove it from the code and Git history, then load it from your secrets manager.'),
    secret('f21', 's16', { rule: 'Razorpay API secret', masked: 'rzp_live_…8fQ2', file: 'src/config/payments.ts', line: 12, commit: '4b7e0d3', author: 'a***@example.com', committedAt: iso(t - 9 * DAY), inCurrentCode: false }, 'high', 'in_progress', 9,
      'Removed from the current code six days ago, but it is still in Git history, so anyone with repository access can read it. Regenerate the key in the Razorpay dashboard; removing it from history alone is not enough.',
      { assigneeId: 'u2', history: [{ at: iso(t - 6 * DAY), actorName: 'Ananya Rao', text: 'Changed status to in progress' }, { at: iso(t - 9 * DAY), actorName: 'ShieldOps', text: 'Found by a repository scan' }] }),
    secret('f22', 's18', { rule: 'Database password', masked: 'Fi…!9', file: 'docker-compose.yml', line: 23, commit: 'c81d22e', author: 'f***@example.com', committedAt: iso(t - 4 * DAY), inCurrentCode: true }, 'high', 'open', 4,
      'POSTGRES_PASSWORD is set directly in docker-compose.yml. Change the password, then read it from an .env file that is not committed.'),
    secret('f23', 's19', { rule: 'Slack webhook URL', masked: 'https://hooks.slack.com/services/T0…/B0…/…x2Lq', file: 'scripts/notify.sh', line: 7, commit: '17aa9f0', author: 'm***@example.com', committedAt: iso(t - 20 * DAY), inCurrentCode: true }, 'medium', 'open', 20,
      'Anyone with this URL can post messages to your Slack channel. Regenerate the webhook in Slack and keep the URL in an environment variable.'),
    secret('f24', 's20', { rule: 'RSA private key', masked: '-----BEGIN RSA PRIVATE KEY----- …', file: 'deploy/id_rsa', line: 1, commit: 'e3d4f19', author: 'p***@example.com', committedAt: iso(t - 12 * DAY), inCurrentCode: false }, 'critical', 'verified', 12,
      'A deploy key was committed to a public repository. It was revoked on the server, a new key was issued, and the file was removed; the latest scan confirmed it is gone.',
      { history: [{ at: iso(t - 4 * HOUR), actorName: 'ShieldOps', text: 'Verified fixed by a repository scan' }, { at: iso(t - 11 * DAY), actorName: 'Demo User', text: 'Changed status to resolved' }, { at: iso(t - 12 * DAY), actorName: 'ShieldOps', text: 'Found by a repository scan' }] }),
    secret('f25', 's17', { rule: 'Generic API key', masked: 'test_…abcd', file: 'tests/fixtures/payment.json', line: 3, commit: '0c9d1e2', author: 'r***@example.com', committedAt: iso(t - 30 * DAY), inCurrentCode: true }, 'low', 'false_positive', 30,
      'A placeholder value in a test fixture.',
      { history: [{ at: iso(t - 29 * DAY), actorName: 'Ananya Rao', text: 'Note: fake key used only by unit tests' }, { at: iso(t - 29 * DAY), actorName: 'Ananya Rao', text: 'Changed status to false positive' }] }),
  ];

  interface V { vulnId: string; ghsa: string; pkg: string; eco: VulnDetail['ecosystem']; fixedIn: string; cvss: number; severity: Finding['severity']; summary: string; exploited?: boolean }
  const V: Record<string, V> = {
    ptr: { vulnId: 'CVE-2024-45296', ghsa: 'GHSA-9wv6-86v2-598j', pkg: 'path-to-regexp', eco: 'npm', fixedIn: '0.1.10', cvss: 7.5, severity: 'high', summary: 'Routes with two parameters in one segment compile to a regular expression that can backtrack for a long time, so one crafted URL can tie up the server (ReDoS).' },
    exRedirect: { vulnId: 'CVE-2024-29041', ghsa: 'GHSA-rv95-896h-c2vc', pkg: 'express', eco: 'npm', fixedIn: '4.19.2', cvss: 6.1, severity: 'medium', summary: 'Malformed URLs passed to res.location() or res.redirect() can send users to another site (open redirect).' },
    exXss: { vulnId: 'CVE-2024-43796', ghsa: 'GHSA-qw6h-vgh9-j6wx', pkg: 'express', eco: 'npm', fixedIn: '4.20.0', cvss: 5.0, severity: 'medium', summary: 'res.redirect() can place untrusted input into the HTML it returns, allowing cross-site scripting.' },
    axiosSsrf: { vulnId: 'CVE-2024-39338', ghsa: 'GHSA-8hc4-vh64-cxmj', pkg: 'axios', eco: 'npm', fixedIn: '1.7.4', cvss: 7.5, severity: 'high', summary: 'A path-relative URL can be handled as protocol-relative, so a server-side request goes to an unexpected host (SSRF).' },
    axiosXsrf: { vulnId: 'CVE-2023-45857', ghsa: 'GHSA-wf5p-g6vw-rhxx', pkg: 'axios', eco: 'npm', fixedIn: '1.6.0', cvss: 6.5, severity: 'medium', summary: 'The XSRF-TOKEN cookie value is sent in a header to every host, leaking the token to third parties.' },
    ws: { vulnId: 'CVE-2024-37890', ghsa: 'GHSA-3h5v-q93c-6h6q', pkg: 'ws', eco: 'npm', fixedIn: '8.17.1', cvss: 7.5, severity: 'high', summary: 'A request with more headers than the server allows crashes a ws server (denial of service).' },
    semver: { vulnId: 'CVE-2022-25883', ghsa: 'GHSA-c2qf-rxjj-qqgw', pkg: 'semver', eco: 'npm', fixedIn: '7.5.2', cvss: 5.3, severity: 'medium', summary: 'Parsing an untrusted version range can take very long (ReDoS).' },
    cookie: { vulnId: 'CVE-2023-26136', ghsa: 'GHSA-72xf-g2v4-qvf3', pkg: 'tough-cookie', eco: 'npm', fixedIn: '4.1.3', cvss: 6.5, severity: 'medium', summary: 'Prototype pollution when CookieJar is used with rejectPublicSuffixes set to false.' },
    braces: { vulnId: 'CVE-2024-4068', ghsa: 'GHSA-grv7-fg5c-xmjg', pkg: 'braces', eco: 'npm', fixedIn: '3.0.3', cvss: 7.5, severity: 'high', summary: 'Input with unbalanced braces can exhaust memory and crash the process.' },
    micromatch: { vulnId: 'CVE-2024-4067', ghsa: 'GHSA-952p-6rrq-rcjv', pkg: 'micromatch', eco: 'npm', fixedIn: '4.0.8', cvss: 5.3, severity: 'medium', summary: 'micromatch.braces() can be made to run for a very long time with crafted input (ReDoS).' },
    spawn: { vulnId: 'CVE-2024-21538', ghsa: 'GHSA-3xgq-45jj-v275', pkg: 'cross-spawn', eco: 'npm', fixedIn: '7.0.5', cvss: 7.5, severity: 'high', summary: 'Crafted strings make argument escaping take very long (ReDoS).' },
    rapid: { vulnId: 'CVE-2023-44487', ghsa: 'GHSA-qppj-fm5r-hxr3', pkg: 'nghttp2-libs', eco: 'alpine', fixedIn: '1.57.0-r0', cvss: 7.5, severity: 'high', exploited: true, summary: 'HTTP/2 Rapid Reset: clients open and cancel streams very quickly to overload the server. Exploited in the wild and on the CISA known-exploited list.' },
    glibc: { vulnId: 'CVE-2023-4911', ghsa: 'GHSA-m77w-6vjw-wh2f', pkg: 'libc6', eco: 'debian', fixedIn: '2.36-9+deb12u3', cvss: 7.8, severity: 'high', exploited: true, summary: '"Looney Tunables": a buffer overflow in how glibc reads GLIBC_TUNABLES lets a local user become root. On the CISA known-exploited list.' },
  };
  let vn = 30;
  const vuln = (key: keyof typeof V, assetId: string, installed: string, sources: VulnDetail['sources'], status: Finding['status'], daysAgo: number, extra: Partial<Finding> = {}) => {
    const v = V[key];
    const { a } = appOf(assetId);
    const targetType: VulnDetail['targetType'] = a.type === 'image' ? 'image' : 'repository';
    const targetName = a.type === 'image' ? a.identifier.replace(/^ghcr\.io\//, '') : a.identifier;
    return mk({
      id: `f${vn++}`, assetId, severity: v.severity, status, daysAgo, knownExploited: !!v.exploited,
      title: `${v.vulnId} in ${v.pkg} ${installed}`,
      description: `${v.summary} Upgrade ${v.pkg} to ${v.fixedIn} or later.`,
      evidence: [
        { label: 'Vulnerability', value: `${v.vulnId} (${v.ghsa})` },
        { label: 'Package', value: `${v.pkg} ${installed} (${v.eco})` },
        { label: 'Fixed in', value: v.fixedIn },
        { label: 'CVSS', value: String(v.cvss) },
        { label: 'Found in', value: targetName },
        { label: 'Reported by', value: sources.map((s) => (s === 'osv' ? 'OSV' : 'Trivy')).join(' and ') },
      ],
      code: { kind: 'vuln', vulnId: v.vulnId, aliases: [v.ghsa], package: v.pkg, ecosystem: v.eco, installed, fixedIn: v.fixedIn, cvss: v.cvss, sources, targetType, targetName },
      ...extra,
    });
  };
  const both: VulnDetail['sources'] = ['osv', 'trivy'];
  findings.push(
    vuln('ptr', 's8', '0.1.7', both, 'open', 21),
    vuln('exRedirect', 's8', '4.18.2', both, 'open', 21),
    vuln('exXss', 's8', '4.18.2', ['osv'], 'open', 21),
    vuln('axiosSsrf', 's8', '1.6.2', both, 'open', 21),
    vuln('ws', 's8', '8.16.0', ['osv'], 'acknowledged', 21, { assigneeId: 'u3' }),
    vuln('ptr', 's16', '0.1.7', both, 'open', 21),
    vuln('exRedirect', 's16', '4.18.2', both, 'open', 21),
    vuln('exXss', 's16', '4.18.2', ['osv'], 'open', 21),
    vuln('semver', 's16', '7.5.1', ['osv'], 'open', 30),
    vuln('cookie', 's16', '4.1.2', both, 'in_progress', 30, { assigneeId: 'u2' }),
    vuln('braces', 's17', '3.0.2', both, 'open', 25),
    vuln('micromatch', 's17', '4.0.5', ['osv'], 'accepted_risk', 25, {
      acceptedRisk: { justification: 'Build-time dependency only; never shipped to browsers or run on servers.', expiresAt: iso(t + 60 * DAY), by: 'u2', at: iso(t - 20 * DAY) },
    }),
    vuln('spawn', 's17', '7.0.3', both, 'open', 12),
    vuln('axiosXsrf', 's18', '1.5.1', both, 'open', 30),
    vuln('axiosSsrf', 's18', '1.5.1', both, 'open', 30),
    vuln('rapid', 's21', '1.55.1-r0', ['trivy'], 'open', 0.04),
    vuln('ptr', 's21', '0.1.7', ['trivy'], 'open', 2),
    vuln('glibc', 's22', '2.36-9+deb12u1', ['trivy'], 'open', 6),
  );

  const sent = (at: number): Alert['deliveries'] => [
    { channel: 'in_app', recipient: 'All members', status: 'sent', at: iso(at), attempts: 1 },
    { channel: 'email', recipient: 'it-alerts@example.com', status: 'sent', at: iso(at + 4000), attempts: 1 },
  ];
  const base = { occurrences: 1, acknowledgedBy: null, acknowledgedAt: null, snoozedUntil: null, resolvedAt: null, autoResolved: false } as const;
  const alerts: Alert[] = [
    { ...base, id: 'al17', title: 'AWS access key committed to example-org/payments-api', message: 'Found in config/staging.env in commit 9f2c1ab, 35 minutes ago. Deactivate the key in AWS IAM now.', severity: 'high', status: 'open', source: 'secrets', applicationId: 'a2', environmentId: 'a2-e1', assetId: 's8', ruleId: 'r29', firstAt: iso(t - 34 * MIN), lastAt: iso(t - 34 * MIN), deliveries: sent(t - 34 * MIN) },
    { ...base, id: 'al18', title: 'Known-exploited CVE-2023-44487 in the payments-api image', message: 'nghttp2-libs 1.55.1-r0 is affected by HTTP/2 Rapid Reset. Rebuild the image on a patched base (nghttp2 1.57.0-r0 or later).', severity: 'critical', status: 'open', source: 'vulnerabilities', applicationId: 'a2', environmentId: 'a2-e1', assetId: 's21', ruleId: 'r31', firstAt: iso(t - 58 * MIN), lastAt: iso(t - 58 * MIN), deliveries: sent(t - 58 * MIN) },
    { ...base, id: 'al19', title: 'Scans of example-org/payroll keep failing', message: 'The last 3 scans could not clone the repository. Check that the GitHub App still has access to it.', severity: 'medium', status: 'open', source: 'secrets', applicationId: 'a3', environmentId: 'a3-e1', assetId: 's19', ruleId: 'r32', firstAt: iso(t - 2 * HOUR), lastAt: iso(t - 2 * HOUR), occurrences: 3, deliveries: sent(t - 2 * HOUR).slice(0, 1) },
  ];

  const integrations = emptyPhase5().integrations.map((i): Integration => {
    if (i.type === 'github') return { ...i, status: 'connected', account: 'example-org', scopes: ['Contents: read', 'Metadata: read', 'Packages: read'], connectedAt: iso(t - 64 * DAY), connectedBy: 'u1', lastSyncAt: iso(t - 10 * MIN) };
    if (i.type === 'cloudflare') return { ...i, status: 'connected', account: 'example-org', scopes: ['Zone: Read', 'DNS: Read'], connectedAt: iso(t - 30 * DAY), connectedBy: 'u1', lastSyncAt: iso(t - 3 * HOUR) };
    if (i.type === 'aws') return { ...i, status: 'connected', account: '123456789012', scopes: ['SecurityAudit (read-only role)'], connectedAt: iso(t - 30 * DAY), connectedBy: 'u3', lastSyncAt: iso(t - 2 * HOUR) };
    if (i.type === 'google') return { ...i, status: 'connected', account: 'example.com', scopes: ['Admin SDK: users and reports, read-only'], connectedAt: iso(t - 30 * DAY), connectedBy: 'u1', lastSyncAt: iso(t - 2 * HOUR) };
    if (i.type === 'ghcr') return { ...i, status: 'connected', account: 'example-org', scopes: ['Packages: read (through the GitHub App)'], connectedAt: iso(t - 64 * DAY), connectedBy: 'u1', lastSyncAt: iso(t - 1 * HOUR) };
    return i;
  });

  return { integrations, repositories, availableRepos: ORG_REPOS, images, scans, assets, findings, alerts };
}