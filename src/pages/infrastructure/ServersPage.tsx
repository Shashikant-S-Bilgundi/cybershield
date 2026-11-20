import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Server } from 'lucide-react';
import { api } from '@/api';
import { useScope } from '@/hooks/useScope';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { ServersTable } from './ServersTable';

export function ServersPage() {
  const scope = useScope();
  const servers = useQuery({ queryKey: ['servers', scope], queryFn: () => api.listServers(scope), refetchInterval: 30_000 });
  const offline = (servers.data ?? []).filter((s) => s.status === 'offline').length;
  const fullDisk = (servers.data ?? []).filter((s) => (s.usage?.disk ?? 0) >= 95).length;

  return (
    <>
      <PageHeader
        title="Servers and containers"
        description={
          offline || fullDisk
            ? [offline && `${offline} ${offline === 1 ? 'server has' : 'servers have'} stopped reporting`, fullDisk && `${fullDisk} ${fullDisk === 1 ? 'disk is' : 'disks are'} almost full`].filter(Boolean).join('. ') + '.'
            : 'CPU, memory, disk, services and Docker containers, reported every minute by the ShieldOps agent.'
        }
        actions={
          <Link to="/ingestion#agents">
            <Button>Add a server</Button>
          </Link>
        }
      />
      {servers.isLoading ? (
        <Spinner />
      ) : servers.error ? (
        <ErrorState error={servers.error} onRetry={() => servers.refetch()} />
      ) : !servers.data?.length ? (
        <EmptyState
          icon={<Server className="h-6 w-6" />}
          title="No servers yet"
          body="Create an agent token and run the one-line install on each server. It appears here within a minute."
          action={
            <Link to="/ingestion#agents">
              <Button variant="primary">Create an agent token</Button>
            </Link>
          }
        />
      ) : (
        <ServersTable servers={servers.data} />
      )}
    </>
  );
}