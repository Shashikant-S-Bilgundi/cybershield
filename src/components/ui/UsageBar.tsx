import { cn } from '@/lib/cn';

/** A percentage as a short bar. Turns amber at `warn` and red at `crit`. */
export function UsageBar({ value, warn = 85, crit = 95, label, className }: { value: number | null; warn?: number; crit?: number; label: string; className?: string }) {
  if (value === null) return <span className="text-sm text-muted">—</span>;
  const tone = value >= crit ? 'bg-down' : value >= warn ? 'bg-degraded' : 'bg-accent/70';
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sunken" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className={cn('w-10 text-right text-sm tabular-nums', value >= crit ? 'font-medium text-down' : value >= warn ? 'text-degraded' : '')}>{Math.round(value)}%</span>
    </div>
  );
}