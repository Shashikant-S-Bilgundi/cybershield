import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AssetInput } from '@/api';
import type { Asset, AssetType } from '@/types';
import { ASSET_PLACEHOLDER, ASSET_TYPE_LABEL } from '@/lib/format';
import { hostOf, isDomain, isIPv4, isPrivateIPv4 } from '@/lib/net';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';

type Method = AssetInput['authorizationMethod'];

const METHOD_LABEL: Record<Method, string> = {
  dns_txt: 'Add a DNS TXT record',
  html_file: 'Upload an HTML file',
  approval: 'Approve with a written justification',
  internal_allowlist: 'Inside the Internal Network Allowlist',
};

function methodsFor(type: AssetType, exposure: 'internet' | 'internal'): Method[] {
  if (exposure === 'internal') {
    return ['server', 'database', 'website', 'api'].includes(type) ? ['internal_allowlist', 'approval'] : ['approval'];
  }
  if (type === 'domain') return ['dns_txt', 'approval'];
  if (type === 'website' || type === 'api') return ['dns_txt', 'html_file', 'approval'];
  return ['approval'];
}

function identifierProblem(type: AssetType, value: string, exposure: 'internet' | 'internal'): string | null {
  const v = value.trim();
  if (!v) return null;
  const host = hostOf(v);
  const checks: Record<AssetType, boolean> = {
    domain: isDomain(v),
    website: /^https?:\/\/\S+$/i.test(v),
    api: /^https?:\/\/\S+$/i.test(v),
    server: isIPv4(v) || isDomain(v),
    cloud: v.length >= 3,
    database: /^[a-z]+(\+[a-z]+)?:\/\/\S+$/i.test(v),
    repository: /^[\w.-]+\/[\w.-]+$/.test(v),
    image: /^[\w.\-/:@]+$/.test(v),
  };
  if (!checks[type]) return `Enter it like ${ASSET_PLACEHOLDER[type]}`;
  if (exposure === 'internet' && isIPv4(host) && isPrivateIPv4(host)) return 'This is a private address. Set exposure to Internal network.';
  return null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  defaultApplicationId?: string | null;
  defaultEnvironmentId?: string | null;
  onCreated?: (asset: Asset) => void;
}

/** Mounts the form fresh each time it opens. */
export function AddAssetModal(props: Props) {
  return props.open ? <AddAssetDialog {...props} /> : null;
}

function AddAssetDialog({ open, onClose, defaultApplicationId, defaultEnvironmentId, onCreated }: Props) {
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const [form, setForm] = useState({
    type: 'domain' as AssetType,
    identifier: '',
    label: '',
    applicationId: defaultApplicationId ?? '',
    environmentId: defaultEnvironmentId ?? '',
    exposure: 'internet' as 'internet' | 'internal',
    method: 'dns_txt' as Method,
    justification: '',
  });

  const activeApps = (apps.data ?? []).filter((a) => a.status === 'active');
  const app = activeApps.find((a) => a.id === form.applicationId);
  const methods = useMemo(() => methodsFor(form.type, form.exposure), [form.type, form.exposure]);
  const problem = identifierProblem(form.type, form.identifier, form.exposure);
  // Derived, not stored: fall back when the chosen method or environment no longer fits.
  const method = methods.includes(form.method) ? form.method : methods[0];
  const environmentId = app?.environments.some((e) => e.id === form.environmentId) ? form.environmentId : app?.environments[0]?.id ?? '';

  const create = useMutation({
    mutationFn: (input: AssetInput) => api.createAsset(input),
    onSuccess: (asset) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success(`${asset.label} added`);
      onClose();
      onCreated?.(asset);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (problem) return;
    create.mutate({
      type: form.type,
      identifier: form.identifier.trim(),
      label: form.label.trim(),
      applicationId: form.applicationId,
      environmentId,
      exposure: form.exposure,
      authorizationMethod: method,
      justification: method === 'approval' ? form.justification.trim() : undefined,
    });
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const ready = form.identifier.trim() && form.applicationId && environmentId && !problem && (method !== 'approval' || form.justification.trim().length >= 10);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Add an asset"
      description="Register something ShieldOps should watch: a domain, website, API, server, database, repository or image."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="asset-form" variant="primary" loading={create.isPending} disabled={!ready}>
            Add asset
          </Button>
        </>
      }
    >
      <form id="asset-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Application">
            {(id) => (
              <Select id={id} value={form.applicationId} onChange={set('applicationId')} required>
                <option value="" disabled>
                  Choose an application
                </option>
                {activeApps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Environment">
            {(id) => (
              <Select id={id} value={environmentId} onChange={set('environmentId')} disabled={!app} required>
                {(app?.environments ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Type">
            {(id) => (
              <Select id={id} value={form.type} onChange={set('type')}>
                {(Object.keys(ASSET_TYPE_LABEL) as AssetType[]).map((t) => (
                  <option key={t} value={t}>
                    {ASSET_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Reachable from">
            {(id) => (
              <Select id={id} value={form.exposure} onChange={set('exposure')}>
                <option value="internet">The internet</option>
                <option value="internal">Internal network only</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label="Address" error={problem}>
          {(id, d) => <Input id={id} aria-describedby={d} value={form.identifier} onChange={set('identifier')} placeholder={ASSET_PLACEHOLDER[form.type]} className="font-mono text-xs" required />}
        </Field>
        <Field label="Display name" hint="Optional. Defaults to the address.">
          {(id, d) => <Input id={id} aria-describedby={d} value={form.label} onChange={set('label')} placeholder="Portal API" />}
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">How will you prove you control it?</legend>
          {methods.map((m) => (
            <label key={m} className="flex cursor-pointer items-start gap-2.5 rounded border border-line px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5">
              <input type="radio" name="method" value={m} checked={method === m} onChange={() => setForm({ ...form, method: m })} className="mt-0.5 accent-[rgb(var(--accent))]" />
              <span>{METHOD_LABEL[m]}</span>
            </label>
          ))}
        </fieldset>
        {method === 'approval' && (
          <Field label="Justification" hint="Recorded in the audit log and notified to everyone. At least 10 characters.">
            {(id, d) => <Textarea id={id} aria-describedby={d} value={form.justification} onChange={set('justification')} placeholder="Our production server, managed by the IT team since 2024." />}
          </Field>
        )}
        <InlineError error={create.error} />
      </form>
    </Modal>
  );
}