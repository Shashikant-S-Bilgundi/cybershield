import { useQuery } from '@tanstack/react-query';
import { Check, FileCheck, X } from 'lucide-react';
import { api } from '@/api';
import type { HeaderReport, SecurityHeaderName } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { RecheckButton } from './RecheckButton';

const COLUMNS: { key: SecurityHeaderName; label: string; why: string }[] = [
  { key: 'strict-transport-security', label: 'HSTS', why: 'Forces browsers to use HTTPS' },
  { key: 'content-security-policy', label: 'CSP', why: 'Limits which scripts can run' },
  { key: 'x-frame-options', label: 'Frame options', why: 'Blocks clickjacking' },
  { key: 'x-content-type-options', label: 'Content type', why: 'Stops MIME sniffing' },
  { key: 'referrer-policy', label: 'Referrer', why: 'Limits leaked URLs' },
  { key: 'permissions-policy', label: 'Permissions', why: 'Turns off unused browser features' },
];

const score = (r: HeaderReport) => COLUMNS.filter((c) => r.headers[c.key].present && !r.headers[c.key].issue).length;

export function SecurityHeadersPage() {
  const scope = useScope();
  const reports = useQuery({ queryKey: ['headers', scope], queryFn: () => api.listHeaderReports(scope) });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '—';
  const rows = [...(reports.data ?? [])].sort((a, b) => score(a) - score(b));

  return (
    <>
      <PageHeader title="Security headers" description="Response headers that tell browsers how to protect visitors. Checked daily on every website and API." />
      {reports.isLoading ? (
        <Spinner />
      ) : reports.error ? (
        <ErrorState error={reports.error} onRetry={() => reports.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<FileCheck className="h-6 w-6" />} title="No sites checked yet" body="Add and verify a website or API to check its headers." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-base">
            <thead>
              <tr>
                <th>Site</th>
                <th className="text-right">Passing</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="text-center" title={c.why}>
                    {c.label}
                  </th>
                ))}
                <th className="w-px" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = score(r);
                return (
                  <tr key={r.url}>
                    <td>
                      <p className="font-mono text-xs">{r.url.replace(/^https?:\/\//, '')}</p>
                      <p className="text-xs text-muted">
                        {appName(r.applicationId)}, checked {timeAgo(r.checkedAt)}
                      </p>
                    </td>
                    <td className={cn('text-right text-sm font-medium tabular-nums', s <= 3 ? 'text-down' : s <= 4 ? 'text-degraded' : 'text-up')}>{s} of 6</td>
                    {COLUMNS.map((c) => {
                      const h = r.headers[c.key];
                      const label = h.present ? (h.issue ? `${c.label}: present, but ${h.issue}` : `${c.label}: ${h.value}`) : `${c.label}: missing`;
                      return (
                        <td key={c.key} className="text-center" title={label}>
                          {h.present ? (
                            h.issue ? (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-degraded/15 text-xs font-bold text-degraded" aria-label={label}>
                                !
                              </span>
                            ) : (
                              <Check className="mx-auto h-4 w-4 text-up" aria-label={label} />
                            )
                          ) : (
                            <X className="mx-auto h-4 w-4 text-down" aria-label={label} />
                          )}
                        </td>
                      );
                    })}
                    <td>
                      <RecheckButton assetId={r.assetId} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-2 text-xs text-muted">Hover a mark to see the header value or what's wrong with it.</p>
        </div>
      )}
    </>
  );
}