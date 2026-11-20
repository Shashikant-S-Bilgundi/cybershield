import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Lock, Plus } from 'lucide-react';
import { api, type AddRepositoriesInput } from '@/api';
import type { Repository } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { LastScan, SeverityChips } from '@/components/ui/ScanLabels';
import { EmptyState, ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';

/** What the last scan can vouch for. A failed scanner means "not known", never "none". */
function coverage(r: Repository) {
  const s = r.lastScan;
  const failed = (name: string) => (!s || s.status === 'queued' || s.status === 'running' ? false : s.runs.some((x) => x.scanner === name && x.status === 'failed'));
  return { secretsUnknown: !s || failed('gitleaks'), vulnsUnknown: !s || (failed('osv') && failed('trivy')) };
}

export function RepositoriesTable({ repos, showApplication = true }: { repos: Repository[]; showApplication?: boolean }) {
  const navigate = useNavigate();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '—';
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="table-base">
        <thead>
          <tr>
            <th>Repository</th>
            {showApplication && <th>Application</th>}
            <th>Last scan</th>
            <th>Secrets</th>
            <th>Vulnerabilities</th>
            <th>Scans</th>
          </tr>
        </thead>
        <tbody>
          {repos.map((r) => {
            const cov = coverage(r);
            return (
              <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/repositories/${r.id}`)}>
                <td>
                  <Link
                    to={`/repositories/${r.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 font-mono text-[13px] font-medium hover:underline"
                  >
                    {r.fullName}
                    {!r.private && <span className="rounded border border-degraded/40 px-1 font-sans text-2xs font-semibold text-degraded">Public</span>}
                  </Link>
                  <p className="text-xs text-muted">
                    {r.language}, {r.dependencies} dependencies, branch {r.defaultBranch}
                  </p>
                </td>
                {showApplication && <td className="text-sm">{appName(r.applicationId)}</td>}
                <td>
                  <LastScan scan={r.lastScan} />
                </td>
                <td className={cn('text-sm tabular-nums', r.openSecrets > 0 ? 'font-semibold text-crit' : cov.secretsUnknown ? 'text-degraded' : 'text-muted')}>
                  {r.openSecrets > 0 ? `${r.openSecrets} exposed` : cov.secretsUnknown ? 'Unknown' : 'None open'}
                  {cov.secretsUnknown && r.lastScan && <p className="text-xs font-normal text-degraded">Gitleaks did not finish</p>}
                </td>
                <td>
                  {cov.vulnsUnknown && !Object.values(r.vulns).some(Boolean) ? <span className="text-sm text-degraded">Unknown</span> : <SeverityChips counts={r.vulns} />}
                  {cov.vulnsUnknown && r.lastScan && <p className="text-xs text-degraded">Dependency scan did not finish</p>}
                </td>
                <td className="text-xs text-muted">{[r.scanOnPush && 'On push', r.dailyScan && 'Daily'].filter(Boolean).join(', ') || 'Manual only'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RepositoriesPage() {
  const scope = useScope();
  const [adding, setAdding] = useState(false);
  const repos = useQuery({
    queryKey: ['repositories', scope],
    queryFn: () => api.listRepositories(scope),
    refetchInterval: (q) => (q.state.data?.some((r) => r.lastScan?.status === 'queued' || r.lastScan?.status === 'running') ? 2000 : 60_000),
  });
  const integrations = useQuery({ queryKey: ['integrations'], queryFn: api.listIntegrations });
  const github = integrations.data?.find((i) => i.type === 'github');
  const failing = (repos.data ?? []).filter((r) => r.lastScan && (r.lastScan.status === 'failed' || r.lastScan.status === 'partial')).length;

  return (
    <>
      <PageHeader
        title="Repositories"
        description={
          github && github.status !== 'connected'
            ? 'GitHub is not connected, so repositories cannot be scanned.'
            : failing
              ? `${failing} ${failing === 1 ? "repository's" : "repositories'"} last scan did not fully finish. Their results may be incomplete.`
              : 'Code from GitHub, scanned for secrets with Gitleaks and for vulnerable dependencies with OSV and Trivy. ShieldOps clones read-only and never runs your code.'
        }
        actions={
          <Button variant="primary" onClick={() => setAdding(true)} disabled={github?.status !== 'connected'}>
            <Plus className="h-4 w-4" aria-hidden />
            Add repositories
          </Button>
        }
      />
      {github && github.status !== 'connected' && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 text-sm">
          <p>Connect GitHub with a read-only GitHub App to add and scan repositories.</p>
          <Link to="/integrations">
            <Button>Go to Integrations</Button>
          </Link>
        </div>
      )}
      {repos.isLoading ? (
        <Spinner />
      ) : repos.error ? (
        <ErrorState error={repos.error} onRetry={() => repos.refetch()} />
      ) : !repos.data?.length ? (
        <EmptyState
          icon={<GitBranch className="h-6 w-6" />}
          title="No repositories yet"
          body="Add the repositories behind each application. The first scan starts straight away."
        />
      ) : (
        <RepositoriesTable repos={repos.data} />
      )}
      {adding && <AddRepositoriesDialog defaultApplicationId={scope.applicationId} onClose={() => setAdding(false)} />}
    </>
  );
}

function AddRepositoriesDialog({ defaultApplicationId, onClose }: { defaultApplicationId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const available = useQuery({ queryKey: ['available-repos'], queryFn: api.listAvailableRepositories });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const [picked, setPicked] = useState<string[]>([]);
  const [applicationId, setApplicationId] = useState(defaultApplicationId ?? '');
  const [envId, setEnvId] = useState('');
  const active = (apps.data ?? []).filter((a) => a.status === 'active');
  const app = active.find((a) => a.id === applicationId);
  const environmentId = app?.environments.some((e) => e.id === envId) ? envId : ((app?.environments.find((e) => e.type === 'production') ?? app?.environments[0])?.id ?? '');

  const add = useMutation({
    mutationFn: (input: AddRepositoriesInput) => api.addRepositories(input),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['repositories'] });
      qc.invalidateQueries({ queryKey: ['available-repos'] });
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success(`${r.length} ${r.length === 1 ? 'repository' : 'repositories'} added. First scans have started.`);
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate({ fullNames: picked, applicationId, environmentId });
  };
  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Add repositories"
      description="These are the repositories the ShieldOps GitHub App can read. To add more, change the app's repository access in GitHub."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="repo-form" variant="primary" loading={add.isPending} disabled={!picked.length || !environmentId}>
            Add {picked.length || ''} and scan
          </Button>
        </>
      }
    >
      <form id="repo-form" onSubmit={submit} className="space-y-4">
        {available.isLoading ? (
          <Spinner />
        ) : available.error ? (
          <InlineError error={available.error} />
        ) : !available.data?.length ? (
          <p className="text-sm text-muted">Every repository the app can see is already added.</p>
        ) : (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Repositories</legend>
            <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded border border-line">
              {available.data.map((r) => (
                <li key={r.fullName}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-sunken/60">
                    <input type="checkbox" checked={picked.includes(r.fullName)} onChange={() => toggle(r.fullName)} className="accent-[rgb(var(--accent))]" />
                    <span className="flex-1 font-mono text-xs">{r.fullName}</span>
                    <span className="text-xs text-muted">{r.language}</span>
                    {r.private ? <Lock className="h-3.5 w-3.5 text-muted" aria-label="Private" /> : <span className="text-2xs font-semibold text-degraded">Public</span>}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Application">
            {(id) => (
              <Select id={id} value={applicationId} onChange={(e) => setApplicationId(e.target.value)} required>
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
          <Field label="Environment" hint="Usually the one this code is deployed to.">
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={environmentId} onChange={(e) => setEnvId(e.target.value)} disabled={!app}>
                {(app?.environments ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <InlineError error={add.error} />
      </form>
    </Modal>
  );
}