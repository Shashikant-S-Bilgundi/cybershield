import type { Alert, AlertRule, Application, Asset, EscalationPolicy, Finding, ProbeLocation, Release } from '@/types';
import { priorityFor, riskScore, SLA_DAYS } from '@/lib/risk';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (t: number) => new Date(t).toISOString();

export interface AnomalyRecord {
  id: string;
  applicationId: string;
  environmentId: string;
  metric: 'requests' | 'error_rate' | 'p95' | 'login_failures' | 'error_events';
  title: string;
  direction: 'up' | 'down';
  actual: number;
  expectedLow: number;
  expectedHigh: number;
  unit: string;
  startedAt: string;
  endedAt: string | null;
  alertId: string | null;
}

export interface Phase8Data {
  releases: Release[];
  probes: ProbeLocation[];
  escalationPolicies: EscalationPolicy[];
  anomalies: AnomalyRecord[];
  jiraCounter: number;
}

export const PHASE8_RULES: AlertRule[] = [
  { id: 'r33', name: 'Unusual pattern', signal: 'anomaly', threshold: 2, durationMin: null, severity: 'medium', scope: { applicationId: null, environmentType: 'production' }, channels: ['in_app'], enabled: true, builtIn: true },
];

const builtInProbe = (t: number): ProbeLocation => ({ id: 'p1', name: 'Bengaluru', region: 'This ShieldOps server', kind: 'built_in', status: 'online', lastSeenAt: iso(t), prefix: null, createdAt: iso(t - 120 * DAY) });

export function emptyPhase8(): Phase8Data {
  return { releases: [], probes: [builtInProbe(Date.now())], escalationPolicies: [], anomalies: [], jiraCounter: 1 };
}

export function seedPhase8(applications: Application[], allAssets: Asset[]): Phase8Data & { assets: Asset[]; findings: Finding[]; alerts: Alert[]; applications: Application[] } {
  const t = Date.now();

  const rel = (r: Omit<Release, 'deployedAt'> & { ago: number }): Release => {
    const { ago, ...rest } = r;
    return { ...rest, deployedAt: iso(t - ago) };
  };
  const releases: Release[] = [
    rel({ id: 'rl1', applicationId: 'a2', environmentId: 'a2-e1', version: 'payments-api@2.14.1', commit: '61b0c4f', ago: 3 * DAY, deployedBy: 'GitHub Actions', newErrorGroups: 1, alertsAfter: 2, before: { errorRate: 0.4, p95: 590 }, after: { errorRate: 0.9, p95: 640 }, verdict: 'regression' }),
    rel({ id: 'rl2', applicationId: 'a2', environmentId: 'a2-e1', version: 'payments-api@2.14.0', commit: '3c90ad1', ago: 8 * DAY, deployedBy: 'GitHub Actions', newErrorGroups: 0, alertsAfter: 0, before: { errorRate: 0.5, p95: 610 }, after: { errorRate: 0.4, p95: 590 }, verdict: 'healthy' }),
    rel({ id: 'rl3', applicationId: 'a1', environmentId: 'a1-e1', version: 'portal-web@5.2.0', commit: '8c2ea19', ago: 26 * HOUR, deployedBy: 'GitHub Actions', newErrorGroups: 1, alertsAfter: 0, before: { errorRate: 0.4, p95: 380 }, after: { errorRate: 0.5, p95: 390 }, verdict: 'regression' }),
    rel({ id: 'rl4', applicationId: 'a1', environmentId: 'a1-e1', version: 'portal-api@3.8.1', commit: 'a03f7d2', ago: 6 * DAY, deployedBy: 'Ananya Rao', newErrorGroups: 0, alertsAfter: 0, before: { errorRate: 0.5, p95: 410 }, after: { errorRate: 0.4, p95: 380 }, verdict: 'healthy' }),
    rel({ id: 'rl5', applicationId: 'a3', environmentId: 'a3-e1', version: 'payroll@4.0.1', commit: '17aa9f0', ago: 2 * DAY + 2 * HOUR, deployedBy: 'Demo User', newErrorGroups: 1, alertsAfter: 0, before: { errorRate: 0.1, p95: 250 }, after: { errorRate: 0.2, p95: 260 }, verdict: 'regression' }),
    rel({ id: 'rl6', applicationId: 'a4', environmentId: 'a4-e1', version: 'field-api@1.9.3', commit: 'c81d22e', ago: 4 * DAY, deployedBy: 'Kiran Shetty', newErrorGroups: 0, alertsAfter: 0, before: { errorRate: 1.2, p95: 530 }, after: { errorRate: 1.1, p95: 520 }, verdict: 'healthy' }),
    rel({ id: 'rl7', applicationId: 'a4', environmentId: 'a4-e2', version: 'field-api@1.10.0-rc1', commit: 'f41a6c8', ago: 3 * DAY, deployedBy: 'Kiran Shetty', newErrorGroups: 0, alertsAfter: 0, before: { errorRate: 0.6, p95: 300 }, after: null, verdict: 'watching' }),
  ];

  const probes: ProbeLocation[] = [
    builtInProbe(t),
    { id: 'p2', name: 'Singapore', region: 'ap-southeast-1 (Hetzner)', kind: 'remote', status: 'online', lastSeenAt: iso(t - 20_000), prefix: 'so_probe_8c21', createdAt: iso(t - 30 * DAY) },
  ];

  const escalationPolicies: EscalationPolicy[] = [
    {
      id: 'ep1', name: 'Critical production', severities: ['critical'], repeat: true, enabled: true,
      steps: [
        { afterMinutes: 0, targets: ['all'], channels: ['in_app', 'email'] },
        { afterMinutes: 15, targets: ['u3'], channels: ['email', 'slack'] },
        { afterMinutes: 30, targets: ['u1', 'u2'], channels: ['email'] },
      ],
    },
    {
      id: 'ep2', name: 'High severity', severities: ['high'], repeat: false, enabled: true,
      steps: [
        { afterMinutes: 0, targets: ['all'], channels: ['in_app'] },
        { afterMinutes: 60, targets: ['all'], channels: ['email'] },
      ],
    },
  ];

  const anomalies: AnomalyRecord[] = [
    { id: 'an1', applicationId: 'a4', environmentId: 'a4-e1', metric: 'requests', title: 'Traffic dropped on Field Ops Backend', direction: 'down', actual: 41, expectedLow: 82, expectedHigh: 118, unit: 'requests/min', startedAt: iso(t - 8 * MIN), endedAt: null, alertId: 'al20' },
    { id: 'an2', applicationId: 'a4', environmentId: 'a4-e1', metric: 'error_events', title: 'Error events far above normal on Field Ops Backend', direction: 'up', actual: 182, expectedLow: 0, expectedHigh: 5, unit: 'events/hour', startedAt: iso(t - 25 * MIN), endedAt: null, alertId: null },
    { id: 'an3', applicationId: 'a1', environmentId: 'a1-e1', metric: 'login_failures', title: 'Failed logins spiked on Customer Portal', direction: 'up', actual: 52, expectedLow: 2, expectedHigh: 9, unit: 'failures/10 min', startedAt: iso(t - 50 * MIN), endedAt: iso(t - 38 * MIN), alertId: null },
    { id: 'an4', applicationId: 'a2', environmentId: 'a2-e1', metric: 'p95', title: 'Payments API slower than usual', direction: 'up', actual: 2600, expectedLow: 520, expectedHigh: 760, unit: 'ms', startedAt: iso(t - 45 * MIN), endedAt: iso(t - 34 * MIN), alertId: null },
  ];

  /* A shared application for account-wide cloud and identity assets. */
  const shared: Application = {
    id: 'a6', name: 'Shared infrastructure', description: 'Company-wide accounts that every application relies on: AWS and Google Workspace.', ownerId: 'u1', memberIds: ['u1', 'u3'],
    criticality: 'high', techStack: ['AWS', 'Google Workspace'], tags: ['shared'], status: 'active',
    environments: [{ id: 'a6-e1', applicationId: 'a6', name: 'Production', type: 'production' }], createdAt: iso(t - 30 * DAY), updatedAt: iso(t - 2 * DAY),
  };
  const approved = (note: string): Asset['authorization'] => ({ status: 'approved', method: 'approval', justification: note, approvedBy: 'u1', at: iso(t - 30 * DAY) });
  const asset = (id: string, identifier: string, label: string, applicationId: string, environmentId: string, exposure: Asset['exposure'], note: string): Asset => ({
    id, type: 'cloud', identifier, label, applicationId, environmentId, exposure, shared: applicationId === 'a6', status: 'active', createdAt: iso(t - 30 * DAY), authorization: approved(note),
  });
  const assets: Asset[] = [
    asset('s24', 'aws:s3:example-invoices-archive', 'Invoices archive bucket', 'a1', 'a1-e1', 'internet', 'Imported from AWS account 123456789012.'),
    asset('s25', 'aws:rds:payroll-db', 'Payroll database (RDS)', 'a3', 'a3-e1', 'internet', 'Imported from AWS account 123456789012.'),
    asset('s26', 'aws:account:123456789012', 'AWS account', 'a6', 'a6-e1', 'internet', 'Our AWS account, read through the SecurityAudit role.'),
    asset('s27', 'google-workspace:example.com', 'Google Workspace', 'a6', 'a6-e1', 'internet', 'Our Workspace, read through the Admin SDK.'),
  ];

  const apps = [...applications, shared];
  const all = [...allAssets, ...assets];
  const mk = (f: Pick<Finding, 'id' | 'title' | 'description' | 'assetId' | 'severity' | 'evidence' | 'source'> & Partial<Finding> & { daysAgo: number }): Finding => {
    const a = all.find((x) => x.id === f.assetId)!;
    const app = apps.find((x) => x.id === a.applicationId)!;
    const score = riskScore({ severity: f.severity, criticality: app.criticality, exposure: a.exposure, confidence: 'confirmed', knownExploited: false });
    const priority = priorityFor(score);
    const first = t - f.daysAgo * DAY;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { daysAgo: _d, ...rest } = f;
    return {
      category: 'security', applicationId: a.applicationId, environmentId: a.environmentId, confidence: 'confirmed', knownExploited: false, riskScore: score, priority,
      status: 'open', assigneeId: null, dueAt: iso(first + SLA_DAYS[priority] * DAY), firstSeen: iso(first), lastSeen: iso(t - 2 * HOUR), acceptedRisk: null,
      history: [{ at: iso(first), actorName: 'ShieldOps', text: 'Found by a cloud or identity check' }], ...rest,
    };
  };
  const findings: Finding[] = [
    mk({ id: 'f60', source: 'cloud', assetId: 's24', severity: 'high', daysAgo: 3, title: 'S3 bucket example-invoices-archive allows public read', description: 'Anyone on the internet can list and download objects in this bucket, which holds customer invoices. Turn on Block Public Access for the bucket and the account.', evidence: [{ label: 'Bucket', value: 'example-invoices-archive (ap-south-1)' }, { label: 'Why', value: 'Bucket policy grants s3:GetObject to Principal "*"' }, { label: 'Objects', value: 'About 18,400 PDF files' }] }),
    mk({ id: 'f61', source: 'cloud', assetId: 's25', severity: 'medium', daysAgo: 12, title: 'RDS instance payroll-db is publicly accessible', description: 'The database has a public endpoint. Even with a password it is exposed to brute force. Turn off public access and reach it through the private network.', evidence: [{ label: 'Instance', value: 'payroll-db (db.t3.medium, MySQL 8.0)' }, { label: 'Setting', value: 'PubliclyAccessible = true' }] }),
    mk({ id: 'f62', source: 'cloud', assetId: 's26', severity: 'critical', daysAgo: 20, title: 'AWS root account has no MFA', description: 'The root user can do anything in the account, including closing it. Add a hardware or app-based MFA device to it and stop using it day to day.', evidence: [{ label: 'Account', value: '123456789012' }, { label: 'Check', value: 'AccountMFAEnabled = 0' }] }),
    mk({ id: 'f63', source: 'cloud', assetId: 's26', severity: 'medium', daysAgo: 40, title: 'IAM access key for ci-deploy is 412 days old', description: 'Long-lived keys are the most common way AWS accounts are breached. Rotate it, or better, switch the pipeline to GitHub OIDC so no key is needed.', evidence: [{ label: 'User', value: 'ci-deploy' }, { label: 'Key', value: 'AKIA…7MQR, last used 2 hours ago' }] }),
    mk({ id: 'f64', source: 'cloud', assetId: 's26', severity: 'high', daysAgo: 6, title: 'Security group allows SSH from anywhere', description: 'sg-0a1b2c3d opens port 22 to 0.0.0.0/0 and is attached to reporting-01. Limit it to the office range or use Session Manager instead of SSH.', evidence: [{ label: 'Security group', value: 'sg-0a1b2c3d (reporting-ssh)' }, { label: 'Rule', value: 'Inbound TCP 22 from 0.0.0.0/0' }] }),
    mk({ id: 'f65', source: 'identity', assetId: 's27', severity: 'high', daysAgo: 9, title: '2 Workspace super admins have no 2-step verification', description: 'Admin accounts without 2-step verification can be taken over with one phished password. Enforce 2SV for the admin organisational unit.', evidence: [{ label: 'Accounts', value: 'r***@example.com, v***@example.com' }, { label: 'Super admins in total', value: '4' }] }),
    mk({ id: 'f66', source: 'identity', assetId: 's27', severity: 'medium', daysAgo: 15, title: 'Mail auto-forwarding to an external address', description: 'One account forwards all mail to a personal Gmail address. That copies company data outside your control. Block external auto-forwarding in Gmail settings.', evidence: [{ label: 'Account', value: 'm***@example.com' }, { label: 'Forwards to', value: 'a gmail.com address' }] }),
    mk({ id: 'f67', source: 'identity', assetId: 's27', severity: 'low', daysAgo: 30, title: 'Account inactive for 120 days is still enabled', description: 'Unused accounts are easy targets because nobody notices when they are used. Suspend accounts after 90 days without sign-in.', evidence: [{ label: 'Account', value: 'd***@example.com' }, { label: 'Last sign-in', value: '120 days ago' }] }),
  ];

  const alerts: Alert[] = [
    { id: 'al20', title: 'Traffic dropped on Field Ops Backend', message: 'About 41 requests per minute, against a usual 82 to 118 for this hour on a weekday.', severity: 'medium', status: 'open', source: 'anomaly', applicationId: 'a4', environmentId: 'a4-e1', assetId: null, ruleId: 'r33', firstAt: iso(t - 8 * MIN), lastAt: iso(t - MIN), occurrences: 8, acknowledgedBy: null, acknowledgedAt: null, snoozedUntil: null, resolvedAt: null, autoResolved: false, deliveries: [{ channel: 'in_app', recipient: 'All members', status: 'sent', at: iso(t - 8 * MIN), attempts: 1 }] },
  ];

  return { releases, probes, escalationPolicies, anomalies, jiraCounter: 101, assets, findings, alerts, applications: [shared] };
}