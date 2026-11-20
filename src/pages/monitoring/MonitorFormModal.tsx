import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type MonitorInput } from '@/api';
import type { Asset, Monitor } from '@/types';
import { isAuthorized } from '@/lib/assets';
import { hostOf } from '@/lib/net';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';

const TYPES_FOR_ASSET: Record<Asset['type'], Monitor['type'][]> = {
  domain: ['http', 'dns'],
  website: ['http', 'dns'],
  api: ['http', 'dns'],
  server: ['tcp'],
  database: ['tcp'],
  repository: [],
  image: [],
  cloud: [],
};

const DEFAULT_PORT: Partial<Record<string, string>> = { postgres: '5432', postgresql: '5432', mysql: '3306', mongodb: '27017', redis: '6379' };

function suggestTarget(asset: Asset, type: Monitor['type']): string {
  const id = asset.identifier.trim();
  if (type === 'http') return /^https?:\/\//i.test(id) ? id : `https://${id}`;
  if (type === 'dns') return hostOf(id);
  const scheme = id.match(/^([a-z+]+):\/\//i)?.[1]?.toLowerCase();
  const host = hostOf(id);
  const port = id.match(/:(\d{2,5})(\/|$)/)?.[1] ?? (scheme ? DEFAULT_PORT[scheme.split('+')[0]] : undefined) ?? '443';
  return `${host}:${port}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  monitor?: Monitor;
  defaultApplicationId?: string;
  onSaved?: (m: Monitor) => void;
}

export function MonitorFormModal(props: Props) {
  return props.open ? <MonitorFormDialog {...props} /> : null;
}

function MonitorFormDialog({ open, onClose, monitor, defaultApplicationId, onSaved }: Props) {
  const qc = useQueryClient();
  const assets = useQuery({ queryKey: ['assets', {}], queryFn: () => api.listAssets() });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

  const [assetId, setAssetId] = useState(monitor?.assetId ?? '');
  const [type, setType] = useState<Monitor['type']>(monitor?.type ?? 'http');
  const [form, setForm] = useState({
    name: monitor?.name ?? '',
    target: monitor?.target ?? '',
    intervalSec: monitor?.intervalSec ?? 0,
    timeoutMs: monitor?.timeoutMs ?? 10_000,
    downAfterFailures: monitor?.downAfterFailures ?? 0,
    expectedStatus: monitor?.expectedStatus ?? '200-299',
    keyword: monitor?.keyword ?? '',
    recordType: monitor?.recordType ?? ('A' as NonNullable<Monitor['recordType']>),
  });

  const eligible = useMemo(
    () =>
      (assets.data ?? []).filter(
        (a) => isAuthorized(a.authorization) && a.status === 'active' && TYPES_FOR_ASSET[a.type].length > 0 && (!defaultApplicationId || a.applicationId === defaultApplicationId),
      ),
    [assets.data, defaultApplicationId],
  );
  const asset = eligible.find((a) => a.id === assetId) ?? (monitor ? (assets.data ?? []).find((a) => a.id === monitor.assetId) : undefined);
  const types = asset ? TYPES_FOR_ASSET[asset.type] : (['http'] as Monitor['type'][]);
  const effectiveType = types.includes(type) ? type : types[0];
  const target = form.target || (asset ? suggestTarget(asset, effectiveType) : '');
  const intervalSec = form.intervalSec || settings.data?.monitoring.uptimeIntervalSec || 60;
  const downAfterFailures = form.downAfterFailures || settings.data?.monitoring.downAfterFailures || 3;
  const appName = (id: string) => apps.data?.find((a) => a.id === id)?.name ?? '';

  const save = useMutation({
    mutationFn: (input: MonitorInput) => (monitor ? api.updateMonitor(monitor.id, input) : api.createMonitor(input)),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ['monitors'] });
      qc.invalidateQueries({ queryKey: ['monitor', m.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(monitor ? 'Monitor updated' : `${m.name} is now being checked`);
      onClose();
      onSaved?.(m);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!asset) return;
    save.mutate({
      name: form.name.trim() || asset.label,
      type: effectiveType,
      assetId: asset.id,
      target: target.trim(),
      intervalSec,
      timeoutMs: form.timeoutMs,
      downAfterFailures,
      expectedStatus: effectiveType === 'http' ? form.expectedStatus : undefined,
      keyword: effectiveType === 'http' ? form.keyword : undefined,
      recordType: effectiveType === 'dns' ? form.recordType : undefined,
    });
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: ['intervalSec', 'timeoutMs', 'downAfterFailures'].includes(k) ? Number(e.target.value) : e.target.value });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={monitor ? `Edit ${monitor.name}` : 'New monitor'}
      description={monitor ? undefined : 'Checks one verified asset on a schedule. Only verified or approved assets can be monitored.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="monitor-form" variant="primary" loading={save.isPending} disabled={!asset || !target.trim()}>
            {monitor ? 'Save changes' : 'Start monitoring'}
          </Button>
        </>
      }
    >
      <form id="monitor-form" onSubmit={submit} className="space-y-4">
        {!monitor && (
          <Field
            label="Asset"
            hint={eligible.length === 0 && !assets.isLoading ? 'No verified websites, APIs, domains, servers or databases yet. Verify an asset first.' : undefined}
          >
            {(id, d) => (
              <Select
                id={id}
                aria-describedby={d}
                value={assetId}
                onChange={(e) => {
                  setAssetId(e.target.value);
                  setForm((f) => ({ ...f, target: '' }));
                }}
                required
              >
                <option value="" disabled>
                  Choose a verified asset
                </option>
                {eligible.map((a) => (
                  <option key={a.id} value={a.id}>
                    {appName(a.applicationId)}: {a.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Field label="Name">{(id) => <Input id={id} value={form.name} onChange={set('name')} placeholder={asset?.label ?? 'Portal home page'} />}</Field>
          <Field label="Check type">
            {(id) => (
              <Select id={id} value={effectiveType} onChange={(e) => (setType(e.target.value as Monitor['type']), setForm((f) => ({ ...f, target: '' })))} disabled={!!monitor || types.length < 2}>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t === 'http' ? 'HTTP request' : t === 'tcp' ? 'TCP port' : 'DNS lookup'}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={effectiveType === 'http' ? 'URL' : effectiveType === 'tcp' ? 'Host and port' : 'Hostname'}>
          {(id) => <Input id={id} value={target} onChange={set('target')} className="font-mono text-xs" required />}
        </Field>
        {effectiveType === 'http' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Expected status codes" hint="A range like 200-299, or a list like 200,301.">
              {(id, d) => <Input id={id} aria-describedby={d} value={form.expectedStatus} onChange={set('expectedStatus')} className="font-mono text-xs" />}
            </Field>
            <Field label="Page must contain" hint="Optional. Fails the check if this text is missing.">
              {(id, d) => <Input id={id} aria-describedby={d} value={form.keyword} onChange={set('keyword')} placeholder="Sign in" />}
            </Field>
          </div>
        )}
        {effectiveType === 'dns' && (
          <Field label="Record type">
            {(id) => (
              <Select id={id} value={form.recordType} onChange={set('recordType')} className="w-32">
                {['A', 'AAAA', 'CNAME', 'MX'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Check every">
            {(id) => (
              <Select id={id} value={intervalSec} onChange={set('intervalSec')}>
                {[30, 60, 120, 300, 600, 1800, 3600].map((s) => (
                  <option key={s} value={s}>
                    {s < 60 ? `${s} seconds` : s === 60 ? '1 minute' : s < 3600 ? `${s / 60} minutes` : '1 hour'}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Timeout">
            {(id) => (
              <Select id={id} value={form.timeoutMs} onChange={set('timeoutMs')}>
                {[5000, 10000, 20000, 30000].map((ms) => (
                  <option key={ms} value={ms}>
                    {ms / 1000} seconds
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Mark down after">
            {(id) => (
              <Select id={id} value={downAfterFailures} onChange={set('downAfterFailures')}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} failed {n === 1 ? 'check' : 'checks'}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <InlineError error={save.error} />
      </form>
    </Modal>
  );
}