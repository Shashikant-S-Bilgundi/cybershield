import type { RemediationTask } from '@/types';
import { formatDate } from './format';

const OPEN = ['todo', 'in_progress', 'ready_for_verification'];

/** Due date as words, with a tone class: overdue is red, the next two days amber. */
export function dueText(t: RemediationTask): { text: string; tone: string } {
  if (!t.dueAt || !OPEN.includes(t.status)) return { text: '—', tone: 'text-muted' };
  const ms = Date.parse(t.dueAt) - Date.now();
  const HOUR = 3_600_000;
  if (ms < 0) {
    const late = Math.ceil(-ms / (24 * HOUR));
    return { text: -ms < 24 * HOUR ? `${Math.max(1, Math.round(-ms / HOUR))} h overdue` : `${late} ${late === 1 ? 'day' : 'days'} overdue`, tone: 'font-medium text-down' };
  }
  if (ms < 24 * HOUR) return { text: `Due in ${Math.max(1, Math.round(ms / HOUR))} h`, tone: 'font-medium text-degraded' };
  const d = Math.round(ms / (24 * HOUR));
  if (d <= 2) return { text: `Due in ${d} ${d === 1 ? 'day' : 'days'}`, tone: 'text-degraded' };
  return { text: formatDate(t.dueAt), tone: 'text-muted' };
}