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
}

export interface MfaEnrollment {
  secret: string;
  otpauthUrl: string;
}

export type LoginResult =
  | { status: 'mfa_required'; challengeId: string }
  | { status: 'mfa_enroll'; challengeId: string; enrollment: MfaEnrollment };