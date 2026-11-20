import type { Alert, AlertRule, Detection, ErrorGroup, IngestionKey, SecurityEvent, StackFrame } from '@/types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (t: number) => new Date(t).toISOString();

export interface ErrorGroupRecord extends Omit<ErrorGroup, 'trend'> {
  stack: StackFrame[];
  releases: string[];
  request: { method: string; route: string; status: number } | null;
  tags: Record<string, string[]>;
  ratePerHour: number;
  seed: number;
  history: { at: string; actorName: string; text: string }[];
}

export interface PerfRoute {
  method: string;
  route: string;
  share: number;
  err: number;
  p50: number;
  p95: number;
}

export interface PerfProfile {
  applicationId: string;
  environmentId: string;
  baseRpm: number;
  baseErr: number;
  p50: number;
  p95: number;
  routes: PerfRoute[];
  incidents: { from: string; to: string; kind: 'errors' | 'latency'; route?: string }[];
}

export interface StoredKey extends IngestionKey {
  /** Mock only: whether the app behind this key is "sending" data. */
  live: boolean;
}

export interface Phase3Data {
  errorGroups: ErrorGroupRecord[];
  perfProfiles: PerfProfile[];
  securityIncidents: SecurityEvent[];
  detections: Detection[];
  ingestionKeys: StoredKey[];
}

export const PHASE3_RULES: AlertRule[] = [
  { id: 'r14', name: 'New error group', signal: 'error_new', threshold: null, durationMin: null, severity: 'medium', scope: { applicationId: null, environmentType: null }, channels: ['in_app'], enabled: true, builtIn: true },
  { id: 'r15', name: 'Resolved error came back', signal: 'error_regression', threshold: null, durationMin: null, severity: 'high', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r16', name: 'Error spike', signal: 'error_spike', threshold: 5, durationMin: null, severity: 'high', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r17', name: 'High 5xx error rate', signal: 'error_rate', threshold: 5, durationMin: 5, severity: 'high', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r18', name: 'Traffic stopped', signal: 'traffic_drop', threshold: 10, durationMin: null, severity: 'medium', scope: { applicationId: null, environmentType: 'production' }, channels: ['in_app'], enabled: true, builtIn: true },
  { id: 'r19', name: 'Brute-force login attempts', signal: 'failed_logins', threshold: 10, durationMin: null, severity: 'high', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r20', name: 'Credential stuffing', signal: 'credential_stuffing', threshold: 10, durationMin: null, severity: 'critical', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r21', name: 'Spike in 401/403 responses', signal: 'auth_failure_spike', threshold: 3, durationMin: null, severity: 'medium', scope: { applicationId: null, environmentType: null }, channels: ['in_app'], enabled: true, builtIn: true },
];

export function emptyPhase3(): Phase3Data {
  return { errorGroups: [], perfProfiles: [], securityIncidents: [], detections: [], ingestionKeys: [] };
}

const f = (file: string, fn: string, line: number, column: number, inApp: boolean, code?: string): StackFrame => ({ file, fn, line, column, inApp, code });

export function seedPhase3(): Phase3Data & { alerts: Alert[] } {
  const t = Date.now();

  const group = (g: Partial<ErrorGroupRecord> & Pick<ErrorGroupRecord, 'id' | 'applicationId' | 'environmentId' | 'type' | 'message' | 'culprit' | 'platform' | 'status' | 'count' | 'usersAffected' | 'stack' | 'releases' | 'ratePerHour'> & { firstAgo: number; lastAgo: number }): ErrorGroupRecord => {
    const { firstAgo, lastAgo, ...rest } = g;
    return {
      fingerprint: `${g.type}:${g.culprit}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-'),
      firstSeen: iso(t - firstAgo),
      lastSeen: iso(t - lastAgo),
      assigneeId: null,
      lastRelease: g.releases[g.releases.length - 1],
      resolvedAt: null,
      request: null,
      tags: {},
      seed: g.id.charCodeAt(2) * 131,
      history: [{ at: iso(t - firstAgo), actorName: 'ShieldOps', text: 'First seen' }],
      ...rest,
    };
  };

  const expressTail = [f('node_modules/express/lib/router/layer.js', 'Layer.handle', 95, 5, false), f('node_modules/express/lib/router/route.js', 'next', 149, 13, false)];
  const node = { runtime: ['node 20.18.0'], os: ['linux'] };
  const browsers = { browser: ['Chrome 131', 'Safari 18.1', 'Edge 131', 'Firefox 133'], os: ['Windows 11', 'Android 14', 'iOS 18', 'macOS 15'] };

  const errorGroups: ErrorGroupRecord[] = [
    group({
      id: 'eg1', applicationId: 'a2', environmentId: 'a2-e1', platform: 'node', status: 'unresolved', type: 'TypeError', message: "Cannot read properties of undefined (reading 'amount')", culprit: 'createRefund in src/routes/refunds.ts',
      count: 342, usersAffected: 57, firstAgo: 3 * DAY, lastAgo: 4 * MIN, ratePerHour: 5, releases: ['payments-api@2.14.0', 'payments-api@2.14.1'], assigneeId: 'u3',
      request: { method: 'POST', route: '/api/refunds', status: 500 }, tags: node,
      stack: [
        f('src/routes/refunds.ts', 'createRefund', 48, 31, true, 'const amount = payment.capture.amount;'),
        f('src/services/refunds.ts', 'validateRefund', 22, 12, true, 'return createRefund(req.body.paymentId, user);'),
        ...expressTail,
        f('src/middleware/auth.ts', 'authenticate', 31, 5, true, 'return next();'),
      ],
    }),
    group({
      id: 'eg2', applicationId: 'a2', environmentId: 'a2-e1', platform: 'node', status: 'regressed', type: 'PaymentGatewayTimeoutError', message: 'UPI gateway did not respond within 10000 ms', culprit: 'charge in src/gateways/upi.ts',
      count: 89, usersAffected: 41, firstAgo: 12 * DAY, lastAgo: 9 * MIN, ratePerHour: 3, releases: ['payments-api@2.13.2', 'payments-api@2.14.1'], resolvedAt: iso(t - 2 * DAY),
      request: { method: 'POST', route: '/api/charges', status: 504 }, tags: node,
      stack: [
        f('src/gateways/upi.ts', 'charge', 112, 15, true, "throw new PaymentGatewayTimeoutError('UPI', this.timeoutMs);"),
        f('src/gateways/upi.ts', 'withTimeout', 34, 9, true, 'const res = await Promise.race([call, timer]);'),
        f('src/services/charges.ts', 'createCharge', 57, 22, true, 'const result = await gateway.charge(order);'),
        ...expressTail,
      ],
      history: [
        { at: iso(t - 60 * MIN), actorName: 'ShieldOps', text: 'Happened again after being resolved' },
        { at: iso(t - 2 * DAY), actorName: 'Kiran Shetty', text: 'Marked resolved' },
        { at: iso(t - 12 * DAY), actorName: 'ShieldOps', text: 'First seen' },
      ],
    }),
    group({
      id: 'eg3', applicationId: 'a2', environmentId: 'a2-e1', platform: 'node', status: 'ignored', type: 'ValidationError', message: 'amount must be a positive number', culprit: 'parseAmount in src/lib/money.ts',
      count: 1204, usersAffected: 380, firstAgo: 40 * DAY, lastAgo: 22 * MIN, ratePerHour: 2, releases: ['payments-api@2.14.1'], request: { method: 'POST', route: '/api/charges', status: 400 }, tags: node,
      stack: [f('src/lib/money.ts', 'parseAmount', 14, 11, true, "if (!(value > 0)) throw new ValidationError('amount must be a positive number');"), f('src/routes/charges.ts', 'createChargeRoute', 19, 20, true), ...expressTail],
    }),
    group({
      id: 'eg4', applicationId: 'a1', environmentId: 'a1-e1', platform: 'browser', status: 'unresolved', type: 'ChunkLoadError', message: 'Loading chunk 412 failed (timeout: /assets/invoices-4f1c.js)', culprit: 'requireEnsure in webpack/runtime/ensure chunk',
      count: 45, usersAffected: 31, firstAgo: 26 * HOUR, lastAgo: 47 * MIN, ratePerHour: 2, releases: ['portal-web@5.2.0'], tags: browsers,
      request: { method: 'GET', route: '/invoices', status: 0 },
      stack: [f('webpack/runtime/ensure chunk', 'requireEnsure', 6, 12, false), f('src/pages/Invoices.tsx', 'lazy', 3, 33, true, "const InvoicesPage = lazy(() => import('./InvoicesPage'));"), f('react-dom/client', 'renderWithHooks', 15486, 18, false)],
    }),
    group({
      id: 'eg5', applicationId: 'a1', environmentId: 'a1-e1', platform: 'browser', status: 'unresolved', type: 'TypeError', message: 'Failed to fetch', culprit: 'fetchOrders in src/api/orders.ts',
      count: 210, usersAffected: 120, firstAgo: 6 * DAY, lastAgo: 12 * MIN, ratePerHour: 3, releases: ['portal-web@5.1.4', 'portal-web@5.2.0'], tags: browsers, request: { method: 'GET', route: '/orders', status: 0 },
      stack: [f('src/api/orders.ts', 'fetchOrders', 18, 21, true, "const res = await fetch(`${API}/orders?page=${page}`);"), f('src/hooks/useOrders.ts', 'queryFn', 9, 26, true), f('@tanstack/query-core', 'fetchFn', 412, 13, false)],
    }),
    group({
      id: 'eg6', applicationId: 'a1', environmentId: 'a1-e1', platform: 'node', status: 'resolved', type: 'MongoServerSelectionError', message: 'Server selection timed out after 30000 ms', culprit: 'connect in src/db/mongo.ts',
      count: 14, usersAffected: 9, firstAgo: 9 * DAY, lastAgo: 5 * DAY + 2 * HOUR, ratePerHour: 0, releases: ['portal-api@3.8.0'], resolvedAt: iso(t - 5 * DAY), tags: node,
      stack: [f('node_modules/mongodb/lib/sdam/topology.js', 'Topology.selectServer', 292, 30, false), f('src/db/mongo.ts', 'connect', 21, 5, true, 'await client.connect();'), f('src/server.ts', 'start', 12, 3, true)],
    }),
    group({
      id: 'eg7', applicationId: 'a4', environmentId: 'a4-e1', platform: 'node', status: 'unresolved', type: 'Error', message: 'ENOSPC: no space left on device, write', culprit: 'savePhoto in src/uploads/photos.ts',
      count: 76, usersAffected: 23, firstAgo: 25 * MIN, lastAgo: 1 * MIN, ratePerHour: 180, releases: ['field-api@1.9.3'], request: { method: 'POST', route: '/api/photos', status: 500 }, tags: node,
      stack: [f('node:fs', 'writeSync', 918, 3, false), f('src/uploads/photos.ts', 'savePhoto', 41, 8, true, 'fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);'), f('src/routes/photos.ts', 'uploadPhoto', 27, 18, true), ...expressTail],
    }),
    group({
      id: 'eg8', applicationId: 'a4', environmentId: 'a4-e1', platform: 'node', status: 'unresolved', type: 'SyntaxError', message: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`, culprit: 'syncJobs in src/sync/jobs.ts',
      count: 33, usersAffected: 0, firstAgo: 4 * DAY, lastAgo: 3 * HOUR, ratePerHour: 0.4, releases: ['field-api@1.9.2', 'field-api@1.9.3'], tags: node,
      stack: [f('src/sync/jobs.ts', 'syncJobs', 66, 30, true, 'const jobs = JSON.parse(await res.text());'), f('src/sync/scheduler.ts', 'tick', 14, 9, true)],
    }),
    group({
      id: 'eg9', applicationId: 'a3', environmentId: 'a3-e1', platform: 'node', status: 'unresolved', type: 'RangeError', message: 'Invalid time value', culprit: 'formatPayPeriod in src/payslips/format.ts',
      count: 12, usersAffected: 3, firstAgo: 2 * DAY, lastAgo: 5 * HOUR, ratePerHour: 0.3, releases: ['payroll@4.0.1'], request: { method: 'GET', route: '/api/payslips/:id/pdf', status: 500 }, tags: node,
      stack: [f('src/payslips/format.ts', 'formatPayPeriod', 9, 32, true, "return format(new Date(period.end), 'MMM yyyy');"), f('src/payslips/pdf.ts', 'renderPayslip', 54, 17, true), ...expressTail],
    }),
    group({
      id: 'eg10', applicationId: 'a5', environmentId: 'a5-e1', platform: 'browser', status: 'ignored', type: 'ReferenceError', message: 'gtag is not defined', culprit: 'trackSignup in src/analytics.ts',
      count: 640, usersAffected: 512, firstAgo: 30 * DAY, lastAgo: 2 * HOUR, ratePerHour: 1, releases: ['marketing@2026.11.02'], tags: browsers,
      stack: [f('src/analytics.ts', 'trackSignup', 4, 3, true, "gtag('event', 'sign_up');"), f('src/components/LeadForm.tsx', 'onSubmit', 37, 7, true)],
    }),
  ];

  const route = (method: string, r: string, share: number, err: number, p50: number, p95: number): PerfRoute => ({ method, route: r, share, err, p50, p95 });
  const perfProfiles: PerfProfile[] = [
    {
      applicationId: 'a1', environmentId: 'a1-e1', baseRpm: 420, baseErr: 0.4, p50: 140, p95: 380, incidents: [],
      routes: [route('GET', '/api/orders', 0.3, 0.3, 120, 340), route('GET', '/api/profile', 0.2, 0.1, 60, 150), route('GET', '/api/invoices', 0.18, 0.4, 150, 420), route('POST', '/api/orders', 0.08, 1.2, 260, 690), route('POST', '/api/auth/login', 0.06, 0.6, 210, 480), route('GET', '/api/invoices/:id/pdf', 0.04, 0.9, 900, 2400), route('GET', '/health', 0.14, 0, 4, 9)],
    },
    {
      applicationId: 'a2', environmentId: 'a2-e1', baseRpm: 180, baseErr: 0.8, p50: 210, p95: 620,
      incidents: [{ from: iso(t - 45 * MIN), to: iso(t - 34 * MIN), kind: 'latency' }],
      routes: [route('POST', '/api/charges', 0.4, 0.6, 320, 900), route('GET', '/api/payments/:id', 0.35, 0.2, 80, 190), route('POST', '/api/webhooks/upi', 0.15, 0.3, 140, 380), route('POST', '/api/refunds', 0.05, 6.2, 260, 740), route('GET', '/health', 0.05, 0, 3, 8)],
    },
    {
      applicationId: 'a3', environmentId: 'a3-e1', baseRpm: 12, baseErr: 0.2, p50: 90, p95: 260, incidents: [],
      routes: [route('GET', '/api/payslips', 0.45, 0.1, 70, 180), route('GET', '/api/employees', 0.3, 0.1, 60, 160), route('GET', '/api/payslips/:id/pdf', 0.2, 1.1, 640, 1900), route('POST', '/api/payroll/run', 0.05, 0.5, 2100, 4800)],
    },
    {
      applicationId: 'a4', environmentId: 'a4-e1', baseRpm: 95, baseErr: 1.1, p50: 180, p95: 520,
      incidents: [{ from: iso(t - 8 * MIN), to: iso(t + 365 * DAY), kind: 'errors', route: '/api/photos' }],
      routes: [route('GET', '/api/jobs', 0.42, 0.4, 110, 300), route('POST', '/api/checkins', 0.25, 0.8, 160, 420), route('POST', '/api/photos', 0.2, 1.4, 480, 1300), route('GET', '/api/admin/jobs', 0.05, 2.0, 140, 360), route('GET', '/health', 0.08, 0, 3, 7)],
    },
  ];

  let n = 0;
  const ev = (at: number, e: Omit<SecurityEvent, 'id' | 'at'>): SecurityEvent => ({ id: `se-i${n++}`, at: iso(at), ...e });
  const securityIncidents: SecurityEvent[] = [];
  const letters = 'abcdefghijklmnoprstuvwy';
  const domains = ['example.com', 'example.net', 'example.org', 'mail.example'];
  for (let i = 0; i < 46; i++) {
    securityIncidents.push(
      ev(t - 50 * MIN + i * 13_000, {
        applicationId: 'a1', environmentId: 'a1-e1', type: 'login_failure', actorHash: null, account: `${letters[i % letters.length]}${letters[(i * 7 + 3) % letters.length]}***@${domains[i % domains.length]}`,
        ip: '203.0.113.77', country: 'NL', method: 'POST', route: '/api/auth/login', status: 401, result: 'failure',
      }),
    );
  }
  for (let i = 0; i < 8; i++) {
    securityIncidents.push(ev(t - 40 * MIN + i * 20_000, { applicationId: 'a1', environmentId: 'a1-e1', type: 'rate_limited', actorHash: null, account: null, ip: '203.0.113.77', country: 'NL', method: 'POST', route: '/api/auth/login', status: 429, result: 'blocked' }));
  }
  for (let i = 0; i < 12; i++) {
    securityIncidents.push(ev(t - 3 * HOUR + i * 19_000, { applicationId: 'a2', environmentId: 'a2-e1', type: 'login_failure', actorHash: 'usr_41c9e2', account: 'a***@example.com', ip: '198.51.100.23', country: 'US', method: 'POST', route: '/admin/login', status: 401, result: 'failure' }));
  }
  securityIncidents.push(ev(t - 3 * HOUR + 12 * 19_000, { applicationId: 'a2', environmentId: 'a2-e1', type: 'mfa_failure', actorHash: 'usr_41c9e2', account: 'a***@example.com', ip: '198.51.100.23', country: 'US', method: 'POST', route: '/admin/mfa', status: 401, result: 'failure' }));
  for (let i = 0; i < 30; i++) {
    securityIncidents.push(ev(t - 20 * MIN + i * 9_000, { applicationId: 'a4', environmentId: 'a4-e1', type: 'authz_failure', actorHash: 'usr_7d02aa', account: 'f***@example.com', ip: '192.0.2.140', country: 'IN', method: 'GET', route: '/api/admin/jobs', status: 403, result: 'failure' }));
  }

  const detections: Detection[] = [
    { id: 'd1', rule: 'credential_stuffing', applicationId: 'a1', environmentId: 'a1-e1', subject: '203.0.113.77', count: 46, distinctAccounts: 46, windowMin: 10, firstAt: iso(t - 50 * MIN), lastAt: iso(t - 40 * MIN), alertId: 'al8' },
    { id: 'd2', rule: 'failed_logins', applicationId: 'a2', environmentId: 'a2-e1', subject: '198.51.100.23', count: 12, distinctAccounts: 1, windowMin: 5, firstAt: iso(t - 3 * HOUR), lastAt: iso(t - 3 * HOUR + 4 * MIN), alertId: 'al9' },
    { id: 'd3', rule: 'auth_failure_spike', applicationId: 'a4', environmentId: 'a4-e1', subject: 'GET /api/admin/jobs', count: 30, distinctAccounts: 1, windowMin: 5, firstAt: iso(t - 20 * MIN), lastAt: iso(t - 15 * MIN), alertId: null },
  ];

  const key = (k: Partial<StoredKey> & Pick<StoredKey, 'id' | 'name' | 'kind' | 'applicationId' | 'environmentId' | 'prefix'>): StoredKey => ({
    scopes: k.kind === 'browser' ? ['errors'] : ['errors', 'performance', 'security_events'],
    status: 'active', createdAt: iso(t - 20 * DAY), createdBy: 'u1', lastUsedAt: iso(t - 30_000), eventsLast24h: 0, revokedAt: null, live: true, ...k,
  });
  const ingestionKeys: StoredKey[] = [
    key({ id: 'k1', name: 'Payments API server', kind: 'server', applicationId: 'a2', environmentId: 'a2-e1', prefix: 'so_live_7f3a', eventsLast24h: 52_400 }),
    key({ id: 'k2', name: 'Portal API server', kind: 'server', applicationId: 'a1', environmentId: 'a1-e1', prefix: 'so_live_b81e', eventsLast24h: 121_800 }),
    key({ id: 'k3', name: 'Portal web app', kind: 'browser', applicationId: 'a1', environmentId: 'a1-e1', prefix: 'so_pub_9c1e', eventsLast24h: 260 }),
    key({ id: 'k4', name: 'Field API server', kind: 'server', applicationId: 'a4', environmentId: 'a4-e1', prefix: 'so_live_44d0', eventsLast24h: 27_300 }),
    key({ id: 'k5', name: 'Payroll server', kind: 'server', applicationId: 'a3', environmentId: 'a3-e1', prefix: 'so_live_e2c7', eventsLast24h: 3_900, createdBy: 'u2' }),
    key({ id: 'k6', name: 'Payments staging (old)', kind: 'server', applicationId: 'a2', environmentId: 'a2-e2', prefix: 'so_live_0a9d', status: 'revoked', revokedAt: iso(t - 6 * DAY), lastUsedAt: iso(t - 6 * DAY), live: false }),
  ];

  const sent = (at: number): Alert['deliveries'] => [
    { channel: 'in_app', recipient: 'All members', status: 'sent', at: iso(at), attempts: 1 },
    { channel: 'email', recipient: 'it-alerts@example.com', status: 'sent', at: iso(at + 4000), attempts: 1 },
  ];
  const base = { assetId: null, occurrences: 1, acknowledgedBy: null, acknowledgedAt: null, snoozedUntil: null, resolvedAt: null, autoResolved: false } as const;
  const alerts: Alert[] = [
    { ...base, id: 'al8', title: 'Credential stuffing on Customer Portal from 203.0.113.77', message: '46 failed logins across 46 different accounts in 10 minutes. The IP was rate-limited afterwards.', severity: 'critical', status: 'open', source: 'security_events', applicationId: 'a1', environmentId: 'a1-e1', ruleId: 'r20', firstAt: iso(t - 41 * MIN), lastAt: iso(t - 40 * MIN), deliveries: sent(t - 41 * MIN) },
    { ...base, id: 'al9', title: '12 failed admin logins on Payments API', message: 'All for one account (a***@example.com) from 198.51.100.23 in 4 minutes, followed by a failed MFA attempt.', severity: 'high', status: 'acknowledged', source: 'security_events', applicationId: 'a2', environmentId: 'a2-e1', ruleId: 'r19', firstAt: iso(t - 3 * HOUR + 3 * MIN), lastAt: iso(t - 3 * HOUR + 4 * MIN), acknowledgedBy: 'u3', acknowledgedAt: iso(t - 2 * HOUR), deliveries: sent(t - 3 * HOUR + 3 * MIN) },
    { ...base, id: 'al10', title: 'New error on Field Ops Backend: ENOSPC no space left on device', message: 'First seen 25 minutes ago in savePhoto (src/uploads/photos.ts). 76 events so far.', severity: 'medium', status: 'open', source: 'errors', applicationId: 'a4', environmentId: 'a4-e1', ruleId: 'r14', firstAt: iso(t - 25 * MIN), lastAt: iso(t - MIN), occurrences: 76, deliveries: sent(t - 25 * MIN).slice(0, 1) },
    { ...base, id: 'al11', title: 'PaymentGatewayTimeoutError is back on Payments API', message: 'Marked resolved 2 days ago; it has happened again in payments-api@2.14.1.', severity: 'high', status: 'open', source: 'errors', applicationId: 'a2', environmentId: 'a2-e1', ruleId: 'r15', firstAt: iso(t - 60 * MIN), lastAt: iso(t - 9 * MIN), occurrences: 6, deliveries: sent(t - 60 * MIN) },
    { ...base, id: 'al12', title: '5xx rate above 5% on Field Ops Backend', message: 'POST /api/photos is failing on most requests. Overall 5xx rate is above 30%.', severity: 'high', status: 'open', source: 'performance', applicationId: 'a4', environmentId: 'a4-e1', ruleId: 'r17', firstAt: iso(t - 6 * MIN), lastAt: iso(t - MIN), occurrences: 5, deliveries: sent(t - 6 * MIN) },
  ];

  return { errorGroups, perfProfiles, securityIncidents, detections, ingestionKeys, alerts };
}