import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Trash2 } from 'lucide-react';
import { api, type ReportScheduleInput } from '@/api';
import type { ReportType } from '@/types';
import { useScope } from '@/hooks/useScope';
import { REPORT_TYPE_LABEL, formatDate, formatDateTime, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { downloadReport } from './reportDownload';

const TYPES = Object.keys(REPORT_TYPE_LABEL) as ReportType[];
const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

export function ReportsPage() {
  const scope = useScope();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [type, setType] = useState<ReportType>('posture');
  const [days, setDays] = useState(30);
  const [applicationId, setApplicationId] = useState(scope.applicationId ?? '');
  const [scheduling, setScheduling] = useState(false);
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const reports = useQuery({ queryKey: ['reports'], queryFn: api.listReports, refetchInterval: (q) => (q.state.data?.some((r) => r.status === 'generating') ? 1500 : false) });
  const schedules = useQuery({ queryKey: ['report-schedules'], queryFn: api.listReportSchedules });
  const appName = (id: string | null) => (id ? apps.data?.find((a) => a.id === id)?.name ?? '—' : 'All applications');

  const generate = useMutation({
    mutationFn: () => api.generateReport({ type, from: new Date(Date.now() - days * 86_400_000).toISOString(), to: new Date().toISOString(), applicationId: applicationId || null }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      navigate(`/reports/${r.id}`);
    },
  });
  const unschedule = useMutation({ mutationFn: (id: string) => api.deleteReportSchedule(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['report-schedules'] }) });

  return (
    <>
      <PageHeader title="Reports" description="Reports show the state when they were generated and the period they cover. Secret values are always masked." />

      <section className="mb-8 rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-3 font-semibold">New report</h2>
        <fieldset className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <legend className="sr-only">Report type</legend>
          {TYPES.map((t) => (
            <label key={t} className="flex cursor-pointer items-start gap-2.5 rounded border border-line px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5">
              <input type="radio" name="type" checked={type === t} onChange={() => setType(t)} className="mt-0.5 accent-[rgb(var(--accent))]" />
              <span>
                <span className="font-medium">{REPORT_TYPE_LABEL[t].name}</span>
                <span className="block text-xs text-muted">{REPORT_TYPE_LABEL[t].about}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Period">
            {(id) => (
              <Select id={id} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-40">
                {RANGES.map((r) => (
                  <option key={r.days} value={r.days}>
                    {r.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Applications">
            {(id) => (
              <Select id={id} value={applicationId} onChange={(e) => setApplicationId(e.target.value)} className="w-56">
                <option value="">All applications</option>
                {(apps.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button variant="primary" onClick={() => generate.mutate()} loading={generate.isPending}>
            Generate
          </Button>
          <Button onClick={() => setScheduling(true)}>Schedule by email</Button>
        </div>
        <InlineError error={generate.error} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Generated reports</h2>
        {reports.isLoading ? (
          <Spinner />
        ) : !reports.data?.length ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No reports yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Period</th>
                  <th>Generated</th>
                  <th className="text-right">Size</th>
                  <th className="w-px" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {reports.data.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/reports/${r.id}`} className="font-medium hover:underline">
                        {r.title}
                      </Link>
                      <p className="text-xs text-muted">{appName(r.applicationId)}</p>
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      {formatDate(r.from)} to {formatDate(r.to)}
                    </td>
                    <td className="whitespace-nowrap text-sm" title={formatDateTime(r.generatedAt)}>
                      {r.status === 'generating' ? <span className="text-degraded">Generating…</span> : timeAgo(r.generatedAt)}
                      <p className="text-xs text-muted">{users.data?.find((u) => u.id === r.generatedBy)?.name}</p>
                    </td>
                    <td className="text-right text-sm tabular-nums text-muted">{r.sizeKb ? `${r.sizeKb} KB` : '—'}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={r.status !== 'ready'}
                        onClick={() => downloadReport(r.id, r.title, r.to).catch((e) => toast.error((e as Error).message))}
                        aria-label={`Download ${r.title} as PDF`}
                      >
                        <Download className="h-4 w-4" aria-hidden />
                        PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Scheduled by email</h2>
        {!schedules.data?.length ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Nothing scheduled.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {schedules.data.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">
                    {REPORT_TYPE_LABEL[s.type].name}, {s.frequency}
                  </p>
                  <p className="text-sm text-muted">
                    {appName(s.applicationId)} to {s.recipients.join(', ')}. Next: {formatDateTime(s.nextRunAt)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => unschedule.mutate(s.id)} aria-label="Cancel schedule">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {scheduling && <ScheduleDialog type={type} applicationId={applicationId || null} onClose={() => setScheduling(false)} />}
    </>
  );
}

function ScheduleDialog({ type, applicationId, onClose }: { type: ReportType; applicationId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ReportScheduleInput>({ type, frequency: 'weekly', recipients: [], applicationId });
  const [emails, setEmails] = useState('');
  const create = useMutation({
    mutationFn: () => api.createReportSchedule({ ...form, recipients: emails.split(/[\s,;]+/).filter(Boolean) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-schedules'] });
      toast.success('Report scheduled');
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule a report"
      description="The PDF is emailed through the SMTP server in System settings."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="sch-form" variant="primary" loading={create.isPending} disabled={!emails.trim()}>
            Schedule
          </Button>
        </>
      }
    >
      <form id="sch-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Report">
            {(id) => (
              <Select id={id} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ReportType })}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {REPORT_TYPE_LABEL[t].name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="How often">
            {(id) => (
              <Select id={id} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as 'weekly' | 'monthly' })}>
                <option value="weekly">Every Monday, 9:00</option>
                <option value="monthly">1st of each month, 9:00</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label="Send to" hint="Separate addresses with commas.">
          {(id, d) => <Input id={id} aria-describedby={d} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="it-head@example.com, cto@example.com" />}
        </Field>
        <InlineError error={create.error} />
      </form>
    </Modal>
  );
}