import { ApiError } from '../errors';
import type { MonitorFilter, ShieldOpsApi } from '../contract';
import type {
  ConsoleLogin,
  ErrorEvent,
  ErrorGroup,
  ErrorGroupDetail,
  PerfPoint,
  PerfRange,
  PerformanceReport,
  PerfSummary,
  SecurityEvent,
  SecurityEventType,
  SecurityStats,
} from '@/types';
import { audit, clone, currentUser, db, delay, hex, id, nowIso, requireReauth, save } from './core';
import type { ErrorGroupRecord, PerfProfile, StoredKey } from './seed3';

type Phase3Keys =
  | 'listErrorGroups' | 'getErrorGroup' | 'updateErrorGroup'
  | 'listPerformance' | 'getPerformance'
  | 'listSecurityEvents' | 'getSecurityStats' | 'listDetections' | 'listConsoleLogins'
  | 'listIngestionKeys' | 'createIngestionKey' | 'rotateIngestionKey' | 'revokeIngestionKey';

export type Phase3Api = Pick<ShieldOpsApi, Phase3Keys>;

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Stable pseudo-random number in [0, 1) for a pair of integers. */
function noise(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

const keyOf = (s: string) => Array.from(s).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 7);
const inScope = (x: { applicationId: string; environmentId: string }, f: MonitorFilter = {}) =>
  (!f.applicationId || x.applicationId === f.applicationId) && (!f.environmentId || x.environmentId === f.environmentId);

/* ───────────── errors ───────────── */

/** The span with no events: from "resolved" until it came back (or until now). */
function quietWindow(g: ErrorGroupRecord): [number, number] | null {
  if (!g.resolvedAt || (g.status !== 'resolved' && g.status !== 'regressed')) return null;
  const from = new Date(g.resolvedAt).getTime();
  if (g.status === 'resolved') return [from, Infinity];
  const back = g.history.find((h) => h.text.startsWith('Happened again'))?.at;
  return [from, back ? new Date(back).getTime() : new Date(g.lastSeen).getTime() - HOUR];
}

function trendOf(g: ErrorGroupRecord): number[] {
  const now = Date.now();
  const first = new Date(g.firstSeen).getTime();
  const last = new Date(g.lastSeen).getTime();
  const quiet = quietWindow(g);
  return Array.from({ length: 24 }, (_, i) => {
    const end = now - (23 - i) * HOUR;
    const start = end - HOUR;
    if (end < first || start > last || (quiet && start >= quiet[0] && end <= quiet[1])) return 0;
    const r = noise(g.seed, Math.floor(start / HOUR));
    return Math.max(end > last - HOUR ? 1 : 0, Math.round(g.ratePerHour * (0.4 + r * 1.2)));
  });
}

function groupView(g: ErrorGroupRecord): ErrorGroup {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { stack: _s, releases: _r, request: _q, tags: _t, ratePerHour: _p, seed: _d, history: _h, ...rest } = g;
  return clone({ ...rest, trend: trendOf(g) });
}

function eventsOf(g: ErrorGroupRecord): ErrorEvent[] {
  const last = new Date(g.lastSeen).getTime();
  const first = new Date(g.firstSeen).getTime();
  const quiet = quietWindow(g);
  const gap = quiet && Number.isFinite(quiet[1]) ? quiet[1] - quiet[0] : 0;
  const span = Math.max(MIN, last - first - gap);
  const count = Math.min(20, g.count);
  return Array.from({ length: count }, (_, i) => {
    const r = noise(g.seed, i + 1);
    const sinceBack = g.status === 'regressed' && quiet && Number.isFinite(quiet[1]) ? last - quiet[1] : 0;
    let at =
      i === 0
        ? last
        : sinceBack && i < 6
          ? last - (sinceBack * i) / 6
          : last - sinceBack - span * Math.pow(i / count, 1.6) * (0.85 + r * 0.3);
    // Skip over the time the error was resolved: no events happened then.
    if (quiet && gap && at < quiet[1] && at > quiet[0]) at -= gap;
    const tags: Record<string, string> = {};
    Object.entries(g.tags).forEach(([k, vals]) => (tags[k] = vals[Math.floor(noise(g.seed + k.length, i) * vals.length)]));
    const release = i < count / 2 ? g.lastRelease : g.releases[Math.floor(r * g.releases.length)];
    return {
      id: `${g.id}-ev${i}`,
      groupId: g.id,
      at: new Date(at).toISOString(),
      release,
      message: g.message,
      request: g.request,
      userHash: g.usersAffected ? `usr_${Math.floor(r * 0xffffff).toString(16).padStart(6, '0')}` : null,
      tags: { environment: db.applications.find((a) => a.id === g.applicationId)?.environments.find((e) => e.id === g.environmentId)?.name ?? '', ...tags },
    };
  }).sort((a, b) => b.at.localeCompare(a.at));
}

function groupDetail(g: ErrorGroupRecord): ErrorGroupDetail {
  const total = g.count;
  const latestShare = g.releases.length > 1 ? 0.7 : 1;
  const releases = g.releases
    .slice()
    .reverse()
    .map((release, i) => ({ release, count: Math.round(i === 0 ? total * latestShare : (total * (1 - latestShare)) / (g.releases.length - 1)) }));
  return { ...groupView(g), stack: clone(g.stack), events: eventsOf(g), releases, history: clone(g.history) };
}

/** Keeps busy groups ticking so the mock feels live. */
function advanceErrors() {
  const now = Date.now();
  db.errorGroups.forEach((g) => {
    if (g.status === 'resolved' || g.ratePerHour < 1) return;
    const last = new Date(g.lastSeen).getTime();
    const gap = HOUR / g.ratePerHour;
    const n = Math.floor((now - last) / gap);
    if (n > 0 && now - last < 6 * HOUR) {
      g.count += n;
      g.lastSeen = new Date(last + n * gap).toISOString();
    }
  });
}

/* ───────────── performance ───────────── */

const RANGE: Record<PerfRange, { points: number; stepMs: number }> = {
  '1h': { points: 60, stepMs: MIN },
  '24h': { points: 96, stepMs: 15 * MIN },
  '7d': { points: 84, stepMs: 2 * HOUR },
};

function diurnal(t: number): number {
  const hourIst = (((t / HOUR + 5.5) % 24) + 24) % 24;
  return hourIst >= 6 && hourIst <= 23 ? 0.35 + 0.65 * Math.sin((Math.PI * (hourIst - 6)) / 17) : 0.3;
}

function incidentWeight(p: PerfProfile, kind: 'errors' | 'latency', start: number, end: number): number {
  return p.incidents
    .filter((i) => i.kind === kind)
    .reduce((w, i) => {
      const overlap = Math.min(end, new Date(i.to).getTime()) - Math.max(start, new Date(i.from).getTime());
      return Math.max(w, overlap > 0 ? overlap / (end - start) : 0);
    }, 0);
}

function pointFor(p: PerfProfile, end: number, stepMs: number): PerfPoint {
  const start = end - stepMs;
  const k = keyOf(p.environmentId);
  const n1 = noise(k, Math.floor(end / stepMs));
  const n2 = noise(k + 1, Math.floor(end / stepMs));
  const errW = incidentWeight(p, 'errors', start, end);
  const latW = incidentWeight(p, 'latency', start, end);
  const rpm = p.baseRpm * diurnal(end) * (0.85 + n1 * 0.3) * (1 - errW * 0.5);
  const errorRate = p.baseErr * (0.6 + n2 * 0.8) * (1 - errW) + 34 * errW;
  const p50 = p.p50 * (0.9 + n2 * 0.2) * (1 + latW * 2);
  const p95 = p.p95 * (0.85 + n1 * 0.3) * (1 - latW) + 2600 * latW;
  return { at: new Date(end).toISOString(), rpm: Math.round(rpm * 10) / 10, errorRate: Math.round(errorRate * 100) / 100, p50: Math.round(p50), p95: Math.round(p95) };
}

function summaryOf(p: PerfProfile): PerfSummary {
  const now = Date.now();
  const pt = pointFor(p, Math.floor(now / MIN) * MIN, 5 * MIN);
  return { applicationId: p.applicationId, environmentId: p.environmentId, rpm: pt.rpm, errorRate: pt.errorRate, p95: pt.p95, lastSampleAt: new Date(now - 20_000).toISOString() };
}

function reportOf(p: PerfProfile, range: PerfRange): PerformanceReport {
  const { points, stepMs } = RANGE[range];
  const end = Math.floor(Date.now() / stepMs) * stepMs + stepMs;
  const series = Array.from({ length: points }, (_, i) => pointFor(p, end - (points - 1 - i) * stepMs, stepMs));
  const stepMin = stepMs / MIN;
  const requests = Math.round(series.reduce((n, s) => n + s.rpm * stepMin, 0));
  const weighted = (key: 'errorRate' | 'p50' | 'p95') => series.reduce((acc, s) => acc + s[key] * s.rpm, 0) / Math.max(1, series.reduce((a, s) => a + s.rpm, 0));
  const errW = incidentWeight(p, 'errors', end - points * stepMs, end);
  const latW = incidentWeight(p, 'latency', end - points * stepMs, end);
  const k = keyOf(p.environmentId + range);
  const routes = p.routes
    .map((r, i) => {
      const n = noise(k, i);
      const hit = p.incidents.some((inc) => inc.kind === 'errors' && inc.route === r.route) ? errW : 0;
      const errorRate = r.err * (0.8 + n * 0.4) * (1 - hit) + 72 * hit;
      const p95 = Math.round(r.p95 * (0.9 + n * 0.2) * (1 + latW * 1.5));
      return { method: r.method, route: r.route, requests: Math.round(requests * r.share), errorRate: Math.round(errorRate * 100) / 100, p50: Math.round(r.p50 * (0.9 + n * 0.2)), p95, p99: Math.round(p95 * (1.4 + n * 0.5)) };
    })
    .sort((a, b) => b.requests - a.requests);
  const p95 = Math.round(weighted('p95'));
  return {
    ...summaryOf(p),
    range,
    requests,
    errorRate: Math.round(weighted('errorRate') * 100) / 100,
    p50: Math.round(weighted('p50')),
    p95,
    p99: Math.round(p95 * 1.7),
    series,
    routes,
  };
}

/* ───────────── security events ───────────── */

const ACCOUNTS = ['r***@example.com', 'm***@example.com', 'k***@example.com', 's***@example.com', 'v***@corp.example', 'p***@example.com', 'n***@example.com', 'd***@corp.example'];
const IPS = ['192.0.2.14', '192.0.2.27', '192.0.2.58', '192.0.2.91', '192.0.2.140', '192.0.2.203', '198.51.100.8', '198.51.100.64'];
const LOGIN_ROUTE: Record<string, string> = { a1: '/api/auth/login', a2: '/admin/login', a3: '/api/login', a4: '/api/auth/login' };

/** Normal day-to-day traffic, generated from the clock so it never needs storing. */
function baselineEvents(from: number, to: number): SecurityEvent[] {
  const out: SecurityEvent[] = [];
  const profiles = db.perfProfiles;
  for (let h = Math.floor(from / HOUR); h <= Math.floor(to / HOUR); h++) {
    profiles.forEach((p, pi) => {
      const k = keyOf(p.environmentId);
      const logins = Math.round((p.baseRpm / 12) * diurnal(h * HOUR) * (0.7 + noise(k, h) * 0.6));
      const plan: [SecurityEventType, number][] = [
        ['login_success', logins],
        ['logout', Math.round(logins * 0.4)],
        ['login_failure', Math.round(logins * 0.07 + noise(k + 2, h) * 2)],
        ['authz_failure', Math.round(2 + noise(k + 3, h) * 4)],
        ['rate_limited', noise(k + 4, h) > 0.75 ? 1 : 0],
        ['password_reset', noise(k + 5, h) > 0.85 ? 1 : 0],
        ['admin_action', p.applicationId === 'a2' || p.applicationId === 'a3' ? Math.round(noise(k + 6, h) * 2) : 0],
        ['input_rejected', noise(k + 7, h) > 0.6 ? 1 : 0],
      ];
      plan.forEach(([type, count], ti) => {
        for (let i = 0; i < count; i++) {
          const r = noise(k * 7 + ti, h * 101 + i);
          const at = h * HOUR + Math.floor(r * HOUR);
          if (at < from || at > to) continue;
          const who = Math.floor(noise(k + ti, h + i) * ACCOUNTS.length);
          const failed = type === 'login_failure' || type === 'authz_failure' || type === 'mfa_failure';
          out.push({
            id: `se-${pi}-${h}-${ti}-${i}`,
            at: new Date(at).toISOString(),
            applicationId: p.applicationId,
            environmentId: p.environmentId,
            type,
            actorHash: type === 'login_failure' ? null : `usr_${(keyOf(ACCOUNTS[who]) >>> 8).toString(16).slice(0, 6)}`,
            account: type === 'authz_failure' || type === 'input_rejected' ? null : ACCOUNTS[who],
            ip: IPS[(who + pi) % IPS.length],
            country: 'IN',
            method: type === 'authz_failure' ? 'GET' : 'POST',
            route: type === 'authz_failure' ? p.routes[Math.floor(r * p.routes.length)].route : type === 'rate_limited' ? LOGIN_ROUTE[p.applicationId] : type === 'admin_action' ? '/admin/settings' : type === 'input_rejected' ? p.routes[0].route : LOGIN_ROUTE[p.applicationId],
            status: type === 'authz_failure' ? (r > 0.5 ? 403 : 401) : type === 'login_failure' ? 401 : type === 'rate_limited' ? 429 : type === 'input_rejected' ? 400 : 200,
            result: type === 'rate_limited' ? 'blocked' : failed ? 'failure' : 'success',
          });
        }
      });
    });
  }
  return out;
}

function last24h(): SecurityEvent[] {
  const now = Date.now();
  const from = now - 24 * HOUR;
  return [...baselineEvents(from, now), ...db.securityIncidents.filter((e) => new Date(e.at).getTime() >= from)].sort((a, b) => b.at.localeCompare(a.at));
}

/* ───────────── ingestion keys ───────────── */

function keyView(k: StoredKey) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { live: _l, ...rest } = k;
  return clone({ ...rest, lastUsedAt: k.status === 'active' && k.live ? new Date(Date.now() - 15_000 - (keyOf(k.id) % 40) * 1000).toISOString() : k.lastUsedAt });
}

function newSecret(kind: StoredKey['kind']) {
  const secret = `${kind === 'browser' ? 'so_pub_' : 'so_live_'}${hex(32)}`;
  return { secret, prefix: secret.slice(0, kind === 'browser' ? 11 : 12) };
}

const findKey = (keyId: string) => {
  const k = db.ingestionKeys.find((x) => x.id === keyId);
  if (!k) throw new ApiError(404, 'NOT_FOUND', 'Key not found.');
  return k;
};

/* ───────────── API ───────────── */

export const errorGroupsOpen = () => db.errorGroups.filter((g) => g.status === 'unresolved' || g.status === 'regressed').length;

export function cleanupPhase3(applicationId: string) {
  db.errorGroups = db.errorGroups.filter((x) => x.applicationId !== applicationId);
  db.perfProfiles = db.perfProfiles.filter((x) => x.applicationId !== applicationId);
  db.securityIncidents = db.securityIncidents.filter((x) => x.applicationId !== applicationId);
  db.detections = db.detections.filter((x) => x.applicationId !== applicationId);
  db.ingestionKeys = db.ingestionKeys.filter((x) => x.applicationId !== applicationId);
}

export const phase3Api: Phase3Api = {
  async listErrorGroups(filter = {}) {
    await delay();
    currentUser();
    advanceErrors();
    save();
    const q = filter.search?.trim().toLowerCase();
    return db.errorGroups
      .filter((g) => inScope(g, filter))
      .filter((g) => !filter.status || (filter.status === 'open' ? g.status === 'unresolved' || g.status === 'regressed' : g.status === filter.status))
      .filter((g) => !filter.platform || g.platform === filter.platform)
      .filter((g) => !q || `${g.type} ${g.message} ${g.culprit}`.toLowerCase().includes(q))
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
      .map(groupView);
  },

  async getErrorGroup(groupId) {
    await delay(180);
    currentUser();
    advanceErrors();
    const g = db.errorGroups.find((x) => x.id === groupId);
    if (!g) throw new ApiError(404, 'NOT_FOUND', 'Error group not found.');
    return groupDetail(g);
  },

  async updateErrorGroup(groupId, input) {
    await delay();
    const user = currentUser();
    const g = db.errorGroups.find((x) => x.id === groupId);
    if (!g) throw new ApiError(404, 'NOT_FOUND', 'Error group not found.');
    if (input.status && input.status !== g.status) {
      if (input.status === 'regressed') throw new ApiError(422, 'INVALID_STATUS', 'Only ShieldOps can mark an error as regressed.');
      g.status = input.status;
      g.resolvedAt = input.status === 'resolved' ? nowIso() : g.resolvedAt;
      const text = { resolved: 'Marked resolved', ignored: 'Ignored future events', unresolved: 'Reopened' }[input.status];
      g.history.unshift({ at: nowIso(), actorName: user.name, text });
      audit(`error_group.${input.status}`, 'error_group', g.id, `${text}: ${g.type}: ${g.message}`);
    }
    if (input.assigneeId !== undefined && input.assigneeId !== g.assigneeId) {
      g.assigneeId = input.assigneeId;
      const who = input.assigneeId ? db.users.find((u) => u.id === input.assigneeId)?.name ?? 'someone' : 'nobody';
      g.history.unshift({ at: nowIso(), actorName: user.name, text: `Assigned to ${who}` });
    }
    save();
    return groupDetail(g);
  },

  async listPerformance(filter = {}) {
    await delay();
    currentUser();
    return db.perfProfiles.filter((p) => inScope(p, filter)).map(summaryOf);
  },

  async getPerformance(applicationId, environmentId, range) {
    await delay(220);
    currentUser();
    const p = db.perfProfiles.find((x) => x.applicationId === applicationId && x.environmentId === environmentId);
    if (!p) throw new ApiError(404, 'NO_DATA', 'No performance data for this environment yet. Install the SDK to start sending it.');
    return reportOf(p, range);
  },

  async listSecurityEvents({ page, pageSize, types, result, ip, ...scope }) {
    await delay();
    currentUser();
    const items = last24h().filter(
      (e) => inScope(e, scope) && (!types?.length || types.includes(e.type)) && (!result || e.result === result) && (!ip || e.ip.includes(ip.trim())),
    );
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
  },

  async getSecurityStats(filter = {}) {
    await delay();
    currentUser();
    const now = Date.now();
    const events = last24h().filter((e) => inScope(e, filter));
    const byType = Object.fromEntries(
      (['login_success', 'login_failure', 'logout', 'mfa_failure', 'password_reset', 'authz_failure', 'rate_limited', 'admin_action', 'permission_change', 'input_rejected'] as SecurityEventType[]).map((t) => [t, 0]),
    ) as SecurityStats['byType'];
    const failuresHourly = Array.from({ length: 24 }, () => 0);
    events.forEach((e) => {
      byType[e.type] += 1;
      if (e.result !== 'success') {
        const idx = 23 - Math.floor((now - new Date(e.at).getTime()) / HOUR);
        if (idx >= 0 && idx < 24) failuresHourly[idx] += 1;
      }
    });
    return { byType, failuresHourly, uniqueIps: new Set(events.map((e) => e.ip)).size };
  },

  async listDetections(filter = {}) {
    await delay();
    currentUser();
    return clone(db.detections.filter((d) => inScope(d, filter)).sort((a, b) => b.lastAt.localeCompare(a.lastAt)));
  },

  async listConsoleLogins({ page, pageSize }) {
    await delay();
    currentUser();
    const DETAIL: Record<string, string> = {
      'auth.login': 'Password and two-factor code accepted',
      'auth.login_failed': 'Wrong password or code',
      'auth.mfa_enrolled': 'First sign-in, two-factor set up',
    };
    const items: ConsoleLogin[] = db.auditLogs
      .filter((l) => l.action in DETAIL)
      .map((l) => ({ id: l.id, at: l.at, name: l.actorId ? l.actorName : null, ip: l.ip, result: l.action === 'auth.login_failed' ? 'failed' : 'success', detail: DETAIL[l.action] }));
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
  },

  async listIngestionKeys(filter = {}) {
    await delay();
    currentUser();
    return db.ingestionKeys
      .filter((k) => inScope(k, filter))
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1))
      .map(keyView);
  },

  async createIngestionKey(input) {
    await delay();
    requireReauth();
    const user = currentUser();
    if (!input.name.trim()) throw new ApiError(422, 'NAME_REQUIRED', 'Give the key a name, like "Payments API server".');
    const app = db.applications.find((a) => a.id === input.applicationId);
    if (!app?.environments.some((e) => e.id === input.environmentId)) throw new ApiError(422, 'INVALID_SCOPE', 'Choose an application and environment.');
    const { secret, prefix } = newSecret(input.kind);
    const k: StoredKey = {
      id: id('k'),
      name: input.name.trim(),
      kind: input.kind,
      applicationId: input.applicationId,
      environmentId: input.environmentId,
      prefix,
      scopes: input.kind === 'browser' ? ['errors'] : ['errors', 'performance', 'security_events'],
      status: 'active',
      createdAt: nowIso(),
      createdBy: user.id,
      lastUsedAt: null,
      eventsLast24h: 0,
      revokedAt: null,
      live: false,
    };
    db.ingestionKeys.push(k);
    audit('ingestion_key.create', 'ingestion_key', k.id, `Created ${k.kind} key ${k.name} (${k.prefix}…) for ${app.name}`);
    save();
    return { key: keyView(k), secret };
  },

  async rotateIngestionKey(keyId) {
    await delay();
    requireReauth();
    const k = findKey(keyId);
    if (k.status !== 'active') throw new ApiError(409, 'KEY_REVOKED', 'This key is revoked. Create a new one instead.');
    const { secret, prefix } = newSecret(k.kind);
    const old = k.prefix;
    k.prefix = prefix;
    audit('ingestion_key.rotate', 'ingestion_key', k.id, `Rotated key ${k.name}: ${old}… keeps working for 24 hours, new key ${prefix}…`);
    save();
    return { key: keyView(k), secret };
  },

  async revokeIngestionKey(keyId) {
    await delay();
    requireReauth();
    const k = findKey(keyId);
    k.status = 'revoked';
    k.revokedAt = nowIso();
    k.live = false;
    audit('ingestion_key.revoke', 'ingestion_key', k.id, `Revoked key ${k.name} (${k.prefix}…)`);
    save();
    return keyView(k);
  },
};