import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import type { ErrorGroup, ErrorGroupStatus } from '@/types';
import { cn } from '@/lib/cn';
import { ERROR_STATUS_LABEL, formatCount, timeAgo } from '@/lib/format';
import { Sparkline } from '@/components/ui/Sparkline';

const TONE: Record<ErrorGroupStatus, string> = { unresolved: 'text-down', regressed: 'text-high', resolved: 'text-up', ignored: 'text-muted' };

export function ErrorStatusText({ status }: { status: ErrorGroupStatus }) {
  return <span className={cn('text-sm font-medium', TONE[status])}>{ERROR_STATUS_LABEL[status]}</span>;
}

export function ErrorGroupsTable({ groups, showApplication = true }: { groups: ErrorGroup[]; showApplication?: boolean }) {
  const navigate = useNavigate();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '—';

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="table-base">
        <thead>
          <tr>
            <th>Error</th>
            <th>Status</th>
            <th className="min-w-[120px]">Last 24 hours</th>
            <th className="text-right">Events</th>
            <th className="text-right">Users</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isNew = Date.parse(g.firstSeen) > Date.parse(g.lastSeen) - 60 * 60_000 && g.status === 'unresolved';
            return (
              <tr key={g.id} className="cursor-pointer" onClick={() => navigate(`/errors/${g.id}`)}>
                <td className="max-w-lg">
                  <Link to={`/errors/${g.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                    <span className="font-mono text-[13px]">{g.type}</span>
                    {isNew && <span className="ml-2 rounded bg-low/10 px-1.5 py-0.5 text-2xs font-semibold text-low">New</span>}
                  </Link>
                  <p className="truncate text-sm">{g.message}</p>
                  <p className="truncate text-xs text-muted">
                    {showApplication && <>{appName(g.applicationId)}, </>}
                    {g.culprit}
                  </p>
                </td>
                <td>
                  <ErrorStatusText status={g.status} />
                </td>
                <td>
                  <Sparkline values={g.trend} tone={g.status === 'unresolved' || g.status === 'regressed' ? 'bg-down/70' : 'bg-unknown'} label={`${g.trend.reduce((a, b) => a + b, 0)} events in the last 24 hours`} />
                </td>
                <td className="text-right text-sm tabular-nums">{formatCount(g.count)}</td>
                <td className="text-right text-sm tabular-nums">{formatCount(g.usersAffected)}</td>
                <td className="whitespace-nowrap text-sm text-muted">{timeAgo(g.lastSeen)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}