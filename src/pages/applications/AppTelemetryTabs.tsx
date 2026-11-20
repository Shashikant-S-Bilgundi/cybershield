import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import type { Application } from '@/types';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/States';
import { ErrorGroupsTable } from '@/pages/telemetry/ErrorGroupsTable';
import { PerformanceView } from '@/pages/telemetry/PerformanceView';

function SetupSdk({ what }: { what: string }) {
  return (
    <EmptyState
      title={`No ${what} from this application yet`}
      body="Create an ingestion key for one of its environments and add the ShieldOps SDK."
      action={
        <Link to="/ingestion">
          <Button>Set up the SDK</Button>
        </Link>
      }
    />
  );
}

export function ErrorsTab({ app }: { app: Application }) {
  const [view, setView] = useState<'open' | 'all'>('open');
  const filter = { applicationId: app.id, status: view === 'open' ? ('open' as const) : undefined };
  const groups = useQuery({ queryKey: ['error-groups', filter], queryFn: () => api.listErrorGroups(filter), refetchInterval: 30_000 });
  const any = useQuery({ queryKey: ['error-groups', { applicationId: app.id }], queryFn: () => api.listErrorGroups({ applicationId: app.id }) });

  if (groups.isLoading || any.isLoading) return <Spinner />;
  if (!any.data?.length) return <SetupSdk what="errors" />;
  return (
    <>
      <div className="mb-4 flex gap-1 rounded border border-line p-0.5 sm:w-fit" role="tablist">
        {(
          [
            ['open', 'Needs fixing'],
            ['all', 'All errors'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn('rounded-[4px] px-2.5 py-1 text-xs font-medium', view === k ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')}>
            {label}
          </button>
        ))}
      </div>
      {groups.data?.length ? <ErrorGroupsTable groups={groups.data} showApplication={false} /> : <EmptyState title="No errors need fixing" />}
    </>
  );
}

export function PerformanceTab({ app }: { app: Application }) {
  const list = useQuery({ queryKey: ['performance-list', { applicationId: app.id }], queryFn: () => api.listPerformance({ applicationId: app.id }) });
  const [envId, setEnvId] = useState<string | null>(null);
  if (list.isLoading) return <Spinner />;
  const envs = list.data ?? [];
  if (!envs.length) return <SetupSdk what="performance data" />;
  const current = envs.find((e) => e.environmentId === envId) ?? envs[0];
  return (
    <>
      {envs.length > 1 && (
        <div className="mb-4 flex gap-1" role="tablist" aria-label="Environment">
          {envs.map((e) => (
            <button key={e.environmentId} type="button" role="tab" aria-selected={current.environmentId === e.environmentId} onClick={() => setEnvId(e.environmentId)} className={cn('rounded border px-2.5 py-1 text-xs font-medium', current.environmentId === e.environmentId ? 'border-accent bg-accent/10' : 'border-line text-muted')}>
              {app.environments.find((x) => x.id === e.environmentId)?.name}
            </button>
          ))}
        </div>
      )}
      <PerformanceView key={current.environmentId} applicationId={app.id} environmentId={current.environmentId} />
    </>
  );
}