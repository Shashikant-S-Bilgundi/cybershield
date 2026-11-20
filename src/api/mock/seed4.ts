import type { AgentToken, Alert, AlertRule, Asset, ContainerStatus, DbCheck, ServerDetail, ServiceStatus } from '@/types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (t: number) => new Date(t).toISOString();

export interface ServerRecord extends Omit<ServerDetail, 'status' | 'lastSeenAt' | 'usage' | 'uptimeSec'> {
  /** Typical usage the mock wobbles around. */
  profile: { cpu: number; memory: number; disk: number; diskPerDay: number; netIn: number; netOut: number; cpuSpike?: { from: string; to: string } };
  bootedAt: string;
  /** When set, the agent stopped reporting at this time. */
  offlineSince: string | null;
  createdAt: string;
}

export interface DbCheckRecord extends Omit<DbCheck, 'status' | 'lastCheckAt' | 'lastLatencyMs' | 'latency' | 'error'> {
  baseLatency: number;
  sim: 'up' | 'slow' | 'down';
  createdAt: string;
}

export interface Phase4Data {
  servers: ServerRecord[];
  dbChecks: DbCheckRecord[];
  agentTokens: AgentToken[];
}

export const PHASE4_RULES: AlertRule[] = [
  { id: 'r22', name: 'High CPU', signal: 'cpu_high', threshold: 90, durationMin: 10, severity: 'high', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r23', name: 'High memory', signal: 'memory_high', threshold: 90, durationMin: 10, severity: 'high', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r24', name: 'Disk above 85%', signal: 'disk_high', threshold: 85, durationMin: null, severity: 'medium', scope: { applicationId: null, environmentType: null }, channels: ['in_app'], enabled: true, builtIn: true },
  { id: 'r25', name: 'Disk above 95%', signal: 'disk_high', threshold: 95, durationMin: null, severity: 'critical', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r26', name: 'Server stopped reporting', signal: 'agent_offline', threshold: 3, durationMin: null, severity: 'high', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r27', name: 'Service or container down', signal: 'process_down', threshold: 3, durationMin: null, severity: 'high', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r28', name: 'Database not responding', signal: 'db_down', threshold: 3, durationMin: null, severity: 'critical', scope: { applicationId: null, environmentType: 'production' }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
];

export function emptyPhase4(): Phase4Data {
  return { servers: [], dbChecks: [], agentTokens: [] };
}

const svc = (name: string, manager: ServiceStatus['manager'], cpu: number, memoryMb: number, extra: Partial<ServiceStatus> = {}): ServiceStatus => ({ name, manager, status: 'running', restarts10m: 0, cpu, memoryMb, ...extra });

export function seedPhase4(): Phase4Data & { alerts: Alert[]; assets: Asset[] } {
  const t = Date.now();
  const ctr = (id: string, name: string, image: string, cpu: number, memoryMb: number, startedAgo: number, extra: Partial<ContainerStatus> = {}): ContainerStatus => ({
    id, name, image, state: 'running', restarts10m: 0, cpu, memoryMb, startedAt: iso(t - startedAgo), ...extra,
  });

  const server = (s: Omit<ServerRecord, 'events' | 'createdAt' | 'offlineSince' | 'intervalSec' | 'agentVersion'> & Partial<ServerRecord>): ServerRecord => ({
    events: [],
    createdAt: iso(t - 30 * DAY),
    offlineSince: null,
    intervalSec: 60,
    agentVersion: '1.2.0',
    ...s,
  });

  const servers: ServerRecord[] = [
    server({
      id: 'srv1', hostname: 'portal-app-01', applicationId: 'a1', environmentId: 'a1-e1', agentTokenId: 'at1', os: 'Ubuntu 24.04 LTS', kernel: '6.8.0-48-generic',
      cpuCores: 4, memoryGb: 8, ips: ['203.0.113.21', '10.0.1.21'], bootedAt: iso(t - 41 * DAY),
      profile: { cpu: 34, memory: 61, disk: 48, diskPerDay: 0.1, netIn: 2400, netOut: 5100 },
      disks: [{ mount: '/', usedGb: 38.4, totalGb: 80 }],
      services: [svc('nginx', 'systemd', 2.1, 48), svc('docker', 'systemd', 1.2, 96)],
      containers: [ctr('c1a', 'portal-api', 'ghcr.io/example-org/portal-api:3.8.1', 21, 612, 6 * DAY), ctr('c1b', 'redis', 'redis:7.4-alpine', 1.4, 88, 41 * DAY)],
    }),
    server({
      id: 'srv2', hostname: 'payments-01', applicationId: 'a2', environmentId: 'a2-e1', agentTokenId: 'at2', os: 'Ubuntu 22.04 LTS', kernel: '5.15.0-122-generic',
      cpuCores: 8, memoryGb: 16, ips: ['10.0.2.11'], bootedAt: iso(t - 12 * DAY),
      profile: { cpu: 52, memory: 72, disk: 61, diskPerDay: 0.2, netIn: 3800, netOut: 4200, cpuSpike: { from: iso(t - 2 * HOUR - 34 * MIN), to: iso(t - 2 * HOUR - 20 * MIN) } },
      disks: [{ mount: '/', usedGb: 97.6, totalGb: 160 }],
      services: [svc('nginx', 'systemd', 3.2, 52), svc('docker', 'systemd', 2.4, 140)],
      containers: [
        ctr('c2a', 'payments-api-1', 'ghcr.io/example-org/payments-api:2.14.1', 24, 820, 2 * DAY),
        ctr('c2b', 'payments-api-2', 'ghcr.io/example-org/payments-api:2.14.1', 22, 790, 2 * DAY),
        ctr('c2c', 'payments-worker', 'ghcr.io/example-org/payments-worker:2.14.1', 0, 0, 40_000, { state: 'restarting', restarts10m: 4 }),
      ],
      events: [
        { at: iso(t - 7 * MIN), text: 'Container payments-worker restarted 4 times in 10 minutes (exit code 137, out of memory)', severity: 'high' },
        { at: iso(t - 2 * HOUR - 20 * MIN), text: 'CPU back below 90%', severity: 'info' },
        { at: iso(t - 2 * HOUR - 34 * MIN), text: 'CPU above 90% for 10 minutes', severity: 'high' },
      ],
    }),
    server({
      id: 'srv3', hostname: 'payments-db-01', applicationId: 'a2', environmentId: 'a2-e1', agentTokenId: 'at2', os: 'Debian 12', kernel: '6.1.0-26-amd64',
      cpuCores: 8, memoryGb: 32, ips: ['10.0.2.15'], bootedAt: iso(t - 64 * DAY),
      profile: { cpu: 18, memory: 81, disk: 69, diskPerDay: 0.3, netIn: 2900, netOut: 3600 },
      disks: [{ mount: '/', usedGb: 22.1, totalGb: 40 }, { mount: '/var/lib/postgresql', usedGb: 352, totalGb: 500 }],
      services: [svc('postgresql@16-main', 'systemd', 14, 24_100), svc('pgbouncer', 'systemd', 0.6, 22)],
      containers: [],
    }),
    server({
      id: 'srv4', hostname: 'payroll-01', applicationId: 'a3', environmentId: 'a3-e1', agentTokenId: 'at3', os: 'Ubuntu 22.04 LTS', kernel: '5.15.0-122-generic',
      cpuCores: 2, memoryGb: 4, ips: ['10.0.4.12'], bootedAt: iso(t - 90 * DAY), offlineSince: iso(t - 9 * MIN),
      profile: { cpu: 12, memory: 58, disk: 52, diskPerDay: 0.05, netIn: 140, netOut: 320 },
      disks: [{ mount: '/', usedGb: 20.8, totalGb: 40 }],
      services: [svc('nginx', 'systemd', 0.4, 31), svc('payroll', 'pm2', 3.1, 410)],
      containers: [],
      events: [{ at: iso(t - 6 * MIN), text: 'Agent missed 3 reports in a row', severity: 'high' }],
    }),
    server({
      id: 'srv5', hostname: 'field-api-01', applicationId: 'a4', environmentId: 'a4-e1', agentTokenId: 'at4', os: 'Ubuntu 24.04 LTS', kernel: '6.8.0-48-generic',
      cpuCores: 4, memoryGb: 8, ips: ['198.51.100.40', '10.0.6.10'], bootedAt: iso(t - 19 * DAY),
      profile: { cpu: 71, memory: 66, disk: 97, diskPerDay: 9, netIn: 6200, netOut: 1900 },
      disks: [{ mount: '/', usedGb: 77.6, totalGb: 80 }],
      services: [svc('nginx', 'systemd', 4.4, 61), svc('field-api', 'pm2', 58, 1240, { restarts10m: 1 })],
      containers: [],
      events: [
        { at: iso(t - 40 * MIN), text: 'Disk / above 95% full', severity: 'critical' },
        { at: iso(t - 3 * HOUR), text: 'Disk / above 85% full', severity: 'medium' },
      ],
    }),
    server({
      id: 'srv6', hostname: 'field-dev-01', applicationId: 'a4', environmentId: 'a4-e2', agentTokenId: 'at5', os: 'Ubuntu 24.04 LTS', kernel: '6.8.0-48-generic',
      cpuCores: 2, memoryGb: 4, ips: ['10.0.7.4'], bootedAt: iso(t - 3 * DAY),
      profile: { cpu: 8, memory: 40, disk: 30, diskPerDay: 0.1, netIn: 90, netOut: 60 },
      disks: [{ mount: '/', usedGb: 12, totalGb: 40 }],
      services: [svc('docker', 'systemd', 0.6, 80)],
      containers: [ctr('c6a', 'field-api', 'ghcr.io/example-org/field-api:1.10.0-rc1', 3, 310, 3 * DAY), ctr('c6b', 'mongo', 'mongo:7.0', 2, 520, 3 * DAY)],
    }),
  ];

  const assets: Asset[] = [
    {
      id: 's14', type: 'database', identifier: 'mongodb+srv://portal-db.example.net', label: 'Portal MongoDB', applicationId: 'a1', environmentId: 'a1-e1',
      exposure: 'internet', shared: false, status: 'active', createdAt: iso(t - 15 * DAY),
      authorization: { status: 'approved', method: 'approval', justification: 'Managed MongoDB cluster owned by the portal team.', approvedBy: 'u2', at: iso(t - 15 * DAY) },
    },
    {
      id: 's15', type: 'database', identifier: 'redis://10.0.6.20:6379', label: 'Field Ops Redis', applicationId: 'a4', environmentId: 'a4-e1',
      exposure: 'internal', shared: false, status: 'active', createdAt: iso(t - 15 * DAY),
      authorization: { status: 'verified', method: 'internal_allowlist', at: iso(t - 15 * DAY) },
    },
  ];

  const dbChecks: DbCheckRecord[] = [
    {
      id: 'db1', name: 'Payments PostgreSQL', engine: 'postgresql', applicationId: 'a2', environmentId: 'a2-e1', assetId: 's7', host: '10.0.2.15', port: 5432, database: 'payments',
      username: 'shieldops_ro', credentialsSet: true, intervalSec: 60, paused: false, baseLatency: 4, sim: 'up', createdAt: iso(t - 18 * DAY),
      stats: { connections: 84, maxConnections: 200, sizeGb: 38.2, role: 'primary', replicationLagSec: null },
    },
    {
      id: 'db2', name: 'Portal MongoDB', engine: 'mongodb', applicationId: 'a1', environmentId: 'a1-e1', assetId: 's14', host: 'portal-db.example.net', port: 27017, database: 'portal',
      username: 'shieldops-monitor', credentialsSet: true, intervalSec: 60, paused: false, baseLatency: 38, sim: 'slow', createdAt: iso(t - 14 * DAY), stats: null,
    },
    {
      id: 'db3', name: 'Field Ops Redis', engine: 'redis', applicationId: 'a4', environmentId: 'a4-e1', assetId: 's15', host: '10.0.6.20', port: 6379, database: '0',
      username: 'default', credentialsSet: true, intervalSec: 60, paused: false, baseLatency: 2, sim: 'up', createdAt: iso(t - 14 * DAY), stats: null,
    },
  ];

  const token = (k: Omit<AgentToken, 'status' | 'createdBy' | 'servers' | 'lastSeenAt' | 'revokedAt'> & Partial<AgentToken>): AgentToken => ({ status: 'active', createdBy: 'u1', servers: 0, lastSeenAt: null, revokedAt: null, ...k });
  const agentTokens: AgentToken[] = [
    token({ id: 'at1', name: 'Portal production servers', applicationId: 'a1', environmentId: 'a1-e1', prefix: 'so_agent_51f0', createdAt: iso(t - 41 * DAY) }),
    token({ id: 'at2', name: 'Payments production', applicationId: 'a2', environmentId: 'a2-e1', prefix: 'so_agent_9b2d', createdAt: iso(t - 64 * DAY), createdBy: 'u3' }),
    token({ id: 'at3', name: 'Payroll production', applicationId: 'a3', environmentId: 'a3-e1', prefix: 'so_agent_c07a', createdAt: iso(t - 90 * DAY) }),
    token({ id: 'at4', name: 'Field Ops production', applicationId: 'a4', environmentId: 'a4-e1', prefix: 'so_agent_3e8f', createdAt: iso(t - 19 * DAY), createdBy: 'u3' }),
    token({ id: 'at5', name: 'Field Ops development', applicationId: 'a4', environmentId: 'a4-e2', prefix: 'so_agent_d41c', createdAt: iso(t - 3 * DAY), createdBy: 'u3' }),
  ];

  const sent = (at: number): Alert['deliveries'] => [
    { channel: 'in_app', recipient: 'All members', status: 'sent', at: iso(at), attempts: 1 },
    { channel: 'email', recipient: 'it-alerts@example.com', status: 'sent', at: iso(at + 4000), attempts: 1 },
  ];
  const base = { occurrences: 1, acknowledgedBy: null, acknowledgedAt: null, snoozedUntil: null, resolvedAt: null, autoResolved: false } as const;
  const alerts: Alert[] = [
    { ...base, id: 'al13', title: 'Disk 97% full on field-api-01', message: 'Only 2.4 GB left on /. It grew about 9 GB in the last day, mostly in the photo upload folder.', severity: 'critical', status: 'open', source: 'infrastructure', applicationId: 'a4', environmentId: 'a4-e1', assetId: 's12', ruleId: 'r25', firstAt: iso(t - 40 * MIN), lastAt: iso(t - MIN), occurrences: 40, deliveries: sent(t - 40 * MIN) },
    { ...base, id: 'al14', title: 'payroll-01 stopped reporting', message: 'No report from the agent for 9 minutes. The server may be down, or the agent stopped.', severity: 'high', status: 'open', source: 'infrastructure', applicationId: 'a3', environmentId: 'a3-e1', assetId: 's10', ruleId: 'r26', firstAt: iso(t - 6 * MIN), lastAt: iso(t - 6 * MIN), deliveries: sent(t - 6 * MIN) },
    { ...base, id: 'al15', title: 'Container payments-worker restarted 4 times in 10 minutes', message: 'Exit code 137 (out of memory) on payments-01.', severity: 'high', status: 'open', source: 'infrastructure', applicationId: 'a2', environmentId: 'a2-e1', assetId: null, ruleId: 'r27', firstAt: iso(t - 7 * MIN), lastAt: iso(t - 2 * MIN), occurrences: 4, deliveries: sent(t - 7 * MIN) },
    { ...base, id: 'al16', title: 'CPU above 90% on payments-01', message: 'CPU stayed above 90% for 14 minutes.', severity: 'high', status: 'resolved', source: 'infrastructure', applicationId: 'a2', environmentId: 'a2-e1', assetId: null, ruleId: 'r22', firstAt: iso(t - 2 * HOUR - 34 * MIN), lastAt: iso(t - 2 * HOUR - 20 * MIN), occurrences: 14, resolvedAt: iso(t - 2 * HOUR - 20 * MIN), autoResolved: true, deliveries: sent(t - 2 * HOUR - 34 * MIN) },
  ];

  return { servers, dbChecks, agentTokens, alerts, assets };
}