import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import type { Server } from '@/types';
import { cn } from '@/lib/cn';
import { formatDateTime, timeAgo } from '@/lib/format';
import { UsageBar } from '@/components/ui/UsageBar';

export function ServerState({ server }: { server: Server }) {
  const problems = server.services.filter((s) => s.status !== 'running' || s.restarts10m >= 3).length + server.containers.filter((c) => c.state !== 'running' || c.restarts10m >= 3).length;
  if (server.status === 'offline') return <span className="inline-flex items-center gap-1.5 text-sm font-medium text-down"><span className="h-2 w-2 animate-pulse rounded-full bg-down" aria-hidden />Not reporting</span>;
  if (server.status === 'new') return <span className="text-sm text-muted">Waiting for agent</span>;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', problems ? 'text-degraded' : 'text-ink')}>
      <span className={cn('h-2 w-2 rounded-full', problems ? 'bg-degraded' : 'bg-up')} aria-hidden />
      {problems ? `${problems} ${problems === 1 ? 'service' : 'services'} unhealthy` : 'Online'}
    </span>
  );
}

export function ServersTable({ servers, showApplication = true }: { servers: Server[]; showApplication?: boolean }) {
  const navigate = useNavigate();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appEnv = (s: Server) => {
    const a = apps.data?.find((x) => x.id === s.applicationId);
    return { app: a?.name ?? '—', env: a?.environments.find((e) => e.id === s.environmentId)?.name ?? '' };
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="table-base">
        <thead>
          <tr>
            <th>Server</th>
            <th>Status</th>
            {showApplication && <th>Application</th>}
            <th>CPU</th>
            <th>Memory</th>
            <th>Disk</th>
            <th>Last report</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((s) => {
            const n = appEnv(s);
            const stale = s.status === 'offline';
            return (
              <tr key={s.id} className={cn('cursor-pointer', stale && 'bg-down/[0.04]')} onClick={() => navigate(`/servers/${s.id}`)}>
                <td>
                  <Link to={`/servers/${s.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[13px] font-medium hover:underline">
                    {s.hostname}
                  </Link>
                  <p className="text-xs text-muted">
                    {s.os}, {s.cpuCores} cores, {s.memoryGb} GB
                  </p>
                </td>
                <td>
                  <ServerState server={s} />
                </td>
                {showApplication && (
                  <td className="text-sm">
                    {n.app}
                    <p className="text-xs text-muted">{n.env}</p>
                  </td>
                )}
                <td className={cn(stale && 'opacity-50')}>
                  <UsageBar value={s.usage?.cpu ?? null} warn={80} crit={90} label={`CPU on ${s.hostname}`} />
                </td>
                <td className={cn(stale && 'opacity-50')}>
                  <UsageBar value={s.usage?.memory ?? null} warn={80} crit={90} label={`Memory on ${s.hostname}`} />
                </td>
                <td className={cn(stale && 'opacity-50')}>
                  <UsageBar value={s.usage?.disk ?? null} label={`Disk on ${s.hostname}`} />
                </td>
                <td className={cn('whitespace-nowrap text-sm', stale ? 'font-medium text-down' : 'text-muted')} title={formatDateTime(s.lastSeenAt)}>
                  {timeAgo(s.lastSeenAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {servers.some((s) => s.status === 'offline') && <p className="border-t border-line px-4 py-2 text-xs text-muted">Faded figures are the last values reported before the server stopped reporting.</p>}
    </div>
  );
}