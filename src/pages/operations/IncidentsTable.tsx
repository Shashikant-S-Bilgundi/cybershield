import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import type { Incident } from '@/types';
import { durationBetween, timeAgo } from '@/lib/format';
import { SeverityBadge } from '@/components/ui/Badge';
import { IncidentStatusText } from '@/components/ui/StatusLabels';

export function IncidentsTable({ incidents, showApps = true }: { incidents: Incident[]; showApps?: boolean }) {
  const navigate = useNavigate();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const appNames = (ids: string[]) => ids.map((id) => apps.data?.find((a) => a.id === id)?.name ?? '—').join(', ');
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="table-base">
        <thead>
          <tr>
            <th>Incident</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Opened</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((i) => (
            <tr key={i.id} className="cursor-pointer" onClick={() => navigate(`/incidents/${i.id}`)}>
              <td className="max-w-md">
                <Link to={`/incidents/${i.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                  <span className="mr-2 font-mono text-xs text-muted">{i.ref}</span>
                  {i.title}
                </Link>
                {showApps && <p className="truncate text-xs text-muted">{appNames(i.applicationIds)}</p>}
              </td>
              <td>
                <SeverityBadge severity={i.severity} />
              </td>
              <td>
                <IncidentStatusText status={i.status} />
              </td>
              <td className="text-sm">{users.data?.find((u) => u.id === i.ownerId)?.name ?? <span className="text-muted">Nobody</span>}</td>
              <td className="whitespace-nowrap text-sm text-muted">{timeAgo(i.openedAt)}</td>
              <td className="whitespace-nowrap text-sm tabular-nums">{durationBetween(i.openedAt, i.resolvedAt ?? undefined)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}