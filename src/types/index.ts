export type ID = string;

export type Criticality = 'critical' | 'high' | 'medium' | 'low';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type HealthState = 'up' | 'degraded' | 'down' | 'unknown' | 'paused';
export type EnvironmentType = 'production' | 'staging' | 'development' | 'custom';

export interface User {
  id: ID;
  name: string;
  email: string;
  status: 'active' | 'disabled';
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  invitedBy: ID | null;
  createdAt: string;
}

export interface Invite {
  id: ID;
  email: string;
  invitedBy: ID;
  expiresAt: string;
  createdAt: string;
}

export interface Session {
  user: User;
  reauthUntil: string | null;
}

export interface Environment {
  id: ID;
  applicationId: ID;
  name: string;
  type: EnvironmentType;
}

export interface Application {
  id: ID;
  name: string;
  description: string;
  ownerId: ID;
  memberIds: ID[];
  criticality: Criticality;
  techStack: string[];
  tags: string[];
  status: 'active' | 'archived';
  environments: Environment[];
  createdAt: string;
  updatedAt: string;
}

export type AssetType =
  | 'domain'
  | 'website'
  | 'api'
  | 'server'
  | 'cloud'
  | 'database'
  | 'repository'
  | 'image';

export type AuthorizationMethod = 'dns_txt' | 'html_file' | 'approval' | 'internal_allowlist';

export interface AssetAuthorization {
  status: 'pending' | 'verified' | 'approved' | 'failed';
  method: AuthorizationMethod;
  token?: string;
  justification?: string;
  approvedBy?: ID;
  at?: string;
}

export interface Asset {
  id: ID;
  type: AssetType;
  identifier: string;
  label: string;
  applicationId: ID;
  environmentId: ID;
  exposure: 'internet' | 'internal';
  shared: boolean;
  status: 'active' | 'paused' | 'archived';
  authorization: AssetAuthorization;
  createdAt: string;
}

export interface HealthTick {
  at: string;
  state: HealthState;
  latencyMs: number | null;
}

export interface ApplicationHealth {
  applicationId: ID;
  environmentId: ID;
  state: HealthState;
  uptime30d: number | null;
  ticks: HealthTick[];
}

export interface ExpiryItem {
  assetId: ID;
  applicationId: ID;
  kind: 'ssl' | 'domain';
  identifier: string;
  expiresAt: string | null;
}

export interface DashboardSummary {
  applications: number;
  health: Record<HealthState, number>;
  openAlerts: number;
  activeIncidents: number;
  findingsBySeverity: Record<Severity, number>;
  errorGroupsOpen: number;
  expiries: ExpiryItem[];
  healthByApp: ApplicationHealth[];
}

export interface AuditLog {
  id: ID;
  actorId: ID | null;
  actorName: string;
  action: string;
  resourceType: string;
  resourceId: ID | null;
  summary: string;
  ip: string;
  at: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SystemSettings {
  timezone: string;
  monitoring: {
    uptimeIntervalSec: number;
    downAfterFailures: number;
    sslCheckHours: number;
    dnsCheckHours: number;
  };
  retention: {
    checkResultsDays: number;
    metricSamplesDays: number;
    errorEventsDays: number;
    securityEventsDays: number;
    auditLogsDays: number;
  };
  smtp: {
    host: string;
    port: number;
    username: string;
    fromAddress: string;
    passwordSet: boolean;
  };
  internalAllowlist: { cidr: string; note: string }[];
  ai: AiSettings;
  sso: SsoSettings;
}

export interface SsoSettings {
  enabled: boolean;
  provider: 'google' | 'entra';
  /** Only accounts from this domain may sign in through SSO. */
  domain: string;
  clientId: string;
  clientSecretSet: boolean;
  /** Keep email and password as a break-glass route when the identity provider is down. */
  allowPasswordFallback: boolean;
}

export interface AiSettings {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'azure_openai';
  model: string;
  /** Explicit approval to send sanitized evidence to the provider. */
  shareApproved: boolean;
}

export interface MfaEnrollment {
  secret: string;
  otpauthUrl: string;
}

export type LoginResult =
  | { status: 'mfa_required'; challengeId: string }
  | { status: 'mfa_enroll'; challengeId: string; enrollment: MfaEnrollment };

/* ───────────── Phase 2: availability monitoring ───────────── */

export type MonitorType = 'http' | 'tcp' | 'dns';
export type CheckStatus = 'up' | 'degraded' | 'down' | 'unknown';
export type CheckErrorCode =
  | 'TIMEOUT'
  | 'DNS_ERROR'
  | 'TLS_ERROR'
  | 'CONNECTION_REFUSED'
  | 'UNEXPECTED_STATUS'
  | 'KEYWORD_MISSING'
  | 'WORKER_ERROR';

export interface Monitor {
  id: ID;
  name: string;
  type: MonitorType;
  applicationId: ID;
  environmentId: ID;
  assetId: ID;
  /** URL for http, host:port for tcp, hostname for dns */
  target: string;
  intervalSec: number;
  timeoutMs: number;
  downAfterFailures: number;
  expectedStatus?: string;
  keyword?: string;
  recordType?: 'A' | 'AAAA' | 'CNAME' | 'MX';
  status: HealthState;
  paused: boolean;
  lastCheckAt: string | null;
  lastLatencyMs: number | null;
  uptime: { d1: number | null; d7: number | null; d30: number | null };
  createdAt: string;
}

export interface CheckResult {
  at: string;
  status: CheckStatus;
  latencyMs: number | null;
  statusCode?: number;
  error?: CheckErrorCode;
}

export interface MonitorEvent {
  at: string;
  from: HealthState;
  to: HealthState;
  reason: string;
}

export interface MonitorDetail extends Monitor {
  results: CheckResult[];
  events: MonitorEvent[];
}

export type HeartbeatStatus = 'new' | 'up' | 'late' | 'down' | 'paused';

export interface HeartbeatPing {
  at: string;
  kind: 'start' | 'success' | 'fail';
  late: boolean;
}

export interface Heartbeat {
  id: ID;
  name: string;
  applicationId: ID;
  environmentId: ID;
  schedule: { kind: 'interval'; seconds: number } | { kind: 'cron'; expression: string };
  graceSec: number;
  status: HeartbeatStatus;
  lastPingAt: string | null;
  nextDueAt: string | null;
  pingUrl: string;
  recent: HeartbeatPing[];
  createdAt: string;
}

export interface Certificate {
  assetId: ID;
  applicationId: ID;
  host: string;
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  chainValid: boolean | null;
  hostnameMatch: boolean | null;
  protocol: string | null;
  weakCiphers: boolean;
  checkedAt: string;
  error?: CheckErrorCode;
}

export interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'CAA';
  value: string;
  ttl: number;
}

export interface DnsChange {
  at: string;
  type: DnsRecord['type'];
  before: string[];
  after: string[];
}

export interface DnsSnapshot {
  assetId: ID;
  applicationId: ID;
  host: string;
  records: DnsRecord[];
  checkedAt: string;
  changes: DnsChange[];
}

export interface DomainExpiry {
  assetId: ID;
  applicationId: ID;
  domain: string;
  registrar: string | null;
  expiresAt: string | null;
  source: 'rdap' | 'whois' | 'unavailable';
  checkedAt: string;
}

export type SecurityHeaderName =
  | 'strict-transport-security'
  | 'content-security-policy'
  | 'x-frame-options'
  | 'x-content-type-options'
  | 'referrer-policy'
  | 'permissions-policy';

export interface HeaderReport {
  assetId: ID;
  applicationId: ID;
  environmentId: ID;
  url: string;
  checkedAt: string;
  headers: Record<SecurityHeaderName, { present: boolean; value?: string; issue?: string }>;
}

export type AlertChannel = 'in_app' | 'email' | 'slack' | 'webhook';

export type SignalSource =
  | 'uptime'
  | 'heartbeat'
  | 'ssl'
  | 'dns'
  | 'domain'
  | 'headers'
  | 'errors'
  | 'performance'
  | 'security_events'
  | 'infrastructure'
  | 'database'
  | 'secrets'
  | 'vulnerabilities'
  | 'cloud'
  | 'identity'
  | 'anomaly';
export type AlertStatus = 'open' | 'acknowledged' | 'snoozed' | 'resolved';

export interface AlertDelivery {
  channel: AlertChannel;
  recipient: string;
  status: 'sent' | 'failed' | 'pending';
  at: string;
  attempts: number;
}

export interface Alert {
  id: ID;
  title: string;
  message: string;
  severity: Severity;
  status: AlertStatus;
  source: SignalSource;
  applicationId: ID;
  environmentId: ID;
  assetId: ID | null;
  ruleId: ID | null;
  firstAt: string;
  lastAt: string;
  occurrences: number;
  acknowledgedBy: ID | null;
  acknowledgedAt: string | null;
  snoozedUntil: string | null;
  resolvedAt: string | null;
  autoResolved: boolean;
  deliveries: AlertDelivery[];
}

export type FindingStatus =
  | 'open'
  | 'acknowledged'
  | 'in_progress'
  | 'resolved'
  | 'verified'
  | 'reopened'
  | 'accepted_risk'
  | 'false_positive';

export type Confidence = 'confirmed' | 'likely' | 'possible';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

export interface Finding {
  id: ID;
  title: string;
  description: string;
  category: 'security' | 'availability' | 'performance' | 'configuration';
  source: SignalSource;
  applicationId: ID;
  environmentId: ID;
  assetId: ID;
  severity: Severity;
  confidence: Confidence;
  knownExploited: boolean;
  riskScore: number;
  priority: Priority;
  status: FindingStatus;
  assigneeId: ID | null;
  dueAt: string | null;
  evidence: { label: string; value: string }[];
  firstSeen: string;
  lastSeen: string;
  acceptedRisk: { justification: string; expiresAt: string; by: ID; at: string } | null;
  history: { at: string; actorName: string; text: string }[];
  /** A ticket in another system, e.g. Jira. */
  externalRef?: ExternalRef;
  /** Extra detail for findings from code and image scans. */
  code?: SecretDetail | VulnDetail;
}

export interface SecretDetail {
  kind: 'secret';
  rule: string;
  /** Only the first and last few characters; the full value is never stored. */
  masked: string;
  file: string;
  line: number;
  commit: string;
  author: string;
  committedAt: string;
  inCurrentCode: boolean;
}

export interface VulnDetail {
  kind: 'vuln';
  vulnId: string;
  aliases: string[];
  package: string;
  ecosystem: 'npm' | 'alpine' | 'debian' | 'pypi' | 'go';
  installed: string;
  fixedIn: string | null;
  cvss: number | null;
  sources: ('osv' | 'trivy')[];
  targetType: 'repository' | 'image';
  targetName: string;
}

export type AlertSignal =
  | 'uptime_down'
  | 'latency_p95'
  | 'heartbeat_missed'
  | 'ssl_expiry'
  | 'domain_expiry'
  | 'dns_change'
  | 'headers_missing'
  | 'error_new'
  | 'error_regression'
  | 'error_spike'
  | 'error_rate'
  | 'traffic_drop'
  | 'failed_logins'
  | 'credential_stuffing'
  | 'auth_failure_spike'
  | 'cpu_high'
  | 'memory_high'
  | 'disk_high'
  | 'agent_offline'
  | 'process_down'
  | 'db_down'
  | 'secret_found'
  | 'vuln_found'
  | 'vuln_exploited'
  | 'scan_failed'
  | 'anomaly';

export interface AlertRule {
  id: ID;
  name: string;
  signal: AlertSignal;
  /** Meaning depends on the signal: failures, ms, or days left. */
  threshold: number | null;
  durationMin: number | null;
  severity: Severity;
  scope: { applicationId: ID | null; environmentType: EnvironmentType | null };
  channels: AlertChannel[];
  enabled: boolean;
  builtIn: boolean;
}

export interface MaintenanceWindow {
  id: ID;
  title: string;
  applicationId: ID | null;
  environmentId: ID | null;
  startsAt: string;
  endsAt: string;
  createdBy: ID;
}

export interface NotificationChannels {
  emailRecipients: string[];
  criticalRenotifyMin: number;
  maxRenotify: number;
}

/* ───────────── Phase 3: application telemetry ───────────── */

export type ErrorPlatform = 'node' | 'browser' | 'react-native';
export type ErrorGroupStatus = 'unresolved' | 'resolved' | 'ignored' | 'regressed';

export interface StackFrame {
  file: string;
  fn: string;
  line: number;
  column: number;
  inApp: boolean;
  /** The source line, when the SDK or a source map provides it. */
  code?: string;
}

export interface ErrorGroup {
  id: ID;
  applicationId: ID;
  environmentId: ID;
  fingerprint: string;
  type: string;
  message: string;
  culprit: string;
  platform: ErrorPlatform;
  status: ErrorGroupStatus;
  firstSeen: string;
  lastSeen: string;
  count: number;
  usersAffected: number;
  assigneeId: ID | null;
  lastRelease: string;
  resolvedAt: string | null;
  /** Events per hour for the last 24 hours, oldest first. */
  trend: number[];
}

export interface ErrorEvent {
  id: ID;
  groupId: ID;
  at: string;
  release: string;
  message: string;
  request: { method: string; route: string; status: number } | null;
  userHash: string | null;
  tags: Record<string, string>;
}

export interface ErrorGroupDetail extends ErrorGroup {
  stack: StackFrame[];
  events: ErrorEvent[];
  releases: { release: string; count: number }[];
  history: { at: string; actorName: string; text: string }[];
}

export type PerfRange = '1h' | '24h' | '7d';

export interface PerfPoint {
  at: string;
  rpm: number;
  errorRate: number;
  p50: number;
  p95: number;
}

export interface RouteStat {
  method: string;
  route: string;
  requests: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface PerfSummary {
  applicationId: ID;
  environmentId: ID;
  rpm: number;
  errorRate: number;
  p95: number;
  lastSampleAt: string | null;
}

export interface PerformanceReport extends PerfSummary {
  range: PerfRange;
  requests: number;
  p50: number;
  p99: number;
  series: PerfPoint[];
  routes: RouteStat[];
}

export type SecurityEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'mfa_failure'
  | 'password_reset'
  | 'authz_failure'
  | 'rate_limited'
  | 'admin_action'
  | 'permission_change'
  | 'input_rejected';

export interface SecurityEvent {
  id: ID;
  at: string;
  applicationId: ID;
  environmentId: ID;
  type: SecurityEventType;
  /** Hashed user id from the app; ShieldOps never stores the raw id. */
  actorHash: string | null;
  /** Masked account name, e.g. r***@example.com */
  account: string | null;
  ip: string;
  country: string | null;
  method: string | null;
  route: string | null;
  status: number | null;
  result: 'success' | 'failure' | 'blocked';
}

export type DetectionRule = 'failed_logins' | 'credential_stuffing' | 'auth_failure_spike' | 'unusual_volume';

export interface Detection {
  id: ID;
  rule: DetectionRule;
  applicationId: ID;
  environmentId: ID;
  subject: string;
  count: number;
  distinctAccounts: number | null;
  windowMin: number;
  firstAt: string;
  lastAt: string;
  alertId: ID | null;
}

export interface SecurityStats {
  byType: Record<SecurityEventType, number>;
  /** Failures (login, MFA, 401/403) per hour for the last 24 hours. */
  failuresHourly: number[];
  uniqueIps: number;
}

export interface ConsoleLogin {
  id: ID;
  at: string;
  name: string | null;
  ip: string;
  result: 'success' | 'failed';
  detail: string;
}

export interface IngestionKey {
  id: ID;
  name: string;
  kind: 'server' | 'browser';
  applicationId: ID;
  environmentId: ID;
  prefix: string;
  scopes: ('errors' | 'performance' | 'security_events')[];
  status: 'active' | 'revoked';
  createdAt: string;
  createdBy: ID;
  lastUsedAt: string | null;
  eventsLast24h: number;
  revokedAt: string | null;
}

/* ───────────── Phase 4: infrastructure ───────────── */

export type ServerStatus = 'online' | 'offline' | 'new';

export interface ServiceStatus {
  name: string;
  manager: 'systemd' | 'pm2';
  status: 'running' | 'stopped' | 'failed';
  restarts10m: number;
  cpu: number;
  memoryMb: number;
}

export interface ContainerStatus {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'restarting' | 'exited' | 'paused';
  restarts10m: number;
  cpu: number;
  memoryMb: number;
  startedAt: string;
}

export interface ServerUsage {
  cpu: number;
  memory: number;
  disk: number;
  load1: number;
  netInKbps: number;
  netOutKbps: number;
}

export interface Server {
  id: ID;
  hostname: string;
  applicationId: ID;
  environmentId: ID;
  agentTokenId: ID;
  os: string;
  cpuCores: number;
  memoryGb: number;
  ips: string[];
  agentVersion: string;
  status: ServerStatus;
  lastSeenAt: string | null;
  uptimeSec: number;
  intervalSec: number;
  /** Latest sample; null when the agent has never reported. */
  usage: ServerUsage | null;
  services: ServiceStatus[];
  containers: ContainerStatus[];
}

export interface ServerDetail extends Server {
  kernel: string;
  disks: { mount: string; usedGb: number; totalGb: number }[];
  events: { at: string; text: string; severity: Severity }[];
}

export interface ServerPoint {
  at: string;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  load1: number | null;
  netInKbps: number | null;
  netOutKbps: number | null;
}

export type DbEngine = 'postgresql' | 'mysql' | 'mongodb' | 'redis';

export interface DbStats {
  connections: number;
  maxConnections: number;
  sizeGb: number;
  role: 'primary' | 'replica' | 'standalone';
  replicationLagSec: number | null;
}

export interface DbCheck {
  id: ID;
  name: string;
  engine: DbEngine;
  applicationId: ID;
  environmentId: ID;
  assetId: ID;
  host: string;
  port: number;
  database: string;
  username: string;
  credentialsSet: boolean;
  intervalSec: number;
  paused: boolean;
  status: HealthState;
  lastCheckAt: string | null;
  lastLatencyMs: number | null;
  error: string | null;
  /** Connect-and-ping time for the last 30 checks, oldest first; null = failed. */
  latency: (number | null)[];
  /** Only when a ShieldOps agent runs on the database host. */
  stats: DbStats | null;
}

export interface AgentToken {
  id: ID;
  name: string;
  applicationId: ID;
  environmentId: ID;
  prefix: string;
  status: 'active' | 'revoked';
  createdAt: string;
  createdBy: ID;
  servers: number;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

/* ───────────── Phase 5: code security ───────────── */

export type IntegrationType = 'github' | 'ghcr' | 'dockerhub' | 'smtp' | 'slack' | 'webhook' | 'jira' | 'cloudflare' | 'aws' | 'google' | 'entra';

export interface Integration {
  type: IntegrationType;
  status: 'connected' | 'not_connected' | 'error';
  /** For integrations built in a later phase. */
  availableInPhase: number | null;
  account: string | null;
  scopes: string[];
  connectedAt: string | null;
  connectedBy: ID | null;
  lastSyncAt: string | null;
  error: string | null;
}

export type ScanStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
export type ScannerName = 'gitleaks' | 'osv' | 'trivy';

export interface ScannerRun {
  scanner: ScannerName;
  version: string;
  status: Exclude<ScanStatus, 'partial' | 'queued'> | 'queued';
  durationMs: number | null;
  error: string | null;
}

export interface ScanJob {
  id: ID;
  targetType: 'repository' | 'image';
  targetId: ID;
  trigger: 'initial' | 'manual' | 'schedule' | 'push';
  status: ScanStatus;
  /** Commit for repositories, digest for images. */
  revision: string | null;
  runs: ScannerRun[];
  queuedAt: string;
  finishedAt: string | null;
  newFindings: number;
  fixedFindings: number;
}

export type SeverityCounts = Record<Severity, number>;

export interface Repository {
  id: ID;
  assetId: ID;
  fullName: string;
  applicationId: ID;
  environmentId: ID;
  private: boolean;
  defaultBranch: string;
  language: string;
  scanOnPush: boolean;
  dailyScan: boolean;
  dependencies: number;
  openSecrets: number;
  vulns: SeverityCounts;
  lastScan: ScanJob | null;
  addedAt: string;
}

export interface AvailableRepo {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  language: string;
}

export interface ContainerImage {
  id: ID;
  assetId: ID;
  applicationId: ID;
  environmentId: ID;
  registry: 'ghcr.io' | 'docker.io';
  repository: string;
  tag: string;
  digest: string;
  os: string;
  sizeMb: number;
  dailyScan: boolean;
  vulns: SeverityCounts;
  lastScan: ScanJob | null;
  addedAt: string;
}

export interface DependencyRow {
  package: string;
  ecosystem: VulnDetail['ecosystem'];
  installed: string[];
  /** Lowest version that fixes every known vulnerability, if one exists. */
  upgradeTo: string | null;
  vulns: number;
  worst: Severity;
  knownExploited: boolean;
  targets: { type: 'repository' | 'image'; name: string; applicationId: ID }[];
}

/* ───────────── Phase 6: security operations ───────────── */

export type IncidentStatus = 'new' | 'acknowledged' | 'investigating' | 'remediating' | 'resolved' | 'closed' | 'reopened';
export type LinkedType = 'alert' | 'finding' | 'error_group';

export interface LinkedItem {
  type: LinkedType;
  id: ID;
  title: string;
  severity: Severity | null;
}

export interface TimelineEntry {
  at: string;
  actorName: string;
  kind: 'status' | 'note' | 'link' | 'task' | 'system';
  text: string;
}

export interface Incident {
  id: ID;
  ref: string;
  title: string;
  summary: string;
  severity: Severity;
  status: IncidentStatus;
  ownerId: ID | null;
  applicationIds: ID[];
  linked: LinkedItem[];
  openedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  rootCause: string;
  postIncident: string;
  createdBy: ID | null;
  timeline: TimelineEntry[];
  externalRef?: ExternalRef;
}

export interface ExternalRef {
  system: 'jira';
  key: string;
  url: string;
  status: string;
  syncedAt: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'ready_for_verification' | 'verified' | 'wont_fix';

export interface TaskVerification {
  status: 'pending' | 'passed' | 'failed';
  at: string;
  method: string;
  detail: string;
}

export interface RemediationTask {
  id: ID;
  title: string;
  details: string;
  linkedType: 'finding' | 'incident' | 'error_group';
  linkedId: ID;
  linkedTitle: string;
  applicationId: ID;
  ownerId: ID | null;
  priority: Priority | null;
  dueAt: string | null;
  status: TaskStatus;
  createdAt: string;
  createdBy: ID | null;
  completedAt: string | null;
  verification: TaskVerification | null;
  /** Earlier verification attempts, newest first. */
  verificationHistory: TaskVerification[];
  wontFixReason: string | null;
  notes: { at: string; actorName: string; text: string }[];
  externalRef?: ExternalRef;
}

export interface SlaSummary {
  openTasks: number;
  overdue: number;
  dueThisWeek: number;
  verifiedLast30d: number;
  /** Share of tasks finished by their due date, last 30 days. */
  onTimeRate: number | null;
  byPriority: { priority: Priority; open: number; overdue: number }[];
  /** Mean time from alert to acknowledgement, minutes. */
  mttaMinutes: number | null;
  /** Mean time from incident opened to resolved, hours. */
  mttrHours: number | null;
}

/* ───────────── Phase 7: AI and reporting ───────────── */

export type AiContextType = 'finding' | 'incident' | 'error_group' | 'alert';

export interface AiContext {
  type: AiContextType;
  id: ID;
}

export interface AiAnswer {
  id: ID;
  question: string;
  context: AiContext | null;
  contextTitle: string | null;
  /** Exactly what was sent to the provider, after masking. */
  sent: { label: string; value: string }[];
  summary: string;
  sections: { title: string; bullets: string[] }[];
  suggestedTasks: string[];
  model: string;
  generatedAt: string;
}

export interface Recommendation {
  id: ID;
  title: string;
  why: string;
  source: 'rule' | 'ai';
  effort: 'small' | 'medium' | 'large';
  findingIds: ID[];
  applicationIds: ID[];
  /** Open findings it would close, by priority. */
  closes: Record<Priority, number>;
  steps: string[];
  dismissed: boolean;
  dismissedReason: string | null;
}

export type ReportType = 'posture' | 'health' | 'vulnerabilities' | 'ssl_domains' | 'incidents' | 'compliance';

export interface ReportSection {
  title: string;
  summary?: string;
  metrics?: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }[];
  table?: { columns: string[]; rows: string[][] };
  bullets?: string[];
}

export interface ReportRecord {
  id: ID;
  type: ReportType;
  title: string;
  from: string;
  to: string;
  applicationId: ID | null;
  status: 'generating' | 'ready' | 'failed';
  generatedAt: string;
  generatedBy: ID | null;
  sizeKb: number | null;
}

export interface ReportDetail extends ReportRecord {
  sections: ReportSection[];
}

export interface ReportSchedule {
  id: ID;
  type: ReportType;
  frequency: 'weekly' | 'monthly';
  recipients: string[];
  applicationId: ID | null;
  nextRunAt: string;
  createdBy: ID;
}

export type FrameworkId = 'iso27001' | 'soc2' | 'certin' | 'dpdp';

export interface Framework {
  id: FrameworkId;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
}

export type ControlStatus = 'met' | 'partial' | 'not_met' | 'manual';

export interface ControlResult {
  id: string;
  code: string;
  title: string;
  /** How ShieldOps judged it from live data; 'manual' means it needs your evidence. */
  status: ControlStatus;
  evidence: string[];
  gaps: string[];
  links: { label: string; to: string }[];
  attestation: { status: 'met' | 'not_met'; note: string; by: ID; at: string } | null;
}

export interface ComplianceReport {
  framework: Framework;
  controls: ControlResult[];
  /** Share of controls met, counting attested manual controls; partial counts half. */
  score: number;
  checkedAt: string;
}

/* ───────────── Phase 8: advanced ───────────── */

export interface Release {
  id: ID;
  applicationId: ID;
  environmentId: ID;
  version: string;
  commit: string;
  deployedAt: string;
  deployedBy: string;
  /** Error groups first seen within 24 hours of this release. */
  newErrorGroups: number;
  alertsAfter: number;
  before: { errorRate: number; p95: number };
  after: { errorRate: number; p95: number } | null;
  verdict: 'healthy' | 'regression' | 'watching';
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: ID;
  at: string;
  level: LogLevel;
  applicationId: ID;
  environmentId: ID;
  source: 'sdk' | 'agent';
  host: string;
  message: string;
  fields: Record<string, string>;
}

export interface LogQuery {
  applicationId?: string;
  environmentId?: string;
  search?: string;
  levels?: LogLevel[];
  range: '15m' | '1h' | '24h' | '7d';
  page: number;
  pageSize: number;
}

export interface LogResult extends Paged<LogEntry> {
  /** Matches per bucket across the range, oldest first. */
  histogram: { at: string; count: number; errors: number }[];
}

export interface ProbeLocation {
  id: ID;
  name: string;
  region: string;
  kind: 'built_in' | 'remote';
  status: 'online' | 'offline';
  lastSeenAt: string | null;
  prefix: string | null;
  createdAt: string;
}

export interface ProbeResult {
  probeId: ID;
  probeName: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  latencyMs: number | null;
  at: string;
  error: string | null;
}

export interface DiscoveredAsset {
  externalId: string;
  source: 'cloudflare' | 'aws';
  type: AssetType;
  identifier: string;
  label: string;
  exposure: 'internet' | 'internal';
  details: string;
  alreadyAdded: boolean;
}

export interface CloudCheck {
  id: string;
  provider: 'aws' | 'google' | 'entra' | 'cloudflare';
  title: string;
  passed: number;
  failed: number;
  findingIds: ID[];
}

export interface EscalationPolicy {
  id: ID;
  name: string;
  severities: Severity[];
  steps: { afterMinutes: number; targets: ('all' | ID)[]; channels: AlertChannel[] }[];
  repeat: boolean;
  enabled: boolean;
}

export interface AlertEscalation {
  alertId: ID;
  policyId: ID;
  policyName: string;
  step: number;
  totalSteps: number;
  lastNotifiedAt: string;
  nextAt: string | null;
}

export interface Anomaly {
  id: ID;
  applicationId: ID;
  environmentId: ID;
  metric: 'requests' | 'error_rate' | 'p95' | 'login_failures' | 'error_events';
  title: string;
  direction: 'up' | 'down';
  actual: number;
  expectedLow: number;
  expectedHigh: number;
  unit: string;
  startedAt: string;
  endedAt: string | null;
  alertId: ID | null;
  /** Actual and usual range in 10-minute steps, last 8 hours, oldest first. */
  series: { at: string; actual: number; low: number; high: number }[];
}