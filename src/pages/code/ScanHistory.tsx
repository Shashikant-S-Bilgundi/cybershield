import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ScanJob } from '@/types';
import { cn } from '@/lib/cn';
import { SCANNER_LABEL, formatDateTime, formatMs, timeAgo } from '@/lib/format';
import { ScanStatusText } from '@/components/ui/ScanLabels';

const TRIGGER: Record<ScanJob['trigger'], string> = { initial: 'First scan', manual: 'Started by hand', schedule: 'Daily schedule', push: 'Push to GitHub' };

export function ScanHistory({ scans }: { scans: ScanJob[] }) {
  const [open, setOpen] = useState<string | null>(scans[0]?.status === 'partial' || scans[0]?.status === 'failed' ? scans[0].id : null);
  if (!scans.length) return <p className="px-4 py-6 text-center text-sm text-muted">No scans yet.</p>;
  return (
    <table className="table-base">
      <thead>
        <tr>
          <th className="w-8" aria-label="Expand" />
          <th>When</th>
          <th>Result</th>
          <th>Trigger</th>
          <th>Revision</th>
          <th className="text-right">New</th>
          <th className="text-right">Fixed</th>
        </tr>
      </thead>
      <tbody>
        {scans.map((s) => (
          <Fragment key={s.id}>
            <tr className="cursor-pointer" onClick={() => setOpen(open === s.id ? null : s.id)}>
              <td className="text-muted">{open === s.id ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}</td>
              <td className="whitespace-nowrap text-sm" title={formatDateTime(s.queuedAt)}>
                {timeAgo(s.queuedAt)}
              </td>
              <td>
                <ScanStatusText status={s.status} />
              </td>
              <td className="text-sm text-muted">{TRIGGER[s.trigger]}</td>
              <td className="font-mono text-xs">{s.revision ? s.revision.replace('sha256:', '').slice(0, 12) : '—'}</td>
              <td className={cn('text-right text-sm tabular-nums', s.newFindings > 0 && 'font-medium text-down')}>{s.status === 'completed' || s.status === 'partial' ? s.newFindings : '—'}</td>
              <td className={cn('text-right text-sm tabular-nums', s.fixedFindings > 0 && 'text-up')}>{s.status === 'completed' || s.status === 'partial' ? s.fixedFindings : '—'}</td>
            </tr>
            {open === s.id && (
              <tr className="hover:bg-transparent">
                <td />
                <td colSpan={6} className="pb-4">
                  <ul className="space-y-1.5">
                    {s.runs.map((r) => (
                      <li key={r.scanner} className="text-sm">
                        <span className="inline-block w-20 font-medium">{SCANNER_LABEL[r.scanner]}</span>
                        <span className="mr-3 font-mono text-xs text-muted">{r.version}</span>
                        <ScanStatusText status={r.status === 'running' ? 'running' : r.status === 'queued' ? 'queued' : r.status === 'failed' ? 'failed' : r.status === 'cancelled' ? 'cancelled' : 'completed'} />
                        {r.durationMs !== null && <span className="ml-2 text-xs text-muted">{formatMs(r.durationMs)}</span>}
                        {r.error && <p className="ml-20 text-xs text-down">{r.error}</p>}
                      </li>
                    ))}
                  </ul>
                  {s.status === 'partial' && <p className="mt-2 text-xs text-degraded">Results from the scanners that failed are missing, so this scan does not prove the code is clean.</p>}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}