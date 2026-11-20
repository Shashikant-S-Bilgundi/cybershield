import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/api';
import type { ProbeLocation } from '@/types';
import { formatDateTime, timeAgo } from '@/lib/format';
import { probeSnippet } from '@/lib/ingest';
import { Button } from '@/components/ui/Button';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { ConfirmDialog } from '@/components/security/ConfirmDialog';
import { isReauthCancelled, useCritical } from '@/components/security/reauth';

export function ProbesSection() {
  const qc = useQueryClient();
  const critical = useCritical();
  const probes = useQuery({ queryKey: ['probes'], queryFn: api.listProbes, refetchInterval: 60_000 });
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProbeLocation | null>(null);

  return (
    <section id="probes" aria-labelledby="probes-title" className="mb-10 scroll-mt-20">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="probes-title" className="font-semibold">
            Probe locations
          </h2>
          <p className="max-w-3xl text-sm text-muted">
            Uptime checks run from every online probe. A site counts as down only when all of them see it fail, so a network problem near one probe never raises a false outage. A probe is a small container on any server outside your main network.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add probe
        </Button>
      </div>
      {probes.isLoading ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {(probes.data ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3">
              <div className="min-w-[200px] flex-1">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted">
                  {p.region}
                  {p.prefix && <span className="ml-2 font-mono">{p.prefix}…</span>}
                </p>
              </div>
              <p className="text-sm" title={formatDateTime(p.lastSeenAt)}>
                {p.status === 'online' ? <span className="text-up">Online</span> : <span className="text-degraded">{p.lastSeenAt ? 'Offline' : 'Waiting for first connection'}</span>}
                {p.lastSeenAt && <span className="ml-2 text-xs text-muted">{timeAgo(p.lastSeenAt)}</span>}
              </p>
              {p.kind === 'built_in' ? (
                <span className="w-20 text-right text-xs text-muted">Built in</span>
              ) : (
                <Button size="sm" variant="ghost" className="w-20" onClick={() => setRemoving(p)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <AddProbe
          onClose={() => setAdding(false)}
          onCreated={(s) => {
            qc.invalidateQueries({ queryKey: ['probes'] });
            setAdding(false);
            setSecret(s);
          }}
        />
      )}
      {secret && (
        <Modal
          open
          onClose={() => setSecret(null)}
          size="lg"
          title="Run the probe"
          description="The token is shown only now. The probe only makes outbound connections to ShieldOps and runs the checks it is given."
          footer={
            <Button variant="primary" onClick={() => setSecret(null)}>
              Done
            </Button>
          }
        >
          <CodeBlock code={probeSnippet(secret)} label="probe command" />
        </Modal>
      )}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove the ${removing?.name ?? ''} probe?`}
        body="Its token stops working and uptime checks run from the remaining probes."
        actionLabel="Remove probe"
        onConfirm={() =>
          critical(() => api.removeProbe(removing!.id)).then(() => {
            qc.invalidateQueries({ queryKey: ['probes'] });
            toast.success('Probe removed');
          })
        }
      />
    </section>
  );
}

function AddProbe({ onClose, onCreated }: { onClose: () => void; onCreated: (secret: string) => void }) {
  const critical = useCritical();
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const create = useMutation({ mutationFn: () => critical(() => api.createProbe({ name, region })), onSuccess: (r) => onCreated(r.secret) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Add a probe location"
      description="Pick a server in a different city or provider from ShieldOps itself."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="probe-form" variant="primary" loading={create.isPending} disabled={!name.trim()}>
            Create token
          </Button>
        </>
      }
    >
      <form id="probe-form" onSubmit={submit} className="space-y-4">
        <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mumbai" autoFocus />}</Field>
        <Field label="Where it runs" hint="Optional, for your reference.">
          {(id, d) => <Input id={id} aria-describedby={d} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="DigitalOcean BLR1" />}
        </Field>
        {create.error && !isReauthCancelled(create.error) && <InlineError error={create.error} />}
      </form>
    </Modal>
  );
}