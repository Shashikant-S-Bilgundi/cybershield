import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api, type AlertFilter } from '@/api';
import type { Severity, SignalSource } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { SEVERITY_LABEL, SOURCE_LABEL } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { AlertsList } from './AlertsList';

const VIEWS: { key: NonNullable<AlertFilter['status']> | 'all'; label: string }[] = [
  { key: 'active', label: 'Needs attention' },
  { key: 'snoozed', label: 'Snoozed' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

export function AlertsPage() {
  const scope = useScope();
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('active');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [source, setSource] = useState<SignalSource | ''>('');
  const filter: AlertFilter = { ...scope, status: view === 'all' ? undefined : view, severity: severity || undefined, source: source || undefined };
  const alerts = useQuery({ queryKey: ['alerts', filter], queryFn: () => api.listAlerts(filter), refetchInterval: 30_000 });

  const open = (alerts.data ?? []).filter((a) => a.status === 'open').length;

  return (
    <>
      <PageHeader
        title="Alerts"
        description={view === 'active' && open ? `${open} ${open === 1 ? 'alert needs' : 'alerts need'} someone to acknowledge ${open === 1 ? 'it' : 'them'}.` : 'Conditions that need attention now. Alerts resolve on their own when the condition clears.'}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded border border-line p-0.5" role="tablist">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              className={cn('rounded-[4px] px-2.5 py-1 text-xs font-medium', view === v.key ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')}
            >
              {v.label}
            </button>
          ))}
        </div>
        <Select value={severity} onChange={(e) => setSeverity(e.target.value as Severity | '')} aria-label="Severity" className="w-36">
          <option value="">All severities</option>
          {(Object.keys(SEVERITY_LABEL) as Severity[]).map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={source} onChange={(e) => setSource(e.target.value as SignalSource | '')} aria-label="Source" className="w-44">
          <option value="">All sources</option>
          {(Object.keys(SOURCE_LABEL) as SignalSource[]).map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>
      {alerts.isLoading ? (
        <Spinner />
      ) : alerts.error ? (
        <ErrorState error={alerts.error} onRetry={() => alerts.refetch()} />
      ) : !alerts.data?.length ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title={view === 'active' ? 'Nothing needs attention' : 'No alerts here'} body={view === 'active' ? 'New alerts appear here and are sent to the channels in Alert rules.' : undefined} />
      ) : (
        <AlertsList alerts={alerts.data} />
      )}
    </>
  );
}