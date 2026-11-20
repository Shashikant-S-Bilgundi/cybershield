import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EscalationSection } from './EscalationSection';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { api, type AlertRuleInput, type MaintenanceWindowInput } from '@/api';
import type { AlertChannel, AlertRule, AlertSignal, EnvironmentType, NotificationChannels, Severity } from '@/types';
import { cn } from '@/lib/cn';
import { CHANNEL_LABEL, ENV_TYPE_LABEL, SEVERITY_LABEL, SIGNAL_LABEL, formatDateTime, isPast } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Menu } from '@/components/ui/Menu';
import { Modal } from '@/components/ui/Modal';
import { SeverityBadge } from '@/components/ui/Badge';
import { ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { isReauthCancelled, useCritical } from '@/components/security/reauth';

const THRESHOLD: Partial<Record<AlertSignal, { label: string; unit: string }>> = {
  uptime_down: { label: 'Failed checks in a row', unit: 'checks' },
  latency_p95: { label: 'p95 response time above', unit: 'ms' },
  ssl_expiry: { label: 'Days left or fewer', unit: 'days' },
  domain_expiry: { label: 'Days left or fewer', unit: 'days' },
  error_spike: { label: 'Times the 1-hour baseline', unit: '×' },
  error_rate: { label: '5xx rate above', unit: '%' },
  traffic_drop: { label: 'No requests for', unit: 'min' },
  failed_logins: { label: 'Failures per IP in 5 min', unit: 'failures' },
  credential_stuffing: { label: 'Distinct accounts from one IP in 10 min', unit: 'accounts' },
  auth_failure_spike: { label: 'Times the 1-hour baseline', unit: '×' },
  cpu_high: { label: 'CPU above', unit: '%' },
  memory_high: { label: 'Memory above', unit: '%' },
  disk_high: { label: 'Disk use above', unit: '%' },
  agent_offline: { label: 'Missed reports in a row', unit: 'reports' },
  process_down: { label: 'Restarts in 10 min', unit: 'restarts' },
  db_down: { label: 'Failed checks in a row', unit: 'checks' },
  scan_failed: { label: 'Failed scans in a row', unit: 'scans' },
  anomaly: { label: 'Sensitivity (higher alerts sooner)', unit: '1 to 3' },
};

const DEFAULT_THRESHOLD: Partial<Record<AlertSignal, number>> = {
  uptime_down: 3,
  latency_p95: 2000,
  ssl_expiry: 14,
  domain_expiry: 30,
  error_spike: 5,
  error_rate: 5,
  traffic_drop: 10,
  failed_logins: 10,
  credential_stuffing: 10,
  auth_failure_spike: 3,
  cpu_high: 90,
  memory_high: 90,
  disk_high: 85,
  agent_offline: 3,
  process_down: 3,
  db_down: 3,
  scan_failed: 3,
  anomaly: 2,
};

function conditionText(r: Pick<AlertRule, 'signal' | 'threshold' | 'durationMin'>): string {
  switch (r.signal) {
    case 'uptime_down':
      return `${r.threshold} failed checks in a row`;
    case 'latency_p95':
      return `p95 above ${r.threshold?.toLocaleString('en-IN')} ms for ${r.durationMin} min`;
    case 'heartbeat_missed':
      return 'No ping within the grace period';
    case 'ssl_expiry':
    case 'domain_expiry':
      return `${r.threshold} ${r.threshold === 1 ? 'day' : 'days'} or less left`;
    case 'dns_change':
      return 'Any change to A, AAAA, CNAME, MX or NS';
    case 'headers_missing':
      return 'HSTS or CSP missing';
    case 'error_new':
      return 'First occurrence of a new error';
    case 'error_regression':
      return 'A resolved error happens again';
    case 'error_spike':
      return `${r.threshold}× the 1-hour baseline in 5 min`;
    case 'error_rate':
      return `5xx rate above ${r.threshold}% for ${r.durationMin} min`;
    case 'traffic_drop':
      return `No requests for ${r.threshold} min on a busy route`;
    case 'failed_logins':
      return `${r.threshold} or more failures from one IP in 5 min`;
    case 'credential_stuffing':
      return `One IP failing on ${r.threshold}+ accounts in 10 min`;
    case 'auth_failure_spike':
      return `401/403 at ${r.threshold}× the 1-hour baseline`;
    case 'cpu_high':
      return `CPU above ${r.threshold}% for ${r.durationMin} min`;
    case 'memory_high':
      return `Memory above ${r.threshold}% for ${r.durationMin} min`;
    case 'disk_high':
      return `Disk more than ${r.threshold}% full`;
    case 'agent_offline':
      return `Agent misses ${r.threshold} reports in a row`;
    case 'process_down':
      return `Stopped, or ${r.threshold}+ restarts in 10 min`;
    case 'db_down':
      return `${r.threshold} failed connection checks in a row`;
    case 'secret_found':
      return 'A new secret appears in a repository';
    case 'vuln_found':
      return 'A new critical or high vulnerability';
    case 'vuln_exploited':
      return 'A vulnerability on the CISA known-exploited list';
    case 'scan_failed':
      return `${r.threshold} scans in a row fail or only partly finish`;
    case 'anomaly':
      return `Traffic, errors or logins far outside the usual range for this hour (sensitivity ${r.threshold})`;
  }
}

export function AlertRulesPage() {
  return (
    <>
      <PageHeader title="Alert rules and channels" description="What raises an alert, how serious it is, and who hears about it." />
      <div className="space-y-10">
        <RulesSection />
        <EscalationSection />
        <ChannelsSection />
        <MaintenanceSection />
      </div>
    </>
  );
}

function RulesSection() {
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ['alert-rules'], queryFn: api.listAlertRules });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const [editing, setEditing] = useState<AlertRule | 'new' | null>(null);
  const appName = (id: string | null) => (id ? apps.data?.find((a) => a.id === id)?.name ?? 'Deleted application' : 'All applications');

  const toggle = useMutation({
    mutationFn: (r: AlertRule) => api.updateAlertRule(r.id, { enabled: !r.enabled }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success(`${r.name} turned ${r.enabled ? 'on' : 'off'}`);
    },
  });
  const remove = useMutation({
    mutationFn: (r: AlertRule) => api.deleteAlertRule(r.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success('Rule deleted');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section aria-labelledby="rules-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="rules-title" className="font-semibold">
            Rules
          </h2>
          <p className="text-sm text-muted">Built-in rules follow the agreed thresholds. You can change or turn them off, but not delete them.</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden />
          New rule
        </Button>
      </div>
      {rules.isLoading ? (
        <Spinner />
      ) : rules.error ? (
        <ErrorState error={rules.error} onRetry={() => rules.refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-base">
            <thead>
              <tr>
                <th>On</th>
                <th>Rule</th>
                <th>When</th>
                <th>Severity</th>
                <th>Applies to</th>
                <th>Notify by</th>
                <th className="w-px" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {(rules.data ?? []).map((r) => (
                <tr key={r.id} className={cn(!r.enabled && 'opacity-60')}>
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={r.enabled}
                      aria-label={`${r.name} ${r.enabled ? 'on' : 'off'}`}
                      onClick={() => toggle.mutate(r)}
                      className={cn('relative h-5 w-9 rounded-full transition-colors', r.enabled ? 'bg-accent' : 'bg-line')}
                    >
                      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]', r.enabled ? 'left-[18px]' : 'left-0.5')} />
                    </button>
                  </td>
                  <td>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted">
                      {SIGNAL_LABEL[r.signal]}
                      {!r.builtIn && ', custom'}
                    </p>
                  </td>
                  <td className="text-sm">{conditionText(r)}</td>
                  <td>
                    <SeverityBadge severity={r.severity} />
                  </td>
                  <td className="text-sm">
                    {appName(r.scope.applicationId)}
                    <p className="text-xs text-muted">{r.scope.environmentType ? `${ENV_TYPE_LABEL[r.scope.environmentType]} only` : 'Any environment'}</p>
                  </td>
                  <td className="text-sm">{r.channels.map((c) => CHANNEL_LABEL[c]).join(', ')}</td>
                  <td>
                    <Menu
                      actions={[
                        { label: 'Edit rule', onSelect: () => setEditing(r) },
                        ...(r.builtIn ? [] : [{ label: 'Delete rule', danger: true, onSelect: () => remove.mutate(r) }]),
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <RuleForm rule={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function RuleForm({ rule, onClose }: { rule?: AlertRule; onClose: () => void }) {
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const [form, setForm] = useState<AlertRuleInput>(
    rule
      ? { name: rule.name, signal: rule.signal, threshold: rule.threshold, durationMin: rule.durationMin, severity: rule.severity, scope: rule.scope, channels: rule.channels, enabled: rule.enabled }
      : { name: '', signal: 'uptime_down', threshold: 3, durationMin: null, severity: 'high', scope: { applicationId: null, environmentType: null }, channels: ['in_app', 'email'], enabled: true },
  );
  const th = THRESHOLD[form.signal];

  const save = useMutation({
    mutationFn: (input: AlertRuleInput) => (rule ? api.updateAlertRule(rule.id, input) : api.createAlertRule(input)),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success(rule ? `${r.name} saved` : `${r.name} created`);
      onClose();
    },
  });

  const setSignal = (signal: AlertSignal) =>
    setForm({ ...form, signal, threshold: DEFAULT_THRESHOLD[signal] ?? null, durationMin: signal === 'latency_p95' || signal === 'error_rate' ? 5 : signal === 'cpu_high' || signal === 'memory_high' ? 10 : null });

  const integrations = useQuery({ queryKey: ['integrations'], queryFn: api.listIntegrations });
  const connected = (c: AlertChannel) => c === 'in_app' || c === 'email' || integrations.data?.find((i) => i.type === c)?.status === 'connected';
  const toggleChannel = (c: AlertChannel) =>
    setForm({ ...form, channels: form.channels.includes(c) ? form.channels.filter((x) => x !== c) : [...form.channels, c] });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? `Edit ${rule.name}` : 'New alert rule'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="rule-form" variant="primary" loading={save.isPending} disabled={!form.name.trim() || !form.channels.length}>
            {rule ? 'Save rule' : 'Create rule'}
          </Button>
        </>
      }
    >
      <form id="rule-form" onSubmit={submit} className="space-y-4">
        <Field label="Name">{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={rule?.builtIn} autoFocus={!rule} />}</Field>
        <Field label="Alert when">
          {(id) => (
            <Select id={id} value={form.signal} onChange={(e) => setSignal(e.target.value as AlertSignal)} disabled={!!rule}>
              {(Object.keys(SIGNAL_LABEL) as AlertSignal[]).map((s) => (
                <option key={s} value={s}>
                  {SIGNAL_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {th && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`${th.label} (${th.unit})`}>
              {(id) => <Input id={id} type="number" min={1} value={form.threshold ?? ''} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} />}
            </Field>
            {(form.signal === 'latency_p95' || form.signal === 'error_rate' || form.signal === 'cpu_high' || form.signal === 'memory_high') && (
              <Field label="For at least (minutes)">
                {(id) => <Input id={id} type="number" min={1} value={form.durationMin ?? ''} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })} />}
              </Field>
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Severity">
            {(id) => (
              <Select id={id} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })}>
                {(Object.keys(SEVERITY_LABEL) as Severity[]).map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Application">
            {(id) => (
              <Select id={id} value={form.scope.applicationId ?? ''} onChange={(e) => setForm({ ...form, scope: { ...form.scope, applicationId: e.target.value || null } })}>
                <option value="">All applications</option>
                {(apps.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Environment">
            {(id) => (
              <Select
                id={id}
                value={form.scope.environmentType ?? ''}
                onChange={(e) => setForm({ ...form, scope: { ...form.scope, environmentType: (e.target.value || null) as EnvironmentType | null } })}
              >
                <option value="">Any</option>
                <option value="production">Production only</option>
                <option value="staging">Staging only</option>
                <option value="development">Development only</option>
              </Select>
            )}
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Notify by</legend>
          <div className="flex flex-wrap gap-2">
            {(['in_app', 'email', 'slack', 'webhook'] as const).map((c) => (
              <label
                key={c}
                className={cn(
                  'inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10',
                  connected(c) ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                )}
                title={connected(c) ? undefined : `Connect ${CHANNEL_LABEL[c]} in Integrations first`}
              >
                <input type="checkbox" checked={form.channels.includes(c)} onChange={() => toggleChannel(c)} disabled={!connected(c) && !form.channels.includes(c)} className="accent-[rgb(var(--accent))]" />
                {CHANNEL_LABEL[c]}
              </label>
            ))}
          </div>
        </fieldset>
        <InlineError error={save.error} />
      </form>
    </Modal>
  );
}

function ChannelsSection() {
  const channels = useQuery({ queryKey: ['channels'], queryFn: api.getChannels });
  return (
    <section aria-labelledby="channels-title">
      <h2 id="channels-title" className="font-semibold">
        Channels
      </h2>
      <p className="mb-3 text-sm text-muted">
        In-app alerts reach everyone. Email goes to the addresses below. Slack and webhooks are set up in{' '}
        <Link to="/integrations" className="text-accent hover:underline">
          Integrations
        </Link>
        , then chosen per rule.
      </p>
      {channels.isLoading ? <Spinner /> : channels.error ? <ErrorState error={channels.error} /> : <ChannelsForm key={JSON.stringify(channels.data)} channels={channels.data!} />}
    </section>
  );
}

function ChannelsForm({ channels }: { channels: NotificationChannels }) {
  const qc = useQueryClient();
  const critical = useCritical();
  const [emails, setEmails] = useState(channels.emailRecipients);
  const [draft, setDraft] = useState('');
  const [renotify, setRenotify] = useState(channels.criticalRenotifyMin);
  const [maxRenotify, setMaxRenotify] = useState(channels.maxRenotify);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const draftValid = /^\S+@\S+\.\S+$/.test(draft.trim());
  const dirty = JSON.stringify({ emails, renotify, maxRenotify }) !== JSON.stringify({ emails: channels.emailRecipients, renotify: channels.criticalRenotifyMin, maxRenotify: channels.maxRenotify });

  const add = () => {
    const v = draft.trim().toLowerCase();
    if (!draftValid || emails.includes(v)) return;
    setEmails([...emails, v]);
    setDraft('');
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await critical(() => api.updateChannels({ emailRecipients: emails, criticalRenotifyMin: renotify, maxRenotify }));
      qc.setQueryData(['channels'], next);
      toast.success('Channels saved');
    } catch (err) {
      if (!isReauthCancelled(err)) setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4 rounded-lg border border-line bg-surface p-4">
      <div>
        <p className="mb-2 text-sm font-medium">Email recipients</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {emails.length === 0 && <span className="text-sm text-muted">No one gets emails yet.</span>}
          {emails.map((em) => (
            <span key={em} className="inline-flex items-center gap-1.5 rounded border border-line bg-sunken px-2 py-1 text-sm">
              {em}
              <button type="button" onClick={() => setEmails(emails.filter((x) => x !== em))} className="text-muted hover:text-ink" aria-label={`Remove ${em}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex max-w-md gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="it-alerts@example.com"
            aria-label="Add an email recipient"
            type="email"
          />
          <Button onClick={add} disabled={!draftValid}>
            Add
          </Button>
        </div>
      </div>
      <div className="grid max-w-md gap-4 sm:grid-cols-2">
        <Field label="Repeat critical alerts every" hint="Until someone acknowledges.">
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={renotify} onChange={(e) => setRenotify(Number(e.target.value))}>
              {[5, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Repeat at most">
          {(id) => (
            <Select id={id} value={maxRenotify} onChange={(e) => setMaxRenotify(Number(e.target.value))}>
              {[1, 2, 4, 6, 10].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'time' : 'times'}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <InlineError error={error} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>
          Save channels
        </Button>
      </div>
    </form>
  );
}

const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function MaintenanceSection() {
  const qc = useQueryClient();
  const windows = useQuery({ queryKey: ['maintenance'], queryFn: api.listMaintenanceWindows });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const [creating, setCreating] = useState(false);
  const appName = (id: string | null) => (id ? apps.data?.find((a) => a.id === id)?.name ?? '—' : 'All applications');
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteMaintenanceWindow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      toast.success('Maintenance window cancelled');
    },
  });

  return (
    <section aria-labelledby="mw-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="mw-title" className="font-semibold">
            Maintenance windows
          </h2>
          <p className="text-sm text-muted">Checks keep running, but no alerts are sent during a window.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Schedule
        </Button>
      </div>
      {windows.isLoading ? (
        <Spinner />
      ) : !windows.data?.length ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No maintenance scheduled.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {windows.data.map((w) => {
            const live = isPast(w.startsAt);
            return (
              <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">
                    {w.title} {live && <span className="ml-1 text-xs font-medium text-degraded">In progress</span>}
                  </p>
                  <p className="text-sm text-muted">
                    {appName(w.applicationId)}, {formatDateTime(w.startsAt)} to {formatDateTime(w.endsAt)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(w.id)} aria-label={`Cancel ${w.title}`}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {creating && <MaintenanceForm onClose={() => setCreating(false)} />}
    </section>
  );
}

function MaintenanceForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const [form, setForm] = useState(() => {
    const start = new Date(Date.now() + 60 * 60_000);
    start.setMinutes(0, 0, 0);
    return { title: '', applicationId: '', environmentId: '', startsAt: localInput(start), endsAt: localInput(new Date(start.getTime() + 2 * 3_600_000)) };
  });
  const app = apps.data?.find((a) => a.id === form.applicationId);
  const create = useMutation({
    mutationFn: (input: MaintenanceWindowInput) => api.createMaintenanceWindow(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      toast.success('Maintenance scheduled');
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({
      title: form.title,
      applicationId: form.applicationId || null,
      environmentId: form.environmentId || null,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
    });
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule maintenance"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="mw-form" variant="primary" loading={create.isPending} disabled={!form.title.trim()}>
            Schedule
          </Button>
        </>
      }
    >
      <form id="mw-form" onSubmit={submit} className="space-y-4">
        <Field label="What's happening">{(id) => <Input id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Database upgrade" autoFocus />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Application">
            {(id) => (
              <Select id={id} value={form.applicationId} onChange={(e) => setForm({ ...form, applicationId: e.target.value, environmentId: '' })}>
                <option value="">All applications</option>
                {(apps.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Environment">
            {(id) => (
              <Select id={id} value={form.environmentId} onChange={(e) => setForm({ ...form, environmentId: e.target.value })} disabled={!app}>
                <option value="">All environments</option>
                {(app?.environments ?? []).map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Starts">{(id) => <Input id={id} type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />}</Field>
          <Field label="Ends">{(id) => <Input id={id} type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />}</Field>
        </div>
        <InlineError error={create.error} />
      </form>
    </Modal>
  );
}