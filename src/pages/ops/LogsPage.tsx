import { Fragment, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { api } from '@/api';
import type { LogLevel, LogQuery } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';

const LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug'];
const LEVEL_TONE: Record<LogLevel, string> = { error: 'bg-down/15 text-down', warn: 'bg-degraded/15 text-degraded', info: 'bg-low/10 text-low', debug: 'bg-sunken text-muted' };
const RANGES: { key: LogQuery['range']; label: string }[] = [
  { key: '15m', label: '15 min' },
  { key: '1h', label: '1 hour' },
  { key: '24h', label: '24 hours' },
  { key: '7d', label: '7 days' },
];
const PAGE = 100;

export function LogsPage() {
  const scope = useScope();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [levels, setLevels] = useState<LogLevel[]>(['error', 'warn', 'info']);
  const [range, setRange] = useState<LogQuery['range']>('1h');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const query: LogQuery = { ...scope, search: search || undefined, levels, range, page, pageSize: PAGE };
  const logs = useQuery({ queryKey: ['logs', query], queryFn: () => api.searchLogs(query), placeholderData: keepPreviousData, refetchInterval: range === '15m' ? 15_000 : false });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '—';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSearch(draft.trim());
    setPage(1);
  };
  const toggle = (l: LogLevel) => {
    setLevels((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]));
    setPage(1);
  };
  const max = Math.max(1, ...(logs.data?.histogram ?? []).map((h) => h.count));

  return (
    <>
      <PageHeader title="Logs" description="Structured logs from the SDK and the server agent, kept for 14 days. Passwords, tokens, cookies and authorization headers are removed before they are stored." />
      <form onSubmit={submit} className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search messages and fields, like ENOSPC or ip=203.0.113.77" aria-label="Search logs" className="pl-8 font-mono text-xs" />
        </div>
        <Button type="submit" variant="primary">
          Search
        </Button>
        <div className="flex gap-1 rounded border border-line p-0.5" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" role="tab" aria-selected={range === r.key} onClick={() => (setRange(r.key), setPage(1))} className={cn('rounded-[4px] px-2.5 py-1 text-xs font-medium', range === r.key ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')}>
              {r.label}
            </button>
          ))}
        </div>
      </form>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {LEVELS.map((l) => (
          <label key={l} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs font-medium capitalize', levels.includes(l) ? LEVEL_TONE[l] : 'text-muted')}>
            <input type="checkbox" checked={levels.includes(l)} onChange={() => toggle(l)} className="accent-[rgb(var(--accent))]" />
            {l}
          </label>
        ))}
        <span className="ml-auto text-sm text-muted tabular-nums">{logs.data ? `${logs.data.total.toLocaleString('en-IN')} lines` : ''}</span>
      </div>
      {logs.data && (
        <div className="mb-4 flex h-14 items-end gap-px rounded border border-line bg-surface px-2 pt-2" role="img" aria-label="Log lines over time; red is errors">
          {logs.data.histogram.map((h) => (
            <div key={h.at} className="flex flex-1 flex-col justify-end" title={`${formatDateTime(h.at)}: ${h.count} lines, ${h.errors} errors`} style={{ height: '100%' }}>
              <div className="w-full rounded-t-[1px] bg-down/70" style={{ height: `${(h.errors / max) * 100}%` }} />
              <div className="w-full bg-accent/40" style={{ height: `${((h.count - h.errors) / max) * 100}%` }} />
            </div>
          ))}
        </div>
      )}
      {logs.isLoading ? (
        <Spinner />
      ) : logs.error ? (
        <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
      ) : !logs.data?.items.length ? (
        <EmptyState title="No log lines match" body="Widen the time range or turn on more levels." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface font-mono text-xs">
            <table className="table-base">
              <tbody>
                {logs.data.items.map((l) => (
                  <Fragment key={l.id}>
                    <tr className="cursor-pointer" onClick={() => setOpen(open === l.id ? null : l.id)}>
                      <td className="w-6 text-muted">{open === l.id ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}</td>
                      <td className="whitespace-nowrap text-muted tabular-nums">{formatDateTime(l.at)}</td>
                      <td>
                        <span className={cn('rounded px-1.5 py-0.5 text-2xs font-semibold uppercase', LEVEL_TONE[l.level])}>{l.level}</span>
                      </td>
                      <td className="whitespace-nowrap font-sans text-muted">{appName(l.applicationId)}</td>
                      <td className="w-full">{l.message}</td>
                    </tr>
                    {open === l.id && (
                      <tr className="hover:bg-transparent">
                        <td />
                        <td colSpan={4} className="pb-3">
                          <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-3 gap-y-1">
                            {[['host', l.host], ['source', l.source === 'sdk' ? 'SDK' : 'Server agent'], ...Object.entries(l.fields)].map(([k, v]) => (
                              <Fragment key={k}>
                                <dt className="text-muted">{k}</dt>
                                <dd className={cn(v.startsWith('[') && 'text-muted')}>
                                  <button type="button" onClick={() => (setDraft(`${k}=${v}`), setSearch(v), setPage(1))} className="hover:underline" title="Search for this value">
                                    {v}
                                  </button>
                                </dd>
                              </Fragment>
                            ))}
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Newer
            </Button>
            <Button size="sm" disabled={page * PAGE >= logs.data.total} onClick={() => setPage(page + 1)}>
              Older
            </Button>
          </div>
        </>
      )}
    </>
  );
}