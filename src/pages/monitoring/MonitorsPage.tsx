import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, Plus } from 'lucide-react';
import { api } from '@/api';
import type { HealthState } from '@/types';
import { useScope } from '@/hooks/useScope';
import { HEALTH_LABEL } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { MonitorsTable } from './MonitorsTable';
import { MonitorFormModal } from './MonitorFormModal';

const FILTERS: (HealthState | 'all')[] = ['all', 'down', 'degraded', 'unknown', 'up', 'paused'];

export function MonitorsPage() {
  const scope = useScope();
  const navigate = useNavigate();
  const [state, setState] = useState<HealthState | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const monitors = useQuery({ queryKey: ['monitors', scope], queryFn: () => api.listMonitors(scope), refetchInterval: 30_000 });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: monitors.data?.length ?? 0 };
    (monitors.data ?? []).forEach((m) => (c[m.status] = (c[m.status] ?? 0) + 1));
    return c;
  }, [monitors.data]);
  const rows = (monitors.data ?? []).filter((m) => state === 'all' || m.status === state);
  const down = counts.down ?? 0;

  return (
    <>
      <PageHeader
        title="Uptime checks"
        description={down ? `${down} ${down === 1 ? 'monitor is' : 'monitors are'} down right now.` : 'HTTP, TCP and DNS checks on your verified assets.'}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New monitor
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Filter by status">
        {FILTERS.filter((f) => f === 'all' || counts[f]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setState(f)}
            aria-pressed={state === f}
            className={cn('rounded border px-2.5 py-1 text-xs font-medium', state === f ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted hover:text-ink')}
          >
            {f === 'all' ? 'All' : HEALTH_LABEL[f]} <span className="tabular-nums text-muted">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>
      {monitors.isLoading ? (
        <Spinner />
      ) : monitors.error ? (
        <ErrorState error={monitors.error} onRetry={() => monitors.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-6 w-6" />}
          title={monitors.data?.length ? 'No monitors in this state' : 'No monitors yet'}
          body={monitors.data?.length ? undefined : 'Pick a verified website, API, server or database and ShieldOps starts checking it straight away.'}
          action={!monitors.data?.length ? <Button variant="primary" onClick={() => setCreating(true)}>New monitor</Button> : undefined}
        />
      ) : (
        <MonitorsTable monitors={rows} />
      )}
      <MonitorFormModal open={creating} onClose={() => setCreating(false)} defaultApplicationId={scope.applicationId} onSaved={(m) => navigate(`/monitors/${m.id}`)} />
    </>
  );
}