import { cn } from '@/lib/cn';
import { ALERT_STATUS_LABEL, FINDING_STATUS_LABEL, INCIDENT_STATUS_LABEL, TASK_STATUS_LABEL } from '@/lib/format';
import type { AlertStatus, FindingStatus, IncidentStatus, Priority, TaskStatus } from '@/types';

const alertTone: Record<AlertStatus, string> = {
  open: 'text-down',
  acknowledged: 'text-degraded',
  snoozed: 'text-muted',
  resolved: 'text-up',
};

export function AlertStatusText({ status }: { status: AlertStatus }) {
  return <span className={cn('text-sm font-medium', alertTone[status])}>{ALERT_STATUS_LABEL[status]}</span>;
}

const findingTone: Record<FindingStatus, string> = {
  open: 'text-down',
  reopened: 'text-down',
  acknowledged: 'text-degraded',
  in_progress: 'text-low',
  resolved: 'text-up',
  verified: 'text-up',
  accepted_risk: 'text-muted',
  false_positive: 'text-muted',
};

export function FindingStatusText({ status }: { status: FindingStatus }) {
  return <span className={cn('text-sm font-medium', findingTone[status])}>{FINDING_STATUS_LABEL[status]}</span>;
}

const priorityStyle: Record<Priority, string> = {
  P1: 'bg-crit text-white border-crit',
  P2: 'bg-high/10 text-high border-high/40',
  P3: 'bg-med/10 text-med border-med/40',
  P4: 'bg-sunken text-muted border-line',
};

/** Risk priority: what to do first. Kept visually distinct from technical severity. */
export function PriorityBadge({ priority, score }: { priority: Priority; score?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs font-semibold', priorityStyle[priority])} title={score !== undefined ? `Risk score ${score}` : undefined}>
      {priority}
    </span>
  );
}

/* ───────────── Phase 6 ───────────── */

const incidentTone: Record<IncidentStatus, string> = {
  new: 'text-down',
  reopened: 'text-down',
  acknowledged: 'text-degraded',
  investigating: 'text-degraded',
  remediating: 'text-low',
  resolved: 'text-up',
  closed: 'text-muted',
};

export function IncidentStatusText({ status }: { status: IncidentStatus }) {
  return <span className={cn('text-sm font-medium', incidentTone[status])}>{INCIDENT_STATUS_LABEL[status]}</span>;
}

const taskTone: Record<TaskStatus, string> = {
  todo: 'text-muted',
  in_progress: 'text-low',
  ready_for_verification: 'text-degraded',
  verified: 'text-up',
  wont_fix: 'text-muted',
};

export function TaskStatusText({ status }: { status: TaskStatus }) {
  return <span className={cn('text-sm font-medium', taskTone[status])}>{TASK_STATUS_LABEL[status]}</span>;
}