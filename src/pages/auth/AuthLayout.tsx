import type { ReactNode } from 'react';
import { HealthRibbon } from '@/components/ui/HealthRibbon';
import type { HealthTick } from '@/types';

// A fixed, decorative ribbon: the same visual language the app uses for live health.
const ribbon: HealthTick[] = Array.from({ length: 48 }, (_, i) => ({
  at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  state: i === 31 || i === 32 ? 'degraded' : 'up',
  latencyMs: 140 + ((i * 37) % 90) + (i === 31 || i === 32 ? 260 : 0),
}));

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
            <rect width="32" height="32" rx="7" className="fill-accent" />
            <path d="M8 17h4l2.5-6 3 11 2.5-5H24" fill="none" stroke="currentColor" className="text-accent-ink" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-lg font-semibold tracking-tight">ShieldOps</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
          <HealthRibbon ticks={ribbon} height={14} className="px-0 opacity-70" />
          <div className="p-6">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            <div className="mt-5">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}