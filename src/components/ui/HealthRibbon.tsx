import { cn } from '@/lib/cn';
import { HEALTH_LABEL, formatDateTime } from '@/lib/format';
import type { HealthState, HealthTick } from '@/types';

const tickColor: Record<HealthState, string> = {
  up: 'bg-up/80',
  degraded: 'bg-degraded',
  down: 'bg-down',
  unknown: 'bg-line',
  paused: 'bg-line',
};

/**
 * The last N checks as a strip of ticks, oldest on the left.
 * Height encodes latency so slow checks stand out even when they are "up".
 */
export function HealthRibbon({ ticks, className, height = 24 }: { ticks: HealthTick[]; className?: string; height?: number }) {
  if (!ticks.length) {
    return (
      <div className={cn('flex items-center text-xs text-muted', className)} style={{ height }}>
        No checks yet
      </div>
    );
  }
  const maxLatency = Math.max(...ticks.map((t) => t.latencyMs ?? 0), 1);
  const down = ticks.filter((t) => t.state === 'down').length;
  const slow = ticks.filter((t) => t.state === 'degraded').length;

  return (
    <div
      className={cn('flex items-end gap-px', className)}
      style={{ height }}
      role="img"
      aria-label={`Last ${ticks.length} checks: ${down} down, ${slow} degraded`}
    >
      {ticks.map((t) => {
        const h = t.state === 'down' || t.state === 'unknown' || t.state === 'paused' ? 1 : 0.35 + 0.65 * ((t.latencyMs ?? 0) / maxLatency);
        return (
          <span
            key={t.at}
            title={`${formatDateTime(t.at)}: ${HEALTH_LABEL[t.state]}${t.latencyMs ? `, ${t.latencyMs} ms` : ''}`}
            className={cn('min-w-[2px] flex-1 rounded-[1px]', tickColor[t.state])}
            style={{ height: `${Math.round(h * 100)}%` }}
          />
        );
      })}
    </div>
  );
}