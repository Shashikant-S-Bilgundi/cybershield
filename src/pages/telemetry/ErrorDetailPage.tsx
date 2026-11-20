import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/api';
import type { ErrorGroupStatus, StackFrame } from '@/types';
import { cn } from '@/lib/cn';
import { formatCount, formatDateTime, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { Sparkline } from '@/components/ui/Sparkline';
import { ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { ErrorStatusText } from './ErrorGroupsTable';
import { CreateTaskDialog } from '@/pages/operations/CreateTaskDialog';
import { CreateIncidentDialog } from '@/pages/operations/CreateIncidentDialog';
import { AiPanel } from '@/components/ai/AiPanel';
import { Sparkles } from 'lucide-react';

const ACTIONS: Record<ErrorGroupStatus, { status: ErrorGroupStatus; label: string; primary?: boolean }[]> = {
  unresolved: [
    { status: 'resolved', label: 'Resolve', primary: true },
    { status: 'ignored', label: 'Ignore' },
  ],
  regressed: [
    { status: 'resolved', label: 'Resolve again', primary: true },
    { status: 'ignored', label: 'Ignore' },
  ],
  resolved: [{ status: 'unresolved', label: 'Reopen' }],
  ignored: [{ status: 'unresolved', label: 'Stop ignoring' }],
};

function Frame({ f }: { f: StackFrame }) {
  return (
    <li className={cn('px-4 py-2', !f.inApp && 'bg-sunken/50 text-muted')}>
      <p className="font-mono text-xs">
        <span className={cn(f.inApp && 'font-semibold text-ink')}>{f.fn}</span>
        <span className="text-muted">
          {' '}
          in {f.file}:{f.line}:{f.column}
        </span>
        {!f.inApp && <span className="ml-2 font-sans text-2xs">library</span>}
      </p>
      {f.code && (
        <pre className="mt-1 overflow-x-auto rounded bg-sunken px-3 py-1.5 font-mono text-xs text-ink">
          <span className="select-none text-muted">{f.line} </span>
          {f.code}
        </pre>
      )}
    </li>
  );
}

export function ErrorDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [showLibrary, setShowLibrary] = useState(false);
  const [dialog, setDialog] = useState<'task' | 'incident' | 'ai' | null>(null);
  const group = useQuery({ queryKey: ['error-group', id], queryFn: () => api.getErrorGroup(id), refetchInterval: 30_000 });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });

  const update = useMutation({
    mutationFn: (input: { status?: ErrorGroupStatus; assigneeId?: string | null }) => api.updateErrorGroup(id, input),
    onSuccess: (g, v) => {
      qc.setQueryData(['error-group', id], g);
      qc.invalidateQueries({ queryKey: ['error-groups'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(
        v.status === 'resolved'
          ? 'Resolved. If it happens again, it is marked regressed and alerts the team.'
          : v.status === 'ignored'
            ? 'Ignored. New events are still counted but never alert.'
            : v.status
              ? 'Reopened'
              : 'Assignment saved',
      );
    },
  });

  if (group.isLoading) return <Spinner />;
  if (group.error) return <ErrorState error={group.error} onRetry={() => group.refetch()} />;
  const g = group.data!;
  const app = apps.data?.find((a) => a.id === g.applicationId);
  const env = app?.environments.find((e) => e.id === g.environmentId);
  const frames = showLibrary ? g.stack : g.stack.filter((f) => f.inApp);
  const hidden = g.stack.length - g.stack.filter((f) => f.inApp).length;

  return (
    <>
      <PageHeader
        title={g.type}
        description={<span className="text-ink">{g.message}</span>}
        actions={ACTIONS[g.status].map((a) => (
          <Button key={a.status} variant={a.primary ? 'primary' : 'secondary'} onClick={() => update.mutate({ status: a.status })} disabled={update.isPending}>
            {a.label}
          </Button>
        ))}
      >
        <Link to="/errors" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Errors
        </Link>
      </PageHeader>

      {g.status === 'regressed' && (
        <p className="mb-5 rounded-lg border border-high/30 bg-high/10 px-4 py-3 text-sm">
          This was resolved {timeAgo(g.resolvedAt)} but has happened again in <span className="font-mono text-xs">{g.lastRelease}</span>.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-semibold">Stack trace</h2>
              {hidden > 0 && (
                <button type="button" onClick={() => setShowLibrary((v) => !v)} className="text-xs text-accent hover:underline">
                  {showLibrary ? 'Hide library frames' : `Show ${hidden} library ${hidden === 1 ? 'frame' : 'frames'}`}
                </button>
              )}
            </div>
            <ol className="divide-y divide-line">
              {frames.map((f, i) => (
                <Frame key={`${f.file}:${f.line}:${i}`} f={f} />
              ))}
            </ol>
          </section>

          <section className="rounded-lg border border-line bg-surface">
            <h2 className="border-b border-line px-4 py-3 font-semibold">Recent events</h2>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Release</th>
                    <th>Request</th>
                    <th>User</th>
                    <th>Context</th>
                  </tr>
                </thead>
                <tbody>
                  {g.events.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap text-sm tabular-nums">{formatDateTime(e.at)}</td>
                      <td className="whitespace-nowrap font-mono text-xs">{e.release}</td>
                      <td className="whitespace-nowrap font-mono text-xs">{e.request ? `${e.request.method} ${e.request.route}${e.request.status ? ` → ${e.request.status}` : ''}` : '—'}</td>
                      <td className="font-mono text-xs text-muted">{e.userHash ?? '—'}</td>
                      <td className="text-xs text-muted">
                        {Object.entries(e.tags)
                          .filter(([k]) => k !== 'environment')
                          .map(([, v]) => v)
                          .join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-2 text-xs text-muted">Users appear as hashed IDs; ShieldOps never receives names, emails, tokens or cookies.</p>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="space-y-4 rounded-lg border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <ErrorStatusText status={g.status} />
              <span className="text-xs text-muted">{g.platform === 'browser' ? 'Browser' : 'Node.js'}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted">Events</p>
                <p className="text-lg font-semibold tabular-nums">{formatCount(g.count)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Users affected</p>
                <p className="text-lg font-semibold tabular-nums">{formatCount(g.usersAffected)}</p>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">Last 24 hours</p>
              <Sparkline values={g.trend} tone="bg-down/70" className="h-10" />
            </div>
            <Field label="Assigned to">
              {(fid) => (
                <Select id={fid} value={g.assigneeId ?? ''} onChange={(e) => update.mutate({ assigneeId: e.target.value || null })}>
                  <option value="">Nobody</option>
                  {(users.data ?? [])
                    .filter((u) => u.status === 'active')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <InlineError error={update.error} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setDialog('ai')}>
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Explain with AI
              </Button>
              <Button size="sm" onClick={() => setDialog('task')}>
                Create task
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog('incident')}>
                Start incident
              </Button>
            </div>
            <dl className="space-y-2 border-t border-line pt-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Application</dt>
                <dd>
                  {app ? (
                    <Link to={`/applications/${app.id}/errors`} className="hover:underline">
                      {app.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                  {env && <span className="text-muted">, {env.name}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">First seen</dt>
                <dd title={formatDateTime(g.firstSeen)}>{timeAgo(g.firstSeen)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Last seen</dt>
                <dd title={formatDateTime(g.lastSeen)}>{timeAgo(g.lastSeen)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Where</dt>
                <dd className="break-all font-mono text-xs">{g.culprit}</dd>
              </div>
            </dl>
          </section>
          <section className="rounded-lg border border-line bg-surface p-4">
            <h2 className="mb-2 text-sm font-semibold">Releases</h2>
            <ul className="space-y-1 text-sm">
              {g.releases.map((r) => (
                <li key={r.release} className="flex justify-between gap-2">
                  <span className="truncate font-mono text-xs">{r.release}</span>
                  <span className="tabular-nums text-muted">{formatCount(r.count)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-lg border border-line bg-surface p-4">
            <h2 className="mb-2 text-sm font-semibold">History</h2>
            <ol className="space-y-2 text-sm">
              {g.history.map((h) => (
                <li key={h.at + h.text}>
                  <span className="font-medium">{h.actorName}</span> <span className="text-muted">{h.text.charAt(0).toLowerCase() + h.text.slice(1)}</span>
                  <p className="text-xs text-muted">{timeAgo(h.at)}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
      {dialog === 'ai' && <AiPanel context={{ type: 'error_group', id: g.id }} title={`${g.type}: ${g.message}`} firstQuestion="Explain this error" onClose={() => setDialog(null)} />}
      {dialog === 'task' && <CreateTaskDialog linkedType="error_group" linkedId={g.id} linkedTitle={`${g.type}: ${g.message}`} suggestion={`Fix ${g.type} in ${g.culprit.split(' in ')[0]}`} onClose={() => setDialog(null)} />}
      {dialog === 'incident' && (
        <CreateIncidentDialog
          preset={{ title: `${g.type} in ${app?.name ?? 'production'}`, summary: g.message, severity: 'high', applicationIds: [g.applicationId], links: [{ type: 'error_group', id: g.id, title: `${g.type}: ${g.message}` }] }}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}