import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';

export function ImportAssetsDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [source, setSource] = useState<'cloudflare' | 'aws'>('cloudflare');
  const [picked, setPicked] = useState<string[]>([]);
  const [applicationId, setApplicationId] = useState('');
  const [envId, setEnvId] = useState('');
  const found = useQuery({ queryKey: ['discover', source], queryFn: () => api.discoverAssets(source), retry: false });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const active = (apps.data ?? []).filter((a) => a.status === 'active');
  const app = active.find((a) => a.id === applicationId);
  const environmentId = app?.environments.some((e) => e.id === envId) ? envId : app?.environments[0]?.id ?? '';

  const imp = useMutation({
    mutationFn: () => api.importAssets({ source, externalIds: picked, applicationId, environmentId }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success(`Imported ${r.imported} ${r.imported === 1 ? 'asset' : 'assets'}`);
      onClose();
    },
  });
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Import assets"
      description="Pick resources found in your connected accounts. They are added as approved assets, because the account connection proves you own them."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => imp.mutate()} loading={imp.isPending} disabled={!picked.length || !environmentId}>
            Import {picked.length || ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1 rounded border border-line p-0.5 sm:w-fit" role="tablist">
          {(['cloudflare', 'aws'] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={source === s} onClick={() => (setSource(s), setPicked([]))} className={cn('rounded-[4px] px-3 py-1 text-sm font-medium', source === s ? 'bg-sunken text-ink' : 'text-muted')}>
              {s === 'aws' ? 'AWS' : 'Cloudflare'}
            </button>
          ))}
        </div>
        {found.isLoading ? (
          <Spinner label={`Reading your ${source === 'aws' ? 'AWS account' : 'Cloudflare zones'}`} />
        ) : found.error ? (
          <p className="text-sm">
            <InlineError error={found.error} />{' '}
            <Link to="/integrations" className="text-accent hover:underline">
              Open Integrations
            </Link>
          </p>
        ) : (
          <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded border border-line">
            {found.data!.map((d) => (
              <li key={d.externalId}>
                <label className={cn('flex items-center gap-3 px-3 py-2 text-sm', d.alreadyAdded ? 'opacity-50' : 'cursor-pointer hover:bg-sunken/60')}>
                  <input type="checkbox" disabled={d.alreadyAdded} checked={picked.includes(d.externalId)} onChange={() => toggle(d.externalId)} className="accent-[rgb(var(--accent))]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs">{d.identifier}</span>
                    <span className="text-xs text-muted">
                      {d.label}. {d.details}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{d.alreadyAdded ? 'Already added' : d.type}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Application">
            {(id) => (
              <Select id={id} value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
                <option value="" disabled>
                  Choose an application
                </option>
                {active.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Environment">
            {(id) => (
              <Select id={id} value={environmentId} onChange={(e) => setEnvId(e.target.value)} disabled={!app}>
                {(app?.environments ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <InlineError error={imp.error} />
      </div>
    </Modal>
  );
}