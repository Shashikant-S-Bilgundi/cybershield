import { cn } from '@/lib/cn';

/** Tiny bar chart for a short series, e.g. events per hour over 24 hours. */
export function Sparkline({ values, className, tone = 'bg-accent/70', label }: { values: number[]; className?: string; tone?: string; label?: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className={cn('flex h-6 items-end gap-px', className)} role="img" aria-label={label ?? `Trend: ${values.join(', ')}`}>
      {values.map((v, i) => (
        <span key={i} className={cn('min-w-[2px] flex-1 rounded-[1px]', v ? tone : 'bg-line')} style={{ height: `${v ? Math.max(12, (v / max) * 100) : 8}%` }} />
      ))}
    </div>
  );
}