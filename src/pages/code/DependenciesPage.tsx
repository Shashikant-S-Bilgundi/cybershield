import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { api } from '@/api';
import { useScope } from '@/hooks/useScope';
import { PageHeader } from '@/components/ui/PageHeader';
import { SeverityBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { KevBadge } from './VulnerabilitiesPage';

const ECO: Record<string, string> = { npm: 'npm', alpine: 'Alpine package', debian: 'Debian package', pypi: 'PyPI', go: 'Go module' };

export function DependenciesPage() {
  const scope = useScope();
  const deps = useQuery({ queryKey: ['dependencies', scope], queryFn: () => api.listDependencies(scope) });
  const npmUpgrades = (deps.data ?? []).filter((d) => d.ecosystem === 'npm' && d.upgradeTo);

  return (
    <>
      <PageHeader title="Dependency security" description="Packages with open vulnerabilities, and the version that fixes all of them. Upgrading one package often closes several findings at once." />
      {deps.isLoading ? (
        <Spinner />
      ) : deps.error ? (
        <ErrorState error={deps.error} onRetry={() => deps.refetch()} />
      ) : !deps.data?.length ? (
        <EmptyState icon={<Package className="h-6 w-6" />} title="No vulnerable dependencies" body="Every scanned repository and image is free of known vulnerable packages." />
      ) : (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Worst severity</th>
                  <th className="text-right">Open CVEs</th>
                  <th>Installed</th>
                  <th>Upgrade to</th>
                  <th>Used in</th>
                </tr>
              </thead>
              <tbody>
                {deps.data.map((d) => (
                  <tr key={d.ecosystem + d.package}>
                    <td>
                      <p className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-medium">{d.package}</span>
                        {d.knownExploited && <KevBadge />}
                      </p>
                      <p className="text-xs text-muted">{ECO[d.ecosystem]}</p>
                    </td>
                    <td>
                      <SeverityBadge severity={d.worst} />
                    </td>
                    <td className="text-right text-sm tabular-nums">{d.vulns}</td>
                    <td className="font-mono text-xs">{d.installed.join(', ')}</td>
                    <td className="font-mono text-xs font-medium text-up">{d.upgradeTo ?? <span className="font-sans font-normal text-muted">No fix yet</span>}</td>
                    <td className="text-xs">
                      {d.targets.map((t) => (
                        <p key={t.name} className="font-mono">
                          {t.name}
                          {t.type === 'image' && <span className="ml-1 font-sans text-muted">(image)</span>}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {npmUpgrades.length > 0 && (
            <section className="max-w-3xl space-y-2">
              <h2 className="font-semibold">Upgrade the npm packages in one go</h2>
              <p className="text-sm text-muted">Run this in each affected repository, then run its tests. Packages pulled in by another package may need that parent upgraded instead.</p>
              <CodeBlock label="npm command" code={`npm install ${npmUpgrades.map((d) => `${d.package}@^${d.upgradeTo}`).join(' ')}`} />
              <p className="text-xs text-muted">Images need rebuilding on a patched base image instead; Alpine and Debian packages update with the base.</p>
            </section>
          )}
        </div>
      )}
    </>
  );
}