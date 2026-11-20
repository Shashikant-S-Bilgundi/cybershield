import { ApiError } from '../errors';
import type { ShieldOpsApi } from '../contract';
import type { Finding, Incident, IncidentStatus, LinkedItem, LinkedType, Priority, RemediationTask, Severity, SlaSummary, TaskStatus, TaskVerification } from '@/types';
import { SLA_DAYS } from '@/lib/risk';
import { DAY, MIN, audit, clone, currentUser, db, delay, id, nowIso, save } from './core';
import type { TaskRecord } from './seed6';

type Phase6Keys =
  | 'listIncidents' | 'getIncident' | 'createIncident' | 'updateIncident' | 'linkToIncident' | 'unlinkFromIncident'
  | 'listTasks' | 'createTask' | 'updateTask' | 'getSlaSummary' | 'testIntegration';

export type Phase6Api = Pick<ShieldOpsApi, Phase6Keys>;

const HOUR = 60 * MIN;
const ACTIVE: IncidentStatus[] = ['new', 'acknowledged', 'investigating', 'remediating', 'reopened'];
const OPEN_TASK: TaskStatus[] = ['todo', 'in_progress', 'ready_for_verification'];
const SEV_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const SEV_PRIORITY: Record<Severity, Priority> = { critical: 'P1', high: 'P2', medium: 'P3', low: 'P4', info: 'P4' };

/** Which status changes the workflow allows. */
const NEXT: Record<IncidentStatus, IncidentStatus[]> = {
  new: ['acknowledged', 'investigating', 'resolved'],
  acknowledged: ['investigating', 'remediating', 'resolved'],
  investigating: ['remediating', 'resolved'],
  remediating: ['investigating', 'resolved'],
  reopened: ['acknowledged', 'investigating', 'remediating', 'resolved'],
  resolved: ['closed', 'reopened'],
  closed: ['reopened'],
};

const STATUS_TEXT: Record<IncidentStatus, string> = {
  new: 'new', acknowledged: 'acknowledged', investigating: 'investigating', remediating: 'remediation in progress', resolved: 'resolved', closed: 'closed', reopened: 'reopened',
};

function lookup(type: LinkedType, itemId: string): LinkedItem & { applicationId: string } {
  if (type === 'alert') {
    const a = db.alerts.find((x) => x.id === itemId);
    if (!a) throw new ApiError(404, 'NOT_FOUND', 'Alert not found.');
    return { type, id: a.id, title: a.title, severity: a.severity, applicationId: a.applicationId };
  }
  if (type === 'finding') {
    const f = db.findings.find((x) => x.id === itemId);
    if (!f) throw new ApiError(404, 'NOT_FOUND', 'Finding not found.');
    return { type, id: f.id, title: f.title, severity: f.severity, applicationId: f.applicationId };
  }
  const g = db.errorGroups.find((x) => x.id === itemId);
  if (!g) throw new ApiError(404, 'NOT_FOUND', 'Error group not found.');
  return { type, id: g.id, title: `${g.type}: ${g.message}`, severity: null, applicationId: g.applicationId };
}

const findIncident = (incidentId: string) => {
  const i = db.incidents.find((x) => x.id === incidentId);
  if (!i) throw new ApiError(404, 'NOT_FOUND', 'Incident not found.');
  return i;
};

const findTask = (taskId: string) => {
  const t = db.tasks.find((x) => x.id === taskId);
  if (!t) throw new ApiError(404, 'NOT_FOUND', 'Task not found.');
  return t;
};

/* ───────────── verification ───────────── */

function methodFor(task: TaskRecord): string {
  if (task.linkedType === 'incident') return 'Recheck of every item linked to the incident';
  if (task.linkedType === 'error_group') return 'Watching the error group';
  const f = db.findings.find((x) => x.id === task.linkedId);
  const target = f?.evidence.find((e) => ['Host', 'URL', 'Domain', 'Found in'].includes(e.label))?.value ?? f?.title ?? '';
  switch (f?.source) {
    case 'ssl': return `SSL recheck of ${target}`;
    case 'headers': return `Security header recheck of ${target}`;
    case 'dns': return `DNS recheck of ${target}`;
    case 'domain': return `Domain expiry recheck of ${target}`;
    case 'secrets': return 'Repository scan with Gitleaks';
    case 'vulnerabilities': return `Dependency scan of ${target}`;
    default: return 'Recheck by the check that found it';
  }
}

function markFinding(findingId: string, status: Finding['status'], text: string) {
  const f = db.findings.find((x) => x.id === findingId);
  if (!f) return;
  f.status = status;
  f.history.unshift({ at: nowIso(), actorName: 'ShieldOps', text });
}

/** Completes verifications whose recheck has "run". */
function settleTasks() {
  const now = Date.now();
  db.tasks.forEach((task) => {
    if (task.status !== 'ready_for_verification' || !task.simVerifyAt || Date.parse(task.simVerifyAt) > now) return;
    task.simVerifyAt = null;
    const result: TaskVerification = { status: 'passed', at: nowIso(), method: methodFor(task), detail: 'The recheck no longer finds the problem.' };
    if (task.linkedType === 'finding') {
      const f = db.findings.find((x) => x.id === task.linkedId);
      if (f?.source === 'vulnerabilities') result.detail = `${f.code?.kind === 'vuln' ? f.code.package : 'The package'} is now on a fixed version.`;
      if (f?.source === 'secrets') result.detail = 'The secret is no longer in the current code. Make sure it was also rotated.';
      if (f?.source === 'ssl') result.detail = 'The server no longer offers the weak protocol or certificate problem.';
      markFinding(task.linkedId, 'verified', 'Verified fixed by a recheck');
    }
    // The pending entry is replaced by its result; only finished rechecks go into history.
    task.verification = result;
    task.status = 'verified';
    task.completedAt = result.at;
    if (task.linkedType === 'incident') {
      const inc = db.incidents.find((x) => x.id === task.linkedId);
      inc?.timeline.unshift({ at: result.at, actorName: 'ShieldOps', kind: 'task', text: `Task verified: ${task.title}` });
    }
  });
}

/* ───────────── helpers for the rest of the mock ───────────── */

export const activeIncidentCount = () => db.incidents.filter((i) => ACTIVE.includes(i.status)).length;

export function cleanupPhase6(applicationId: string) {
  db.tasks = db.tasks.filter((x) => x.applicationId !== applicationId);
  db.incidents.forEach((i) => (i.applicationIds = i.applicationIds.filter((a) => a !== applicationId)));
}

const taskView = (t: TaskRecord): RemediationTask => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { simVerifyAt: _s, ...rest } = t;
  return clone(rest);
};

const isOverdue = (t: RemediationTask) => OPEN_TASK.includes(t.status) && !!t.dueAt && Date.parse(t.dueAt) < Date.now();

/* ───────────── API ───────────── */

export const phase6Api: Phase6Api = {
  async listIncidents(filter = {}) {
    await delay();
    currentUser();
    settleTasks();
    return clone(
      db.incidents
        .filter((i) => !filter.status || (filter.status === 'active' ? ACTIVE.includes(i.status) : i.status === filter.status))
        .filter((i) => !filter.applicationId || i.applicationIds.includes(filter.applicationId))
        .filter((i) => !filter.severity || i.severity === filter.severity)
        .sort((a, b) => Number(ACTIVE.includes(b.status)) - Number(ACTIVE.includes(a.status)) || SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || b.openedAt.localeCompare(a.openedAt)),
    );
  },

  async getIncident(incidentId) {
    await delay(150);
    currentUser();
    settleTasks();
    return clone(findIncident(incidentId));
  },

  async createIncident(input) {
    await delay();
    const user = currentUser();
    if (!input.title.trim()) throw new ApiError(422, 'TITLE_REQUIRED', 'Give the incident a short title.');
    const links = (input.links ?? []).map((l) => lookup(l.type, l.id));
    const applicationIds = [...new Set([...input.applicationIds, ...links.map((l) => l.applicationId)])];
    if (!applicationIds.length) throw new ApiError(422, 'APP_REQUIRED', 'Choose at least one affected application.');
    const now = nowIso();
    const ref = `INC-${String(db.nextIncidentNumber++).padStart(4, '0')}`;
    const inc: Incident = {
      id: id('inc'),
      ref,
      title: input.title.trim(),
      summary: input.summary.trim(),
      severity: input.severity,
      status: 'new',
      ownerId: input.ownerId,
      applicationIds,
      linked: links.map((l) => ({ type: l.type, id: l.id, title: l.title, severity: l.severity })),
      openedAt: now,
      acknowledgedAt: null,
      resolvedAt: null,
      closedAt: null,
      rootCause: '',
      postIncident: '',
      createdBy: user.id,
      timeline: [
        ...links.map((l) => ({ at: now, actorName: user.name, kind: 'link' as const, text: `Linked ${l.type.replace('_', ' ')}: ${l.title}` })),
        { at: now, actorName: user.name, kind: 'status', text: links[0] ? `Opened from ${links[0].type.replace('_', ' ')}: ${links[0].title}` : 'Opened' },
      ],
    };
    db.incidents.push(inc);
    audit('incident.create', 'incident', inc.id, `Opened ${ref}: ${inc.title}`);
    save();
    return clone(inc);
  },

  async updateIncident(incidentId, input) {
    await delay();
    const user = currentUser();
    const inc = findIncident(incidentId);
    const now = nowIso();
    const log = (text: string, kind: Incident['timeline'][number]['kind'] = 'status') => inc.timeline.unshift({ at: now, actorName: user.name, kind, text });

    if (input.rootCause !== undefined && input.rootCause.trim() !== inc.rootCause) {
      inc.rootCause = input.rootCause.trim();
      log('Updated the root cause', 'note');
    }
    if (input.postIncident !== undefined && input.postIncident.trim() !== inc.postIncident) {
      inc.postIncident = input.postIncident.trim();
      log('Updated the post-incident summary', 'note');
    }
    if (input.status && input.status !== inc.status) {
      if (!NEXT[inc.status].includes(input.status)) throw new ApiError(409, 'INVALID_TRANSITION', `An incident that is ${STATUS_TEXT[inc.status]} cannot move to ${STATUS_TEXT[input.status]}.`);
      if (input.status === 'closed' && inc.severity === 'critical' && inc.postIncident.length < 40) {
        throw new ApiError(422, 'SUMMARY_REQUIRED', 'Critical incidents need a post-incident summary (what happened, impact, what changed) before they can be closed.');
      }
      if (input.status === 'resolved' && db.tasks.some((t) => t.linkedType === 'incident' && t.linkedId === inc.id && t.status === 'todo')) {
        log('Resolved with remediation tasks still to do', 'system');
      }
      inc.status = input.status;
      if (input.status === 'acknowledged' && !inc.acknowledgedAt) inc.acknowledgedAt = now;
      if (input.status === 'resolved') inc.resolvedAt = now;
      if (input.status === 'closed') inc.closedAt = now;
      if (input.status === 'reopened') Object.assign(inc, { resolvedAt: null, closedAt: null });
      log(input.status === 'acknowledged' ? 'Acknowledged' : `Changed status to ${STATUS_TEXT[input.status]}`);
      audit(`incident.${input.status}`, 'incident', inc.id, `${inc.ref} is now ${STATUS_TEXT[input.status]}`);
    }
    if (input.ownerId !== undefined && input.ownerId !== inc.ownerId) {
      inc.ownerId = input.ownerId;
      log(`Assigned to ${input.ownerId ? db.users.find((u) => u.id === input.ownerId)?.name ?? 'someone' : 'nobody'}`, 'system');
    }
    if (input.severity && input.severity !== inc.severity) {
      log(`Changed severity from ${inc.severity} to ${input.severity}`, 'system');
      inc.severity = input.severity;
    }
    if (input.note?.trim()) log(`Note: ${input.note.trim()}`, 'note');
    save();
    return clone(inc);
  },

  async linkToIncident(incidentId, item) {
    await delay();
    const user = currentUser();
    const inc = findIncident(incidentId);
    if (inc.linked.some((l) => l.type === item.type && l.id === item.id)) throw new ApiError(409, 'ALREADY_LINKED', 'This is already linked.');
    const l = lookup(item.type, item.id);
    inc.linked.push({ type: l.type, id: l.id, title: l.title, severity: l.severity });
    if (!inc.applicationIds.includes(l.applicationId)) inc.applicationIds.push(l.applicationId);
    inc.timeline.unshift({ at: nowIso(), actorName: user.name, kind: 'link', text: `Linked ${l.type.replace('_', ' ')}: ${l.title}` });
    save();
    return clone(inc);
  },

  async unlinkFromIncident(incidentId, item) {
    await delay();
    const user = currentUser();
    const inc = findIncident(incidentId);
    const l = inc.linked.find((x) => x.type === item.type && x.id === item.id);
    inc.linked = inc.linked.filter((x) => !(x.type === item.type && x.id === item.id));
    if (l) inc.timeline.unshift({ at: nowIso(), actorName: user.name, kind: 'link', text: `Unlinked ${l.type.replace('_', ' ')}: ${l.title}` });
    save();
    return clone(inc);
  },

  async listTasks(filter = {}) {
    await delay();
    currentUser();
    settleTasks();
    save();
    return db.tasks
      .map(taskView)
      .filter((t) => !filter.status || (filter.status === 'open' ? OPEN_TASK.includes(t.status) : t.status === filter.status))
      .filter((t) => !filter.ownerId || t.ownerId === filter.ownerId)
      .filter((t) => !filter.applicationId || t.applicationId === filter.applicationId)
      .filter((t) => !filter.linkedId || t.linkedId === filter.linkedId)
      .filter((t) => !filter.overdue || isOverdue(t))
      .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || Number(OPEN_TASK.includes(b.status)) - Number(OPEN_TASK.includes(a.status)) || (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'));
  },

  async createTask(input) {
    await delay();
    const user = currentUser();
    if (!input.title.trim()) throw new ApiError(422, 'TITLE_REQUIRED', 'Describe what needs doing.');
    let priority: Priority | null = null;
    let applicationId: string;
    let linkedTitle: string;
    let dueAt: string | null = input.dueAt ?? null;
    if (input.linkedType === 'finding') {
      const f = db.findings.find((x) => x.id === input.linkedId);
      if (!f) throw new ApiError(404, 'NOT_FOUND', 'Finding not found.');
      priority = f.priority;
      applicationId = f.applicationId;
      linkedTitle = f.title;
      dueAt ??= f.dueAt;
      f.history.unshift({ at: nowIso(), actorName: user.name, text: `Created remediation task: ${input.title.trim()}` });
    } else if (input.linkedType === 'incident') {
      const inc = findIncident(input.linkedId);
      priority = SEV_PRIORITY[inc.severity];
      applicationId = inc.applicationIds[0] ?? '';
      linkedTitle = `${inc.ref} ${inc.title}`;
      dueAt ??= new Date(Date.now() + SLA_DAYS[priority] * DAY).toISOString();
      inc.timeline.unshift({ at: nowIso(), actorName: user.name, kind: 'task', text: `Created task: ${input.title.trim()}` });
    } else {
      const l = lookup('error_group', input.linkedId);
      applicationId = l.applicationId;
      linkedTitle = l.title;
      dueAt ??= new Date(Date.now() + 7 * DAY).toISOString();
    }
    const t: TaskRecord = {
      id: id('t'),
      title: input.title.trim(),
      details: input.details.trim(),
      linkedType: input.linkedType,
      linkedId: input.linkedId,
      linkedTitle,
      applicationId,
      ownerId: input.ownerId,
      priority,
      dueAt,
      status: 'todo',
      createdAt: nowIso(),
      createdBy: user.id,
      completedAt: null,
      verification: null,
      verificationHistory: [],
      wontFixReason: null,
      notes: [],
      simVerifyAt: null,
    };
    db.tasks.push(t);
    audit('task.create', 'task', t.id, `Created remediation task: ${t.title}`);
    save();
    return taskView(t);
  },

  async updateTask(taskId, input) {
    await delay();
    const user = currentUser();
    const t = findTask(taskId);
    const note = (text: string, actorName = user.name) => t.notes.unshift({ at: nowIso(), actorName, text });

    if (input.status && input.status !== t.status) {
      if (input.status === 'verified') throw new ApiError(422, 'VERIFY_BY_RECHECK', 'Tasks are verified by a recheck. Move it to "Ready for verification" instead.');
      if (input.status === 'wont_fix' && (input.wontFixReason?.trim().length ?? 0) < 10) throw new ApiError(422, 'REASON_REQUIRED', "Explain why this won't be fixed (at least 10 characters).");
      if (t.status === 'ready_for_verification' && input.status !== 'in_progress' && input.status !== 'wont_fix') throw new ApiError(409, 'VERIFYING', 'Wait for the recheck to finish, or move the task back to in progress.');
      t.status = input.status;
      if (input.status === 'ready_for_verification') {
        if (t.verification && t.verification.status !== 'pending') t.verificationHistory.unshift(t.verification);
        const watching = t.linkedType === 'error_group';
        t.verification = {
          status: 'pending',
          at: nowIso(),
          method: methodFor(t),
          detail: watching ? 'Passes if no new events arrive for 7 days after the fix is released.' : 'The recheck is running now.',
        };
        t.simVerifyAt = watching ? null : new Date(Date.now() + 4000).toISOString();
        if (t.linkedType === 'finding') markFinding(t.linkedId, 'resolved', `Marked fixed by ${user.name}; waiting for the recheck`);
        note('Marked ready for verification');
      } else if (input.status === 'wont_fix') {
        t.wontFixReason = input.wontFixReason!.trim();
        t.completedAt = nowIso();
        note(`Won't fix: ${t.wontFixReason}`);
      } else {
        t.completedAt = null;
        note(input.status === 'in_progress' ? 'Started work' : 'Moved back to to do');
      }
      audit('task.status', 'task', t.id, `Set task "${t.title}" to ${input.status.replace(/_/g, ' ')}`);
    }
    if (input.ownerId !== undefined && input.ownerId !== t.ownerId) {
      t.ownerId = input.ownerId;
      note(`Assigned to ${input.ownerId ? db.users.find((u) => u.id === input.ownerId)?.name ?? 'someone' : 'nobody'}`);
    }
    if (input.dueAt !== undefined && input.dueAt !== t.dueAt) {
      t.dueAt = input.dueAt;
      note(`Changed the due date to ${input.dueAt ? input.dueAt.slice(0, 10) : 'none'}`);
    }
    if (input.note?.trim()) note(input.note.trim());
    save();
    return taskView(t);
  },

  async getSlaSummary(filter = {}) {
    await delay();
    currentUser();
    settleTasks();
    const now = Date.now();
    const tasks = db.tasks.map(taskView).filter((t) => !filter.applicationId || t.applicationId === filter.applicationId);
    const open = tasks.filter((t) => OPEN_TASK.includes(t.status));
    const recent = tasks.filter((t) => t.completedAt && t.status === 'verified' && now - Date.parse(t.completedAt) < 30 * DAY);
    const onTime = recent.filter((t) => !t.dueAt || Date.parse(t.completedAt!) <= Date.parse(t.dueAt)).length;
    const base = filter.applicationId ? { onTime: 0, late: 0 } : db.slaBaseline;
    const done = recent.length + base.onTime + base.late;
    const acked = db.alerts.filter((a) => a.acknowledgedAt && (!filter.applicationId || a.applicationId === filter.applicationId));
    const resolved = db.incidents.filter((i) => i.resolvedAt && (!filter.applicationId || i.applicationIds.includes(filter.applicationId)));
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const mtta = mean(acked.map((a) => (Date.parse(a.acknowledgedAt!) - Date.parse(a.firstAt)) / MIN));
    const mttr = mean(resolved.map((i) => (Date.parse(i.resolvedAt!) - Date.parse(i.openedAt)) / HOUR));
    const summary: SlaSummary = {
      openTasks: open.length,
      overdue: open.filter(isOverdue).length,
      dueThisWeek: open.filter((t) => t.dueAt && !isOverdue(t) && Date.parse(t.dueAt) - now < 7 * DAY).length,
      verifiedLast30d: recent.length,
      onTimeRate: done ? Math.round(((onTime + base.onTime) / done) * 100) : null,
      byPriority: (['P1', 'P2', 'P3', 'P4'] as Priority[]).map((p) => ({ priority: p, open: open.filter((t) => t.priority === p).length, overdue: open.filter((t) => t.priority === p && isOverdue(t)).length })),
      mttaMinutes: mtta === null ? null : Math.round(mtta),
      mttrHours: mttr === null ? null : Math.round(mttr * 10) / 10,
    };
    return summary;
  },

  async testIntegration(type) {
    await delay(900);
    currentUser();
    const i = db.integrations.find((x) => x.type === type);
    if (!i || i.status !== 'connected') throw new ApiError(409, 'NOT_CONNECTED', 'Connect it first.');
    if (type === 'slack') return { ok: true, detail: `Test message posted to ${i.account}.` };
    if (type === 'webhook') return { ok: true, detail: `${i.account} answered 200 OK in 142 ms. The request was signed with your secret.` };
    throw new ApiError(400, 'NOT_SUPPORTED', 'Test messages are only for Slack and webhooks.');
  },
};