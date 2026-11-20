import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download } from 'lucide-react';
import { api } from '@/api';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { downloadReport } from './reportDownload';

const TONE = { good: 'text-up', warn: 'text-degraded', bad: 'text-down' } as const;

export function ReportViewPage() {
  const { id = '' } = useParams();
  const report = useQuery({ queryKey: ['report', id], queryFn: () => api.getReport(id), refetchInterval: (q) => (q.state.data?.status === 'generating' ? 1200 : false) });
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const dl = useMutation({ mutationFn: () => downloadReport(id, report.data!.title, report.data!.to), onError: (e) => toast.error((e as Error).message) });

  if (report.isLoading) return <Spinner />;
  if (report.error) return <ErrorState error={report.error} onRetry={() => report.refetch()} />;
  const r = report.data!;
  if (r.status === 'generating') return <Spinner label="Generating the report" />;

  return (
    <>
      <PageHeader
        title={r.title}
        description={`${r.applicationId ? apps.data?.find((a) => a.id === r.applicationId)?.name : 'All applications'}, ${formatDate(r.from)} to ${formatDate(r.to)}`}
        actions={
          <Button variant="primary" onClick={() => dl.mutate()} loading={dl.isPending}>
            {!dl.isPending && <Download className="h-4 w-4" aria-hidden />}
            Download PDF
          </Button>
        }
      >
        <Link to="/reports" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Reports
        </Link>
      </PageHeader>
      <article className="max-w-4xl space-y-8 rounded-lg border border-line bg-surface p-6">
        <p className="text-xs text-muted">
          Generated {formatDateTime(r.generatedAt)} by {users.data?.find((u) => u.id === r.generatedBy)?.name ?? 'ShieldOps'}. Figures show the state at that moment. Secret values are masked.
        </p>
        {r.sections.map((s) => (
          <section key={s.title}>
            <h2 className="mb-2 text-lg font-semibold">{s.title}</h2>
            {s.summary && <p className="mb-3 text-sm text-muted">{s.summary}</p>}
            {s.metrics && (
              <dl className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {s.metrics.map((m) => (
                  <div key={m.label} className="rounded border border-line px-3 py-2">
                    <dt className="text-xs text-muted">{m.label}</dt>
                    <dd className={cn('text-xl font-semibold tabular-nums', m.tone && TONE[m.tone])}>{m.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {s.table && (
              <div className="overflow-x-auto rounded border border-line">
                <table className="table-base">
                  <thead>
                    <tr>
                      {s.table.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.table.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className={cn('text-sm', /^(CVE-|sha256|[\w.-]+:\d+$|AKIA|rzp_)/.test(cell) && 'font-mono text-xs')}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {s.bullets && (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>
    </>
  );
}