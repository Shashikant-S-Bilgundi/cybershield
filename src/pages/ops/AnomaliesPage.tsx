import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '@/api';
import type { Anomaly } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMs, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricChart } from '@/components/ui/MetricChart';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';

const fmt = (a: Anomaly, v: number) => (a.unit === 'ms' ? formatMs(Math.round(v)) : `${Math.round(v)}`);

export function AnomaliesPage() {
  const scope = useScope();
  const anomalies = useQuery({ queryKey: ['anomalies', scope.applicationId], queryFn: () => api.listAnomalies({ applicationId: scope.applicationId }), refetchInterval: 60_000 });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '—';
  const ongoing = (anomalies.data ?? []).filter((a) => !a.endedAt).length;

  return (
    <>
      <PageHeader
        title="Anomalies"
        description={
          ongoing
            ? `${ongoing} unusual ${ongoing === 1 ? 'pattern is' : 'patterns are'} happening now.`
            : 'Traffic, errors, response times and failed logins that move far outside their usual range for that hour and weekday.'
        }
      />
      <p className="mb-5 max-w-3xl text-sm text-muted">
        The usual range is learned from the last 4 weeks for the same hour and weekday, so a quiet Sunday night is not flagged as a drop. Alerts for these use the "Unusual pattern" rule in{' '}
        <Link to="/alert-rules" className="text-accent hover:underline">
          Alert rules
        </Link>
        .
      </p>
      {anomalies.isLoading ? (
        <Spinner />
      ) : anomalies.error ? (
        <ErrorState error={anomalies.error} onRetry={() => anomalies.refetch()} />
      ) : !anomalies.data?.length ? (
        <EmptyState title="Nothing unusual" body="Everything is within its usual range." />
      ) : (
        <ul className="space-y-4">
          {anomalies.data.map((a) => {
            const Icon = a.direction === 'up' ? TrendingUp : TrendingDown;
            return (
              <li key={a.id} className={cn('rounded-lg border bg-surface p-4', a.endedAt ? 'border-line' : 'border-degraded/50')}>
                <div className="mb-2 flex flex-wrap items-start gap-x-6 gap-y-1">
                  <div className="min-w-[260px] flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <Icon className={cn('h-4 w-4', a.endedAt ? 'text-muted' : 'text-degraded')} aria-hidden />
                      {a.title}
                    </p>
                    <p className="text-sm text-muted">
                      {appName(a.applicationId)}. {fmt(a, a.actual)} {a.unit === 'ms' ? '' : a.unit} against a usual {fmt(a, a.expectedLow)} to {fmt(a, a.expectedHigh)}
                      {a.unit === 'ms' ? '' : ` ${a.unit}`}.
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className={a.endedAt ? 'text-muted' : 'font-medium text-degraded'}>{a.endedAt ? 'Back to normal' : 'Ongoing'}</p>
                    <p className="text-xs text-muted" title={formatDateTime(a.startedAt)}>
                      started {timeAgo(a.startedAt)}
                      {a.endedAt && `, lasted ${Math.max(1, Math.round((Date.parse(a.endedAt) - Date.parse(a.startedAt)) / 60_000))} min`}
                    </p>
                    {a.alertId && (
                      <Link to="/alerts" className="text-xs text-accent hover:underline">
                        View alert
                      </Link>
                    )}
                  </div>
                </div>
                <MetricChart
                  ariaLabel={`${a.title}: actual against usual range, last 8 hours`}
                  times={a.series.map((s) => s.at)}
                  format={(v) => fmt(a, v)}
                  series={[
                    { label: 'Actual', values: a.series.map((s) => s.actual), stroke: a.endedAt ? 'stroke-accent' : 'stroke-degraded' },
                    { label: 'Usual high', values: a.series.map((s) => s.high), stroke: 'stroke-muted', dashed: true },
                    { label: 'Usual low', values: a.series.map((s) => s.low), stroke: 'stroke-muted', dashed: true },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}