import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { api, type TaskUpdate } from '@/api';
import type { RemediationTask, TaskVerification } from '@/types';
import { cn } from '@/lib/cn';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { PriorityBadge, TaskStatusText } from '@/components/ui/StatusLabels';
import { InlineError } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { dueText } from '@/lib/tasks';
import { JiraButton } from './JiraButton';

const LINK_PATH = { finding: '/findings/', incident: '/incidents/', error_group: '/errors/' } as const;

function Verification({ v }: { v: TaskVerification }) {
  const Icon = v.status === 'passed' ? CheckCircle2 : v.status === 'failed' ? XCircle : Clock;
  return (
    <div className={cn('flex gap-2 rounded border px-3 py-2 text-sm', v.status === 'passed' ? 'border-up/30 bg-up/10' : v.status === 'failed' ? 'border-down/30 bg-down/10' : 'border-degraded/30 bg-degraded/10')}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', v.status === 'passed' ? 'text-up' : v.status === 'failed' ? 'text-down' : 'animate-pulse text-degraded')} aria-hidden />
      <div>
        <p className="font-medium">{v.status === 'passed' ? 'Verified' : v.status === 'failed' ? 'Recheck failed' : 'Rechecking'}</p>
        <p className="text-muted">
          {v.method}. {v.detail}
        </p>
        <p className="text-xs text-muted">{formatDateTime(v.at)}</p>
      </div>
    </div>
  );
}

export function TaskDialog({ task: initial, onClose }: { task: RemediationTask; onClose: () => void }) {
  const qc = useQueryClient();
  // Poll while a recheck is running so the result appears without a reload.
  const live = useQuery({
    queryKey: ['tasks', { linkedId: initial.linkedId }],
    queryFn: () => api.listTasks({ linkedId: initial.linkedId }),
    refetchInterval: (q) => (q.state.data?.find((t) => t.id === initial.id)?.verification?.status === 'pending' && initial.linkedType !== 'error_group' ? 1500 : false),
  });
  const t = live.data?.find((x) => x.id === initial.id) ?? initial;
  // When a recheck finishes, refresh everything that shows the task or its finding.
  const verifyState = t.verification?.status;
  const prevVerify = useRef(verifyState);
  useEffect(() => {
    if (prevVerify.current === 'pending' && verifyState && verifyState !== 'pending') {
      ['tasks', 'sla', 'incident', 'finding', 'findings', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    }
    prevVerify.current = verifyState;
  }, [verifyState, qc]);
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const [note, setNote] = useState('');
  const [wontFix, setWontFix] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (input: TaskUpdate) => api.updateTask(t.id, input),
    onSuccess: (_r, v) => {
      ['tasks', 'sla', 'incident', 'finding', 'findings', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      if (v.status === 'ready_for_verification') toast.success('Recheck started. The result appears here.');
      if (v.status === 'wont_fix') setWontFix(null);
      if (v.note) setNote('');
    },
  });

  const due = dueText(t);
  const actions: { label: string; input: TaskUpdate; primary?: boolean }[] =
    t.status === 'todo'
      ? [{ label: 'Start work', input: { status: 'in_progress' }, primary: true }]
      : t.status === 'in_progress'
        ? [
            { label: 'Ready for verification', input: { status: 'ready_for_verification' }, primary: true },
            { label: 'Back to to do', input: { status: 'todo' } },
          ]
        : t.status === 'ready_for_verification'
          ? [{ label: 'Stop verifying', input: { status: 'in_progress' } }]
          : t.status === 'wont_fix'
            ? [{ label: 'Reopen', input: { status: 'todo' } }]
            : [];

  return (
    <Modal open onClose={onClose} size="lg" title={t.title} description={<Link to={`${LINK_PATH[t.linkedType]}${t.linkedId}`} className="text-accent hover:underline">{t.linkedTitle}</Link>}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <TaskStatusText status={t.status} />
          {t.priority && <PriorityBadge priority={t.priority} />}
          <JiraButton type="task" id={t.id} existing={t.externalRef} />
          <span className={cn('text-sm', due.tone)}>{due.text}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button key={a.label} size="sm" variant={a.primary ? 'primary' : 'secondary'} onClick={() => update.mutate(a.input)} disabled={update.isPending}>
                {a.label}
              </Button>
            ))}
            {['todo', 'in_progress'].includes(t.status) && (
              <Button size="sm" variant="ghost" onClick={() => setWontFix('')}>
                Won't fix
              </Button>
            )}
          </div>
        </div>
        {t.details && <p className="whitespace-pre-line text-sm">{t.details}</p>}
        {t.verification && <Verification v={t.verification} />}
        {t.status === 'wont_fix' && t.wontFixReason && <p className="rounded border border-line bg-sunken px-3 py-2 text-sm">Won't fix: {t.wontFixReason}</p>}
        {wontFix !== null && (
          <div className="space-y-2 rounded border border-line p-3">
            <Field label="Why won't this be fixed?" hint="At least 10 characters. Consider accepting the risk on the finding too.">
              {(id, d) => <Textarea id={id} aria-describedby={d} value={wontFix} onChange={(e) => setWontFix(e.target.value)} autoFocus />}
            </Field>
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={() => setWontFix(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" disabled={wontFix.trim().length < 10} onClick={() => update.mutate({ status: 'wont_fix', wontFixReason: wontFix })}>
                Close as won't fix
              </Button>
            </div>
          </div>
        )}
        <InlineError error={update.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Owner">
            {(id) => (
              <Select id={id} value={t.ownerId ?? ''} onChange={(e) => update.mutate({ ownerId: e.target.value || null })}>
                <option value="">Nobody</option>
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
          <Field label="Due date" hint={t.priority ? `The ${t.priority} SLA set this; change it only with a reason in the notes.` : undefined}>
            {(id, d) => (
              <Input
                id={id}
                aria-describedby={d}
                type="date"
                value={t.dueAt ? t.dueAt.slice(0, 10) : ''}
                onChange={(e) => update.mutate({ dueAt: e.target.value ? new Date(`${e.target.value}T18:00:00`).toISOString() : null })}
              />
            )}
          </Field>
        </div>
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({ note });
            }}
            className="flex gap-2"
          >
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" aria-label="Note" />
            <Button type="submit" disabled={!note.trim()}>
              Add
            </Button>
          </form>
          <ol className="mt-3 space-y-2 text-sm">
            {t.verificationHistory.map((v) => (
              <li key={v.at} className="text-muted">
                <span className={v.status === 'failed' ? 'text-down' : 'text-up'}>{v.status === 'failed' ? 'Recheck failed' : 'Recheck passed'}</span>: {v.detail}{' '}
                <span className="text-xs">({timeAgo(v.at)})</span>
              </li>
            ))}
            {t.notes.map((n) => (
              <li key={n.at + n.text}>
                <span className="font-medium">{n.actorName}</span> <span className="text-muted">{n.text}</span> <span className="text-xs text-muted">({timeAgo(n.at)})</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  );
}