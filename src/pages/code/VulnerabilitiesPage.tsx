import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ShieldX } from 'lucide-react';
import { api } from '@/api';
import type { Finding, Severity, VulnDetail } from '@/types';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/cn';
import { SEVERITY_LABEL } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Field';
import { SeverityBadge } from '@/components/ui/Badge';
import { FindingStatusText, PriorityBadge } from '@/components/ui/StatusLabels';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';

const SEV: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const PRI = ['P1', 'P2', 'P3', 'P4'];

export function KevBadge() {
  return (
    <span className="rounded bg-crit px-1.5 py-0.5 text-2xs font-semibold text-white" title="On the CISA list of vulnerabilities known to be exploited in the wild">
      Known exploited
    </span>
  );
}

interface Group {
  vulnId: string;
  detail: VulnDetail;
  severity: Severity;
  exploited: boolean;
  summary: string;
  findings: Finding[];
}

export function VulnerabilitiesPage() {
  const scope = useScope();
  const [open, setOpen] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [kevOnly, setKevOnly] = useState(false);
  const filter = { ...scope, source: 'vulnerabilities' as const, status: 'active' as const, severity: severity || undefined };
  const findings = useQuery({ queryKey: ['findings', filter], queryFn: () => api.listFindings(filter) });

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    (findings.data ?? []).forEach((f) => {
      const d = f.code as VulnDetail;
      const g = m.get(d.vulnId) ?? { vulnId: d.vulnId, detail: d, severity: f.severity, exploited: f.knownExploited, summary: f.description.split(' Upgrade ')[0], findings: [] };
      g.findings.push(f);
      g.exploited ||= f.knownExploited;
      m.set(d.vulnId, g);
    });
    return [...m.values()]
      .filter((g) => !kevOnly || g.exploited)
      .sort((a, b) => Number(b.exploited) - Number(a.exploited) || SEV.indexOf(a.severity) - SEV.indexOf(b.severity) || b.findings.length - a.findings.length);
  }, [findings.data, kevOnly]);

  const kev = groups.filter((g) => g.exploited).length;

  return (
    <>
      <PageHeader
        title="Vulnerabilities"
        description={
          kev
            ? `${kev} ${kev === 1 ? 'vulnerability is' : 'vulnerabilities are'} known to be exploited in the wild. Fix ${kev === 1 ? 'it' : 'those'} first.`
            : 'Known CVEs in your dependencies and images. When OSV and Trivy report the same issue, it appears once with both sources.'
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={severity} onChange={(e) => setSeverity(e.target.value as Severity | '')} aria-label="Severity" className="w-40">
          <option value="">All severities</option>
          {SEV.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABEL[s]}
            </option>
          ))}
        </Select>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={kevOnly} onChange={(e) => setKevOnly(e.target.checked)} className="accent-[rgb(var(--accent))]" />
          Known exploited only
        </label>
        <p className="ml-auto text-sm text-muted">
          {groups.length} {groups.length === 1 ? 'vulnerability' : 'vulnerabilities'}, {groups.reduce((n, g) => n + g.findings.length, 0)} affected places
        </p>
      </div>
      {findings.isLoading ? (
        <Spinner />
      ) : findings.error ? (
        <ErrorState error={findings.error} onRetry={() => findings.refetch()} />
      ) : !groups.length ? (
        <EmptyState icon={<ShieldX className="h-6 w-6" />} title="No open vulnerabilities match" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-8" aria-label="Expand" />
                <th>Vulnerability</th>
                <th>Severity</th>
                <th className="text-right">CVSS</th>
                <th>Package</th>
                <th>Fixed in</th>
                <th className="text-right">Affected</th>
                <th>Top priority</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const top = [...g.findings].sort((a, b) => PRI.indexOf(a.priority) - PRI.indexOf(b.priority))[0];
                return (
                  <Fragment key={g.vulnId}>
                    <tr className={cn('cursor-pointer', g.exploited && 'bg-crit/[0.04]')} onClick={() => setOpen(open === g.vulnId ? null : g.vulnId)}>
                      <td className="text-muted">{open === g.vulnId ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}</td>
                      <td className="max-w-md">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[13px] font-medium">{g.vulnId}</span>
                          {g.exploited && <KevBadge />}
                        </p>
                        <p className="line-clamp-2 text-xs text-muted">{g.summary}</p>
                      </td>
                      <td>
                        <SeverityBadge severity={g.severity} />
                      </td>
                      <td className="text-right text-sm tabular-nums">{g.detail.cvss?.toFixed(1) ?? '—'}</td>
                      <td className="font-mono text-xs">{g.detail.package}</td>
                      <td className="font-mono text-xs">{g.detail.fixedIn ?? <span className="font-sans text-muted">No fix yet</span>}</td>
                      <td className="text-right text-sm tabular-nums">{g.findings.length}</td>
                      <td>
                        <PriorityBadge priority={top.priority} score={top.riskScore} />
                      </td>
                    </tr>
                    {open === g.vulnId && (
                      <tr className="hover:bg-transparent">
                        <td />
                        <td colSpan={7} className="pb-4">
                          <ul className="divide-y divide-line rounded border border-line">
                            {g.findings.map((f) => {
                              const d = f.code as VulnDetail;
                              return (
                                <li key={f.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-3 py-2 text-sm">
                                  <Link to={`/findings/${f.id}`} className="min-w-[240px] flex-1 font-mono text-xs hover:underline">
                                    {d.targetName}
                                  </Link>
                                  <span className="text-xs text-muted">{d.targetType === 'image' ? 'Container image' : 'Repository'}</span>
                                  <span className="font-mono text-xs">installed {d.installed}</span>
                                  <span className="text-xs text-muted">{d.sources.map((s) => (s === 'osv' ? 'OSV' : 'Trivy')).join(' + ')}</span>
                                  <FindingStatusText status={f.status} />
                                  <PriorityBadge priority={f.priority} score={f.riskScore} />
                                </li>
                              );
                            })}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}