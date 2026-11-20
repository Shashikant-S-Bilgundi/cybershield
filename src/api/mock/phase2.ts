import { ApiError } from '../errors';
import type { MonitorFilter, ShieldOpsApi } from '../contract';
import type {
  Alert,
  Application,
  ApplicationHealth,
  CheckResult,
  ExpiryItem,
  Finding,
  HealthState,
  Heartbeat,
  Monitor,
  MonitorDetail,
} from '@/types';
import { isAuthorized } from '@/lib/assets';
import { hostOf } from '@/lib/net';
import { DAY, MIN, audit, clone, currentUser, db, delay, hex, id, nowIso, requireReauth, save } from './core';
import { eventsFrom, type HeartbeatRecord, type MonitorRecord } from './seed2';

type Phase2Keys =
  | 'listMonitors' | 'getMonitor' | 'createMonitor' | 'updateMonitor' | 'setMonitorPaused' | 'runMonitorNow' | 'deleteMonitor'
  | 'listHeartbeats' | 'createHeartbeat' | 'setHeartbeatPaused' | 'deleteHeartbeat'
  | 'listCertificates' | 'listDnsSnapshots' | 'listDomainExpiry' | 'listHeaderReports' | 'recheckAsset'
  | 'listAlerts' | 'acknowledgeAlert' | 'snoozeAlert' | 'resolveAlert'
  | 'listFindings' | 'getFinding' | 'updateFinding'
  | 'listAlertRules' | 'createAlertRule' | 'updateAlertRule' | 'deleteAlertRule'
  | 'getChannels' | 'updateChannels'
  | 'listMaintenanceWindows' | 'createMaintenanceWindow' | 'deleteMaintenanceWindow';

export type Phase2Api = Pick<ShieldOpsApi, Phase2Keys>;

const MAX_RESULTS = 240;
const CLOSED_FINDING: Finding['status'][] = ['resolved', 'verified', 'accepted_risk', 'false_positive'];

const inScope = (x: { applicationId: string; environmentId?: string }, f: MonitorFilter = {}) =>
  (!f.applicationId || x.applicationId === f.applicationId) && (!f.environmentId || !x.environmentId || x.environmentId === f.environmentId);

/* ───────────── simulation: keeps checks and pings arriving while the app is open ───────────── */

function simulatedResult(m: MonitorRecord, at: number): CheckResult {
  const jitter = 1 + (Math.random() - 0.3) * 0.5;
  if (m.sim === 'down') return { at: new Date(at).toISOString(), status: 'down', latencyMs: null, error: 'TIMEOUT' };
  if (m.sim === 'flaky' && Math.random() < 0.15) return { at: new Date(at).toISOString(), status: 'degraded', latencyMs: Math.round(2300 * jitter), statusCode: 200 };
  return { at: new Date(at).toISOString(), status: 'up', latencyMs: Math.max(1, Math.round(m.latencyBase * jitter)), statusCode: m.type === 'http' ? 200 : undefined };
}

function advanceMonitor(m: MonitorRecord) {
  if (m.paused) return;
  const step = m.intervalSec * 1000;
  let last = new Date(m.results.at(-1)?.at ?? m.createdAt).getTime();
  let added = 0;
  while (last + step <= Date.now() && added < MAX_RESULTS) {
    last += step;
    m.results.push(simulatedResult(m, last));
    added++;
  }
  if (!added) return;
  const older = m.results.length > MAX_RESULTS ? m.results.splice(0, m.results.length - MAX_RESULTS) : [];
  const windowStart = m.results[0]?.at ?? '';
  const keep = m.events.filter((e) => e.at < windowStart);
  m.events = [...eventsFrom(m.results, m.downAfterFailures), ...keep];
  void older;
}

function advanceHeartbeat(h: HeartbeatRecord) {
  if (h.paused || h.sim !== 'healthy' || !h.lastPingAt) return;
  const now = Date.now();
  if (h.schedule.kind === 'interval') {
    const step = h.schedule.seconds * 1000;
    let last = new Date(h.lastPingAt).getTime();
    while (last + step <= now) {
      last += step;
      h.recent.unshift({ at: new Date(last).toISOString(), kind: 'success', late: false });
    }
    h.lastPingAt = new Date(last).toISOString();
  } else if (h.cronNextDueAt && new Date(h.cronNextDueAt).getTime() <= now) {
    h.lastPingAt = h.cronNextDueAt;
    h.recent.unshift({ at: h.cronNextDueAt, kind: 'success', late: false });
    const monthly = h.schedule.expression.split(' ')[2] !== '*';
    h.cronNextDueAt = new Date(new Date(h.cronNextDueAt).getTime() + (monthly ? 30 : 1) * DAY).toISOString();
  }
  h.recent = h.recent.slice(0, 12);
}

export function advanceAll() {
  db.monitors.forEach(advanceMonitor);
  db.heartbeats.forEach(advanceHeartbeat);
  db.alerts.forEach((a) => {
    if (a.status === 'snoozed' && a.snoozedUntil && new Date(a.snoozedUntil).getTime() < Date.now()) {
      a.status = 'open';
      a.snoozedUntil = null;
    }
  });
}

/* ───────────── views ───────────── */

function monitorStatus(m: MonitorRecord): HealthState {
  if (m.paused) return 'paused';
  const last = m.results.at(-1);
  if (!last) return 'unknown';
  let downRun = 0;
  for (let i = m.results.length - 1; i >= 0 && m.results[i].status === 'down'; i--) downRun++;
  if (downRun >= m.downAfterFailures) return 'down';
  if (last.status === 'unknown') return 'unknown';
  if (last.status === 'degraded') return 'degraded';
  return 'up';
}

function uptimeOf(results: CheckResult[]): number | null {
  const counted = results.filter((r) => r.status !== 'unknown');
  if (!counted.length) return null;
  return Math.round((counted.filter((r) => r.status !== 'down').length / counted.length) * 10000) / 100;
}

function monitorView(m: MonitorRecord): Monitor {
  const last = m.results.at(-1);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { results: _r, events: _e, sim: _s, latencyBase: _l, uptimeBase, ...rest } = m;
  return clone({
    ...rest,
    status: monitorStatus(m),
    lastCheckAt: last?.at ?? null,
    lastLatencyMs: last?.latencyMs ?? null,
    uptime: { d1: uptimeOf(m.results), d7: uptimeBase.d7, d30: uptimeBase.d30 },
  });
}

function monitorDetail(m: MonitorRecord): MonitorDetail {
  return { ...monitorView(m), results: clone(m.results), events: clone(m.events) };
}

function heartbeatView(h: HeartbeatRecord): Heartbeat {
  const due =
    h.schedule.kind === 'interval'
      ? h.lastPingAt
        ? new Date(new Date(h.lastPingAt).getTime() + h.schedule.seconds * 1000).toISOString()
        : null
      : h.cronNextDueAt;
  let status: Heartbeat['status'] = 'up';
  if (h.paused) status = 'paused';
  else if (!h.lastPingAt) status = 'new';
  else if (due) {
    const late = Date.now() - new Date(due).getTime();
    status = late <= 0 ? 'up' : late <= h.graceSec * 1000 ? 'late' : 'down';
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { paused: _p, cronNextDueAt: _c, sim: _s, ...rest } = h;
  return clone({ ...rest, status, nextDueAt: due });
}

const SEVERITY_ORDER: HealthState[] = ['down', 'degraded', 'unknown', 'up', 'paused'];

export function prodHealth(app: Application): ApplicationHealth {
  const prod = app.environments.find((e) => e.type === 'production') ?? app.environments[0];
  const mons = db.monitors.filter((m) => m.environmentId === prod?.id);
  const active = mons.filter((m) => !m.paused);
  const primary = active.find((m) => m.type === 'http') ?? active[0];
  const states = active.map(monitorStatus);
  const state: HealthState =
    app.status === 'archived' ? 'paused' : states.length ? [...states].sort((a, b) => SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b))[0] : 'unknown';
  return {
    applicationId: app.id,
    environmentId: prod?.id ?? '',
    state,
    uptime30d: primary?.uptimeBase.d30 ?? null,
    ticks: (primary?.results.slice(-60) ?? []).map((r) => ({ at: r.at, state: r.status, latencyMs: r.latencyMs })),
  };
}

export const activeAlertCount = () => db.alerts.filter((a) => a.status === 'open' || a.status === 'acknowledged').length;
export const activeFindings = () => db.findings.filter((f) => !CLOSED_FINDING.includes(f.status));

export function expiriesSoon(): ExpiryItem[] {
  const soon = Date.now() + 90 * DAY;
  const ssl: ExpiryItem[] = db.certificates
    .filter((c) => c.validTo && new Date(c.validTo).getTime() < soon)
    .map((c) => ({ assetId: c.assetId, applicationId: c.applicationId, kind: 'ssl', identifier: c.host, expiresAt: c.validTo }));
  const domains: ExpiryItem[] = db.domains
    .filter((d) => !d.expiresAt || new Date(d.expiresAt).getTime() < soon)
    .map((d) => ({ assetId: d.assetId, applicationId: d.applicationId, kind: 'domain', identifier: d.domain, expiresAt: d.expiresAt }));
  return [...ssl, ...domains];
}

export function cleanupAsset(assetId: string) {
  db.monitors = db.monitors.filter((m) => m.assetId !== assetId);
  db.certificates = db.certificates.filter((x) => x.assetId !== assetId);
  db.dns = db.dns.filter((x) => x.assetId !== assetId);
  db.domains = db.domains.filter((x) => x.assetId !== assetId);
  db.headers = db.headers.filter((x) => x.assetId !== assetId);
  db.findings = db.findings.filter((x) => x.assetId !== assetId);
}

export function cleanupApplication(appId: string) {
  for (const key of ['monitors', 'heartbeats', 'certificates', 'dns', 'domains', 'headers', 'alerts', 'findings'] as const) {
    (db[key] as { applicationId: string }[]) = (db[key] as { applicationId: string }[]).filter((x) => x.applicationId !== appId);
  }
}

/* ───────────── validation helpers ───────────── */

const MONITOR_ASSET_TYPES: Record<Monitor['type'], string[]> = {
  http: ['website', 'api', 'domain'],
  tcp: ['server', 'database'],
  dns: ['domain', 'website', 'api'],
};

function validateTarget(type: Monitor['type'], target: string) {
  const v = target.trim();
  const ok =
    type === 'http' ? /^https?:\/\/\S+$/i.test(v) : type === 'tcp' ? /^[\w.-]+:\d{1,5}$/.test(v) : /^([a-z0-9-]+\.)+[a-z]{2,63}$/i.test(v);
  if (!ok) {
    const hint = type === 'http' ? 'a full URL starting with https://' : type === 'tcp' ? 'host:port, like 10.0.2.15:5432' : 'a hostname, like pay.example.com';
    throw new ApiError(422, 'INVALID_TARGET', `Enter ${hint}.`);
  }
}

const findMonitor = (monitorId: string) => {
  const m = db.monitors.find((x) => x.id === monitorId);
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Monitor not found.');
  return m;
};

const findAlert = (alertId: string) => {
  const a = db.alerts.find((x) => x.id === alertId);
  if (!a) throw new ApiError(404, 'NOT_FOUND', 'Alert not found.');
  return a;
};

const isEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v);

/* ───────────── API ───────────── */

export const phase2Api: Phase2Api = {
  async listMonitors(filter) {
    await delay();
    currentUser();
    advanceAll();
    save();
    return db.monitors.filter((m) => inScope(m, filter)).map(monitorView);
  },

  async getMonitor(monitorId) {
    await delay(180);
    currentUser();
    advanceAll();
    save();
    return monitorDetail(findMonitor(monitorId));
  },

  async createMonitor(input) {
    await delay();
    currentUser();
    if (!input.name.trim()) throw new ApiError(422, 'NAME_REQUIRED', 'Give the monitor a name.');
    const asset = db.assets.find((a) => a.id === input.assetId);
    if (!asset) throw new ApiError(404, 'NOT_FOUND', 'Asset not found.');
    if (!isAuthorized(asset.authorization)) throw new ApiError(422, 'ASSET_NOT_AUTHORIZED', 'Verify or approve this asset before monitoring it.');
    if (!MONITOR_ASSET_TYPES[input.type].includes(asset.type)) throw new ApiError(422, 'TYPE_MISMATCH', 'That check type does not fit this asset.');
    validateTarget(input.type, input.target);
    if (db.monitors.some((m) => m.type === input.type && m.target === input.target.trim())) {
      throw new ApiError(409, 'DUPLICATE_MONITOR', 'A monitor for this address already exists.');
    }
    if (input.intervalSec < 30) throw new ApiError(422, 'INTERVAL_TOO_SHORT', 'Check at most every 30 seconds.');
    const m: MonitorRecord = {
      id: id('m'),
      name: input.name.trim(),
      type: input.type,
      applicationId: asset.applicationId,
      environmentId: asset.environmentId,
      assetId: asset.id,
      target: input.target.trim(),
      intervalSec: input.intervalSec,
      timeoutMs: input.timeoutMs,
      downAfterFailures: input.downAfterFailures,
      expectedStatus: input.type === 'http' ? input.expectedStatus || '200-299' : undefined,
      keyword: input.type === 'http' ? input.keyword?.trim() || undefined : undefined,
      recordType: input.type === 'dns' ? input.recordType ?? 'A' : undefined,
      paused: false,
      createdAt: nowIso(),
      results: [],
      events: [],
      sim: 'up',
      latencyBase: input.type === 'tcp' ? 5 : input.type === 'dns' ? 25 : 160,
      uptimeBase: { d7: 100, d30: 100 },
    };
    m.results.push(simulatedResult(m, Date.now()));
    db.monitors.push(m);
    audit('monitor.create', 'monitor', m.id, `Created ${m.type.toUpperCase()} monitor ${m.name}`);
    save();
    return monitorView(m);
  },

  async updateMonitor(monitorId, input) {
    await delay();
    currentUser();
    const m = findMonitor(monitorId);
    if (input.target !== undefined) validateTarget(input.type ?? m.type, input.target);
    Object.assign(m, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
    audit('monitor.update', 'monitor', m.id, `Updated monitor ${m.name}`);
    save();
    return monitorView(m);
  },

  async setMonitorPaused(monitorId, paused) {
    await delay();
    currentUser();
    const m = findMonitor(monitorId);
    advanceMonitor(m);
    m.paused = paused;
    if (!paused) m.results.push(simulatedResult(m, Date.now()));
    audit(paused ? 'monitor.pause' : 'monitor.resume', 'monitor', m.id, `${paused ? 'Paused' : 'Resumed'} monitor ${m.name}`);
    save();
    return monitorView(m);
  },

  async runMonitorNow(monitorId) {
    await delay(900);
    currentUser();
    const m = findMonitor(monitorId);
    advanceMonitor(m);
    m.results.push(simulatedResult(m, Date.now()));
    m.events = eventsFrom(m.results, m.downAfterFailures);
    save();
    return monitorDetail(m);
  },

  async deleteMonitor(monitorId) {
    await delay();
    requireReauth();
    const m = findMonitor(monitorId);
    db.monitors = db.monitors.filter((x) => x.id !== monitorId);
    audit('monitor.delete', 'monitor', monitorId, `Deleted monitor ${m.name}`);
    save();
  },

  async listHeartbeats(filter) {
    await delay();
    currentUser();
    advanceAll();
    save();
    return db.heartbeats.filter((h) => inScope(h, filter)).map(heartbeatView);
  },

  async createHeartbeat(input) {
    await delay();
    currentUser();
    if (!input.name.trim()) throw new ApiError(422, 'NAME_REQUIRED', 'Give the job a name.');
    const app = db.applications.find((a) => a.id === input.applicationId);
    if (!app?.environments.some((e) => e.id === input.environmentId)) throw new ApiError(422, 'INVALID_SCOPE', 'Choose an application and environment.');
    if (input.schedule.kind === 'interval' && input.schedule.seconds < 60) throw new ApiError(422, 'INTERVAL_TOO_SHORT', 'Jobs must run at most once a minute.');
    if (input.schedule.kind === 'cron' && input.schedule.expression.trim().split(/\s+/).length !== 5) {
      throw new ApiError(422, 'INVALID_CRON', 'Use a 5-part cron expression, like 0 2 * * *.');
    }
    if (input.graceSec < 60) throw new ApiError(422, 'GRACE_TOO_SHORT', 'Allow at least one minute of grace.');
    const h: HeartbeatRecord = {
      id: id('h'),
      name: input.name.trim(),
      applicationId: input.applicationId,
      environmentId: input.environmentId,
      schedule: input.schedule,
      graceSec: input.graceSec,
      paused: false,
      sim: 'healthy',
      lastPingAt: null,
      cronNextDueAt: null,
      pingUrl: `${window.location.origin}/hb/${hex(10)}`,
      recent: [],
      createdAt: nowIso(),
    };
    db.heartbeats.push(h);
    audit('heartbeat.create', 'heartbeat', h.id, `Created heartbeat ${h.name}`);
    save();
    return heartbeatView(h);
  },

  async setHeartbeatPaused(heartbeatId, paused) {
    await delay();
    currentUser();
    const h = db.heartbeats.find((x) => x.id === heartbeatId);
    if (!h) throw new ApiError(404, 'NOT_FOUND', 'Heartbeat not found.');
    h.paused = paused;
    if (!paused && h.lastPingAt) h.lastPingAt = nowIso();
    audit(paused ? 'heartbeat.pause' : 'heartbeat.resume', 'heartbeat', h.id, `${paused ? 'Paused' : 'Resumed'} heartbeat ${h.name}`);
    save();
    return heartbeatView(h);
  },

  async deleteHeartbeat(heartbeatId) {
    await delay();
    requireReauth();
    const h = db.heartbeats.find((x) => x.id === heartbeatId);
    if (!h) throw new ApiError(404, 'NOT_FOUND', 'Heartbeat not found.');
    db.heartbeats = db.heartbeats.filter((x) => x.id !== heartbeatId);
    audit('heartbeat.delete', 'heartbeat', heartbeatId, `Deleted heartbeat ${h.name}`);
    save();
  },

  async listCertificates(filter) {
    await delay();
    currentUser();
    return clone(db.certificates.filter((x) => inScope(x, filter)));
  },

  async listDnsSnapshots(filter) {
    await delay();
    currentUser();
    return clone(db.dns.filter((x) => inScope(x, filter)));
  },

  async listDomainExpiry(filter) {
    await delay();
    currentUser();
    return clone(db.domains.filter((x) => inScope(x, filter)));
  },

  async listHeaderReports(filter) {
    await delay();
    currentUser();
    return clone(db.headers.filter((x) => inScope(x, filter)));
  },

  async recheckAsset(assetId) {
    await delay(1200);
    currentUser();
    const asset = db.assets.find((a) => a.id === assetId);
    if (!asset) throw new ApiError(404, 'NOT_FOUND', 'Asset not found.');
    const at = nowIso();
    [db.certificates, db.dns, db.domains, db.headers].forEach((list) =>
      (list as { assetId: string; checkedAt: string }[]).forEach((x) => {
        if (x.assetId === assetId) x.checkedAt = at;
      }),
    );
    audit('asset.recheck', 'asset', assetId, `Re-ran SSL, DNS, domain and header checks for ${hostOf(asset.identifier)}`);
    save();
  },

  async listAlerts(filter = {}) {
    await delay();
    currentUser();
    advanceAll();
    save();
    return clone(
      db.alerts
        .filter((a) => inScope(a, filter))
        .filter((a) => !filter.status || (filter.status === 'active' ? a.status !== 'resolved' : a.status === filter.status))
        .filter((a) => !filter.severity || a.severity === filter.severity)
        .filter((a) => !filter.source || a.source === filter.source)
        .sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    );
  },

  async acknowledgeAlert(alertId) {
    await delay();
    const user = currentUser();
    const a = findAlert(alertId);
    if (a.status === 'resolved') throw new ApiError(409, 'ALREADY_RESOLVED', 'This alert is already resolved.');
    Object.assign(a, { status: 'acknowledged', acknowledgedBy: user.id, acknowledgedAt: nowIso(), snoozedUntil: null } satisfies Partial<Alert>);
    audit('alert.acknowledge', 'alert', a.id, `Acknowledged alert: ${a.title}`);
    save();
    return clone(a);
  },

  async snoozeAlert(alertId, minutes) {
    await delay();
    currentUser();
    const a = findAlert(alertId);
    if (a.status === 'resolved') throw new ApiError(409, 'ALREADY_RESOLVED', 'This alert is already resolved.');
    Object.assign(a, { status: 'snoozed', snoozedUntil: new Date(Date.now() + minutes * MIN).toISOString() } satisfies Partial<Alert>);
    audit('alert.snooze', 'alert', a.id, `Snoozed alert for ${minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`}: ${a.title}`);
    save();
    return clone(a);
  },

  async resolveAlert(alertId) {
    await delay();
    currentUser();
    const a = findAlert(alertId);
    Object.assign(a, { status: 'resolved', resolvedAt: nowIso(), autoResolved: false, snoozedUntil: null } satisfies Partial<Alert>);
    audit('alert.resolve', 'alert', a.id, `Resolved alert: ${a.title}`);
    save();
    return clone(a);
  },

  async listFindings(filter = {}) {
    await delay();
    currentUser();
    return clone(
      db.findings
        .filter((f) => inScope(f, filter))
        .filter((f) => !filter.assetId || f.assetId === filter.assetId)
        .filter((f) => !filter.status || (filter.status === 'active' ? !CLOSED_FINDING.includes(f.status) : f.status === filter.status))
        .filter((f) => !filter.severity || f.severity === filter.severity)
        .filter((f) => !filter.source || f.source === filter.source)
        .sort((a, b) => b.riskScore - a.riskScore),
    );
  },

  async getFinding(findingId) {
    await delay(150);
    currentUser();
    const f = db.findings.find((x) => x.id === findingId);
    if (!f) throw new ApiError(404, 'NOT_FOUND', 'Finding not found.');
    return clone(f);
  },

  async updateFinding(findingId, input) {
    await delay();
    const user = currentUser();
    const f = db.findings.find((x) => x.id === findingId);
    if (!f) throw new ApiError(404, 'NOT_FOUND', 'Finding not found.');
    const log = (text: string) => f.history.unshift({ at: nowIso(), actorName: user.name, text });

    if (input.status && input.status !== f.status) {
      if (input.status === 'verified') throw new ApiError(422, 'VERIFY_BY_RECHECK', 'Only a passing recheck can mark a finding as verified.');
      if (input.status === 'accepted_risk') {
        const ar = input.acceptedRisk;
        if (!ar || ar.justification.trim().length < 10) throw new ApiError(422, 'JUSTIFICATION_REQUIRED', 'Explain why this risk is acceptable (at least 10 characters).');
        if (new Date(ar.expiresAt).getTime() <= Date.now()) throw new ApiError(422, 'EXPIRY_IN_PAST', 'Choose a review date in the future.');
        f.acceptedRisk = { justification: ar.justification.trim(), expiresAt: ar.expiresAt, by: user.id, at: nowIso() };
        log(`Accepted the risk until ${ar.expiresAt.slice(0, 10)}: ${ar.justification.trim()}`);
      } else {
        if (f.status === 'accepted_risk') f.acceptedRisk = null;
        log(`Changed status to ${input.status.replace(/_/g, ' ')}`);
      }
      f.status = input.status;
      audit('finding.status', 'finding', f.id, `Set "${f.title}" to ${input.status.replace(/_/g, ' ')}`);
    }
    if (input.assigneeId !== undefined && input.assigneeId !== f.assigneeId) {
      const who = input.assigneeId ? db.users.find((u) => u.id === input.assigneeId)?.name ?? 'someone' : 'nobody';
      f.assigneeId = input.assigneeId;
      log(`Assigned to ${who}`);
      audit('finding.assign', 'finding', f.id, `Assigned "${f.title}" to ${who}`);
    }
    if (input.note?.trim()) log(`Note: ${input.note.trim()}`);
    f.lastSeen = f.lastSeen ?? nowIso();
    save();
    return clone(f);
  },

  async listAlertRules() {
    await delay();
    currentUser();
    return clone(db.alertRules);
  },

  async createAlertRule(input) {
    await delay();
    currentUser();
    if (!input.name.trim()) throw new ApiError(422, 'NAME_REQUIRED', 'Give the rule a name.');
    if (!input.channels.length) throw new ApiError(422, 'CHANNEL_REQUIRED', 'Choose at least one channel.');
    const rule = { ...clone(input), id: id('r'), name: input.name.trim(), builtIn: false };
    db.alertRules.push(rule);
    audit('alert_rule.create', 'alert_rule', rule.id, `Created alert rule ${rule.name}`);
    save();
    return clone(rule);
  },

  async updateAlertRule(ruleId, input) {
    await delay();
    currentUser();
    const rule = db.alertRules.find((r) => r.id === ruleId);
    if (!rule) throw new ApiError(404, 'NOT_FOUND', 'Rule not found.');
    if (input.channels && !input.channels.length) throw new ApiError(422, 'CHANNEL_REQUIRED', 'Choose at least one channel.');
    Object.assign(rule, clone(input));
    audit('alert_rule.update', 'alert_rule', rule.id, `${input.enabled === false ? 'Turned off' : input.enabled === true ? 'Turned on' : 'Updated'} alert rule ${rule.name}`);
    save();
    return clone(rule);
  },

  async deleteAlertRule(ruleId) {
    await delay();
    currentUser();
    const rule = db.alertRules.find((r) => r.id === ruleId);
    if (!rule) throw new ApiError(404, 'NOT_FOUND', 'Rule not found.');
    if (rule.builtIn) throw new ApiError(409, 'BUILT_IN_RULE', 'Built-in rules can be turned off but not deleted.');
    db.alertRules = db.alertRules.filter((r) => r.id !== ruleId);
    audit('alert_rule.delete', 'alert_rule', ruleId, `Deleted alert rule ${rule.name}`);
    save();
  },

  async getChannels() {
    await delay();
    currentUser();
    return clone(db.channels);
  },

  async updateChannels(input) {
    await delay();
    requireReauth();
    const bad = input.emailRecipients.find((e) => !isEmail(e));
    if (bad) throw new ApiError(422, 'INVALID_EMAIL', `${bad} is not a valid email address.`);
    if (input.criticalRenotifyMin < 5) throw new ApiError(422, 'RENOTIFY_TOO_OFTEN', 'Re-notify at most every 5 minutes.');
    db.channels = clone(input);
    audit('channels.update', 'settings', null, `Changed alert email recipients to ${input.emailRecipients.join(', ') || 'none'}`);
    save();
    return clone(db.channels);
  },

  async listMaintenanceWindows() {
    await delay();
    currentUser();
    return clone(db.maintenance.filter((w) => new Date(w.endsAt).getTime() > Date.now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
  },

  async createMaintenanceWindow(input) {
    await delay();
    const user = currentUser();
    if (!input.title.trim()) throw new ApiError(422, 'TITLE_REQUIRED', 'Describe the maintenance.');
    if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) throw new ApiError(422, 'INVALID_RANGE', 'The end must be after the start.');
    if (new Date(input.endsAt).getTime() <= Date.now()) throw new ApiError(422, 'IN_PAST', 'This window has already ended.');
    const w = { ...clone(input), id: id('mw'), title: input.title.trim(), createdBy: user.id };
    db.maintenance.push(w);
    audit('maintenance.create', 'maintenance', w.id, `Scheduled maintenance: ${w.title}`);
    save();
    return clone(w);
  },

  async deleteMaintenanceWindow(windowId) {
    await delay();
    currentUser();
    const w = db.maintenance.find((x) => x.id === windowId);
    db.maintenance = db.maintenance.filter((x) => x.id !== windowId);
    if (w) audit('maintenance.delete', 'maintenance', windowId, `Cancelled maintenance: ${w.title}`);
    save();
  },
};