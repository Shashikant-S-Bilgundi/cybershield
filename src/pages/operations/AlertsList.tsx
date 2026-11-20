import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/api';
import type { Alert } from '@/types';
import { cn } from '@/lib/cn';
import { CHANNEL_LABEL, SOURCE_LABEL, minutesUntil, durationBetween, formatDateTime, timeAgo } from '@/lib/format';
import { SeverityBadge } from '@/components/ui/Badge';
import { AlertStatusText } from '@/components/ui/StatusLabels';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { toast } from '@/components/ui/toastStore';
import { CreateIncidentDialog, type IncidentPreset } from './CreateIncidentDialog';

export function AlertsList({ alerts, showApplication = true }: { alerts: Alert[]; showApplication?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [incidentFor, setIncidentFor] = useState<IncidentPreset | null>(null);
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const rules = useQuery({ queryKey: ['alert-rules'], queryFn: api.listAlertRules });
  const escalations = useQuery({ queryKey: ['alert-escalations'], queryFn: api.listAlertEscalations, refetchInterval: 60_000 });
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '—';
  const userName = (id: string | null) => users.data?.find((u) => u.id === id)?.name ?? 'someone';

  const act = useMutation({
    mutationFn: ({ a, action, minutes }: { a: Alert; action: 'ack' | 'snooze' | 'resolve'; minutes?: number }) =>
      action === 'ack' ? api.acknowledgeAlert(a.id) : action === 'snooze' ? api.snoozeAlert(a.id, minutes ?? 60) : api.resolveAlert(a.id),
    onSuccess: (a, v) => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(v.action === 'ack' ? 'Alert acknowledged' : v.action === 'snooze' ? `Snoozed until ${formatDateTime(a.snoozedUntil)}` : 'Alert resolved');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {alerts.map((a) => {
        const expanded = open === a.id;
        const rule = rules.data?.find((r) => r.id === a.ruleId);
        return (
          <Fragment key={a.id}>
            <li className={cn('px-4 py-3', a.status === 'open' && a.severity === 'critical' && 'bg-down/[0.04]')}>
              <div className="flex flex-wrap items-start gap-3">
                <button type="button" onClick={() => setOpen(expanded ? null : a.id)} className="mt-0.5 text-muted hover:text-ink" aria-expanded={expanded} aria-label={expanded ? 'Hide details' : 'Show details'}>
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className="w-20 shrink-0">
                  <SeverityBadge severity={a.severity} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.title}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {showApplication && <>{appName(a.applicationId)}, </>}
                    {SOURCE_LABEL[a.source]}, {a.occurrences > 1 ? `${a.occurrences} times since ${timeAgo(a.firstAt)}` : timeAgo(a.firstAt)}
                  </p>
                  {(() => {
                    const e = a.status === 'open' ? escalations.data?.find((x) => x.alertId === a.id) : undefined;
                    if (!e || e.totalSteps < 2) return null;
                    return (
                      <p className="mt-0.5 text-xs text-degraded">
                        Escalation step {e.step} of {e.totalSteps} ({e.policyName}){e.nextAt ? `, next step in ${minutesUntil(e.nextAt)} min` : ', everyone in the policy has been notified'}
                      </p>
                    );
                  })()}
                </div>
                <div className="w-36 shrink-0 text-right">
                  <AlertStatusText status={a.status} />
                  <p className="text-xs text-muted">
                    {a.status === 'acknowledged' && `by ${userName(a.acknowledgedBy)}`}
                    {a.status === 'snoozed' && a.snoozedUntil && `until ${formatDateTime(a.snoozedUntil)}`}
                    {a.status === 'resolved' && (a.autoResolved ? 'by itself' : `after ${durationBetween(a.firstAt, a.resolvedAt ?? undefined)}`)}
                  </p>
                </div>
                {a.status !== 'resolved' ? (
                  <div className="flex shrink-0 items-center gap-1">
                    {a.status !== 'acknowledged' && (
                      <Button size="sm" onClick={() => act.mutate({ a, action: 'ack' })}>
                        Acknowledge
                      </Button>
                    )}
                    <Menu
                      actions={[
                        { label: 'Snooze 1 hour', onSelect: () => act.mutate({ a, action: 'snooze', minutes: 60 }) },
                        { label: 'Snooze 1 day', onSelect: () => act.mutate({ a, action: 'snooze', minutes: 1440 }) },
                        { label: 'Resolve', onSelect: () => act.mutate({ a, action: 'resolve' }) },
                        {
                          label: 'Start incident',
                          onSelect: () => setIncidentFor({ title: a.title, summary: a.message, severity: a.severity, applicationIds: [a.applicationId], links: [{ type: 'alert', id: a.id, title: a.title }] }),
                        },
                      ]}
                    />
                  </div>
                ) : (
                  <div className="w-[34px] shrink-0" />
                )}
              </div>
              {expanded && (
                <div className="mt-3 grid gap-4 pl-7 text-sm lg:grid-cols-2">
                  <div className="space-y-2">
                    <p>{a.message}</p>
                    <p className="text-xs text-muted">
                      First seen {formatDateTime(a.firstAt)}, last seen {formatDateTime(a.lastAt)}.
                      {rule && (
                        <>
                          {' '}
                          Raised by the rule{' '}
                          <Link to="/alert-rules" className="text-accent hover:underline">
                            {rule.name}
                          </Link>
                          .
                        </>
                      )}
                    </p>
                    <Link to={`/applications/${a.applicationId}/issues`} className="text-xs text-accent hover:underline">
                      All issues for {appName(a.applicationId)}
                    </Link>
                  </div>
                  <div>
                    <p className="mb-1 font-medium">Notifications</p>
                    {a.deliveries.length === 0 ? (
                      <p className="text-muted">None sent.</p>
                    ) : (
                      <ul className="space-y-1">
                        {a.deliveries.map((d) => (
                          <li key={d.channel + d.recipient} className="flex flex-wrap justify-between gap-2">
                            <span>
                              {CHANNEL_LABEL[d.channel]} to {d.recipient}
                            </span>
                            <span className={cn('tabular-nums', d.status === 'failed' ? 'text-down' : d.status === 'pending' ? 'text-degraded' : 'text-muted')}>
                              {d.status === 'failed' ? `Failed after ${d.attempts} attempts` : d.status === 'pending' ? 'Sending' : `Sent ${timeAgo(d.at)}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </li>
          </Fragment>
        );
      })}
      {incidentFor && <CreateIncidentDialog preset={incidentFor} onClose={() => setIncidentFor(null)} />}
    </ul>
  );
}