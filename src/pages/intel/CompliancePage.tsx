import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { api } from '@/api';
import type { ControlResult, ControlStatus, FrameworkId } from '@/types';
import { cn } from '@/lib/cn';
import { CONTROL_STATUS_LABEL, formatDate, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';

const TONE: Record<ControlStatus, string> = { met: 'text-up', partial: 'text-degraded', not_met: 'text-down', manual: 'text-muted' };
const ORDER: ControlStatus[] = ['not_met', 'partial', 'manual', 'met'];

export function CompliancePage() {
  const qc = useQueryClient();
  const frameworks = useQuery({ queryKey: ['frameworks'], queryFn: api.listFrameworks });
  const enabled = (frameworks.data ?? []).filter((f) => f.enabled);
  const [picked, setPicked] = useState<FrameworkId | null>(null);
  const current = enabled.find((f) => f.id === picked) ?? enabled[0];
  const report = useQuery({ queryKey: ['compliance', current?.id], queryFn: () => api.getCompliance(current!.id), enabled: !!current });
  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: FrameworkId; on: boolean }) => api.setFrameworkEnabled(id, on),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frameworks'] }),
  });
  const [attesting, setAttesting] = useState<ControlResult | null>(null);

  return (
    <>
      <PageHeader title="Compliance readiness" description="How the evidence in ShieldOps lines up with the frameworks you follow. Use it to prepare for an audit, not as a substitute for one." />
      <div className="mb-5 flex gap-3 rounded-lg border border-line bg-surface p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="text-muted">
          Statuses are worked out from live data each time you open this page. Controls ShieldOps cannot see, such as backups or time sync, need your own evidence. This is not a certification or an audit opinion.
        </p>
      </div>
      {frameworks.isLoading ? (
        <Spinner />
      ) : (
        <>
          <fieldset className="mb-6">
            <legend className="mb-2 text-sm font-medium">Frameworks you track</legend>
            <div className="flex flex-wrap gap-2">
              {(frameworks.data ?? []).map((f) => (
                <label key={f.id} className="inline-flex cursor-pointer items-center gap-2 rounded border border-line px-3 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10" title={f.description}>
                  <input type="checkbox" checked={f.enabled} onChange={(e) => toggle.mutate({ id: f.id, on: e.target.checked })} className="accent-[rgb(var(--accent))]" />
                  {f.name} <span className="text-xs text-muted">{f.version}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {!current ? (
            <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Choose at least one framework.</p>
          ) : (
            <>
              <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
                {enabled.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={current.id === f.id}
                    onClick={() => setPicked(f.id)}
                    className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', current.id === f.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              {report.isLoading ? (
                <Spinner />
              ) : report.error ? (
                <ErrorState error={report.error} onRetry={() => report.refetch()} />
              ) : (
                <>
                  <section className="mb-5 flex flex-wrap items-center gap-6 rounded-lg border border-line bg-surface p-4">
                    <div>
                      <p className="text-xs text-muted">Readiness</p>
                      <p className="text-3xl font-semibold tabular-nums">{report.data!.score}%</p>
                    </div>
                    <div className="h-2 min-w-[200px] flex-1 overflow-hidden rounded-full bg-sunken" role="meter" aria-valuenow={report.data!.score} aria-valuemin={0} aria-valuemax={100} aria-label="Readiness">
                      <div className={cn('h-full rounded-full', report.data!.score >= 80 ? 'bg-up' : report.data!.score >= 50 ? 'bg-degraded' : 'bg-down')} style={{ width: `${report.data!.score}%` }} />
                    </div>
                    <p className="text-sm text-muted">
                      {ORDER.map((st) => `${report.data!.controls.filter((c) => c.status === st).length} ${CONTROL_STATUS_LABEL[st].toLowerCase()}`).join(', ')}
                    </p>
                  </section>
                  <ul className="space-y-3">
                    {[...report.data!.controls]
                      .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
                      .map((c) => (
                        <li key={c.id} className="rounded-lg border border-line bg-surface p-4">
                          <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                            <div className="min-w-[260px] flex-1">
                              <p className="font-medium">
                                <span className="mr-2 font-mono text-xs text-muted">{c.code}</span>
                                {c.title}
                              </p>
                            </div>
                            <div className="w-44 text-right">
                              {c.status === 'manual' && c.attestation ? (
                                <>
                                  <p className={cn('text-sm font-medium', c.attestation.status === 'met' ? 'text-up' : 'text-down')}>{c.attestation.status === 'met' ? 'Met (your evidence)' : 'Not met (your record)'}</p>
                                  <p className="text-xs text-muted">recorded {timeAgo(c.attestation.at)}</p>
                                </>
                              ) : (
                                <p className={cn('text-sm font-medium', TONE[c.status])}>{CONTROL_STATUS_LABEL[c.status]}</p>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 grid gap-3 text-sm md:grid-cols-2">
                            <div>
                              <p className="text-xs font-medium text-muted">Evidence</p>
                              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                                {c.evidence.filter(Boolean).map((e) => (
                                  <li key={e}>{e}</li>
                                ))}
                                {c.attestation && <li>{c.attestation.note}</li>}
                              </ul>
                            </div>
                            {c.gaps.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted">Gaps</p>
                                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-down">
                                  {c.gaps.map((g) => (
                                    <li key={g}>{g}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                            {c.links.map((l) => (
                              <Link key={l.to} to={l.to} className="text-accent hover:underline">
                                {l.label}
                              </Link>
                            ))}
                            {c.status === 'manual' && (
                              <button type="button" onClick={() => setAttesting(c)} className="text-accent hover:underline">
                                {c.attestation ? 'Update your evidence' : 'Record your evidence'}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                  </ul>
                  <p className="mt-4 text-xs text-muted">Checked {formatDate(report.data!.checkedAt)}. Download it as part of the Compliance readiness report.</p>
                </>
              )}
            </>
          )}
        </>
      )}
      {attesting && current && <AttestDialog frameworkId={current.id} control={attesting} onClose={() => setAttesting(null)} />}
    </>
  );
}

function AttestDialog({ frameworkId, control, onClose }: { frameworkId: FrameworkId; control: ControlResult; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'met' | 'not_met'>(control.attestation?.status ?? 'met');
  const [note, setNote] = useState(control.attestation?.note ?? '');
  const save = useMutation({
    mutationFn: (clear: boolean) => api.attestControl(frameworkId, control.id, clear ? null : { status, note }),
    onSuccess: (r) => {
      qc.setQueryData(['compliance', frameworkId], r);
      toast.success('Evidence recorded');
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`${control.code} ${control.title}`}
      description="ShieldOps cannot check this one. Record what you have, and where the proof lives, so the next audit can find it."
      footer={
        <>
          {control.attestation && (
            <Button variant="ghost" onClick={() => save.mutate(true)} className="mr-auto">
              Remove
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate(false)} loading={save.isPending} disabled={note.trim().length < 10}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Status">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as 'met' | 'not_met')} className="w-48">
              <option value="met">Met</option>
              <option value="not_met">Not met yet</option>
            </Select>
          )}
        </Field>
        <Field label="Evidence" hint="For example: the policy document, the config, or the ticket that proves it.">
          {(id, d) => <Textarea id={id} aria-describedby={d} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <InlineError error={save.error} />
      </div>
    </Modal>
  );
}