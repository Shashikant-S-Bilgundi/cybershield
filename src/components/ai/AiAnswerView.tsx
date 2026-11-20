import { Sparkles } from 'lucide-react';
import type { AiAnswer } from '@/types';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';

/** One AI answer. Always labelled, always shows what was sent, never acts on its own. */
export function AiAnswerView({ answer, onCreateTask }: { answer: AiAnswer; onCreateTask?: (title: string) => void }) {
  return (
    <article className="space-y-3 rounded-lg border border-accent/30 bg-accent/[0.04] p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-accent">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        AI assistance, not scanner evidence. Check it before acting.
      </p>
      <p className="text-sm font-medium">{answer.summary}</p>
      {answer.sections
        .filter((s) => s.bullets.length)
        .map((s) => (
          <section key={s.title}>
            <h3 className="mb-1 text-sm font-semibold">{s.title}</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </section>
        ))}
      {onCreateTask && answer.suggestedTasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-xs text-muted">Suggested task:</span>
          {answer.suggestedTasks.map((t) => (
            <Button key={t} size="sm" onClick={() => onCreateTask(t)}>
              Create “{t.length > 48 ? `${t.slice(0, 48)}…` : t}”
            </Button>
          ))}
        </div>
      )}
      <details className="border-t border-line pt-2 text-xs text-muted">
        <summary className="cursor-pointer">What was sent to {answer.model}</summary>
        <dl className="mt-2 space-y-1">
          {answer.sent.map((x) => (
            <div key={x.label} className="grid grid-cols-[140px_minmax(0,1fr)] gap-2">
              <dt>{x.label}</dt>
              <dd className="break-words text-ink">{x.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2">Generated {formatDateTime(answer.generatedAt)}. Secret values, emails and IP addresses are masked or left out before sending.</p>
      </details>
    </article>
  );
}