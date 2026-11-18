import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Plus, Search } from 'lucide-react';
import { api } from '@/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { CriticalityMeter, HealthBadge } from '@/components/ui/Badge';
import { HealthRibbon } from '@/components/ui/HealthRibbon';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { ApplicationFormModal } from './ApplicationFormModal';

export function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const creating = params.get('new') === '1';

  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const assets = useQuery({ queryKey: ['assets', {}], queryFn: () => api.listAssets() });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (apps.data ?? [])
      .filter((a) => a.status === status)
      .filter((a) => !q || `${a.name} ${a.description} ${a.techStack.join(' ')} ${a.tags.join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [apps.data, search, status]);

  const health = new Map((dash.data?.healthByApp ?? []).map((h) => [h.applicationId, h]));
  const userName = new Map((users.data ?? []).map((u) => [u.id, u.name]));
  const assetCount = (id: string) => (assets.data ?? []).filter((a) => a.applicationId === id).length;

  const openCreate = () => setParams({ new: '1' });

  return (
    <>
      <PageHeader
        title="Applications"
        description="Everything ShieldOps monitors belongs to an application and one of its environments."
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            New application
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, stack or tag" aria-label="Search applications" className="pl-8" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'archived')} aria-label="Status" className="w-36">
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      {apps.isLoading ? (
        <Spinner />
      ) : apps.error ? (
        <ErrorState error={apps.error} onRetry={() => apps.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-6 w-6" />}
          title={search ? 'No applications match your search' : status === 'archived' ? 'No archived applications' : 'No applications yet'}
          body={!search && status === 'active' ? 'Create one for each product you run, then add its domains, servers and repositories.' : undefined}
          action={!search && status === 'active' ? <Button variant="primary" onClick={openCreate}>New application</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-base">
            <thead>
              <tr>
                <th>Application</th>
                <th>Criticality</th>
                <th>Environments</th>
                <th className="min-w-[180px]">Production health</th>
                <th>Owner</th>
                <th className="text-right">Assets</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const h = health.get(a.id);
                return (
                  <tr key={a.id} className="cursor-pointer" onClick={() => navigate(`/applications/${a.id}`)}>
                    <td className="max-w-xs">
                      <Link to={`/applications/${a.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {a.name}
                      </Link>
                      <p className="truncate text-xs text-muted">{a.description || a.techStack.join(', ')}</p>
                    </td>
                    <td>
                      <CriticalityMeter value={a.criticality} />
                    </td>
                    <td className="text-xs text-muted">{a.environments.map((e) => e.name).join(', ')}</td>
                    <td>
                      {h ? (
                        <div className="flex items-center gap-3">
                          <HealthBadge state={h.state} className="w-24 shrink-0" />
                          <HealthRibbon ticks={h.ticks.slice(-30)} height={18} className="w-28" />
                        </div>
                      ) : (
                        <HealthBadge state="unknown" />
                      )}
                    </td>
                    <td className="text-sm">{userName.get(a.ownerId) ?? '—'}</td>
                    <td className="text-right tabular-nums">{assetCount(a.id)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ApplicationFormModal open={creating} onClose={() => setParams({})} onSaved={(a) => navigate(`/applications/${a.id}`)} />
    </>
  );
}