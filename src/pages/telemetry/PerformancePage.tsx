import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import { api } from '@/api';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { formatCount, formatMs } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { PerformanceView } from './PerformanceView';

export function PerformancePage() {
  const scope = useScope();
  const [picked, setPicked] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['performance-list', scope], queryFn: () => api.listPerformance(scope), refetchInterval: 60_000 });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const name = (appId: string, envId: string) => {
    const a = apps.data?.find((x) => x.id === appId);
    return { app: a?.name ?? '—', env: a?.environments.find((e) => e.id === envId)?.name ?? '' };
  };

  const rows = list.data ?? [];
  const selected = rows.find((r) => `${r.applicationId}:${r.environmentId}` === picked) ?? (rows.length === 1 ? rows[0] : undefined);

  return (
    <>
      <PageHeader title="API performance" description="Request rate, 5xx error rate and response times per route, sent by the SDK every 60 seconds." />
      {list.isLoading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Gauge className="h-6 w-6" />}
          title="No performance data yet"
          body="Install the ShieldOps SDK in a Node.js app and add its request handler."
          action={
            <Link to="/ingestion">
              <Button>Set up the SDK</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {rows.length > 1 && (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Application</th>
                    <th className="text-right">Requests per minute</th>
                    <th className="text-right">5xx rate</th>
                    <th className="text-right">p95 response</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const key = `${r.applicationId}:${r.environmentId}`;
                    const n = name(r.applicationId, r.environmentId);
                    const active = selected && `${selected.applicationId}:${selected.environmentId}` === key;
                    return (
                      <tr key={key} className={cn('cursor-pointer', active && 'bg-accent/5')} onClick={() => setPicked(key)} aria-selected={active}>
                        <td>
                          <span className="font-medium">{n.app}</span> <span className="text-xs text-muted">{n.env}</span>
                        </td>
                        <td className="text-right text-sm tabular-nums">{formatCount(Math.round(r.rpm))}</td>
                        <td className={cn('text-right text-sm tabular-nums', r.errorRate >= 5 ? 'font-medium text-down' : r.errorRate >= 1 ? 'text-degraded' : '')}>{r.errorRate}%</td>
                        <td className={cn('text-right text-sm tabular-nums', r.p95 >= 2000 ? 'font-medium text-down' : r.p95 >= 1000 ? 'text-degraded' : '')}>{formatMs(r.p95)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!selected && <p className="border-t border-line px-4 py-2 text-xs text-muted">Choose an application to see its charts and routes.</p>}
            </div>
          )}
          {selected && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">
                {name(selected.applicationId, selected.environmentId).app}{' '}
                <span className="text-sm font-normal text-muted">{name(selected.applicationId, selected.environmentId).env}</span>
              </h2>
              <PerformanceView key={`${selected.applicationId}:${selected.environmentId}`} applicationId={selected.applicationId} environmentId={selected.environmentId} />
            </section>
          )}
        </div>
      )}
    </>
  );
}