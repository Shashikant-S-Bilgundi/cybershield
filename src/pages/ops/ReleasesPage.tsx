import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Rocket } from 'lucide-react';
import { api } from '@/api';
import type { Release } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMs, timeAgo } from '@/lib/format';
import { releaseSnippet } from '@/lib/ingest';
import { PageHeader } from '@/components/ui/PageHeader';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';

const VERDICT: Record<Release['verdict'], { label: string; tone: string }> = {
  regression: { label: 'Possible regression', tone: 'text-down' },
  healthy: { label: 'Healthy', tone: 'text-up' },
  watching: { label: 'Watching (first 24 hours)', tone: 'text-degraded' },
};

function Delta({ before, after, format, worseIfUp = true }: { before: number; after: number | undefined; format: (v: number) => string; worseIfUp?: boolean }) {
  if (after === undefined) return <span className="text-muted">{format(before)} → …</span>;
  const worse = worseIfUp ? after > before * 1.15 : after < before * 0.85;
  return (
    <span className={cn('tabular-nums', worse && 'font-medium text-down')}>
      {format(before)} → {format(after)}
    </span>
  );
}

export function ReleasesPage() {
  const scope = useScope();
  const releases = useQuery({ queryKey: ['releases', scope.applicationId], queryFn: () => api.listReleases({ applicationId: scope.applicationId }) });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const where = (r: Release) => {
    const a = apps.data?.find((x) => x.id === r.applicationId);
    return `${a?.name ?? '—'}, ${a?.environments.find((e) => e.id === r.environmentId)?.name ?? ''}`;
  };
  const regressions = (releases.data ?? []).filter((r) => r.verdict === 'regression').length;

  return (
    <>
      <PageHeader
        title="Releases"
        description={
          regressions
            ? `${regressions} recent ${regressions === 1 ? 'release brought' : 'releases brought'} new errors or alerts with them.`
            : 'Each deploy, with the errors and response times before and after it. Release markers also appear on the performance charts.'
        }
      />
      {releases.isLoading ? (
        <Spinner />
      ) : releases.error ? (
        <ErrorState error={releases.error} onRetry={() => releases.refetch()} />
      ) : !releases.data?.length ? (
        <EmptyState icon={<Rocket className="h-6 w-6" />} title="No releases recorded" body="Add the command below to your deploy pipeline." />
      ) : (
        <div className="mb-8 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-base">
            <thead>
              <tr>
                <th>Release</th>
                <th>Verdict</th>
                <th className="text-right">New errors</th>
                <th>5xx rate</th>
                <th>p95</th>
                <th>Deployed</th>
              </tr>
            </thead>
            <tbody>
              {releases.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <p className="font-mono text-[13px] font-medium">{r.version}</p>
                    <p className="text-xs text-muted">
                      {where(r)}, commit <span className="font-mono">{r.commit}</span>
                    </p>
                  </td>
                  <td className={cn('text-sm font-medium', VERDICT[r.verdict].tone)}>
                    {VERDICT[r.verdict].label}
                    {r.alertsAfter > 0 && <p className="text-xs font-normal text-muted">{r.alertsAfter} alerts within 24 hours</p>}
                  </td>
                  <td className="text-right text-sm tabular-nums">
                    {r.newErrorGroups > 0 ? (
                      <Link to={`/errors`} className="font-medium text-down hover:underline">
                        {r.newErrorGroups}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="text-sm">
                    <Delta before={r.before.errorRate} after={r.after?.errorRate} format={(v) => `${v}%`} />
                  </td>
                  <td className="text-sm">
                    <Delta before={r.before.p95} after={r.after?.p95} format={(v) => formatMs(v)} />
                  </td>
                  <td className="whitespace-nowrap text-sm" title={formatDateTime(r.deployedAt)}>
                    {timeAgo(r.deployedAt)}
                    <p className="text-xs text-muted">{r.deployedBy}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="max-w-3xl space-y-2">
        <h2 className="font-semibold">Record releases from your pipeline</h2>
        <p className="text-sm text-muted">
          Run this after each deploy, with the app's server ingestion key. The SDK also tags every error with the release it came from, so a new error is pinned to the deploy that introduced it.
        </p>
        <CodeBlock label="release command" code={releaseSnippet()} />
      </section>
    </>
  );
}