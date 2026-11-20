import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pause, Play, RefreshCw } from 'lucide-react';
import { api } from '@/api';
import { ProbeResults } from './ProbeResults';
import type { CheckResult } from '@/types';
import { cn } from '@/lib/cn';
import { CHECK_ERROR_LABEL, HEALTH_LABEL, MONITOR_TYPE_LABEL, durationBetween, formatDateTime, formatInterval, formatMs, formatPercent, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { HealthBadge } from '@/components/ui/Badge';
import { HealthRibbon } from '@/components/ui/HealthRibbon';
import { LatencyChart } from '@/components/ui/LatencyChart';
import { ErrorState, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { ConfirmDialog } from '@/components/security/ConfirmDialog';
import { useCritical } from '@/components/security/reauth';
import { MonitorFormModal } from './MonitorFormModal';

const RESULT_TEXT: Record<CheckResult['status'], string> = { up: 'Passed', degraded: 'Slow', down: 'Failed', unknown: 'Not checked' };
const RESULT_TONE: Record<CheckResult['status'], string> = { up: 'text-up', degraded: 'text-degraded', down: 'text-down', unknown: 'text-muted' };

export function MonitorDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const critical = useCritical();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const monitor = useQuery({ queryKey: ['monitor', id], queryFn: () => api.getMonitor(id), refetchInterval: 30_000 });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['monitors'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const run = useMutation({
    mutationFn: () => api.runMonitorNow(id),
    onSuccess: (m) => {
      qc.setQueryData(['monitor', id], m);
      refresh();
      const last = m.results.at(-1);
      if (last) toast.success(`Check ${RESULT_TEXT[last.status].toLowerCase()}${last.latencyMs ? ` in ${formatMs(last.latencyMs)}` : ''}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const pause = useMutation({
    mutationFn: (paused: boolean) => api.setMonitorPaused(id, paused),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ['monitor', id] });
      refresh();
      toast.success(m.paused ? 'Monitor paused. No alerts will be sent.' : 'Monitor resumed');
    },
  });

  if (monitor.isLoading) return <Spinner />;
  if (monitor.error) return <ErrorState error={monitor.error} onRetry={() => monitor.refetch()} />;
  const m = monitor.data!;
  const app = apps.data?.find((a) => a.id === m.applicationId);
  const env = app?.environments.find((e) => e.id === m.environmentId);
  const since = m.events.find((e) => e.to === m.status)?.at ?? m.createdAt;
  const recent = [...m.results].reverse().slice(0, 25);

  return (
    <>
      <PageHeader
        title={m.name}
        description={
          <span className="font-mono text-xs">
            {MONITOR_TYPE_LABEL[m.type]} {m.target}
          </span>
        }
        actions={
          <>
            <Button onClick={() => run.mutate()} loading={run.isPending} disabled={m.paused}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Check now
            </Button>
            <Button onClick={() => pause.mutate(!m.paused)} loading={pause.isPending}>
              {m.paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
              {m.paused ? 'Resume' : 'Pause'}
            </Button>
            <Menu
              actions={[
                { label: 'Edit monitor', onSelect: () => setEditing(true) },
                { label: 'Delete monitor', danger: true, onSelect: () => setDeleting(true) },
              ]}
            />
          </>
        }
      >
        <Link to="/monitors" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Uptime checks
        </Link>
      </PageHeader>

      <section aria-label="Summary" className="mb-6 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface sm:grid-cols-3 lg:grid-cols-6 lg:divide-x lg:divide-line">
        <div className={cn('border-b border-line px-4 py-3 lg:border-b-0', m.status === 'down' && 'bg-down/[0.06]')}>
          <p className="text-xs text-muted">Status</p>
          <HealthBadge state={m.status} className="mt-1" />
          <p className="mt-0.5 text-xs text-muted">for {durationBetween(since)}</p>
        </div>
        {[
          ['Last response', formatMs(m.lastLatencyMs)],
          ['Uptime 24h', formatPercent(m.uptime.d1)],
          ['Uptime 7d', formatPercent(m.uptime.d7)],
          ['Uptime 30d', formatPercent(m.uptime.d30)],
          ['Checks every', formatInterval(m.intervalSec)],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-line px-4 py-3 lg:border-b-0">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-line bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Response time</h2>
              <p className="text-xs text-muted">Red bands are failed checks; the dashed line is the 2,000 ms slow threshold.</p>
            </div>
            <LatencyChart results={m.results} />
            <HealthRibbon ticks={m.results.slice(-90).map((r) => ({ at: r.at, state: r.status, latencyMs: r.latencyMs }))} height={18} className="mt-3" />
          </section>

          <section className="rounded-lg border border-line bg-surface">
            <h2 className="border-b border-line px-4 py-3 font-semibold">Recent checks</h2>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Result</th>
                    <th className="text-right">Response</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.at}>
                      <td className="whitespace-nowrap text-sm tabular-nums">{formatDateTime(r.at)}</td>
                      <td className={cn('text-sm font-medium', RESULT_TONE[r.status])}>{RESULT_TEXT[r.status]}</td>
                      <td className="text-right text-sm tabular-nums">{formatMs(r.latencyMs)}</td>
                      <td className="text-sm text-muted">
                        {r.error ? CHECK_ERROR_LABEL[r.error] : null}
                        {r.statusCode ? <span className="font-mono text-xs">{r.error ? ` (HTTP ${r.statusCode})` : `HTTP ${r.statusCode}`}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-lg border border-line bg-surface p-4">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Application</dt>
                <dd className="mt-0.5">
                  {app ? (
                    <Link to={`/applications/${app.id}/health`} className="hover:underline">
                      {app.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                  {env && <span className="text-muted">, {env.name}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Goes down after</dt>
                <dd className="mt-0.5">{m.downAfterFailures} failed checks in a row</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Timeout</dt>
                <dd className="mt-0.5">{formatMs(m.timeoutMs)}</dd>
              </div>
              {m.expectedStatus && (
                <div>
                  <dt className="text-xs text-muted">Expected status</dt>
                  <dd className="mt-0.5 font-mono text-xs">{m.expectedStatus}</dd>
                </div>
              )}
              {m.keyword && (
                <div>
                  <dt className="text-xs text-muted">Page must contain</dt>
                  <dd className="mt-0.5">“{m.keyword}”</dd>
                </div>
              )}
              {m.recordType && (
                <div>
                  <dt className="text-xs text-muted">Record type</dt>
                  <dd className="mt-0.5 font-mono text-xs">{m.recordType}</dd>
                </div>
              )}
            </dl>
          </section>

          <ProbeResults monitorId={m.id} />

          <section className="rounded-lg border border-line bg-surface">
            <h2 className="border-b border-line px-4 py-3 font-semibold">Status changes</h2>
            {m.events.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">No changes in the checks shown.</p>
            ) : (
              <ol className="divide-y divide-line">
                {m.events.slice(0, 12).map((e) => (
                  <li key={e.at + e.to} className="px-4 py-2.5 text-sm">
                    <p>
                      <span className="text-muted">{HEALTH_LABEL[e.from]}</span> to <span className="font-medium">{HEALTH_LABEL[e.to]}</span>
                    </p>
                    <p className="text-xs text-muted">{e.reason}</p>
                    <p className="text-xs text-muted" title={formatDateTime(e.at)}>
                      {timeAgo(e.at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      <MonitorFormModal open={editing} onClose={() => setEditing(false)} monitor={m} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${m.name}?`}
        body="Its check history is removed and no more alerts are raised for it."
        actionLabel="Delete monitor"
        confirmText="delete"
        onConfirm={() =>
          critical(() => api.deleteMonitor(m.id)).then(() => {
            refresh();
            toast.success('Monitor deleted');
            navigate('/monitors');
          })
        }
      />
    </>
  );
}