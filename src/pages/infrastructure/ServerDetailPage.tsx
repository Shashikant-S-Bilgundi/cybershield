import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/api';
import type { ContainerStatus, PerfRange, ServiceStatus } from '@/types';
import { cn } from '@/lib/cn';
import { formatDateTime, formatKbps, formatUptime, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Menu } from '@/components/ui/Menu';
import { MetricChart } from '@/components/ui/MetricChart';
import { SeverityBadge } from '@/components/ui/Badge';
import { UsageBar } from '@/components/ui/UsageBar';
import { ErrorState, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { ConfirmDialog } from '@/components/security/ConfirmDialog';
import { useCritical } from '@/components/security/reauth';
import { ServerState } from './ServersTable';

const RANGES: { key: PerfRange; label: string }[] = [
  { key: '1h', label: 'Last hour' },
  { key: '24h', label: '24 hours' },
  { key: '7d', label: '7 days' },
];

const pct = (v: number) => `${Math.round(v)}%`;

function serviceTone(s: { status?: ServiceStatus['status']; state?: ContainerStatus['state']; restarts10m: number }) {
  const bad = (s.status && s.status !== 'running') || (s.state && s.state !== 'running');
  return bad ? 'text-down font-medium' : s.restarts10m >= 3 ? 'text-degraded font-medium' : 'text-up';
}

export function ServerDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const critical = useCritical();
  const [range, setRange] = useState<PerfRange>('24h');
  const [removing, setRemoving] = useState(false);
  const server = useQuery({ queryKey: ['server', id], queryFn: () => api.getServer(id), refetchInterval: 30_000 });
  const metrics = useQuery({ queryKey: ['server-metrics', id, range], queryFn: () => api.getServerMetrics(id, range), refetchInterval: 60_000 });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });

  if (server.isLoading) return <Spinner />;
  if (server.error) return <ErrorState error={server.error} onRetry={() => server.refetch()} />;
  const s = server.data!;
  const app = apps.data?.find((a) => a.id === s.applicationId);
  const env = app?.environments.find((e) => e.id === s.environmentId);
  const pts = metrics.data ?? [];
  const times = pts.map((p) => p.at);

  return (
    <>
      <PageHeader
        title={s.hostname}
        description={`${s.os}, ${s.cpuCores} cores, ${s.memoryGb} GB memory`}
        actions={<Menu actions={[{ label: 'Remove server', danger: true, onSelect: () => setRemoving(true) }]} />}
      >
        <Link to="/servers" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Servers and containers
        </Link>
      </PageHeader>

      {s.status === 'offline' && (
        <p className="mb-5 rounded-lg border border-down/30 bg-down/10 px-4 py-3 text-sm">
          The agent last reported {timeAgo(s.lastSeenAt)}. The server may be down, out of network, or the agent stopped. Figures below are from its last report.
        </p>
      )}

      <section aria-label="Now" className="mb-6 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-6 md:divide-x md:divide-line">
        <div className="border-b border-line px-4 py-3 md:border-b-0">
          <p className="text-xs text-muted">Status</p>
          <div className="mt-1">
            <ServerState server={s} />
          </div>
        </div>
        {(
          [
            ['CPU', s.usage?.cpu, 80, 90],
            ['Memory', s.usage?.memory, 80, 90],
            ['Disk', s.usage?.disk, 85, 95],
          ] as const
        ).map(([label, v, w, c]) => (
          <div key={label} className="border-b border-line px-4 py-3 md:border-b-0">
            <p className="mb-1.5 text-xs text-muted">{label}</p>
            <UsageBar value={v ?? null} warn={w} crit={c} label={label} />
          </div>
        ))}
        <div className="border-b border-line px-4 py-3 md:border-b-0">
          <p className="text-xs text-muted">Load (1 min)</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{s.usage?.load1 ?? '—'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-muted">Up for</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatUptime(s.uptimeSec)}</p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-lg border border-line bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Usage</h2>
              <div className="flex gap-1 rounded border border-line p-0.5" role="tablist" aria-label="Time range">
                {RANGES.map((r) => (
                  <button key={r.key} type="button" role="tab" aria-selected={range === r.key} onClick={() => setRange(r.key)} className={cn('rounded-[4px] px-2.5 py-1 text-xs font-medium', range === r.key ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            {metrics.isLoading ? (
              <Spinner />
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-sm font-medium">CPU and memory</h3>
                  <MetricChart
                    ariaLabel="CPU and memory use"
                    times={times}
                    fixedMax={100}
                    format={pct}
                    threshold={{ value: 90, label: 'alert at 90%' }}
                    series={[
                      { label: 'CPU', values: pts.map((p) => p.cpu), stroke: 'stroke-accent' },
                      { label: 'Memory', values: pts.map((p) => p.memory), stroke: 'stroke-low', dashed: true },
                    ]}
                  />
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-medium">Disk</h3>
                  <MetricChart ariaLabel="Disk use" times={times} fixedMax={100} format={pct} threshold={{ value: 85, label: 'warn at 85%' }} series={[{ label: 'Disk /', values: pts.map((p) => p.disk), stroke: 'stroke-high' }]} />
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-medium">Network</h3>
                  <MetricChart
                    ariaLabel="Network traffic"
                    times={times}
                    format={(v) => formatKbps(v)}
                    series={[
                      { label: 'In', values: pts.map((p) => p.netInKbps), stroke: 'stroke-accent' },
                      { label: 'Out', values: pts.map((p) => p.netOutKbps), stroke: 'stroke-muted', dashed: true },
                    ]}
                  />
                </div>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-line bg-surface">
            <h2 className="border-b border-line px-4 py-3 font-semibold">Services</h2>
            {s.services.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">No services are being watched. Name them in the agent's config file.</p>
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Status</th>
                    <th className="text-right">Restarts, 10 min</th>
                    <th className="text-right">CPU</th>
                    <th className="text-right">Memory</th>
                  </tr>
                </thead>
                <tbody>
                  {s.services.map((sv) => (
                    <tr key={sv.name}>
                      <td>
                        <span className="font-mono text-xs">{sv.name}</span> <span className="text-xs text-muted">{sv.manager}</span>
                      </td>
                      <td className={cn('text-sm capitalize', serviceTone(sv))}>{sv.status}</td>
                      <td className={cn('text-right text-sm tabular-nums', sv.restarts10m >= 3 && 'font-medium text-degraded')}>{sv.restarts10m}</td>
                      <td className="text-right text-sm tabular-nums">{sv.cpu}%</td>
                      <td className="text-right text-sm tabular-nums">{sv.memoryMb >= 1024 ? `${(sv.memoryMb / 1024).toFixed(1)} GB` : `${sv.memoryMb} MB`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {s.containers.length > 0 && (
            <section className="rounded-lg border border-line bg-surface">
              <h2 className="border-b border-line px-4 py-3 font-semibold">Docker containers</h2>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Container</th>
                      <th>State</th>
                      <th className="text-right">Restarts, 10 min</th>
                      <th className="text-right">CPU</th>
                      <th className="text-right">Memory</th>
                      <th>Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.containers.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <p className="font-mono text-xs font-medium">{c.name}</p>
                          <p className="font-mono text-2xs text-muted">{c.image}</p>
                        </td>
                        <td className={cn('text-sm capitalize', serviceTone(c))}>{c.state}</td>
                        <td className={cn('text-right text-sm tabular-nums', c.restarts10m >= 3 && 'font-medium text-degraded')}>{c.restarts10m}</td>
                        <td className="text-right text-sm tabular-nums">{c.cpu}%</td>
                        <td className="text-right text-sm tabular-nums">{c.memoryMb ? `${c.memoryMb} MB` : '—'}</td>
                        <td className="whitespace-nowrap text-sm text-muted" title={formatDateTime(c.startedAt)}>
                          {timeAgo(c.startedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-line bg-surface p-4">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Application</dt>
                <dd>
                  {app ? (
                    <Link to={`/applications/${app.id}/infrastructure`} className="hover:underline">
                      {app.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                  {env && <span className="text-muted">, {env.name}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">IP addresses</dt>
                <dd className="font-mono text-xs">{s.ips.join(', ')}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Kernel</dt>
                <dd className="font-mono text-xs">{s.kernel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Agent</dt>
                <dd>
                  Version {s.agentVersion}, reports every {s.intervalSec} s
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Last report</dt>
                <dd title={formatDateTime(s.lastSeenAt)}>{timeAgo(s.lastSeenAt)}</dd>
              </div>
            </dl>
          </section>
          <section className="rounded-lg border border-line bg-surface p-4">
            <h2 className="mb-2 text-sm font-semibold">Volumes</h2>
            <ul className="space-y-2.5">
              {s.disks.map((d) => (
                <li key={d.mount} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono text-xs">{d.mount}</span>
                    <span className="text-xs tabular-nums text-muted">
                      {d.usedGb} of {d.totalGb} GB
                    </span>
                  </div>
                  <UsageBar value={(d.usedGb / d.totalGb) * 100} label={`Disk ${d.mount}`} className="mt-1" />
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-lg border border-line bg-surface">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Events</h2>
            {s.events.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">Nothing unusual recently.</p>
            ) : (
              <ol className="divide-y divide-line">
                {s.events.map((e) => (
                  <li key={e.at + e.text} className="px-4 py-2.5 text-sm">
                    <div className="mb-1 flex items-center gap-2">
                      <SeverityBadge severity={e.severity} />
                      <span className="text-xs text-muted" title={formatDateTime(e.at)}>
                        {timeAgo(e.at)}
                      </span>
                    </div>
                    {e.text}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title={`Remove ${s.hostname}?`}
        body="Use this for servers that no longer exist. If the agent is still running there, the server comes back on its next report. To stop it for good, revoke its agent token."
        actionLabel="Remove server"
        confirmText={s.hostname}
        onConfirm={() =>
          critical(() => api.removeServer(s.id)).then(() => {
            qc.invalidateQueries({ queryKey: ['servers'] });
            toast.success(`${s.hostname} removed`);
            navigate('/servers');
          })
        }
      />
    </>
  );
}