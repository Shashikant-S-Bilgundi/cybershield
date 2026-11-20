import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Cloud } from 'lucide-react';
import { api } from '@/api';
import type { CloudCheck } from '@/types';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { FindingsTable } from '@/pages/operations/FindingsTable';

const PROVIDER: Record<CloudCheck['provider'], string> = { aws: 'AWS', google: 'Google Workspace', entra: 'Microsoft Entra ID', cloudflare: 'Cloudflare' };

export function CloudIdentityPage() {
  const checks = useQuery({ queryKey: ['cloud-checks'], queryFn: api.listCloudChecks });
  const cloud = useQuery({ queryKey: ['findings', { source: 'cloud', status: 'active' }], queryFn: () => api.listFindings({ source: 'cloud', status: 'active' }) });
  const identity = useQuery({ queryKey: ['findings', { source: 'identity', status: 'active' }], queryFn: () => api.listFindings({ source: 'identity', status: 'active' }) });
  const providers = [...new Set((checks.data ?? []).map((c) => c.provider))];
  const failing = (checks.data ?? []).filter((c) => c.failed > 0).length;

  return (
    <>
      <PageHeader
        title="Cloud and identity"
        description={
          failing
            ? `${failing} of ${checks.data!.length} checks fail across your cloud and identity accounts.`
            : 'Read-only checks of your AWS account, Google Workspace or Microsoft Entra ID, and Cloudflare settings.'
        }
        actions={
          <Link to="/integrations">
            <Button>Connect accounts</Button>
          </Link>
        }
      />
      {checks.isLoading ? (
        <Spinner />
      ) : checks.error ? (
        <ErrorState error={checks.error} onRetry={() => checks.refetch()} />
      ) : !providers.length ? (
        <EmptyState icon={<Cloud className="h-6 w-6" />} title="No accounts connected" body="Connect AWS, Google Workspace, Microsoft Entra ID or Cloudflare in Integrations. Every connection is read-only." />
      ) : (
        <div className="mb-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {providers.map((p) => (
            <section key={p} className="rounded-lg border border-line bg-surface">
              <h2 className="border-b border-line px-4 py-3 font-semibold">{PROVIDER[p]}</h2>
              <ul className="divide-y divide-line">
                {checks.data!
                  .filter((c) => c.provider === p)
                  .map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                      <span>
                        <span className={cn('mr-2 inline-block h-2 w-2 rounded-full', c.failed ? 'bg-down' : 'bg-up')} aria-hidden />
                        {c.title}
                      </span>
                      <span className={cn('whitespace-nowrap tabular-nums', c.failed ? 'font-medium text-down' : 'text-muted')}>
                        {c.failed ? `${c.failed} of ${c.passed + c.failed} fail` : `${c.passed} pass`}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Cloud findings</h2>
        {cloud.isLoading ? <Spinner /> : cloud.data?.length ? <FindingsTable findings={cloud.data} /> : <p className="text-sm text-muted">None open.</p>}
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Identity findings</h2>
        {identity.isLoading ? <Spinner /> : identity.data?.length ? <FindingsTable findings={identity.data} /> : <p className="text-sm text-muted">None open.</p>}
      </section>
    </>
  );
}