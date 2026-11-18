import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToasts } from './toastStore';

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cn('pointer-events-auto flex items-start gap-2 rounded-lg border bg-surface p-3 text-sm shadow-lg', t.kind === 'error' ? 'border-down/40' : 'border-line')}>
          {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-down" aria-hidden />}
          <p className="flex-1">{t.message}</p>
          <button type="button" onClick={() => dismiss(t.id)} className="text-muted hover:text-ink" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}