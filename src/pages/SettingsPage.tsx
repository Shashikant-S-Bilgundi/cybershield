import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, type SettingsUpdate } from '@/api';
import type { SystemSettings } from '@/types';
import { isValidCidr } from '@/lib/net';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { isReauthCancelled, useCritical } from '@/components/security/reauth';

function useSave() {
  const qc = useQueryClient();
  const critical = useCritical();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const save = async (input: SettingsUpdate, message: string) => {
    setBusy(true);
    setError(null);
    try {
      const next = await critical(() => api.updateSettings(input));
      qc.setQueryData(['settings'], next);
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      toast.success(message);
      return true;
    } catch (e) {
      if (!isReauthCancelled(e)) setError(e);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { save, busy, error };
}

function Section({ id, title, description, children, onSubmit, busy, error, dirty }: { id: string; title: string; description: ReactNode; children: ReactNode; onSubmit: (e: FormEvent) => void; busy: boolean; error: unknown; dirty: boolean }) {
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-4 border-b border-line py-8 first:pt-0 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 id={`${id}-title`} className="font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
        {children}
        <InlineError error={error} />
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </form>
    </section>
  );
}

function MonitoringSection({ settings }: { settings: SystemSettings }) {
  const [m, setM] = useState(settings.monitoring);
  const [tz, setTz] = useState(settings.timezone);
  const { save, busy, error } = useSave();
  const dirty = JSON.stringify(m) !== JSON.stringify(settings.monitoring) || tz !== settings.timezone;
  const num = (k: keyof typeof m) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setM({ ...m, [k]: Number(e.target.value) });

  return (
    <Section
      id="monitoring"
      title="Monitoring defaults"
      description="Used for every new monitor. Each monitor can override these later."
      busy={busy}
      error={error}
      dirty={dirty}
      onSubmit={(e) => {
        e.preventDefault();
        save({ monitoring: m, timezone: tz }, 'Monitoring defaults saved');
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Uptime check every">
          {(id) => (
            <Select id={id} value={m.uptimeIntervalSec} onChange={num('uptimeIntervalSec')}>
              {[30, 60, 120, 300, 600, 1800, 3600].map((s) => (
                <option key={s} value={s}>
                  {s < 60 ? `${s} seconds` : s === 60 ? '1 minute' : s < 3600 ? `${s / 60} minutes` : '1 hour'}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Mark down after" hint="Consecutive failed checks, including one recheck.">
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={m.downAfterFailures} onChange={num('downAfterFailures')}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'failure' : 'failures'}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="SSL check every">
          {(id) => (
            <Select id={id} value={m.sslCheckHours} onChange={num('sslCheckHours')}>
              {[6, 12, 24].map((h) => (
                <option key={h} value={h}>
                  {h} hours
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="DNS check every">
          {(id) => (
            <Select id={id} value={m.dnsCheckHours} onChange={num('dnsCheckHours')}>
              {[1, 6, 12, 24].map((h) => (
                <option key={h} value={h}>
                  {h} {h === 1 ? 'hour' : 'hours'}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Time zone for display">
          {(id) => (
            <Select id={id} value={tz} onChange={(e) => setTz(e.target.value)}>
              {['Asia/Kolkata', 'UTC', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York'].map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Section>
  );
}

function RetentionSection({ settings }: { settings: SystemSettings }) {
  const [r, setR] = useState(settings.retention);
  const { save, busy, error } = useSave();
  const dirty = JSON.stringify(r) !== JSON.stringify(settings.retention);
  const fields: [keyof typeof r, string, number][] = [
    ['checkResultsDays', 'Check results', 7],
    ['metricSamplesDays', 'Raw server and API metrics', 1],
    ['errorEventsDays', 'Error events', 7],
    ['securityEventsDays', 'Security events', 30],
    ['auditLogsDays', 'Audit logs', 365],
  ];
  const invalid = fields.some(([k, , min]) => !Number.isInteger(r[k]) || r[k] < min);

  return (
    <Section
      id="retention"
      title="Data retention"
      description="Raw data older than this is deleted. Hourly and daily summaries are kept for 13 months."
      busy={busy}
      error={error}
      dirty={dirty && !invalid}
      onSubmit={(e) => {
        e.preventDefault();
        save({ retention: r }, 'Retention saved');
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([k, label, min]) => (
          <Field key={k} label={`${label} (days)`} error={r[k] < min ? `At least ${min} days.` : null}>
            {(id, d) => <Input id={id} aria-describedby={d} type="number" min={min} value={r[k]} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} />}
          </Field>
        ))}
      </div>
    </Section>
  );
}

function SmtpSection({ settings }: { settings: SystemSettings }) {
  const [s, setS] = useState({ ...settings.smtp, password: '' });
  const { save, busy, error } = useSave();
  const { password, ...rest } = s;
  const dirty = JSON.stringify(rest) !== JSON.stringify(settings.smtp) || password.length > 0;
  const set = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: k === 'port' ? Number(e.target.value) : e.target.value });

  return (
    <Section
      id="smtp"
      title="Email delivery"
      description="The SMTP server ShieldOps uses for alerts, invites and reports."
      busy={busy}
      error={error}
      dirty={dirty}
      onSubmit={(e) => {
        e.preventDefault();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordSet: _ps, ...smtp } = rest;
        save({ smtp: { ...smtp, ...(password ? { password } : {}) } }, 'Email settings saved').then((ok) => ok && setS((cur) => ({ ...cur, password: '' })));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
        <Field label="SMTP host">{(id) => <Input id={id} value={s.host} onChange={set('host')} placeholder="smtp-relay.example.com" />}</Field>
        <Field label="Port">{(id) => <Input id={id} type="number" value={s.port} onChange={set('port')} />}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Username">{(id) => <Input id={id} value={s.username} onChange={set('username')} autoComplete="off" />}</Field>
        <Field label="Password" hint={settings.smtp.passwordSet ? 'A password is saved. Leave blank to keep it.' : undefined}>
          {(id, d) => <Input id={id} aria-describedby={d} type="password" value={s.password} onChange={set('password')} autoComplete="new-password" placeholder={settings.smtp.passwordSet ? '••••••••' : ''} />}
        </Field>
      </div>
      <Field label="Send from">{(id) => <Input id={id} value={s.fromAddress} onChange={set('fromAddress')} placeholder="ShieldOps <alerts@example.com>" />}</Field>
    </Section>
  );
}

function AllowlistSection({ settings }: { settings: SystemSettings }) {
  const [list, setList] = useState(settings.internalAllowlist);
  const [cidr, setCidr] = useState('');
  const [note, setNote] = useState('');
  const { save, busy, error } = useSave();
  const dirty = JSON.stringify(list) !== JSON.stringify(settings.internalAllowlist);
  const cidrError = cidr && !isValidCidr(cidr) ? 'Enter a range like 10.0.0.0/16.' : list.some((r) => r.cidr === cidr.trim()) ? 'This range is already listed.' : null;

  const add = () => {
    if (!cidr.trim() || cidrError) return;
    setList([...list, { cidr: cidr.trim(), note: note.trim() }]);
    setCidr('');
    setNote('');
  };

  return (
    <Section
      id="allowlist"
      title="Internal network allowlist"
      description={
        <>
          Private addresses ShieldOps may check. Anything outside these ranges is blocked. Cloud metadata addresses such as 169.254.169.254 are always blocked.
        </>
      }
      busy={busy}
      error={error}
      dirty={dirty}
      onSubmit={(e) => {
        e.preventDefault();
        save({ internalAllowlist: list }, 'Allowlist saved');
      }}
    >
      {list.length === 0 ? (
        <p className="rounded border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No internal ranges. ShieldOps can only reach public addresses.</p>
      ) : (
        <ul className="divide-y divide-line rounded border border-line">
          {list.map((r) => (
            <li key={r.cidr} className="flex items-center gap-3 px-3 py-2">
              <code className="w-40 shrink-0 font-mono text-xs">{r.cidr}</code>
              <span className="flex-1 truncate text-sm text-muted">{r.note || 'No note'}</span>
              <button type="button" onClick={() => setList(list.filter((x) => x.cidr !== r.cidr))} className="rounded p-1 text-muted hover:bg-sunken hover:text-down" aria-label={`Remove ${r.cidr}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid items-start gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
        <Field label="Range (CIDR)" error={cidrError}>
          {(id, d) => <Input id={id} aria-describedby={d} value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="10.0.0.0/16" className="font-mono text-xs" />}
        </Field>
        <Field label="Note">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Office network" />}</Field>
        <Button className="sm:mt-[26px]" onClick={add} disabled={!cidr.trim() || !!cidrError}>
          <Plus className="h-4 w-4" aria-hidden />
          Add range
        </Button>
      </div>
    </Section>
  );
}

function AiSection({ settings }: { settings: SystemSettings }) {
  const [ai, setAi] = useState(settings.ai);
  const { save, busy, error } = useSave();
  const dirty = JSON.stringify(ai) !== JSON.stringify(settings.ai);
  return (
    <Section
      id="ai"
      title="AI assistant"
      description="Explains findings, incidents and errors. Only masked evidence is sent; secret values, emails and IP addresses never are. Monitoring and alerts never depend on it."
      busy={busy}
      error={error}
      dirty={dirty && (!ai.enabled || ai.shareApproved)}
      onSubmit={(e) => {
        e.preventDefault();
        save({ ai }, ai.enabled ? 'AI assistant settings saved' : 'AI assistant turned off');
      }}
    >
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={ai.enabled} onChange={(e) => setAi({ ...ai, enabled: e.target.checked })} className="accent-[rgb(var(--accent))]" />
        Turn on the AI assistant
      </label>
      {ai.enabled && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider">
              {(id) => (
                <Select id={id} value={ai.provider} onChange={(e) => setAi({ ...ai, provider: e.target.value as SystemSettings['ai']['provider'] })}>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="azure_openai">Azure OpenAI</option>
                </Select>
              )}
            </Field>
            <Field label="Model">{(id) => <Input id={id} value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} className="font-mono text-xs" />}</Field>
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded border border-line px-3 py-2 text-sm">
            <input type="checkbox" checked={ai.shareApproved} onChange={(e) => setAi({ ...ai, shareApproved: e.target.checked })} className="mt-0.5 accent-[rgb(var(--accent))]" />
            <span>
              I approve sending masked evidence (finding details, stack traces of our own code, incident timelines) to this provider.
              <span className="block text-xs text-muted">The provider API key is set on the server, not here.</span>
            </span>
          </label>
        </>
      )}
    </Section>
  );
}

function SsoSection({ settings }: { settings: SystemSettings }) {
  const [sso, setSso] = useState(settings.sso);
  const [secret, setSecret] = useState('');
  const { save, busy, error } = useSave();
  const dirty = JSON.stringify(sso) !== JSON.stringify(settings.sso) || !!secret;
  const callback = `${window.location.origin}/api/v1/auth/sso/callback`;
  return (
    <Section
      id="sso"
      title="Single sign-on"
      description="Let people sign in with their Google Workspace or Microsoft account, using that account's own two-step verification. Only invited people can get in."
      busy={busy}
      error={error}
      dirty={dirty}
      onSubmit={(e) => {
        e.preventDefault();
        save({ sso: { ...sso, ...(secret ? { clientSecret: secret } : {}) } }, sso.enabled ? 'Single sign-on is on' : 'Single sign-on settings saved');
        setSecret('');
      }}
    >
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={sso.enabled} onChange={(e) => setSso({ ...sso, enabled: e.target.checked })} className="accent-[rgb(var(--accent))]" />
        Turn on single sign-on
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Provider">
          {(id) => (
            <Select id={id} value={sso.provider} onChange={(e) => setSso({ ...sso, provider: e.target.value as SystemSettings['sso']['provider'] })}>
              <option value="google">Google Workspace</option>
              <option value="entra">Microsoft Entra ID</option>
            </Select>
          )}
        </Field>
        <Field label="Allowed email domain">{(id) => <Input id={id} value={sso.domain} onChange={(e) => setSso({ ...sso, domain: e.target.value })} placeholder="example.com" />}</Field>
        <Field label="Client ID">{(id) => <Input id={id} value={sso.clientId} onChange={(e) => setSso({ ...sso, clientId: e.target.value })} className="font-mono text-xs" />}</Field>
        <Field label="Client secret" hint={settings.sso.clientSecretSet ? 'Saved. Enter a new one only to replace it.' : undefined}>
          {(id, d) => <Input id={id} aria-describedby={d} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" placeholder={settings.sso.clientSecretSet ? '••••••••' : ''} />}
        </Field>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Redirect URL to register with the provider</p>
        <code className="block break-all rounded bg-sunken px-3 py-2 font-mono text-xs">{callback}</code>
      </div>
      <label className="flex cursor-pointer items-start gap-2 rounded border border-line px-3 py-2 text-sm">
        <input type="checkbox" checked={sso.allowPasswordFallback} onChange={(e) => setSso({ ...sso, allowPasswordFallback: e.target.checked })} className="mt-0.5 accent-[rgb(var(--accent))]" />
        <span>
          Keep email and password sign-in as well
          <span className="block text-xs text-muted">Recommended: if the identity provider is down during an incident, you can still get into ShieldOps.</span>
        </span>
      </label>
    </Section>
  );
}

export function SettingsPage() {
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

  return (
    <>
      <PageHeader title="System settings" description="Changes here affect the whole team. Saving asks you to confirm it's you, and everyone is notified." />
      {settings.isLoading ? (
        <Spinner />
      ) : settings.error ? (
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
      ) : (
        <div className="rounded-lg border border-line bg-surface px-5 py-8 sm:px-8">
          {/* Each section remounts when its saved values change, so it starts from what the server has. */}
          <MonitoringSection key={JSON.stringify([settings.data!.monitoring, settings.data!.timezone])} settings={settings.data!} />
          <AllowlistSection key={JSON.stringify(settings.data!.internalAllowlist)} settings={settings.data!} />
          <SsoSection key={JSON.stringify(settings.data!.sso)} settings={settings.data!} />
          <AiSection key={JSON.stringify(settings.data!.ai)} settings={settings.data!} />
          <SmtpSection key={JSON.stringify(settings.data!.smtp)} settings={settings.data!} />
          <RetentionSection key={JSON.stringify(settings.data!.retention)} settings={settings.data!} />
        </div>
      )}
    </>
  );
}