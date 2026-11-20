import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { cn } from '@/lib/cn';
import { formatMs, timeAgo } from '@/lib/format';

const TONE = { up: 'text-up', degraded: 'text-degraded', down: 'text-down', unknown: 'text-muted' } as const;

/** Latest result from each probe location. A target is only "down" when every online probe agrees. */
export function ProbeResults({ monitorId }: { monitorId: string }) {
  const results = useQuery({ queryKey: ['probe-results', monitorId], queryFn: () => api.getProbeResults(monitorId), refetchInterval: 30_000 });
  if (!results.data || results.data.length < 2) return null;
  const online = results.data.filter((r) => r.status !== 'unknown');
  const split = new Set(online.map((r) => r.status === 'down')).size > 1;
  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-semibold">Checked from</h2>
        <Link to="/ingestion#probes" className="text-xs text-accent hover:underline">
          Probe locations
        </Link>
      </div>
      <ul className="divide-y divide-line">
        {results.data.map((r) => (
          <li key={r.probeId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="font-medium">{r.probeName}</span>
            <span className="flex items-center gap-4">
              <span className="tabular-nums text-muted">{formatMs(r.latencyMs)}</span>
              <span className={cn('w-16 text-right font-medium capitalize', TONE[r.status])}>{r.status}</span>
              <span className="w-20 text-right text-xs text-muted">{timeAgo(r.at)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2 text-xs text-muted">
        {split ? 'The probes disagree, so this is treated as a network problem near one probe, not an outage.' : 'A target is marked down only when every online probe sees it fail.'}
      </p>
    </section>
  );
}