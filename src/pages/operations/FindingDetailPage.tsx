import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api, type FindingUpdate } from '@/api';
import type { Finding, FindingStatus } from '@/types';
import { cn } from '@/lib/cn';
import { CRITICALITY_LABEL, SEVERITY_LABEL, SOURCE_LABEL, daysUntil, formatDate, formatDateTime, timeAgo } from '@/lib/format';
import { CONFIDENCE_WEIGHT, CRITICALITY_WEIGHT, EXPOSURE_WEIGHT, SEVERITY_WEIGHT, SLA_DAYS } from '@/lib/risk';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SeverityBadge } from '@/components/ui/Badge';
import { FindingStatusText, PriorityBadge } from '@/components/ui/StatusLabels';
import { ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { CreateTaskDialog } from './CreateTaskDialog';
import { CreateIncidentDialog } from './CreateIncidentDialog';
import { TasksTable } from './TasksTable';
import { AiPanel } from '@/components/ai/AiPanel';
import { Sparkles } from 'lucide-react';

const NEXT: Partial<Record<FindingStatus, { status: FindingStatus; label: string }[]>> = {
  open: [
    { status: 'acknowledged', label: 'Acknowledge' },
    { status: 'in_progress', label: 'Start work' },
  ],
  reopened: [{ status: 'in_progress', label: 'Start work' }],
  acknowledged: [{ status: 'in_progress', label: 'Start work' }],
  in_progress: [{ status: 'resolved', label: 'Mark fixed' }],
  resolved: [{ status: 'reopened', label: 'Reopen' }],
  accepted_risk: [{ status: 'reopened', label: 'Reopen' }],
  false_positive: [{ status: 'reopened', label: 'Reopen' }],
};

const CLOSED: FindingStatus[] = ['resolved', 'verified', 'accepted_risk', 'false_positive'];

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function FindingDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const finding = useQuery({ queryKey: ['finding', id], queryFn: () => api.getFinding(id) });
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const assets = useQuery({ queryKey: ['assets', {}], queryFn: () => api.listAssets() });
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const [note, setNote] = useState('');
  const [dialog, setDialog] = useState<'accept' | 'false_positive' | 'task' | 'incident' | 'ai' | null>(null);
  const tasks = useQuery({ queryKey: ['tasks', { linkedId: id }], queryFn: () => api.listTasks({ linkedId: id }) });

  const update = useMutation({
    mutationFn: (input: FindingUpdate) => api.updateFinding(id, input),
    onSuccess: (f) => {
      qc.setQueryData(['finding', id], f);
      qc.invalidateQueries({ queryKey: ['findings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if (finding.isLoading) return <Spinner />;
  if (finding.error) return <ErrorState error={finding.error} onRetry={() => finding.refetch()} />;
  const f = finding.data!;
  const app = apps.data?.find((a) => a.id === f.applicationId);
  const asset = assets.data?.find((a) => a.id === f.assetId);
  const days = f.dueAt ? daysUntil(f.dueAt) : null;
  const overdue = days !== null && days < 0 && !CLOSED.includes(f.status);

  const setStatus = (status: FindingStatus, label: string) =>
    update.mutate({ status }, { onSuccess: () => toast.success(label === 'Mark fixed' ? 'Marked fixed. The next scheduled check will verify it.' : `${label}: done`) });

  return (
    <>
      <PageHeader title={f.title} description={f.description}>
        <Link to="/findings" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Findings
        </Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-line bg-surface">
            <h2 className="border-b border-line px-4 py-3 font-semibold">Evidence</h2>
            <dl className="divide-y divide-line">
              {f.evidence.map((e) => (
                <div key={e.label} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <dt className="text-sm text-muted">{e.label}</dt>
                  <dd className="break-all font-mono text-xs">{e.value}</dd>
                </div>
              ))}
              <div className="grid gap-1 px-4 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)]">
                <dt className="text-sm text-muted">Found by</dt>
                <dd className="text-sm">
                  {SOURCE_LABEL[f.source]} check, first seen {formatDateTime(f.firstSeen)}, last seen {timeAgo(f.lastSeen)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Why it's {f.priority}</h2>
              <p className="text-sm text-muted">
                Risk score <span className="font-semibold tabular-nums text-ink">{f.riskScore}</span>, fix within {SLA_DAYS[f.priority]} days
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              {[
                ['Severity', SEVERITY_LABEL[f.severity], SEVERITY_WEIGHT[f.severity]],
                ['App criticality', app ? CRITICALITY_LABEL[app.criticality] : '—', app ? CRITICALITY_WEIGHT[app.criticality] : '—'],
                ['Exposure', asset?.exposure === 'internal' ? 'Internal' : 'Internet', asset ? EXPOSURE_WEIGHT[asset.exposure] : '—'],
                ['Confidence', f.confidence.charAt(0).toUpperCase() + f.confidence.slice(1), CONFIDENCE_WEIGHT[f.confidence]],
                ['Known exploited', f.knownExploited ? 'Yes' : 'No', f.knownExploited ? 1.5 : 1],
              ].map(([label, value, weight], i) => (
                <div key={label as string} className="rounded border border-line px-3 py-2">
                  <p className="text-xs text-muted">{label}</p>
                  <p className="font-medium">{value}</p>
                  <p className="font-mono text-xs text-muted">
                    {i > 0 && '× '}
                    {weight}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Remediation</h2>
              <Button size="sm" onClick={() => setDialog('task')}>
                Create task
              </Button>
            </div>
            {tasks.data?.length ? (
              <TasksTable tasks={tasks.data} showLinked={false} />
            ) : (
              <p className="rounded-lg border border-dashed border-line px-4 py-5 text-center text-sm text-muted">No task yet. Create one to track the fix and its verification.</p>
            )}
          </section>

          <section className="rounded-lg border border-line bg-surface">
            <h2 className="border-b border-line px-4 py-3 font-semibold">History</h2>
            <div className="border-b border-line px-4 py-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  update.mutate({ note }, { onSuccess: () => setNote('') });
                }}
                className="flex gap-2"
              >
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team" aria-label="Note" />
                <Button type="submit" disabled={!note.trim()} loading={update.isPending && !!note}>
                  Add note
                </Button>
              </form>
            </div>
            <ol className="divide-y divide-line">
              {f.history.map((h) => (
                <li key={h.at + h.text} className="px-4 py-2.5 text-sm">
                  <p>
                    <span className="font-medium">{h.actorName}</span> <span className="text-muted">{h.text.charAt(0).toLowerCase() + h.text.slice(1)}</span>
                  </p>
                  <p className="text-xs text-muted" title={formatDateTime(h.at)}>
                    {timeAgo(h.at)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="h-fit space-y-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={f.priority} score={f.riskScore} />
            <SeverityBadge severity={f.severity} />
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setDialog('ai')}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Explain with AI
            </Button>
          </div>
          <div>
            <p className="text-xs text-muted">Status</p>
            <FindingStatusText status={f.status} />
            {f.status === 'accepted_risk' && f.acceptedRisk && (
              <p className="mt-1 text-xs text-muted">
                Until {formatDate(f.acceptedRisk.expiresAt)}: {f.acceptedRisk.justification}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(NEXT[f.status] ?? []).map((n, i) => (
              <Button key={n.status} size="sm" variant={i === 0 ? 'primary' : 'secondary'} onClick={() => setStatus(n.status, n.label)} disabled={update.isPending}>
                {n.label}
              </Button>
            ))}
          </div>
          {!CLOSED.includes(f.status) && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <button type="button" className="text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => setDialog('accept')}>
                Accept the risk
              </button>
              <button type="button" className="text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => setDialog('false_positive')}>
                Mark as false positive
              </button>
              <button type="button" className="text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => setDialog('incident')}>
                Start an incident
              </button>
            </div>
          )}
          <InlineError error={update.error && !dialog ? update.error : null} />
          <Field label="Assigned to">
            {(fid) => (
              <Select
                id={fid}
                value={f.assigneeId ?? ''}
                onChange={(e) => update.mutate({ assigneeId: e.target.value || null }, { onSuccess: () => toast.success('Assignment saved') })}
              >
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
          <dl className="space-y-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-xs text-muted">Due</dt>
              <dd className={cn(overdue && 'font-medium text-down')}>
                {CLOSED.includes(f.status) ? '—' : overdue ? `${-days!} ${days === -1 ? 'day' : 'days'} overdue` : formatDate(f.dueAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Application</dt>
              <dd>
                {app ? (
                  <Link to={`/applications/${app.id}/issues`} className="hover:underline">
                    {app.name}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Asset</dt>
              <dd className="break-all font-mono text-xs">{asset?.identifier ?? '—'}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <AcceptRiskDialog open={dialog === 'accept'} finding={f} onClose={() => setDialog(null)} onSubmit={(input) => update.mutateAsync(input)} />
      <FalsePositiveDialog open={dialog === 'false_positive'} onClose={() => setDialog(null)} onSubmit={(input) => update.mutateAsync(input)} />
      {dialog === 'ai' && <AiPanel context={{ type: 'finding', id: f.id }} title={f.title} firstQuestion="Explain this finding" onClose={() => setDialog(null)} />}
      {dialog === 'task' && <CreateTaskDialog linkedType="finding" linkedId={f.id} linkedTitle={f.title} suggestion={`Fix: ${f.title}`} onClose={() => setDialog(null)} />}
      {dialog === 'incident' && (
        <CreateIncidentDialog
          preset={{ title: f.title, summary: f.description, severity: f.severity, applicationIds: [f.applicationId], links: [{ type: 'finding', id: f.id, title: f.title }] }}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function AcceptRiskDialog(props: { open: boolean; finding: Finding; onClose: () => void; onSubmit: (i: FindingUpdate) => Promise<unknown> }) {
  return props.open ? <AcceptRiskForm {...props} /> : null;
}

function AcceptRiskForm({ open, onClose, onSubmit }: { open: boolean; finding: Finding; onClose: () => void; onSubmit: (i: FindingUpdate) => Promise<unknown> }) {
  const [justification, setJustification] = useState('');
  const [until, setUntil] = useState(inDays(90));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ status: 'accepted_risk', acceptedRisk: { justification, expiresAt: new Date(`${until}T23:59:59`).toISOString() } });
      toast.success('Risk accepted. It reopens on the review date.');
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Accept this risk"
      description="Use this when the team decides not to fix something for now. The finding reopens on the review date, and everyone can see your reason."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={justification.trim().length < 10 || !until}>
            Accept risk
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Why is this acceptable?" hint="At least 10 characters.">
          {(id, d) => <Textarea id={id} aria-describedby={d} value={justification} onChange={(e) => setJustification(e.target.value)} autoFocus />}
        </Field>
        <Field label="Review on">{(id) => <Input id={id} type="date" value={until} min={inDays(1)} onChange={(e) => setUntil(e.target.value)} className="w-48" />}</Field>
        <InlineError error={error} />
      </div>
    </Modal>
  );
}

function FalsePositiveDialog(props: { open: boolean; onClose: () => void; onSubmit: (i: FindingUpdate) => Promise<unknown> }) {
  return props.open ? <FalsePositiveForm {...props} /> : null;
}

function FalsePositiveForm({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (i: FindingUpdate) => Promise<unknown> }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit({ status: 'false_positive', note });
      toast.success('Marked as false positive. Future checks will not raise it again.');
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Mark as false positive"
      description="ShieldOps stops raising this exact finding. You can reopen it later."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={note.trim().length < 5}>
            Mark false positive
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Why is it not a real issue?">{(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />}</Field>
        <InlineError error={error} />
      </div>
    </Modal>
  );
}