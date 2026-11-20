import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import type { PerfRange, RouteStat } from '@/types';
import { cn } from '@/lib/cn';
import { formatCount, formatMs } from '@/lib/format';
import { MetricChart } from '@/components/ui/MetricChart';
import { ErrorState, Spinner } from '@/components/ui/States';

const RANGES: { key: PerfRange; label: string }[] = [
  { key: '1h', label: 'Last hour' },
  { key: '24h', label: '24 hours' },
  { key: '7d', label: '7 days' },
];

type SortKey = 'requests' | 'errorRate' | 'p95';

const errTone = (v: number) => (v >= 5 ? 'text-down font-medium' : v >= 1 ? 'text-degraded' : '');
const latTone = (v: number) => (v >= 2000 ? 'text-down font-medium' : v >= 1000 ? 'text-degraded' : '');

/** Throughput, error rate and latency for one application environment. */
export function PerformanceView({ applicationId, environmentId }: { applicationId: string; environmentId: string }) {
  const [range, setRange] = useState<PerfRange>('24h');
  const [sort, setSort] = useState<SortKey>('requests');
  const releases = useQuery({ queryKey: ['releases', applicationId], queryFn: () => api.listReleases({ applicationId }) });
  const markers = (releases.data ?? []).filter((r) => r.environmentId === environmentId).map((r) => ({ at: r.deployedAt, label: r.version.split('@')[1] ?? r.version }));
  const report = useQuery({
    queryKey: ['performance', applicationId, environmentId, range],
    queryFn: () => api.getPerformance(applicationId, environmentId, range),
    refetchInterval: 60_000,
    retry: false,
  });

  if (report.isLoading) return <Spinner />;
  if (report.error) return <ErrorState error={report.error} />;
  const r = report.data!;
  const times = r.series.map((s) => s.at);
  const routes = [...r.routes].sort((a: RouteStat, b: RouteStat) => b[sort] - a[sort]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded border border-line p-0.5" role="tablist" aria-label="Time range">
          {RANGES.map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={range === x.key} onClick={() => setRange(x.key)} className={cn('rounded-[4px] px-2.5 py-1 text-xs font-medium', range === x.key ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')}>
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <section aria-label="Summary" className="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-5 md:divide-x md:divide-line">
        {[
          ['Requests', formatCount(r.requests), ''],
          ['Per minute now', formatCount(Math.round(r.rpm)), ''],
          ['5xx error rate', `${r.errorRate}%`, errTone(r.errorRate)],
          ['p50 response', formatMs(r.p50), ''],
          ['p95 response', formatMs(r.p95), latTone(r.p95)],
        ].map(([label, value, tone]) => (
          <div key={label} className="border-b border-line px-4 py-3 md:border-b-0">
            <p className="text-xs text-muted">{label}</p>
            <p className={cn('mt-0.5 text-xl font-semibold tabular-nums', tone)}>{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold">Response time</h3>
          <MetricChart
            ariaLabel="p50 and p95 response time"
            times={times}
            format={(v) => formatMs(Math.round(v))}
            threshold={{ value: 2000, label: 'slow' }}
            markers={markers}
            series={[
              { label: 'p95', values: r.series.map((s) => s.p95), stroke: 'stroke-accent' },
              { label: 'p50', values: r.series.map((s) => s.p50), stroke: 'stroke-muted', dashed: true },
            ]}
          />
        </section>
        <section className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold">Requests per minute and 5xx error rate</h3>
          <MetricChart ariaLabel="Requests per minute" times={times} markers={markers} format={(v) => formatCount(Math.round(v))} series={[{ label: 'Requests per minute', values: r.series.map((s) => s.rpm), stroke: 'stroke-low' }]} />
          <MetricChart
            ariaLabel="5xx error rate"
            times={times}
            format={(v) => `${v.toFixed(v < 10 ? 1 : 0)}%`}
            threshold={{ value: 5, label: 'alert at 5%' }}
            series={[{ label: '5xx rate', values: r.series.map((s) => s.errorRate), stroke: 'stroke-down' }]}
          />
        </section>
      </div>

      <section className="rounded-lg border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h3 className="font-semibold">Routes</h3>
          <div className="flex items-center gap-2 text-xs text-muted">
            Sort by
            {(
              [
                ['requests', 'Traffic'],
                ['errorRate', 'Errors'],
                ['p95', 'Slowest'],
              ] as [SortKey, string][]
            ).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setSort(k)} aria-pressed={sort === k} className={cn('rounded border px-2 py-0.5', sort === k ? 'border-accent bg-accent/10 text-ink' : 'border-line hover:text-ink')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Route</th>
                <th className="text-right">Requests</th>
                <th className="text-right">5xx rate</th>
                <th className="text-right">p50</th>
                <th className="text-right">p95</th>
                <th className="text-right">p99</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((rt) => (
                <tr key={rt.method + rt.route}>
                  <td className="font-mono text-xs">
                    <span className="mr-2 inline-block w-11 text-muted">{rt.method}</span>
                    {rt.route}
                  </td>
                  <td className="text-right text-sm tabular-nums">{formatCount(rt.requests)}</td>
                  <td className={cn('text-right text-sm tabular-nums', errTone(rt.errorRate))}>{rt.errorRate}%</td>
                  <td className="text-right text-sm tabular-nums">{formatMs(rt.p50)}</td>
                  <td className={cn('text-right text-sm tabular-nums', latTone(rt.p95))}>{formatMs(rt.p95)}</td>
                  <td className={cn('text-right text-sm tabular-nums text-muted', latTone(rt.p99))}>{formatMs(rt.p99)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}