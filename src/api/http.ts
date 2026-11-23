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

  listMonitors: (f = {}) => request('GET', `/monitors${qs({ ...f })}`),
  getMonitor: (id) => request('GET', `/monitors/${id}`),
  createMonitor: (input) => request('POST', '/monitors', input),
  updateMonitor: (id, input) => request('PATCH', `/monitors/${id}`, input),
  setMonitorPaused: (id, paused) => request('PATCH', `/monitors/${id}/paused`, { paused }),
  runMonitorNow: (id) => request('POST', `/monitors/${id}/run`),
  deleteMonitor: (id) => request('DELETE', `/monitors/${id}`),

  listHeartbeats: (f = {}) => request('GET', `/heartbeats${qs({ ...f })}`),
  createHeartbeat: (input) => request('POST', '/heartbeats', input),
  setHeartbeatPaused: (id, paused) => request('PATCH', `/heartbeats/${id}/paused`, { paused }),
  deleteHeartbeat: (id) => request('DELETE', `/heartbeats/${id}`),

  listCertificates: (f = {}) => request('GET', `/checks/ssl${qs({ ...f })}`),
  listDnsSnapshots: (f = {}) => request('GET', `/checks/dns${qs({ ...f })}`),
  listDomainExpiry: (f = {}) => request('GET', `/checks/domain-expiry${qs({ ...f })}`),
  listHeaderReports: (f = {}) => request('GET', `/checks/headers${qs({ ...f })}`),
  recheckAsset: (assetId) => request('POST', `/assets/${assetId}/recheck`),

  listAlerts: (f = {}) => request('GET', `/alerts${qs({ ...f })}`),
  acknowledgeAlert: (id) => request('POST', `/alerts/${id}/acknowledge`),
  snoozeAlert: (id, minutes) => request('POST', `/alerts/${id}/snooze`, { minutes }),
  resolveAlert: (id) => request('POST', `/alerts/${id}/resolve`),

  listFindings: (f = {}) => request('GET', `/findings${qs({ ...f })}`),
  getFinding: (id) => request('GET', `/findings/${id}`),
  updateFinding: (id, input) => request('PATCH', `/findings/${id}`, input),

  listAlertRules: () => request('GET', '/alert-rules'),
  createAlertRule: (input) => request('POST', '/alert-rules', input),
  updateAlertRule: (id, input) => request('PATCH', `/alert-rules/${id}`, input),
  deleteAlertRule: (id) => request('DELETE', `/alert-rules/${id}`),

  getChannels: () => request('GET', '/notification-channels'),
  updateChannels: (input) => request('PUT', '/notification-channels', input),

  listMaintenanceWindows: () => request('GET', '/maintenance-windows'),
  createMaintenanceWindow: (input) => request('POST', '/maintenance-windows', input),
  deleteMaintenanceWindow: (id) => request('DELETE', `/maintenance-windows/${id}`),

  listErrorGroups: (f = {}) => request('GET', `/error-groups${qs({ ...f })}`),
  getErrorGroup: (id) => request('GET', `/error-groups/${id}`),
  updateErrorGroup: (id, input) => request('PATCH', `/error-groups/${id}`, input),

  listPerformance: (f = {}) => request('GET', `/performance${qs({ ...f })}`),
  getPerformance: (applicationId, environmentId, range) => request('GET', `/performance/${applicationId}/${environmentId}${qs({ range })}`),

  listSecurityEvents: ({ types, ...f }) => request('GET', `/security-events${qs({ ...f, types: types?.join(',') })}`),
  getSecurityStats: (f = {}) => request('GET', `/security-events/stats${qs({ ...f })}`),
  listDetections: (f = {}) => request('GET', `/detections${qs({ ...f })}`),
  listConsoleLogins: (q) => request('GET', `/auth/sign-ins${qs({ ...q })}`),

  listIngestionKeys: (f = {}) => request('GET', `/ingestion-keys${qs({ ...f })}`),
  createIngestionKey: (input) => request('POST', '/ingestion-keys', input),
  rotateIngestionKey: (id) => request('POST', `/ingestion-keys/${id}/rotate`),
  revokeIngestionKey: (id) => request('POST', `/ingestion-keys/${id}/revoke`),

  listServers: (f = {}) => request('GET', `/servers${qs({ ...f })}`),
  getServer: (id) => request('GET', `/servers/${id}`),
  getServerMetrics: (id, range) => request('GET', `/servers/${id}/metrics${qs({ range })}`),
  removeServer: (id) => request('DELETE', `/servers/${id}`),

  listDbChecks: (f = {}) => request('GET', `/db-checks${qs({ ...f })}`),
  createDbCheck: (input) => request('POST', '/db-checks', input),
  runDbCheck: (id) => request('POST', `/db-checks/${id}/run`),
  setDbCheckPaused: (id, paused) => request('PATCH', `/db-checks/${id}/paused`, { paused }),
  deleteDbCheck: (id) => request('DELETE', `/db-checks/${id}`),

  listAgentTokens: (f = {}) => request('GET', `/agent-tokens${qs({ ...f })}`),
  createAgentToken: (input) => request('POST', '/agent-tokens', input),
  rotateAgentToken: (id) => request('POST', `/agent-tokens/${id}/rotate`),
  revokeAgentToken: (id) => request('POST', `/agent-tokens/${id}/revoke`),

  listIntegrations: () => request('GET', '/integrations'),
  connectIntegration: (type, credentials) => request('POST', `/integrations/${type}/connect`, credentials ?? {}),
  disconnectIntegration: (type) => request('POST', `/integrations/${type}/disconnect`),

  listRepositories: (f = {}) => request('GET', `/repositories${qs({ ...f })}`),
  getRepository: (id) => request('GET', `/repositories/${id}`),
  listAvailableRepositories: () => request('GET', '/repositories/available'),
  addRepositories: (input) => request('POST', '/repositories', input),
  updateRepository: (id, input) => request('PATCH', `/repositories/${id}`, input),
  removeRepository: (id) => request('DELETE', `/repositories/${id}`),

  listImages: (f = {}) => request('GET', `/images${qs({ ...f })}`),
  addImage: (input) => request('POST', '/images', input),
  removeImage: (id) => request('DELETE', `/images/${id}`),

  listScans: (targetType, targetId) => request('GET', `/scans${qs({ targetType, targetId })}`),
  startScan: (targetType, targetId) => request('POST', '/scans', { targetType, targetId }),
  listDependencies: (f = {}) => request('GET', `/dependencies${qs({ ...f })}`),

  listIncidents: (f = {}) => request('GET', `/incidents${qs({ ...f })}`),
  getIncident: (id) => request('GET', `/incidents/${id}`),
  createIncident: (input) => request('POST', '/incidents', input),
  updateIncident: (id, input) => request('PATCH', `/incidents/${id}`, input),
  linkToIncident: (id, item) => request('POST', `/incidents/${id}/links`, item),
  unlinkFromIncident: (id, item) => request('DELETE', `/incidents/${id}/links/${item.type}/${item.id}`),

  listTasks: (f = {}) => request('GET', `/remediation-tasks${qs({ ...f, overdue: f.overdue ? 'true' : undefined })}`),
  createTask: (input) => request('POST', '/remediation-tasks', input),
  updateTask: (id, input) => request('PATCH', `/remediation-tasks/${id}`, input),
  getSlaSummary: (f = {}) => request('GET', `/sla${qs({ ...f })}`),

  testIntegration: (type) => request('POST', `/integrations/${type}/test`),

  aiAsk: (input) => request('POST', '/ai/ask', input),

  listRecommendations: (f = {}) => request('GET', `/recommendations${qs({ ...f, includeDismissed: f.includeDismissed ? 'true' : undefined })}`),
  dismissRecommendation: (id, reason) => request('POST', `/recommendations/${id}/dismiss`, { reason }),
  restoreRecommendation: (id) => request('POST', `/recommendations/${id}/restore`),

  listReports: () => request('GET', '/reports'),
  generateReport: (input) => request('POST', '/reports', input),
  getReport: (id) => request('GET', `/reports/${id}`),
  downloadReportPdf: (id) => request('GET', `/reports/${id}/pdf`),
  listReportSchedules: () => request('GET', '/report-schedules'),
  createReportSchedule: (input) => request('POST', '/report-schedules', input),
  deleteReportSchedule: (id) => request('DELETE', `/report-schedules/${id}`),

  listFrameworks: () => request('GET', '/compliance/frameworks'),
  setFrameworkEnabled: (id, enabled) => request('PATCH', `/compliance/frameworks/${id}`, { enabled }),
  getCompliance: (id) => request('GET', `/compliance/frameworks/${id}/controls`),
  attestControl: (id, controlId, input) => request('PUT', `/compliance/frameworks/${id}/controls/${controlId}/attestation`, input),

  getSsoConfig: () => request('GET', '/auth/sso/config'),
  ssoLogin: async (provider) => {
    // The backend answers with the identity provider URL; the browser leaves and comes back to /auth/sso/callback.
    const { redirectUrl } = await request<{ redirectUrl: string }>('POST', `/auth/sso/${provider}/start`);
    window.location.assign(redirectUrl);
    return new Promise(() => {});
  },

  listReleases: (f = {}) => request('GET', `/releases${qs({ ...f })}`),
  searchLogs: ({ levels, ...q }) => request('GET', `/logs${qs({ ...q, levels: levels?.join(',') })}`),

  listProbes: () => request('GET', '/probes'),
  createProbe: (input) => request('POST', '/probes', input),
  removeProbe: (id) => request('DELETE', `/probes/${id}`),
  getProbeResults: (monitorId) => request('GET', `/monitors/${monitorId}/probe-results`),

  discoverAssets: (source) => request('GET', `/asset-import/${source}`),
  importAssets: (input) => request('POST', `/asset-import/${input.source}`, input),
  listCloudChecks: () => request('GET', '/cloud-checks'),

  createJiraIssue: (target) => request('POST', '/integrations/jira/issues', target),

  listEscalationPolicies: () => request('GET', '/escalation-policies'),
  saveEscalationPolicy: (input) => (input.id ? request('PUT', `/escalation-policies/${input.id}`, input) : request('POST', '/escalation-policies', input)),
  deleteEscalationPolicy: (id) => request('DELETE', `/escalation-policies/${id}`),
  listAlertEscalations: () => request('GET', '/alerts/escalations'),

  listAnomalies: (f = {}) => request('GET', `/anomalies${qs({ ...f })}`),
};