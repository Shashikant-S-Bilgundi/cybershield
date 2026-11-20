import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/api';
import type { AlertChannel, EscalationPolicy, Severity } from '@/types';
import { CHANNEL_LABEL, SEVERITY_LABEL } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Menu } from '@/components/ui/Menu';
import { Modal } from '@/components/ui/Modal';
import { InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';

type Draft = Omit<EscalationPolicy, 'id'> & { id?: string };
const BLANK: Draft = { name: '', severities: ['critical'], repeat: false, enabled: true, steps: [{ afterMinutes: 0, targets: ['all'], channels: ['in_app', 'email'] }] };

export function EscalationSection() {
  const qc = useQueryClient();
  const policies = useQuery({ queryKey: ['escalation-policies'], queryFn: api.listEscalationPolicies });
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const [editing, setEditing] = useState<Draft | null>(null);
  const who = (t: 'all' | string) => (t === 'all' ? 'everyone' : users.data?.find((u) => u.id === t)?.name ?? 'someone');
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteEscalationPolicy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escalation-policies'] });
      toast.success('Policy deleted');
    },
  });

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Escalation policies</h2>
          <p className="max-w-3xl text-sm text-muted">If nobody acknowledges an alert, ShieldOps notifies more people, step by step. Acknowledging stops it.</p>
        </div>
        <Button onClick={() => setEditing(structuredClone(BLANK))}>
          <Plus className="h-4 w-4" aria-hidden />
          New policy
        </Button>
      </div>
      {policies.isLoading ? (
        <Spinner />
      ) : !policies.data?.length ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No escalation policies. Alerts notify once, through their rule's channels.</p>
      ) : (
        <ul className="space-y-3">
          {policies.data.map((p) => (
            <li key={p.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {p.name} {!p.enabled && <span className="text-xs font-normal text-muted">(off)</span>}
                  </p>
                  <p className="text-xs text-muted">
                    For {p.severities.map((s) => SEVERITY_LABEL[s].toLowerCase()).join(' and ')} alerts{p.repeat ? ', repeats until acknowledged' : ''}
                  </p>
                </div>
                <Menu
                  actions={[
                    { label: 'Edit', onSelect: () => setEditing(structuredClone(p)) },
                    { label: 'Delete', danger: true, onSelect: () => remove.mutate(p.id) },
                  ]}
                />
              </div>
              <ol className="flex flex-wrap items-center gap-2 text-sm">
                {p.steps.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {i > 0 && <span className="text-muted" aria-hidden>→</span>}
                    <span className="rounded border border-line px-2 py-1">
                      <span className="text-xs text-muted">{s.afterMinutes === 0 ? 'At once' : `After ${s.afterMinutes} min`}: </span>
                      {s.targets.map(who).join(', ')} <span className="text-xs text-muted">by {s.channels.map((c) => CHANNEL_LABEL[c]).join(', ')}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
      {editing && <PolicyDialog draft={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function PolicyDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const [p, setP] = useState<Draft>(draft);
  const save = useMutation({
    mutationFn: () => api.saveEscalationPolicy(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escalation-policies'] });
      toast.success('Escalation policy saved');
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const setStep = (i: number, patch: Partial<Draft['steps'][number]>) => setP({ ...p, steps: p.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const toggleSev = (s: Severity) => setP({ ...p, severities: p.severities.includes(s) ? p.severities.filter((x) => x !== s) : [...p.severities, s] });
  const active = (users.data ?? []).filter((u) => u.status === 'active');

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={p.id ? 'Edit escalation policy' : 'New escalation policy'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="esc-form" variant="primary" loading={save.isPending}>
            Save policy
          </Button>
        </>
      }
    >
      <form id="esc-form" onSubmit={submit} className="space-y-4">
        <Field label="Name">{(id) => <Input id={id} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Critical production" />}</Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Applies to</legend>
          <div className="flex flex-wrap gap-2">
            {(['critical', 'high', 'medium', 'low'] as Severity[]).map((s) => (
              <label key={s} className="inline-flex cursor-pointer items-center gap-2 rounded border border-line px-3 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                <input type="checkbox" checked={p.severities.includes(s)} onChange={() => toggleSev(s)} className="accent-[rgb(var(--accent))]" />
                {SEVERITY_LABEL[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Steps</legend>
          {p.steps.map((s, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded border border-line p-2">
              <Field label="After (minutes)">
                {(id) => <Input id={id} type="number" min={0} value={s.afterMinutes} onChange={(e) => setStep(i, { afterMinutes: Number(e.target.value) })} className="w-24" disabled={i === 0} />}
              </Field>
              <Field label="Notify">
                {(id) => (
                  <Select id={id} value={s.targets[0]} onChange={(e) => setStep(i, { targets: [e.target.value] })} className="w-44">
                    <option value="all">Everyone</option>
                    {active.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="flex flex-wrap gap-2 pb-1.5">
                {(['in_app', 'email', 'slack', 'webhook'] as AlertChannel[]).map((c) => (
                  <label key={c} className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={s.channels.includes(c)}
                      onChange={() => setStep(i, { channels: s.channels.includes(c) ? s.channels.filter((x) => x !== c) : [...s.channels, c] })}
                      className="accent-[rgb(var(--accent))]"
                    />
                    {CHANNEL_LABEL[c]}
                  </label>
                ))}
              </div>
              {i > 0 && (
                <button type="button" onClick={() => setP({ ...p, steps: p.steps.filter((_, j) => j !== i) })} className="ml-auto rounded p-1.5 text-muted hover:bg-sunken" aria-label="Remove step">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setP({ ...p, steps: [...p.steps, { afterMinutes: (p.steps.at(-1)?.afterMinutes ?? 0) + 15, targets: ['all'], channels: ['email'] }] })}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add step
          </Button>
        </fieldset>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={p.repeat} onChange={(e) => setP({ ...p, repeat: e.target.checked })} className="accent-[rgb(var(--accent))]" />
            Repeat the last step until someone acknowledges
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={p.enabled} onChange={(e) => setP({ ...p, enabled: e.target.checked })} className="accent-[rgb(var(--accent))]" />
            Turned on
          </label>
        </div>
        <InlineError error={save.error} />
      </form>
    </Modal>
  );
}