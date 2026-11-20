import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';

const PAGE = 50;

export function LoginActivityPage() {
  const [tab, setTab] = useState<'apps' | 'console'>('apps');
  return (
    <>
      <PageHeader title="Login activity" description="Who signed in, from where, and which attempts failed." />
      <div className="mb-5 flex gap-1 border-b border-line" role="tablist">
        {(
          [
            ['apps', 'Your applications'],
            ['console', 'ShieldOps itself'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === k ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'apps' ? <AppLogins /> : <ConsoleLogins />}
    </>
  );
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-muted">
      <span className="tabular-nums">
        {total === 0 ? 0 : (page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {total}
      </span>
      <div className="flex gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" disabled={page * PAGE >= total} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

function AppLogins() {
  const scope = useScope();
  const [failedOnly, setFailedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const filter = { ...scope, types: failedOnly ? (['login_failure', 'mfa_failure'] as const) : (['login_success', 'login_failure', 'mfa_failure'] as const), page, pageSize: PAGE };
  const events = useQuery({ queryKey: ['app-logins', filter], queryFn: () => api.listSecurityEvents({ ...filter, types: [...filter.types] }), placeholderData: keepPreviousData });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '—';

  return (
    <>
      <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={failedOnly}
          onChange={(e) => {
            setFailedOnly(e.target.checked);
            setPage(1);
          }}
          className="accent-[rgb(var(--accent))]"
        />
        Failed attempts only
      </label>
      {events.isLoading ? (
        <Spinner />
      ) : events.error ? (
        <ErrorState error={events.error} />
      ) : !events.data?.total ? (
        <EmptyState title="No logins recorded" body="Apps report logins with shieldops.security.loginSucceeded() and loginFailed()." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Result</th>
                  <th>Account</th>
                  <th>IP</th>
                  <th>Application</th>
                </tr>
              </thead>
              <tbody>
                {events.data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-sm tabular-nums">{formatDateTime(e.at)}</td>
                    <td className={cn('text-sm', e.result === 'success' ? 'text-up' : 'font-medium text-down')}>{e.type === 'mfa_failure' ? 'Failed two-factor' : e.result === 'success' ? 'Signed in' : 'Failed'}</td>
                    <td className="font-mono text-xs">{e.account ?? e.actorHash ?? '—'}</td>
                    <td className="whitespace-nowrap font-mono text-xs">
                      {e.ip} {e.country && <span className="font-sans text-muted">{e.country}</span>}
                    </td>
                    <td className="text-sm">{appName(e.applicationId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={events.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

function ConsoleLogins() {
  const [page, setPage] = useState(1);
  const logins = useQuery({ queryKey: ['console-logins', page], queryFn: () => api.listConsoleLogins({ page, pageSize: PAGE }), placeholderData: keepPreviousData });
  if (logins.isLoading) return <Spinner />;
  if (logins.error) return <ErrorState error={logins.error} />;
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="table-base">
          <thead>
            <tr>
              <th>Time</th>
              <th>Member</th>
              <th>Result</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {logins.data!.items.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-sm tabular-nums">{formatDateTime(l.at)}</td>
                <td className="text-sm">{l.name ?? <span className="text-muted">Unknown account</span>}</td>
                <td className={cn('text-sm', l.result === 'success' ? 'text-up' : 'font-medium text-down')}>
                  {l.result === 'success' ? 'Signed in' : 'Failed'}
                  <span className="block text-xs font-normal text-muted">{l.detail}</span>
                </td>
                <td className="font-mono text-xs">{l.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={logins.data!.total} onPage={setPage} />
    </>
  );
}