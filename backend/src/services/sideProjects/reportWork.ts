import { sql } from "drizzle-orm";
import { db } from "../../db";
import { fail, inList, many, one, PLAN_STATUSES, TASK_STATUSES } from "./core";
import type { ProjectAccess } from "./access";
import * as work from "./work";
import * as v from "./validate";

/**
 * Progress reports are written against the implementation plan (migration 138).
 *
 * A report names the plan items and tasks it covers ("work lines"). When the project has a plan,
 * at least one line is required. You report on your own work: tasks assigned to you (an
 * unassigned task you report on becomes yours, as on the board), or a feature you are
 * accountable for or that has no tasks yet. The owner and team managers may report on anything. Each line may carry the hours spent on it and a new state:
 *  - task hours become task logs (linked to the report), so task and teammate hours include
 *    reported work; they are rewritten when the report is edited and removed with it;
 *  - a task can be moved with the same rights as on the board (assignee, or a team manager);
 *  - a feature's state is set from a report only by a team manager (otherwise it follows its
 *    tasks).
 * The report's total hours are the sum of the line hours when any are given.
 */

export const MAX_WORK_LINES = 12;

export type WorkLine = { itemId: number; taskId: number | null; hours: number | null; status: string | null };

const pidOf = (a: ProjectAccess) => Number(a.project.project_id);

function lineHours(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 24 || Math.round(n * 2) !== n * 2) fail(400, "VALIDATION", "Hours per item: 0.5 to 24, in half hours", "work");
  return n;
}

export async function planSize(projectId: number): Promise<number> {
  const r = await one(sql`SELECT COUNT(*) AS n FROM SideProjectPlanItem WHERE project_id = ${projectId} AND kind = 'FEATURE' AND status <> 'CANCELLED'`);
  return Number(r?.n ?? 0);
}

/** Parses and validates the lines a report covers. `raw` is an array or its JSON (multipart). */
export async function parseWork(a: ProjectAccess, by: number, raw: unknown): Promise<WorkLine[]> {
  const projectId = pidOf(a);
  const list = Array.isArray(raw) ? raw : typeof raw === "string" && raw.trim() ? v.safeJson(raw) : [];
  if (!Array.isArray(list)) fail(400, "VALIDATION", "Pick what you worked on from the plan", "work");
  if (list.length > MAX_WORK_LINES) fail(400, "VALIDATION", `A report covers at most ${MAX_WORK_LINES} plan items`, "work");
  const out: WorkLine[] = [];
  const seen = new Set<string>();
  for (const x of list as any[]) {
    const taskId = x?.taskId ? Number(x.taskId) : null;
    let itemId = x?.itemId ? Number(x.itemId) : null;
    if (taskId !== null) {
      const t = await one(sql`SELECT plan_item_id, status, assignee_user_id, title FROM SideProjectTask WHERE task_id = ${taskId} AND project_id = ${projectId}`);
      if (!t) fail(400, "VALIDATION", "That task isn't in this project's plan", "work");
      const assignee = t.assignee_user_id ? Number(t.assignee_user_id) : null;
      if (!a.canManage && assignee !== null && assignee !== by) fail(403, "NOT_YOUR_TASK", `"${t.title}" is assigned to someone else: report on your own tasks`, "work");
      itemId = Number(t.plan_item_id);
    }
    if (!itemId || !Number.isInteger(itemId)) fail(400, "VALIDATION", "Pick what you worked on from the plan", "work");
    const it = await one(sql`SELECT kind, owner_user_id, title FROM SideProjectPlanItem WHERE item_id = ${itemId} AND project_id = ${projectId}`);
    if (!it) fail(400, "VALIDATION", "That item isn't in this project's plan", "work");
    if (taskId === null && !a.canManage && Number(it.owner_user_id) !== by) {
      const tasks = await one(sql`SELECT COUNT(*) AS n FROM SideProjectTask WHERE plan_item_id = ${itemId} AND status <> 'CANCELLED'`);
      if (Number(tasks?.n ?? 0) > 0) fail(403, "NOT_YOUR_TASK", `Report on your tasks in "${it.title}"`, "work");
    }
    const key = taskId ? `t${taskId}` : `i${itemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let status: string | null = x?.status ? String(x.status).toUpperCase() : null;
    if (status) {
      const allowed = taskId ? (TASK_STATUSES as readonly string[]) : (PLAN_STATUSES as readonly string[]);
      if (!allowed.includes(status)) fail(400, "VALIDATION", "Unknown state", "work");
      if (!taskId && !a.canManage) status = null; // features follow their tasks unless a manager sets them
    }
    out.push({ itemId: itemId as number, taskId, hours: lineHours(x?.hours), status });
  }
  return out;
}

/** Sum of the line hours, or null when no line has hours. */
export function linesTotal(lines: WorkLine[]): number | null {
  const withHours = lines.filter((l) => l.hours !== null);
  if (!withHours.length) return null;
  const sum = withHours.reduce((s, l) => s + (l.hours ?? 0), 0);
  if (sum > 24) fail(400, "VALIDATION", "A day's report holds at most 24 hours", "work");
  return Math.round(sum * 2) / 2;
}

/** Writes the lines of a report (replacing earlier ones), its task logs, and applies state moves. */
export async function saveWork(a: ProjectAccess, by: number, updateId: number, workDate: string, lines: WorkLine[], blockers: string | null) {
  const projectId = pidOf(a);
  await db.execute(sql`DELETE FROM SideProjectUpdateWork WHERE update_id = ${updateId}`);
  await db.execute(sql`DELETE FROM SideProjectTaskLog WHERE update_id = ${updateId}`);
  for (const l of lines) {
    if (l.taskId) {
      // Reporting on an unassigned task takes it, as moving it on the board does.
      await db.execute(sql`UPDATE SideProjectTask SET assignee_user_id = ${by}, updated_at = UTC_TIMESTAMP() WHERE task_id = ${l.taskId} AND assignee_user_id IS NULL`);
    }
    await db.execute(sql`
      INSERT INTO SideProjectUpdateWork (update_id, project_id, plan_item_id, task_id, hours, status_to, created_at)
      VALUES (${updateId}, ${projectId}, ${l.itemId}, ${l.taskId}, ${l.hours}, ${l.status}, UTC_TIMESTAMP())`);
    if (l.taskId && l.hours) {
      await db.execute(sql`
        INSERT INTO SideProjectTaskLog (task_id, user_id, work_date, hours, note, update_id, created_at)
        VALUES (${l.taskId}, ${by}, ${workDate}, ${l.hours}, 'From a progress report', ${updateId}, UTC_TIMESTAMP())`);
    }
  }
  // State moves: only real changes; the same rules as the board and the plan.
  for (const l of lines) {
    if (!l.status) continue;
    if (l.taskId) {
      const t = await one(sql`SELECT status FROM SideProjectTask WHERE task_id = ${l.taskId}`);
      if (!t || t.status === l.status) continue;
      await work.moveTask(a, by, l.taskId, { to: l.status, note: l.status === "BLOCKED" ? blockers : null });
    } else {
      const it = await one(sql`SELECT status FROM SideProjectPlanItem WHERE item_id = ${l.itemId}`);
      if (!it || it.status === l.status) continue;
      await work.updateItem(a, by, l.itemId, { status: l.status });
    }
  }
}

/** Checks the moves before anything is written, so a refused move doesn't leave half a report. */
export async function checkMoves(a: ProjectAccess, by: number, lines: WorkLine[], blockers: string | null) {
  for (const l of lines) {
    if (!l.status || !l.taskId) continue;
    const t = await one(sql`SELECT status, assignee_user_id FROM SideProjectTask WHERE task_id = ${l.taskId}`);
    if (!t || t.status === l.status) continue;
    const assignee = t.assignee_user_id ? Number(t.assignee_user_id) : null;
    const takeIt = assignee === null && a.canEdit;
    if (!a.canManage && assignee !== by && !takeIt) fail(403, "NOT_ALLOWED", "Only the assignee or a team manager can move that task", "work");
    if (l.status === "BLOCKED" && (!blockers || blockers.trim().length < 3)) fail(400, "VALIDATION", "Say what is blocking it under Blockers", "blockers");
  }
}

export async function dropWork(updateId: number) {
  await db.execute(sql`DELETE FROM SideProjectTaskLog WHERE update_id = ${updateId}`);
  await db.execute(sql`DELETE FROM SideProjectUpdateWork WHERE update_id = ${updateId}`);
}

/** The lines of the given reports, with titles for display. */
export async function workOf(updateIds: number[]) {
  if (!updateIds.length) return [];
  const rows = await many(sql`
    SELECT w.update_id AS updateId, w.plan_item_id AS itemId, i.title AS itemTitle, i.kind AS itemKind, ph.title AS phaseTitle,
           w.task_id AS taskId, t.title AS taskTitle, w.hours, w.status_to AS status
    FROM SideProjectUpdateWork w
    JOIN SideProjectPlanItem i ON i.item_id = w.plan_item_id
    LEFT JOIN SideProjectPlanItem ph ON ph.item_id = i.parent_id
    LEFT JOIN SideProjectTask t ON t.task_id = w.task_id
    WHERE w.update_id IN (${inList(updateIds)})
    ORDER BY w.work_id`);
  return rows.map((r) => ({
    updateId: Number(r.updateId),
    itemId: Number(r.itemId),
    itemTitle: r.itemTitle,
    itemKind: r.itemKind,
    phaseTitle: r.phaseTitle ?? null,
    taskId: r.taskId ? Number(r.taskId) : null,
    taskTitle: r.taskTitle ?? null,
    hours: r.hours == null ? null : Number(r.hours),
    status: r.status ?? null,
  }));
}

export { reportingByItem } from "./work";

