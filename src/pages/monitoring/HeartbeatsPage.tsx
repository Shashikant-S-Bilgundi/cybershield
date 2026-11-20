import { Fragment, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Copy, HeartPulse, Plus } from 'lucide-react';
import { api, type HeartbeatInput } from '@/api';
import type { Heartbeat, HeartbeatStatus } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { formatDateTime, formatInterval, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Menu } from '@/components/ui/Menu';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { ConfirmDialog } from '@/components/security/ConfirmDialog';
import { useCritical } from '@/components/security/reauth';

const STATUS: Record<HeartbeatStatus, { label: string; tone: string }> = {
  new: { label: 'Waiting for first ping', tone: 'text-muted' },
  up: { label: 'On time', tone: 'text-up' },
  late: { label: 'Late', tone: 'text-degraded' },
  down: { label: 'Missed', tone: 'text-down' },
  paused: { label: 'Paused', tone: 'text-muted' },
};

const scheduleText = (s: Heartbeat['schedule']) => (s.kind === 'interval' ? `Every ${formatInterval(s.seconds)}` : `Cron ${s.expression}`);

function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded border border-line bg-sunken px-3 py-2">
      <code className="flex-1 break-all font-mono text-xs">{value}</code>
      <button type="button" className="text-muted hover:text-ink" aria-label={`Copy ${label}`} onClick={() => navigator.clipboard.writeText(value).then(() => toast.success('Copied'))}>
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function HeartbeatsPage() {
  const scope = useScope();
  const qc = useQueryClient();
  const critical = useCritical();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Heartbeat | null>(null);
  const hbs = useQuery({ queryKey: ['heartbeats', scope], queryFn: () => api.listHeartbeats(scope), refetchInterval: 30_000 });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '—';

  const pause = useMutation({
    mutationFn: (h: Heartbeat) => api.setHeartbeatPaused(h.id, h.status !== 'paused'),
    onSuccess: (h) => {
      qc.invalidateQueries({ queryKey: ['heartbeats'] });
      toast.success(h.status === 'paused' ? `${h.name} paused` : `${h.name} resumed`);
    },
  });

  const missed = (hbs.data ?? []).filter((h) => h.status === 'down').length;

  return (
    <>
      <PageHeader
        title="Heartbeats"
        description={missed ? `${missed} scheduled ${missed === 1 ? 'job has' : 'jobs have'} missed a run.` : 'Your cron jobs and background tasks ping ShieldOps when they run. Missed pings raise an alert.'}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New heartbeat
          </Button>
        }
      />

      {hbs.isLoading ? (
        <Spinner />
      ) : hbs.error ? (
        <ErrorState error={hbs.error} onRetry={() => hbs.refetch()} />
      ) : !hbs.data?.length ? (
        <EmptyState
          icon={<HeartPulse className="h-6 w-6" />}
          title="No heartbeats yet"
          body="Create one for each scheduled job, then add a single request to the end of the job."
          action={<Button variant="primary" onClick={() => setCreating(true)}>New heartbeat</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-8" aria-label="Expand" />
                <th>Job</th>
                <th>Status</th>
                <th>Schedule</th>
                <th>Last ping</th>
                <th>Next expected</th>
                <th className="w-px" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {hbs.data.map((h) => (
                <Fragment key={h.id}>
                  <tr className="cursor-pointer" onClick={() => setOpen(open === h.id ? null : h.id)}>
                    <td className="text-muted">{open === h.id ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}</td>
                    <td>
                      <p className="font-medium">{h.name}</p>
                      <p className="text-xs text-muted">{appName(h.applicationId)}</p>
                    </td>
                    <td className={cn('text-sm font-medium', STATUS[h.status].tone)}>{STATUS[h.status].label}</td>
                    <td className="text-sm">
                      {scheduleText(h.schedule)}
                      <p className="text-xs text-muted">{formatInterval(h.graceSec)} grace</p>
                    </td>
                    <td className="whitespace-nowrap text-sm" title={formatDateTime(h.lastPingAt)}>
                      {timeAgo(h.lastPingAt)}
                    </td>
                    <td className="whitespace-nowrap text-sm text-muted" title={formatDateTime(h.nextDueAt)}>
                      {h.status === 'paused' ? '—' : h.nextDueAt ? timeAgo(h.nextDueAt) : 'After first ping'}
                    </td>
                    <td>
                      <Menu
                        actions={[
                          { label: 'Copy ping URL', onSelect: () => navigator.clipboard.writeText(h.pingUrl).then(() => toast.success('Ping URL copied')) },
                          { label: h.status === 'paused' ? 'Resume' : 'Pause', onSelect: () => pause.mutate(h) },
                          { label: 'Delete heartbeat', danger: true, onSelect: () => setDeleting(h) },
                        ]}
                      />
                    </td>
                  </tr>
                  {open === h.id && (
                    <tr className="hover:bg-transparent">
                      <td />
                      <td colSpan={6} className="pb-5">
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                          <div className="space-y-2 text-sm">
                            <p className="font-medium">Add this to the end of the job</p>
                            <CopyField label="curl command" value={`curl -fsS -m 10 --retry 3 ${h.pingUrl}`} />
                            <p className="text-xs text-muted">
                              Send <code className="font-mono">{h.pingUrl}/start</code> when it begins to measure run time, and <code className="font-mono">{h.pingUrl}/fail</code> if it errors.
                            </p>
                          </div>
                          <div>
                            <p className="mb-1 text-sm font-medium">Recent pings</p>
                            {h.recent.length === 0 ? (
                              <p className="text-sm text-muted">None yet.</p>
                            ) : (
                              <ul className="space-y-1 text-sm">
                                {h.recent.slice(0, 6).map((p) => (
                                  <li key={p.at + p.kind} className="flex justify-between gap-3">
                                    <span className={cn(p.kind === 'fail' ? 'text-down' : p.kind === 'start' ? 'text-muted' : '', 'capitalize')}>
                                      {p.kind}
                                      {p.late && <span className="text-degraded"> (late)</span>}
                                    </span>
                                    <span className="tabular-nums text-muted">{formatDateTime(p.at)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <HeartbeatFormModal open={creating} onClose={() => setCreating(false)} onCreated={(h) => setOpen(h.id)} defaultApplicationId={scope.applicationId} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        body="Its ping URL stops working. Remove the request from the job too, or it will fail quietly."
        actionLabel="Delete heartbeat"
        confirmText="delete"
        onConfirm={() =>
          critical(() => api.deleteHeartbeat(deleting!.id)).then(() => {
            qc.invalidateQueries({ queryKey: ['heartbeats'] });
            toast.success('Heartbeat deleted');
          })
        }
      />
    </>
  );
}

function HeartbeatFormModal(props: { open: boolean; onClose: () => void; onCreated: (h: Heartbeat) => void; defaultApplicationId?: string }) {
  return props.open ? <HeartbeatForm {...props} /> : null;
}

function HeartbeatForm({ open, onClose, onCreated, defaultApplicationId }: { open: boolean; onClose: () => void; onCreated: (h: Heartbeat) => void; defaultApplicationId?: string }) {
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const [form, setForm] = useState({ name: '', applicationId: defaultApplicationId ?? '', environmentId: '', kind: 'interval' as 'interval' | 'cron', every: 15, unit: 60, cron: '0 2 * * *', graceMin: 5 });
  const active = (apps.data ?? []).filter((a) => a.status === 'active');
  const app = active.find((a) => a.id === form.applicationId);
  const environmentId = app?.environments.some((e) => e.id === form.environmentId) ? form.environmentId : app?.environments[0]?.id ?? '';

  const create = useMutation({
    mutationFn: (input: HeartbeatInput) => api.createHeartbeat(input),
    onSuccess: (h) => {
      qc.invalidateQueries({ queryKey: ['heartbeats'] });
      toast.success(`${h.name} created. Add its ping URL to the job.`);
      onClose();
      onCreated(h);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({
      name: form.name,
      applicationId: form.applicationId,
      environmentId,
      schedule: form.kind === 'interval' ? { kind: 'interval', seconds: form.every * form.unit } : { kind: 'cron', expression: form.cron.trim() },
      graceSec: form.graceMin * 60,
    });
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: ['every', 'unit', 'graceMin'].includes(k) ? Number(e.target.value) : e.target.value });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New heartbeat"
      description="ShieldOps expects a ping on this schedule. If none arrives within the grace period, it raises an alert."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="heartbeat-form" variant="primary" loading={create.isPending} disabled={!form.name.trim() || !environmentId}>
            Create heartbeat
          </Button>
        </>
      }
    >
      <form id="heartbeat-form" onSubmit={submit} className="space-y-4">
        <Field label="Job name">{(id) => <Input id={id} value={form.name} onChange={set('name')} placeholder="Nightly database backup" autoFocus />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Application">
            {(id) => (
              <Select id={id} value={form.applicationId} onChange={set('applicationId')} required>
                <option value="" disabled>
                  Choose an application
                </option>
                {active.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Environment">
            {(id) => (
              <Select id={id} value={environmentId} onChange={set('environmentId')} disabled={!app}>
                {(app?.environments ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Runs</legend>
          <div className="flex flex-wrap gap-2">
            {(['interval', 'cron'] as const).map((k) => (
              <label key={k} className="inline-flex cursor-pointer items-center gap-2 rounded border border-line px-3 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                <input type="radio" name="kind" checked={form.kind === k} onChange={() => setForm({ ...form, kind: k })} className="accent-[rgb(var(--accent))]" />
                {k === 'interval' ? 'On a fixed interval' : 'On a cron schedule'}
              </label>
            ))}
          </div>
          {form.kind === 'interval' ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Every</span>
              <Input type="number" min={1} value={form.every} onChange={set('every')} className="w-20" aria-label="Interval" />
              <Select value={form.unit} onChange={set('unit')} className="w-32" aria-label="Unit">
                <option value={60}>minutes</option>
                <option value={3600}>hours</option>
                <option value={86400}>days</option>
              </Select>
            </div>
          ) : (
            <Field label="Cron expression" hint="Five parts: minute, hour, day of month, month, day of week. Times are in UTC.">
              {(id, d) => <Input id={id} aria-describedby={d} value={form.cron} onChange={set('cron')} className="w-48 font-mono text-xs" />}
            </Field>
          )}
        </fieldset>
        <Field label="Grace period" hint="How late a ping can be before it counts as missed.">
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={form.graceMin} onChange={set('graceMin')} className="w-40">
              {[1, 5, 15, 30, 60, 180].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} minutes` : `${m / 60} ${m === 60 ? 'hour' : 'hours'}`}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <InlineError error={create.error} />
      </form>
    </Modal>
  );
}