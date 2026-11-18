import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { api } from '@/api';
import { usePreferences } from '@/store/preferences';
import { PageHeader } from '@/components/ui/PageHeader';
import { HealthBadge, CriticalityMeter } from '@/components/ui/Badge';
import { HealthRibbon } from '@/components/ui/HealthRibbon';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { SEVERITY_LABEL, daysUntil, timeAgo } from '@/lib/format';
import type { HealthState, Severity } from '@/types';

const STATE_ORDER: HealthState[] = ['down', 'degraded', 'unknown', 'up', 'paused'];
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const sevBar: Record<Severity, string> = { critical: 'bg-crit', high: 'bg-high', medium: 'bg-med', low: 'bg-low', info: 'bg-info' };

export function DashboardPage() {
  const scopeApp = usePreferences((s) => s.applicationId);
  const summary = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 60_000 });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const audit = useQuery({ queryKey: ['audit-logs', 'recent'], queryFn: () => api.listAuditLogs({ page: 1, pageSize: 6 }) });

  if (summary.isLoading || apps.isLoading) return <Spinner />;
  if (summary.error) return <ErrorState error={summary.error} onRetry={() => summary.refetch()} />;
  const data = summary.data!;
  const appById = new Map((apps.data ?? []).map((a) => [a.id, a]));

  if (data.applications === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState
          title="Register your first application"
          body="ShieldOps tracks health and security per application. Add one, then attach its domains, servers and repositories."
          action={
            <Link to="/applications?new=1">
              <Button variant="primary">New application</Button>
            </Link>
          }
        />
      </>
    );
  }

  const board = data.healthByApp
    .filter((h) => !scopeApp || h.applicationId === scopeApp)
    .sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
  const totalFindings = SEVERITIES.reduce((n, s) => n + data.findingsBySeverity[s], 0);
  const expiries = data.expiries
    .filter((e) => !scopeApp || e.applicationId === scopeApp)
    .sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'));
  const attention = data.health.down + data.health.degraded;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          attention > 0
            ? `${attention} of ${data.applications} applications need attention right now.`
            : `All ${data.applications} applications are healthy.`
        }
      />

      <section aria-label="Summary" className="mb-6 grid grid-cols-2 divide-line overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-4 md:divide-x">
        {[
          { label: 'Down', value: data.health.down, tone: data.health.down ? 'text-down' : '' },
          { label: 'Degraded', value: data.health.degraded, tone: data.health.degraded ? 'text-degraded' : '' },
          { label: 'Open alerts', value: data.openAlerts, tone: '' },
          { label: 'Active incidents', value: data.activeIncidents, tone: '' },
        ].map((m) => (
          <div key={m.label} className="border-b border-line px-4 py-3 md:border-b-0">
            <p className="text-xs text-muted">{m.label}</p>
            <p className={cn('mt-0.5 text-2xl font-semibold tabular-nums', m.tone)}>{m.value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="board-title" className="rounded-lg border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 id="board-title" className="font-semibold">
              Production health, last 60 minutes
            </h2>
            <Link to="/applications" className="text-xs text-muted hover:text-ink">
              All applications
            </Link>
          </div>
          <div className="hidden grid-cols-[200px_minmax(0,1fr)_96px_72px] gap-x-4 border-b border-line px-4 py-2 text-xs text-muted md:grid" aria-hidden>
            <span>Application</span>
            <span>Each bar is one check; taller means slower</span>
            <span>Now</span>
            <span className="text-right">Uptime 30d</span>
          </div>
          <ul className="divide-y divide-line">
            {board.map((h) => {
              const app = appById.get(h.applicationId);
              if (!app) return null;
              return (
                <li key={h.applicationId}>
                  <Link
                    to={`/applications/${app.id}`}
                    className={cn(
                      'grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-sunken/60 md:grid-cols-[200px_minmax(0,1fr)_96px_72px]',
                      h.state === 'down' && 'bg-down/[0.04]',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{app.name}</p>
                      <div className="mt-0.5 text-xs text-muted">
                        <CriticalityMeter value={app.criticality} />
                      </div>
                    </div>
                    <HealthRibbon ticks={h.ticks} className="order-last col-span-2 md:order-none md:col-span-1" />
                    <HealthBadge state={h.state} className="justify-self-end md:justify-self-start" />
                    <p className="hidden text-right text-sm tabular-nums text-muted md:block" title="Share of checks that were not down">
                      {h.uptime30d === null ? '—' : `${h.uptime30d}%`}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="findings-title" className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <h2 id="findings-title" className="font-semibold">
                Open findings
              </h2>
              <span className="text-sm tabular-nums text-muted">{totalFindings}</span>
            </div>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
              {SEVERITIES.map((s) => (
                <span key={s} className={sevBar[s]} style={{ width: `${totalFindings ? (data.findingsBySeverity[s] / totalFindings) * 100 : 0}%` }} />
              ))}
            </div>
            <dl className="mt-3 grid grid-cols-5 gap-2 text-center">
              {SEVERITIES.map((s) => (
                <div key={s}>
                  <dt className="text-2xs text-muted">{SEVERITY_LABEL[s]}</dt>
                  <dd className="text-base font-semibold tabular-nums">{data.findingsBySeverity[s]}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="expiry-title" className="rounded-lg border border-line bg-surface">
            <h2 id="expiry-title" className="border-b border-line px-4 py-3 font-semibold">
              Certificates and domains
            </h2>
            {expiries.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">No expiry data yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {expiries.map((e) => {
                  const days = e.expiresAt ? daysUntil(e.expiresAt) : null;
                  return (
                    <li key={`${e.assetId}-${e.kind}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs">{e.identifier}</p>
                        <p className="text-xs text-muted">{e.kind === 'ssl' ? 'SSL certificate' : 'Domain registration'}</p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 text-sm tabular-nums',
                          days === null ? 'text-muted' : days <= 7 ? 'font-semibold text-down' : days <= 30 ? 'font-medium text-degraded' : 'text-muted',
                        )}
                      >
                        {days === null ? 'Unavailable' : `${days} days`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="activity-title" className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 id="activity-title" className="font-semibold">
                Recent activity
              </h2>
              <Link to="/audit-logs" className="inline-flex items-center gap-0.5 text-xs text-muted hover:text-ink">
                Audit logs <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
            <ul className="divide-y divide-line">
              {(audit.data?.items ?? []).map((l) => (
                <li key={l.id} className="px-4 py-2.5 text-sm">
                  <p>
                    <span className="font-medium">{l.actorName}</span> <span className="text-muted">{l.summary.charAt(0).toLowerCase() + l.summary.slice(1)}</span>
                  </p>
                  <p className="text-xs text-muted">{timeAgo(l.at)}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}