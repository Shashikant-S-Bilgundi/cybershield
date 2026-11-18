import { ApiError } from '../errors';
import type { ShieldOpsApi } from '../contract';
import type { Application, ApplicationHealth, Asset, DashboardSummary, HealthState, LoginResult, Session, User } from '@/types';
import { emptyDb, seedDb, type MockDb } from './seed';
import { hostOf, ipInCidr, isIPv4 } from '@/lib/net';

const DB_KEY = 'shieldops.mock.db.v1';
const SESSION_KEY = 'shieldops.mock.session.v1';
const REAUTH_MINUTES = 10;
const DAY = 86_400_000;

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const id = (p: string) => `${p}${Math.random().toString(36).slice(2, 10)}`;
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const nowIso = () => new Date().toISOString();
const clone = <T,>(v: T): T => structuredClone(v);

function loadDb(): MockDb {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) return JSON.parse(raw) as MockDb;
  const fresh = import.meta.env.VITE_MOCK_FRESH === 'true';
  return fresh ? emptyDb() : seedDb();
}

const db = loadDb();
const save = () => localStorage.setItem(DB_KEY, JSON.stringify(db));

type MockSession = { userId: string; reauthUntil: string | null };
const loadSession = (): MockSession | null => {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as MockSession) : null;
};
let session = loadSession();
const saveSession = () =>
  session ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY);

const challenges = new Map<string, { userId: string; enroll: boolean }>();

const publicUser = (u: MockDb['users'][number]): User => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _p, ...rest } = u;
  return clone(rest);
};

function currentUser() {
  if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  const user = db.users.find((u) => u.id === session!.userId && u.status === 'active');
  if (!user) {
    session = null;
    saveSession();
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }
  return user;
}

function requireReauth() {
  currentUser();
  if (!session?.reauthUntil || new Date(session.reauthUntil).getTime() < Date.now()) {
    throw new ApiError(403, 'REAUTH_REQUIRED', 'Confirm your identity to continue.');
  }
}

function audit(action: string, resourceType: string, resourceId: string | null, summary: string) {
  const actor = session ? db.users.find((u) => u.id === session!.userId) : undefined;
  db.auditLogs.unshift({
    id: id('l'),
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? 'System',
    action,
    resourceType,
    resourceId,
    summary,
    ip: '127.0.0.1',
    at: nowIso(),
  });
}

const validCode = (code: string) => /^\d{6}$/.test(code) && code !== '000000';

function startChallenge(userId: string, enroll: boolean): LoginResult {
  const challengeId = id('c');
  challenges.set(challengeId, { userId, enroll });
  if (!enroll) return { status: 'mfa_required', challengeId };
  const secret = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]).join('');
  const user = db.users.find((u) => u.id === userId)!;
  return {
    status: 'mfa_enroll',
    challengeId,
    enrollment: {
      secret,
      otpauthUrl: `otpauth://totp/ShieldOps:${encodeURIComponent(user.email)}?secret=${secret}&issuer=ShieldOps`,
    },
  };
}

function findApp(appId: string) {
  const app = db.applications.find((a) => a.id === appId);
  if (!app) throw new ApiError(404, 'NOT_FOUND', 'Application not found.');
  return app;
}

function healthFor(app: Application): ApplicationHealth {
  const prod = app.environments.find((e) => e.type === 'production') ?? app.environments[0];
  const ticks = prod ? db.health[prod.id] ?? [] : [];
  const last = ticks.at(-1)?.state ?? 'unknown';
  const counted = ticks.filter((t) => t.state !== 'unknown' && t.state !== 'paused');
  const good = counted.filter((t) => t.state !== 'down').length;
  return {
    applicationId: app.id,
    environmentId: prod?.id ?? '',
    state: app.status === 'archived' ? 'paused' : last,
    uptime30d: counted.length ? Math.round((good / counted.length) * 10000) / 100 : null,
    ticks: clone(ticks),
  };
}

function validateIdentifier(type: Asset['type'], identifier: string) {
  const v = identifier.trim();
  const ok: Record<Asset['type'], boolean> = {
    domain: /^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(v),
    website: /^https?:\/\/\S+$/i.test(v),
    api: /^https?:\/\/\S+$/i.test(v),
    server: isIPv4(v) || /^([a-z0-9-]+\.)+[a-z]{2,63}$/i.test(v),
    cloud: v.length >= 3,
    database: /^[a-z]+(\+[a-z]+)?:\/\/\S+$/i.test(v),
    repository: /^[\w.-]+\/[\w.-]+$/.test(v),
    image: /^[\w.\-/:@]+$/.test(v),
  };
  if (!ok[type]) throw new ApiError(422, 'INVALID_IDENTIFIER', 'That identifier does not match the asset type.');
}

export const mockApi: ShieldOpsApi = {
  async setupStatus() {
    await delay(150);
    return { needsSetup: db.users.length === 0 };
  },

  async setup({ name, email, password }) {
    await delay();
    if (db.users.length > 0) throw new ApiError(409, 'ALREADY_SET_UP', 'ShieldOps is already set up.');
    const user = { id: id('u'), name, email: email.toLowerCase(), password, status: 'active' as const, mfaEnabled: false, lastLoginAt: null, invitedBy: null, createdAt: nowIso() };
    db.users.push(user);
    save();
    return startChallenge(user.id, true);
  },

  async login(email, password) {
    await delay();
    const user = db.users.find((u) => u.email === email.toLowerCase().trim());
    if (!user || user.password !== password || user.status !== 'active') {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    return startChallenge(user.id, !user.mfaEnabled);
  },

  async verifyMfa(challengeId, code) {
    await delay();
    const ch = challenges.get(challengeId);
    if (!ch) throw new ApiError(400, 'CHALLENGE_EXPIRED', 'This sign-in attempt expired. Start again.');
    if (!validCode(code)) throw new ApiError(401, 'INVALID_CODE', 'That code is not valid. Check your authenticator app.');
    challenges.delete(challengeId);
    const user = db.users.find((u) => u.id === ch.userId)!;
    user.mfaEnabled = true;
    user.lastLoginAt = nowIso();
    session = { userId: user.id, reauthUntil: new Date(Date.now() + REAUTH_MINUTES * 60_000).toISOString() };
    saveSession();
    audit(ch.enroll ? 'auth.mfa_enrolled' : 'auth.login', 'session', null, ch.enroll ? 'Enrolled MFA and signed in' : 'Signed in');
    save();
    return { user: publicUser(user), reauthUntil: session.reauthUntil };
  },

  async me(): Promise<Session | null> {
    await delay(120);
    if (!session) return null;
    try {
      return { user: publicUser(currentUser()), reauthUntil: session.reauthUntil };
    } catch {
      return null;
    }
  },

  async logout() {
    await delay(100);
    if (session) audit('auth.logout', 'session', null, 'Signed out');
    session = null;
    saveSession();
    save();
  },

  async reauth({ password, code }) {
    await delay();
    const user = currentUser();
    const ok = (password && password === user.password) || (code && validCode(code));
    if (!ok) throw new ApiError(401, 'INVALID_REAUTH', 'That password or code is not correct.');
    session!.reauthUntil = new Date(Date.now() + REAUTH_MINUTES * 60_000).toISOString();
    saveSession();
    audit('auth.reauth', 'session', null, 'Re-authenticated for a critical action');
    save();
    return { reauthUntil: session!.reauthUntil };
  },

  async getInvite(token) {
    await delay();
    const inv = db.invites.find((i) => i.token === token);
    if (!inv || new Date(inv.expiresAt).getTime() < Date.now()) {
      throw new ApiError(404, 'INVITE_INVALID', 'This invite link is invalid or has expired. Ask a teammate for a new one.');
    }
    return { email: inv.email, expiresAt: inv.expiresAt };
  },

  async acceptInvite(token, { name, password }) {
    await delay();
    const inv = db.invites.find((i) => i.token === token);
    if (!inv) throw new ApiError(404, 'INVITE_INVALID', 'This invite link is invalid or has expired.');
    const user = { id: id('u'), name, email: inv.email, password, status: 'active' as const, mfaEnabled: false, lastLoginAt: null, invitedBy: inv.invitedBy, createdAt: nowIso() };
    db.users.push(user);
    db.invites = db.invites.filter((i) => i.id !== inv.id);
    save();
    return startChallenge(user.id, true);
  },

  async dashboard(): Promise<DashboardSummary> {
    await delay();
    currentUser();
    const active = db.applications.filter((a) => a.status === 'active');
    const healthByApp = active.map(healthFor);
    const health: Record<HealthState, number> = { up: 0, degraded: 0, down: 0, unknown: 0, paused: 0 };
    healthByApp.forEach((h) => (health[h.state] += 1));
    const t = Date.now();
    const expiryDays: Record<string, [number | null, 'ssl' | 'domain']> = {
      s1: [12, 'ssl'],
      s5: [41, 'domain'],
      s13: [5, 'ssl'],
      s11: [null, 'domain'],
    };
    const expiries = db.assets
      .filter((a) => expiryDays[a.id])
      .map((a) => {
        const [days, kind] = expiryDays[a.id];
        return {
          assetId: a.id,
          applicationId: a.applicationId,
          kind,
          identifier: hostOf(a.identifier),
          expiresAt: days === null ? null : new Date(t + days * DAY).toISOString(),
        };
      });
    return {
      applications: active.length,
      health,
      openAlerts: 3,
      activeIncidents: 1,
      findingsBySeverity: { critical: 1, high: 4, medium: 9, low: 6, info: 3 },
      errorGroupsOpen: 12,
      expiries,
      healthByApp,
    };
  },

  async listApplications() {
    await delay();
    currentUser();
    return clone(db.applications);
  },

  async getApplication(appId) {
    await delay(150);
    currentUser();
    return clone(findApp(appId));
  },

  async createApplication(input) {
    await delay();
    currentUser();
    if (db.applications.some((a) => a.name.toLowerCase() === input.name.trim().toLowerCase())) {
      throw new ApiError(409, 'DUPLICATE_NAME', 'An application with this name already exists.');
    }
    const appId = id('a');
    const app: Application = {
      id: appId,
      name: input.name.trim(),
      description: input.description.trim(),
      ownerId: input.ownerId,
      memberIds: [input.ownerId],
      criticality: input.criticality,
      techStack: input.techStack,
      tags: input.tags,
      status: 'active',
      environments: input.environments.map((e) => ({ id: id('e'), applicationId: appId, ...e })),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.applications.push(app);
    audit('application.create', 'application', app.id, `Created application ${app.name}`);
    save();
    return clone(app);
  },

  async updateApplication(appId, input) {
    await delay();
    currentUser();
    const app = findApp(appId);
    const { environments, ...rest } = input;
    Object.assign(app, rest, { updatedAt: nowIso() });
    if (environments) {
      const kept = app.environments.filter((e) => environments.some((n) => n.name === e.name));
      const added = environments
        .filter((n) => !app.environments.some((e) => e.name === n.name))
        .map((n) => ({ id: id('e'), applicationId: app.id, ...n }));
      const removed = app.environments.filter((e) => !kept.includes(e));
      if (removed.some((e) => db.assets.some((a) => a.environmentId === e.id))) {
        throw new ApiError(409, 'ENVIRONMENT_IN_USE', 'Move or delete the assets in an environment before removing it.');
      }
      app.environments = [...kept, ...added];
    }
    audit('application.update', 'application', app.id, `Updated application ${app.name}`);
    save();
    return clone(app);
  },

  async setApplicationStatus(appId, status) {
    await delay();
    currentUser();
    const app = findApp(appId);
    app.status = status;
    app.updatedAt = nowIso();
    audit(status === 'archived' ? 'application.archive' : 'application.restore', 'application', app.id, `${status === 'archived' ? 'Archived' : 'Restored'} application ${app.name}`);
    save();
    return clone(app);
  },

  async deleteApplication(appId) {
    await delay();
    requireReauth();
    const app = findApp(appId);
    db.applications = db.applications.filter((a) => a.id !== appId);
    db.assets = db.assets.filter((a) => a.applicationId !== appId);
    audit('application.delete', 'application', appId, `Deleted application ${app.name} (restorable for 30 days)`);
    save();
  },

  async listAssets(filter = {}) {
    await delay();
    currentUser();
    return clone(
      db.assets.filter(
        (a) =>
          (!filter.applicationId || a.applicationId === filter.applicationId) &&
          (!filter.environmentId || a.environmentId === filter.environmentId) &&
          (!filter.type || a.type === filter.type),
      ),
    );
  },

  async createAsset(input) {
    await delay();
    const user = currentUser();
    validateIdentifier(input.type, input.identifier);
    const identifier = input.identifier.trim();
    if (db.assets.some((a) => a.type === input.type && a.identifier.toLowerCase() === identifier.toLowerCase())) {
      throw new ApiError(409, 'DUPLICATE_ASSET', 'This asset is already registered.');
    }
    findApp(input.applicationId);
    let authorization: Asset['authorization'];
    switch (input.authorizationMethod) {
      case 'dns_txt':
        authorization = { status: 'pending', method: 'dns_txt', token: `shieldops-verify=${hex(10)}` };
        break;
      case 'html_file':
        authorization = { status: 'pending', method: 'html_file', token: `shieldops-verify-${hex(4)}.html` };
        break;
      case 'approval':
        if (!input.justification?.trim()) throw new ApiError(422, 'JUSTIFICATION_REQUIRED', 'Write why this asset is authorized for monitoring.');
        authorization = { status: 'approved', method: 'approval', justification: input.justification.trim(), approvedBy: user.id, at: nowIso() };
        break;
      default: {
        const host = hostOf(identifier);
        const inList = isIPv4(host) && db.settings.internalAllowlist.some((r) => ipInCidr(host, r.cidr));
        if (!inList) {
          throw new ApiError(422, 'NOT_IN_ALLOWLIST', `${host} is not inside the Internal Network Allowlist. Add its range in System settings first.`);
        }
        authorization = { status: 'verified', method: 'internal_allowlist', at: nowIso() };
      }
    }
    const asset: Asset = {
      id: id('s'),
      type: input.type,
      identifier,
      label: input.label.trim() || identifier,
      applicationId: input.applicationId,
      environmentId: input.environmentId,
      exposure: input.exposure,
      shared: false,
      status: 'active',
      authorization,
      createdAt: nowIso(),
    };
    db.assets.push(asset);
    audit('asset.create', 'asset', asset.id, `Registered ${asset.type} ${asset.identifier}`);
    save();
    return clone(asset);
  },

  async verifyAsset(assetId) {
    await delay(700);
    currentUser();
    const asset = db.assets.find((a) => a.id === assetId);
    if (!asset) throw new ApiError(404, 'NOT_FOUND', 'Asset not found.');
    asset.authorization = { ...asset.authorization, status: 'verified', at: nowIso() };
    audit('asset.verify', 'asset', asset.id, `Verified ownership of ${asset.identifier}`);
    save();
    return clone(asset);
  },

  async approveAsset(assetId, justification) {
    await delay();
    const user = currentUser();
    const asset = db.assets.find((a) => a.id === assetId);
    if (!asset) throw new ApiError(404, 'NOT_FOUND', 'Asset not found.');
    if (!justification.trim()) throw new ApiError(422, 'JUSTIFICATION_REQUIRED', 'Write why this asset is authorized for monitoring.');
    asset.authorization = { status: 'approved', method: 'approval', justification: justification.trim(), approvedBy: user.id, at: nowIso() };
    audit('asset.approve', 'asset', asset.id, `Approved ${asset.identifier}: ${justification.trim()}`);
    save();
    return clone(asset);
  },

  async setAssetStatus(assetId, status) {
    await delay();
    currentUser();
    const asset = db.assets.find((a) => a.id === assetId);
    if (!asset) throw new ApiError(404, 'NOT_FOUND', 'Asset not found.');
    asset.status = status;
    audit(`asset.${status === 'paused' ? 'pause' : 'resume'}`, 'asset', asset.id, `${status === 'paused' ? 'Paused' : 'Resumed'} monitoring for ${asset.identifier}`);
    save();
    return clone(asset);
  },

  async deleteAsset(assetId) {
    await delay();
    requireReauth();
    const asset = db.assets.find((a) => a.id === assetId);
    if (!asset) throw new ApiError(404, 'NOT_FOUND', 'Asset not found.');
    db.assets = db.assets.filter((a) => a.id !== assetId);
    audit('asset.delete', 'asset', assetId, `Deleted ${asset.identifier} (restorable for 30 days)`);
    save();
  },

  async listUsers() {
    await delay();
    currentUser();
    return db.users.map(publicUser);
  },

  async listInvites() {
    await delay();
    currentUser();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return db.invites.map(({ token: _t, ...rest }) => clone(rest));
  },

  async inviteUser(email) {
    await delay();
    requireReauth();
    const user = currentUser();
    const clean = email.trim().toLowerCase();
    if (db.users.some((u) => u.email === clean)) throw new ApiError(409, 'USER_EXISTS', 'A user with this email already exists.');
    if (db.invites.some((i) => i.email === clean)) throw new ApiError(409, 'INVITE_EXISTS', 'This email already has a pending invite.');
    const token = hex(24);
    const invite = { id: id('i'), email: clean, invitedBy: user.id, token, expiresAt: new Date(Date.now() + 3 * DAY).toISOString(), createdAt: nowIso() };
    db.invites.push(invite);
    audit('user.invite', 'user', null, `Invited ${clean}`);
    save();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token: _t, ...rest } = invite;
    return { ...rest, link: `${window.location.origin}/invite/${token}` };
  },

  async revokeInvite(inviteId) {
    await delay();
    currentUser();
    const inv = db.invites.find((i) => i.id === inviteId);
    db.invites = db.invites.filter((i) => i.id !== inviteId);
    if (inv) audit('user.invite_revoke', 'user', null, `Revoked invite for ${inv.email}`);
    save();
  },

  async setUserStatus(userId, status) {
    await delay();
    requireReauth();
    const me = currentUser();
    const target = db.users.find((u) => u.id === userId);
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'User not found.');
    if (target.id === me.id) throw new ApiError(409, 'SELF_ACTION', 'You cannot disable your own account.');
    if (status === 'disabled' && db.users.filter((u) => u.status === 'active').length <= 1) {
      throw new ApiError(409, 'LAST_ACTIVE_USER', 'ShieldOps needs at least one active user.');
    }
    target.status = status;
    audit(`user.${status === 'disabled' ? 'disable' : 'enable'}`, 'user', target.id, `${status === 'disabled' ? 'Disabled' : 'Re-enabled'} ${target.name}`);
    save();
    return publicUser(target);
  },

  async removeUser(userId) {
    await delay();
    requireReauth();
    const me = currentUser();
    const target = db.users.find((u) => u.id === userId);
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'User not found.');
    if (target.id === me.id) throw new ApiError(409, 'SELF_ACTION', 'You cannot remove your own account.');
    if (target.status === 'active' && db.users.filter((u) => u.status === 'active').length <= 1) {
      throw new ApiError(409, 'LAST_ACTIVE_USER', 'ShieldOps needs at least one active user.');
    }
    db.users = db.users.filter((u) => u.id !== userId);
    audit('user.remove', 'user', userId, `Removed ${target.name}`);
    save();
  },

  async listAuditLogs({ page, pageSize, search, resourceType, from, to }) {
    await delay();
    currentUser();
    const q = search?.toLowerCase().trim();
    const items = db.auditLogs.filter(
      (l) =>
        (!q || `${l.actorName} ${l.action} ${l.summary} ${l.ip}`.toLowerCase().includes(q)) &&
        (!resourceType || l.resourceType === resourceType) &&
        (!from || l.at >= from) &&
        (!to || l.at <= to),
    );
    return { items: clone(items.slice((page - 1) * pageSize, page * pageSize)), total: items.length, page, pageSize };
  },

  async exportAuditLogs(query) {
    await delay();
    requireReauth();
    const { items } = await mockApi.listAuditLogs({ ...query, page: 1, pageSize: 100_000 });
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [['time', 'actor', 'action', 'resource', 'summary', 'ip'], ...items.map((l) => [l.at, l.actorName, l.action, l.resourceType, l.summary, l.ip])];
    audit('audit.export', 'audit', null, `Exported ${items.length} audit records`);
    save();
    return new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  },

  async getSettings() {
    await delay();
    currentUser();
    return clone(db.settings);
  },

  async updateSettings(input) {
    await delay();
    requireReauth();
    const { smtp, ...rest } = input;
    Object.assign(db.settings, clone(rest));
    if (smtp) {
      const { password, ...smtpRest } = smtp;
      Object.assign(db.settings.smtp, smtpRest);
      if (password) db.settings.smtp.passwordSet = true;
    }
    audit('settings.update', 'settings', null, `Changed ${Object.keys(input).join(', ')} settings`);
    save();
    return clone(db.settings);
  },
};

/** Clears mock data and session; used by the "Reset demo data" button in development. */
export function resetMockData() {
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem(SESSION_KEY);
  window.location.assign('/');
}