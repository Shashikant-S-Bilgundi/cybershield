import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { api, type SecurityEventFilter } from '@/api';
import type { DetectionRule, SecurityEvent, SecurityEventType } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { SECURITY_EVENT_LABEL, durationBetween, formatDateTime, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Sparkline } from '@/components/ui/Sparkline';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';

const DETECTION: Record<DetectionRule, { label: string; tone: string }> = {
  credential_stuffing: { label: 'Credential stuffing', tone: 'text-crit' },
  failed_logins: { label: 'Brute-force logins', tone: 'text-high' },
  auth_failure_spike: { label: '401/403 spike', tone: 'text-med' },
  unusual_volume: { label: 'Unusual request volume', tone: 'text-med' },
};

const RESULT_TONE: Record<SecurityEvent['result'], string> = { success: 'text-muted', failure: 'text-down', blocked: 'text-degraded' };
const PAGE = 50;

export function SecurityEventsPage() {
  const scope = useScope();
  const [type, setType] = useState<SecurityEventType | ''>('');
  const [result, setResult] = useState<SecurityEvent['result'] | ''>('');
  const [ip, setIp] = useState('');
  const [page, setPage] = useState(1);

  const filter: SecurityEventFilter = { ...scope, types: type ? [type] : undefined, result: result || undefined, ip: ip || undefined, page, pageSize: PAGE };
  const events = useQuery({ queryKey: ['security-events', filter], queryFn: () => api.listSecurityEvents(filter), placeholderData: keepPreviousData, refetchInterval: 60_000 });
  const stats = useQuery({ queryKey: ['security-stats', scope], queryFn: () => api.getSecurityStats(scope), refetchInterval: 60_000 });
  const detections = useQuery({ queryKey: ['detections', scope], queryFn: () => api.listDetections(scope) });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '—';

  const setFilter = (fn: () => void) => {
    fn();
    setPage(1);
  };
  const s = stats.data;
  const total = events.data?.total ?? 0;

  return (
    <>
      <PageHeader title="Security events" description="Logins, 401/403 responses and other security events your apps send through the SDK, with automatic detection of attacks. Last 24 hours." />

      {s && (
        <section aria-label="Summary" className="mb-6 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.6fr)] md:divide-x md:divide-line">
          {[
            ['Failed logins', s.byType.login_failure + s.byType.mfa_failure],
            ['401/403 responses', s.byType.authz_failure],
            ['Rate limited', s.byType.rate_limited],
            ['Distinct IPs', s.uniqueIps],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-line px-4 py-3 md:border-b-0">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
          <div className="col-span-2 px-4 py-3 md:col-span-1">
            <p className="mb-1 text-xs text-muted">Failures per hour</p>
            <Sparkline values={s.failuresHourly} tone="bg-down/60" className="h-9" label="Failed security events per hour over the last 24 hours" />
          </div>
        </section>
      )}

      <section aria-labelledby="det-title" className="mb-8">
        <h2 id="det-title" className="mb-3 font-semibold">
          Detections
        </h2>
        {detections.isLoading ? (
          <Spinner />
        ) : !detections.data?.length ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No attacks detected in the last 24 hours.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {detections.data.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
                <div className="min-w-[200px] flex-1">
                  <p className={cn('text-sm font-semibold', DETECTION[d.rule].tone)}>{DETECTION[d.rule].label}</p>
                  <p className="text-sm">
                    <span className="font-mono text-xs">{d.subject}</span> <span className="text-muted">on {appName(d.applicationId)}</span>
                  </p>
                </div>
                <p className="text-sm tabular-nums">
                  {d.count} {d.rule === 'auth_failure_spike' ? 'responses' : 'failures'}
                  {d.distinctAccounts && d.distinctAccounts > 1 ? <span className="text-muted">, {d.distinctAccounts} accounts</span> : null}
                  <span className="block text-xs text-muted">over {durationBetween(d.firstAt, d.lastAt)}</span>
                </p>
                <p className="text-sm text-muted" title={formatDateTime(d.lastAt)}>
                  {timeAgo(d.lastAt)}
                </p>
                <div className="flex gap-2">
                  {/^[\d.:]+$/.test(d.subject) && (
                    <Button size="sm" onClick={() => setFilter(() => setIp(d.subject))}>
                      Show events
                    </Button>
                  )}
                  {d.alertId && (
                    <Link to="/alerts">
                      <Button size="sm" variant="ghost">
                        View alert
                      </Button>
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ev-title">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="ev-title" className="mr-auto font-semibold">
            Events
          </h2>
          <Select value={type} onChange={(e) => setFilter(() => setType(e.target.value as SecurityEventType | ''))} aria-label="Event type" className="w-44">
            <option value="">All event types</option>
            {(Object.keys(SECURITY_EVENT_LABEL) as SecurityEventType[]).map((t) => (
              <option key={t} value={t}>
                {SECURITY_EVENT_LABEL[t]}
              </option>
            ))}
          </Select>
          <Select value={result} onChange={(e) => setFilter(() => setResult(e.target.value as SecurityEvent['result'] | ''))} aria-label="Result" className="w-36">
            <option value="">Any result</option>
            <option value="failure">Failed</option>
            <option value="blocked">Blocked</option>
            <option value="success">Succeeded</option>
          </Select>
          <Input value={ip} onChange={(e) => setFilter(() => setIp(e.target.value))} placeholder="Filter by IP" aria-label="Filter by IP" className="w-40 font-mono text-xs" />
        </div>
        {events.isLoading ? (
          <Spinner />
        ) : events.error ? (
          <ErrorState error={events.error} onRetry={() => events.refetch()} />
        ) : total === 0 ? (
          <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="No events match" body="Try clearing a filter." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Result</th>
                    <th>Account</th>
                    <th>IP</th>
                    <th>Request</th>
                    <th>Application</th>
                  </tr>
                </thead>
                <tbody>
                  {events.data!.items.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap text-sm tabular-nums">{formatDateTime(e.at)}</td>
                      <td className="whitespace-nowrap text-sm">{SECURITY_EVENT_LABEL[e.type]}</td>
                      <td className={cn('text-sm capitalize', RESULT_TONE[e.result])}>{e.result === 'failure' ? 'Failed' : e.result === 'blocked' ? 'Blocked' : 'OK'}</td>
                      <td className="font-mono text-xs">{e.account ?? e.actorHash ?? '—'}</td>
                      <td className="whitespace-nowrap font-mono text-xs">
                        <button type="button" onClick={() => setFilter(() => setIp(e.ip))} className="hover:underline" title="Show only this IP">
                          {e.ip}
                        </button>
                        {e.country && <span className="ml-1 font-sans text-muted">{e.country}</span>}
                      </td>
                      <td className="whitespace-nowrap font-mono text-xs text-muted">{e.route ? `${e.method} ${e.route} → ${e.status}` : '—'}</td>
                      <td className="text-sm">{appName(e.applicationId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-muted">
              <span className="tabular-nums">
                {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button size="sm" disabled={page * PAGE >= total} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}