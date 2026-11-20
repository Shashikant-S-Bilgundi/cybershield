import type {
  Alert,
  AlertRule,
  Application,
  Asset,
  Certificate,
  CheckErrorCode,
  CheckResult,
  CheckStatus,
  DnsSnapshot,
  DomainExpiry,
  Finding,
  HeaderReport,
  Heartbeat,
  MaintenanceWindow,
  Monitor,
  MonitorEvent,
  NotificationChannels,
  SecurityHeaderName,
} from '@/types';
import { priorityFor, riskScore, SLA_DAYS } from '@/lib/risk';

/** How the mock keeps a monitor behaving as time passes. */
export type Sim = 'up' | 'down' | 'flaky';

export interface MonitorRecord extends Omit<Monitor, 'status' | 'lastCheckAt' | 'lastLatencyMs' | 'uptime'> {
  paused: boolean;
  results: CheckResult[];
  events: MonitorEvent[];
  sim: Sim;
  latencyBase: number;
  uptimeBase: { d7: number; d30: number };
}

export interface HeartbeatRecord extends Omit<Heartbeat, 'status' | 'nextDueAt'> {
  paused: boolean;
  /** For cron schedules the mock stores the next due time directly. */
  cronNextDueAt: string | null;
  /** 'healthy' keeps pinging on time; 'missing' stops. */
  sim: 'healthy' | 'missing';
}

export interface Phase2Data {
  monitors: MonitorRecord[];
  heartbeats: HeartbeatRecord[];
  certificates: Certificate[];
  dns: DnsSnapshot[];
  domains: DomainExpiry[];
  headers: HeaderReport[];
  alerts: Alert[];
  findings: Finding[];
  alertRules: AlertRule[];
  channels: NotificationChannels;
  maintenance: MaintenanceWindow[];
}

const MIN = 60_000;
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();

function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export const DEFAULT_RULES: AlertRule[] = [
  { id: 'r1', name: 'Production site down', signal: 'uptime_down', threshold: 3, durationMin: null, severity: 'critical', scope: { applicationId: null, environmentType: 'production' }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r2', name: 'Site down (other environments)', signal: 'uptime_down', threshold: 3, durationMin: null, severity: 'high', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r3', name: 'Slow responses', signal: 'latency_p95', threshold: 2000, durationMin: 5, severity: 'medium', scope: { applicationId: null, environmentType: null }, channels: ['in_app'], enabled: true, builtIn: true },
  { id: 'r4', name: 'Scheduled job missed', signal: 'heartbeat_missed', threshold: null, durationMin: null, severity: 'high', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r5', name: 'SSL expires within 30 days', signal: 'ssl_expiry', threshold: 30, durationMin: null, severity: 'low', scope: { applicationId: null, environmentType: null }, channels: ['in_app'], enabled: true, builtIn: true },
  { id: 'r6', name: 'SSL expires within 14 days', signal: 'ssl_expiry', threshold: 14, durationMin: null, severity: 'medium', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r7', name: 'SSL expires within 7 days', signal: 'ssl_expiry', threshold: 7, durationMin: null, severity: 'high', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r8', name: 'SSL expires tomorrow', signal: 'ssl_expiry', threshold: 1, durationMin: null, severity: 'critical', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r9', name: 'Domain expires within 60 days', signal: 'domain_expiry', threshold: 60, durationMin: null, severity: 'low', scope: { applicationId: null, environmentType: null }, channels: ['in_app'], enabled: true, builtIn: true },
  { id: 'r10', name: 'Domain expires within 30 days', signal: 'domain_expiry', threshold: 30, durationMin: null, severity: 'medium', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r11', name: 'Domain expires within 7 days', signal: 'domain_expiry', threshold: 7, durationMin: null, severity: 'critical', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r12', name: 'DNS records changed', signal: 'dns_change', threshold: null, durationMin: null, severity: 'medium', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true, builtIn: true },
  { id: 'r13', name: 'HSTS or CSP missing in production', signal: 'headers_missing', threshold: null, durationMin: null, severity: 'low', scope: { applicationId: null, environmentType: 'production' }, channels: ['in_app'], enabled: true, builtIn: true },
];

export function emptyPhase2(): Phase2Data {
  return {
    monitors: [],
    heartbeats: [],
    certificates: [],
    dns: [],
    domains: [],
    headers: [],
    alerts: [],
    findings: [],
    alertRules: structuredClone(DEFAULT_RULES),
    channels: { emailRecipients: [], criticalRenotifyMin: 15, maxRenotify: 4 },
    maintenance: [],
  };
}

/** Builds state-change events from a run of results. */
export function eventsFrom(results: CheckResult[], downAfter: number): MonitorEvent[] {
  const events: MonitorEvent[] = [];
  let state: CheckResult['status'] | null = null;
  let downRun = 0;
  results.forEach((r) => {
    downRun = r.status === 'down' ? downRun + 1 : 0;
    const effective = r.status === 'down' ? (downRun >= downAfter ? 'down' : state ?? 'up') : r.status;
    if (state !== null && effective !== state) {
      const reason =
        effective === 'down'
          ? `${downAfter} checks in a row failed (${(r.error ?? 'UNEXPECTED_STATUS').replace(/_/g, ' ').toLowerCase()})`
          : effective === 'degraded'
            ? 'Response time above 2,000 ms'
            : effective === 'unknown'
              ? 'ShieldOps could not run the check'
              : 'Checks passing again';
      events.push({ at: r.at, from: state, to: effective, reason });
    }
    state = effective;
  });
  return events.reverse();
}

function genResults(
  seed: number,
  count: number,
  intervalSec: number,
  latencyBase: number,
  pattern: (i: number) => { status: CheckStatus; error?: CheckErrorCode },
): CheckResult[] {
  const rand = prng(seed);
  const end = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const { status, error } = pattern(i);
    const at = iso(end - (count - 1 - i) * intervalSec * 1000);
    if (status === 'down' || status === 'unknown') return { at, status, latencyMs: null, error, statusCode: error === 'UNEXPECTED_STATUS' ? 502 : undefined };
    const base = status === 'degraded' ? 2300 : latencyBase;
    return { at, status, latencyMs: Math.round(base + rand() * base * 0.5), statusCode: 200 };
  });
}

const HEADERS: SecurityHeaderName[] = [
  'strict-transport-security',
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
];

const HEADER_VALUES: Record<SecurityHeaderName, string> = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': "default-src 'self'; img-src 'self' data:",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

export function seedPhase2(applications: Application[], assets: Asset[]): Phase2Data {
  const t = Date.now();
  const asset = (id: string) => assets.find((a) => a.id === id)!;
  const app = (id: string) => applications.find((a) => a.id === id)!;

  const mon = (
    id: string,
    name: string,
    type: Monitor['type'],
    assetId: string,
    target: string,
    sim: Sim,
    latencyBase: number,
    uptimeBase: { d7: number; d30: number },
    count: number,
    pattern: (i: number) => { status: CheckStatus; error?: CheckErrorCode },
    extra: Partial<MonitorRecord> = {},
  ): MonitorRecord => {
    const a = asset(assetId);
    const results = genResults(id.length * 97 + latencyBase, count, 60, latencyBase, pattern);
    return {
      id,
      name,
      type,
      applicationId: a.applicationId,
      environmentId: a.environmentId,
      assetId,
      target,
      intervalSec: 60,
      timeoutMs: 10_000,
      downAfterFailures: 3,
      expectedStatus: type === 'http' ? '200-299' : undefined,
      paused: false,
      createdAt: iso(t - 20 * DAY),
      results,
      events: eventsFrom(results, 3),
      sim,
      latencyBase,
      uptimeBase,
      ...extra,
    };
  };

  const up = () => ({ status: 'up' as const });
  const monitors: MonitorRecord[] = [
    mon('m1', 'Portal home page', 'http', 's1', 'https://portal.example.com', 'up', 180, { d7: 100, d30: 99.98 }, 120, up, { keyword: 'Sign in' }),
    mon('m2', 'Portal API health', 'http', 's2', 'https://portal.example.com/api/health', 'up', 120, { d7: 99.99, d30: 99.97 }, 120, up),
    mon('m3', 'Payments API health', 'http', 's6', 'https://api.pay.example.com/health', 'up', 210, { d7: 99.95, d30: 99.9 }, 120, (i) => (i > 96 && i < 108 ? { status: 'degraded' } : { status: 'up' })),
    mon('m4', 'Payments database port', 'tcp', 's7', '10.0.2.15:5432', 'up', 4, { d7: 100, d30: 100 }, 120, up, { expectedStatus: undefined }),
    mon('m5', 'Payments domain resolves', 'dns', 's5', 'pay.example.com', 'up', 30, { d7: 100, d30: 100 }, 120, up, { recordType: 'A', intervalSec: 60 }),
    mon('m6', 'Payroll web', 'http', 's9', 'https://payroll.internal.example.com', 'up', 90, { d7: 99.4, d30: 99.6 }, 120, (i) => (i < 30 ? { status: 'unknown', error: 'WORKER_ERROR' } : { status: 'up' })),
    mon('m7', 'Field API health', 'http', 's11', 'https://field.example.com/api/health', 'down', 260, { d7: 98.7, d30: 99.5 }, 120, (i) =>
      i >= 113 ? { status: 'down', error: i % 2 ? 'TIMEOUT' : 'UNEXPECTED_STATUS' } : i > 70 && i < 74 ? { status: 'degraded' } : { status: 'up' },
    ),
    mon('m8', 'Marketing site', 'http', 's13', 'https://www.example.com', 'up', 140, { d7: 100, d30: 99.99 }, 120, up, { keyword: 'Contact us' }),
  ];

  const hbUrl = (token: string) => `${window.location.origin}/hb/${token}`;
  const heartbeats: HeartbeatRecord[] = [
    {
      id: 'h1', name: 'Nightly database backup', applicationId: 'a2', environmentId: 'a2-e1',
      schedule: { kind: 'cron', expression: '0 2 * * *' }, graceSec: 1800, paused: false, sim: 'missing',
      lastPingAt: iso(t - 26 * 60 * MIN), cronNextDueAt: iso(t - 2 * 60 * MIN), pingUrl: hbUrl('7d1f3a9e2c'),
      recent: [
        { at: iso(t - 26 * 60 * MIN), kind: 'success', late: false },
        { at: iso(t - 26 * 60 * MIN - 9 * MIN), kind: 'start', late: false },
        { at: iso(t - 50 * 60 * MIN), kind: 'success', late: false },
        { at: iso(t - 50 * 60 * MIN - 8 * MIN), kind: 'start', late: false },
      ],
      createdAt: iso(t - 30 * DAY),
    },
    {
      id: 'h2', name: 'Invoice email job', applicationId: 'a1', environmentId: 'a1-e1',
      schedule: { kind: 'interval', seconds: 900 }, graceSec: 300, paused: false, sim: 'healthy',
      lastPingAt: iso(t - 4 * MIN), cronNextDueAt: null, pingUrl: hbUrl('b42e91c07a'),
      recent: [0, 1, 2, 3].map((k) => ({ at: iso(t - 4 * MIN - k * 15 * MIN), kind: 'success' as const, late: k === 2 })),
      createdAt: iso(t - 25 * DAY),
    },
    {
      id: 'h3', name: 'Monthly payroll export', applicationId: 'a3', environmentId: 'a3-e1',
      schedule: { kind: 'cron', expression: '0 6 1 * *' }, graceSec: 3600, paused: false, sim: 'healthy',
      lastPingAt: iso(t - 17 * DAY), cronNextDueAt: iso(t + 13 * DAY), pingUrl: hbUrl('e09c5d71f4'),
      recent: [{ at: iso(t - 17 * DAY), kind: 'success', late: false }],
      createdAt: iso(t - 60 * DAY),
    },
    {
      id: 'h4', name: 'Field photo sync', applicationId: 'a4', environmentId: 'a4-e2',
      schedule: { kind: 'interval', seconds: 300 }, graceSec: 180, paused: true, sim: 'healthy',
      lastPingAt: iso(t - 3 * DAY), cronNextDueAt: null, pingUrl: hbUrl('41aa8c3e90'),
      recent: [{ at: iso(t - 3 * DAY), kind: 'fail', late: false }],
      createdAt: iso(t - 10 * DAY),
    },
  ];

  const checkedAt = iso(t - 3 * 60 * MIN);
  const cert = (assetId: string, host: string, issuer: string, daysLeft: number, extra: Partial<Certificate> = {}): Certificate => ({
    assetId, applicationId: asset(assetId).applicationId, host, issuer,
    validFrom: iso(t - (90 - daysLeft) * DAY), validTo: iso(t + daysLeft * DAY),
    chainValid: true, hostnameMatch: true, protocol: 'TLS 1.3', weakCiphers: false, checkedAt, ...extra,
  });
  const certificates: Certificate[] = [
    cert('s1', 'portal.example.com', "Let's Encrypt R11", 12),
    cert('s6', 'api.pay.example.com', 'DigiCert Global G2', 58, { validFrom: iso(t - 307 * DAY) }),
    cert('s5', 'pay.example.com', 'DigiCert Global G2', 58, { validFrom: iso(t - 307 * DAY) }),
    cert('s9', 'payroll.internal.example.com', 'Example Internal CA', 300, { chainValid: false, validFrom: iso(t - 65 * DAY), protocol: 'TLS 1.2' }),
    cert('s11', 'field.example.com', 'Sectigo RSA DV', 140, { protocol: 'TLS 1.2, TLS 1.0 still enabled', weakCiphers: true, validFrom: iso(t - 225 * DAY) }),
    cert('s13', 'www.example.com', "Let's Encrypt R10", 5),
  ];

  const dns: DnsSnapshot[] = [
    {
      assetId: 's1', applicationId: 'a1', host: 'portal.example.com', checkedAt: iso(t - 40 * MIN),
      records: [
        { type: 'A', value: '203.0.113.21', ttl: 300 },
        { type: 'MX', value: '10 mail.example.com', ttl: 3600 },
        { type: 'NS', value: 'ns1.example-dns.net', ttl: 86400 },
        { type: 'NS', value: 'ns2.example-dns.net', ttl: 86400 },
        { type: 'TXT', value: 'shieldops-verify=4be1c90a77', ttl: 300 },
        { type: 'CAA', value: '0 issue "letsencrypt.org"', ttl: 3600 },
      ],
      changes: [{ at: iso(t - 33 * DAY), type: 'A', before: ['203.0.113.9'], after: ['203.0.113.21'] }],
    },
    {
      assetId: 's5', applicationId: 'a2', host: 'pay.example.com', checkedAt: iso(t - 40 * MIN),
      records: [
        { type: 'A', value: '198.51.100.12', ttl: 300 },
        { type: 'AAAA', value: '2001:db8::12', ttl: 300 },
        { type: 'MX', value: '1 smtp.mailhost.example.net', ttl: 3600 },
        { type: 'NS', value: 'ns1.example-dns.net', ttl: 86400 },
        { type: 'TXT', value: 'v=spf1 include:mailhost.example.net -all', ttl: 3600 },
      ],
      changes: [{ at: iso(t - 2 * DAY - 5 * 60 * MIN), type: 'MX', before: ['10 mx.oldmail.example.org'], after: ['1 smtp.mailhost.example.net'] }],
    },
    {
      assetId: 's13', applicationId: 'a5', host: 'www.example.com', checkedAt: iso(t - 40 * MIN),
      records: [
        { type: 'CNAME', value: 'example-marketing.pages.dev', ttl: 300 },
        { type: 'NS', value: 'ns1.example-dns.net', ttl: 86400 },
      ],
      changes: [],
    },
  ];

  const domains: DomainExpiry[] = [
    { assetId: 's1', applicationId: 'a1', domain: 'portal.example.com', registrar: 'GoDaddy', expiresAt: iso(t + 210 * DAY), source: 'rdap', checkedAt },
    { assetId: 's5', applicationId: 'a2', domain: 'pay.example.com', registrar: 'Namecheap', expiresAt: iso(t + 41 * DAY), source: 'rdap', checkedAt },
    { assetId: 's13', applicationId: 'a5', domain: 'www.example.com', registrar: null, expiresAt: null, source: 'unavailable', checkedAt },
  ];

  const hdr = (assetId: string, url: string, missing: SecurityHeaderName[], issues: Partial<Record<SecurityHeaderName, string>> = {}): HeaderReport => ({
    assetId, applicationId: asset(assetId).applicationId, environmentId: asset(assetId).environmentId, url, checkedAt,
    headers: Object.fromEntries(
      HEADERS.map((h) => [h, missing.includes(h) ? { present: false } : { present: true, value: HEADER_VALUES[h], issue: issues[h] }]),
    ) as HeaderReport['headers'],
  });
  const headers: HeaderReport[] = [
    hdr('s1', 'https://portal.example.com', ['strict-transport-security', 'permissions-policy']),
    hdr('s6', 'https://api.pay.example.com', ['permissions-policy']),
    hdr('s9', 'https://payroll.internal.example.com', ['strict-transport-security', 'x-frame-options']),
    hdr('s11', 'https://field.example.com', ['content-security-policy'], { 'strict-transport-security': 'max-age is only 300 seconds' }),
    hdr('s13', 'https://www.example.com', ['content-security-policy', 'referrer-policy', 'permissions-policy']),
  ];

  const delivered = (at: number, failedEmail = false): Alert['deliveries'] => [
    { channel: 'in_app', recipient: 'All members', status: 'sent', at: iso(at), attempts: 1 },
    { channel: 'email', recipient: 'it-alerts@example.com', status: failedEmail ? 'failed' : 'sent', at: iso(at + 5000), attempts: failedEmail ? 3 : 1 },
  ];
  const alert = (a: Partial<Alert> & Pick<Alert, 'id' | 'title' | 'message' | 'severity' | 'status' | 'source' | 'applicationId' | 'environmentId'>): Alert => ({
    assetId: null, ruleId: null, firstAt: iso(t), lastAt: iso(t), occurrences: 1, acknowledgedBy: null, acknowledgedAt: null,
    snoozedUntil: null, resolvedAt: null, autoResolved: false, deliveries: [], ...a,
  });
  const alerts: Alert[] = [
    alert({ id: 'al1', title: 'Field API health is down', message: 'Checks to https://field.example.com/api/health have failed 7 times in a row: timeouts and 502 responses.', severity: 'critical', status: 'open', source: 'uptime', applicationId: 'a4', environmentId: 'a4-e1', assetId: 's11', ruleId: 'r1', firstAt: iso(t - 5 * MIN), lastAt: iso(t - MIN), occurrences: 5, deliveries: delivered(t - 5 * MIN, true) }),
    alert({ id: 'al2', title: "Nightly database backup didn't run", message: 'No ping since yesterday. The job was due at 02:00 with a 30-minute grace period.', severity: 'high', status: 'open', source: 'heartbeat', applicationId: 'a2', environmentId: 'a2-e1', ruleId: 'r4', firstAt: iso(t - 90 * MIN), lastAt: iso(t - 90 * MIN), deliveries: delivered(t - 90 * MIN) }),
    alert({ id: 'al3', title: 'SSL certificate for www.example.com expires in 5 days', message: "Issued by Let's Encrypt R10. Renew it or check that automatic renewal is running.", severity: 'high', status: 'open', source: 'ssl', applicationId: 'a5', environmentId: 'a5-e1', assetId: 's13', ruleId: 'r7', firstAt: iso(t - 2 * DAY), lastAt: iso(t - 3 * 60 * MIN), occurrences: 3, deliveries: delivered(t - 2 * DAY) }),
    alert({ id: 'al4', title: 'SSL certificate for portal.example.com expires in 12 days', message: "Issued by Let's Encrypt R11.", severity: 'medium', status: 'acknowledged', source: 'ssl', applicationId: 'a1', environmentId: 'a1-e1', assetId: 's1', ruleId: 'r6', firstAt: iso(t - 3 * DAY), lastAt: iso(t - 3 * 60 * MIN), occurrences: 4, acknowledgedBy: 'u2', acknowledgedAt: iso(t - 2 * DAY), deliveries: delivered(t - 3 * DAY) }),
    alert({ id: 'al5', title: 'MX record changed on pay.example.com', message: 'Mail now goes to smtp.mailhost.example.net instead of mx.oldmail.example.org.', severity: 'medium', status: 'open', source: 'dns', applicationId: 'a2', environmentId: 'a2-e1', assetId: 's5', ruleId: 'r12', firstAt: iso(t - 2 * DAY - 5 * 60 * MIN), lastAt: iso(t - 2 * DAY - 5 * 60 * MIN), deliveries: delivered(t - 2 * DAY - 5 * 60 * MIN) }),
    alert({ id: 'al6', title: 'Payments API responses slower than 2,000 ms', message: 'p95 response time stayed above 2,000 ms for 11 minutes.', severity: 'medium', status: 'resolved', source: 'uptime', applicationId: 'a2', environmentId: 'a2-e1', assetId: 's6', ruleId: 'r3', firstAt: iso(t - 23 * MIN), lastAt: iso(t - 13 * MIN), occurrences: 11, resolvedAt: iso(t - 12 * MIN), autoResolved: true, deliveries: delivered(t - 23 * MIN).slice(0, 1) }),
    alert({ id: 'al7', title: 'HSTS header missing on portal.example.com', message: 'Production responses do not send Strict-Transport-Security.', severity: 'low', status: 'snoozed', source: 'headers', applicationId: 'a1', environmentId: 'a1-e1', assetId: 's1', ruleId: 'r13', firstAt: iso(t - 6 * DAY), lastAt: iso(t - 3 * 60 * MIN), occurrences: 6, snoozedUntil: iso(t + DAY), deliveries: delivered(t - 6 * DAY).slice(0, 1) }),
  ];

  const finding = (
    f: Pick<Finding, 'id' | 'title' | 'description' | 'category' | 'source' | 'assetId' | 'severity' | 'confidence' | 'status' | 'evidence'> &
      Partial<Finding> & { daysAgo: number },
  ): Finding => {
    const a = asset(f.assetId);
    const score = riskScore({ severity: f.severity, criticality: app(a.applicationId).criticality, exposure: a.exposure, confidence: f.confidence, knownExploited: false });
    const priority = priorityFor(score);
    const first = t - f.daysAgo * DAY;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { daysAgo: _d, ...rest } = f;
    return {
      applicationId: a.applicationId, environmentId: a.environmentId, knownExploited: false, riskScore: score, priority,
      assigneeId: null, dueAt: iso(first + SLA_DAYS[priority] * DAY), firstSeen: iso(first), lastSeen: iso(t - 3 * 60 * MIN),
      acceptedRisk: null, history: [{ at: iso(first), actorName: 'ShieldOps', text: 'Detected by scheduled check' }],
      ...rest,
    };
  };
  const findings: Finding[] = [
    finding({ id: 'f1', title: 'SSL certificate expires in 5 days', description: 'Visitors will see a browser warning once the certificate expires.', category: 'availability', source: 'ssl', assetId: 's13', severity: 'high', confidence: 'confirmed', status: 'open', daysAgo: 2, evidence: [{ label: 'Host', value: 'www.example.com' }, { label: 'Issuer', value: "Let's Encrypt R10" }, { label: 'Valid to', value: new Date(t + 5 * DAY).toISOString().slice(0, 10) }] }),
    finding({ id: 'f2', title: 'SSL certificate expires in 12 days', description: 'Renew before it expires, or confirm automatic renewal is running.', category: 'availability', source: 'ssl', assetId: 's1', severity: 'medium', confidence: 'confirmed', status: 'acknowledged', assigneeId: 'u2', daysAgo: 3, evidence: [{ label: 'Host', value: 'portal.example.com' }, { label: 'Issuer', value: "Let's Encrypt R11" }] }),
    finding({ id: 'f3', title: 'TLS 1.0 still enabled', description: 'TLS 1.0 has known weaknesses and is rejected by modern browsers. Disable it on the server.', category: 'security', source: 'ssl', assetId: 's11', severity: 'high', confidence: 'confirmed', status: 'reopened', assigneeId: 'u3', daysAgo: 9, evidence: [{ label: 'Host', value: 'field.example.com' }, { label: 'Protocols offered', value: 'TLS 1.2, TLS 1.0' }] }),
    finding({ id: 'f4', title: 'Weak cipher suites offered', description: 'The server accepts CBC-mode ciphers that should be disabled.', category: 'security', source: 'ssl', assetId: 's11', severity: 'medium', confidence: 'confirmed', status: 'in_progress', assigneeId: 'u3', daysAgo: 9, evidence: [{ label: 'Example cipher', value: 'TLS_RSA_WITH_AES_128_CBC_SHA' }] }),
    finding({ id: 'f5', title: 'MX record changed', description: 'Mail routing for this domain changed. Confirm the change was planned.', category: 'configuration', source: 'dns', assetId: 's5', severity: 'medium', confidence: 'confirmed', status: 'open', daysAgo: 2, evidence: [{ label: 'Before', value: '10 mx.oldmail.example.org' }, { label: 'After', value: '1 smtp.mailhost.example.net' }] }),
    finding({ id: 'f6', title: 'Strict-Transport-Security header missing', description: 'Without HSTS, browsers may connect over plain HTTP first.', category: 'security', source: 'headers', assetId: 's1', severity: 'low', confidence: 'confirmed', status: 'open', daysAgo: 6, evidence: [{ label: 'URL', value: 'https://portal.example.com' }] }),
    finding({ id: 'f7', title: 'Content-Security-Policy header missing', description: 'A CSP limits which scripts can run and reduces the impact of injected code.', category: 'security', source: 'headers', assetId: 's13', severity: 'low', confidence: 'confirmed', status: 'open', daysAgo: 6, evidence: [{ label: 'URL', value: 'https://www.example.com' }] }),
    finding({ id: 'f8', title: 'Certificate chain not trusted publicly', description: 'Signed by the internal CA. Expected for internal-only sites.', category: 'configuration', source: 'ssl', assetId: 's9', severity: 'info', confidence: 'confirmed', status: 'false_positive', daysAgo: 15, evidence: [{ label: 'Issuer', value: 'Example Internal CA' }] }),
    finding({ id: 'f9', title: 'Domain expiry date unavailable', description: 'Neither RDAP nor WHOIS returned an expiry date for this domain. Track renewal manually.', category: 'availability', source: 'domain', assetId: 's13', severity: 'info', confidence: 'possible', status: 'accepted_risk', daysAgo: 20, acceptedRisk: { justification: 'Renewal is tracked in the finance calendar.', expiresAt: iso(t + 70 * DAY), by: 'u2', at: iso(t - 19 * DAY) }, evidence: [{ label: 'Domain', value: 'www.example.com' }, { label: 'Sources tried', value: 'RDAP, WHOIS' }] }),
    finding({ id: 'f10', title: 'X-Frame-Options header missing', description: 'Pages can be embedded in frames on other sites, which allows clickjacking.', category: 'security', source: 'headers', assetId: 's9', severity: 'low', confidence: 'confirmed', status: 'open', daysAgo: 15, evidence: [{ label: 'URL', value: 'https://payroll.internal.example.com' }] }),
  ];

  return {
    monitors,
    heartbeats,
    certificates,
    dns,
    domains,
    headers,
    alerts,
    findings,
    alertRules: structuredClone(DEFAULT_RULES),
    channels: { emailRecipients: ['it-alerts@example.com'], criticalRenotifyMin: 15, maxRenotify: 4 },
    maintenance: [
      { id: 'mw1', title: 'Payroll server patching', applicationId: 'a3', environmentId: 'a3-e1', startsAt: iso(t + 2 * DAY), endsAt: iso(t + 2 * DAY + 2 * 60 * MIN), createdBy: 'u1' },
    ],
  };
}