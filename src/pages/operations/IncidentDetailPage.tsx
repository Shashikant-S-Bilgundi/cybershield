import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Link2, Plus, X } from 'lucide-react';
import { api, type IncidentUpdate } from '@/api';
import type { Incident, IncidentStatus, LinkedType, Severity } from '@/types';
import { cn } from '@/lib/cn';
import { INCIDENT_STATUS_LABEL, SEVERITY_LABEL, durationBetween, formatDateTime, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SeverityBadge } from '@/components/ui/Badge';
import { IncidentStatusText } from '@/components/ui/StatusLabels';
import { ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { TasksTable } from './TasksTable';
import { CreateTaskDialog } from './CreateTaskDialog';
import { AiPanel } from '@/components/ai/AiPanel';
import { JiraButton } from './JiraButton';
import { Sparkles } from 'lucide-react';

const NEXT: Record<IncidentStatus, { status: IncidentStatus; label: string }[]> = {
  new: [
    { status: 'acknowledged', label: 'Acknowledge' },
    { status: 'investigating', label: 'Start investigating' },
  ],
  acknowledged: [
    { status: 'investigating', label: 'Start investigating' },
    { status: 'remediating', label: 'Start fixing' },
  ],
  investigating: [
    { status: 'remediating', label: 'Start fixing' },
    { status: 'resolved', label: 'Resolve' },
  ],
  remediating: [{ status: 'resolved', label: 'Resolve' }],
  reopened: [
    { status: 'investigating', label: 'Start investigating' },
    { status: 'resolved', label: 'Resolve' },
  ],
  resolved: [
    { status: 'closed', label: 'Close' },
    { status: 'reopened', label: 'Reopen' },
  ],
  closed: [{ status: 'reopened', label: 'Reopen' }],
};

const LINK_PATH: Record<LinkedType, string> = { alert: '/alerts', finding: '/findings/', error_group: '/errors/' };
const LINK_LABEL: Record<LinkedType, string> = { alert: 'Alert', finding: 'Finding', error_group: 'Error' };

export function IncidentDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const incident = useQuery({ queryKey: ['incident', id], queryFn: () => api.getIncident(id) });
  const tasks = useQuery({ queryKey: ['tasks', { linkedId: id }], queryFn: () => api.listTasks({ linkedId: id }) });
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const [note, setNote] = useState('');
  const [linking, setLinking] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const refresh = (inc: Incident) => {
    qc.setQueryData(['incident', id], inc);
    qc.invalidateQueries({ queryKey: ['incidents'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const update = useMutation({
    mutationFn: (input: IncidentUpdate) => api.updateIncident(id, input),
    onSuccess: (inc, v) => {
      refresh(inc);
      if (v.status) toast.success(`${inc.ref} is now ${INCIDENT_STATUS_LABEL[inc.status].toLowerCase()}`);
      if (v.note) setNote('');
    },
  });
  const unlink = useMutation({ mutationFn: (l: { type: LinkedType; id: string }) => api.unlinkFromIncident(id, l), onSuccess: refresh });

  if (incident.isLoading) return <Spinner />;
  if (incident.error) return <ErrorState error={incident.error} onRetry={() => incident.refetch()} />;
  const inc = incident.data!;
  const closedState = inc.status === 'resolved' || inc.status === 'closed';
  const needsSummary = inc.severity === 'critical' && inc.postIncident.length < 40;

  return (
    <>
      <PageHeader
        title={inc.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{inc.ref}</span>
            <SeverityBadge severity={inc.severity} />
            <IncidentStatusText status={inc.status} />
            <span>
              open for {durationBetween(inc.openedAt, inc.resolvedAt ?? undefined)}
              {inc.resolvedAt ? ' until resolved' : ''}
            </span>
          </span>
        }
        actions={NEXT[inc.status].map((n, i) => (
          <Button
            key={n.status}
            variant={i === 0 ? 'primary' : 'secondary'}
            onClick={() => update.mutate({ status: n.status })}
            disabled={update.isPending || (n.status === 'closed' && needsSummary)}
            title={n.status === 'closed' && needsSummary ? 'Write the post-incident summary first' : undefined}
          >
            {n.label}
          </Button>
        ))}
      >
        <Link to="/incidents" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Incidents
        </Link>
      </PageHeader>
      <InlineError error={update.error} />

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {inc.summary && <p className="text-sm">{inc.summary}</p>}

          <section className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-semibold">Evidence</h2>
              <Button size="sm" variant="ghost" onClick={() => setLinking(true)}>
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                Link more
              </Button>
            </div>
            {inc.linked.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">Nothing linked yet. Link the alerts, findings and errors behind this incident.</p>
            ) : (
              <ul className="divide-y divide-line">
                {inc.linked.map((l) => (
                  <li key={l.type + l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-14 shrink-0 text-xs text-muted">{LINK_LABEL[l.type]}</span>
                    {l.severity ? <SeverityBadge severity={l.severity} /> : <span className="w-[58px]" />}
                    <Link to={l.type === 'alert' ? LINK_PATH.alert : `${LINK_PATH[l.type]}${l.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      {l.title}
                    </Link>
                    <button type="button" onClick={() => unlink.mutate({ type: l.type, id: l.id })} className="rounded p-1 text-muted hover:bg-sunken hover:text-ink" aria-label={`Unlink ${l.title}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Remediation tasks</h2>
              <Button size="sm" onClick={() => setTaskOpen(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New task
              </Button>
            </div>
            {tasks.isLoading ? <Spinner /> : !tasks.data?.length ? <p className="rounded-lg border border-dashed border-line px-4 py-5 text-center text-sm text-muted">No tasks yet.</p> : <TasksTable tasks={tasks.data} showLinked={false} />}
          </section>

          <TextSection
            key={`rc-${inc.rootCause}`}
            title="Root cause"
            hint="What made this happen, not just what broke."
            value={inc.rootCause}
            onSave={(v) => update.mutateAsync({ rootCause: v })}
          />
          {(closedState || inc.severity === 'critical') && (
            <TextSection
              key={`pi-${inc.postIncident}`}
              title="Post-incident summary"
              hint={
                inc.severity === 'critical'
                  ? 'Required before a critical incident can be closed. Cover what happened, the impact, and what changed so it does not happen again.'
                  : 'What happened, the impact, and what changed.'
              }
              value={inc.postIncident}
              onSave={(v) => update.mutateAsync({ postIncident: v })}
              rows={6}
            />
          )}

          <section className="rounded-lg border border-line bg-surface">
            <h2 className="border-b border-line px-4 py-3 font-semibold">Timeline</h2>
            <div className="border-b border-line px-4 py-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  update.mutate({ note });
                }}
                className="flex gap-2"
              >
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you find or change?" aria-label="Timeline note" />
                <Button type="submit" disabled={!note.trim()}>
                  Add
                </Button>
              </form>
            </div>
            <ol className="divide-y divide-line">
              {inc.timeline.map((e, i) => (
                <li key={e.at + i} className="flex gap-3 px-4 py-2.5 text-sm">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', e.kind === 'note' ? 'bg-low' : e.kind === 'task' ? 'bg-up' : e.kind === 'link' ? 'bg-unknown' : 'bg-accent')} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-medium">{e.actorName}</span> <span className="text-muted">{e.text.charAt(0).toLowerCase() + e.text.slice(1)}</span>
                    </p>
                    <p className="text-xs text-muted" title={formatDateTime(e.at)}>
                      {timeAgo(e.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="h-fit space-y-4 rounded-lg border border-line bg-surface p-4 text-sm">
          <Button size="sm" className="w-full" onClick={() => setAiOpen(true)}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Summarise with AI
          </Button>
          <JiraButton type="incident" id={inc.id} existing={inc.externalRef} />
          <Field label="Owner">
            {(fid) => (
              <Select id={fid} value={inc.ownerId ?? ''} onChange={(e) => update.mutate({ ownerId: e.target.value || null })}>
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
          <Field label="Severity">
            {(fid) => (
              <Select id={fid} value={inc.severity} onChange={(e) => update.mutate({ severity: e.target.value as Severity })}>
                {(['critical', 'high', 'medium', 'low'] as Severity[]).map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <dl className="space-y-3 border-t border-line pt-3">
            <div>
              <dt className="text-xs text-muted">Affected applications</dt>
              <dd className="flex flex-col">
                {inc.applicationIds.map((a) => (
                  <Link key={a} to={`/applications/${a}/issues`} className="hover:underline">
                    {apps.data?.find((x) => x.id === a)?.name ?? '—'}
                  </Link>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Opened</dt>
              <dd>{formatDateTime(inc.openedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Time to acknowledge</dt>
              <dd>{inc.acknowledgedAt ? durationBetween(inc.openedAt, inc.acknowledgedAt) : <span className="text-degraded">Not acknowledged</span>}</dd>
            </div>
            {inc.resolvedAt && (
              <div>
                <dt className="text-xs text-muted">Resolved</dt>
                <dd>{formatDateTime(inc.resolvedAt)}</dd>
              </div>
            )}
            {inc.closedAt && (
              <div>
                <dt className="text-xs text-muted">Closed</dt>
                <dd>{formatDateTime(inc.closedAt)}</dd>
              </div>
            )}
          </dl>
        </aside>
      </div>

      {linking && <LinkDialog incident={inc} onClose={() => setLinking(false)} onLinked={refresh} />}
      {aiOpen && <AiPanel context={{ type: 'incident', id: inc.id }} title={`${inc.ref} ${inc.title}`} firstQuestion="Summarise this incident" onClose={() => setAiOpen(false)} />}
      {taskOpen && <CreateTaskDialog linkedType="incident" linkedId={inc.id} linkedTitle={`${inc.ref} ${inc.title}`} onClose={() => setTaskOpen(false)} />}
    </>
  );
}

function TextSection({ title, hint, value, onSave, rows = 3 }: { title: string; hint: string; value: string; onSave: (v: string) => Promise<unknown>; rows?: number }) {
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await onSave(text);
      toast.success(`${title} saved`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={rows} aria-label={title} />
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={save} loading={busy} disabled={text.trim() === value}>
          Save
        </Button>
      </div>
    </section>
  );
}

function LinkDialog({ incident, onClose, onLinked }: { incident: Incident; onClose: () => void; onLinked: (i: Incident) => void }) {
  const [type, setType] = useState<LinkedType>('alert');
  const [itemId, setItemId] = useState('');
  const alerts = useQuery({ queryKey: ['alerts', { status: 'active' }], queryFn: () => api.listAlerts({ status: 'active' }) });
  const findings = useQuery({ queryKey: ['findings', { status: 'active' }], queryFn: () => api.listFindings({ status: 'active' }) });
  const errors = useQuery({ queryKey: ['error-groups', { status: 'open' }], queryFn: () => api.listErrorGroups({ status: 'open' }) });
  const linked = new Set(incident.linked.map((l) => l.type + l.id));
  const options =
    type === 'alert'
      ? (alerts.data ?? []).map((a) => ({ id: a.id, label: a.title }))
      : type === 'finding'
        ? (findings.data ?? []).map((f) => ({ id: f.id, label: `${f.priority}: ${f.title}` }))
        : (errors.data ?? []).map((g) => ({ id: g.id, label: `${g.type}: ${g.message}` }));
  const link = useMutation({
    mutationFn: () => api.linkToIncident(incident.id, { type, id: itemId }),
    onSuccess: (inc) => {
      onLinked(inc);
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Link to ${incident.ref}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => link.mutate()} loading={link.isPending} disabled={!itemId}>
            Link
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Type">
          {(fid) => (
            <Select id={fid} value={type} onChange={(e) => (setType(e.target.value as LinkedType), setItemId(''))}>
              <option value="alert">Alert</option>
              <option value="finding">Finding</option>
              <option value="error_group">Error</option>
            </Select>
          )}
        </Field>
        <Field label="Item">
          {(fid) => (
            <Select id={fid} value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="" disabled>
                Choose one
              </option>
              {options
                .filter((o) => !linked.has(type + o.id))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <InlineError error={link.error} />
      </div>
    </Modal>
  );
}