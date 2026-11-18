import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layers, Plus, Search } from 'lucide-react';
import { api } from '@/api';
import type { Asset, AssetType } from '@/types';
import { usePreferences } from '@/store/preferences';
import { ASSET_TYPE_LABEL } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { AddAssetModal } from './AddAssetModal';
import { AssetsTable } from './AssetsTable';
import { VerificationModal } from './VerificationModal';

const TYPE_FILTERS: (AssetType | 'all')[] = ['all', 'domain', 'website', 'api', 'server', 'database', 'repository', 'image', 'cloud'];

export function AssetsPage() {
  const { applicationId, environmentId } = usePreferences();
  const [type, setType] = useState<AssetType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [verifyNew, setVerifyNew] = useState<Asset | null>(null);

  const assets = useQuery({
    queryKey: ['assets', { applicationId, environmentId }],
    queryFn: () => api.listAssets({ applicationId: applicationId ?? undefined, environmentId: environmentId ?? undefined }),
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: assets.data?.length ?? 0 };
    (assets.data ?? []).forEach((a) => (c[a.type] = (c[a.type] ?? 0) + 1));
    return c;
  }, [assets.data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (assets.data ?? []).filter((a) => (type === 'all' || a.type === type) && (!q || `${a.label} ${a.identifier}`.toLowerCase().includes(q)));
  }, [assets.data, type, search]);

  const pending = (assets.data ?? []).filter((a) => a.authorization.status === 'pending' || a.authorization.status === 'failed').length;

  return (
    <>
      <PageHeader
        title="Assets"
        description={pending ? `${pending} assets are waiting for verification and won't be checked until they are.` : 'Every domain, server, database and repository ShieldOps watches.'}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add asset
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by type">
          {TYPE_FILTERS.filter((t) => t === 'all' || counts[t]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={cn('rounded border px-2.5 py-1 text-xs font-medium', type === t ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted hover:text-ink')}
            >
              {t === 'all' ? 'All' : ASSET_TYPE_LABEL[t]} <span className="tabular-nums text-muted">{counts[t] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or address" aria-label="Search assets" className="pl-8" />
        </div>
      </div>

      {assets.isLoading ? (
        <Spinner />
      ) : assets.error ? (
        <ErrorState error={assets.error} onRetry={() => assets.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title={assets.data?.length ? 'Nothing matches these filters' : 'No assets yet'}
          body={assets.data?.length ? undefined : 'Add the domains, servers and repositories behind your applications.'}
          action={!assets.data?.length ? <Button variant="primary" onClick={() => setAdding(true)}>Add asset</Button> : undefined}
        />
      ) : (
        <AssetsTable assets={rows} />
      )}

      <AddAssetModal
        open={adding}
        onClose={() => setAdding(false)}
        defaultApplicationId={applicationId}
        defaultEnvironmentId={environmentId}
        onCreated={(a) => a.authorization.status === 'pending' && setVerifyNew(a)}
      />
      <VerificationModal asset={verifyNew} onClose={() => setVerifyNew(null)} />
    </>
  );
}