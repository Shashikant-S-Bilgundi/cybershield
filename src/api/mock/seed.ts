import type {
  Application,
  Asset,
  AuditLog,
  HealthState,
  HealthTick,
  Invite,
  SystemSettings,
  User,
} from '@/types';

export interface MockDb {
  users: (User & { password: string })[];
  invites: (Invite & { token: string })[];
  applications: Application[];
  assets: Asset[];
  auditLogs: AuditLog[];
  settings: SystemSettings;
  /** health ribbons for each production environment, newest last */
  health: Record<string, HealthTick[]>;
}

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const now = () => Date.now();
const iso = (t: number) => new Date(t).toISOString();

/** Small deterministic PRNG so demo data is stable between reloads. */
function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function ribbon(seed: number, pattern: (i: number) => HealthState): HealthTick[] {
  const rand = prng(seed);
  return Array.from({ length: 60 }, (_, i) => {
    const state = pattern(i);
    const base = state === 'degraded' ? 1800 : 180;
    return {
      at: iso(now() - (59 - i) * MIN),
      state,
      latencyMs: state === 'down' || state === 'unknown' || state === 'paused' ? null : Math.round(base + rand() * base * 0.6),
    };
  });
}

export const DEFAULT_SETTINGS: SystemSettings = {
  timezone: 'Asia/Kolkata',
  monitoring: { uptimeIntervalSec: 60, downAfterFailures: 3, sslCheckHours: 24, dnsCheckHours: 6 },
  retention: {
    checkResultsDays: 30,
    metricSamplesDays: 7,
    errorEventsDays: 30,
    securityEventsDays: 90,
    auditLogsDays: 730,
  },
  smtp: { host: '', port: 587, username: '', fromAddress: '', passwordSet: false },
  internalAllowlist: [],
};

export function emptyDb(): MockDb {
  return {
    users: [],
    invites: [],
    applications: [],
    assets: [],
    auditLogs: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    health: {},
  };
}

export function seedDb(): MockDb {
  const t = now();
  const users: MockDb['users'] = [
    { id: 'u1', name: 'Demo User', email: 'demo@shieldops.local', password: 'ShieldOps!2026', status: 'active', mfaEnabled: true, lastLoginAt: iso(t - 2 * DAY), invitedBy: null, createdAt: iso(t - 120 * DAY) },
    { id: 'u2', name: 'Ananya Rao', email: 'ananya@example.com', password: 'x', status: 'active', mfaEnabled: true, lastLoginAt: iso(t - 3 * 60 * MIN), invitedBy: 'u1', createdAt: iso(t - 90 * DAY) },
    { id: 'u3', name: 'Kiran Shetty', email: 'kiran@example.com', password: 'x', status: 'active', mfaEnabled: true, lastLoginAt: iso(t - 1 * DAY), invitedBy: 'u1', createdAt: iso(t - 75 * DAY) },
    { id: 'u4', name: 'Meera Iyer', email: 'meera@example.com', password: 'x', status: 'disabled', mfaEnabled: true, lastLoginAt: iso(t - 40 * DAY), invitedBy: 'u2', createdAt: iso(t - 60 * DAY) },
  ];

  const app = (
    id: string,
    name: string,
    description: string,
    ownerId: string,
    criticality: Application['criticality'],
    techStack: string[],
    envs: [string, Application['environments'][number]['type']][],
    daysOld: number,
  ): Application => ({
    id,
    name,
    description,
    ownerId,
    memberIds: [ownerId],
    criticality,
    techStack,
    tags: [],
    status: 'active',
    environments: envs.map(([name, type], i) => ({ id: `${id}-e${i + 1}`, applicationId: id, name, type })),
    createdAt: iso(t - daysOld * DAY),
    updatedAt: iso(t - Math.min(daysOld, 5) * DAY),
  });

  const applications = [
    app('a1', 'Customer Portal', 'Self-service portal where customers manage orders and invoices.', 'u2', 'critical', ['React', 'Node.js', 'MongoDB'], [['Production', 'production'], ['Staging', 'staging']], 100),
    app('a2', 'Payments API', 'Handles card and UPI payments for every customer-facing app.', 'u3', 'critical', ['Node.js', 'PostgreSQL', 'Redis'], [['Production', 'production'], ['Staging', 'staging'], ['Development', 'development']], 95),
    app('a3', 'HR Payroll', 'Internal payroll and payslip generation for staff.', 'u1', 'high', ['React', 'Express', 'MongoDB'], [['Production', 'production']], 80),
    app('a4', 'Field Ops Backend', 'API behind the field-staff mobile app: jobs, check-ins, photos.', 'u3', 'medium', ['Node.js', 'MongoDB'], [['Production', 'production'], ['Development', 'development']], 60),
    app('a5', 'Marketing Site', 'Public website and lead forms.', 'u2', 'low', ['Vite', 'Cloudflare Pages'], [['Production', 'production']], 30),
  ];

  const asset = (
    id: string,
    appId: string,
    envIdx: number,
    type: Asset['type'],
    identifier: string,
    label: string,
    exposure: Asset['exposure'],
    authorization: Asset['authorization'],
  ): Asset => ({
    id,
    type,
    identifier,
    label,
    applicationId: appId,
    environmentId: `${appId}-e${envIdx}`,
    exposure,
    shared: false,
    status: 'active',
    authorization,
    createdAt: iso(t - 20 * DAY),
  });

  const verified = (method: Asset['authorization']['method']): Asset['authorization'] => ({ status: 'verified', method, at: iso(t - 19 * DAY) });

  const assets: Asset[] = [
    asset('s1', 'a1', 1, 'domain', 'portal.example.com', 'Portal domain', 'internet', verified('dns_txt')),
    asset('s2', 'a1', 1, 'api', 'https://portal.example.com/api', 'Portal API', 'internet', verified('dns_txt')),
    asset('s3', 'a1', 1, 'server', '203.0.113.21', 'Portal app server', 'internet', verified('approval')),
    asset('s4', 'a1', 2, 'website', 'https://staging.portal.example.com', 'Portal staging', 'internet', { status: 'pending', method: 'dns_txt', token: 'shieldops-verify=7f3a91c2e4' }),
    asset('s5', 'a2', 1, 'domain', 'pay.example.com', 'Payments domain', 'internet', verified('dns_txt')),
    asset('s6', 'a2', 1, 'api', 'https://api.pay.example.com', 'Payments API', 'internet', verified('dns_txt')),
    asset('s7', 'a2', 1, 'database', 'postgres://10.0.2.15:5432', 'Payments database', 'internal', verified('internal_allowlist')),
    asset('s8', 'a2', 1, 'repository', 'example-org/payments-api', 'payments-api repo', 'internal', { status: 'approved', method: 'approval', justification: 'Our own GitHub organisation.', approvedBy: 'u3', at: iso(t - 18 * DAY) }),
    asset('s9', 'a3', 1, 'website', 'https://payroll.internal.example.com', 'Payroll web', 'internal', verified('internal_allowlist')),
    asset('s10', 'a3', 1, 'server', '10.0.4.12', 'Payroll server', 'internal', verified('internal_allowlist')),
    asset('s11', 'a4', 1, 'api', 'https://field.example.com/api', 'Field API', 'internet', verified('html_file')),
    asset('s12', 'a4', 1, 'server', '198.51.100.40', 'Field server', 'internet', { status: 'failed', method: 'html_file', token: 'shieldops-verify-1c9e.html' }),
    asset('s13', 'a5', 1, 'domain', 'www.example.com', 'Marketing domain', 'internet', verified('dns_txt')),
  ];

  const health: MockDb['health'] = {
    'a1-e1': ribbon(11, () => 'up'),
    'a2-e1': ribbon(22, (i) => (i > 40 && i < 52 ? 'degraded' : 'up')),
    'a3-e1': ribbon(33, (i) => (i < 20 ? 'unknown' : 'up')),
    'a4-e1': ribbon(44, (i) => (i >= 54 ? 'down' : i > 30 && i < 34 ? 'degraded' : 'up')),
    'a5-e1': ribbon(55, () => 'up'),
  };

  const rand = prng(7);
  const actions: [string, string, string][] = [
    ['auth.login', 'session', 'Signed in'],
    ['application.create', 'application', 'Created application'],
    ['application.update', 'application', 'Updated application details'],
    ['asset.create', 'asset', 'Registered asset'],
    ['asset.verify', 'asset', 'Verified asset ownership'],
    ['asset.approve', 'asset', 'Approved asset with justification'],
    ['user.invite', 'user', 'Invited a user'],
    ['user.disable', 'user', 'Disabled a user'],
    ['settings.update', 'settings', 'Changed monitoring defaults'],
    ['auth.reauth', 'session', 'Re-authenticated for a critical action'],
    ['auth.login_failed', 'session', 'Failed sign-in attempt'],
  ];
  const auditLogs: AuditLog[] = Array.from({ length: 57 }, (_, i) => {
    const [action, resourceType, summary] = actions[Math.floor(rand() * actions.length)];
    const actor = users[Math.floor(rand() * 3)];
    const failed = action === 'auth.login_failed';
    return {
      id: `l${i + 1}`,
      actorId: failed ? null : actor.id,
      actorName: failed ? 'Unknown' : actor.name,
      action,
      resourceType,
      resourceId: null,
      summary,
      ip: `10.0.${Math.floor(rand() * 8)}.${Math.floor(rand() * 250) + 2}`,
      at: iso(t - i * 97 * MIN - Math.floor(rand() * 40) * MIN),
    };
  });

  const invites: MockDb['invites'] = [
    { id: 'i1', email: 'rohit@example.com', invitedBy: 'u2', token: 'demo-invite', expiresAt: iso(t + 2 * DAY), createdAt: iso(t - DAY) },
  ];

  return {
    users,
    invites,
    applications,
    assets,
    auditLogs,
    settings: {
      ...structuredClone(DEFAULT_SETTINGS),
      smtp: { host: 'smtp-relay.example.com', port: 587, username: 'alerts@example.com', fromAddress: 'ShieldOps <alerts@example.com>', passwordSet: true },
      internalAllowlist: [
        { cidr: '10.0.0.0/16', note: 'Office and data-centre network' },
        { cidr: '192.168.50.0/24', note: 'Build servers' },
      ],
    },
    health,
  };
}