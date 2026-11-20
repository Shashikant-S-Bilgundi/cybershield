import { ApiError } from '../errors';
import type { CodeFilter, ShieldOpsApi } from '../contract';
import type { Asset, ContainerImage, DependencyRow, Finding, Integration, Repository, ScanJob, ScannerRun, Severity, SeverityCounts, VulnDetail } from '@/types';
import { audit, clone, currentUser, db, delay, hex, id, nowIso, requireReauth, save } from './core';
import { ORG_REPOS, SCANNER_VERSION, type ImageRecord, type RepoRecord, type ScanRecord } from './seed5';

type Phase5Keys =
  | 'listIntegrations' | 'connectIntegration' | 'disconnectIntegration'
  | 'listRepositories' | 'getRepository' | 'listAvailableRepositories' | 'addRepositories' | 'updateRepository' | 'removeRepository'
  | 'listImages' | 'addImage' | 'removeImage'
  | 'listScans' | 'startScan' | 'listDependencies';

export type Phase5Api = Pick<ShieldOpsApi, Phase5Keys>;

const CLOSED: Finding['status'][] = ['resolved', 'verified', 'accepted_risk', 'false_positive'];
const SEV_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const inScope = (x: { applicationId: string; environmentId: string }, f: CodeFilter = {}) =>
  (!f.applicationId || x.applicationId === f.applicationId) && (!f.environmentId || x.environmentId === f.environmentId);
const integration = (type: Integration['type']) => db.integrations.find((i) => i.type === type)!;

/* ───────────── scans ───────────── */

/** Moves simulated scans forward: queued → running → finished. */
function settle(s: ScanRecord) {
  if (!s.simDoneAt || (s.status !== 'queued' && s.status !== 'running')) return;
  const now = Date.now();
  if (now < Date.parse(s.queuedAt) + 1200) return;
  if (now < Date.parse(s.simDoneAt)) {
    s.status = 'running';
    s.runs = s.runs.map((r, i) => ({ ...r, status: i === 0 ? 'running' : r.status }));
    return;
  }
  const repo = s.targetType === 'repository' ? db.repositories.find((r) => r.id === s.targetId) : null;
  const lostAccess = repo?.fullName === 'example-org/payroll';
  const largeHistory = repo?.fullName === 'example-org/field-api';
  s.runs = s.runs.map((r): ScannerRun => {
    if (lostAccess) return { ...r, status: 'failed', durationMs: null, error: 'Could not clone: GitHub returned 404. The GitHub App may have lost access to this repository.' };
    if (largeHistory && r.scanner === 'gitleaks') return { ...r, status: 'failed', durationMs: 600_000, error: 'Timed out after 600 s. The full history is 2.1 GB; scan with a shallow clone or raise the limit.' };
    return { ...r, status: 'completed', durationMs: Math.round((r.scanner === 'trivy' ? 12_000 : r.scanner === 'gitleaks' ? 7_000 : 2_000) * (0.8 + Math.random() * 0.4)) };
  });
  const failed = s.runs.filter((r) => r.status === 'failed').length;
  s.status = failed === 0 ? 'completed' : failed === s.runs.length ? 'failed' : 'partial';
  s.finishedAt = s.simDoneAt;
  s.simDoneAt = null;
  if (s.status !== 'failed') {
    const assetId = repo?.assetId ?? db.images.find((i) => i.id === s.targetId)?.assetId;
    db.findings.forEach((f) => {
      if (f.assetId === assetId && !CLOSED.includes(f.status)) f.lastSeen = s.finishedAt!;
    });
  }
}

const settleAll = () => db.scans.forEach(settle);
const scansFor = (targetType: ScanJob['targetType'], targetId: string) =>
  db.scans.filter((s) => s.targetType === targetType && s.targetId === targetId).sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));

function scanView(s: ScanRecord): ScanJob {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { simDoneAt: _s, ...rest } = s;
  return clone(rest);
}

function queueScan(targetType: ScanJob['targetType'], targetId: string, trigger: ScanJob['trigger']): ScanRecord {
  const scanners: ScannerRun['scanner'][] = targetType === 'repository' ? ['gitleaks', 'osv', 'trivy'] : ['trivy'];
  const s: ScanRecord = {
    id: id('sc'),
    targetType,
    targetId,
    trigger,
    status: 'queued',
    revision: targetType === 'repository' ? hex(7) : db.images.find((i) => i.id === targetId)?.digest ?? null,
    runs: scanners.map((scanner) => ({ scanner, version: SCANNER_VERSION[scanner], status: 'queued', durationMs: null, error: null })),
    queuedAt: nowIso(),
    finishedAt: null,
    newFindings: 0,
    fixedFindings: 0,
    simDoneAt: new Date(Date.now() + 5000).toISOString(),
  };
  db.scans.push(s);
  return s;
}

/* ───────────── views ───────────── */

function counts(assetId: string): { secrets: number; vulns: SeverityCounts } {
  const vulns: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let secrets = 0;
  db.findings.forEach((f) => {
    if (f.assetId !== assetId || CLOSED.includes(f.status)) return;
    if (f.source === 'secrets') secrets++;
    if (f.source === 'vulnerabilities') vulns[f.severity]++;
  });
  return { secrets, vulns };
}

function repoView(r: RepoRecord): Repository {
  const c = counts(r.assetId);
  const last = scansFor('repository', r.id)[0];
  return clone({ ...r, openSecrets: c.secrets, vulns: c.vulns, lastScan: last ? scanView(last) : null });
}

function imageView(i: ImageRecord): ContainerImage {
  const last = scansFor('image', i.id)[0];
  return clone({ ...i, vulns: counts(i.assetId).vulns, lastScan: last ? scanView(last) : null });
}

const findRepo = (repoId: string) => {
  const r = db.repositories.find((x) => x.id === repoId);
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Repository not found.');
  return r;
};

function closeFindingsFor(assetId: string, why: string, actor: string) {
  db.findings.forEach((f) => {
    if (f.assetId === assetId && !CLOSED.includes(f.status)) {
      f.status = 'resolved';
      f.history.unshift({ at: nowIso(), actorName: actor, text: why });
    }
  });
}

/* ───────────── exports used by the rest of the mock ───────────── */

export function cleanupPhase5(applicationId: string) {
  const repoIds = db.repositories.filter((r) => r.applicationId === applicationId).map((r) => r.id);
  const imageIds = db.images.filter((i) => i.applicationId === applicationId).map((i) => i.id);
  db.repositories = db.repositories.filter((r) => r.applicationId !== applicationId);
  db.images = db.images.filter((i) => i.applicationId !== applicationId);
  db.scans = db.scans.filter((s) => !repoIds.includes(s.targetId) && !imageIds.includes(s.targetId));
}

export function cleanupPhase5Asset(assetId: string) {
  const repoIds = db.repositories.filter((r) => r.assetId === assetId).map((r) => r.id);
  const imageIds = db.images.filter((i) => i.assetId === assetId).map((i) => i.id);
  db.repositories = db.repositories.filter((r) => r.assetId !== assetId);
  db.images = db.images.filter((i) => i.assetId !== assetId);
  db.scans = db.scans.filter((s) => !repoIds.includes(s.targetId) && !imageIds.includes(s.targetId));
}

/* ───────────── API ───────────── */

export const phase5Api: Phase5Api = {
  async listIntegrations() {
    await delay();
    currentUser();
    const smtp = db.settings.smtp;
    const smtpRow: Integration = {
      type: 'smtp', status: smtp.host ? 'connected' : 'not_connected', availableInPhase: null, account: smtp.host ? smtp.fromAddress || smtp.username : null,
      scopes: smtp.host ? [`${smtp.host}:${smtp.port}`] : [], connectedAt: null, connectedBy: null, lastSyncAt: null, error: null,
    };
    const order = ['github', 'ghcr', 'dockerhub', 'smtp', 'slack', 'webhook', 'jira', 'cloudflare', 'aws', 'google', 'entra'];
    return clone([...db.integrations, smtpRow].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)));
  },

  async connectIntegration(type, credentials) {
    await delay(900);
    requireReauth();
    const user = currentUser();
    const i = integration(type);
    if (!i) throw new ApiError(400, 'NOT_SUPPORTED', 'Set up email delivery in System settings.');
    if (i.availableInPhase) throw new ApiError(409, 'NOT_AVAILABLE_YET', `This integration arrives in phase ${i.availableInPhase}.`);
    if (type === 'ghcr' && integration('github').status !== 'connected') throw new ApiError(409, 'GITHUB_REQUIRED', 'GitHub Container Registry uses the GitHub App. Connect GitHub first.');
    if (type === 'dockerhub' && (!credentials?.username?.trim() || !credentials.token?.trim())) throw new ApiError(422, 'CREDENTIALS_REQUIRED', 'Enter your Docker Hub username and a read-only access token.');
    if (type === 'slack' && !/^https:\/\/hooks\.slack\.com\/services\/\S+$/.test(credentials?.url?.trim() ?? '')) {
      throw new ApiError(422, 'INVALID_URL', 'Paste the incoming webhook URL from Slack. It starts with https://hooks.slack.com/services/.');
    }
    if (type === 'webhook' && !/^https:\/\/\S+$/.test(credentials?.url?.trim() ?? '')) throw new ApiError(422, 'INVALID_URL', 'Enter an https:// URL. Plain http is not allowed for alerts.');
    const c = credentials ?? {};
    const need = (ok: boolean, message: string) => {
      if (!ok) throw new ApiError(422, 'INVALID_CREDENTIALS', message);
    };
    if (type === 'jira') {
      need(/^https:\/\/[\w-]+\.atlassian\.net\/?$/.test(c.siteUrl?.trim() ?? ''), 'Enter your Jira site, like https://your-team.atlassian.net.');
      need(/^\S+@\S+\.\S+$/.test(c.email ?? '') && !!c.apiToken?.trim(), 'Enter the Jira account email and an API token.');
      need(/^[A-Z][A-Z0-9]{1,9}$/.test(c.projectKey?.trim() ?? ''), 'Enter the project key in capitals, like SEC.');
    }
    if (type === 'cloudflare') need(!!c.apiToken?.trim(), 'Paste a Cloudflare API token with Zone: Read and DNS: Read.');
    if (type === 'aws') need(/^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/.test(c.roleArn?.trim() ?? ''), 'Enter the role ARN, like arn:aws:iam::123456789012:role/ShieldOpsReadOnly.');
    if (type === 'google') need(/^[\w.-]+\.[a-z]{2,}$/i.test(c.domain?.trim() ?? '') && /^\S+@\S+$/.test(c.adminEmail ?? ''), 'Enter your Workspace domain and an admin email for the service account to act as.');
    if (type === 'entra') need(/^[0-9a-f-]{36}$/i.test(c.tenantId?.trim() ?? '') && !!c.clientId?.trim() && !!c.clientSecret?.trim(), 'Enter the tenant ID, application (client) ID and client secret.');
    const secret = type === 'webhook' ? `whsec_${hex(32)}` : undefined;
    const account =
      type === 'dockerhub'
        ? credentials!.username.trim()
        : type === 'slack'
          ? `#${(credentials?.channel?.trim() || 'alerts').replace(/^#/, '')}`
          : type === 'webhook'
            ? new URL(credentials!.url.trim()).host
            : type === 'jira'
              ? `${new URL(c.siteUrl.trim()).host}, project ${c.projectKey.trim()}`
              : type === 'aws'
                ? c.roleArn.trim().split(':')[4]
                : type === 'google'
                  ? c.domain.trim().toLowerCase()
                  : type === 'entra'
                    ? `tenant ${c.tenantId.trim().slice(0, 8)}…`
                    : 'example-org';
    const SCOPES: Partial<Record<Integration['type'], string[]>> = {
      github: ['Contents: read', 'Metadata: read', 'Packages: read'],
      ghcr: ['Packages: read (through the GitHub App)'],
      dockerhub: ['Public repo read-only'],
      slack: ['Incoming webhook: post messages'],
      webhook: ['POST JSON, signed with HMAC-SHA256'],
      jira: ['Create and read issues in one project'],
      cloudflare: ['Zone: Read', 'DNS: Read'],
      aws: ['SecurityAudit (read-only role)'],
      google: ['Admin SDK: users and reports, read-only'],
      entra: ['Directory.Read.All', 'AuditLog.Read.All'],
    };
    Object.assign(i, {
      status: 'connected',
      account,
      scopes: SCOPES[type] ?? [],
      connectedAt: nowIso(),
      connectedBy: user.id,
      lastSyncAt: nowIso(),
      error: null,
    } satisfies Partial<Integration>);
    if (type === 'github') Object.assign(integration('ghcr'), { status: 'connected', account: 'example-org', scopes: ['Packages: read (through the GitHub App)'], connectedAt: nowIso(), connectedBy: user.id, lastSyncAt: nowIso() });
    const NAME: Partial<Record<Integration['type'], string>> = { github: 'GitHub', dockerhub: 'Docker Hub', ghcr: 'GitHub Container Registry', slack: 'Slack', webhook: 'the alert webhook', jira: 'Jira', cloudflare: 'Cloudflare', aws: 'AWS', google: 'Google Workspace', entra: 'Microsoft Entra ID' };
    audit('integration.connect', 'integration', type, `Connected ${NAME[type] ?? type}${type === 'webhook' || type === 'github' || type === 'ghcr' ? '' : ' (credentials stored encrypted)'}`);
    save();
    return { ...clone(i), secret };
  },

  async disconnectIntegration(type) {
    await delay();
    requireReauth();
    const i = integration(type);
    if (!i || i.status !== 'connected') throw new ApiError(409, 'NOT_CONNECTED', 'This integration is not connected.');
    const reset = { status: 'not_connected', account: null, scopes: [], connectedAt: null, connectedBy: null, lastSyncAt: null, error: null } as const;
    Object.assign(i, reset);
    if (type === 'github') Object.assign(integration('ghcr'), reset);
    audit('integration.disconnect', 'integration', type, `Disconnected ${type === 'github' ? 'GitHub (and GitHub Container Registry)' : type} and deleted its stored credentials`);
    save();
    return clone(i);
  },

  async listRepositories(filter = {}) {
    await delay();
    currentUser();
    settleAll();
    save();
    return db.repositories.filter((r) => inScope(r, filter)).map(repoView).sort((a, b) => a.fullName.localeCompare(b.fullName));
  },

  async getRepository(repoId) {
    await delay(150);
    currentUser();
    settleAll();
    return repoView(findRepo(repoId));
  },

  async listAvailableRepositories() {
    await delay(400);
    currentUser();
    if (integration('github').status !== 'connected') throw new ApiError(409, 'GITHUB_NOT_CONNECTED', 'Connect GitHub first.');
    return clone(ORG_REPOS.filter((r) => !db.repositories.some((x) => x.fullName === r.fullName)));
  },

  async addRepositories({ fullNames, applicationId, environmentId }) {
    await delay();
    const user = currentUser();
    if (integration('github').status !== 'connected') throw new ApiError(409, 'GITHUB_NOT_CONNECTED', 'Connect GitHub first.');
    if (!fullNames.length) throw new ApiError(422, 'NOTHING_SELECTED', 'Choose at least one repository.');
    const app = db.applications.find((a) => a.id === applicationId);
    if (!app?.environments.some((e) => e.id === environmentId)) throw new ApiError(422, 'INVALID_SCOPE', 'Choose an application and environment.');
    const added = fullNames.map((fullName) => {
      const meta = ORG_REPOS.find((r) => r.fullName === fullName);
      if (!meta) throw new ApiError(404, 'NOT_FOUND', `${fullName} is not visible to the GitHub App.`);
      if (db.repositories.some((r) => r.fullName === fullName)) throw new ApiError(409, 'ALREADY_ADDED', `${fullName} is already added.`);
      const asset: Asset = {
        id: id('s'), type: 'repository', identifier: fullName, label: `${fullName.split('/')[1]} repo`, applicationId, environmentId,
        exposure: meta.private ? 'internal' : 'internet', shared: false, status: 'active', createdAt: nowIso(),
        authorization: { status: 'approved', method: 'approval', justification: 'Connected through the GitHub App for example-org.', approvedBy: user.id, at: nowIso() },
      };
      db.assets.push(asset);
      const r: RepoRecord = { id: id('rp'), assetId: asset.id, fullName, applicationId, environmentId, private: meta.private, defaultBranch: meta.defaultBranch, language: meta.language, scanOnPush: true, dailyScan: true, dependencies: 120 + Math.floor(Math.random() * 400), addedAt: nowIso() };
      db.repositories.push(r);
      queueScan('repository', r.id, 'initial');
      audit('repository.add', 'repository', r.id, `Added repository ${fullName} to ${app.name}`);
      return r;
    });
    save();
    return added.map(repoView);
  },

  async updateRepository(repoId, input) {
    await delay();
    currentUser();
    const r = findRepo(repoId);
    Object.assign(r, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
    audit('repository.update', 'repository', r.id, `Changed scan schedule for ${r.fullName}: on push ${r.scanOnPush ? 'on' : 'off'}, daily ${r.dailyScan ? 'on' : 'off'}`);
    save();
    return repoView(r);
  },

  async removeRepository(repoId) {
    await delay();
    requireReauth();
    const user = currentUser();
    const r = findRepo(repoId);
    db.repositories = db.repositories.filter((x) => x.id !== repoId);
    db.scans = db.scans.filter((s) => s.targetId !== repoId);
    const asset = db.assets.find((a) => a.id === r.assetId);
    if (asset) asset.status = 'archived';
    closeFindingsFor(r.assetId, 'Closed because the repository was removed from ShieldOps', user.name);
    audit('repository.remove', 'repository', repoId, `Removed repository ${r.fullName}`);
    save();
  },

  async listImages(filter = {}) {
    await delay();
    currentUser();
    settleAll();
    save();
    return db.images.filter((i) => inScope(i, filter)).map(imageView);
  },

  async addImage(input) {
    await delay();
    const user = currentUser();
    const reg = input.registry === 'ghcr.io' ? integration('ghcr') : integration('dockerhub');
    if (reg.status !== 'connected') throw new ApiError(409, 'REGISTRY_NOT_CONNECTED', `Connect ${input.registry === 'ghcr.io' ? 'GitHub Container Registry' : 'Docker Hub'} in Integrations first.`);
    const repo = input.repository.trim().replace(/^(ghcr\.io|docker\.io)\//, '');
    const tag = input.tag.trim() || 'latest';
    if (!/^[a-z0-9._/-]+$/.test(repo) || !/^[\w.-]+$/.test(tag)) throw new ApiError(422, 'INVALID_IMAGE', 'Enter an image like your-org/app and a tag like 1.4.2.');
    const identifier = `${input.registry}/${repo}:${tag}`;
    if (db.images.some((i) => `${i.registry}/${i.repository}:${i.tag}` === identifier)) throw new ApiError(409, 'ALREADY_ADDED', 'This image is already added.');
    const app = db.applications.find((a) => a.id === input.applicationId);
    if (!app?.environments.some((e) => e.id === input.environmentId)) throw new ApiError(422, 'INVALID_SCOPE', 'Choose an application and environment.');
    const asset: Asset = {
      id: id('s'), type: 'image', identifier, label: `${repo.split('/').pop()} image`, applicationId: input.applicationId, environmentId: input.environmentId,
      exposure: 'internal', shared: false, status: 'active', createdAt: nowIso(),
      authorization: { status: 'approved', method: 'approval', justification: `Pulled through the ${input.registry} integration.`, approvedBy: user.id, at: nowIso() },
    };
    db.assets.push(asset);
    const img: ImageRecord = { id: id('im'), assetId: asset.id, applicationId: input.applicationId, environmentId: input.environmentId, registry: input.registry, repository: repo, tag, digest: `sha256:${hex(14)}`, os: 'Alpine 3.20.3', sizeMb: 150 + Math.floor(Math.random() * 200), dailyScan: true, addedAt: nowIso() };
    db.images.push(img);
    queueScan('image', img.id, 'initial');
    audit('image.add', 'image', img.id, `Added image ${identifier}`);
    save();
    return imageView(img);
  },

  async removeImage(imageId) {
    await delay();
    requireReauth();
    const user = currentUser();
    const img = db.images.find((i) => i.id === imageId);
    if (!img) throw new ApiError(404, 'NOT_FOUND', 'Image not found.');
    db.images = db.images.filter((i) => i.id !== imageId);
    db.scans = db.scans.filter((s) => s.targetId !== imageId);
    const asset = db.assets.find((a) => a.id === img.assetId);
    if (asset) asset.status = 'archived';
    closeFindingsFor(img.assetId, 'Closed because the image was removed from ShieldOps', user.name);
    audit('image.remove', 'image', imageId, `Removed image ${img.registry}/${img.repository}:${img.tag}`);
    save();
  },

  async listScans(targetType, targetId) {
    await delay(150);
    currentUser();
    settleAll();
    save();
    return scansFor(targetType, targetId).map(scanView);
  },

  async startScan(targetType, targetId) {
    await delay();
    currentUser();
    settleAll();
    if (targetType === 'repository') {
      findRepo(targetId);
      if (integration('github').status !== 'connected') throw new ApiError(409, 'GITHUB_NOT_CONNECTED', 'GitHub is disconnected, so repositories cannot be cloned. Reconnect it in Integrations.');
    } else if (!db.images.some((i) => i.id === targetId)) throw new ApiError(404, 'NOT_FOUND', 'Image not found.');
    if (scansFor(targetType, targetId).some((s) => s.status === 'queued' || s.status === 'running')) throw new ApiError(409, 'SCAN_IN_PROGRESS', 'A scan is already running for this target.');
    const s = queueScan(targetType, targetId, 'manual');
    save();
    return scanView(s);
  },

  async listDependencies(filter = {}) {
    await delay();
    currentUser();
    const rows = new Map<string, DependencyRow & { fixes: string[] }>();
    db.findings
      .filter((f) => f.source === 'vulnerabilities' && f.code?.kind === 'vuln' && !CLOSED.includes(f.status) && inScope(f, filter))
      .forEach((f) => {
        const v = f.code as VulnDetail;
        const key = `${v.ecosystem}:${v.package}`;
        const row = rows.get(key) ?? { package: v.package, ecosystem: v.ecosystem, installed: [], upgradeTo: null, vulns: 0, worst: 'info' as Severity, knownExploited: false, targets: [], fixes: [] };
        row.vulns++;
        if (!row.installed.includes(v.installed)) row.installed.push(v.installed);
        if (SEV_ORDER.indexOf(f.severity) < SEV_ORDER.indexOf(row.worst)) row.worst = f.severity;
        row.knownExploited ||= f.knownExploited;
        if (v.fixedIn) row.fixes.push(v.fixedIn);
        if (!row.targets.some((t) => t.name === v.targetName)) row.targets.push({ type: v.targetType, name: v.targetName, applicationId: f.applicationId });
        rows.set(key, row);
      });
    const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
    return [...rows.values()]
      .map(({ fixes, ...r }) => ({ ...r, upgradeTo: fixes.sort(cmp).at(-1) ?? null }))
      .sort((a, b) => SEV_ORDER.indexOf(a.worst) - SEV_ORDER.indexOf(b.worst) || b.vulns - a.vulns);
  },
};