import type {
  AlertEscalation,
  Anomaly,
  CloudCheck,
  DiscoveredAsset,
  EscalationPolicy,
  ExternalRef,
  LogQuery,
  LogResult,
  ProbeLocation,
  ProbeResult,
  Release,
  AiAnswer,
  AiContext,
  ComplianceReport,
  Framework,
  FrameworkId,
  Recommendation,
  ReportDetail,
  ReportRecord,
  ReportSchedule,
  ReportType,
  Incident,
  IncidentStatus,
  LinkedType,
  RemediationTask,
  SlaSummary,
  TaskStatus,
  AvailableRepo,
  ContainerImage,
  DependencyRow,
  Integration,
  IntegrationType,
  Repository,
  ScanJob,
  AgentToken,
  DbCheck,
  DbEngine,
  Server,
  ServerDetail,
  ServerPoint,
  ConsoleLogin,
  Detection,
  ErrorGroup,
  ErrorGroupDetail,
  ErrorGroupStatus,
  IngestionKey,
  PerfRange,
  PerfSummary,
  PerformanceReport,
  SecurityEvent,
  SecurityEventType,
  SecurityStats,
  Alert,
  AlertRule,
  AlertStatus,
  Certificate,
  DnsSnapshot,
  DomainExpiry,
  Finding,
  FindingStatus,
  HeaderReport,
  Heartbeat,
  MaintenanceWindow,
  Monitor,
  MonitorDetail,
  NotificationChannels,
  Severity,
  SignalSource,
  Application,
  Asset,
  AssetType,
  AuditLog,
  Criticality,
  DashboardSummary,
  EnvironmentType,
  Invite,
  LoginResult,
  Paged,
  Session,
  SystemSettings,
  User,
} from '@/types';

export interface ApplicationInput {
  name: string;
  description: string;
  ownerId: string;
  criticality: Criticality;
  techStack: string[];
  tags: string[];
  environments: { name: string; type: EnvironmentType }[];
}

export interface AssetInput {
  type: AssetType;
  identifier: string;
  label: string;
  applicationId: string;
  environmentId: string;
  exposure: 'internet' | 'internal';
  authorizationMethod: 'dns_txt' | 'html_file' | 'approval' | 'internal_allowlist';
  justification?: string;
}

export interface AssetFilter {
  applicationId?: string;
  environmentId?: string;
  type?: AssetType;
}

export interface AuditQuery {
  page: number;
  pageSize: number;
  search?: string;
  resourceType?: string;
  from?: string;
  to?: string;
}

export type SettingsUpdate = Partial<Omit<SystemSettings, 'smtp' | 'sso'>> & {
  smtp?: Partial<SystemSettings['smtp']> & { password?: string };
  sso?: Partial<SystemSettings['sso']> & { clientSecret?: string };
};

export interface MonitorInput {
  name: string;
  type: Monitor['type'];
  assetId: string;
  target: string;
  intervalSec: number;
  timeoutMs: number;
  downAfterFailures: number;
  expectedStatus?: string;
  keyword?: string;
  recordType?: Monitor['recordType'];
}

export interface MonitorFilter {
  applicationId?: string;
  environmentId?: string;
}

export interface HeartbeatInput {
  name: string;
  applicationId: string;
  environmentId: string;
  schedule: Heartbeat['schedule'];
  graceSec: number;
}

export interface AlertFilter {
  status?: AlertStatus | 'active';
  severity?: Severity;
  source?: SignalSource;
  applicationId?: string;
  environmentId?: string;
}

export interface FindingFilter {
  /** Findings on one asset, e.g. a repository or image. */
  assetId?: string;
  status?: FindingStatus | 'active';
  severity?: Severity;
  source?: SignalSource;
  applicationId?: string;
  environmentId?: string;
}

export interface FindingUpdate {
  status?: FindingStatus;
  assigneeId?: string | null;
  note?: string;
  /** Required with status accepted_risk. */
  acceptedRisk?: { justification: string; expiresAt: string };
}

export interface ErrorGroupFilter {
  applicationId?: string;
  environmentId?: string;
  status?: ErrorGroupStatus | 'open';
  platform?: ErrorGroup['platform'];
  search?: string;
}

export interface SecurityEventFilter {
  applicationId?: string;
  environmentId?: string;
  types?: SecurityEventType[];
  result?: SecurityEvent['result'];
  ip?: string;
  page: number;
  pageSize: number;
}

export interface IngestionKeyInput {
  name: string;
  kind: IngestionKey['kind'];
  applicationId: string;
  environmentId: string;
}

/** The secret is returned only here, once. */
export interface IngestionKeySecret {
  key: IngestionKey;
  secret: string;
}

export interface DbCheckInput {
  name: string;
  engine: DbEngine;
  assetId: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  intervalSec: number;
}

export interface AgentTokenInput {
  name: string;
  applicationId: string;
  environmentId: string;
}

/** The secret is returned only here, once. */
export interface AgentTokenSecret {
  token: AgentToken;
  secret: string;
}

export interface CodeFilter {
  applicationId?: string;
  environmentId?: string;
}

export interface AddRepositoriesInput {
  fullNames: string[];
  applicationId: string;
  environmentId: string;
}

export interface AddImageInput {
  registry: ContainerImage['registry'];
  repository: string;
  tag: string;
  applicationId: string;
  environmentId: string;
}

export interface IncidentFilter {
  status?: IncidentStatus | 'active';
  applicationId?: string;
  severity?: Severity;
}

export interface IncidentInput {
  title: string;
  summary: string;
  severity: Severity;
  applicationIds: string[];
  ownerId: string | null;
  links?: { type: LinkedType; id: string }[];
}

export interface IncidentUpdate {
  status?: IncidentStatus;
  ownerId?: string | null;
  severity?: Severity;
  rootCause?: string;
  postIncident?: string;
  note?: string;
}

export interface TaskFilter {
  status?: TaskStatus | 'open';
  ownerId?: string;
  overdue?: boolean;
  applicationId?: string;
  linkedId?: string;
}

export interface TaskInput {
  title: string;
  details: string;
  linkedType: RemediationTask['linkedType'];
  linkedId: string;
  ownerId: string | null;
  /** Defaults to the SLA for the finding's priority. */
  dueAt?: string | null;
}

export interface TaskUpdate {
  status?: TaskStatus;
  ownerId?: string | null;
  dueAt?: string | null;
  note?: string;
  /** Required with status wont_fix. */
  wontFixReason?: string;
}

export interface ReportInput {
  type: ReportType;
  from: string;
  to: string;
  applicationId: string | null;
}

export type ReportScheduleInput = Omit<ReportSchedule, 'id' | 'nextRunAt' | 'createdBy'>;

export type AlertRuleInput = Omit<AlertRule, 'id' | 'builtIn'>;
export type MaintenanceWindowInput = Omit<MaintenanceWindow, 'id' | 'createdBy'>;

/**
 * The full contract between the frontend and the ShieldOps backend.
 * Both the HTTP client and the mock implement it, so the backend only
 * has to match these endpoints (documented in api/http.ts).
 * Calls marked "critical" return 403 REAUTH_REQUIRED without a fresh re-authentication.
 */
export interface ShieldOpsApi {
  setupStatus(): Promise<{ needsSetup: boolean }>;
  setup(input: { name: string; email: string; password: string }): Promise<LoginResult>;
  login(email: string, password: string): Promise<LoginResult>;
  verifyMfa(challengeId: string, code: string): Promise<Session>;
  me(): Promise<Session | null>;
  logout(): Promise<void>;
  reauth(input: { password?: string; code?: string }): Promise<{ reauthUntil: string }>;
  getInvite(token: string): Promise<{ email: string; expiresAt: string }>;
  acceptInvite(token: string, input: { name: string; password: string }): Promise<LoginResult>;

  dashboard(): Promise<DashboardSummary>;

  listApplications(): Promise<Application[]>;
  getApplication(id: string): Promise<Application>;
  createApplication(input: ApplicationInput): Promise<Application>;
  updateApplication(id: string, input: Partial<ApplicationInput>): Promise<Application>;
  setApplicationStatus(id: string, status: Application['status']): Promise<Application>;
  /** critical */
  deleteApplication(id: string): Promise<void>;

  listAssets(filter?: AssetFilter): Promise<Asset[]>;
  createAsset(input: AssetInput): Promise<Asset>;
  verifyAsset(id: string): Promise<Asset>;
  approveAsset(id: string, justification: string): Promise<Asset>;
  setAssetStatus(id: string, status: Asset['status']): Promise<Asset>;
  /** critical */
  deleteAsset(id: string): Promise<void>;

  listUsers(): Promise<User[]>;
  listInvites(): Promise<Invite[]>;
  /** critical */
  inviteUser(email: string): Promise<Invite & { link: string }>;
  revokeInvite(id: string): Promise<void>;
  /** critical */
  setUserStatus(id: string, status: User['status']): Promise<User>;
  /** critical */
  removeUser(id: string): Promise<void>;

  listAuditLogs(query: AuditQuery): Promise<Paged<AuditLog>>;
  /** critical */
  exportAuditLogs(query: Omit<AuditQuery, 'page' | 'pageSize'>): Promise<Blob>;

  getSettings(): Promise<SystemSettings>;
  /** critical */
  updateSettings(input: SettingsUpdate): Promise<SystemSettings>;

  /* Phase 2: availability monitoring */
  listMonitors(filter?: MonitorFilter): Promise<Monitor[]>;
  getMonitor(id: string): Promise<MonitorDetail>;
  createMonitor(input: MonitorInput): Promise<Monitor>;
  updateMonitor(id: string, input: Partial<MonitorInput>): Promise<Monitor>;
  setMonitorPaused(id: string, paused: boolean): Promise<Monitor>;
  /** Queues an immediate check; returns the monitor with the new result applied. */
  runMonitorNow(id: string): Promise<MonitorDetail>;
  /** critical */
  deleteMonitor(id: string): Promise<void>;

  listHeartbeats(filter?: MonitorFilter): Promise<Heartbeat[]>;
  createHeartbeat(input: HeartbeatInput): Promise<Heartbeat>;
  setHeartbeatPaused(id: string, paused: boolean): Promise<Heartbeat>;
  /** critical */
  deleteHeartbeat(id: string): Promise<void>;

  listCertificates(filter?: MonitorFilter): Promise<Certificate[]>;
  listDnsSnapshots(filter?: MonitorFilter): Promise<DnsSnapshot[]>;
  listDomainExpiry(filter?: MonitorFilter): Promise<DomainExpiry[]>;
  listHeaderReports(filter?: MonitorFilter): Promise<HeaderReport[]>;
  /** Queues SSL, DNS, domain and header checks for one asset. */
  recheckAsset(assetId: string): Promise<void>;

  listAlerts(filter?: AlertFilter): Promise<Alert[]>;
  acknowledgeAlert(id: string): Promise<Alert>;
  snoozeAlert(id: string, minutes: number): Promise<Alert>;
  resolveAlert(id: string): Promise<Alert>;

  listFindings(filter?: FindingFilter): Promise<Finding[]>;
  getFinding(id: string): Promise<Finding>;
  updateFinding(id: string, input: FindingUpdate): Promise<Finding>;

  listAlertRules(): Promise<AlertRule[]>;
  createAlertRule(input: AlertRuleInput): Promise<AlertRule>;
  updateAlertRule(id: string, input: Partial<AlertRuleInput>): Promise<AlertRule>;
  deleteAlertRule(id: string): Promise<void>;

  getChannels(): Promise<NotificationChannels>;
  /** critical */
  updateChannels(input: NotificationChannels): Promise<NotificationChannels>;

  listMaintenanceWindows(): Promise<MaintenanceWindow[]>;
  createMaintenanceWindow(input: MaintenanceWindowInput): Promise<MaintenanceWindow>;
  deleteMaintenanceWindow(id: string): Promise<void>;

  /* Phase 3: application telemetry */
  listErrorGroups(filter?: ErrorGroupFilter): Promise<ErrorGroup[]>;
  getErrorGroup(id: string): Promise<ErrorGroupDetail>;
  updateErrorGroup(id: string, input: { status?: ErrorGroupStatus; assigneeId?: string | null }): Promise<ErrorGroupDetail>;

  listPerformance(filter?: MonitorFilter): Promise<PerfSummary[]>;
  getPerformance(applicationId: string, environmentId: string, range: PerfRange): Promise<PerformanceReport>;

  listSecurityEvents(filter: SecurityEventFilter): Promise<Paged<SecurityEvent>>;
  getSecurityStats(filter?: MonitorFilter): Promise<SecurityStats>;
  listDetections(filter?: MonitorFilter): Promise<Detection[]>;
  listConsoleLogins(query: { page: number; pageSize: number }): Promise<Paged<ConsoleLogin>>;

  listIngestionKeys(filter?: MonitorFilter): Promise<IngestionKey[]>;
  /** critical */
  createIngestionKey(input: IngestionKeyInput): Promise<IngestionKeySecret>;
  /** critical. Issues a new secret; the old one keeps working for 24 hours. */
  rotateIngestionKey(id: string): Promise<IngestionKeySecret>;
  /** critical */
  revokeIngestionKey(id: string): Promise<IngestionKey>;

  /* Phase 4: infrastructure */
  listServers(filter?: MonitorFilter): Promise<Server[]>;
  getServer(id: string): Promise<ServerDetail>;
  getServerMetrics(id: string, range: PerfRange): Promise<ServerPoint[]>;
  /** critical. Removes a host that no longer exists; its agent token stays valid. */
  removeServer(id: string): Promise<void>;

  listDbChecks(filter?: MonitorFilter): Promise<DbCheck[]>;
  /** The password is stored encrypted and never returned. */
  createDbCheck(input: DbCheckInput): Promise<DbCheck>;
  runDbCheck(id: string): Promise<DbCheck>;
  setDbCheckPaused(id: string, paused: boolean): Promise<DbCheck>;
  /** critical */
  deleteDbCheck(id: string): Promise<void>;

  listAgentTokens(filter?: MonitorFilter): Promise<AgentToken[]>;
  /** critical */
  createAgentToken(input: AgentTokenInput): Promise<AgentTokenSecret>;
  /** critical. The old token keeps working for 24 hours. */
  rotateAgentToken(id: string): Promise<AgentTokenSecret>;
  /** critical. Servers using it stop reporting immediately. */
  revokeAgentToken(id: string): Promise<AgentToken>;

  /* Phase 5: code security */
  listIntegrations(): Promise<Integration[]>;
  /**
   * critical. GitHub redirects to install the GitHub App. Docker Hub takes { username, token };
   * Slack takes { url, channel }; Webhook takes { url } and returns its signing secret once.
   */
  connectIntegration(type: IntegrationType, credentials?: Record<string, string>): Promise<Integration & { secret?: string }>;
  /** critical */
  disconnectIntegration(type: IntegrationType): Promise<Integration>;

  listRepositories(filter?: CodeFilter): Promise<Repository[]>;
  getRepository(id: string): Promise<Repository>;
  /** Repositories the GitHub App can see that aren't added yet. */
  listAvailableRepositories(): Promise<AvailableRepo[]>;
  addRepositories(input: AddRepositoriesInput): Promise<Repository[]>;
  updateRepository(id: string, input: { scanOnPush?: boolean; dailyScan?: boolean }): Promise<Repository>;
  /** critical. Stops scanning and closes its open findings. */
  removeRepository(id: string): Promise<void>;

  listImages(filter?: CodeFilter): Promise<ContainerImage[]>;
  addImage(input: AddImageInput): Promise<ContainerImage>;
  /** critical */
  removeImage(id: string): Promise<void>;

  listScans(targetType: ScanJob['targetType'], targetId: string): Promise<ScanJob[]>;
  /** Queues a scan with every scanner that applies to the target. */
  startScan(targetType: ScanJob['targetType'], targetId: string): Promise<ScanJob>;
  listDependencies(filter?: CodeFilter): Promise<DependencyRow[]>;

  /* Phase 6: security operations */
  listIncidents(filter?: IncidentFilter): Promise<Incident[]>;
  getIncident(id: string): Promise<Incident>;
  createIncident(input: IncidentInput): Promise<Incident>;
  updateIncident(id: string, input: IncidentUpdate): Promise<Incident>;
  linkToIncident(id: string, item: { type: LinkedType; id: string }): Promise<Incident>;
  unlinkFromIncident(id: string, item: { type: LinkedType; id: string }): Promise<Incident>;

  listTasks(filter?: TaskFilter): Promise<RemediationTask[]>;
  createTask(input: TaskInput): Promise<RemediationTask>;
  /** Moving to ready_for_verification starts a recheck; the result arrives on the task. */
  updateTask(id: string, input: TaskUpdate): Promise<RemediationTask>;
  getSlaSummary(filter?: { applicationId?: string }): Promise<SlaSummary>;

  /** Sends a test message through Slack or the webhook. */
  testIntegration(type: IntegrationType): Promise<{ ok: boolean; detail: string }>;

  /* Phase 7: AI and reporting */
  /**
   * Asks the AI analyst. The backend loads the context itself, masks secrets and personal data,
   * and returns exactly what it sent. Fails with AI_DISABLED when AI is off; nothing else depends on it.
   */
  aiAsk(input: { question: string; context?: AiContext | null }): Promise<AiAnswer>;

  listRecommendations(filter?: { applicationId?: string; includeDismissed?: boolean }): Promise<Recommendation[]>;
  dismissRecommendation(id: string, reason: string): Promise<Recommendation>;
  restoreRecommendation(id: string): Promise<Recommendation>;

  listReports(): Promise<ReportRecord[]>;
  generateReport(input: ReportInput): Promise<ReportRecord>;
  getReport(id: string): Promise<ReportDetail>;
  downloadReportPdf(id: string): Promise<Blob>;
  listReportSchedules(): Promise<ReportSchedule[]>;
  createReportSchedule(input: ReportScheduleInput): Promise<ReportSchedule>;
  deleteReportSchedule(id: string): Promise<void>;

  listFrameworks(): Promise<Framework[]>;
  setFrameworkEnabled(id: FrameworkId, enabled: boolean): Promise<Framework>;
  getCompliance(id: FrameworkId): Promise<ComplianceReport>;
  /** Records your own evidence for a control ShieldOps cannot check. */
  attestControl(id: FrameworkId, controlId: string, input: { status: 'met' | 'not_met'; note: string } | null): Promise<ComplianceReport>;

  /* Phase 8: advanced */
  /** Public: tells the sign-in page whether to show an SSO button. */
  getSsoConfig(): Promise<{ enabled: boolean; provider: 'google' | 'entra'; allowPasswordFallback: boolean }>;
  /** Starts SSO; the real backend redirects to the identity provider and back. ShieldOps two-factor still follows. */
  ssoLogin(provider: 'google' | 'entra'): Promise<LoginResult>;

  listReleases(filter?: { applicationId?: string }): Promise<Release[]>;
  searchLogs(query: LogQuery): Promise<LogResult>;

  listProbes(): Promise<ProbeLocation[]>;
  /** critical. Returns the probe token once. */
  createProbe(input: { name: string; region: string }): Promise<{ probe: ProbeLocation; secret: string }>;
  /** critical */
  removeProbe(id: string): Promise<void>;
  getProbeResults(monitorId: string): Promise<ProbeResult[]>;

  discoverAssets(source: 'cloudflare' | 'aws'): Promise<DiscoveredAsset[]>;
  importAssets(input: { source: 'cloudflare' | 'aws'; externalIds: string[]; applicationId: string; environmentId: string }): Promise<{ imported: number }>;
  listCloudChecks(): Promise<CloudCheck[]>;

  /** Creates a Jira issue for an incident or remediation task, using the connected project. */
  createJiraIssue(target: { type: 'incident' | 'task'; id: string }): Promise<ExternalRef>;

  listEscalationPolicies(): Promise<EscalationPolicy[]>;
  saveEscalationPolicy(input: Omit<EscalationPolicy, 'id'> & { id?: string }): Promise<EscalationPolicy>;
  deleteEscalationPolicy(id: string): Promise<void>;
  listAlertEscalations(): Promise<AlertEscalation[]>;

  listAnomalies(filter?: { applicationId?: string }): Promise<Anomaly[]>;
}