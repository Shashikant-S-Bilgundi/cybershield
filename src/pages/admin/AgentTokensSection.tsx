import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, TriangleAlert } from 'lucide-react';
import { api, type AgentTokenInput, type AgentTokenSecret } from '@/api';
import type { AgentToken } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { formatDateTime, timeAgo } from '@/lib/format';
import { agentDockerSnippet, agentInstallSnippet } from '@/lib/ingest';
import { Button } from '@/components/ui/Button';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Field, Input, Select } from '@/components/ui/Field';
import { Menu } from '@/components/ui/Menu';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { ConfirmDialog } from '@/components/security/ConfirmDialog';
import { isReauthCancelled, useCritical } from '@/components/security/reauth';

export function AgentTokensSection() {
  const scope = useScope();
  const qc = useQueryClient();
  const critical = useCritical();
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<AgentTokenSecret | null>(null);
  const [rotating, setRotating] = useState<AgentToken | null>(null);
  const [revoking, setRevoking] = useState<AgentToken | null>(null);
  const tokens = useQuery({ queryKey: ['agent-tokens', scope], queryFn: () => api.listAgentTokens(scope), refetchInterval: 60_000 });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const where = (t: AgentToken) => {
    const a = apps.data?.find((x) => x.id === t.applicationId);
    return `${a?.name ?? '—'}, ${a?.environments.find((e) => e.id === t.environmentId)?.name ?? ''}`;
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['agent-tokens'] });
    qc.invalidateQueries({ queryKey: ['servers'] });
  };

  return (
    <section id="agents" aria-labelledby="agents-title" className="scroll-mt-20">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="agents-title" className="font-semibold">
            Server agent tokens
          </h2>
          <p className="max-w-3xl text-sm text-muted">
            The agent is a small program on each server. It only makes outbound HTTPS connections, opens no ports, and never runs commands sent to it. One token can cover all the servers of an environment.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New token
        </Button>
      </div>
      {tokens.isLoading ? (
        <Spinner />
      ) : tokens.error ? (
        <ErrorState error={tokens.error} onRetry={() => tokens.refetch()} />
      ) : !tokens.data?.length ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No agent tokens yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-base">
            <thead>
              <tr>
                <th>Token</th>
                <th>Application</th>
                <th className="text-right">Servers</th>
                <th>Last report</th>
                <th className="w-px" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {tokens.data.map((t) => (
                <tr key={t.id} className={cn(t.status === 'revoked' && 'opacity-60')}>
                  <td>
                    <p className="font-medium">{t.name}</p>
                    <p className="font-mono text-xs text-muted">{t.prefix}…</p>
                  </td>
                  <td className="text-sm">{where(t)}</td>
                  <td className="text-right text-sm tabular-nums">
                    {t.servers ? (
                      <Link to="/servers" className="hover:underline">
                        {t.servers}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="whitespace-nowrap text-sm" title={formatDateTime(t.lastSeenAt)}>
                    {t.status === 'revoked' ? <span className="text-muted">Revoked {timeAgo(t.revokedAt)}</span> : t.lastSeenAt ? timeAgo(t.lastSeenAt) : <span className="text-degraded">Never: install the agent</span>}
                  </td>
                  <td>
                    {t.status === 'active' && (
                      <Menu
                        actions={[
                          { label: 'Rotate token', onSelect: () => setRotating(t) },
                          { label: 'Revoke token', danger: true, onSelect: () => setRevoking(t) },
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

      {creating && (
        <CreateTokenDialog
          defaultApplicationId={scope.applicationId}
          onClose={() => setCreating(false)}
          onCreated={(r) => {
            refresh();
            setCreating(false);
            setRevealed(r);
          }}
        />
      )}
      {revealed && <TokenSecretDialog result={revealed} onClose={() => setRevealed(null)} />}
      <ConfirmDialog
        open={!!rotating}
        onClose={() => setRotating(null)}
        danger={false}
        title={`Rotate ${rotating?.name ?? ''}?`}
        body="You get a new token to put on each server. The current token keeps working for 24 hours."
        actionLabel="Rotate token"
        onConfirm={() =>
          critical(() => api.rotateAgentToken(rotating!.id)).then((r) => {
            refresh();
            setRevealed(r);
          })
        }
      />
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title={`Revoke ${revoking?.name ?? ''}?`}
        body={`Every server using it (${revoking?.servers ?? 0}) stops reporting immediately and shows as not reporting.`}
        actionLabel="Revoke token"
        confirmText="revoke"
        onConfirm={() =>
          critical(() => api.revokeAgentToken(revoking!.id)).then(() => {
            refresh();
            toast.success('Token revoked');
          })
        }
      />
    </section>
  );
}

function CreateTokenDialog({ defaultApplicationId, onClose, onCreated }: { defaultApplicationId?: string; onClose: () => void; onCreated: (r: AgentTokenSecret) => void }) {
  const critical = useCritical();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const [form, setForm] = useState<AgentTokenInput>({ name: '', applicationId: defaultApplicationId ?? '', environmentId: '' });
  const active = (apps.data ?? []).filter((a) => a.status === 'active');
  const app = active.find((a) => a.id === form.applicationId);
  const environmentId = app?.environments.some((e) => e.id === form.environmentId) ? form.environmentId : app?.environments[0]?.id ?? '';
  const envName = app?.environments.find((e) => e.id === environmentId)?.name ?? '';

  const create = useMutation({
    mutationFn: (input: AgentTokenInput) => critical(() => api.createAgentToken(input)),
    onSuccess: onCreated,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ ...form, environmentId, name: form.name || `${app?.name ?? ''} ${envName.toLowerCase()}` });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New agent token"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="token-form" variant="primary" loading={create.isPending} disabled={!environmentId}>
            Create token
          </Button>
        </>
      }
    >
      <form id="token-form" onSubmit={submit} className="space-y-4">
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
        <Field label="Name" hint="Optional.">
          {(id, d) => <Input id={id} aria-describedby={d} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={app ? `${app.name} ${envName.toLowerCase()}` : 'Payments production'} />}
        </Field>
        {create.error && !isReauthCancelled(create.error) && <InlineError error={create.error} />}
      </form>
    </Modal>
  );
}

function TokenSecretDialog({ result, onClose }: { result: AgentTokenSecret; onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <Modal
      open
      onClose={() => saved && onClose()}
      size="lg"
      title={`Install the agent with ${result.token.name}`}
      description="This is the only time the full token is shown. Run one of these on each server."
      footer={
        <Button variant="primary" onClick={onClose} disabled={!saved}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2 rounded border border-degraded/40 bg-degraded/10 px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-degraded" aria-hidden />
          <p>Anyone with this token can send data as these servers. Store it in your secrets manager, not in Git.</p>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Linux (systemd service)</p>
          <CodeBlock code={agentInstallSnippet(result.secret)} label="install command" />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Or as a Docker container</p>
          <CodeBlock code={agentDockerSnippet(result.secret)} label="docker command" />
          <p className="mt-1 text-xs text-muted">The host filesystem and Docker socket are mounted read-only so the agent can see disks, services and containers.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="accent-[rgb(var(--accent))]" />
          I've stored the token somewhere safe
        </label>
      </div>
    </Modal>
  );
}