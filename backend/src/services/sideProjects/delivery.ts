import { sql } from "drizzle-orm";
import { fullName, inList, many, one, TASK_STATUSES } from "./core";

/**
 * Delivery insights (SIDE_PROJECTS_TEAMS_PLAN_TASKS_IMPLEMENTATION_PLAN.md §6):
 *   lead time  = created -> DONE (days)        cycle time = first IN_PROGRESS -> DONE (days)
 *   time in status = sum of stays from SideProjectTaskEvent (an open stay runs until now)
 *   burndown   = open tasks / scope per day, last 30 days     throughput = done per week, 8 weeks
 */

const DAY = 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return r1(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};
const ms = (v: unknown) => (v ? Date.parse(String(v).replace(" ", "T") + (String(v).endsWith("Z") ? "" : "Z")) : NaN);
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

type TaskRow = {
  id: number;
  status: string;
  assignee: number | null;
  createdAt: number;
  startedAt: number;
  completedAt: number;
  due: string | null;
  estimate: number | null;
  planItemId: number;
};

async function loadTasks(projectIds: number[]): Promise<TaskRow[]> {
  if (!projectIds.length) return [];
  const r = await many(sql`
    SELECT task_id AS id, status, assignee_user_id AS assignee, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS c,
           DATE_FORMAT(started_at, '%Y-%m-%dT%H:%i:%sZ') AS s, DATE_FORMAT(completed_at, '%Y-%m-%dT%H:%i:%sZ') AS d,
           DATE_FORMAT(due_date, '%Y-%m-%d') AS due, estimate_hours AS est, plan_item_id AS item
    FROM SideProjectTask WHERE project_id IN (${inList(projectIds)})`);
  return r.map((t) => ({
    id: Number(t.id),
    status: t.status,
    assignee: t.assignee ? Number(t.assignee) : null,
    createdAt: ms(t.c),
    startedAt: ms(t.s),
    completedAt: ms(t.d),
    due: t.due ?? null,
    estimate: t.est == null ? null : Number(t.est),
    planItemId: Number(t.item),
  }));
}

/** Average days per status from the event log (CANCELLED/DONE stays excluded). */
async function timeInStatus(taskIds: number[], now: number) {
  if (!taskIds.length) return [];
  const ev = await many(sql`
    SELECT task_id AS t, to_status AS s, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS at
    FROM SideProjectTaskEvent WHERE task_id IN (${inList(taskIds.slice(0, 5000))}) ORDER BY task_id, created_at, event_id`);
  const sums = new Map<string, number[]>();
  for (let i = 0; i < ev.length; i++) {
    const cur = ev[i];
    if (cur.s === "DONE" || cur.s === "CANCELLED") continue;
    const next = ev[i + 1] && ev[i + 1].t === cur.t ? ms(ev[i + 1].at) : now;
    const days = Math.max(0, (next - ms(cur.at)) / DAY);
    sums.set(cur.s, [...(sums.get(cur.s) ?? []), days]);
  }
  return (["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"] as const).map((s) => ({ status: s, avgDays: avg(sums.get(s) ?? []) ?? 0, samples: (sums.get(s) ?? []).length }));
}

function core(tasks: TaskRow[], now = Date.now()) {
  const today = dayKey(now);
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  tasks.forEach((t) => (byStatus[t.status] += 1));
  const done = tasks.filter((t) => t.status === "DONE" && Number.isFinite(t.completedAt));
  const cycle = done.filter((t) => Number.isFinite(t.startedAt)).map((t) => Math.max(0, (t.completedAt - t.startedAt) / DAY));
  const lead = done.map((t) => Math.max(0, (t.completedAt - t.createdAt) / DAY));
  const withDue = done.filter((t) => t.due);
  const onTime = withDue.filter((t) => dayKey(t.completedAt) <= (t.due as string)).length;
  const open = tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");
  const overdue = open.filter((t) => t.due && t.due < today);
  return {
    total: tasks.length,
    byStatus,
    open: open.length,
    done: done.length,
    overdue: overdue.length,
    blocked: byStatus.BLOCKED,
    avgCycleDays: avg(cycle),
    medianCycleDays: median(cycle),
    avgLeadDays: avg(lead),
    onTimeRate: withDue.length ? Math.round((onTime / withDue.length) * 100) : null,
    openEstimateHours: r1(open.reduce((s, t) => s + (t.estimate ?? 0), 0)),
  };
}

/** Everything the project's Insights view shows. */
export async function projectDelivery(projectId: number) {
  const now = Date.now();
  const tasks = await loadTasks([projectId]);
  const k = core(tasks, now);

  // Burndown: last 30 days.
  const burndown = Array.from({ length: 30 }, (_, i) => {
    const end = Date.parse(`${dayKey(now - (29 - i) * DAY)}T23:59:59Z`);
    const scope = tasks.filter((t) => t.createdAt <= end && !(t.status === "CANCELLED" && Number.isFinite(t.completedAt) && t.completedAt <= end)).length;
    const remaining = tasks.filter((t) => t.createdAt <= end && !(t.status === "DONE" && t.completedAt <= end) && t.status !== "CANCELLED").length;
    return { date: dayKey(end), scope, remaining };
  });
  // Throughput: done per week (Monday-based), last 8 weeks.
  const monday = (t: number) => {
    const d = new Date(dayKey(t) + "T00:00:00Z");
    return dayKey(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY);
  };
  const thisMonday = Date.parse(monday(now) + "T00:00:00Z");
  const throughput = Array.from({ length: 8 }, (_, i) => {
    const start = thisMonday - (7 - i) * 7 * DAY;
    const end = start + 7 * DAY;
    return { week: dayKey(start), done: tasks.filter((t) => t.status === "DONE" && t.completedAt >= start && t.completedAt < end).length };
  });

  const statusTime = await timeInStatus(tasks.map((t) => t.id), now);

  // Plan rollup.
  const items = await many(sql`SELECT item_id AS id, kind, status, title, ${sql.raw("DATE_FORMAT(due_date, '%Y-%m-%d')")} AS due FROM SideProjectPlanItem WHERE project_id = ${projectId}`);
  const features = items.filter((i) => i.kind === "FEATURE" && i.status !== "CANCELLED");
  const planByStatus: Record<string, number> = {};
  items.filter((i) => i.kind === "FEATURE").forEach((i) => (planByStatus[i.status] = (planByStatus[i.status] ?? 0) + 1));
  const today = dayKey(now);
  const latePlan = features.filter((i) => i.due && i.due < today && i.status !== "DONE").map((i) => ({ id: Number(i.id), title: i.title, due: i.due, status: i.status }));

  // Teammates.
  const team = await many(sql`
    SELECT sp.owner_user_id AS id, ${fullName("p")} AS name, 'LEAD' AS roleKey, NULL AS roleTitle, NULL AS responsibilities, 1 AS isManager, 1 AS owner
    FROM SideProject sp JOIN UserProfile p ON p.user_id = sp.owner_user_id WHERE sp.project_id = ${projectId}
    UNION ALL
    SELECT m.user_id, ${fullName("p")}, m.role_key, m.role_title, m.responsibilities, m.is_manager, 0
    FROM SideProjectMember m JOIN UserProfile p ON p.user_id = m.user_id WHERE m.project_id = ${projectId} AND m.status = 'ACCEPTED'`);
  const logs = tasks.length
    ? await many(sql`
        SELECT l.user_id AS u, SUM(l.hours) AS h, MAX(l.work_date) AS last FROM SideProjectTaskLog l
        WHERE l.task_id IN (${inList(tasks.map((t) => t.id))}) GROUP BY l.user_id`)
    : [];
  const reports = await many(sql`
    SELECT author_id AS u, COUNT(*) AS n, DATE_FORMAT(MAX(COALESCE(work_date, DATE(created_at))), '%Y-%m-%d') AS last
    FROM SideProjectUpdate WHERE project_id = ${projectId} GROUP BY author_id`);
  const members = team.map((m) => {
    const id = Number(m.id);
    const mine = tasks.filter((t) => t.assignee === id);
    const c = core(mine, now);
    const l = logs.find((x) => Number(x.u) === id);
    const rp = reports.find((x) => Number(x.u) === id);
    return {
      id,
      name: m.name,
      owner: Number(m.owner) === 1,
      roleKey: m.roleKey,
      roleTitle: m.roleTitle,
      responsibilities: m.responsibilities,
      isManager: Number(m.isManager) === 1,
      assigned: mine.length,
      inProgress: c.byStatus.IN_PROGRESS,
      inReview: c.byStatus.IN_REVIEW,
      blocked: c.byStatus.BLOCKED,
      todo: c.byStatus.TODO,
      done: c.done,
      overdue: c.overdue,
      avgCycleDays: c.avgCycleDays,
      onTimeRate: c.onTimeRate,
      openEstimateHours: c.openEstimateHours,
      hoursLogged: r1(Number(l?.h ?? 0)),
      reports: Number(rp?.n ?? 0),
      lastReport: rp?.last ?? null,
    };
  });
  const unassigned = tasks.filter((t) => !t.assignee && t.status !== "DONE" && t.status !== "CANCELLED").length;

  return {
    kpis: { ...k, unassigned, planItems: features.length, planDone: features.filter((i) => i.status === "DONE").length },
    burndown,
    throughput,
    statusTime,
    planByStatus,
    latePlan: latePlan.slice(0, 10),
    members,
  };
}

/** School-wide delivery block for the monitor summary (projects in the viewer's scope). */
export async function scopeDelivery(projectIds: number[]) {
  const tasks = await loadTasks(projectIds.slice(0, 3000));
  const k = core(tasks);
  if (!projectIds.length) return { ...k, teamProjects: 0, withPlan: 0, planDone: 0, planItems: 0, atRisk: [] as Array<{ id: number; title: string; overdue: number; blocked: number; open: number }> };
  const ids = projectIds.slice(0, 3000);
  const plan = await one(sql`
    SELECT COUNT(DISTINCT project_id) AS withPlan, SUM(kind = 'FEATURE' AND status <> 'CANCELLED') AS items, SUM(kind = 'FEATURE' AND status = 'DONE') AS done
    FROM SideProjectPlanItem WHERE project_id IN (${inList(ids)})`);
  const teams = await one(sql`SELECT COUNT(*) AS n FROM SideProject WHERE project_id IN (${inList(ids)}) AND team_mode = 'TEAM'`);
  const today = new Date().toISOString().slice(0, 10);
  const risk = await many(sql`
    SELECT sp.project_id AS id, sp.title,
           SUM(t.status NOT IN ('DONE','CANCELLED') AND t.due_date < ${today}) AS overdue,
           SUM(t.status = 'BLOCKED') AS blocked,
           SUM(t.status NOT IN ('DONE','CANCELLED')) AS open
    FROM SideProject sp JOIN SideProjectTask t ON t.project_id = sp.project_id
    WHERE sp.project_id IN (${inList(ids)})
    GROUP BY sp.project_id, sp.title
    HAVING overdue > 0 OR blocked > 0
    ORDER BY overdue DESC, blocked DESC LIMIT 8`);
  return {
    ...k,
    teamProjects: Number(teams?.n ?? 0),
    withPlan: Number(plan?.withPlan ?? 0),
    planItems: Number(plan?.items ?? 0),
    planDone: Number(plan?.done ?? 0),
    atRisk: risk.map((r) => ({ id: Number(r.id), title: r.title, overdue: Number(r.overdue), blocked: Number(r.blocked), open: Number(r.open) })),
  };
}
