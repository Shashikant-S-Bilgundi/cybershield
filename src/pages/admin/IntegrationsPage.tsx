import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { Integration, IntegrationType } from '@/types';
import { cn } from '@/lib/cn';
import { formatDateTime, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { ConfirmDialog } from '@/components/security/ConfirmDialog';
import { isReauthCancelled, useCritical } from '@/components/security/reauth';

const META: Record<IntegrationType, { name: string; purpose: string }> = {
  github: { name: 'GitHub', purpose: 'Reads repositories for secret and dependency scans. Installed as a GitHub App with read-only access.' },
  ghcr: { name: 'GitHub Container Registry', purpose: 'Pulls images from ghcr.io for Trivy scans, through the same GitHub App.' },
  dockerhub: { name: 'Docker Hub', purpose: 'Pulls images from docker.io for Trivy scans, with a read-only access token.' },
  smtp: { name: 'Email (SMTP)', purpose: 'Sends alerts, invites and reports.' },
  slack: { name: 'Slack', purpose: 'Sends alerts to a channel.' },
  webhook: { name: 'Webhook', purpose: 'Sends alerts as JSON to your own endpoint.' },
  jira: { name: 'Jira', purpose: 'Creates tickets from incidents and remediation tasks.' },
  cloudflare: { name: 'Cloudflare', purpose: 'Imports DNS zones and domains as assets.' },
  aws: { name: 'AWS', purpose: 'Imports EC2, RDS and S3 resources as assets.' },
  google: {
    name: 'Google Workspace',
    purpose: 'Identity checks: admins without 2-step verification, mail forwarding, unused accounts. Single sign-on is set up in System settings.',
  },
  entra: { name: 'Microsoft Entra ID', purpose: 'Identity checks for Microsoft 365 accounts. Single sign-on is set up in System settings.' },
};

/** What GitHub's return trip means, after the app installation (?github=… on the way back). */
const GITHUB_RETURN: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'GitHub connected. Add repositories to start scanning.' },
  requested: { ok: true, text: 'Installation requested. A GitHub organisation owner needs to approve it.' },
  cancelled: { ok: false, text: 'The GitHub App was not installed.' },
  expired: { ok: false, text: 'That GitHub sign-in took too long or came from another session. Start again.' },
  error: { ok: false, text: 'GitHub could not confirm the installation. Try again, or check the server log.' },
};

export function IntegrationsPage() {
  const integrations = useQuery({ queryKey: ['integrations'], queryFn: api.listIntegrations });
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const r = GITHUB_RETURN[params.get('github') ?? ''];
    if (!r) return;
    if (r.ok) toast.success(r.text);
    else toast.error(r.text);
    setParams({}, { replace: true });
  }, [params, setParams]);
  const now = (integrations.data ?? []).filter((i) => !i.availableInPhase);
  const soon = (integrations.data ?? []).filter((i) => i.availableInPhase);

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connections to other services. Credentials are encrypted, never shown again after you enter them, and deleted when you disconnect."
      />
      {integrations.isLoading ? (
        <Spinner />
      ) : integrations.error ? (
        <ErrorState error={integrations.error} onRetry={() => integrations.refetch()} />
      ) : (
        <div className="space-y-8">
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {now.map((i) => (
              <IntegrationRow key={i.type} integration={i} github={integrations.data!.find((x) => x.type === 'github')!} />
            ))}
          </ul>
          {soon.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">Coming later</h2>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {soon.map((i) => (
                  <li key={i.type} className="rounded-lg border border-dashed border-line px-4 py-3">
                    <p className="font-medium">{META[i.type].name}</p>
                    <p className="text-sm text-muted">{META[i.type].purpose}</p>
                    <p className="mt-1 text-xs text-muted">Phase {i.availableInPhase}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function IntegrationRow({ integration: i, github }: { integration: Integration; github: Integration }) {
  const qc = useQueryClient();
  const critical = useCritical();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const connected = i.status === 'connected';
  const refresh = () => ['integrations', 'repositories', 'images'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const test = useMutation({
    mutationFn: () => api.testIntegration(i.type),
    onSuccess: (r) => (r.ok ? toast.success(r.detail) : toast.error(r.detail)),
    onError: (e) => toast.error((e as Error).message),
  });

  const action = () => {
    if (i.type === 'smtp')
      return (
        <Link to="/settings">
          <Button size="sm">Email settings</Button>
        </Link>
      );
    if (i.type === 'ghcr') return <span className="text-xs text-muted">{connected ? 'Managed by the GitHub App' : 'Connect GitHub to enable'}</span>;
    if (connected && (i.type === 'slack' || i.type === 'webhook'))
      return (
        <div className="flex gap-1">
          <Button size="sm" onClick={() => test.mutate()} loading={test.isPending}>
            Send test
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDisconnecting(true)}>
            Disconnect
          </Button>
        </div>
      );
    if (connected)
      return (
        <Button size="sm" variant="ghost" onClick={() => setDisconnecting(true)}>
          Disconnect
        </Button>
      );
    return (
      <Button size="sm" variant="primary" onClick={() => setConnecting(true)}>
        Connect
      </Button>
    );
  };

  return (
    <li className="flex flex-wrap items-start gap-x-6 gap-y-2 px-4 py-4">
      <div className="min-w-[240px] flex-1">
        <p className="font-medium">{META[i.type].name}</p>
        <p className="text-sm text-muted">{META[i.type].purpose}</p>
        {connected && i.scopes.length > 0 && <p className="mt-1 text-xs text-muted">Access: {i.scopes.join(', ')}</p>}
      </div>
      <div className="w-56 text-sm">
        <p className={cn('font-medium', connected ? 'text-up' : i.status === 'error' ? 'text-down' : 'text-muted')}>
          {connected ? `Connected${i.account ? ` to ${i.account}` : ''}` : i.status === 'error' ? 'Needs attention' : 'Not connected'}
        </p>
        {i.lastSyncAt && (
          <p className="text-xs text-muted" title={formatDateTime(i.lastSyncAt)}>
            Last synced {timeAgo(i.lastSyncAt)}
          </p>
        )}
        {i.error && <p className="text-xs text-down">{i.error}</p>}
      </div>
      <div className="flex w-40 justify-end">{action()}</div>

      {connecting && i.type === 'github' && <GithubConnect onClose={() => setConnecting(false)} onDone={refresh} />}
      {connecting && FIELDS[i.type] && <CredentialConnect type={i.type} onClose={() => setConnecting(false)} onDone={refresh} />}
      {connecting && i.type === 'dockerhub' && <DockerHubConnect onClose={() => setConnecting(false)} onDone={refresh} />}
      {connecting && (i.type === 'slack' || i.type === 'webhook') && <AlertChannelConnect type={i.type} onClose={() => setConnecting(false)} onDone={refresh} />}
      <ConfirmDialog
        open={disconnecting}
        onClose={() => setDisconnecting(false)}
        title={`Disconnect ${META[i.type].name}?`}
        body={
          i.type === 'github'
            ? 'Repository scans and GitHub Container Registry image scans stop until you reconnect. Existing findings stay. Uninstall the GitHub App in GitHub too if you no longer need it.'
            : i.type === 'slack' || i.type === 'webhook'
              ? 'Alert rules stop sending to it straight away. Other channels keep working.'
              : 'Image scans from this registry stop until you reconnect. The stored token is deleted.'
        }
        actionLabel="Disconnect"
        confirmText={i.type === 'github' ? (github.account ?? 'disconnect') : 'disconnect'}
        onConfirm={() =>
          critical(() => api.disconnectIntegration(i.type)).then(() => {
            refresh();
            toast.success(`${META[i.type].name} disconnected`);
          })
        }
      />
    </li>
  );
}

function GithubConnect({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const critical = useCritical();
  const connect = useMutation({
    mutationFn: () => critical(() => api.connectIntegration('github')),
    onSuccess: (result) => {
      // The real backend sends you to GitHub to install the app; GitHub brings you back here.
      if (result.redirectUrl) return void window.location.assign(result.redirectUrl);
      onDone();
      toast.success('GitHub connected. Add repositories to start scanning.');
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Connect GitHub"
      description="You'll be sent to GitHub to install the ShieldOps app on your organisation, then brought back here."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => connect.mutate()} loading={connect.isPending}>
            Continue to GitHub
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="font-medium">The app asks for read-only access to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Repository contents, to scan code and history</li>
          <li>Metadata, to list repositories and branches</li>
          <li>Packages, to pull images from ghcr.io</li>
        </ul>
        <p className="text-muted">It cannot push code, open pull requests, change settings or run workflows. You choose which repositories it can see.</p>
        {connect.error && !isReauthCancelled(connect.error) && <InlineError error={connect.error} />}
      </div>
    </Modal>
  );
}

function DockerHubConnect({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const critical = useCritical();
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const connect = useMutation({
    mutationFn: () => critical(() => api.connectIntegration('dockerhub', { username, token })),
    onSuccess: () => {
      onDone();
      toast.success('Docker Hub connected');
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    connect.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Connect Docker Hub"
      description="Create a personal access token in Docker Hub with read-only (public repo read-only, or read-only) permission."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="dh-form" variant="primary" loading={connect.isPending} disabled={!username || !token}>
            Connect
          </Button>
        </>
      }
    >
      <form id="dh-form" onSubmit={submit} className="space-y-4" autoComplete="off">
        <Field label="Docker Hub username">{(id) => <Input id={id} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />}</Field>
        <Field label="Read-only access token">
          {(id) => <Input id={id} type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" placeholder="dckr_pat_…" />}
        </Field>
        {connect.error && !isReauthCancelled(connect.error) && <InlineError error={connect.error} />}
      </form>
    </Modal>
  );
}

const SAMPLE_PAYLOAD = `{
  "event": "alert.opened",
  "alert": {
    "id": "al_8f2c",
    "title": "Field API health is down",
    "severity": "critical",
    "application": "Field Ops Backend",
    "environment": "Production",
    "url": "https://shieldops.example.com/alerts"
  },
  "sent_at": "2026-11-18T10:42:07Z"
}`;

function AlertChannelConnect({ type, onClose, onDone }: { type: 'slack' | 'webhook'; onClose: () => void; onDone: () => void }) {
  const critical = useCritical();
  const [url, setUrl] = useState('');
  const [channel, setChannel] = useState('it-alerts');
  const [secret, setSecret] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const connect = useMutation({
    mutationFn: () => critical(() => api.connectIntegration(type, type === 'slack' ? { url, channel } : { url })),
    onSuccess: (r) => {
      onDone();
      if (r.secret) setSecret(r.secret);
      else {
        toast.success('Slack connected. Choose it on the alert rules that should post there.');
        onClose();
      }
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    connect.mutate();
  };

  if (secret) {
    return (
      <Modal
        open
        onClose={() => saved && onClose()}
        size="lg"
        title="Copy the signing secret"
        description="This is the only time it is shown. Use it to check that requests really come from ShieldOps."
        footer={
          <Button variant="primary" onClick={onClose} disabled={!saved}>
            Done
          </Button>
        }
      >
        <div className="space-y-4 text-sm">
          <CodeBlock code={secret} label="signing secret" />
          <p>
            Every request carries a <code className="font-mono text-xs">ShieldOps-Signature</code> header: an HMAC-SHA256 of the raw body using this secret. Reject requests where
            it does not match.
          </p>
          <div>
            <p className="mb-1 font-medium">Example body</p>
            <CodeBlock code={SAMPLE_PAYLOAD} label="example body" />
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="accent-[rgb(var(--accent))]" />
            I've stored the secret somewhere safe
          </label>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={type === 'slack' ? 'Connect Slack' : 'Connect a webhook'}
      description={
        type === 'slack'
          ? 'In Slack, add an Incoming Webhook to the channel that should receive alerts, then paste its URL here.'
          : 'ShieldOps sends a signed JSON POST to this URL for each alert. Only https URLs are accepted.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="channel-form" variant="primary" loading={connect.isPending} disabled={!url.trim()}>
            Connect
          </Button>
        </>
      }
    >
      <form id="channel-form" onSubmit={submit} className="space-y-4" autoComplete="off">
        <Field
          label={type === 'slack' ? 'Incoming webhook URL' : 'Endpoint URL'}
          hint={type === 'slack' ? 'Stored encrypted. Anyone with this URL can post to the channel.' : undefined}
        >
          {(id, d) => (
            <Input
              id={id}
              aria-describedby={d}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={type === 'slack' ? 'https://hooks.slack.com/services/…' : 'https://ops.example.com/hooks/shieldops'}
              className="font-mono text-xs"
            />
          )}
        </Field>
        {type === 'slack' && (
          <Field label="Channel name" hint="Shown in ShieldOps so people know where alerts go.">
            {(id, d) => <Input id={id} aria-describedby={d} value={channel} onChange={(e) => setChannel(e.target.value)} />}
          </Field>
        )}
        {connect.error && !isReauthCancelled(connect.error) && <InlineError error={connect.error} />}
      </form>
    </Modal>
  );
}

interface CredField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
}

const FIELDS: Partial<Record<IntegrationType, { help: string; fields: CredField[] }>> = {
  jira: {
    help: 'Create an API token at id.atlassian.com under Security. ShieldOps only creates and reads issues in the one project you name.',
    fields: [
      { key: 'siteUrl', label: 'Jira site', placeholder: 'https://your-team.atlassian.net' },
      { key: 'email', label: 'Account email', placeholder: 'it-bot@example.com' },
      { key: 'apiToken', label: 'API token', secret: true },
      { key: 'projectKey', label: 'Project key', placeholder: 'SEC' },
    ],
  },
  cloudflare: {
    help: 'In Cloudflare, create an API token from the read-only template with Zone: Read and DNS: Read for all zones.',
    fields: [{ key: 'apiToken', label: 'API token', secret: true }],
  },
  aws: {
    help: 'Create an IAM role that trusts the ShieldOps AWS account with the external ID below, and attach only the AWS-managed SecurityAudit policy. No keys are stored.',
    fields: [{ key: 'roleArn', label: 'Role ARN', placeholder: 'arn:aws:iam::123456789012:role/ShieldOpsReadOnly' }],
  },
  google: {
    help: 'Create a service account with domain-wide delegation for the read-only Admin SDK scopes (admin.directory.user.readonly, admin.reports.audit.readonly).',
    fields: [
      { key: 'domain', label: 'Workspace domain', placeholder: 'example.com' },
      { key: 'adminEmail', label: 'Admin to act as', placeholder: 'admin@example.com' },
      { key: 'serviceAccountKey', label: 'Service account key (JSON)', secret: true },
    ],
  },
  entra: {
    help: 'Register an app in Entra ID with the Directory.Read.All and AuditLog.Read.All application permissions, and grant admin consent.',
    fields: [
      { key: 'tenantId', label: 'Tenant ID', placeholder: '00000000-0000-0000-0000-000000000000' },
      { key: 'clientId', label: 'Application (client) ID' },
      { key: 'clientSecret', label: 'Client secret', secret: true },
    ],
  },
};

function CredentialConnect({ type, onClose, onDone }: { type: IntegrationType; onClose: () => void; onDone: () => void }) {
  const critical = useCritical();
  const conf = FIELDS[type]!;
  const [values, setValues] = useState<Record<string, string>>({});
  const [externalId] = useState(() => `shieldops-${Math.random().toString(36).slice(2, 10)}`);
  const connect = useMutation({
    mutationFn: () => critical(() => api.connectIntegration(type, type === 'aws' ? { ...values, externalId } : values)),
    onSuccess: () => {
      onDone();
      toast.success(`${META[type].name} connected`);
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    connect.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Connect ${META[type].name}`}
      description={conf.help}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="cred-form" variant="primary" loading={connect.isPending} disabled={conf.fields.some((f) => !values[f.key]?.trim())}>
            Connect
          </Button>
        </>
      }
    >
      <form id="cred-form" onSubmit={submit} className="space-y-4" autoComplete="off">
        {type === 'aws' && (
          <div>
            <p className="mb-1 text-sm font-medium">External ID for the trust policy</p>
            <CodeBlock code={externalId} label="external ID" />
          </div>
        )}
        {conf.fields.map((f) => (
          <Field key={f.key} label={f.label}>
            {(id) => (
              <Input
                id={id}
                type={f.secret ? 'password' : 'text'}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                autoComplete={f.secret ? 'new-password' : 'off'}
                className="font-mono text-xs"
              />
            )}
          </Field>
        ))}
        {connect.error && !isReauthCancelled(connect.error) && <InlineError error={connect.error} />}
      </form>
    </Modal>
  );
}