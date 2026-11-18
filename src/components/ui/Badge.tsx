import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CRITICALITY_LABEL, HEALTH_LABEL, SEVERITY_LABEL } from '@/lib/format';
import type { Criticality, HealthState, Severity } from '@/types';

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded border border-line bg-sunken px-1.5 py-0.5 text-xs font-medium text-muted', className)}>
      {children}
    </span>
  );
}

const healthDot: Record<HealthState, string> = {
  up: 'bg-up',
  degraded: 'bg-degraded',
  down: 'bg-down',
  unknown: 'bg-unknown',
  paused: 'bg-transparent border border-unknown',
};

export function HealthBadge({ state, className }: { state: HealthState; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', className)}>
      <span className={cn('h-2 w-2 rounded-full', healthDot[state], state === 'down' && 'animate-pulse')} aria-hidden />
      {HEALTH_LABEL[state]}
    </span>
  );
}

const severityStyle: Record<Severity, string> = {
  critical: 'bg-crit/10 text-crit border-crit/30',
  high: 'bg-high/10 text-high border-high/30',
  medium: 'bg-med/10 text-med border-med/30',
  low: 'bg-low/10 text-low border-low/30',
  info: 'bg-info/10 text-info border-info/30',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-xs font-semibold', severityStyle[severity])}>{SEVERITY_LABEL[severity]}</span>;
}

/** Criticality is shown as filled bars (4 = critical) so it scans without colour. */
export function CriticalityMeter({ value }: { value: Criticality }) {
  const level = { low: 1, medium: 2, high: 3, critical: 4 }[value];
  return (
    <span className="inline-flex items-center gap-2 text-sm" title={`${CRITICALITY_LABEL[value]} criticality`}>
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('w-1 rounded-sm', i <= level ? (level === 4 ? 'bg-crit' : 'bg-ink') : 'bg-line')} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      {CRITICALITY_LABEL[value]}
    </span>
  );
}