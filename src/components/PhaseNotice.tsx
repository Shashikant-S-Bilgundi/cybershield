import { CalendarRange } from 'lucide-react';

export function PhaseNotice({ phase, title, body }: { phase: number; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-line bg-surface px-5 py-6">
      <CalendarRange className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 max-w-xl text-sm text-muted">{body}</p>
        <p className="mt-2 text-xs text-muted">Arrives in phase {phase} of the build plan.</p>
      </div>
    </div>
  );
}