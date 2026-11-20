import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Plus } from 'lucide-react';
import { api, type DbCheckInput } from '@/api';
import type { DbEngine } from '@/types';
import { useScope } from '@/hooks/useScope';
import { isAuthorized } from '@/lib/assets';
import { DB_ENGINE_LABEL } from '@/lib/format';
import { hostOf } from '@/lib/net';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { DbChecksList } from './DbChecksList';

export function DatabasesPage() {
  const scope = useScope();
  const [creating, setCreating] = useState(false);
  const checks = useQuery({ queryKey: ['db-checks', scope], queryFn: () => api.listDbChecks(scope), refetchInterval: 30_000 });
  const failing = (checks.data ?? []).filter((d) => d.status === 'down' || d.status === 'degraded').length;

  return (
    <>
      <PageHeader
        title="Databases"
        description={
          failing
            ? `${failing} ${failing === 1 ? 'database is' : 'databases are'} failing or slow to respond.`
            : 'ShieldOps connects with a read-only account, runs a ping, and disconnects. It never writes or reads your data.'
        }
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New database check
          </Button>
        }
      />
      {checks.isLoading ? (
        <Spinner />
      ) : checks.error ? (
        <ErrorState error={checks.error} onRetry={() => checks.refetch()} />
      ) : !checks.data?.length ? (
        <EmptyState
          icon={<Database className="h-6 w-6" />}
          title="No database checks yet"
          body="Add a database asset, create a read-only user for ShieldOps, then add a check here."
          action={<Button variant="primary" onClick={() => setCreating(true)}>New database check</Button>}
        />
      ) : (
        <DbChecksList checks={checks.data} />
      )}
      <p className="mt-4 text-xs text-muted">Connections, size and replication figures appear when the ShieldOps agent also runs on the database server.</p>
      {creating && <DbCheckForm onClose={() => setCreating(false)} defaultApplicationId={scope.applicationId} />}
    </>
  );
}

const ENGINE_FROM_SCHEME: Record<string, DbEngine> = { postgres: 'postgresql', postgresql: 'postgresql', mysql: 'mysql', mongodb: 'mongodb', 'mongodb+srv': 'mongodb', redis: 'redis', rediss: 'redis' };
const DEFAULT_PORT: Record<DbEngine, number> = { postgresql: 5432, mysql: 3306, mongodb: 27017, redis: 6379 };

const READONLY_HINT: Record<DbEngine, string> = {
  postgresql: "CREATE ROLE shieldops_ro LOGIN PASSWORD '…'; GRANT CONNECT ON DATABASE app TO shieldops_ro;",
  mysql: "CREATE USER 'shieldops_ro'@'%' IDENTIFIED BY '…'; -- no grants needed for a ping",
  mongodb: 'db.createUser({ user: "shieldops", pwd: "…", roles: [{ role: "clusterMonitor", db: "admin" }] })',
  redis: 'ACL SETUSER shieldops on >… +ping +info -@all',
};

function DbCheckForm({ onClose, defaultApplicationId }: { onClose: () => void; defaultApplicationId?: string }) {
  const qc = useQueryClient();
  const assets = useQuery({ queryKey: ['assets', { type: 'database' }], queryFn: () => api.listAssets({ type: 'database', applicationId: defaultApplicationId }) });
  const [assetId, setAssetId] = useState('');
  const [form, setForm] = useState({ name: '', engine: '' as DbEngine | '', host: '', port: 0, database: '', username: '', password: '', intervalSec: 60 });
  const eligible = (assets.data ?? []).filter((a) => isAuthorized(a.authorization) && a.status === 'active');
  const asset = eligible.find((a) => a.id === assetId);
  const scheme = asset?.identifier.match(/^([a-z+]+):\/\//i)?.[1].toLowerCase() ?? '';
  const engine: DbEngine = form.engine || ENGINE_FROM_SCHEME[scheme] || 'postgresql';
  const host = form.host || (asset ? hostOf(asset.identifier) : '');
  const port = form.port || Number(asset?.identifier.match(/:(\d{2,5})(\/|$)/)?.[1]) || DEFAULT_PORT[engine];

  const create = useMutation({
    mutationFn: (input: DbCheckInput) => api.createDbCheck(input),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['db-checks'] });
      toast.success(d.status === 'up' ? `Connected to ${d.name}` : `${d.name} added`);
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ ...form, name: form.name || asset?.label || '', engine, host, port, assetId });
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: k === 'port' || k === 'intervalSec' ? Number(e.target.value) : e.target.value });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="New database check"
      description="Use a dedicated read-only account. The password is encrypted, never shown again, and deleted with the check."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="db-form" variant="primary" loading={create.isPending} disabled={!asset || !form.username || !form.password}>
            Test and save
          </Button>
        </>
      }
    >
      <form id="db-form" onSubmit={submit} className="space-y-4" autoComplete="off">
        <Field
          label="Database asset"
          hint={
            !assets.isLoading && eligible.length === 0 ? (
              <>
                No verified database assets yet.{' '}
                <Link to="/assets" className="text-accent hover:underline">
                  Add one in Assets
                </Link>
                .
              </>
            ) : undefined
          }
        >
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={assetId} onChange={(e) => (setAssetId(e.target.value), setForm({ ...form, engine: '', host: '', port: 0 }))} required>
              <option value="" disabled>
                Choose a database
              </option>
              {eligible.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({a.identifier})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Field label="Name">{(id) => <Input id={id} value={form.name} onChange={set('name')} placeholder={asset?.label ?? 'Payments PostgreSQL'} />}</Field>
          <Field label="Engine">
            {(id) => (
              <Select id={id} value={engine} onChange={set('engine')}>
                {(Object.keys(DB_ENGINE_LABEL) as DbEngine[]).map((e) => (
                  <option key={e} value={e}>
                    {DB_ENGINE_LABEL[e]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_110px_160px]">
          <Field label="Host">{(id) => <Input id={id} value={host} onChange={set('host')} className="font-mono text-xs" />}</Field>
          <Field label="Port">{(id) => <Input id={id} type="number" value={port} onChange={set('port')} />}</Field>
          <Field label={engine === 'redis' ? 'Database number' : 'Database'}>{(id) => <Input id={id} value={form.database} onChange={set('database')} placeholder={engine === 'redis' ? '0' : 'app'} className="font-mono text-xs" />}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Read-only username">{(id) => <Input id={id} value={form.username} onChange={set('username')} autoComplete="off" className="font-mono text-xs" />}</Field>
          <Field label="Password">{(id) => <Input id={id} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />}</Field>
        </div>
        <details className="rounded border border-line px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted">How to create a read-only account for {DB_ENGINE_LABEL[engine]}</summary>
          <code className="mt-2 block whitespace-pre-wrap break-all font-mono text-xs">{READONLY_HINT[engine]}</code>
        </details>
        <Field label="Check every">
          {(id) => (
            <Select id={id} value={form.intervalSec} onChange={set('intervalSec')} className="w-40">
              {[60, 120, 300, 600].map((s) => (
                <option key={s} value={s}>
                  {s / 60} {s === 60 ? 'minute' : 'minutes'}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <InlineError error={create.error} />
      </form>
    </Modal>
  );
}