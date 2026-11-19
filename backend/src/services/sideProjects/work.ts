import { sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import {
  clip, fail, fullName, insertId, iso, latestToday, many, one, PLAN_STATUSES, PRIORITIES, recordEvent, STAGES, TASK_STATUSES, touch, ymd,
  type PlanStatus, type Priority, type TaskStatus,
} from "./core";
import { ProjectAccess } from "./access";
import { PLAN_TEMPLATES, templateFor } from "./planTemplates";
import { notifyWork } from "./notify";
import * as v from "./validate";
import { getCurrentAcademicYearId } from "../../utils/academicYear";

/**
 * The implementation plan (phases -> features) and the tasks inside it (migration 133).
 * See SIDE_PROJECTS_TEAMS_PLAN_TASKS_IMPLEMENTATION_PLAN.md §2-§5 for the states and rules.
 */

const pid = (a: ProjectAccess) => Number(a.project.project_id);
const DAY = 86_400_000;
const todayYmd = () => new Date().toISOString().slice(0, 10);
const ymdOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const dayOf = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);

const priorityOf = (raw: unknown, field = "priority"): Priority | undefined => {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const p = String(raw).toUpperCase();
  if (!(PRIORITIES as readonly string[]).includes(p)) fail(400, "VALIDATION", "Unknown priority", field);
  return p as Priority;
};
const hoursOf = (raw: unknown, field: string, max: number): number | null => {
  if (raw === undefined || raw === null || raw === "") return null;
  const h = Number(raw);
  if (!Number.isFinite(h) || h < 0.5 || h > max || Math.round(h * 2) !== h * 2) fail(400, "VALIDATION", `Between 0.5 and ${max}, in half hours`, field);
  return h;
};

/**
 * Who can be given work: the owner and every teammate, accepted or still invited (they are
 * notified of the task, which also prompts them to accept). Editing still needs acceptance.
 */
async function teamIds(projectId: number): Promise<number[]> {
  const r = await many(sql`
    SELECT owner_user_id AS id FROM SideProject WHERE project_id = ${projectId}
    UNION SELECT user_id FROM SideProjectMember WHERE project_id = ${projectId} AND status IN ('ACCEPTED', 'INVITED')`);
  return r.map((x) => Number(x.id));
}
/** The people who plan and assign: the owner and teammates marked manager. */
async function managerIds(projectId: number): Promise<number[]> {
  const r = await many(sql`
    SELECT owner_user_id AS id FROM SideProject WHERE project_id = ${projectId}
    UNION SELECT user_id FROM SideProjectMember WHERE project_id = ${projectId} AND status = 'ACCEPTED' AND is_manager = 1`);
  return r.map((x) => Number(x.id));
}
async function assertTeammate(projectId: number, userId: number | null, field: string) {
  if (userId === null) return;
  if (!(await teamIds(projectId)).includes(userId)) fail(400, "VALIDATION", "Choose someone on the team", field);
}
const userIdOf = (raw: unknown): number | null | undefined => {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "" || raw === "null") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) fail(400, "VALIDATION", "Choose someone on the team", "assigneeId");
  return n;
};

// ------------------------------------------------------------------------------------- rollup

/** Maps a task state onto the plan vocabulary for rollups. */
const asPlan = (s: string): PlanStatus => (s === "TODO" ? "PLANNED" : (s as PlanStatus));

/**
 * AUTO status of a plan item from its children (tasks, and features for a phase). Cancelled
 * children are ignored; without children the item keeps BACKLOG/PLANNED.
 */
export function rollupStatus(children: string[], current: PlanStatus): PlanStatus {
  const live = children.map(asPlan).filter((s) => s !== "CANCELLED");
  if (!live.length) return current === "BACKLOG" ? "BACKLOG" : "PLANNED";
  if (live.every((s) => s === "DONE")) return "DONE";
  if (live.some((s) => s === "IN_PROGRESS")) return "IN_PROGRESS";
  if (live.some((s) => s === "BLOCKED")) return "BLOCKED";
  if (live.some((s) => s === "IN_REVIEW")) return "IN_REVIEW";
  if (live.some((s) => s === "DONE")) return "IN_PROGRESS";
  return current === "BACKLOG" && live.every((s) => s === "BACKLOG") ? "BACKLOG" : "PLANNED";
}

async function setItemStatus(itemId: number, status: PlanStatus) {
  await db.execute(sql`
    UPDATE SideProjectPlanItem
    SET status = ${status}, status_changed_at = IF(status = ${status}, status_changed_at, UTC_TIMESTAMP()),
        done_at = IF(${status} = 'DONE', COALESCE(done_at, UTC_TIMESTAMP()), NULL), updated_at = UTC_TIMESTAMP()
    WHERE item_id = ${itemId}`);
}

/** Recomputes an AUTO item and then its phase. */
export async function rollup(itemId: number | null | undefined) {
  if (!itemId) return;
  const it = await one(sql`SELECT item_id, parent_id, kind, status, status_mode FROM SideProjectPlanItem WHERE item_id = ${itemId}`);
  if (!it) return;
  if (it.status_mode === "AUTO") {
    const tasks = await many(sql`SELECT status FROM SideProjectTask WHERE plan_item_id = ${itemId}`);
    const kids = it.kind === "PHASE" ? await many(sql`SELECT status FROM SideProjectPlanItem WHERE parent_id = ${itemId}`) : [];
    const next = rollupStatus([...tasks.map((t) => t.status), ...kids.map((k) => k.status)], it.status);
    if (next !== it.status) await setItemStatus(itemId, next);
  }
  if (it.parent_id) await rollup(Number(it.parent_id));
}

// ------------------------------------------------------------------------------------- plan

/** Per plan item: how many reports cover it and when it was last reported on. */
export async function reportingByItem(projectId: number) {
  const rows = await many(sql`
    SELECT w.plan_item_id AS itemId, COUNT(DISTINCT w.update_id) AS n,
           DATE_FORMAT(MAX(COALESCE(u.work_date, u.created_at)), '%Y-%m-%d') AS last,
           COALESCE(SUM(w.hours), 0) AS hours
    FROM SideProjectUpdateWork w JOIN SideProjectUpdate u ON u.update_id = w.update_id
    WHERE w.project_id = ${projectId}
    GROUP BY w.plan_item_id`);
  return new Map(rows.map((r) => [Number(r.itemId), { reports: Number(r.n), lastReport: r.last as string | null, reportedHours: Number(r.hours) }]));
}

export async function planOf(projectId: number) {
  const items = await many(sql`
    SELECT i.item_id AS id, i.parent_id AS parentId, i.kind, i.title, i.description, i.status, i.status_mode AS statusMode,
           i.priority, i.stage, i.owner_user_id AS ownerId, ${fullName("op")} AS ownerName,
           ${ymd("i.start_date")} AS startDate, ${ymd("i.due_date")} AS dueDate, i.estimate_hours AS estimateHours, i.sort,
           ${iso("i.done_at")} AS doneAt, ${iso("i.status_changed_at")} AS statusChangedAt
    FROM SideProjectPlanItem i LEFT JOIN UserProfile op ON op.user_id = i.owner_user_id
    WHERE i.project_id = ${projectId}
    ORDER BY i.sort, i.item_id`);
  const tasks = await tasksOf(sql`t.project_id = ${projectId}`);
  const rep = await reportingByItem(projectId);
  return {
    items: items.map((i) => ({
      ...i,
      id: Number(i.id),
      parentId: i.parentId ? Number(i.parentId) : null,
      ownerId: i.ownerId ? Number(i.ownerId) : null,
      estimateHours: i.estimateHours == null ? null : Number(i.estimateHours),
      sort: Number(i.sort),
      // Reports written against this item (migration 138).
      ...(rep.get(Number(i.id)) ?? { reports: 0, lastReport: null, reportedHours: 0 }),
    })),
    tasks,
  };
}

export async function tasksOf(where: SQL) {
  const r = await many(sql`
    SELECT t.task_id AS id, t.project_id AS projectId, t.plan_item_id AS planItemId, t.title, t.description, t.status, t.priority,
           t.assignee_user_id AS assigneeId, ${fullName("ap")} AS assigneeName, ${ymd("t.due_date")} AS dueDate,
           t.estimate_hours AS estimateHours, t.blocked_reason AS blockedReason, t.sort,
           ${iso("t.started_at")} AS startedAt, ${iso("t.completed_at")} AS completedAt, ${iso("t.status_changed_at")} AS statusChangedAt,
           ${iso("t.created_at")} AS createdAt, t.created_by AS createdBy,
           (SELECT COALESCE(SUM(l.hours), 0) FROM SideProjectTaskLog l WHERE l.task_id = t.task_id) AS spentHours
    FROM SideProjectTask t LEFT JOIN UserProfile ap ON ap.user_id = t.assignee_user_id
    WHERE ${where}
    ORDER BY FIELD(t.status, 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'TODO', 'DONE', 'CANCELLED'), t.sort, t.task_id`);
  const today = todayYmd();
  return r.map((t) => ({
    ...t,
    id: Number(t.id),
    projectId: Number(t.projectId),
    planItemId: Number(t.planItemId),
    assigneeId: t.assigneeId ? Number(t.assigneeId) : null,
    createdBy: t.createdBy ? Number(t.createdBy) : null,
    estimateHours: t.estimateHours == null ? null : Number(t.estimateHours),
    spentHours: Number(t.spentHours || 0),
    sort: Number(t.sort),
    overdue: !!t.dueDate && t.dueDate < today && t.status !== "DONE" && t.status !== "CANCELLED",
  }));
}

interface ItemInput {
  kind?: unknown;
  parentId?: unknown;
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  stage?: unknown;
  ownerId?: unknown;
  startDate?: unknown;
  dueDate?: unknown;
  estimateHours?: unknown;
  status?: unknown;
  statusMode?: unknown;
}

export async function createItem(a: ProjectAccess, by: number, body: ItemInput) {
  const projectId = pid(a);
  const kind = String(body.kind ?? "FEATURE").toUpperCase();
  if (kind !== "PHASE" && kind !== "FEATURE") fail(400, "VALIDATION", "Choose phase or feature", "kind");
  const title = v.text(body.title, "title", { min: 2, max: 150, required: true, label: "Title" })!;
  const description = v.text(body.description, "description", { max: 2000, label: "Description" });
  let parentId: number | null = null;
  if (kind === "FEATURE") {
    parentId = Number(body.parentId) || null;
    if (parentId) {
      const parent = await one(sql`SELECT kind FROM SideProjectPlanItem WHERE item_id = ${parentId} AND project_id = ${projectId}`);
      if (!parent || parent.kind !== "PHASE") fail(400, "VALIDATION", "Choose a phase of this project", "parentId");
    }
  }
  const priority = priorityOf(body.priority) ?? "MEDIUM";
  const stage = body.stage ? String(body.stage).toUpperCase() : null;
  if (stage && !(STAGES as readonly string[]).includes(stage)) fail(400, "VALIDATION", "Unknown stage", "stage");
  const ownerId = userIdOf(body.ownerId) ?? null;
  await assertTeammate(projectId, ownerId, "ownerId");
  const start = v.date(body.startDate, "startDate");
  const due = v.date(body.dueDate, "dueDate");
  if (start && due && due < start) fail(400, "VALIDATION", "Due before the start", "dueDate");
  const est = hoursOf(body.estimateHours, "estimateHours", 999);
  const status = body.status ? String(body.status).toUpperCase() : "PLANNED";
  if (!(PLAN_STATUSES as readonly string[]).includes(status)) fail(400, "VALIDATION", "Unknown status", "status");
  const pos = await one(sql`SELECT COALESCE(MAX(sort), 0) + 1 AS p FROM SideProjectPlanItem WHERE project_id = ${projectId} AND parent_id <=> ${parentId}`);
  const r = await db.execute(sql`
    INSERT INTO SideProjectPlanItem (project_id, parent_id, kind, title, description, status, status_mode, priority, stage, owner_user_id,
      start_date, due_date, estimate_hours, sort, status_changed_at, created_by, created_at, updated_at)
    VALUES (${projectId}, ${parentId}, ${kind}, ${title}, ${description}, ${status}, ${status === "BACKLOG" || status === "PLANNED" ? "AUTO" : "MANUAL"},
      ${priority}, ${stage}, ${ownerId}, ${start}, ${due}, ${est}, ${Number(pos?.p ?? 1)}, UTC_TIMESTAMP(), ${by}, UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
  const id = insertId(r);
  await rollup(parentId);
  await recordEvent(projectId, by, "PLAN_ITEM", null, kind, title);
  await touch(projectId, await getCurrentAcademicYearId());
  return id;
}

export async function updateItem(a: ProjectAccess, by: number, itemId: number, body: ItemInput) {
  const projectId = pid(a);
  const it = await one(sql`SELECT * FROM SideProjectPlanItem WHERE item_id = ${itemId} AND project_id = ${projectId}`);
  if (!it) fail(404, "NOT_FOUND", "Plan item not found");
  const sets: SQL[] = [];
  if (body.title !== undefined) sets.push(sql`title = ${v.text(body.title, "title", { min: 2, max: 150, required: true, label: "Title" })}`);
  if (body.description !== undefined) sets.push(sql`description = ${v.text(body.description, "description", { max: 2000, label: "Description" })}`);
  const pr = priorityOf(body.priority);
  if (pr) sets.push(sql`priority = ${pr}`);
  if (body.stage !== undefined) {
    const st = body.stage ? String(body.stage).toUpperCase() : null;
    if (st && !(STAGES as readonly string[]).includes(st)) fail(400, "VALIDATION", "Unknown stage", "stage");
    sets.push(sql`stage = ${st}`);
  }
  if (body.ownerId !== undefined) {
    const o = userIdOf(body.ownerId) ?? null;
    await assertTeammate(projectId, o, "ownerId");
    sets.push(sql`owner_user_id = ${o}`);
  }
  const start = body.startDate !== undefined ? v.date(body.startDate, "startDate") : it.start_date ? String(it.start_date instanceof Date ? it.start_date.toISOString() : it.start_date).slice(0, 10) : null;
  const due = body.dueDate !== undefined ? v.date(body.dueDate, "dueDate") : it.due_date ? String(it.due_date instanceof Date ? it.due_date.toISOString() : it.due_date).slice(0, 10) : null;
  if (start && due && due < start) fail(400, "VALIDATION", "Due before the start", "dueDate");
  if (body.startDate !== undefined) sets.push(sql`start_date = ${start}`);
  if (body.dueDate !== undefined) sets.push(sql`due_date = ${due}`);
  if (body.estimateHours !== undefined) sets.push(sql`estimate_hours = ${hoursOf(body.estimateHours, "estimateHours", 999)}`);
  let mode = it.status_mode as "AUTO" | "MANUAL";
  if (body.statusMode !== undefined) {
    const m = String(body.statusMode).toUpperCase();
    if (m !== "AUTO" && m !== "MANUAL") fail(400, "VALIDATION", "Choose auto or manual", "statusMode");
    mode = m as "AUTO" | "MANUAL";
    sets.push(sql`status_mode = ${mode}`);
  }
  let manualStatus: PlanStatus | null = null;
  if (body.status !== undefined) {
    const st = String(body.status).toUpperCase();
    if (!(PLAN_STATUSES as readonly string[]).includes(st)) fail(400, "VALIDATION", "Unknown status", "status");
    manualStatus = st as PlanStatus;
    // Setting a status by hand takes the item off automatic.
    if (body.statusMode === undefined && mode === "AUTO") {
      mode = "MANUAL";
      sets.push(sql`status_mode = 'MANUAL'`);
    }
  }
  if (sets.length) await db.execute(sql`UPDATE SideProjectPlanItem SET ${sql.join(sets, sql`, `)}, updated_at = UTC_TIMESTAMP() WHERE item_id = ${itemId}`);
  if (manualStatus && manualStatus !== it.status) {
    await setItemStatus(itemId, manualStatus);
    await recordEvent(projectId, by, "PLAN_STATUS", it.status, manualStatus, it.title);
  }
  await rollup(mode === "AUTO" ? itemId : it.parent_id ? Number(it.parent_id) : null);
  await touch(projectId, await getCurrentAcademicYearId());
}

/** A feature's tasks move up to its phase; a phase must be emptied first. */
export async function deleteItem(a: ProjectAccess, by: number, itemId: number) {
  const projectId = pid(a);
  const it = await one(sql`SELECT * FROM SideProjectPlanItem WHERE item_id = ${itemId} AND project_id = ${projectId}`);
  if (!it) fail(404, "NOT_FOUND", "Plan item not found");
  const kids = await one(sql`SELECT COUNT(*) AS n FROM SideProjectPlanItem WHERE parent_id = ${itemId}`);
  if (Number(kids?.n ?? 0) > 0) fail(409, "HAS_FEATURES", "Move or delete its features first");
  const tasks = await one(sql`SELECT COUNT(*) AS n FROM SideProjectTask WHERE plan_item_id = ${itemId}`);
  if (Number(tasks?.n ?? 0) > 0) {
    if (!it.parent_id) fail(409, "HAS_TASKS", "Move or delete its tasks first");
    await db.execute(sql`UPDATE SideProjectTask SET plan_item_id = ${it.parent_id}, updated_at = UTC_TIMESTAMP() WHERE plan_item_id = ${itemId}`);
  }
  await db.execute(sql`DELETE FROM SideProjectPlanItem WHERE item_id = ${itemId}`);
  await rollup(it.parent_id ? Number(it.parent_id) : null);
  await recordEvent(projectId, by, "PLAN_ITEM_REMOVED", it.kind, null, it.title);
}

/** Saves the order of the items under one parent (null = the phases). */
export async function reorderItems(a: ProjectAccess, parentId: number | null, ids: number[]) {
  for (const [i, id] of ids.slice(0, 300).entries()) {
    await db.execute(sql`UPDATE SideProjectPlanItem SET sort = ${i + 1} WHERE item_id = ${id} AND project_id = ${pid(a)} AND parent_id <=> ${parentId}`);
  }
}

/** The template catalogue, with the one suggested for this project's category. */
export async function templates(a: ProjectAccess) {
  const cat = a.project.category_id ? await one(sql`SELECT slug FROM SideProjectCategory WHERE category_id = ${a.project.category_id}`) : null;
  return { suggested: templateFor(cat?.slug).key, templates: PLAN_TEMPLATES };
}

/**
 * The plan automation: creates the template's phases and features, dating each phase from the
 * project's stage plan and spreading its features evenly over the phase. Refused when the
 * plan already has items (unless `append`).
 */
export async function generatePlan(a: ProjectAccess, by: number, body: { template?: unknown; append?: unknown }) {
  const projectId = pid(a);
  const t = PLAN_TEMPLATES.find((x) => x.key === String(body.template ?? ""));
  if (!t) fail(400, "VALIDATION", "Choose a template", "template");
  const existing = await one(sql`SELECT COUNT(*) AS n FROM SideProjectPlanItem WHERE project_id = ${projectId}`);
  if (Number(existing?.n ?? 0) > 0 && !(body.append === true || body.append === "true")) fail(409, "PLAN_EXISTS", "This project already has a plan");
  const windows = await many(sql`SELECT stage, ${ymd("planned_start")} AS s, ${ymd("planned_end")} AS e FROM SideProjectStage WHERE project_id = ${projectId}`);
  const win = new Map(windows.map((w) => [w.stage, { s: w.s as string, e: w.e as string }]));
  const owner = Number(a.project.owner_user_id);
  const base = await one(sql`SELECT COALESCE(MAX(sort), 0) AS p FROM SideProjectPlanItem WHERE project_id = ${projectId} AND parent_id IS NULL`);
  let created = 0;
  for (const [i, ph] of t!.phases.entries()) {
    const w = win.get(ph.stage);
    const r = await db.execute(sql`
      INSERT INTO SideProjectPlanItem (project_id, parent_id, kind, title, status, status_mode, priority, stage, owner_user_id, start_date, due_date, sort, status_changed_at, created_by, created_at, updated_at)
      VALUES (${projectId}, NULL, 'PHASE', ${ph.title}, 'PLANNED', 'AUTO', 'MEDIUM', ${ph.stage}, ${owner}, ${w?.s ?? null}, ${w?.e ?? null}, ${Number(base?.p ?? 0) + i + 1}, UTC_TIMESTAMP(), ${by}, UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
    const phaseId = insertId(r);
    created += 1;
    const span = w ? dayOf(w.e) - dayOf(w.s) + 1 : 0;
    for (const [j, f] of ph.features.entries()) {
      const due = w ? ymdOf(dayOf(w.s) + Math.max(0, Math.round(((j + 1) / ph.features.length) * span) - 1)) : null;
      await db.execute(sql`
        INSERT INTO SideProjectPlanItem (project_id, parent_id, kind, title, status, status_mode, priority, stage, start_date, due_date, sort, status_changed_at, created_by, created_at, updated_at)
        VALUES (${projectId}, ${phaseId}, 'FEATURE', ${f}, 'PLANNED', 'AUTO', 'MEDIUM', ${ph.stage}, ${w?.s ?? null}, ${due}, ${j + 1}, UTC_TIMESTAMP(), ${by}, UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
      created += 1;
    }
  }
  await recordEvent(projectId, by, "PLAN_GENERATED", null, t!.key, `${created} items`);
  await touch(projectId, await getCurrentAcademicYearId());
  return { created };
}

// ------------------------------------------------------------------------------------- tasks

interface TaskInput {
  planItemId?: unknown;
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  assigneeId?: unknown;
  dueDate?: unknown;
  estimateHours?: unknown;
}

async function itemOf(projectId: number, raw: unknown) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) fail(400, "VALIDATION", "Choose the plan item this task belongs to", "planItemId");
  const it = await one(sql`SELECT item_id, title FROM SideProjectPlanItem WHERE item_id = ${id} AND project_id = ${projectId}`);
  if (!it) fail(400, "VALIDATION", "Choose a plan item of this project", "planItemId");
  return { id, title: String(it.title) };
}

async function taskRow(projectId: number, taskId: number) {
  const t = await one(sql`SELECT * FROM SideProjectTask WHERE task_id = ${taskId} AND project_id = ${projectId}`);
  if (!t) fail(404, "NOT_FOUND", "Task not found");
  return t;
}

/** Any teammate creates tasks (for themself); managers assign anyone. */
export async function createTask(a: ProjectAccess, by: number, body: TaskInput) {
  const projectId = pid(a);
  if (!a.canEdit) fail(403, "NOT_TEAM", "Only the project's team can add tasks");
  const item = await itemOf(projectId, body.planItemId);
  const title = v.text(body.title, "title", { min: 3, max: 200, required: true, label: "Title" })!;
  const description = v.text(body.description, "description", { max: 4000, label: "Description" });
  const priority = priorityOf(body.priority) ?? "MEDIUM";
  let assignee = userIdOf(body.assigneeId);
  if (assignee === undefined) assignee = a.canManage ? null : by;
  if (assignee !== null && assignee !== by && !a.canManage) fail(403, "NOT_MANAGER", "Only the owner or a team manager can assign tasks to others", "assigneeId");
  await assertTeammate(projectId, assignee, "assigneeId");
  const due = v.date(body.dueDate, "dueDate");
  const est = hoursOf(body.estimateHours, "estimateHours", 999);
  const pos = await one(sql`SELECT COALESCE(MAX(sort), 0) + 1 AS p FROM SideProjectTask WHERE project_id = ${projectId}`);
  const r = await db.execute(sql`
    INSERT INTO SideProjectTask (project_id, plan_item_id, title, description, status, priority, assignee_user_id, due_date, estimate_hours, sort, status_changed_at, created_by, created_at, updated_at)
    VALUES (${projectId}, ${item.id}, ${title}, ${description}, 'TODO', ${priority}, ${assignee}, ${due}, ${est}, ${Number(pos?.p ?? 1)}, UTC_TIMESTAMP(), ${by}, UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
  const id = insertId(r);
  await db.execute(sql`INSERT INTO SideProjectTaskEvent (task_id, from_status, to_status, actor_id, created_at) VALUES (${id}, NULL, 'TODO', ${by}, UTC_TIMESTAMP())`);
  await rollup(item.id);
  await touch(projectId, await getCurrentAcademicYearId());
  if (assignee && assignee !== by) await notifyWork([assignee], "side_project_task_assigned", `New task: ${title}`, `You were assigned a task in ${a.project.title}.`, projectId, by);
  return id;
}

/** Edit a task. The assignee, its creator or a manager edit; only managers reassign. */
export async function updateTask(a: ProjectAccess, by: number, taskId: number, body: TaskInput) {
  const projectId = pid(a);
  const t = await taskRow(projectId, taskId);
  const mine = Number(t.assignee_user_id) === by || Number(t.created_by) === by;
  if (!a.canManage && !mine) fail(403, "NOT_ALLOWED", "Only the assignee or a team manager can change this task");
  const sets: SQL[] = [];
  let item: number | null = null;
  if (body.planItemId !== undefined) {
    item = (await itemOf(projectId, body.planItemId)).id;
    sets.push(sql`plan_item_id = ${item}`);
  }
  if (body.title !== undefined) sets.push(sql`title = ${v.text(body.title, "title", { min: 3, max: 200, required: true, label: "Title" })}`);
  if (body.description !== undefined) sets.push(sql`description = ${v.text(body.description, "description", { max: 4000, label: "Description" })}`);
  const pr = priorityOf(body.priority);
  if (pr) sets.push(sql`priority = ${pr}`);
  if (body.dueDate !== undefined) sets.push(sql`due_date = ${v.date(body.dueDate, "dueDate")}, overdue_nudged_on = NULL`);
  if (body.estimateHours !== undefined) sets.push(sql`estimate_hours = ${hoursOf(body.estimateHours, "estimateHours", 999)}`);
  let newAssignee: number | null | undefined;
  if (body.assigneeId !== undefined) {
    newAssignee = userIdOf(body.assigneeId) ?? null;
    const current = t.assignee_user_id ? Number(t.assignee_user_id) : null;
    // A teammate may take an unassigned task, or hand their own back; everything else is a manager's call.
    const selfPick = current === null && newAssignee === by;
    const handBack = current === by && newAssignee === null;
    if (newAssignee !== current && !a.canManage && !selfPick && !handBack) fail(403, "NOT_MANAGER", "Only the owner or a team manager can assign tasks to others", "assigneeId");
    await assertTeammate(projectId, newAssignee, "assigneeId");
    sets.push(sql`assignee_user_id = ${newAssignee}`);
  }
  if (!sets.length) return;
  await db.execute(sql`UPDATE SideProjectTask SET ${sql.join(sets, sql`, `)}, updated_at = UTC_TIMESTAMP() WHERE task_id = ${taskId}`);
  if (item && item !== Number(t.plan_item_id)) {
    await rollup(Number(t.plan_item_id));
    await rollup(item);
  }
  if (newAssignee && newAssignee !== by && newAssignee !== Number(t.assignee_user_id)) {
    await notifyWork([newAssignee], "side_project_task_assigned", `New task: ${t.title}`, `You were assigned a task in ${a.project.title}.`, projectId, by);
  }
}

/**
 * Moves a task to another state. The assignee moves their own tasks, managers any task, and
 * a teammate who starts an unassigned task takes it. BLOCKED needs a reason.
 */
export async function moveTask(a: ProjectAccess, by: number, taskId: number, body: { to?: unknown; note?: unknown }) {
  const projectId = pid(a);
  const t = await taskRow(projectId, taskId);
  const to = String(body.to ?? "").toUpperCase() as TaskStatus;
  if (!(TASK_STATUSES as readonly string[]).includes(to)) fail(400, "VALIDATION", "Unknown task state", "to");
  if (to === t.status) fail(400, "SAME_STATUS", "The task is already there", "to");
  const assignee = t.assignee_user_id ? Number(t.assignee_user_id) : null;
  const takeIt = assignee === null && a.canEdit && !a.canManage;
  if (!a.canManage && assignee !== by && !takeIt) fail(403, "NOT_ALLOWED", "Only the assignee or a team manager can move this task");
  const note = clip(body.note, 500) || null;
  if (to === "BLOCKED" && (!note || note.length < 3)) fail(400, "VALIDATION", "Say what is blocking it", "note");
  await db.execute(sql`
    UPDATE SideProjectTask
    SET status = ${to}, status_changed_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP(),
        blocked_reason = ${to === "BLOCKED" ? note : null},
        assignee_user_id = ${takeIt ? by : assignee},
        started_at = IF(${to} = 'IN_PROGRESS', COALESCE(started_at, UTC_TIMESTAMP()), started_at),
        completed_at = IF(${to} = 'DONE', UTC_TIMESTAMP(), IF(${to} = 'CANCELLED', completed_at, NULL))
    WHERE task_id = ${taskId}`);
  await db.execute(sql`INSERT INTO SideProjectTaskEvent (task_id, from_status, to_status, actor_id, note, created_at) VALUES (${taskId}, ${t.status}, ${to}, ${by}, ${note}, UTC_TIMESTAMP())`);
  await rollup(Number(t.plan_item_id));
  await touch(projectId, await getCurrentAcademicYearId());
  if (to === "IN_REVIEW") await notifyWork(await managerIds(projectId), "side_project_task_review", `Review: ${t.title}`, `A task in ${a.project.title} is ready for review.`, projectId, by);
  if (to === "BLOCKED") await notifyWork(await managerIds(projectId), "side_project_task_blocked", `Blocked: ${t.title}`, note ?? "A task is blocked.", projectId, by);
  if (to === "DONE") {
    // Done: whoever created it and the people who plan hear about it.
    const to2 = [...new Set([...(await managerIds(projectId)), ...(t.created_by ? [Number(t.created_by)] : [])])];
    await notifyWork(to2, "side_project_task_done", `Done: ${t.title}`, `A task in ${a.project.title} was completed.`, projectId, by);
  }
  return { status: to };
}

export async function deleteTask(a: ProjectAccess, by: number, taskId: number) {
  const projectId = pid(a);
  const t = await taskRow(projectId, taskId);
  if (!a.canManage && !(Number(t.created_by) === by && t.status === "TODO")) fail(403, "NOT_ALLOWED", "Only a team manager can delete this task");
  await db.execute(sql`DELETE FROM SideProjectTaskLog WHERE task_id = ${taskId}`);
  await db.execute(sql`DELETE FROM SideProjectTaskEvent WHERE task_id = ${taskId}`);
  await db.execute(sql`DELETE FROM SideProjectTask WHERE task_id = ${taskId}`);
  await rollup(Number(t.plan_item_id));
  await recordEvent(projectId, by, "TASK_REMOVED", null, null, t.title);
}

export async function taskDetail(a: ProjectAccess, taskId: number) {
  const projectId = pid(a);
  await taskRow(projectId, taskId);
  const [task] = await tasksOf(sql`t.task_id = ${taskId}`);
  const [history, logs] = await Promise.all([
    many(sql`
      SELECT e.event_id AS id, e.from_status AS fromStatus, e.to_status AS toStatus, e.note, ${iso("e.created_at")} AS at, e.actor_id AS actorId, ${fullName("p")} AS actor
      FROM SideProjectTaskEvent e LEFT JOIN UserProfile p ON p.user_id = e.actor_id WHERE e.task_id = ${taskId} ORDER BY e.created_at DESC, e.event_id DESC`),
    many(sql`
      SELECT l.log_id AS id, l.user_id AS userId, ${fullName("p")} AS name, ${ymd("l.work_date")} AS workDate, l.hours, l.note, ${iso("l.created_at")} AS createdAt
      FROM SideProjectTaskLog l LEFT JOIN UserProfile p ON p.user_id = l.user_id WHERE l.task_id = ${taskId} ORDER BY l.work_date DESC, l.log_id DESC`),
  ]);
  return { ...task, history: history.map((h) => ({ ...h, id: Number(h.id), actorId: h.actorId ? Number(h.actorId) : null })), logs: logs.map((l) => ({ ...l, id: Number(l.id), userId: Number(l.userId), hours: Number(l.hours) })) };
}

/** Record work done on a task (the assignee or a manager). */
export async function addLog(a: ProjectAccess, by: number, taskId: number, body: { workDate?: unknown; hours?: unknown; note?: unknown }) {
  const projectId = pid(a);
  const t = await taskRow(projectId, taskId);
  if (!a.canManage && Number(t.assignee_user_id) !== by) fail(403, "NOT_ALLOWED", "Only the assignee or a team manager can log work on this task");
  const hours = hoursOf(body.hours, "hours", 24);
  if (hours === null) fail(400, "VALIDATION", "Enter the hours", "hours");
  const d = v.date(body.workDate, "workDate") ?? todayYmd();
  if (d > latestToday()) fail(400, "VALIDATION", "That day hasn't come yet", "workDate");
  if (dayOf(todayYmd()) - dayOf(d) > 60) fail(400, "VALIDATION", "Logs go back 60 days at most", "workDate");
  const r = await db.execute(sql`
    INSERT INTO SideProjectTaskLog (task_id, user_id, work_date, hours, note, created_at)
    VALUES (${taskId}, ${by}, ${d}, ${hours}, ${clip(body.note, 500) || null}, UTC_TIMESTAMP())`);
  await touch(projectId, await getCurrentAcademicYearId());
  return insertId(r);
}

export async function deleteLog(a: ProjectAccess, by: number, taskId: number, logId: number) {
  await taskRow(pid(a), taskId);
  const l = await one(sql`SELECT user_id FROM SideProjectTaskLog WHERE log_id = ${logId} AND task_id = ${taskId}`);
  if (!l) fail(404, "NOT_FOUND", "Log not found");
  if (!a.canManage && Number(l.user_id) !== by) fail(403, "NOT_ALLOWED", "Only its author can remove this log");
  await db.execute(sql`DELETE FROM SideProjectTaskLog WHERE log_id = ${logId}`);
}

/** The caller's tasks across every project they are on (open first, then recently done). */
export async function myTasks(userId: number) {
  const list = await tasksOf(sql`
    t.assignee_user_id = ${userId}
    AND (t.status NOT IN ('DONE', 'CANCELLED') OR t.completed_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 14 DAY))
    AND EXISTS (SELECT 1 FROM SideProject sp WHERE sp.project_id = t.project_id AND sp.deleted_at IS NULL AND sp.archived_at IS NULL)`);
  const ids = [...new Set(list.map((t) => t.projectId))];
  const projects = ids.length
    ? await many(sql`SELECT project_id AS id, title, status FROM SideProject WHERE project_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
    : [];
  const items = ids.length
    ? await many(sql`SELECT item_id AS id, title FROM SideProjectPlanItem WHERE project_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
    : [];
  const pmap = new Map(projects.map((p) => [Number(p.id), p]));
  const imap = new Map(items.map((i) => [Number(i.id), String(i.title)]));
  return list.map((t) => ({ ...t, projectTitle: pmap.get(t.projectId)?.title ?? "", planItemTitle: imap.get(t.planItemId) ?? "" }));
}

/** Overdue-task nudges for the sweep: once per task per day, to the assignee. */
/** Tasks due tomorrow: the assignee is reminded once. */
export async function nudgeDueSoonTasks() {
  const today = todayYmd();
  const rows = await many(sql`
    SELECT t.task_id AS id, t.title, t.project_id AS projectId, t.assignee_user_id AS assignee
    FROM SideProjectTask t JOIN SideProject sp ON sp.project_id = t.project_id AND sp.deleted_at IS NULL AND sp.archived_at IS NULL
    WHERE t.status NOT IN ('DONE', 'CANCELLED') AND t.due_date = DATE_ADD(${today}, INTERVAL 1 DAY) AND t.assignee_user_id IS NOT NULL
      AND (t.due_soon_nudged_on IS NULL OR t.due_soon_nudged_on <> ${today})
    LIMIT 500`);
  for (const r of rows) {
    await notifyWork([Number(r.assignee)], "side_project_task_due", `Due tomorrow: ${r.title}`, "Finish it or report where it stands.", Number(r.projectId), null);
    await db.execute(sql`UPDATE SideProjectTask SET due_soon_nudged_on = ${today} WHERE task_id = ${r.id}`);
  }
  return rows.length;
}

export async function nudgeOverdueTasks() {
  const today = todayYmd();
  const rows = await many(sql`
    SELECT t.task_id AS id, t.title, t.project_id AS projectId, t.assignee_user_id AS assignee
    FROM SideProjectTask t JOIN SideProject sp ON sp.project_id = t.project_id AND sp.deleted_at IS NULL AND sp.archived_at IS NULL
    WHERE t.status NOT IN ('DONE', 'CANCELLED') AND t.due_date < ${today} AND t.assignee_user_id IS NOT NULL
      AND (t.overdue_nudged_on IS NULL OR t.overdue_nudged_on < DATE_SUB(${today}, INTERVAL 2 DAY))
    LIMIT 500`);
  for (const r of rows) {
    await notifyWork([Number(r.assignee)], "side_project_task_overdue", `Overdue: ${r.title}`, "This task is past its due date.", Number(r.projectId), null);
    await db.execute(sql`UPDATE SideProjectTask SET overdue_nudged_on = ${today} WHERE task_id = ${r.id}`);
  }
  return rows.length;
}
