import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Siren } from 'lucide-react';
import { api, type IncidentFilter } from '@/api';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { CreateIncidentDialog } from './CreateIncidentDialog';
import { IncidentsTable } from './IncidentsTable';

export function IncidentsPage() {
  const scope = useScope();
  const [view, setView] = useState<'active' | 'resolved' | 'closed' | 'all'>('active');
  const [creating, setCreating] = useState(false);
  const filter: IncidentFilter = { applicationId: scope.applicationId, status: view === 'all' ? undefined : view };
  const incidents = useQuery({ queryKey: ['incidents', filter], queryFn: () => api.listIncidents(filter), refetchInterval: 30_000 });
  const crit = (incidents.data ?? []).filter((i) => i.severity === 'critical').length;

  return (
    <>
      <PageHeader
        title="Incidents"
        description={view === 'active' && crit ? `${crit} critical ${crit === 1 ? 'incident is' : 'incidents are'} open.` : 'Problems being investigated, each with an owner, linked evidence and a timeline.'}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New incident
          </Button>
        }
      />
      <div className="mb-4 flex gap-1 rounded border border-line p-0.5 sm:w-fit" role="tablist">
        {(['active', 'resolved', 'closed', 'all'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn('rounded-[4px] px-2.5 py-1 text-xs font-medium', view === v ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')}>
            {{ active: 'Open', resolved: 'Resolved', closed: 'Closed', all: 'All' }[v]}
          </button>
        ))}
      </div>
      {incidents.isLoading ? (
        <Spinner />
      ) : incidents.error ? (
        <ErrorState error={incidents.error} onRetry={() => incidents.refetch()} />
      ) : !incidents.data?.length ? (
        <EmptyState icon={<Siren className="h-6 w-6" />} title={view === 'active' ? 'No open incidents' : 'No incidents here'} body={view === 'active' ? 'Start one from an alert, a finding or an error, or with New incident.' : undefined} />
      ) : (
        <IncidentsTable incidents={incidents.data} />
      )}
      {creating && <CreateIncidentDialog preset={{ applicationIds: scope.applicationId ? [scope.applicationId] : [] }} onClose={() => setCreating(false)} />}
    </>
  );
}