import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import type { RemediationTask } from '@/types';
import { cn } from '@/lib/cn';
import { dueText } from '@/lib/tasks';
import { PriorityBadge, TaskStatusText } from '@/components/ui/StatusLabels';
import { TaskDialog } from './TaskDialog';

export function TasksTable({ tasks, showLinked = true }: { tasks: RemediationTask[]; showLinked?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const userName = (id: string | null) => (id ? users.data?.find((u) => u.id === id)?.name ?? '—' : null);
  const open = tasks.find((t) => t.id === openId) ?? null;

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="table-base">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Task</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const due = dueText(t);
              return (
                <tr key={t.id} className="cursor-pointer" onClick={() => setOpenId(t.id)}>
                  <td>{t.priority ? <PriorityBadge priority={t.priority} /> : <span className="text-xs text-muted">—</span>}</td>
                  <td className="max-w-md">
                    <button type="button" className="text-left font-medium hover:underline" onClick={(e) => (e.stopPropagation(), setOpenId(t.id))}>
                      {t.title}
                    </button>
                    {showLinked && <p className="truncate text-xs text-muted">{t.linkedTitle}</p>}
                  </td>
                  <td>
                    <TaskStatusText status={t.status} />
                    {t.status === 'ready_for_verification' && t.verification && <p className="text-xs text-muted">{t.verification.method}</p>}
                    {t.status === 'in_progress' && t.verificationHistory[0]?.status === 'failed' && <p className="text-xs text-down">Last recheck failed</p>}
                  </td>
                  <td className="text-sm">{userName(t.ownerId) ?? <span className="text-muted">Nobody</span>}</td>
                  <td className={cn('whitespace-nowrap text-sm', due.tone)}>{due.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && <TaskDialog task={open} onClose={() => setOpenId(null)} />}
    </>
  );
}