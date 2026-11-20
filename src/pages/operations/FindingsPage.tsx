import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { api, type FindingFilter } from '@/api';
import type { FindingStatus, Severity, SignalSource } from '@/types';
import { useScope } from '@/hooks/useScope';
import { FINDING_STATUS_LABEL, SEVERITY_LABEL, SOURCE_LABEL } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { FindingsTable } from './FindingsTable';

export function FindingsPage() {
  const scope = useScope();
  const [status, setStatus] = useState<FindingStatus | 'active' | ''>('active');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [source, setSource] = useState<SignalSource | ''>('');
  const filter: FindingFilter = { ...scope, status: status || undefined, severity: severity || undefined, source: source || undefined };
  const findings = useQuery({ queryKey: ['findings', filter], queryFn: () => api.listFindings(filter) });
  const p1 = (findings.data ?? []).filter((f) => f.priority === 'P1').length;

  return (
    <>
      <PageHeader
        title="Findings"
        description={
          p1
            ? `${p1} P1 ${p1 === 1 ? 'finding needs' : 'findings need'} fixing within 2 days.`
            : 'Weaknesses found by checks, sorted by risk priority. Priority combines severity, how critical the application is, exposure and confidence.'
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value as FindingStatus | 'active' | '')} aria-label="Status" className="w-56">
          <option value="active">Open and in progress</option>
          <option value="">All statuses</option>
          {(Object.keys(FINDING_STATUS_LABEL) as FindingStatus[]).map((s) => (
            <option key={s} value={s}>
              {FINDING_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={severity} onChange={(e) => setSeverity(e.target.value as Severity | '')} aria-label="Severity" className="w-36">
          <option value="">All severities</option>
          {(Object.keys(SEVERITY_LABEL) as Severity[]).map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={source} onChange={(e) => setSource(e.target.value as SignalSource | '')} aria-label="Source" className="w-44">
          <option value="">All sources</option>
          {(Object.keys(SOURCE_LABEL) as SignalSource[]).map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>
      {findings.isLoading ? (
        <Spinner />
      ) : findings.error ? (
        <ErrorState error={findings.error} onRetry={() => findings.refetch()} />
      ) : !findings.data?.length ? (
        <EmptyState icon={<ListChecks className="h-6 w-6" />} title="No findings match" body={status === 'active' ? 'Nothing open right now.' : undefined} />
      ) : (
        <FindingsTable findings={findings.data} />
      )}
    </>
  );
}