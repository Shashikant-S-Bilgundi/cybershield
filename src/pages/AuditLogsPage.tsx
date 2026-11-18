import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Search } from 'lucide-react';
import { api } from '@/api';
import { formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { isReauthCancelled, useCritical } from '@/components/security/reauth';

const PAGE_SIZE = 25;
const RESOURCE_TYPES = ['session', 'user', 'application', 'asset', 'settings', 'audit'];

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AuditLogsPage() {
  const critical = useCritical();
  const [paging, setPaging] = useState({ filterKey: '', page: 1 });
  const [search, setSearch] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search);

  const filters = {
    search: q || undefined,
    resourceType: resourceType || undefined,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
  };

  // Any filter change sends you back to page 1.
  const filterKey = JSON.stringify(filters);
  const page = paging.filterKey === filterKey ? paging.page : 1;
  const setPage = (p: number) => setPaging({ filterKey, page: p });

  const logs = useQuery({
    queryKey: ['audit-logs', { page, ...filters }],
    queryFn: () => api.listAuditLogs({ page, pageSize: PAGE_SIZE, ...filters }),
    placeholderData: keepPreviousData,
  });

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await critical(() => api.exportAuditLogs(filters));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shieldops-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Audit log exported');
    } catch (e) {
      if (!isReauthCancelled(e)) toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const total = logs.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Every sign-in and change in ShieldOps. Records can't be edited or deleted by anyone."
        actions={
          <Button onClick={exportCsv} loading={exporting}>
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search person, action or IP" aria-label="Search audit logs" className="pl-8" />
        </div>
        <Select value={resourceType} onChange={(e) => setResourceType(e.target.value)} aria-label="Resource" className="w-40">
          <option value="">All resources</option>
          {RESOURCE_TYPES.map((r) => (
            <option key={r} value={r}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </option>
          ))}
        </Select>
        <label className="text-xs text-muted">
          From
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-40" />
        </label>
        <label className="text-xs text-muted">
          To
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-40" />
        </label>
      </div>

      {logs.isLoading ? (
        <Spinner />
      ) : logs.error ? (
        <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
      ) : total === 0 ? (
        <EmptyState title="No records match these filters" body="Try a wider date range or clear the search." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Who</th>
                  <th>What happened</th>
                  <th>Action</th>
                  <th>IP address</th>
                </tr>
              </thead>
              <tbody>
                {logs.data!.items.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-sm tabular-nums">{formatDateTime(l.at)}</td>
                    <td className="whitespace-nowrap text-sm">{l.actorName}</td>
                    <td className="text-sm">{l.summary}</td>
                    <td className="whitespace-nowrap font-mono text-xs text-muted">{l.action}</td>
                    <td className="whitespace-nowrap font-mono text-xs text-muted">{l.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-muted">
            <span className="tabular-nums">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}