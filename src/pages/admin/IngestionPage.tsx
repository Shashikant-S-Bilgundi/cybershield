import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeySquare, Plus, TriangleAlert } from 'lucide-react';
import { api, type IngestionKeyInput, type IngestionKeySecret } from '@/api';
import type { IngestionKey } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { formatCount, formatDateTime, timeAgo } from '@/lib/format';
import { INGEST_URL, browserSnippet, envVarSnippet, nodeSnippet, reactNativeSnippet } from '@/lib/ingest';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Field, Input, Select } from '@/components/ui/Field';
import { Menu } from '@/components/ui/Menu';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { ConfirmDialog } from '@/components/security/ConfirmDialog';
import { isReauthCancelled, useCritical } from '@/components/security/reauth';
import { AgentTokensSection } from './AgentTokensSection';
import { ProbesSection } from './ProbesSection';

export function IngestionPage() {
  const scope = useScope();
  const qc = useQueryClient();
  const critical = useCritical();
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<IngestionKeySecret | null>(null);
  const [revoking, setRevoking] = useState<IngestionKey | null>(null);
  const [rotating, setRotating] = useState<IngestionKey | null>(null);
  const keys = useQuery({ queryKey: ['ingestion-keys', scope], queryFn: () => api.listIngestionKeys(scope), refetchInterval: 60_000 });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const name = (k: IngestionKey) => {
    const a = apps.data?.find((x) => x.id === k.applicationId);
    return `${a?.name ?? '—'}, ${a?.environments.find((e) => e.id === k.environmentId)?.name ?? ''}`;
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ['ingestion-keys'] });
  const location = useLocation();

  // Links like /ingestion#agents jump straight to that section.
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [location.hash, keys.isSuccess]);

  return (
    <>
      <PageHeader
        title="Ingestion keys and agents"
        description="Each app environment sends errors, performance data and security events with its own key. Keys are shown once, stored hashed, and can be rotated or revoked at any time."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New key
          </Button>
        }
      />

      <section className="mb-10">
        {keys.isLoading ? (
          <Spinner />
        ) : keys.error ? (
          <ErrorState error={keys.error} onRetry={() => keys.refetch()} />
        ) : !keys.data?.length ? (
          <EmptyState icon={<KeySquare className="h-6 w-6" />} title="No keys yet" body="Create a server key for each backend and a browser key for each web front end." action={<Button variant="primary" onClick={() => setCreating(true)}>New key</Button>} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Type</th>
                  <th>Application</th>
                  <th>Last used</th>
                  <th className="text-right">Events, 24h</th>
                  <th className="w-px" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {keys.data.map((k) => (
                  <tr key={k.id} className={cn(k.status === 'revoked' && 'opacity-60')}>
                    <td>
                      <p className="font-medium">{k.name}</p>
                      <p className="font-mono text-xs text-muted">{k.prefix}…</p>
                    </td>
                    <td className="text-sm">
                      {k.kind === 'server' ? 'Server' : 'Browser'}
                      <p className="text-xs text-muted">{k.kind === 'server' ? 'Errors, performance, security' : 'Errors only'}</p>
                    </td>
                    <td className="text-sm">{name(k)}</td>
                    <td className="whitespace-nowrap text-sm" title={formatDateTime(k.lastUsedAt)}>
                      {k.status === 'revoked' ? <span className="text-muted">Revoked {timeAgo(k.revokedAt)}</span> : k.lastUsedAt ? timeAgo(k.lastUsedAt) : <span className="text-degraded">Never: waiting for first event</span>}
                    </td>
                    <td className="text-right text-sm tabular-nums">{k.status === 'active' ? formatCount(k.eventsLast24h) : '—'}</td>
                    <td>
                      {k.status === 'active' && (
                        <Menu
                          actions={[
                            { label: 'Rotate key', onSelect: () => setRotating(k) },
                            { label: 'Revoke key', danger: true, onSelect: () => setRevoking(k) },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-10 space-y-3">
        <h2 className="font-semibold">Setting up the SDK</h2>
        <p className="max-w-3xl text-sm text-muted">
          Install the SDK, put the key in an environment variable, and add the two Express handlers. The SDK removes passwords, tokens, cookies and authorization headers before
          anything leaves your server, and sends performance data as one summary every 60 seconds rather than per request.
        </p>
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-medium">Node.js and Express</p>
            <CodeBlock code={nodeSnippet('production')} label="Node.js setup" />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">React or any browser app</p>
            <CodeBlock code={browserSnippet('production')} label="browser setup" />
            <p className="mt-2 text-xs text-muted">
              Browser keys are visible to anyone who opens your site, so they can only send errors. Data goes to <code className="font-mono">{INGEST_URL}</code>.
            </p>
          </div>
          <div className="xl:col-span-2">
            <p className="mb-1 text-sm font-medium">React Native and Expo</p>
            <CodeBlock code={reactNativeSnippet('production')} label="React Native setup" />
            <p className="mt-2 text-xs text-muted">Use a browser key: an app bundle can be unpacked, so the key inside it is public. Native crashes and JavaScript errors both arrive as error groups.</p>
          </div>
        </div>
      </section>

      <ProbesSection />
      <AgentTokensSection />

      {creating && (
        <CreateKeyDialog
          defaultApplicationId={scope.applicationId}
          onClose={() => setCreating(false)}
          onCreated={(r) => {
            refresh();
            setCreating(false);
            setRevealed(r);
          }}
        />
      )}
      {revealed && <SecretDialog result={revealed} onClose={() => setRevealed(null)} />}

      <ConfirmDialog
        open={!!rotating}
        onClose={() => setRotating(null)}
        danger={false}
        title={`Rotate ${rotating?.name ?? ''}?`}
        body="You get a new key to deploy. The current key keeps working for 24 hours so nothing breaks while you update the app."
        actionLabel="Rotate key"
        onConfirm={() =>
          critical(() => api.rotateIngestionKey(rotating!.id)).then((r) => {
            refresh();
            setRevealed(r);
          })
        }
      />
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title={`Revoke ${revoking?.name ?? ''}?`}
        body="The key stops working immediately. Anything still using it is rejected, so errors and security events from that app are lost until it has a new key."
        actionLabel="Revoke key"
        confirmText="revoke"
        onConfirm={() =>
          critical(() => api.revokeIngestionKey(revoking!.id)).then(() => {
            refresh();
            toast.success('Key revoked');
          })
        }
      />
    </>
  );
}

function CreateKeyDialog({ defaultApplicationId, onClose, onCreated }: { defaultApplicationId?: string; onClose: () => void; onCreated: (r: IngestionKeySecret) => void }) {
  const critical = useCritical();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const [form, setForm] = useState<IngestionKeyInput>({ name: '', kind: 'server', applicationId: defaultApplicationId ?? '', environmentId: '' });
  const active = (apps.data ?? []).filter((a) => a.status === 'active');
  const app = active.find((a) => a.id === form.applicationId);
  const environmentId = app?.environments.some((e) => e.id === form.environmentId) ? form.environmentId : app?.environments[0]?.id ?? '';

  const create = useMutation({
    mutationFn: (input: IngestionKeyInput) => critical(() => api.createIngestionKey(input)),
    onSuccess: onCreated,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ ...form, environmentId, name: form.name || `${app?.name ?? ''} ${form.kind === 'server' ? 'server' : 'web app'}` });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New ingestion key"
      description="Create one key per app and environment, so you can revoke one without affecting the others."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="key-form" variant="primary" loading={create.isPending} disabled={!environmentId}>
            Create key
          </Button>
        </>
      }
    >
      <form id="key-form" onSubmit={submit} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Where will it run?</legend>
          {(
            [
              ['server', 'On a server', 'Node.js backends. Sends errors, performance data and security events. Keep it secret.'],
              ['browser', 'In the browser', 'React and other front ends. Sends errors only, because anyone can read it.'],
            ] as const
          ).map(([k, title, body]) => (
            <label key={k} className="flex cursor-pointer items-start gap-2.5 rounded border border-line px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5">
              <input type="radio" name="kind" checked={form.kind === k} onChange={() => setForm({ ...form, kind: k })} className="mt-0.5 accent-[rgb(var(--accent))]" />
              <span>
                <span className="font-medium">{title}</span>
                <span className="block text-xs text-muted">{body}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Application">
            {(id) => (
              <Select id={id} value={form.applicationId} onChange={(e) => setForm({ ...form, applicationId: e.target.value })} required>
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
              <Select id={id} value={environmentId} onChange={(e) => setForm({ ...form, environmentId: e.target.value })} disabled={!app}>
                {(app?.environments ?? []).map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Name" hint="Optional. Helps you tell keys apart later.">
          {(id, d) => <Input id={id} aria-describedby={d} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={app ? `${app.name} ${form.kind === 'server' ? 'server' : 'web app'}` : 'Payments API server'} />}
        </Field>
        {create.error && !isReauthCancelled(create.error) && <InlineError error={create.error} />}
      </form>
    </Modal>
  );
}

function SecretDialog({ result, onClose }: { result: IngestionKeySecret; onClose: () => void }) {
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const [saved, setSaved] = useState(false);
  const k = result.key;
  const envName = apps.data?.find((a) => a.id === k.applicationId)?.environments.find((e) => e.id === k.environmentId)?.name.toLowerCase() ?? 'production';
  return (
    <Modal
      open
      onClose={() => saved && onClose()}
      size="lg"
      title={`Copy the key for ${k.name}`}
      description="This is the only time the full key is shown. ShieldOps stores only a hash of it."
      footer={
        <Button variant="primary" onClick={onClose} disabled={!saved}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2 rounded border border-degraded/40 bg-degraded/10 px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-degraded" aria-hidden />
          <p>Put it in your app's environment variables or secrets manager. Never commit it to Git.</p>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Environment variable</p>
          <CodeBlock code={envVarSnippet(result.secret, k.kind)} label="environment variable" />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Then add the SDK</p>
          <CodeBlock code={k.kind === 'server' ? nodeSnippet(envName) : browserSnippet(envName)} label="setup code" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="accent-[rgb(var(--accent))]" />
          I've stored the key somewhere safe
        </label>
      </div>
    </Modal>
  );
}