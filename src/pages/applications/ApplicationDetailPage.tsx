import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Circle, Plus } from 'lucide-react';
import { api } from '@/api';
import type { Application, Asset } from '@/types';
import { cn } from '@/lib/cn';
import { ENV_TYPE_LABEL, formatDate } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { CriticalityMeter, HealthBadge } from '@/components/ui/Badge';
import { HealthRibbon } from '@/components/ui/HealthRibbon';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { PhaseNotice } from '@/components/PhaseNotice';
import { ConfirmDialog } from '@/components/security/ConfirmDialog';
import { useCritical } from '@/components/security/reauth';
import { AssetsTable } from '@/pages/assets/AssetsTable';
import { AddAssetModal } from '@/pages/assets/AddAssetModal';
import { VerificationModal } from '@/pages/assets/VerificationModal';
import { isAuthorized } from '@/lib/assets';
import { ApplicationFormModal } from './ApplicationFormModal';

export function ApplicationDetailPage() {
  const { id = '' } = useParams();
  const app = useQuery({ queryKey: ['application', id], queryFn: () => api.getApplication(id) });
  const assets = useQuery({ queryKey: ['assets', { applicationId: id }], queryFn: () => api.listAssets({ applicationId: id }) });

  if (app.isLoading) return <Spinner />;
  if (app.error) return <ErrorState error={app.error} onRetry={() => app.refetch()} />;
  const a = app.data!;
  const base = `/applications/${a.id}`;

  return (
    <>
      <PageHeader
        title={a.name}
        description={a.description}
        actions={a.status === 'archived' ? <span className="rounded border border-line px-2 py-1 text-xs text-muted">Archived</span> : undefined}
      >
        <Link to="/applications" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Applications
        </Link>
      </PageHeader>
      <div className="mb-6">
        <Tabs
          items={[
            { to: base, label: 'Overview', end: true },
            { to: `${base}/health`, label: 'Health' },
            { to: `${base}/errors`, label: 'Errors' },
            { to: `${base}/performance`, label: 'Performance' },
            { to: `${base}/infrastructure`, label: 'Infrastructure' },
            { to: `${base}/security`, label: 'Security' },
            { to: `${base}/assets`, label: 'Assets' },
            { to: `${base}/issues`, label: 'Issues' },
            { to: `${base}/settings`, label: 'Settings' },
          ]}
        />
      </div>
      <Routes>
        <Route index element={<Overview app={a} assets={assets.data ?? []} />} />
        <Route path="health" element={<PhaseNotice phase={2} title="Uptime and health checks" body="Each environment's monitors, response times and uptime history will appear here once availability monitoring is built." />} />
        <Route path="errors" element={<PhaseNotice phase={3} title="Errors and exceptions" body="Error groups from the ShieldOps SDK, with first seen, last seen and regressions, per environment." />} />
        <Route path="performance" element={<PhaseNotice phase={3} title="API performance" body="Request rate, error rate and p95 latency per route, sent by the SDK every 60 seconds." />} />
        <Route path="infrastructure" element={<PhaseNotice phase={4} title="Servers and containers" body="CPU, memory, disk, services and containers reported by the server agent." />} />
        <Route path="security" element={<PhaseNotice phase={2} title="Security posture" body="SSL, DNS, headers and security events start in phase 2 and 3; secrets and vulnerabilities in phase 5." />} />
        <Route path="assets" element={<AssetsTab app={a} assets={assets.data ?? []} loading={assets.isLoading} />} />
        <Route path="issues" element={<PhaseNotice phase={2} title="Alerts, findings and incidents" body="Everything open for this application, sorted by risk priority." />} />
        <Route path="settings" element={<SettingsTab app={a} />} />
      </Routes>
    </>
  );
}

function Overview({ app, assets }: { app: Application; assets: Asset[] }) {
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const health = dash.data?.healthByApp.find((h) => h.applicationId === app.id);
  const owner = users.data?.find((u) => u.id === app.ownerId);
  const verified = assets.length > 0 && assets.every((x) => isAuthorized(x.authorization));

  const steps = [
    { done: assets.length > 0, label: 'Add its assets', detail: 'Domains, websites, APIs, servers, databases and repositories.', to: `/applications/${app.id}/assets` },
    { done: verified, label: 'Prove you control them', detail: 'Unverified assets are never checked or scanned.', to: `/applications/${app.id}/assets` },
    { done: false, label: 'Turn on monitors', detail: 'Uptime, SSL, DNS and header checks.', phase: 2 },
    { done: false, label: 'Install the SDK', detail: 'Errors, performance and security events from the app itself.', phase: 3 },
    { done: false, label: 'Install the server agent', detail: 'CPU, memory, disk and services.', phase: 4 },
    { done: false, label: 'Connect its repository', detail: 'Secret and vulnerability scanning.', phase: 5 },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <section className="rounded-lg border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 font-semibold">Environments</h2>
          <ul className="divide-y divide-line">
            {app.environments.map((env) => {
              const isProdRibbon = health && health.environmentId === env.id;
              const envAssets = assets.filter((x) => x.environmentId === env.id).length;
              return (
                <li key={env.id} className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[160px_minmax(0,1fr)_110px]">
                  <div>
                    <p className="font-medium">{env.name}</p>
                    <p className="text-xs text-muted">
                      {env.name.toLowerCase() === ENV_TYPE_LABEL[env.type].toLowerCase() ? '' : `${ENV_TYPE_LABEL[env.type]}, `}
                      {envAssets} {envAssets === 1 ? 'asset' : 'assets'}
                    </p>
                  </div>
                  {isProdRibbon ? <HealthRibbon ticks={health.ticks} /> : <p className="text-xs text-muted">No monitors yet</p>}
                  <HealthBadge state={isProdRibbon ? health.state : 'unknown'} className="sm:justify-self-end" />
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-lg border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 font-semibold">Setup</h2>
          <ol className="divide-y divide-line">
            {steps.map((s) => (
              <li key={s.label} className="flex items-start gap-3 px-4 py-3">
                <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', s.done ? 'border-up bg-up text-white' : 'border-line text-muted')}>
                  {s.done ? <Check className="h-3 w-3" aria-hidden /> : <Circle className="h-2 w-2 fill-current" aria-hidden />}
                </span>
                <div className="flex-1">
                  <p className={cn('font-medium', s.done && 'text-muted')}>
                    {s.to && !s.done ? (
                      <Link to={s.to} className="hover:underline">
                        {s.label}
                      </Link>
                    ) : (
                      s.label
                    )}
                    <span className="sr-only">{s.done ? ' (done)' : ' (not done)'}</span>
                  </p>
                  <p className="text-xs text-muted">{s.detail}</p>
                </div>
                {s.phase && <span className="text-2xs text-muted">Phase {s.phase}</span>}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="h-fit rounded-lg border border-line bg-surface p-4">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Criticality</dt>
            <dd className="mt-0.5">
              <CriticalityMeter value={app.criticality} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Owner</dt>
            <dd className="mt-0.5">{owner?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Tech stack</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {app.techStack.length ? app.techStack.map((t) => <span key={t} className="rounded bg-sunken px-1.5 py-0.5 text-xs">{t}</span>) : '—'}
            </dd>
          </div>
          {app.tags.length > 0 && (
            <div>
              <dt className="text-xs text-muted">Tags</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {app.tags.map((t) => (
                  <span key={t} className="rounded border border-line px-1.5 py-0.5 text-xs">
                    {t}
                  </span>
                ))}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">Registered</dt>
            <dd className="mt-0.5">{formatDate(app.createdAt)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}

function AssetsTab({ app, assets, loading }: { app: Application; assets: Asset[]; loading: boolean }) {
  const [adding, setAdding] = useState(false);
  const [verifyNew, setVerifyNew] = useState<Asset | null>(null);
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" onClick={() => setAdding(true)} disabled={app.status === 'archived'}>
          <Plus className="h-4 w-4" aria-hidden />
          Add asset
        </Button>
      </div>
      {loading ? (
        <Spinner />
      ) : assets.length === 0 ? (
        <EmptyState title="No assets for this application" body="Add its domain first. ShieldOps suggests checks for each asset you add." />
      ) : (
        <AssetsTable assets={assets} showApplication={false} />
      )}
      <AddAssetModal open={adding} onClose={() => setAdding(false)} defaultApplicationId={app.id} onCreated={(a) => a.authorization.status === 'pending' && setVerifyNew(a)} />
      <VerificationModal asset={verifyNew} onClose={() => setVerifyNew(null)} />
    </>
  );
}

function SettingsTab({ app }: { app: Application }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const critical = useCritical();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const archive = useMutation({
    mutationFn: () => api.setApplicationStatus(app.id, app.status === 'archived' ? 'active' : 'archived'),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['application', a.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(a.status === 'archived' ? `${a.name} archived` : `${a.name} restored`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = [
    {
      title: 'Details and environments',
      body: 'Name, owner, criticality, tech stack and environments.',
      action: <Button onClick={() => setEditing(true)}>Edit details</Button>,
    },
    {
      title: app.status === 'archived' ? 'Restore application' : 'Archive application',
      body: app.status === 'archived' ? 'Show it on the dashboard again and resume its monitors.' : 'Hide it from the dashboard and pause its monitors. History is kept.',
      action: (
        <Button onClick={() => archive.mutate()} loading={archive.isPending}>
          {app.status === 'archived' ? 'Restore' : 'Archive'}
        </Button>
      ),
    },
    {
      title: 'Delete application',
      body: 'Removes it and all its assets. You can restore it within 30 days. Everyone on the team is notified.',
      action: (
        <Button variant="danger" onClick={() => setDeleting(true)}>
          Delete
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="divide-y divide-line rounded-lg border border-line bg-surface">
        {rows.map((r) => (
          <div key={r.title} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{r.title}</p>
              <p className="text-sm text-muted">{r.body}</p>
            </div>
            {r.action}
          </div>
        ))}
      </div>
      <ApplicationFormModal open={editing} onClose={() => setEditing(false)} application={app} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${app.name}?`}
        body="This removes the application and all its assets from ShieldOps. You can restore it within 30 days."
        actionLabel="Delete application"
        confirmText={app.name}
        onConfirm={() =>
          critical(() => api.deleteApplication(app.id)).then(() => {
            qc.invalidateQueries({ queryKey: ['applications'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            qc.invalidateQueries({ queryKey: ['assets'] });
            toast.success(`${app.name} deleted`);
            navigate('/applications');
          })
        }
      />
    </>
  );
}