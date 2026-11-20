import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bug, Search } from 'lucide-react';
import { api, type ErrorGroupFilter } from '@/api';
import type { ErrorGroupStatus } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { ErrorGroupsTable } from './ErrorGroupsTable';

const VIEWS: { key: ErrorGroupStatus | 'open'; label: string }[] = [
  { key: 'open', label: 'Needs fixing' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'ignored', label: 'Ignored' },
];

export function ErrorsPage() {
  const scope = useScope();
  const [view, setView] = useState<ErrorGroupStatus | 'open'>('open');
  const [platform, setPlatform] = useState<'' | 'node' | 'browser'>('');
  const [search, setSearch] = useState('');
  const filter: ErrorGroupFilter = { ...scope, status: view, platform: platform || undefined, search: search || undefined };
  const groups = useQuery({ queryKey: ['error-groups', filter], queryFn: () => api.listErrorGroups(filter), refetchInterval: 30_000 });
  const regressed = (groups.data ?? []).filter((g) => g.status === 'regressed').length;

  return (
    <>
      <PageHeader
        title="Errors and exceptions"
        description={
          regressed
            ? `${regressed} ${regressed === 1 ? 'error has' : 'errors have'} come back after being marked resolved.`
            : 'Exceptions sent by the ShieldOps SDK, grouped so the same bug shows once however often it happens.'
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded border border-line p-0.5" role="tablist">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)} className={cn('rounded-[4px] px-2.5 py-1 text-xs font-medium', view === v.key ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')}>
              {v.label}
            </button>
          ))}
        </div>
        <Select value={platform} onChange={(e) => setPlatform(e.target.value as '' | 'node' | 'browser')} aria-label="Platform" className="w-40">
          <option value="">Server and browser</option>
          <option value="node">Server (Node.js)</option>
          <option value="browser">Browser</option>
        </Select>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search type, message or file" aria-label="Search errors" className="pl-8" />
        </div>
      </div>
      {groups.isLoading ? (
        <Spinner />
      ) : groups.error ? (
        <ErrorState error={groups.error} onRetry={() => groups.refetch()} />
      ) : !groups.data?.length ? (
        <EmptyState
          icon={<Bug className="h-6 w-6" />}
          title={search ? 'No errors match your search' : view === 'open' ? 'No errors need fixing' : 'Nothing here'}
          body={view === 'open' && !search ? 'Errors appear here once an app sends them through the ShieldOps SDK.' : undefined}
          action={
            view === 'open' && !search ? (
              <Link to="/ingestion">
                <Button>Set up the SDK</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ErrorGroupsTable groups={groups.data} />
      )}
    </>
  );
}