import type { ControlResult, FrameworkId, Recommendation, ReportRecord, ReportSchedule, ReportSection } from '@/types';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const iso = (t: number) => new Date(t).toISOString();

export interface StoredReport extends ReportRecord {
  /** Snapshot taken when the report finished; null until then. */
  sections: ReportSection[] | null;
  simReadyAt: string | null;
}

export interface Phase7Data {
  aiRecommendations: Recommendation[];
  dismissedRecs: Record<string, string>;
  reports: StoredReport[];
  reportSchedules: ReportSchedule[];
  frameworksEnabled: Record<FrameworkId, boolean>;
  attestations: Record<string, NonNullable<ControlResult['attestation']>>;
}

export function emptyPhase7(): Phase7Data {
  return { aiRecommendations: [], dismissedRecs: {}, reports: [], reportSchedules: [], frameworksEnabled: { iso27001: true, soc2: false, certin: true, dpdp: false }, attestations: {} };
}

export function seedPhase7(): Phase7Data {
  const t = Date.now();
  const report = (id: string, type: ReportRecord['type'], title: string, daysAgo: number, span: number, by: string, sizeKb: number, applicationId: string | null = null): StoredReport => ({
    id, type, title, from: iso(t - (daysAgo + span) * DAY), to: iso(t - daysAgo * DAY), applicationId, status: 'ready', generatedAt: iso(t - daysAgo * DAY + 3 * MIN), generatedBy: by, sizeKb, sections: null, simReadyAt: null,
  });
  return {
    aiRecommendations: [
      {
        id: 'rec-ai-1', source: 'ai', effort: 'medium', title: 'Stop photo uploads from filling the Field Ops server disk',
        why: 'The ENOSPC errors, the 97% full disk and the photo upload failures share one cause: uploads are written to the root disk with no size limit and are never cleaned up.',
        steps: ['Stream uploads straight to object storage (R2) instead of the local disk.', 'Cap upload size at 10 MB in nginx and in the API.', 'Add a disk-usage alert at 80% for field-api-01 so there is more warning next time.'],
        findingIds: [], applicationIds: ['a4'], closes: { P1: 0, P2: 0, P3: 0, P4: 0 }, dismissed: false, dismissedReason: null,
      },
      {
        id: 'rec-ai-2', source: 'ai', effort: 'small', title: 'Add per-account login limits to every application',
        why: 'The credential stuffing on Customer Portal got through 46 attempts because limits are per IP only. Payments API and Field Ops use the same login code.',
        steps: ['Lock an account for 15 minutes after 5 failed logins, whatever the IP.', 'Send the security events from all three apps through the SDK so ShieldOps can detect the next attempt.'],
        findingIds: [], applicationIds: ['a1', 'a2', 'a4'], closes: { P1: 0, P2: 0, P3: 0, P4: 0 }, dismissed: false, dismissedReason: null,
      },
    ],
    dismissedRecs: {},
    reports: [
      report('rp-1', 'posture', 'Security posture', 1, 30, 'u1', 214),
      report('rp-2', 'vulnerabilities', 'Vulnerabilities and secrets', 7, 30, 'u3', 388),
      report('rp-3', 'incidents', 'Incidents and remediation', 14, 30, 'u2', 176),
    ],
    reportSchedules: [
      { id: 'sch-1', type: 'posture', frequency: 'weekly', recipients: ['it-head@example.com', 'it-alerts@example.com'], applicationId: null, nextRunAt: iso(t + 3 * DAY), createdBy: 'u1' },
    ],
    frameworksEnabled: { iso27001: true, soc2: false, certin: true, dpdp: false },
    attestations: {
      'certin:ntp': { status: 'met', note: 'All servers sync with time.nplindia.org and samay1.nic.in through chrony.', by: 'u3', at: iso(t - 20 * DAY) },
    },
  };
}