import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { api } from '@/api';
import type { AiAnswer, AiContext } from '@/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/States';
import { AiAnswerView } from '@/components/ai/AiAnswerView';
import { AiDisabledNotice } from '@/components/ai/AiPanel';
import { CreateTaskDialog } from '@/pages/operations/CreateTaskDialog';

const STARTERS = ['What should we fix first this week?', 'Which certificates and domains expire soon?', 'Summarise the open incidents'];

export function AiAnalystPage() {
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const findings = useQuery({ queryKey: ['findings', { status: 'active' }], queryFn: () => api.listFindings({ status: 'active' }) });
  const incidents = useQuery({ queryKey: ['incidents', { status: 'active' }], queryFn: () => api.listIncidents({ status: 'active' }) });
  const errors = useQuery({ queryKey: ['error-groups', { status: 'open' }], queryFn: () => api.listErrorGroups({ status: 'open' }) });
  const [about, setAbout] = useState('');
  const [question, setQuestion] = useState('');
  const [log, setLog] = useState<AiAnswer[]>([]);
  const [task, setTask] = useState<{ title: string; ctx: AiContext; linkedTitle: string } | null>(null);

  const context: AiContext | null = about ? { type: about.split(':')[0] as AiContext['type'], id: about.split(':')[1] } : null;
  const ask = useMutation({
    mutationFn: (q: string) => api.aiAsk({ question: q, context }),
    onSuccess: (a) => {
      setLog((xs) => [a, ...xs]);
      setQuestion('');
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask.mutate(question.trim() || (context ? 'Explain this' : STARTERS[0]));
  };
  const ai = settings.data?.ai;

  return (
    <>
      <PageHeader
        title="AI security analyst"
        description="Ask about your security posture, or pick a finding, incident or error to have it explained. Answers use only masked evidence from ShieldOps and never change anything on their own."
      />
      {ai && (
        <p className="mb-4 text-xs text-muted">
          {ai.enabled ? `Using ${ai.provider === 'openai' ? 'OpenAI' : ai.provider === 'anthropic' ? 'Anthropic' : 'Azure OpenAI'} ${ai.model}.` : 'The AI assistant is turned off.'}{' '}
          <Link to="/settings" className="text-accent hover:underline">
            Change in System settings
          </Link>
        </p>
      )}
      <form onSubmit={submit} className="mb-6 space-y-3 rounded-lg border border-line bg-surface p-4">
        <Field label="About" hint="Optional. Leave empty to ask about everything ShieldOps sees.">
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={about} onChange={(e) => setAbout(e.target.value)}>
              <option value="">Overall security posture</option>
              <optgroup label="Incidents">
                {(incidents.data ?? []).map((i) => (
                  <option key={i.id} value={`incident:${i.id}`}>
                    {i.ref} {i.title}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Findings">
                {(findings.data ?? []).slice(0, 30).map((f) => (
                  <option key={f.id} value={`finding:${f.id}`}>
                    {f.priority} {f.title}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Errors">
                {(errors.data ?? []).map((g) => (
                  <option key={g.id} value={`error_group:${g.id}`}>
                    {g.type}: {g.message.slice(0, 60)}
                  </option>
                ))}
              </optgroup>
            </Select>
          )}
        </Field>
        <div className="flex gap-2">
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={context ? 'Explain this, or ask something specific' : 'What should we fix first this week?'} aria-label="Question" />
          <Button type="submit" variant="primary" loading={ask.isPending}>
            {!ask.isPending && <Sparkles className="h-4 w-4" aria-hidden />}
            Ask
          </Button>
        </div>
        {!context && (
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button key={s} type="button" onClick={() => ask.mutate(s)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-accent hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        )}
      </form>
      {ask.error && <div className="mb-4"><AiDisabledNotice error={ask.error} /></div>}
      {ask.isPending && <Spinner label="Thinking with the masked evidence" />}
      <div className="space-y-6">
        {log.map((a) => (
          <div key={a.id} className="space-y-2">
            <p className="text-sm">
              <span className="font-medium">{a.question}</span>
              {a.contextTitle && <span className="text-muted"> about {a.contextTitle}</span>}
            </p>
            <AiAnswerView
              answer={a}
              onCreateTask={a.context && a.context.type !== 'alert' ? (title) => setTask({ title, ctx: a.context!, linkedTitle: a.contextTitle ?? '' }) : undefined}
            />
          </div>
        ))}
      </div>
      {task && (
        <CreateTaskDialog
          linkedType={task.ctx.type as 'finding' | 'incident' | 'error_group'}
          linkedId={task.ctx.id}
          linkedTitle={task.linkedTitle}
          suggestion={task.title}
          onClose={() => setTask(null)}
        />
      )}
    </>
  );
}