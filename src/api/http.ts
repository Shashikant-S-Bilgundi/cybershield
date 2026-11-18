import { ApiError } from './errors';
import type { ShieldOpsApi } from './contract';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('application/json') ? await res.json() : await res.blob();

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } }).error;
    throw new ApiError(
      res.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Request failed with status ${res.status}`,
      err?.details,
    );
  }
  return data as T;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
};

/**
 * REST endpoints the backend must implement.
 * Errors: JSON { error: { code, message, details? } }.
 * Critical actions: 403 { error: { code: 'REAUTH_REQUIRED' } } when the re-auth window has expired.
 */
export const httpApi: ShieldOpsApi = {
  setupStatus: () => request('GET', '/setup/status'),
  setup: (input) => request('POST', '/setup', input),
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  verifyMfa: (challengeId, code) => request('POST', '/auth/mfa/verify', { challengeId, code }),
  me: async () => {
    try {
      return await request('GET', '/auth/me');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },
  logout: () => request('POST', '/auth/logout'),
  reauth: (input) => request('POST', '/auth/reauth', input),
  getInvite: (token) => request('GET', `/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token, input) => request('POST', `/invites/${encodeURIComponent(token)}/accept`, input),

  dashboard: () => request('GET', '/dashboard'),

  listApplications: () => request('GET', '/applications'),
  getApplication: (id) => request('GET', `/applications/${id}`),
  createApplication: (input) => request('POST', '/applications', input),
  updateApplication: (id, input) => request('PATCH', `/applications/${id}`, input),
  setApplicationStatus: (id, status) => request('PATCH', `/applications/${id}/status`, { status }),
  deleteApplication: (id) => request('DELETE', `/applications/${id}`),

  listAssets: (f = {}) => request('GET', `/assets${qs({ ...f })}`),
  createAsset: (input) => request('POST', '/assets', input),
  verifyAsset: (id) => request('POST', `/assets/${id}/verify`),
  approveAsset: (id, justification) => request('POST', `/assets/${id}/approve`, { justification }),
  setAssetStatus: (id, status) => request('PATCH', `/assets/${id}/status`, { status }),
  deleteAsset: (id) => request('DELETE', `/assets/${id}`),

  listUsers: () => request('GET', '/users'),
  listInvites: () => request('GET', '/invites'),
  inviteUser: (email) => request('POST', '/invites', { email }),
  revokeInvite: (id) => request('DELETE', `/invites/${id}`),
  setUserStatus: (id, status) => request('PATCH', `/users/${id}/status`, { status }),
  removeUser: (id) => request('DELETE', `/users/${id}`),

  listAuditLogs: (q) => request('GET', `/audit-logs${qs({ ...q })}`),
  exportAuditLogs: (q) => request('POST', '/audit-logs/export', q),

  getSettings: () => request('GET', '/settings'),
  updateSettings: (input) => request('PATCH', '/settings', input),
};