import type { Incident, RemediationTask, TaskVerification } from '@/types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (t: number) => new Date(t).toISOString();

export interface TaskRecord extends RemediationTask {
  /** When a pending verification resolves in the mock. */
  simVerifyAt: string | null;
}

export interface Phase6Data {
  incidents: Incident[];
  tasks: TaskRecord[];
  /** Tasks finished in the last 30 days before the demo data starts, for the SLA figures. */
  slaBaseline: { onTime: number; late: number };
  nextIncidentNumber: number;
}

export function emptyPhase6(): Phase6Data {
  return { incidents: [], tasks: [], slaBaseline: { onTime: 0, late: 0 }, nextIncidentNumber: 1 };
}

export function seedPhase6(): Phase6Data {
  const t = Date.now();
  const sys = (at: number, text: string, kind: Incident['timeline'][number]['kind'] = 'system') => ({ at: iso(at), actorName: 'ShieldOps', kind, text });
  const by = (at: number, actorName: string, text: string, kind: Incident['timeline'][number]['kind'] = 'status') => ({ at: iso(at), actorName, kind, text });

  const incidents: Incident[] = [
    {
      id: 'inc7', ref: 'INC-0007', title: 'Field Ops photo uploads failing', severity: 'critical', status: 'investigating', ownerId: 'u3', applicationIds: ['a4'],
      summary: 'Field staff cannot upload job photos. The API returns 500s on POST /api/photos and the health check is down.',
      linked: [
        { type: 'alert', id: 'al1', title: 'Field API health is down', severity: 'critical' },
        { type: 'alert', id: 'al13', title: 'Disk 97% full on field-api-01', severity: 'critical' },
        { type: 'alert', id: 'al12', title: '5xx rate above 5% on Field Ops Backend', severity: 'high' },
        { type: 'error_group', id: 'eg7', title: 'Error: ENOSPC: no space left on device, write', severity: null },
      ],
      openedAt: iso(t - 38 * MIN), acknowledgedAt: iso(t - 35 * MIN), resolvedAt: null, closedAt: null, createdBy: 'u3',
      rootCause: 'The photo upload folder on field-api-01 filled the root disk. Uploads have no size cap and old files are never cleaned up.', postIncident: '',
      timeline: [
        by(t - 12 * MIN, 'Kiran Shetty', 'Created task: Free disk space on field-api-01 and move uploads to object storage', 'task'),
        by(t - 20 * MIN, 'Kiran Shetty', 'Note: /var/app/uploads is 61 GB. Deleting uploads older than 90 days as a stopgap.', 'note'),
        by(t - 30 * MIN, 'Kiran Shetty', 'Changed status to investigating'),
        by(t - 35 * MIN, 'Kiran Shetty', 'Acknowledged'),
        sys(t - 37 * MIN, 'Linked alert: Disk 97% full on field-api-01', 'link'),
        sys(t - 38 * MIN, 'Opened automatically from a critical production availability alert'),
      ],
    },
    {
      id: 'inc6', ref: 'INC-0006', title: 'Credential stuffing against Customer Portal', severity: 'high', status: 'remediating', ownerId: 'u2', applicationIds: ['a1'],
      summary: '46 failed logins across 46 accounts from 203.0.113.77 in 10 minutes. No successful logins from that IP.',
      linked: [{ type: 'alert', id: 'al8', title: 'Credential stuffing on Customer Portal from 203.0.113.77', severity: 'critical' }],
      openedAt: iso(t - 39 * MIN), acknowledgedAt: iso(t - 36 * MIN), resolvedAt: null, closedAt: null, createdBy: 'u2',
      rootCause: 'Login rate limiting is per IP only, so one address could try many accounts before being blocked.', postIncident: '',
      timeline: [
        by(t - 15 * MIN, 'Ananya Rao', 'Changed status to remediation in progress'),
        by(t - 16 * MIN, 'Ananya Rao', 'Created task: Force a password reset for the 46 targeted accounts', 'task'),
        by(t - 17 * MIN, 'Ananya Rao', 'Created task: Add per-account login rate limiting', 'task'),
        by(t - 25 * MIN, 'Ananya Rao', 'Note: checked login logs, no successful logins from 203.0.113.77. Blocked the IP at Cloudflare.', 'note'),
        by(t - 36 * MIN, 'Ananya Rao', 'Acknowledged'),
        by(t - 39 * MIN, 'Ananya Rao', 'Opened from alert: Credential stuffing on Customer Portal from 203.0.113.77'),
      ],
    },
    {
      id: 'inc5', ref: 'INC-0005', title: 'AWS access key committed to payments-api', severity: 'critical', status: 'acknowledged', ownerId: 'u1', applicationIds: ['a2'],
      summary: 'A live AWS access key was pushed in config/staging.env. It must be deactivated before anything else.',
      linked: [
        { type: 'alert', id: 'al17', title: 'AWS access key committed to example-org/payments-api', severity: 'high' },
        { type: 'finding', id: 'f20', title: 'AWS access key in config/staging.env', severity: 'critical' },
      ],
      openedAt: iso(t - 30 * MIN), acknowledgedAt: iso(t - 28 * MIN), resolvedAt: null, closedAt: null, createdBy: 'u1', rootCause: '', postIncident: '',
      timeline: [by(t - 28 * MIN, 'Demo User', 'Acknowledged'), by(t - 30 * MIN, 'Demo User', 'Opened from finding: AWS access key in config/staging.env')],
    },
    {
      id: 'inc4', ref: 'INC-0004', title: 'Payments API responses slow', severity: 'medium', status: 'resolved', ownerId: 'u3', applicationIds: ['a2'],
      summary: 'p95 response time stayed above 2 seconds for 11 minutes during UPI gateway timeouts.',
      linked: [{ type: 'alert', id: 'al6', title: 'Payments API responses slower than 2,000 ms', severity: 'medium' }],
      openedAt: iso(t - 44 * MIN), acknowledgedAt: iso(t - 42 * MIN), resolvedAt: iso(t - 30 * MIN), closedAt: null, createdBy: 'u3',
      rootCause: 'Requests waiting on the UPI gateway held database connections, so the connection pool ran out.', postIncident: '',
      timeline: [
        by(t - 30 * MIN, 'Kiran Shetty', 'Changed status to resolved'),
        by(t - 32 * MIN, 'Kiran Shetty', 'Note: gateway recovered; response times back to normal.', 'note'),
        by(t - 42 * MIN, 'Kiran Shetty', 'Acknowledged'),
        by(t - 44 * MIN, 'Kiran Shetty', 'Opened from alert: Payments API responses slower than 2,000 ms'),
      ],
    },
    {
      id: 'inc3', ref: 'INC-0003', title: 'Deploy key exposed in public marketing-site repository', severity: 'critical', status: 'closed', ownerId: 'u1', applicationIds: ['a5'],
      summary: 'An SSH deploy key was committed to the public example-org/marketing-site repository.',
      linked: [{ type: 'finding', id: 'f24', title: 'RSA private key in deploy/id_rsa', severity: 'critical' }],
      openedAt: iso(t - 12 * DAY), acknowledgedAt: iso(t - 12 * DAY + 6 * MIN), resolvedAt: iso(t - 11 * DAY), closedAt: iso(t - 10 * DAY), createdBy: 'u1',
      rootCause: 'The deploy script wrote the key into the repository folder and it was committed with a bulk "add all files".',
      postIncident:
        'Impact: none found. Server access logs show no logins with the key between commit and revocation (52 minutes).\n\nWhat we changed: the key was revoked and replaced; deploy keys now live only in GitHub Actions secrets; .gitignore blocks id_* files; a pre-commit Gitleaks hook runs on all repositories.',
      timeline: [
        by(t - 10 * DAY, 'Demo User', 'Closed with a post-incident summary'),
        sys(t - 11 * DAY + 2 * HOUR, 'Linked finding verified fixed by a repository scan'),
        by(t - 11 * DAY, 'Demo User', 'Changed status to resolved'),
        by(t - 12 * DAY + 6 * MIN, 'Demo User', 'Acknowledged'),
        by(t - 12 * DAY, 'Demo User', 'Opened from finding: RSA private key in deploy/id_rsa'),
      ],
    },
  ];

  const passed = (at: number, method: string, detail: string): TaskVerification => ({ status: 'passed', at: iso(at), method, detail });
  const failed = (at: number, method: string, detail: string): TaskVerification => ({ status: 'failed', at: iso(at), method, detail });
  const task = (x: Partial<TaskRecord> & Pick<TaskRecord, 'id' | 'title' | 'linkedType' | 'linkedId' | 'linkedTitle' | 'applicationId' | 'status'>): TaskRecord => ({
    details: '', ownerId: null, priority: null, dueAt: null, createdAt: iso(t - DAY), createdBy: 'u1', completedAt: null, verification: null, verificationHistory: [], wontFixReason: null, notes: [], simVerifyAt: null, ...x,
  });

  const tasks: TaskRecord[] = [
    task({
      id: 't1', title: 'Free disk space on field-api-01 and move uploads to object storage', linkedType: 'incident', linkedId: 'inc7', linkedTitle: 'INC-0007 Field Ops photo uploads failing',
      applicationId: 'a4', ownerId: 'u3', priority: 'P1', status: 'in_progress', dueAt: iso(t + 4 * HOUR), createdAt: iso(t - 12 * MIN), createdBy: 'u3',
      details: 'Short term: delete uploads older than 90 days. Proper fix: stream uploads to R2 and cap request size at 10 MB.',
      notes: [{ at: iso(t - 6 * MIN), actorName: 'Kiran Shetty', text: 'Cleanup job running, disk at 91% and falling.' }],
    }),
    task({ id: 't2', title: 'Add per-account login rate limiting', linkedType: 'incident', linkedId: 'inc6', linkedTitle: 'INC-0006 Credential stuffing against Customer Portal', applicationId: 'a1', ownerId: 'u2', priority: 'P2', status: 'in_progress', dueAt: iso(t + 3 * DAY), createdAt: iso(t - 17 * MIN), createdBy: 'u2', details: 'Lock an account for 15 minutes after 5 failed logins, whatever the IP.' }),
    task({ id: 't3', title: 'Force a password reset for the 46 targeted accounts', linkedType: 'incident', linkedId: 'inc6', linkedTitle: 'INC-0006 Credential stuffing against Customer Portal', applicationId: 'a1', ownerId: 'u2', priority: 'P2', status: 'todo', dueAt: iso(t + 1 * DAY), createdAt: iso(t - 16 * MIN), createdBy: 'u2' }),
    task({ id: 't4', title: 'Deactivate the leaked AWS key and load it from Secrets Manager', linkedType: 'finding', linkedId: 'f20', linkedTitle: 'AWS access key in config/staging.env', applicationId: 'a2', ownerId: 'u1', priority: 'P1', status: 'todo', dueAt: iso(t + 2 * DAY - 35 * MIN), createdAt: iso(t - 28 * MIN), details: 'Deactivate in IAM first. Then remove config/staging.env from the repository and rewrite history.' }),
    task({ id: 't5', title: 'Upgrade express to 4.20.0 in payments-api', linkedType: 'finding', linkedId: 'f31', linkedTitle: 'CVE-2024-29041 in express 4.18.2', applicationId: 'a2', ownerId: 'u3', priority: 'P2', status: 'todo', dueAt: iso(t - 14 * DAY), createdAt: iso(t - 21 * DAY), details: 'Also fixes CVE-2024-43796 and pulls in path-to-regexp 0.1.10.' }),
    task({
      id: 't6', title: 'Turn off TLS 1.0 on field.example.com', linkedType: 'finding', linkedId: 'f3', linkedTitle: 'TLS 1.0 still enabled', applicationId: 'a4', ownerId: 'u3', priority: 'P2', status: 'in_progress', dueAt: iso(t - 2 * DAY), createdAt: iso(t - 8 * DAY),
      verificationHistory: [failed(t - DAY, 'SSL recheck of field.example.com', 'TLS 1.0 is still offered on port 443. The nginx change may not have been reloaded.')],
      notes: [{ at: iso(t - DAY + 10 * MIN), actorName: 'ShieldOps', text: 'Verification failed, so the task went back to in progress and the finding was reopened.' }],
    }),
    task({ id: 't7', title: 'Renew the SSL certificate for www.example.com', linkedType: 'finding', linkedId: 'f1', linkedTitle: 'SSL certificate expires in 5 days', applicationId: 'a5', ownerId: 'u2', priority: 'P2', status: 'todo', dueAt: iso(t + 5 * DAY), createdAt: iso(t - 2 * DAY) }),
    task({ id: 't8', title: 'Regenerate the Razorpay key secret', linkedType: 'finding', linkedId: 'f21', linkedTitle: 'Razorpay API secret in src/config/payments.ts', applicationId: 'a1', ownerId: 'u2', priority: 'P1', status: 'in_progress', dueAt: iso(t - 7 * DAY), createdAt: iso(t - 9 * DAY), notes: [{ at: iso(t - 6 * DAY), actorName: 'Ananya Rao', text: 'Waiting on finance to approve the key change window.' }] }),
    task({
      id: 't9', title: 'Revoke the deploy key and remove it from marketing-site', linkedType: 'finding', linkedId: 'f24', linkedTitle: 'RSA private key in deploy/id_rsa', applicationId: 'a5', ownerId: 'u1', priority: 'P1', status: 'verified', dueAt: iso(t - 10 * DAY), createdAt: iso(t - 12 * DAY), completedAt: iso(t - 11 * DAY + 2 * HOUR),
      verification: passed(t - 11 * DAY + 2 * HOUR, 'Repository scan of example-org/marketing-site', 'The key is no longer in the current code, and the old key no longer works on the server.'),
    }),
    task({
      id: 't10', title: 'Guard against missing capture in createRefund', linkedType: 'error_group', linkedId: 'eg1', linkedTitle: "TypeError: Cannot read properties of undefined (reading 'amount')", applicationId: 'a2', ownerId: 'u3', priority: null, status: 'ready_for_verification', dueAt: iso(t + 4 * DAY), createdAt: iso(t - 2 * DAY),
      verification: { status: 'pending', at: iso(t - 3 * HOUR), method: 'Watching the error group', detail: 'Passes if no new events arrive for 7 days after release payments-api@2.14.2.' },
    }),
    task({ id: 't11', title: 'Upgrade micromatch in portal-web', linkedType: 'finding', linkedId: 'f41', linkedTitle: 'CVE-2024-4067 in micromatch 4.0.5', applicationId: 'a1', ownerId: 'u2', priority: 'P3', status: 'wont_fix', dueAt: iso(t + 5 * DAY), createdAt: iso(t - 25 * DAY), completedAt: iso(t - 20 * DAY), wontFixReason: 'Build-time dependency only. Risk accepted until the next major build tooling upgrade.' }),
  ];

  return { incidents, tasks, slaBaseline: { onTime: 23, late: 4 }, nextIncidentNumber: 8 };
}