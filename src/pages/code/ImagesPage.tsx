import { Fragment, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Container, Plus } from 'lucide-react';
import { api, type AddImageInput } from '@/api';
import type { ContainerImage } from '@/types';
import { useScope } from '@/hooks/useScope';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Menu } from '@/components/ui/Menu';
import { Modal } from '@/components/ui/Modal';
import { LastScan, SeverityChips } from '@/components/ui/ScanLabels';
import { EmptyState, ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { ConfirmDialog } from '@/components/security/ConfirmDialog';
import { useCritical } from '@/components/security/reauth';
import { FindingsTable } from '@/pages/operations/FindingsTable';
import { ScanHistory } from './ScanHistory';

const busy = (i: ContainerImage) => i.lastScan?.status === 'queued' || i.lastScan?.status === 'running';

export function ImagesPage() {
  const scope = useScope();
  const qc = useQueryClient();
  const critical = useCritical();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ContainerImage | null>(null);
  const images = useQuery({ queryKey: ['images', scope], queryFn: () => api.listImages(scope), refetchInterval: (q) => (q.state.data?.some(busy) ? 1500 : 60_000) });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const appEnv = (i: ContainerImage) => {
    const a = apps.data?.find((x) => x.id === i.applicationId);
    return `${a?.name ?? '—'}, ${a?.environments.find((e) => e.id === i.environmentId)?.name ?? ''}`;
  };
  const refresh = () => ['images', 'scans', 'findings', 'dependencies'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const scan = useMutation({
    mutationFn: (i: ContainerImage) => api.startScan('image', i.id),
    onSuccess: () => {
      refresh();
      toast.success('Scan queued');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <PageHeader
        title="Container images"
        description="Images from GitHub Container Registry and Docker Hub, scanned by Trivy for vulnerable operating-system packages and application dependencies."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add image
          </Button>
        }
      />
      {images.isLoading ? (
        <Spinner />
      ) : images.error ? (
        <ErrorState error={images.error} onRetry={() => images.refetch()} />
      ) : !images.data?.length ? (
        <EmptyState icon={<Container className="h-6 w-6" />} title="No images yet" body="Add the images you deploy, by registry, name and tag." action={<Button variant="primary" onClick={() => setAdding(true)}>Add image</Button>} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-8" aria-label="Expand" />
                <th>Image</th>
                <th>Application</th>
                <th>Base</th>
                <th>Last scan</th>
                <th>Vulnerabilities</th>
                <th className="w-px" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {images.data.map((i) => (
                <Fragment key={i.id}>
                  <tr className="cursor-pointer" onClick={() => setOpen(open === i.id ? null : i.id)}>
                    <td className="text-muted">{open === i.id ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}</td>
                    <td>
                      <p className="font-mono text-[13px] font-medium">
                        {i.repository}:{i.tag}
                      </p>
                      <p className="font-mono text-xs text-muted">
                        {i.registry}, {i.digest.slice(0, 19)}…
                      </p>
                    </td>
                    <td className="text-sm">{appEnv(i)}</td>
                    <td className="text-sm">
                      {i.os}
                      <p className="text-xs text-muted">{i.sizeMb} MB</p>
                    </td>
                    <td>
                      <LastScan scan={i.lastScan} />
                    </td>
                    <td>
                      <SeverityChips counts={i.vulns} emptyText={i.lastScan?.status === 'completed' ? 'None found' : '—'} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button size="sm" onClick={() => scan.mutate(i)} loading={busy(i)} disabled={busy(i)}>
                          {busy(i) ? 'Scanning' : 'Scan'}
                        </Button>
                        <Menu actions={[{ label: 'Remove image', danger: true, onSelect: () => setRemoving(i) }]} />
                      </div>
                    </td>
                  </tr>
                  {open === i.id && (
                    <tr className="hover:bg-transparent">
                      <td />
                      <td colSpan={6} className="pb-5">
                        <ImageDetail image={i} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddImageDialog defaultApplicationId={scope.applicationId} onClose={() => setAdding(false)} />}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing ? `${removing.repository}:${removing.tag}` : ''}?`}
        body="Scanning stops and its open findings are closed. The image in the registry is not touched."
        actionLabel="Remove image"
        confirmText="remove"
        onConfirm={() =>
          critical(() => api.removeImage(removing!.id)).then(() => {
            refresh();
            toast.success('Image removed');
          })
        }
      />
    </>
  );
}

function ImageDetail({ image }: { image: ContainerImage }) {
  const scans = useQuery({ queryKey: ['scans', 'image', image.id], queryFn: () => api.listScans('image', image.id), refetchInterval: busy(image) ? 1500 : false });
  const findings = useQuery({ queryKey: ['findings', { assetId: image.assetId, status: 'active' }], queryFn: () => api.listFindings({ assetId: image.assetId, status: 'active' }) });
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div>
        <p className="mb-2 text-sm font-medium">Open findings</p>
        {findings.isLoading ? <Spinner /> : !findings.data?.length ? <p className="text-sm text-muted">None open.</p> : <FindingsTable findings={findings.data} showApplication={false} />}
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Scan history</p>
        <div className="overflow-x-auto rounded border border-line">{scans.isLoading ? <Spinner /> : <ScanHistory scans={scans.data ?? []} />}</div>
      </div>
    </div>
  );
}

function AddImageDialog({ defaultApplicationId, onClose }: { defaultApplicationId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const integrations = useQuery({ queryKey: ['integrations'], queryFn: api.listIntegrations });
  const [form, setForm] = useState<AddImageInput>({ registry: 'ghcr.io', repository: '', tag: '', applicationId: defaultApplicationId ?? '', environmentId: '' });
  const active = (apps.data ?? []).filter((a) => a.status === 'active');
  const app = active.find((a) => a.id === form.applicationId);
  const environmentId = app?.environments.some((e) => e.id === form.environmentId) ? form.environmentId : app?.environments[0]?.id ?? '';
  const regConnected = (r: AddImageInput['registry']) => integrations.data?.find((i) => i.type === (r === 'ghcr.io' ? 'ghcr' : 'dockerhub'))?.status === 'connected';

  const add = useMutation({
    mutationFn: (input: AddImageInput) => api.addImage(input),
    onSuccess: (i) => {
      qc.invalidateQueries({ queryKey: ['images'] });
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success(`${i.repository}:${i.tag} added. Scanning now.`);
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate({ ...form, environmentId });
  };
  const set = (k: keyof AddImageInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a container image"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="image-form" variant="primary" loading={add.isPending} disabled={!form.repository.trim() || !environmentId || !regConnected(form.registry)}>
            Add and scan
          </Button>
        </>
      }
    >
      <form id="image-form" onSubmit={submit} className="space-y-4">
        <Field
          label="Registry"
          hint={
            !regConnected(form.registry) && integrations.data ? (
              <>
                Not connected yet.{' '}
                <Link to="/integrations" className="text-accent hover:underline">
                  Connect it in Integrations
                </Link>
                .
              </>
            ) : undefined
          }
        >
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={form.registry} onChange={set('registry')}>
              <option value="ghcr.io">GitHub Container Registry (ghcr.io)</option>
              <option value="docker.io">Docker Hub (docker.io)</option>
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
          <Field label="Image">{(id) => <Input id={id} value={form.repository} onChange={set('repository')} placeholder="your-org/payments-api" className="font-mono text-xs" />}</Field>
          <Field label="Tag">{(id) => <Input id={id} value={form.tag} onChange={set('tag')} placeholder="latest" className="font-mono text-xs" />}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Application">
            {(id) => (
              <Select id={id} value={form.applicationId} onChange={set('applicationId')} required>
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
              <Select id={id} value={environmentId} onChange={set('environmentId')} disabled={!app}>
                {(app?.environments ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <InlineError error={add.error} />
      </form>
    </Modal>
  );
}