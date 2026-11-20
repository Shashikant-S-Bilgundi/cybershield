import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '@/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { SeverityChips } from '@/components/ui/ScanLabels';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { ConfirmDialog } from '@/components/security/ConfirmDialog';
import { useCritical } from '@/components/security/reauth';
import { FindingsTable } from '@/pages/operations/FindingsTable';
import { ScanHistory } from './ScanHistory';

export function RepositoryDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const critical = useCritical();
  const [removing, setRemoving] = useState(false);
  const repo = useQuery({ queryKey: ['repository', id], queryFn: () => api.getRepository(id) });
  const scans = useQuery({
    queryKey: ['scans', 'repository', id],
    queryFn: () => api.listScans('repository', id),
    refetchInterval: (q) => (q.state.data?.[0]?.status === 'queued' || q.state.data?.[0]?.status === 'running' ? 1500 : 60_000),
  });
  const assetId = repo.data?.assetId;
  const findings = useQuery({ queryKey: ['findings', { assetId, status: 'active' }], queryFn: () => api.listFindings({ assetId, status: 'active' }), enabled: !!assetId });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });

  const refresh = () => {
    ['repository', 'repositories', 'scans', 'findings'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
  // When a running scan finishes, reload the repository and its findings once.
  const latestStatus = scans.data?.[0]?.status;
  const prevStatus = useRef(latestStatus);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = latestStatus;
    if ((was === 'queued' || was === 'running') && latestStatus !== 'queued' && latestStatus !== 'running') {
      ['repository', 'repositories', 'findings'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    }
  }, [latestStatus, qc]);

  const scan = useMutation({
    mutationFn: () => api.startScan('repository', id),
    onSuccess: () => {
      refresh();
      toast.success('Scan queued');
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const schedule = useMutation({
    mutationFn: (input: { scanOnPush?: boolean; dailyScan?: boolean }) => api.updateRepository(id, input),
    onSuccess: (r) => qc.setQueryData(['repository', id], r),
  });

  if (repo.isLoading) return <Spinner />;
  if (repo.error) return <ErrorState error={repo.error} onRetry={() => repo.refetch()} />;
  const r = repo.data!;
  const app = apps.data?.find((a) => a.id === r.applicationId);
  const scanBusy = scans.data?.[0]?.status === 'queued' || scans.data?.[0]?.status === 'running';

  return (
    <>
      <PageHeader
        title={r.fullName}
        description={`${r.private ? 'Private' : 'Public'} repository, ${r.language}, ${r.dependencies} dependencies, scanning branch ${r.defaultBranch}`}
        actions={
          <>
            <Button onClick={() => scan.mutate()} loading={scan.isPending || scanBusy}>
              {!(scan.isPending || scanBusy) && <RefreshCw className="h-4 w-4" aria-hidden />}
              {scanBusy ? 'Scanning' : 'Scan now'}
            </Button>
            <a href={`https://github.com/${r.fullName}`} target="_blank" rel="noreferrer">
              <Button variant="ghost">
                GitHub <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </a>
            <Menu actions={[{ label: 'Remove repository', danger: true, onSelect: () => setRemoving(true) }]} />
          </>
        }
      >
        <Link to="/repositories" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Repositories
        </Link>
      </PageHeader>

      {!r.private && (
        <p className="mb-5 rounded-lg border border-degraded/40 bg-degraded/10 px-4 py-3 text-sm">
          This repository is public. Anything committed here, including history, can be read by anyone, so secrets found here are treated as exposed to the internet.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-3 font-semibold">Open findings</h2>
            {findings.isLoading ? <Spinner /> : !findings.data?.length ? <EmptyState title="No open findings" body="Nothing open from the latest complete scan." /> : <FindingsTable findings={findings.data} showApplication={false} />}
          </section>
          <section className="rounded-lg border border-line bg-surface">
            <h2 className="border-b border-line px-4 py-3 font-semibold">Scan history</h2>
            <div className="overflow-x-auto">{scans.isLoading ? <Spinner /> : <ScanHistory scans={scans.data ?? []} />}</div>
          </section>
        </div>
        <aside className="space-y-4">
          <section className="space-y-3 rounded-lg border border-line bg-surface p-4 text-sm">
            <div>
              <p className="text-xs text-muted">Exposed secrets</p>
              <p className={r.openSecrets ? 'text-lg font-semibold text-crit' : 'text-lg font-semibold'}>{r.openSecrets}</p>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">Vulnerabilities</p>
              <SeverityChips counts={r.vulns} />
            </div>
            <div>
              <p className="text-xs text-muted">Application</p>
              {app ? (
                <Link to={`/applications/${app.id}/security`} className="hover:underline">
                  {app.name}
                </Link>
              ) : (
                '—'
              )}
            </div>
            <div>
              <p className="text-xs text-muted">Added</p>
              <p title={formatDateTime(r.addedAt)}>{timeAgo(r.addedAt)}</p>
            </div>
          </section>
          <section className="space-y-2 rounded-lg border border-line bg-surface p-4 text-sm">
            <h2 className="font-semibold">Scan automatically</h2>
            {(
              [
                ['scanOnPush', 'On every push to ' + r.defaultBranch],
                ['dailyScan', 'Once a day, to catch newly published CVEs'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={r[k]} onChange={(e) => schedule.mutate({ [k]: e.target.checked })} className="mt-0.5 accent-[rgb(var(--accent))]" />
                {label}
              </label>
            ))}
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title={`Remove ${r.fullName}?`}
        body="Scanning stops and its open findings are closed. The repository on GitHub is not touched."
        actionLabel="Remove repository"
        confirmText={r.fullName.split('/')[1]}
        onConfirm={() =>
          critical(() => api.removeRepository(r.id)).then(() => {
            refresh();
            toast.success('Repository removed');
            navigate('/repositories');
          })
        }
      />
    </>
  );
}