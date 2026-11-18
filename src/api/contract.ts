import type {
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

export type SettingsUpdate = Partial<Omit<SystemSettings, 'smtp'>> & {
  smtp?: Partial<SystemSettings['smtp']> & { password?: string };
};

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
}