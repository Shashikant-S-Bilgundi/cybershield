import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type IncidentInput } from '@/api';
import type { LinkedType, Severity } from '@/types';
import { SEVERITY_LABEL } from '@/lib/format';
import { useSession } from '@/store/session';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';

export interface IncidentPreset {
  title?: string;
  summary?: string;
  severity?: Severity;
  applicationIds?: string[];
  links?: { type: LinkedType; id: string; title: string }[];
}

export function CreateIncidentDialog({ preset = {}, onClose }: { preset?: IncidentPreset; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useSession((s) => s.session?.user.id ?? null);
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const [form, setForm] = useState({
    title: preset.title ?? '',
    summary: preset.summary ?? '',
    severity: preset.severity ?? ('high' as Severity),
    applicationIds: preset.applicationIds ?? [],
    ownerId: me,
  });

  const create = useMutation({
    mutationFn: (input: IncidentInput) => api.createIncident(input),
    onSuccess: (inc) => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`${inc.ref} opened`);
      onClose();
      navigate(`/incidents/${inc.id}`);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ ...form, links: preset.links?.map(({ type, id }) => ({ type, id })) });
  };
  const toggleApp = (appId: string) =>
    setForm((f) => ({ ...f, applicationIds: f.applicationIds.includes(appId) ? f.applicationIds.filter((x) => x !== appId) : [...f.applicationIds, appId] }));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Start an incident"
      description="An incident gathers the alerts, findings and errors behind one problem, with an owner and a timeline."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="incident-form" variant="primary" loading={create.isPending} disabled={!form.title.trim() || (!form.applicationIds.length && !preset.links?.length)}>
            Open incident
          </Button>
        </>
      }
    >
      <form id="incident-form" onSubmit={submit} className="space-y-4">
        <Field label="What's happening">{(id) => <Input id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Customers can't log in to the portal" autoFocus />}</Field>
        <Field label="Details" hint="Optional. What you know so far, and who is affected.">
          {(id, d) => <Textarea id={id} aria-describedby={d} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Severity">
            {(id) => (
              <Select id={id} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })}>
                {(['critical', 'high', 'medium', 'low'] as Severity[]).map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Owner">
            {(id) => (
              <Select id={id} value={form.ownerId ?? ''} onChange={(e) => setForm({ ...form, ownerId: e.target.value || null })}>
                <option value="">Nobody yet</option>
                {(users.data ?? [])
                  .filter((u) => u.status === 'active')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Affected applications</legend>
          <div className="flex flex-wrap gap-2">
            {(apps.data ?? [])
              .filter((a) => a.status === 'active')
              .map((a) => (
                <label key={a.id} className="inline-flex cursor-pointer items-center gap-2 rounded border border-line px-3 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                  <input type="checkbox" checked={form.applicationIds.includes(a.id)} onChange={() => toggleApp(a.id)} className="accent-[rgb(var(--accent))]" />
                  {a.name}
                </label>
              ))}
          </div>
        </fieldset>
        {!!preset.links?.length && (
          <div>
            <p className="mb-1 text-sm font-medium">Linked</p>
            <ul className="space-y-1 text-sm text-muted">
              {preset.links.map((l) => (
                <li key={l.type + l.id}>
                  {l.type === 'alert' ? 'Alert' : l.type === 'finding' ? 'Finding' : 'Error'}: {l.title}
                </li>
              ))}
            </ul>
          </div>
        )}
        <InlineError error={create.error} />
      </form>
    </Modal>
  );
}