import type {
  ErrorGroupStatus,
  SecurityEventType,
  AlertSignal,
  AlertStatus,
  AssetType,
  CheckErrorCode,
  Criticality,
  EnvironmentType,
  FindingStatus,
  HealthState,
  MonitorType,
  Severity,
  SignalSource,
} from '@/types';

const TZ = 'Asia/Kolkata';

const valid = (value: string | null | undefined): value is string => !!value && !Number.isNaN(new Date(value).getTime());

export const formatDateTime = (value: string | null | undefined) =>
  valid(value) ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(new Date(value)) : '—';

export const formatDate = (value: string | null | undefined) =>
  valid(value) ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: TZ }).format(new Date(value)) : '—';

export function timeAgo(value: string | null | undefined): string {
  if (!value) return 'Never';
  const diff = Date.now() - new Date(value).getTime();
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [365 * 864e5, 'year'],
    [30 * 864e5, 'month'],
    [864e5, 'day'],
    [36e5, 'hour'],
    [6e4, 'minute'],
  ];
  for (const [ms, unit] of units) {
    if (abs >= ms) {
      const n = Math.floor(abs / ms);
      const label = `${n} ${unit}${n > 1 ? 's' : ''}`;
      return diff >= 0 ? `${label} ago` : `in ${label}`;
    }
  }
  return 'Just now';
}

export const daysUntil = (value: string) => Math.ceil((new Date(value).getTime() - Date.now()) / 864e5);

export const HEALTH_LABEL: Record<HealthState, string> = {
  up: 'Up',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'Unknown',
  paused: 'Paused',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

export const CRITICALITY_LABEL: Record<Criticality, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const ENV_TYPE_LABEL: Record<EnvironmentType, string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
  custom: 'Custom',
};

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  domain: 'Domain',
  website: 'Website or URL',
  api: 'API',
  server: 'Server',
  cloud: 'Cloud resource',
  database: 'Database',
  repository: 'Repository',
  image: 'Container image',
};

export const ASSET_PLACEHOLDER: Record<AssetType, string> = {
  domain: 'portal.example.com',
  website: 'https://portal.example.com',
  api: 'https://api.example.com/health',
  server: '203.0.113.10 or app1.example.com',
  cloud: 'arn:aws:ec2:ap-south-1:…',
  database: 'postgres://10.0.2.15:5432',
  repository: 'your-org/your-repo',
  image: 'ghcr.io/your-org/app:latest',
};

/* ───────────── Phase 2 ───────────── */


export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  snoozed: 'Snoozed',
  resolved: 'Resolved',
};

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved, awaiting recheck',
  verified: 'Verified fixed',
  reopened: 'Reopened',
  accepted_risk: 'Accepted risk',
  false_positive: 'False positive',
};

export const SOURCE_LABEL: Record<SignalSource, string> = {
  uptime: 'Uptime',
  heartbeat: 'Heartbeat',
  ssl: 'SSL',
  dns: 'DNS',
  domain: 'Domain expiry',
  headers: 'Security headers',
  errors: 'Errors',
  performance: 'API performance',
  security_events: 'Security events',
  infrastructure: 'Servers',
  database: 'Databases',
  secrets: 'Secret scan',
  vulnerabilities: 'Vulnerability scan',
  cloud: 'Cloud posture',
  identity: 'Identity',
  anomaly: 'Anomaly detection',
};

export const MONITOR_TYPE_LABEL: Record<MonitorType, string> = {
  http: 'HTTP',
  tcp: 'TCP port',
  dns: 'DNS',
};

export const CHECK_ERROR_LABEL: Record<CheckErrorCode, string> = {
  TIMEOUT: 'Timed out',
  DNS_ERROR: 'DNS lookup failed',
  TLS_ERROR: 'TLS handshake failed',
  CONNECTION_REFUSED: 'Connection refused',
  UNEXPECTED_STATUS: 'Unexpected status code',
  KEYWORD_MISSING: 'Keyword not found',
  WORKER_ERROR: 'ShieldOps could not run the check',
};

export const SIGNAL_LABEL: Record<AlertSignal, string> = {
  uptime_down: 'Monitor down',
  latency_p95: 'Slow responses (p95)',
  heartbeat_missed: 'Heartbeat missed',
  ssl_expiry: 'SSL certificate expiring',
  domain_expiry: 'Domain expiring',
  dns_change: 'DNS records changed',
  headers_missing: 'Security headers missing',
  error_new: 'New error group',
  error_regression: 'Error came back after being resolved',
  error_spike: 'Error spike',
  error_rate: 'High 5xx error rate',
  traffic_drop: 'Traffic dropped to zero',
  failed_logins: 'Repeated failed logins',
  credential_stuffing: 'Credential stuffing',
  auth_failure_spike: '401/403 spike',
  cpu_high: 'High CPU',
  memory_high: 'High memory',
  disk_high: 'Disk filling up',
  agent_offline: 'Server stopped reporting',
  process_down: 'Service or container down',
  db_down: 'Database not responding',
  secret_found: 'Secret found in code',
  vuln_found: 'Serious vulnerability found',
  vuln_exploited: 'Known-exploited vulnerability',
  scan_failed: 'Scans keep failing',
  anomaly: 'Unusual pattern',
};

export function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round((seconds / 3600) * 10) / 10} h`;
  return `${Math.round(seconds / 86400)} d`;
}

export const formatMs = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;

export const formatPercent = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);

/** Minutes, hours or days between two times, for durations like "down for 7 min". */
export function durationBetween(from: string, to: string = new Date().toISOString()): string {
  const ms = Math.max(0, new Date(to).getTime() - new Date(from).getTime());
  return formatInterval(Math.round(ms / 1000));
}

export const isPast = (value: string) => new Date(value).getTime() <= Date.now();

/* ───────────── Phase 3 ───────────── */

export const ERROR_STATUS_LABEL: Record<ErrorGroupStatus, string> = {
  unresolved: 'Unresolved',
  regressed: 'Regressed',
  resolved: 'Resolved',
  ignored: 'Ignored',
};

export const SECURITY_EVENT_LABEL: Record<SecurityEventType, string> = {
  login_success: 'Login',
  login_failure: 'Failed login',
  logout: 'Logout',
  mfa_failure: 'Failed MFA',
  password_reset: 'Password reset',
  authz_failure: '401/403 response',
  rate_limited: 'Rate limited',
  admin_action: 'Admin action',
  permission_change: 'Permission change',
  input_rejected: 'Rejected input',
};

export const formatCount = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

/* ───────────── Phase 4 ───────────── */

export const DB_ENGINE_LABEL: Record<'postgresql' | 'mysql' | 'mongodb' | 'redis', string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  redis: 'Redis',
};

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d) return `${d} d ${h} h`;
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

export const formatKbps = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v >= 1024 ? `${(v / 1024).toFixed(1)} Mbps` : `${Math.round(v)} kbps`;

/* ───────────── Phase 5 ───────────── */

export const SCAN_STATUS_LABEL: Record<'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled', string> = {
  queued: 'Queued',
  running: 'Scanning',
  completed: 'Completed',
  partial: 'Partly completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const SCANNER_LABEL: Record<'gitleaks' | 'osv' | 'trivy', string> = { gitleaks: 'Gitleaks', osv: 'OSV', trivy: 'Trivy' };

/* ───────────── Phase 6 ───────────── */

export const INCIDENT_STATUS_LABEL: Record<'new' | 'acknowledged' | 'investigating' | 'remediating' | 'resolved' | 'closed' | 'reopened', string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  investigating: 'Investigating',
  remediating: 'Remediation in progress',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'Reopened',
};

export const TASK_STATUS_LABEL: Record<'todo' | 'in_progress' | 'ready_for_verification' | 'verified' | 'wont_fix', string> = {
  todo: 'To do',
  in_progress: 'In progress',
  ready_for_verification: 'Verifying',
  verified: 'Verified',
  wont_fix: "Won't fix",
};

export const CHANNEL_LABEL: Record<'in_app' | 'email' | 'slack' | 'webhook', string> = { in_app: 'In-app', email: 'Email', slack: 'Slack', webhook: 'Webhook' };

/* ───────────── Phase 7 ───────────── */

export const REPORT_TYPE_LABEL: Record<'posture' | 'health' | 'vulnerabilities' | 'ssl_domains' | 'incidents' | 'compliance', { name: string; about: string }> = {
  posture: { name: 'Security posture', about: 'One-page overview for management: health, open risk, incidents and SLA.' },
  health: { name: 'Application health and uptime', about: 'Uptime, downtime events, response times and error trends per application.' },
  vulnerabilities: { name: 'Vulnerabilities and secrets', about: 'Open CVEs, known-exploited issues and exposed secrets, masked.' },
  ssl_domains: { name: 'SSL and domains', about: 'Certificates and domain registrations with expiry dates.' },
  incidents: { name: 'Incidents and remediation', about: 'Incidents, time to acknowledge and resolve, and SLA compliance.' },
  compliance: { name: 'Compliance readiness', about: 'How your controls map to the frameworks you track.' },
};

export const CONTROL_STATUS_LABEL: Record<'met' | 'partial' | 'not_met' | 'manual', string> = {
  met: 'Met',
  partial: 'Partly met',
  not_met: 'Not met',
  manual: 'Needs your evidence',
};

/** Whole minutes until a future time; 0 once it has passed. */
export const minutesUntil = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 60_000));