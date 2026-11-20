import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SCAN_STATUS_LABEL, SEVERITY_LABEL, timeAgo } from '@/lib/format';
import type { ScanJob, ScanStatus, Severity, SeverityCounts } from '@/types';

const TONE: Record<ScanStatus, string> = {
  queued: 'text-muted',
  running: 'text-low',
  completed: 'text-up',
  partial: 'text-degraded',
  failed: 'text-down',
  cancelled: 'text-muted',
};

export function ScanStatusText({ status }: { status: ScanStatus }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm font-medium', TONE[status])}>
      {(status === 'running' || status === 'queued') && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {SCAN_STATUS_LABEL[status]}
    </span>
  );
}

/** Last scan in one line. Partial and failed scans say so, so they are never read as clean. */
export function LastScan({ scan }: { scan: ScanJob | null }) {
  if (!scan) return <span className="text-sm text-muted">Never scanned</span>;
  return (
    <div>
      <ScanStatusText status={scan.status} />
      <p className="text-xs text-muted">{scan.status === 'queued' || scan.status === 'running' ? `started ${timeAgo(scan.queuedAt)}` : timeAgo(scan.finishedAt ?? scan.queuedAt)}</p>
    </div>
  );
}

const CHIP: Record<Severity, string> = {
  critical: 'bg-crit text-white',
  high: 'bg-high/15 text-high',
  medium: 'bg-med/15 text-med',
  low: 'bg-low/15 text-low',
  info: 'bg-info/15 text-info',
};

/** Open findings per severity as small chips; zeros are left out. */
export function SeverityChips({ counts, emptyText = 'None open' }: { counts: SeverityCounts; emptyText?: string }) {
  const shown = (Object.keys(SEVERITY_LABEL) as Severity[]).filter((s) => counts[s] > 0 && s !== 'info');
  if (!shown.length) return <span className="text-sm text-muted">{emptyText}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {shown.map((s) => (
        <span key={s} className={cn('inline-flex min-w-[1.75rem] items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums', CHIP[s])} title={`${counts[s]} ${SEVERITY_LABEL[s].toLowerCase()}`}>
          {counts[s]}
          <span className="ml-0.5 font-normal opacity-80">{SEVERITY_LABEL[s][0]}</span>
        </span>
      ))}
    </span>
  );
}