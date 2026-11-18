import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { api, type ApplicationInput } from '@/api';
import type { Application, Criticality, EnvironmentType } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { useSession } from '@/store/session';

const STANDARD_ENVS: { name: string; type: EnvironmentType }[] = [
  { name: 'Production', type: 'production' },
  { name: 'Staging', type: 'staging' },
  { name: 'Development', type: 'development' },
];

const splitList = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

interface Props {
  open: boolean;
  onClose: () => void;
  application?: Application;
  onSaved?: (a: Application) => void;
}

/** Mounts the form fresh each time it opens, so it always starts from the current data. */
export function ApplicationFormModal(props: Props) {
  return props.open ? <ApplicationFormDialog {...props} /> : null;
}

function ApplicationFormDialog({ open, onClose, application, onSaved }: Props) {
  const qc = useQueryClient();
  const me = useSession((s) => s.session?.user.id ?? '');
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const [form, setForm] = useState(() =>
    application
      ? {
          name: application.name,
          description: application.description,
          ownerId: application.ownerId,
          criticality: application.criticality,
          techStack: application.techStack.join(', '),
          tags: application.tags.join(', '),
        }
      : { name: '', description: '', ownerId: me, criticality: 'medium' as Criticality, techStack: '', tags: '' },
  );
  const [envs, setEnvs] = useState<{ name: string; type: EnvironmentType }[]>(() =>
    application ? application.environments.map((e) => ({ name: e.name, type: e.type })) : [STANDARD_ENVS[0]],
  );
  const [customEnv, setCustomEnv] = useState('');

  const save = useMutation({
    mutationFn: (input: ApplicationInput) => (application ? api.updateApplication(application.id, input) : api.createApplication(input)),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['application', saved.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(application ? 'Application updated' : `${saved.name} created`);
      onClose();
      onSaved?.(saved);
    },
  });

  const toggleEnv = (env: { name: string; type: EnvironmentType }) =>
    setEnvs((cur) => (cur.some((e) => e.name === env.name) ? cur.filter((e) => e.name !== env.name) : [...cur, env]));

  const addCustom = () => {
    const name = customEnv.trim();
    if (!name || envs.some((e) => e.name.toLowerCase() === name.toLowerCase())) return;
    setEnvs([...envs, { name, type: 'custom' }]);
    setCustomEnv('');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({
      name: form.name.trim(),
      description: form.description.trim(),
      ownerId: form.ownerId,
      criticality: form.criticality,
      techStack: splitList(form.techStack),
      tags: splitList(form.tags),
      environments: envs,
    });
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={application ? `Edit ${application.name}` : 'New application'}
      description={application ? undefined : 'An application groups everything you monitor for one product: its domains, servers, databases and code.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="application-form" variant="primary" loading={save.isPending} disabled={!users.data || !form.name.trim() || !form.ownerId || envs.length === 0}>
            {application ? 'Save changes' : 'Create application'}
          </Button>
        </>
      }
    >
      <form id="application-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">{(id) => <Input id={id} value={form.name} onChange={set('name')} placeholder="Customer Portal" required autoFocus />}</Field>
          <Field label="Owner" hint="The person who gets assigned new issues by default.">
            {(id, d) => (
              <Select key={users.data?.length ?? 0} id={id} aria-describedby={d} value={form.ownerId} onChange={set('ownerId')} required>
                <option value="" disabled>
                  Choose a person
                </option>
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
        <Field label="What it does">{(id) => <Textarea id={id} value={form.description} onChange={set('description')} placeholder="Self-service portal where customers manage orders and invoices." />}</Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Criticality" hint="Raises the risk score of its issues.">
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={form.criticality} onChange={set('criticality')}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Select>
            )}
          </Field>
          <Field label="Tech stack" hint="Separate with commas.">
            {(id, d) => <Input id={id} aria-describedby={d} value={form.techStack} onChange={set('techStack')} placeholder="React, Node.js, MongoDB" />}
          </Field>
          <Field label="Tags" hint="Separate with commas.">
            {(id, d) => <Input id={id} aria-describedby={d} value={form.tags} onChange={set('tags')} placeholder="customer-facing" />}
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Environments</legend>
          <p className="mb-2 text-xs text-muted">Each environment gets its own assets, SDK key and alerts. Production issues alert at a higher severity.</p>
          <div className="flex flex-wrap gap-2">
            {STANDARD_ENVS.map((env) => (
              <label key={env.name} className="inline-flex cursor-pointer items-center gap-2 rounded border border-line px-3 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                <input type="checkbox" checked={envs.some((e) => e.name === env.name)} onChange={() => toggleEnv(env)} className="accent-[rgb(var(--accent))]" />
                {env.name}
              </label>
            ))}
            {envs
              .filter((e) => e.type === 'custom')
              .map((env) => (
                <span key={env.name} className="inline-flex items-center gap-1.5 rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm">
                  {env.name}
                  <button type="button" onClick={() => toggleEnv(env)} aria-label={`Remove ${env.name}`} className="text-muted hover:text-ink">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={customEnv}
              onChange={(e) => setCustomEnv(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder="Add another, e.g. UAT"
              aria-label="Custom environment name"
              className="max-w-xs"
            />
            <Button size="md" onClick={addCustom} disabled={!customEnv.trim()}>
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Button>
          </div>
        </fieldset>
        <InlineError error={save.error} />
      </form>
    </Modal>
  );
}