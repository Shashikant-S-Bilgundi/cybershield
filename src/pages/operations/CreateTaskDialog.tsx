import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type TaskInput } from '@/api';
import type { RemediationTask } from '@/types';
import { useSession } from '@/store/session';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';

export function CreateTaskDialog({
  linkedType,
  linkedId,
  linkedTitle,
  suggestion = '',
  onClose,
}: {
  linkedType: RemediationTask['linkedType'];
  linkedId: string;
  linkedTitle: string;
  suggestion?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const me = useSession((s) => s.session?.user.id ?? null);
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const [form, setForm] = useState({ title: suggestion, details: '', ownerId: me });

  const create = useMutation({
    mutationFn: (input: TaskInput) => api.createTask(input),
    onSuccess: (t) => {
      ['tasks', 'sla', 'incident', 'finding', 'findings'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(t.dueAt ? `Task created, due ${new Date(t.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'Task created');
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ ...form, linkedType, linkedId });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Create a remediation task"
      description={
        <>
          For <span className="text-ink">{linkedTitle}</span>. The due date follows the SLA for its priority, and the task is only verified when a recheck passes.
        </>
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="task-form" variant="primary" loading={create.isPending} disabled={!form.title.trim()}>
            Create task
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="space-y-4">
        <Field label="What needs doing">{(id) => <Input id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />}</Field>
        <Field label="Details" hint="Optional. Steps, links, or what done looks like.">
          {(id, d) => <Textarea id={id} aria-describedby={d} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />}
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
        <InlineError error={create.error} />
      </form>
    </Modal>
  );
}