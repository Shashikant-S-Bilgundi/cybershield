import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { api } from '@/api';
import type { Certificate } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { daysUntil, formatDate, formatDateTime, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { RecheckButton } from './RecheckButton';

function certState(c: Certificate): { label: string; tone: string } {
  if (c.error) return { label: 'Could not check', tone: 'text-muted' };
  const days = c.validTo ? daysUntil(c.validTo) : null;
  if (days !== null && days <= 0) return { label: 'Expired', tone: 'text-down' };
  if (days !== null && days <= 7) return { label: `Expires in ${days} days`, tone: 'text-down' };
  if (days !== null && days <= 30) return { label: `Expires in ${days} days`, tone: 'text-degraded' };
  if (c.chainValid === false) return { label: 'Untrusted chain', tone: 'text-degraded' };
  if (c.weakCiphers || c.protocol?.includes('1.0')) return { label: 'Weak protocol', tone: 'text-degraded' };
  return { label: 'Valid', tone: 'text-up' };
}

export function SslDnsPage() {
  const [tab, setTab] = useState<'ssl' | 'dns'>('ssl');
  return (
    <>
      <PageHeader title="SSL and DNS" description="Certificates are checked daily and DNS records every 6 hours. Changes and expiries raise alerts." />
      <div className="mb-5 flex gap-1 border-b border-line" role="tablist">
        {(['ssl', 'dns'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === t ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}
          >
            {t === 'ssl' ? 'Certificates' : 'DNS records'}
          </button>
        ))}
      </div>
      {tab === 'ssl' ? <Certificates /> : <DnsRecords />}
    </>
  );
}

function Certificates() {
  const scope = useScope();
  const certs = useQuery({ queryKey: ['certificates', scope], queryFn: () => api.listCertificates(scope) });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '—';

  if (certs.isLoading) return <Spinner />;
  if (certs.error) return <ErrorState error={certs.error} onRetry={() => certs.refetch()} />;
  if (!certs.data?.length) return <EmptyState icon={<Lock className="h-6 w-6" />} title="No certificates checked yet" body="Add and verify a domain, website or API to start checking its certificate." />;

  const rows = [...certs.data].sort((a, b) => (a.validTo ?? '').localeCompare(b.validTo ?? ''));
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="table-base">
        <thead>
          <tr>
            <th>Host</th>
            <th>State</th>
            <th>Expires</th>
            <th>Issuer</th>
            <th>Protocol</th>
            <th>Chain</th>
            <th>Checked</th>
            <th className="w-px" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const s = certState(c);
            return (
              <tr key={c.host}>
                <td>
                  <p className="font-mono text-xs">{c.host}</p>
                  <p className="text-xs text-muted">{appName(c.applicationId)}</p>
                </td>
                <td className={cn('whitespace-nowrap text-sm font-medium', s.tone)}>{s.label}</td>
                <td className="whitespace-nowrap text-sm tabular-nums">{formatDate(c.validTo)}</td>
                <td className="text-sm">{c.issuer ?? '—'}</td>
                <td className={cn('text-sm', (c.weakCiphers || c.protocol?.includes('1.0')) && 'text-degraded')}>
                  {c.protocol ?? '—'}
                  {c.weakCiphers && <p className="text-xs">Weak ciphers offered</p>}
                </td>
                <td className={cn('text-sm', c.chainValid === false && 'text-degraded')}>{c.chainValid === null ? '—' : c.chainValid ? 'Trusted' : 'Not publicly trusted'}</td>
                <td className="whitespace-nowrap text-sm text-muted" title={formatDateTime(c.checkedAt)}>
                  {timeAgo(c.checkedAt)}
                </td>
                <td>
                  <RecheckButton assetId={c.assetId} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DnsRecords() {
  const scope = useScope();
  const dns = useQuery({ queryKey: ['dns', scope], queryFn: () => api.listDnsSnapshots(scope) });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '—';

  if (dns.isLoading) return <Spinner />;
  if (dns.error) return <ErrorState error={dns.error} onRetry={() => dns.refetch()} />;
  if (!dns.data?.length) return <EmptyState title="No DNS records yet" body="Add and verify a domain to start tracking its records." />;

  return (
    <div className="space-y-6">
      {dns.data.map((d) => (
        <section key={d.host} className="rounded-lg border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <h2 className="font-mono text-sm font-semibold">{d.host}</h2>
              <p className="text-xs text-muted">
                {appName(d.applicationId)}, checked {timeAgo(d.checkedAt)}
              </p>
            </div>
            <RecheckButton assetId={d.assetId} />
          </div>
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px] lg:divide-x lg:divide-line">
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="w-20">Type</th>
                    <th>Value</th>
                    <th className="w-20 text-right">TTL</th>
                  </tr>
                </thead>
                <tbody>
                  {d.records.map((r) => (
                    <tr key={r.type + r.value}>
                      <td className="font-mono text-xs">{r.type}</td>
                      <td className="break-all font-mono text-xs">{r.value}</td>
                      <td className="text-right text-xs tabular-nums text-muted">{r.ttl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3">
              <h3 className="mb-2 text-sm font-medium">Changes</h3>
              {d.changes.length === 0 ? (
                <p className="text-sm text-muted">No changes recorded.</p>
              ) : (
                <ol className="space-y-3">
                  {d.changes.map((c) => (
                    <li key={c.at + c.type} className="text-sm">
                      <p className="text-xs text-muted">
                        {formatDateTime(c.at)}, <span className="font-mono">{c.type}</span>
                      </p>
                      {c.before.map((v) => (
                        <p key={`-${v}`} className="break-all font-mono text-xs text-down">
                          − {v}
                        </p>
                      ))}
                      {c.after.map((v) => (
                        <p key={`+${v}`} className="break-all font-mono text-xs text-up">
                          + {v}
                        </p>
                      ))}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}