import { ApiError } from '../errors';
import { emptyDb, seedDb, type MockDb } from './seed';

/** Bump when the mock data shape changes so old browser data is replaced. */
const DB_KEY = 'shieldops.mock.db.v8';
const SESSION_KEY = 'shieldops.mock.session.v1';

export const MIN = 60_000;
export const DAY = 86_400_000;

export const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));
export const id = (p: string) => `${p}${Math.random().toString(36).slice(2, 10)}`;
export const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
export const nowIso = () => new Date().toISOString();
export const clone = <T,>(v: T): T => structuredClone(v);

function loadDb(): MockDb {
  ['shieldops.mock.db.v1', 'shieldops.mock.db.v2', 'shieldops.mock.db.v3', 'shieldops.mock.db.v4', 'shieldops.mock.db.v5', 'shieldops.mock.db.v6', 'shieldops.mock.db.v7'].forEach((k) => localStorage.removeItem(k));
  const raw = localStorage.getItem(DB_KEY);
  if (raw) return JSON.parse(raw) as MockDb;
  const fresh = import.meta.env.VITE_MOCK_FRESH === 'true';
  return fresh ? emptyDb() : seedDb();
}

export const db = loadDb();
export const save = () => localStorage.setItem(DB_KEY, JSON.stringify(db));

type MockSession = { userId: string; reauthUntil: string | null };
const loadSession = (): MockSession | null => {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as MockSession) : null;
};

export const state: { session: MockSession | null } = { session: loadSession() };
export const saveSession = () =>
  state.session ? localStorage.setItem(SESSION_KEY, JSON.stringify(state.session)) : localStorage.removeItem(SESSION_KEY);

export function currentUser() {
  if (!state.session) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  const user = db.users.find((u) => u.id === state.session!.userId && u.status === 'active');
  if (!user) {
    state.session = null;
    saveSession();
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }
  return user;
}

export function requireReauth() {
  currentUser();
  if (!state.session?.reauthUntil || new Date(state.session.reauthUntil).getTime() < Date.now()) {
    throw new ApiError(403, 'REAUTH_REQUIRED', 'Confirm your identity to continue.');
  }
}

export function audit(action: string, resourceType: string, resourceId: string | null, summary: string) {
  const actor = state.session ? db.users.find((u) => u.id === state.session!.userId) : undefined;
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

export function findApp(appId: string) {
  const app = db.applications.find((a) => a.id === appId);
  if (!app) throw new ApiError(404, 'NOT_FOUND', 'Application not found.');
  return app;
}

export function resetMockData() {
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem(SESSION_KEY);
  window.location.assign('/');
}