import { Link, useParams } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { findSoon } from '@/components/layout/nav';
import { PageHeader } from '@/components/ui/PageHeader';
import { NotFoundPage } from './NotFoundPage';

const AVAILABLE = [1, 2, 3, 4, 5, 6, 7, 8];

const PHASES = [
  { n: 1, name: 'Foundation', body: 'Sign-in, team, applications, assets, audit logs, settings.' },
  { n: 2, name: 'Availability monitoring', body: 'Uptime, heartbeats, SSL, DNS, domain expiry, headers, alerts.' },
  { n: 3, name: 'Application telemetry', body: 'SDK, errors, API performance, security events, login activity.' },
  { n: 4, name: 'Infrastructure', body: 'Server agent, containers, database checks.' },
  { n: 5, name: 'Code security', body: 'GitHub, Gitleaks, OSV, Trivy, image scanning.' },
  { n: 6, name: 'Security operations', body: 'Incidents, remediation, verification, SLAs.' },
  { n: 7, name: 'AI and reporting', body: 'AI analyst, PDF reports, compliance readiness.' },
  { n: 8, name: 'Advanced', body: 'Logs, releases, SSO, more integrations.' },
];

export function ComingSoonPage() {
  const { slug = '' } = useParams();
  const item = findSoon(slug);
  if (!item) return <NotFoundPage />;

  return (
    <>
      <PageHeader title={item.label} description={item.summary} />
      <div className="max-w-2xl rounded-lg border border-line bg-surface p-5">
        <p className="text-sm">
          This screen arrives in <span className="font-semibold">phase {item.phase}</span>. Until then, you can{' '}
          <Link to="/assets" className="text-accent hover:underline">
            verify assets
          </Link>{' '}
          and{' '}
          <Link to="/monitors" className="text-accent hover:underline">
            set up uptime checks
          </Link>{' '}
          so everything is in place when it ships.
        </p>
        <ol className="mt-5 space-y-px">
          {PHASES.map((p) => (
            <li key={p.n} className={cn('flex gap-3 rounded px-3 py-2', p.n === item.phase && 'bg-accent/10')}>
              <span className={cn('w-5 shrink-0 text-right tabular-nums', AVAILABLE.includes(p.n) ? 'text-up' : 'text-muted')}>{p.n}</span>
              <div>
                <p className={cn('text-sm font-medium', p.n === item.phase || AVAILABLE.includes(p.n) ? 'text-ink' : 'text-muted')}>
                  {p.name}
                  {AVAILABLE.includes(p.n) && <span className="ml-2 text-xs font-normal text-up">Available now</span>}
                </p>
                <p className="text-xs text-muted">{p.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}