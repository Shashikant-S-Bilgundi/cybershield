import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import type { HealthState, Monitor } from '@/types';
import { MONITOR_TYPE_LABEL, formatInterval, formatMs, formatPercent, timeAgo } from '@/lib/format';
import { HealthBadge } from '@/components/ui/Badge';

const ORDER: HealthState[] = ['down', 'degraded', 'unknown', 'up', 'paused'];

export function MonitorsTable({ monitors, showApplication = true }: { monitors: Monitor[]; showApplication?: boolean }) {
  const navigate = useNavigate();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appById = new Map((apps.data ?? []).map((a) => [a.id, a]));
  const rows = [...monitors].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.name.localeCompare(b.name));

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="table-base">
        <thead>
          <tr>
            <th>Monitor</th>
            <th>Status</th>
            {showApplication && <th>Application</th>}
            <th>Every</th>
            <th className="text-right">Last response</th>
            <th className="text-right">Uptime 24h</th>
            <th className="text-right">30d</th>
            <th>Last check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const app = appById.get(m.applicationId);
            const env = app?.environments.find((e) => e.id === m.environmentId);
            return (
              <tr key={m.id} className="cursor-pointer" onClick={() => navigate(`/monitors/${m.id}`)}>
                <td className="max-w-xs">
                  <Link to={`/monitors/${m.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                    {m.name}
                  </Link>
                  <p className="truncate font-mono text-xs text-muted">
                    {MONITOR_TYPE_LABEL[m.type]} {m.target}
                  </p>
                </td>
                <td>
                  <HealthBadge state={m.status} />
                </td>
                {showApplication && (
                  <td className="text-sm">
                    {app?.name ?? '—'}
                    <p className="text-xs text-muted">{env?.name}</p>
                  </td>
                )}
                <td className="text-sm tabular-nums">{formatInterval(m.intervalSec)}</td>
                <td className="text-right text-sm tabular-nums">{formatMs(m.lastLatencyMs)}</td>
                <td className="text-right text-sm tabular-nums">{formatPercent(m.uptime.d1)}</td>
                <td className="text-right text-sm tabular-nums text-muted">{formatPercent(m.uptime.d30)}</td>
                <td className="whitespace-nowrap text-sm text-muted">{timeAgo(m.lastCheckAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}