import { sql } from "drizzle-orm";
import { db } from "../../db";
import { getCurrentAcademicYearId } from "../../utils/academicYear";
import { fail, insertId, limits, one, recordEvent, touch } from "./core";
import { ProjectAccess } from "./access";
import * as v from "./validate";

/** Milestones and progress updates (plan §3.7). */

const pid = (a: ProjectAccess) => Number(a.project.project_id);

export async function addMilestone(a: ProjectAccess, by: number, body: { title?: unknown; dueDate?: unknown }) {
  const title = v.text(body.title, "title", { min: 2, max: 150, required: true, label: "Milestone" })!;
  const due = v.date(body.dueDate, "dueDate");
  const c = await one(sql`SELECT COUNT(*) AS n, COALESCE(MAX(sort), 0) AS s FROM SideProjectMilestone WHERE project_id = ${pid(a)}`);
  if (Number(c?.n ?? 0) >= limits().maxMilestones) fail(400, "VALIDATION", `At most ${limits().maxMilestones} milestones`, "title");
  const r = await db.execute(sql`
    INSERT INTO SideProjectMilestone (project_id, title, due_date, sort, created_at)
    VALUES (${pid(a)}, ${title}, ${due}, ${Number(c?.s ?? 0) + 1}, UTC_TIMESTAMP())`);
  await touch(pid(a), await getCurrentAcademicYearId());
  return insertId(r);
}

export async function updateMilestone(a: ProjectAccess, by: number, mid: number, body: { title?: unknown; dueDate?: unknown; done?: unknown }) {
  const m = await one(sql`SELECT milestone_id, title, done_at FROM SideProjectMilestone WHERE milestone_id = ${mid} AND project_id = ${pid(a)}`);
  if (!m) fail(404, "NOT_FOUND", "Milestone not found");
  if (body.title !== undefined) {
    const t = v.text(body.title, "title", { min: 2, max: 150, required: true, label: "Milestone" });
    await db.execute(sql`UPDATE SideProjectMilestone SET title = ${t} WHERE milestone_id = ${mid}`);
  }
  if (body.dueDate !== undefined) await db.execute(sql`UPDATE SideProjectMilestone SET due_date = ${v.date(body.dueDate, "dueDate")} WHERE milestone_id = ${mid}`);
  if (body.done !== undefined) {
    const done = body.done === true || body.done === "true" || body.done === 1;
    await db.execute(sql`UPDATE SideProjectMilestone SET done_at = ${done ? sql`COALESCE(done_at, UTC_TIMESTAMP())` : null} WHERE milestone_id = ${mid}`);
    if (done && !m.done_at) await recordEvent(pid(a), by, "MILESTONE", null, "DONE", m.title);
  }
  await touch(pid(a), await getCurrentAcademicYearId());
}

export async function deleteMilestone(a: ProjectAccess, mid: number) {
  await db.execute(sql`DELETE FROM SideProjectMilestone WHERE milestone_id = ${mid} AND project_id = ${pid(a)}`);
}

export async function reorderMilestones(a: ProjectAccess, ids: number[]) {
  for (const [i, id] of ids.entries()) {
    await db.execute(sql`UPDATE SideProjectMilestone SET sort = ${i + 1} WHERE milestone_id = ${Number(id)} AND project_id = ${pid(a)}`);
  }
}

export async function addUpdate(a: ProjectAccess, by: number, body: { did?: unknown; nextSteps?: unknown; blockers?: unknown; mood?: unknown }) {
  const did = v.text(body.did, "did", { min: 5, max: 1000, required: true, label: "What you did" })!;
  const next = v.text(body.nextSteps, "nextSteps", { max: 1000, label: "Next steps" });
  const blockers = v.text(body.blockers, "blockers", { max: 1000, label: "Blockers" });
  const mood = v.intIn(body.mood, "mood", 1, 5);
  const r = await db.execute(sql`
    INSERT INTO SideProjectUpdate (project_id, author_id, did, next_steps, blockers, mood, created_at)
    VALUES (${pid(a)}, ${by}, ${did}, ${next}, ${blockers}, ${mood}, UTC_TIMESTAMP())`);
  await touch(pid(a), await getCurrentAcademicYearId());
  return insertId(r);
}

export async function deleteUpdate(a: ProjectAccess, by: number, updateId: number) {
  const u = await one(sql`SELECT author_id FROM SideProjectUpdate WHERE update_id = ${updateId} AND project_id = ${pid(a)}`);
  if (!u) fail(404, "NOT_FOUND", "Update not found");
  if (Number(u.author_id) !== by && !a.manageAny) fail(403, "NOT_OWNER", "Only its author can remove an update");
  await db.execute(sql`DELETE FROM SideProjectUpdate WHERE update_id = ${updateId}`);
}
