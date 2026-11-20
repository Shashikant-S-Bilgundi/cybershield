import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import { api, type TaskFilter } from '@/api';
import { useScope } from '@/hooks/useScope';
import { useSession } from '@/store/session';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { TasksTable } from './TasksTable';

const VIEWS = ['open', 'overdue', 'mine', 'verifying', 'done'] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = { open: 'Open', overdue: 'Overdue', mine: 'Mine', verifying: 'Verifying', done: 'Done' };

export function RemediationPage() {
  const scope = useScope();
  const me = useSession((s) => s.session?.user.id);
  const [view, setView] = useState<View>('open');
  const filter: TaskFilter = {
    applicationId: scope.applicationId,
    ...(view === 'open' && { status: 'open' }),
    ...(view === 'overdue' && { overdue: true }),
    ...(view === 'mine' && { status: 'open', ownerId: me }),
    ...(view === 'verifying' && { status: 'ready_for_verification' }),
  };
  const tasks = useQuery({ queryKey: ['tasks', filter], queryFn: () => api.listTasks(filter), refetchInterval: 15_000 });
  const sla = useQuery({ queryKey: ['sla', scope.applicationId], queryFn: () => api.getSlaSummary({ applicationId: scope.applicationId }) });
  const rows = view === 'done' ? (tasks.data ?? []).filter((t) => t.status === 'verified' || t.status === 'wont_fix') : tasks.data ?? [];
  const s = sla.data;

  return (
    <>
      <PageHeader
        title="Remediation tasks"
        description={s?.overdue ? `${s.overdue} ${s.overdue === 1 ? 'task is' : 'tasks are'} past the SLA due date.` : 'Fixes for findings, incidents and errors. A task is only done when a recheck confirms the fix.'}
      />
      {s && (
        <section aria-label="SLA" className="mb-6 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-[repeat(6,minmax(0,1fr))_minmax(0,1.3fr)] md:divide-x md:divide-line">
          {(
            [
              ['Open', s.openTasks, ''],
              ['Overdue', s.overdue, s.overdue ? 'text-down' : ''],
              ['Due this week', s.dueThisWeek, s.dueThisWeek ? 'text-degraded' : ''],
              ['On time, 30 days', s.onTimeRate === null ? '—' : `${s.onTimeRate}%`, s.onTimeRate !== null && s.onTimeRate < 80 ? 'text-degraded' : ''],
              ['Mean time to acknowledge', s.mttaMinutes === null ? '—' : s.mttaMinutes < 120 ? `${s.mttaMinutes} min` : `${Math.round(s.mttaMinutes / 6) / 10} h`, ''],
              ['Mean time to resolve', s.mttrHours === null ? '—' : `${s.mttrHours} h`, ''],
            ] as const
          ).map(([label, value, tone]) => (
            <div key={label} className="border-b border-line px-4 py-3 md:border-b-0">
              <p className="text-xs text-muted">{label}</p>
              <p className={cn('mt-0.5 text-xl font-semibold tabular-nums', tone)}>{value}</p>
            </div>
          ))}
          <div className="col-span-2 px-4 py-3 md:col-span-1">
            <p className="mb-1 text-xs text-muted">Open by priority (overdue)</p>
            <div className="flex gap-3 text-sm tabular-nums">
              {s.byPriority.map((p) => (
                <span key={p.priority}>
                  <span className="font-mono text-xs font-semibold">{p.priority}</span> {p.open}
                  {p.overdue > 0 && <span className="text-down"> ({p.overdue})</span>}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}
      <div className="mb-4 flex gap-1 rounded border border-line p-0.5 sm:w-fit" role="tablist">
        {VIEWS.map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn('rounded-[4px] px-2.5 py-1 text-xs font-medium', view === v ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')}>
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>
      {tasks.isLoading ? (
        <Spinner />
      ) : tasks.error ? (
        <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} />
      ) : !rows.length ? (
        <EmptyState icon={<Wrench className="h-6 w-6" />} title={view === 'overdue' ? 'Nothing overdue' : 'No tasks here'} body={view === 'open' ? 'Create tasks from a finding, an incident or an error.' : undefined} />
      ) : (
        <TasksTable tasks={rows} />
      )}
    </>
  );
}