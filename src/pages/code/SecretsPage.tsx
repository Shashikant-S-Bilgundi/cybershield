import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { api } from '@/api';
import type { SecretDetail } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { FindingStatusText, PriorityBadge } from '@/components/ui/StatusLabels';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';

export function SecretsPage() {
  const scope = useScope();
  const navigate = useNavigate();
  const [view, setView] = useState<'active' | 'all'>('active');
  const filter = { ...scope, source: 'secrets' as const, status: view === 'active' ? ('active' as const) : undefined };
  const findings = useQuery({ queryKey: ['findings', filter], queryFn: () => api.listFindings(filter) });
  const live = (findings.data ?? []).filter((f) => (f.code as SecretDetail | undefined)?.inCurrentCode && !['resolved', 'verified', 'false_positive', 'accepted_risk'].includes(f.status)).length;

  return (
    <>
      <PageHeader
        title="Secrets and credentials"
        description={live ? `${live} exposed ${live === 1 ? 'secret is' : 'secrets are'} still in the current code.` : 'Keys, passwords and tokens that Gitleaks found in your repositories. Values are always masked.'}
      />
      <div className="mb-5 flex gap-3 rounded-lg border border-line bg-surface p-4 text-sm">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-crit" aria-hidden />
        <p>
          <span className="font-medium">Rotate first, then clean up.</span>{' '}
          <span className="text-muted">
            Once a secret is pushed, assume it has been copied. Deactivate or regenerate it with the provider, then remove it from the code. Removing it from Git history alone does not make it safe.
          </span>
        </p>
      </div>
      <div className="mb-4 flex gap-1 rounded border border-line p-0.5 sm:w-fit" role="tablist">
        {(
          [
            ['active', 'Open'],
            ['all', 'All, including fixed'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn('rounded-[4px] px-2.5 py-1 text-xs font-medium', view === k ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')}>
            {label}
          </button>
        ))}
      </div>
      {findings.isLoading ? (
        <Spinner />
      ) : findings.error ? (
        <ErrorState error={findings.error} onRetry={() => findings.refetch()} />
      ) : !findings.data?.length ? (
        <EmptyState
          icon={<KeyRound className="h-6 w-6" />}
          title={view === 'active' ? 'No exposed secrets' : 'No secrets found yet'}
          body={
            <>
              Secrets are found by scanning{' '}
              <Link to="/repositories" className="text-accent hover:underline">
                repositories
              </Link>
              .
            </>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-base">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Secret</th>
                <th>Where</th>
                <th>In current code</th>
                <th>Status</th>
                <th>Committed</th>
              </tr>
            </thead>
            <tbody>
              {findings.data.map((f) => {
                const d = f.code as SecretDetail;
                return (
                  <tr key={f.id} className="cursor-pointer" onClick={() => navigate(`/findings/${f.id}`)}>
                    <td>
                      <PriorityBadge priority={f.priority} score={f.riskScore} />
                    </td>
                    <td>
                      <Link to={`/findings/${f.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                        {d.rule}
                      </Link>
                      <p className="max-w-xs truncate font-mono text-xs text-muted">{d.masked}</p>
                    </td>
                    <td className="font-mono text-xs">
                      {f.evidence.find((e) => e.label === 'Location')?.value}
                      <p className="text-muted">
                        commit {d.commit} in <RepoName assetId={f.assetId} />
                      </p>
                    </td>
                    <td className={cn('text-sm', d.inCurrentCode ? 'font-medium text-down' : 'text-muted')}>{d.inCurrentCode ? 'Yes' : 'Only in history'}</td>
                    <td>
                      <FindingStatusText status={f.status} />
                    </td>
                    <td className="whitespace-nowrap text-sm text-muted">{timeAgo(d.committedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function RepoName({ assetId }: { assetId: string }) {
  const assets = useQuery({ queryKey: ['assets', {}], queryFn: () => api.listAssets() });
  return <>{assets.data?.find((a) => a.id === assetId)?.identifier ?? ''}</>;
}