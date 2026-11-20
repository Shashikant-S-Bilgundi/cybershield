import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { api } from '@/api';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { daysUntil, formatDate, formatDateTime, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { RecheckButton } from './RecheckButton';

const SOURCE = { rdap: 'RDAP', whois: 'WHOIS', unavailable: 'Not available' } as const;

export function DomainExpiryPage() {
  const scope = useScope();
  const domains = useQuery({ queryKey: ['domains', scope], queryFn: () => api.listDomainExpiry(scope) });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '—';
  const rows = [...(domains.data ?? [])].sort((a, b) => (a.expiresAt ?? '0').localeCompare(b.expiresAt ?? '0'));

  return (
    <>
      <PageHeader
        title="Domain expiry"
        description="Registration dates are checked daily, with alerts at 60, 30 and 7 days. Some country domains, including .in, don't publish expiry dates; track those manually."
      />
      {domains.isLoading ? (
        <Spinner />
      ) : domains.error ? (
        <ErrorState error={domains.error} onRetry={() => domains.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="No domains yet" body="Add and verify a domain asset to track when its registration expires." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-base">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Expires</th>
                <th className="text-right">Days left</th>
                <th>Registrar</th>
                <th>Source</th>
                <th>Checked</th>
                <th className="w-px" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const days = d.expiresAt ? daysUntil(d.expiresAt) : null;
                return (
                  <tr key={d.domain}>
                    <td>
                      <p className="font-mono text-xs">{d.domain}</p>
                      <p className="text-xs text-muted">{appName(d.applicationId)}</p>
                    </td>
                    <td className="whitespace-nowrap text-sm tabular-nums">{d.expiresAt ? formatDate(d.expiresAt) : <span className="text-muted">Unknown</span>}</td>
                    <td
                      className={cn(
                        'text-right text-sm font-medium tabular-nums',
                        days === null ? 'text-muted' : days <= 7 ? 'text-down' : days <= 30 ? 'text-degraded' : days <= 60 ? 'text-med' : '',
                      )}
                    >
                      {days === null ? '—' : days}
                    </td>
                    <td className="text-sm">{d.registrar ?? '—'}</td>
                    <td className="text-sm text-muted">{SOURCE[d.source]}</td>
                    <td className="whitespace-nowrap text-sm text-muted" title={formatDateTime(d.checkedAt)}>
                      {timeAgo(d.checkedAt)}
                    </td>
                    <td>
                      <RecheckButton assetId={d.assetId} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}