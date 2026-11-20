import { ApiError } from '../errors';
import type { MonitorFilter, ShieldOpsApi } from '../contract';
import type { AgentToken, DbCheck, HealthState, PerfRange, Server, ServerDetail, ServerPoint, ServerUsage } from '@/types';
import { isAuthorized } from '@/lib/assets';
import { audit, clone, currentUser, db, delay, hex, id, nowIso, requireReauth, save } from './core';
import type { DbCheckRecord, ServerRecord } from './seed4';

type Phase4Keys =
  | 'listServers' | 'getServer' | 'getServerMetrics' | 'removeServer'
  | 'listDbChecks' | 'createDbCheck' | 'runDbCheck' | 'setDbCheckPaused' | 'deleteDbCheck'
  | 'listAgentTokens' | 'createAgentToken' | 'rotateAgentToken' | 'revokeAgentToken';

export type Phase4Api = Pick<ShieldOpsApi, Phase4Keys>;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function noise(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
const keyOf = (s: string) => Array.from(s).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 7);
const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const inScope = (x: { applicationId: string; environmentId: string }, f: MonitorFilter = {}) =>
  (!f.applicationId || x.applicationId === f.applicationId) && (!f.environmentId || x.environmentId === f.environmentId);

function busy(t: number): number {
  const hourIst = (((t / HOUR + 5.5) % 24) + 24) % 24;
  return hourIst >= 7 && hourIst <= 22 ? 0.6 + 0.4 * Math.sin((Math.PI * (hourIst - 7)) / 15) : 0.55;
}

/* ───────────── servers ───────────── */

function usageAt(s: ServerRecord, t: number, stepMs: number): ServerUsage {
  const k = keyOf(s.id);
  const b = Math.floor(t / stepMs);
  const n1 = noise(k, b);
  const n2 = noise(k + 1, b);
  // A spike counts if it overlaps this sample's window, so coarse 15-minute and 2-hour points still show it.
  const spike = s.profile.cpuSpike && t >= Date.parse(s.profile.cpuSpike.from) && t - stepMs <= Date.parse(s.profile.cpuSpike.to);
  const cpu = spike ? 93 + n1 * 5 : clamp(s.profile.cpu * (0.6 + 0.4 * busy(t)) / 0.8 + (n1 - 0.5) * 14);
  const memory = clamp(s.profile.memory + (n2 - 0.5) * 6);
  const disk = clamp(s.profile.disk - (s.profile.diskPerDay * (Date.now() - t)) / DAY, 5, 99.5);
  return {
    cpu: round1(cpu),
    memory: round1(memory),
    disk: round1(disk),
    load1: round1((cpu / 100) * s.cpuCores * (0.85 + n2 * 0.3)),
    netInKbps: Math.round(s.profile.netIn * busy(t) * (0.7 + n1 * 0.6)),
    netOutKbps: Math.round(s.profile.netOut * busy(t) * (0.7 + n2 * 0.6)),
  };
}

function lastSeen(s: ServerRecord): number {
  return s.offlineSince ? Date.parse(s.offlineSince) : Date.now() - 15_000 - (keyOf(s.id) % 25) * 1000;
}

function serverView(s: ServerRecord): Server {
  const seen = lastSeen(s);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { profile: _p, bootedAt, offlineSince, createdAt: _c, kernel: _k, disks: _d, events: _e, ...rest } = s;
  return clone({
    ...rest,
    status: offlineSince ? 'offline' : 'online',
    lastSeenAt: new Date(seen).toISOString(),
    uptimeSec: Math.round((seen - Date.parse(bootedAt)) / 1000),
    usage: usageAt(s, seen, MIN),
  });
}

function serverDetail(s: ServerRecord): ServerDetail {
  const disk = usageAt(s, lastSeen(s), MIN).disk;
  return {
    ...serverView(s),
    kernel: s.kernel,
    // The root volume follows the live disk figure; other volumes keep their stored size.
    disks: s.disks.map((d, i) => (i === 0 ? { ...d, usedGb: round1((disk / 100) * d.totalGb) } : d)),
    events: clone(s.events),
  };
}

const RANGE: Record<PerfRange, { points: number; stepMs: number }> = {
  '1h': { points: 60, stepMs: MIN },
  '24h': { points: 96, stepMs: 15 * MIN },
  '7d': { points: 84, stepMs: 2 * HOUR },
};

function metricsOf(s: ServerRecord, range: PerfRange): ServerPoint[] {
  const { points, stepMs } = RANGE[range];
  const end = Math.floor(Date.now() / stepMs) * stepMs + stepMs;
  const off = s.offlineSince ? Date.parse(s.offlineSince) : Infinity;
  return Array.from({ length: points }, (_, i) => {
    const t = end - (points - 1 - i) * stepMs;
    if (t - stepMs > off) return { at: new Date(t).toISOString(), cpu: null, memory: null, disk: null, load1: null, netInKbps: null, netOutKbps: null };
    return { at: new Date(t).toISOString(), ...usageAt(s, Math.min(t, Date.now()), stepMs) };
  });
}

/* ───────────── databases ───────────── */

function dbLatency(d: DbCheckRecord): (number | null)[] {
  const k = keyOf(d.id);
  const b = Math.floor(Date.now() / (d.intervalSec * 1000));
  return Array.from({ length: 30 }, (_, i) => {
    const n = noise(k, b - 29 + i);
    if (d.sim === 'down' && i >= 26) return null;
    if (d.sim === 'slow' && i >= 22) return Math.round(1050 + n * 380);
    return Math.max(1, Math.round(d.baseLatency * (0.75 + n * 0.8)));
  });
}

function dbView(d: DbCheckRecord): DbCheck {
  const latency = d.paused ? [] : dbLatency(d);
  const last = latency.at(-1) ?? null;
  const status: HealthState = d.paused ? 'paused' : last === null && latency.length ? 'down' : last !== null && last >= 1000 ? 'degraded' : latency.length ? 'up' : 'unknown';
  const error = status === 'down' ? 'Connection refused' : status === 'degraded' ? `Responding slowly: connect and ping took ${(last! / 1000).toFixed(1)} s` : null;
  const step = d.intervalSec * 1000;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { baseLatency: _b, sim: _s, createdAt: _c, ...rest } = d;
  const stats = d.stats ? { ...d.stats, connections: Math.round(d.stats.connections * (0.85 + noise(keyOf(d.id), Math.floor(Date.now() / step)) * 0.3)) } : null;
  return clone({
    ...rest,
    stats,
    status,
    latency,
    error,
    lastCheckAt: d.paused ? null : new Date(Math.floor(Date.now() / step) * step).toISOString(),
    lastLatencyMs: last,
  });
}

const findDb = (checkId: string) => {
  const d = db.dbChecks.find((x) => x.id === checkId);
  if (!d) throw new ApiError(404, 'NOT_FOUND', 'Database check not found.');
  return d;
};

/* ───────────── agent tokens ───────────── */

function tokenView(tk: AgentToken): AgentToken {
  const servers = db.servers.filter((s) => s.agentTokenId === tk.id);
  const seen = servers.map(lastSeen).sort((a, b) => b - a)[0];
  return clone({ ...tk, servers: servers.length, lastSeenAt: tk.status === 'active' && seen ? new Date(seen).toISOString() : tk.lastSeenAt });
}

const newAgentSecret = () => {
  const secret = `so_agent_${hex(32)}`;
  return { secret, prefix: secret.slice(0, 13) };
};

const findToken = (tokenId: string) => {
  const tk = db.agentTokens.find((x) => x.id === tokenId);
  if (!tk) throw new ApiError(404, 'NOT_FOUND', 'Agent token not found.');
  return tk;
};

/* ───────────── API ───────────── */

export function cleanupPhase4(applicationId: string) {
  db.servers = db.servers.filter((x) => x.applicationId !== applicationId);
  db.dbChecks = db.dbChecks.filter((x) => x.applicationId !== applicationId);
  db.agentTokens = db.agentTokens.filter((x) => x.applicationId !== applicationId);
}

export const cleanupPhase4Asset = (assetId: string) => {
  db.dbChecks = db.dbChecks.filter((x) => x.assetId !== assetId);
};

export const phase4Api: Phase4Api = {
  async listServers(filter = {}) {
    await delay();
    currentUser();
    return db.servers
      .filter((s) => inScope(s, filter))
      .map(serverView)
      .sort((a, b) => (a.status === b.status ? a.hostname.localeCompare(b.hostname) : a.status === 'offline' ? -1 : 1));
  },

  async getServer(serverId) {
    await delay(180);
    currentUser();
    const s = db.servers.find((x) => x.id === serverId);
    if (!s) throw new ApiError(404, 'NOT_FOUND', 'Server not found.');
    return serverDetail(s);
  },

  async getServerMetrics(serverId, range) {
    await delay(200);
    currentUser();
    const s = db.servers.find((x) => x.id === serverId);
    if (!s) throw new ApiError(404, 'NOT_FOUND', 'Server not found.');
    return metricsOf(s, range);
  },

  async removeServer(serverId) {
    await delay();
    requireReauth();
    const s = db.servers.find((x) => x.id === serverId);
    if (!s) throw new ApiError(404, 'NOT_FOUND', 'Server not found.');
    db.servers = db.servers.filter((x) => x.id !== serverId);
    audit('server.remove', 'server', serverId, `Removed server ${s.hostname} from ShieldOps`);
    save();
  },

  async listDbChecks(filter = {}) {
    await delay();
    currentUser();
    return db.dbChecks.filter((d) => inScope(d, filter)).map(dbView);
  },

  async createDbCheck(input) {
    await delay(600);
    currentUser();
    if (!input.name.trim()) throw new ApiError(422, 'NAME_REQUIRED', 'Give the check a name.');
    const asset = db.assets.find((a) => a.id === input.assetId);
    if (!asset || asset.type !== 'database') throw new ApiError(422, 'NOT_A_DATABASE', 'Choose a database asset.');
    if (!isAuthorized(asset.authorization)) throw new ApiError(422, 'ASSET_NOT_AUTHORIZED', 'Verify or approve this database before checking it.');
    if (!input.host.trim() || !(input.port > 0 && input.port < 65536)) throw new ApiError(422, 'INVALID_ADDRESS', 'Enter a host and a port between 1 and 65535.');
    if (!input.username.trim() || !input.password) throw new ApiError(422, 'CREDENTIALS_REQUIRED', 'Enter the read-only username and password.');
    if (db.dbChecks.some((d) => d.host === input.host.trim() && d.port === input.port && d.database === input.database.trim())) {
      throw new ApiError(409, 'DUPLICATE_CHECK', 'This database is already being checked.');
    }
    const d: DbCheckRecord = {
      id: id('db'),
      name: input.name.trim(),
      engine: input.engine,
      applicationId: asset.applicationId,
      environmentId: asset.environmentId,
      assetId: asset.id,
      host: input.host.trim(),
      port: input.port,
      database: input.database.trim(),
      username: input.username.trim(),
      credentialsSet: true,
      intervalSec: input.intervalSec,
      paused: false,
      baseLatency: asset.exposure === 'internal' ? 4 : 35,
      sim: 'up',
      createdAt: nowIso(),
      stats: null,
    };
    db.dbChecks.push(d);
    audit('db_check.create', 'db_check', d.id, `Started checking ${d.engine} database ${d.name} as ${d.username} (password stored encrypted)`);
    save();
    return dbView(d);
  },

  async runDbCheck(checkId) {
    await delay(700);
    currentUser();
    return dbView(findDb(checkId));
  },

  async setDbCheckPaused(checkId, paused) {
    await delay();
    currentUser();
    const d = findDb(checkId);
    d.paused = paused;
    audit(paused ? 'db_check.pause' : 'db_check.resume', 'db_check', d.id, `${paused ? 'Paused' : 'Resumed'} database check ${d.name}`);
    save();
    return dbView(d);
  },

  async deleteDbCheck(checkId) {
    await delay();
    requireReauth();
    const d = findDb(checkId);
    db.dbChecks = db.dbChecks.filter((x) => x.id !== checkId);
    audit('db_check.delete', 'db_check', checkId, `Deleted database check ${d.name} and its stored credentials`);
    save();
  },

  async listAgentTokens(filter = {}) {
    await delay();
    currentUser();
    return db.agentTokens
      .filter((tk) => inScope(tk, filter))
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1))
      .map(tokenView);
  },

  async createAgentToken(input) {
    await delay();
    requireReauth();
    const user = currentUser();
    if (!input.name.trim()) throw new ApiError(422, 'NAME_REQUIRED', 'Give the token a name.');
    const app = db.applications.find((a) => a.id === input.applicationId);
    if (!app?.environments.some((e) => e.id === input.environmentId)) throw new ApiError(422, 'INVALID_SCOPE', 'Choose an application and environment.');
    const { secret, prefix } = newAgentSecret();
    const tk: AgentToken = { id: id('at'), name: input.name.trim(), applicationId: input.applicationId, environmentId: input.environmentId, prefix, status: 'active', createdAt: nowIso(), createdBy: user.id, servers: 0, lastSeenAt: null, revokedAt: null };
    db.agentTokens.push(tk);
    audit('agent_token.create', 'agent_token', tk.id, `Created agent token ${tk.name} (${prefix}…) for ${app.name}`);
    save();
    return { token: tokenView(tk), secret };
  },

  async rotateAgentToken(tokenId) {
    await delay();
    requireReauth();
    const tk = findToken(tokenId);
    if (tk.status !== 'active') throw new ApiError(409, 'TOKEN_REVOKED', 'This token is revoked. Create a new one instead.');
    const { secret, prefix } = newAgentSecret();
    const old = tk.prefix;
    tk.prefix = prefix;
    audit('agent_token.rotate', 'agent_token', tk.id, `Rotated agent token ${tk.name}: ${old}… keeps working for 24 hours, new token ${prefix}…`);
    save();
    return { token: tokenView(tk), secret };
  },

  async revokeAgentToken(tokenId) {
    await delay();
    requireReauth();
    const tk = findToken(tokenId);
    tk.status = 'revoked';
    tk.revokedAt = nowIso();
    tk.lastSeenAt = tokenView(tk).lastSeenAt;
    db.servers.forEach((s) => {
      if (s.agentTokenId === tk.id && !s.offlineSince) s.offlineSince = nowIso();
    });
    audit('agent_token.revoke', 'agent_token', tk.id, `Revoked agent token ${tk.name} (${tk.prefix}…)`);
    save();
    return tokenView(tk);
  },
};