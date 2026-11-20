import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { DbCheck } from '@/types';
import { cn } from '@/lib/cn';
import { DB_ENGINE_LABEL, formatMs, timeAgo } from '@/lib/format';
import { HealthBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { UsageBar } from '@/components/ui/UsageBar';
import { toast } from '@/components/ui/toastStore';
import { ConfirmDialog } from '@/components/security/ConfirmDialog';
import { useCritical } from '@/components/security/reauth';

function LatencyStrip({ values }: { values: (number | null)[] }) {
  const max = Math.max(...values.map((v) => v ?? 0), 1);
  return (
    <div className="flex h-6 w-32 items-end gap-px" role="img" aria-label={`Last ${values.length} checks`}>
      {values.map((v, i) => (
        <span key={i} className={cn('flex-1 rounded-[1px]', v === null ? 'h-full bg-down' : v >= 1000 ? 'bg-degraded' : 'bg-up/80')} style={v === null ? undefined : { height: `${Math.max(15, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function DbChecksList({ checks, showApplication = true }: { checks: DbCheck[]; showApplication?: boolean }) {
  const qc = useQueryClient();
  const critical = useCritical();
  const [deleting, setDeleting] = useState<DbCheck | null>(null);
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appName = (d: DbCheck) => {
    const a = apps.data?.find((x) => x.id === d.applicationId);
    return `${a?.name ?? '—'}, ${a?.environments.find((e) => e.id === d.environmentId)?.name ?? ''}`;
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ['db-checks'] });

  const run = useMutation({
    mutationFn: (d: DbCheck) => api.runDbCheck(d.id),
    onSuccess: (d) => {
      refresh();
      toast.success(d.status === 'down' ? `${d.name}: ${d.error}` : `${d.name} answered in ${formatMs(d.lastLatencyMs)}`);
    },
  });
  const pause = useMutation({
    mutationFn: (d: DbCheck) => api.setDbCheckPaused(d.id, !d.paused),
    onSuccess: (d) => {
      refresh();
      toast.success(d.paused ? `${d.name} paused` : `${d.name} resumed`);
    },
  });

  return (
    <>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {checks.map((d) => (
          <li key={d.id} className={cn('px-4 py-3', d.status === 'down' && 'bg-down/[0.04]')}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="min-w-[220px] flex-1">
                <p className="font-medium">
                  {d.name} <span className="text-xs font-normal text-muted">{DB_ENGINE_LABEL[d.engine]}</span>
                </p>
                <p className="font-mono text-xs text-muted">
                  {d.username}@{d.host}:{d.port}
                  {d.database && d.engine !== 'redis' ? `/${d.database}` : ''}
                </p>
                {showApplication && <p className="text-xs text-muted">{appName(d)}</p>}
              </div>
              <div className="w-28">
                <HealthBadge state={d.status} />
                <p className="text-xs text-muted">{d.paused ? 'Not checking' : timeAgo(d.lastCheckAt)}</p>
              </div>
              <div className="w-20 text-right">
                <p className={cn('text-sm tabular-nums', (d.lastLatencyMs ?? 0) >= 1000 && 'font-medium text-degraded')}>{formatMs(d.lastLatencyMs)}</p>
                <p className="text-xs text-muted">connect + ping</p>
              </div>
              {!d.paused && <LatencyStrip values={d.latency} />}
              <div className="flex items-center gap-1">
                <Button size="sm" onClick={() => run.mutate(d)} loading={run.isPending && run.variables?.id === d.id} disabled={d.paused}>
                  Check now
                </Button>
                <Menu
                  actions={[
                    { label: d.paused ? 'Resume checks' : 'Pause checks', onSelect: () => pause.mutate(d) },
                    { label: 'Delete check', danger: true, onSelect: () => setDeleting(d) },
                  ]}
                />
              </div>
            </div>
            {d.error && <p className="mt-2 text-sm text-degraded">{d.error}</p>}
            {d.stats && (
              <dl className="mt-3 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-2 rounded border border-line bg-sunken/50 px-3 py-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">Connections</dt>
                  <dd>
                    <UsageBar value={(d.stats.connections / d.stats.maxConnections) * 100} warn={80} crit={95} label="Connections in use" />
                    <span className="text-xs text-muted">
                      {d.stats.connections} of {d.stats.maxConnections}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Size</dt>
                  <dd className="tabular-nums">{d.stats.sizeGb} GB</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Role</dt>
                  <dd className="capitalize">{d.stats.role}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Replication lag</dt>
                  <dd className="tabular-nums">{d.stats.replicationLagSec === null ? '—' : `${d.stats.replicationLagSec} s`}</dd>
                </div>
              </dl>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        body="Checks stop and the stored username and password are deleted. The database itself is not touched."
        actionLabel="Delete check"
        confirmText="delete"
        onConfirm={() =>
          critical(() => api.deleteDbCheck(deleting!.id)).then(() => {
            refresh();
            toast.success('Database check deleted');
          })
        }
      />
    </>
  );
}