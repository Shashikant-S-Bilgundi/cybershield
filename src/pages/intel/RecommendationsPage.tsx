import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lightbulb, Sparkles } from 'lucide-react';
import { api } from '@/api';
import type { Priority, Recommendation } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PriorityBadge } from '@/components/ui/StatusLabels';
import { EmptyState, ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { CreateTaskDialog } from '@/pages/operations/CreateTaskDialog';

const EFFORT = { small: 'Small: under an hour', medium: 'Medium: a few hours', large: 'Large: days' };

export function RecommendationsPage() {
  const scope = useScope();
  const qc = useQueryClient();
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissing, setDismissing] = useState<Recommendation | null>(null);
  const [task, setTask] = useState<Recommendation | null>(null);
  const recs = useQuery({ queryKey: ['recommendations', scope.applicationId, showDismissed], queryFn: () => api.listRecommendations({ applicationId: scope.applicationId, includeDismissed: showDismissed }) });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appNames = (ids: string[]) => ids.map((i) => apps.data?.find((a) => a.id === i)?.name ?? '—').join(', ');
  const restore = useMutation({ mutationFn: (r: Recommendation) => api.restoreRecommendation(r.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['recommendations'] }) });
  const total = (recs.data ?? []).filter((r) => !r.dismissed).reduce((n, r) => n + r.findingIds.length, 0);

  return (
    <>
      <PageHeader
        title="Recommendations"
        description={total ? `The fixes below would close ${total} open findings. Each one is grouped so a single change does the most good.` : 'Suggested fixes, grouped so one change closes as many findings as possible.'}
        actions={
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} className="accent-[rgb(var(--accent))]" />
            Show dismissed
          </label>
        }
      />
      {recs.isLoading ? (
        <Spinner />
      ) : recs.error ? (
        <ErrorState error={recs.error} onRetry={() => recs.refetch()} />
      ) : !recs.data?.length ? (
        <EmptyState icon={<Lightbulb className="h-6 w-6" />} title="Nothing to recommend" body="No open findings that a grouped fix would help with." />
      ) : (
        <ol className="space-y-3">
          {recs.data.map((r) => {
            const closes = (Object.entries(r.closes) as [Priority, number][]).filter(([, n]) => n > 0);
            return (
              <li key={r.id} className={cn('rounded-lg border border-line bg-surface p-4', r.dismissed && 'opacity-60')}>
                <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                  <div className="min-w-[280px] flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {r.title}
                      {r.source === 'ai' && (
                        <span className="inline-flex items-center gap-1 rounded border border-accent/40 px-1.5 py-0.5 text-2xs font-semibold text-accent" title="Suggested by the AI analyst from patterns across alerts, errors and incidents">
                          <Sparkles className="h-3 w-3" aria-hidden />
                          AI suggestion
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">{r.why}</p>
                    <p className="mt-1 text-xs text-muted">
                      {appNames(r.applicationIds)}. {EFFORT[r.effort]}.
                    </p>
                  </div>
                  <div className="w-44">
                    {closes.length ? (
                      <>
                        <p className="mb-1 text-xs text-muted">Closes</p>
                        <div className="flex flex-wrap gap-1">
                          {closes.map(([p, n]) => (
                            <span key={p} className="inline-flex items-center gap-1 text-sm tabular-nums">
                              {n} <PriorityBadge priority={p} />
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted">Prevents repeats rather than closing findings.</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {r.dismissed ? (
                      <Button size="sm" onClick={() => restore.mutate(r)}>
                        Restore
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="primary" onClick={() => setTask(r)} disabled={!r.findingIds.length}>
                          Create task
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDismissing(r)}>
                          Dismiss
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted">How to do it</summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    {r.steps.map((s) => (
                      <li key={s} className={s.includes(';') || s.startsWith('add_header') || s.startsWith('npm ') || s.startsWith('ssl_') ? 'font-mono text-xs' : ''}>
                        {s}
                      </li>
                    ))}
                  </ol>
                  {r.findingIds.length > 0 && (
                    <p className="mt-2 text-xs text-muted">
                      Covers{' '}
                      {r.findingIds.slice(0, 6).map((f, i) => (
                        <span key={f}>
                          {i > 0 && ', '}
                          <Link to={`/findings/${f}`} className="text-accent hover:underline">
                            finding {i + 1}
                          </Link>
                        </span>
                      ))}
                      {r.findingIds.length > 6 && ` and ${r.findingIds.length - 6} more`}.
                    </p>
                  )}
                  {r.dismissed && r.dismissedReason && <p className="mt-2 text-xs">Dismissed: {r.dismissedReason}</p>}
                </details>
              </li>
            );
          })}
        </ol>
      )}
      {dismissing && <DismissDialog rec={dismissing} onClose={() => setDismissing(null)} />}
      {task && (
        <CreateTaskDialog linkedType="finding" linkedId={task.findingIds[0]} linkedTitle={`${task.title} (${task.findingIds.length} findings)`} suggestion={task.title} onClose={() => setTask(null)} />
      )}
    </>
  );
}

function DismissDialog({ rec, onClose }: { rec: Recommendation; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const dismiss = useMutation({
    mutationFn: () => api.dismissRecommendation(rec.id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recommendations'] });
      toast.success('Dismissed');
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Dismiss recommendation"
      description={rec.title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => dismiss.mutate()} loading={dismiss.isPending} disabled={reason.trim().length < 5}>
            Dismiss
          </Button>
        </>
      }
    >
      <Field label="Why not now?">{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />}</Field>
      <InlineError error={dismiss.error} />
    </Modal>
  );
}