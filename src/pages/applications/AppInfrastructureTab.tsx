import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import type { Application } from '@/types';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/States';
import { ServersTable } from '@/pages/infrastructure/ServersTable';
import { DbChecksList } from '@/pages/infrastructure/DbChecksList';

export function InfrastructureTab({ app }: { app: Application }) {
  const scope = { applicationId: app.id };
  const servers = useQuery({ queryKey: ['servers', scope], queryFn: () => api.listServers(scope), refetchInterval: 30_000 });
  const checks = useQuery({ queryKey: ['db-checks', scope], queryFn: () => api.listDbChecks(scope), refetchInterval: 30_000 });

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Servers</h2>
          <Link to="/ingestion#agents" className="text-sm text-accent hover:underline">
            Add a server
          </Link>
        </div>
        {servers.isLoading ? (
          <Spinner />
        ) : !servers.data?.length ? (
          <EmptyState
            title="No servers report for this application"
            body="Create an agent token for one of its environments and run the install command on each server."
            action={
              <Link to="/ingestion#agents">
                <Button>Create an agent token</Button>
              </Link>
            }
          />
        ) : (
          <ServersTable servers={servers.data} showApplication={false} />
        )}
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Databases</h2>
          <Link to="/databases" className="text-sm text-accent hover:underline">
            Manage database checks
          </Link>
        </div>
        {checks.isLoading ? (
          <Spinner />
        ) : !checks.data?.length ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No database checks for this application.</p>
        ) : (
          <DbChecksList checks={checks.data} showApplication={false} />
        )}
      </section>
    </div>
  );
}