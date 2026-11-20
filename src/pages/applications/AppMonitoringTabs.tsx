import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/api';
import type { Application } from '@/types';
import { cn } from '@/lib/cn';
import { daysUntil, formatInterval, timeAgo } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/States';
import { MonitorsTable } from '@/pages/monitoring/MonitorsTable';
import { MonitorFormModal } from '@/pages/monitoring/MonitorFormModal';
import { AlertsList } from '@/pages/operations/AlertsList';
import { FindingsTable } from '@/pages/operations/FindingsTable';
import { RepositoriesTable } from '@/pages/code/RepositoriesPage';
import { IncidentsTable } from '@/pages/operations/IncidentsTable';
import { TasksTable } from '@/pages/operations/TasksTable';

export function HealthTab({ app }: { app: Application }) {
  const [creating, setCreating] = useState(false);
  const scope = { applicationId: app.id };
  const monitors = useQuery({ queryKey: ['monitors', scope], queryFn: () => api.listMonitors(scope), refetchInterval: 30_000 });
  const hbs = useQuery({ queryKey: ['heartbeats', scope], queryFn: () => api.listHeartbeats(scope) });

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Uptime checks</h2>
          <Button size="sm" onClick={() => setCreating(true)} disabled={app.status === 'archived'}>
            <Plus className="h-4 w-4" aria-hidden />
            New monitor
          </Button>
        </div>
        {monitors.isLoading ? (
          <Spinner />
        ) : !monitors.data?.length ? (
          <EmptyState title="No uptime checks yet" body="Add one for each website, API, server or database so you hear about outages first." />
        ) : (
          <MonitorsTable monitors={monitors.data} showApplication={false} />
        )}
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Scheduled jobs</h2>
          <Link to="/heartbeats" className="text-sm text-accent hover:underline">
            Manage heartbeats
          </Link>
        </div>
        {!hbs.data?.length ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No heartbeats for this application.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {hbs.data.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{h.name}</p>
                  <p className="text-xs text-muted">{h.schedule.kind === 'interval' ? `Every ${formatInterval(h.schedule.seconds)}` : `Cron ${h.schedule.expression}`}</p>
                </div>
                <div className="text-right">
                  <p className={cn('font-medium', h.status === 'down' ? 'text-down' : h.status === 'late' ? 'text-degraded' : h.status === 'up' ? 'text-up' : 'text-muted')}>
                    {{ new: 'Waiting', up: 'On time', late: 'Late', down: 'Missed', paused: 'Paused' }[h.status]}
                  </p>
                  <p className="text-xs text-muted">Last ping {timeAgo(h.lastPingAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <MonitorFormModal open={creating} onClose={() => setCreating(false)} defaultApplicationId={app.id} />
    </div>
  );
}

export function SecurityTab({ app }: { app: Application }) {
  const scope = { applicationId: app.id };
  const certs = useQuery({ queryKey: ['certificates', scope], queryFn: () => api.listCertificates(scope) });
  const headers = useQuery({ queryKey: ['headers', scope], queryFn: () => api.listHeaderReports(scope) });
  const domains = useQuery({ queryKey: ['domains', scope], queryFn: () => api.listDomainExpiry(scope) });
  const findings = useQuery({ queryKey: ['findings', { ...scope, status: 'active' }], queryFn: () => api.listFindings({ ...scope, status: 'active' }) });
  const repos = useQuery({ queryKey: ['repositories', scope], queryFn: () => api.listRepositories(scope) });

  const passing = (h: NonNullable<typeof headers.data>[number]) => Object.values(h.headers).filter((x) => x.present && !x.issue).length;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-line bg-surface">
          <h2 className="flex items-center justify-between border-b border-line px-4 py-3 text-sm font-semibold">
            Certificates
            <Link to="/ssl-dns" className="text-xs font-normal text-accent hover:underline">
              Details
            </Link>
          </h2>
          <ul className="divide-y divide-line">
            {(certs.data ?? []).map((c) => {
              const d = c.validTo ? daysUntil(c.validTo) : null;
              return (
                <li key={c.host} className="flex justify-between gap-2 px-4 py-2 text-sm">
                  <span className="truncate font-mono text-xs">{c.host}</span>
                  <span className={cn('shrink-0 tabular-nums', d !== null && d <= 7 ? 'font-medium text-down' : d !== null && d <= 30 ? 'text-degraded' : 'text-muted')}>{d === null ? '—' : `${d} days`}</span>
                </li>
              );
            })}
            {!certs.data?.length && <li className="px-4 py-3 text-sm text-muted">None checked yet.</li>}
          </ul>
        </section>
        <section className="rounded-lg border border-line bg-surface">
          <h2 className="flex items-center justify-between border-b border-line px-4 py-3 text-sm font-semibold">
            Security headers
            <Link to="/security-headers" className="text-xs font-normal text-accent hover:underline">
              Details
            </Link>
          </h2>
          <ul className="divide-y divide-line">
            {(headers.data ?? []).map((h) => (
              <li key={h.url} className="flex justify-between gap-2 px-4 py-2 text-sm">
                <span className="truncate font-mono text-xs">{h.url.replace(/^https?:\/\//, '')}</span>
                <span className={cn('shrink-0 tabular-nums', passing(h) <= 3 ? 'text-down' : passing(h) <= 4 ? 'text-degraded' : 'text-up')}>{passing(h)} of 6</span>
              </li>
            ))}
            {!headers.data?.length && <li className="px-4 py-3 text-sm text-muted">None checked yet.</li>}
          </ul>
        </section>
        <section className="rounded-lg border border-line bg-surface">
          <h2 className="flex items-center justify-between border-b border-line px-4 py-3 text-sm font-semibold">
            Domains
            <Link to="/domain-expiry" className="text-xs font-normal text-accent hover:underline">
              Details
            </Link>
          </h2>
          <ul className="divide-y divide-line">
            {(domains.data ?? []).map((d) => {
              const days = d.expiresAt ? daysUntil(d.expiresAt) : null;
              return (
                <li key={d.domain} className="flex justify-between gap-2 px-4 py-2 text-sm">
                  <span className="truncate font-mono text-xs">{d.domain}</span>
                  <span className={cn('shrink-0 tabular-nums', days === null ? 'text-muted' : days <= 30 ? 'text-degraded' : 'text-muted')}>{days === null ? 'Unknown' : `${days} days`}</span>
                </li>
              );
            })}
            {!domains.data?.length && <li className="px-4 py-3 text-sm text-muted">No domains.</li>}
          </ul>
        </section>
      </div>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Code</h2>
          <Link to="/repositories" className="text-sm text-accent hover:underline">
            Manage repositories
          </Link>
        </div>
        {repos.isLoading ? (
          <Spinner />
        ) : !repos.data?.length ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No repositories connected for this application.</p>
        ) : (
          <RepositoriesTable repos={repos.data} showApplication={false} />
        )}
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Open findings, by priority</h2>
        {findings.isLoading ? <Spinner /> : !findings.data?.length ? <EmptyState title="No open findings" /> : <FindingsTable findings={findings.data} showApplication={false} />}
      </section>
      <p className="text-sm">
        <Link to="/security-events" className="text-accent hover:underline">
          Security events and detections
        </Link>{' '}
        <span className="text-muted">cover logins and attacks against this app.</span>
      </p>
    </div>
  );
}

export function IssuesTab({ app }: { app: Application }) {
  const scope = { applicationId: app.id };
  const incidents = useQuery({ queryKey: ['incidents', { applicationId: app.id, status: 'active' }], queryFn: () => api.listIncidents({ applicationId: app.id, status: 'active' }) });
  const tasks = useQuery({ queryKey: ['tasks', { applicationId: app.id, status: 'open' }], queryFn: () => api.listTasks({ applicationId: app.id, status: 'open' }) });
  const alerts = useQuery({ queryKey: ['alerts', { ...scope, status: 'active' }], queryFn: () => api.listAlerts({ ...scope, status: 'active' }) });
  const findings = useQuery({ queryKey: ['findings', { ...scope, status: 'active' }], queryFn: () => api.listFindings({ ...scope, status: 'active' }) });
  return (
    <div className="space-y-8">
      {!!incidents.data?.length && (
        <section>
          <h2 className="mb-3 font-semibold">Open incidents</h2>
          <IncidentsTable incidents={incidents.data} showApps={false} />
        </section>
      )}
      <section>
        <h2 className="mb-3 font-semibold">Alerts that need attention</h2>
        {alerts.isLoading ? <Spinner /> : !alerts.data?.length ? <EmptyState title="No active alerts" /> : <AlertsList alerts={alerts.data} showApplication={false} />}
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Open findings, by priority</h2>
        {findings.isLoading ? <Spinner /> : !findings.data?.length ? <EmptyState title="No open findings" /> : <FindingsTable findings={findings.data} showApplication={false} />}
      </section>
      {!!tasks.data?.length && (
        <section>
          <h2 className="mb-3 font-semibold">Open remediation tasks</h2>
          <TasksTable tasks={tasks.data} />
        </section>
      )}
    </div>
  );
}