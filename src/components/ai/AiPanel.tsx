import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/api';
import type { AiAnswer, AiContext } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { InlineError, Spinner } from '@/components/ui/States';
import { CreateTaskDialog } from '@/pages/operations/CreateTaskDialog';
import { AiAnswerView } from './AiAnswerView';

const TASK_LINK: Partial<Record<AiContext['type'], 'finding' | 'incident' | 'error_group'>> = { finding: 'finding', incident: 'incident', error_group: 'error_group' };

export function AiDisabledNotice({ error }: { error: unknown }) {
  if (error instanceof ApiError && (error.code === 'AI_DISABLED' || error.code === 'AI_NOT_APPROVED')) {
    return (
      <p className="rounded border border-line bg-sunken px-3 py-2 text-sm">
        {error.message}{' '}
        <Link to="/settings" className="text-accent hover:underline">
          Open System settings
        </Link>
      </p>
    );
  }
  return <InlineError error={error} />;
}

/** "Explain with AI" for one finding, incident or error. Starts with an explanation; follow-ups stay on the same item. */
export function AiPanel({ context, title, firstQuestion, onClose }: { context: AiContext; title: string; firstQuestion: string; onClose: () => void }) {
  const [answers, setAnswers] = useState<AiAnswer[]>([]);
  const [question, setQuestion] = useState('');
  const [task, setTask] = useState<string | null>(null);
  const ask = useMutation({
    mutationFn: (q: string) => api.aiAsk({ question: q, context }),
    onSuccess: (a) => {
      setAnswers((xs) => [...xs, a]);
      setQuestion('');
    },
  });
  // Ask the first question once when the panel opens (the ref survives React's dev double-run).
  const started = useRef(false);
  const { mutate } = ask;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate(firstQuestion);
  }, [mutate, firstQuestion]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (question.trim()) ask.mutate(question.trim());
  };
  const linkType = TASK_LINK[context.type];

  return (
    <>
      <Modal open onClose={onClose} size="lg" title="AI security analyst" description={title}>
        <div className="space-y-4">
          {answers.map((a) => (
            <div key={a.id} className="space-y-2">
              {a !== answers[0] && <p className="text-right text-sm"><span className="rounded-lg bg-sunken px-3 py-1.5">{a.question}</span></p>}
              <AiAnswerView answer={a} onCreateTask={linkType ? setTask : undefined} />
            </div>
          ))}
          {ask.isPending && <Spinner label="Thinking with the masked evidence" />}
          {ask.error && <AiDisabledNotice error={ask.error} />}
          {answers.length > 0 && (
            <form onSubmit={submit} className="flex gap-2">
              <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a follow-up about this" aria-label="Follow-up question" />
              <Button type="submit" variant="primary" disabled={!question.trim() || ask.isPending}>
                Ask
              </Button>
            </form>
          )}
        </div>
      </Modal>
      {task && linkType && <CreateTaskDialog linkedType={linkType} linkedId={context.id} linkedTitle={title} suggestion={task} onClose={() => setTask(null)} />}
    </>
  );
}