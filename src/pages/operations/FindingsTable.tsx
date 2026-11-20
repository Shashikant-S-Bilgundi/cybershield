import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import type { Finding } from '@/types';
import { cn } from '@/lib/cn';
import { SOURCE_LABEL, daysUntil, formatDate } from '@/lib/format';
import { SeverityBadge } from '@/components/ui/Badge';
import { FindingStatusText, PriorityBadge } from '@/components/ui/StatusLabels';

const CLOSED: Finding['status'][] = ['resolved', 'verified', 'accepted_risk', 'false_positive'];

export function FindingsTable({ findings, showApplication = true }: { findings: Finding[]; showApplication?: boolean }) {
  const navigate = useNavigate();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '—';
  const userName = (id: string | null) => (id ? (users.data?.find((u) => u.id === id)?.name ?? '—') : null);

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="table-base">
        <thead>
          <tr>
            <th title="Risk priority: what to fix first">Priority</th>
            <th>Finding</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Assigned to</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => {
            const days = f.dueAt ? daysUntil(f.dueAt) : null;
            const overdue = days !== null && days < 0 && !CLOSED.includes(f.status);
            return (
              <tr key={f.id} className="cursor-pointer" onClick={() => navigate(`/findings/${f.id}`)}>
                <td>
                  <PriorityBadge priority={f.priority} score={f.riskScore} />
                </td>
                <td className="max-w-md">
                  <Link to={`/findings/${f.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                    {f.title}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {showApplication && <>{appName(f.applicationId)}, </>}
                    {SOURCE_LABEL[f.source]}, {f.evidence[0]?.value}
                  </p>
                </td>
                <td>
                  <SeverityBadge severity={f.severity} />
                </td>
                <td>
                  <FindingStatusText status={f.status} />
                </td>
                <td className="text-sm">{userName(f.assigneeId) ?? <span className="text-muted">Nobody</span>}</td>
                <td className={cn('whitespace-nowrap text-sm tabular-nums', overdue ? 'font-medium text-down' : 'text-muted')}>
                  {CLOSED.includes(f.status) ? '—' : overdue ? `${-days!} ${days === -1 ? 'day' : 'days'} overdue` : formatDate(f.dueAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}