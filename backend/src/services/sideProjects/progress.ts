import { sql } from "drizzle-orm";
import { db } from "../../db";
import { getCurrentAcademicYearId } from "../../utils/academicYear";
import { fail, fullName, inList, insertId, iso, limits, many, one, recordEvent, touch } from "./core";
import { storeProjectFiles, type Upload } from "./files";
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

/* Progress reports (migration 131): what was done on which day, for how long, in which stage,
 * with optional PDF attachments. Authors edit their own; the lead (MANAGE_ANY) can too. */

export const MAX_REPORT_FILES = 3;
export interface ReportInput {
  did?: unknown;
  nextSteps?: unknown;
  blockers?: unknown;
  mood?: unknown;
  workDate?: unknown;
  hours?: unknown;
  removeFiles?: unknown;
}

function workDateOf(raw: unknown): string {
  const today = new Date().toISOString().slice(0, 10);
  const d = v.date(raw, "workDate") ?? today;
  if (d > today) fail(400, "VALIDATION", "The work date can't be in the future", "workDate");
  const oldest = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  if (d < oldest) fail(400, "VALIDATION", "Report work from the last 60 days", "workDate");
  return d;
}

function hoursOf(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 24 || Math.round(n * 2) !== n * 2) fail(400, "VALIDATION", "Hours: 0.5 to 24, in half hours", "hours");
  return n;
}

async function attachPdfs(a: ProjectAccess, by: number, updateId: number, files: Upload[]) {
  if (!files.length) return;
  const have = await one(sql`SELECT COUNT(*) AS n FROM SideProjectUpdateFile WHERE update_id = ${updateId}`);
  if (Number(have?.n ?? 0) + files.length > MAX_REPORT_FILES) fail(400, "VALIDATION", `A report holds at most ${MAX_REPORT_FILES} PDF files`, "files");
  const assets = await storeProjectFiles(pid(a), by, files, ["pdf"]);
  for (const asset of assets) {
    await db.execute(sql`INSERT IGNORE INTO SideProjectUpdateFile (update_id, asset_id, created_at) VALUES (${updateId}, ${asset.asset_id}, UTC_TIMESTAMP())`);
  }
}

export async function addUpdate(a: ProjectAccess, by: number, body: ReportInput, files: Upload[] = []) {
  const did = v.text(body.did, "did", { min: 5, max: 2000, required: true, label: "What you did" })!;
  const next = v.text(body.nextSteps, "nextSteps", { max: 1000, label: "Next steps" });
  const blockers = v.text(body.blockers, "blockers", { max: 1000, label: "Blockers" });
  const mood = v.intIn(body.mood, "mood", 1, 5);
  const workDate = workDateOf(body.workDate);
  const hours = hoursOf(body.hours);
  if (files.length > MAX_REPORT_FILES) fail(400, "VALIDATION", `A report holds at most ${MAX_REPORT_FILES} PDF files`, "files");
  const r = await db.execute(sql`
    INSERT INTO SideProjectUpdate (project_id, author_id, did, next_steps, blockers, mood, work_date, hours, stage, created_at)
    VALUES (${pid(a)}, ${by}, ${did}, ${next}, ${blockers}, ${mood}, ${workDate}, ${hours}, ${a.project.status}, UTC_TIMESTAMP())`);
  const id = insertId(r);
  try {
    await attachPdfs(a, by, id, files);
  } catch (e) {
    await db.execute(sql`DELETE FROM SideProjectUpdate WHERE update_id = ${id}`);
    throw e;
  }
  await touch(pid(a), await getCurrentAcademicYearId());
  return id;
}

export async function updateUpdate(a: ProjectAccess, by: number, updateId: number, body: ReportInput, files: Upload[] = []) {
  const u = await one(sql`SELECT author_id FROM SideProjectUpdate WHERE update_id = ${updateId} AND project_id = ${pid(a)}`);
  if (!u) fail(404, "NOT_FOUND", "Report not found");
  if (Number(u.author_id) !== by && !a.manageAny) fail(403, "NOT_OWNER", "Only its author can edit a report");
  const did = v.text(body.did, "did", { min: 5, max: 2000, required: true, label: "What you did" })!;
  const next = v.text(body.nextSteps, "nextSteps", { max: 1000, label: "Next steps" });
  const blockers = v.text(body.blockers, "blockers", { max: 1000, label: "Blockers" });
  const mood = v.intIn(body.mood, "mood", 1, 5);
  const workDate = workDateOf(body.workDate);
  const hours = hoursOf(body.hours);
  const remove = (Array.isArray(body.removeFiles) ? body.removeFiles : typeof body.removeFiles === "string" && body.removeFiles ? v.safeJson(body.removeFiles) : [])
    .map(Number)
    .filter((n: number) => Number.isInteger(n) && n > 0);
  for (const assetId of remove) {
    const link = await one(sql`SELECT 1 AS x FROM SideProjectUpdateFile WHERE update_id = ${updateId} AND asset_id = ${assetId}`);
    if (!link) continue;
    await db.execute(sql`DELETE FROM SideProjectUpdateFile WHERE update_id = ${updateId} AND asset_id = ${assetId}`);
    await db.execute(sql`UPDATE FileAsset SET deleted_at = UTC_TIMESTAMP() WHERE asset_id = ${assetId}`);
  }
  await attachPdfs(a, by, updateId, files);
  await db.execute(sql`
    UPDATE SideProjectUpdate SET did = ${did}, next_steps = ${next}, blockers = ${blockers}, mood = ${mood},
      work_date = ${workDate}, hours = ${hours}, edited_at = UTC_TIMESTAMP()
    WHERE update_id = ${updateId}`);
  await touch(pid(a), await getCurrentAcademicYearId());
}

export async function deleteUpdate(a: ProjectAccess, by: number, updateId: number) {
  const u = await one(sql`SELECT author_id FROM SideProjectUpdate WHERE update_id = ${updateId} AND project_id = ${pid(a)}`);
  if (!u) fail(404, "NOT_FOUND", "Report not found");
  if (Number(u.author_id) !== by && !a.manageAny) fail(403, "NOT_OWNER", "Only its author can remove a report");
  await db.execute(sql`
    UPDATE FileAsset SET deleted_at = UTC_TIMESTAMP()
    WHERE asset_id IN (SELECT asset_id FROM SideProjectUpdateFile WHERE update_id = ${updateId})`);
  await db.execute(sql`DELETE FROM SideProjectUpdateFile WHERE update_id = ${updateId}`);
  await db.execute(sql`DELETE FROM SideProjectUpdate WHERE update_id = ${updateId}`);
}

/** Reports of a project, newest work first, with their PDFs. */
export async function reportsOf(projectId: number) {
  const rows = await many(sql`
    SELECT u.update_id AS id, u.did, u.next_steps AS nextSteps, u.blockers, u.mood, u.hours, u.stage,
           DATE_FORMAT(COALESCE(u.work_date, u.created_at), '%Y-%m-%d') AS workDate,
           ${iso("u.created_at")} AS createdAt, ${iso("u.edited_at")} AS editedAt,
           u.author_id AS authorId, ${fullName("p")} AS author
    FROM SideProjectUpdate u LEFT JOIN UserProfile p ON p.user_id = u.author_id
    WHERE u.project_id = ${projectId}
    ORDER BY COALESCE(u.work_date, DATE(u.created_at)) DESC, u.created_at DESC, u.update_id DESC
    LIMIT 200`);
  const ids = rows.map((r) => Number(r.id));
  const files = ids.length
    ? await many(sql`
        SELECT f.update_id AS updateId, a.asset_id AS assetId, a.original_name AS name, a.size_bytes AS size
        FROM SideProjectUpdateFile f JOIN FileAsset a ON a.asset_id = f.asset_id AND a.deleted_at IS NULL
        WHERE f.update_id IN (${inList(ids)}) ORDER BY f.created_at`)
    : [];
  return rows.map((r) => ({
    ...r,
    hours: r.hours == null ? null : Number(r.hours),
    files: files.filter((f) => Number(f.updateId) === Number(r.id)).map((f) => ({ assetId: Number(f.assetId), name: f.name, size: Number(f.size) })),
  }));
}

/**
 * Daily activity for the contribution graph: reports (and their hours) plus other work events
 * (stage moves, documents, files, milestones), per day over the last `days` days.
 */
export async function activityOf(projectId: number, days = 182) {
  const span = Math.max(28, Math.min(371, Math.floor(days)));
  const since = new Date(Date.now() - (span - 1) * 86_400_000).toISOString().slice(0, 10);
  const reports = await many(sql`
    SELECT DATE_FORMAT(COALESCE(work_date, created_at), '%Y-%m-%d') AS d, COUNT(*) AS n, COALESCE(SUM(hours), 0) AS h
    FROM SideProjectUpdate WHERE project_id = ${projectId} AND COALESCE(work_date, DATE(created_at)) >= ${since}
    GROUP BY DATE_FORMAT(COALESCE(work_date, created_at), '%Y-%m-%d')`);
  const events = await many(sql`
    SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS n
    FROM SideProjectEvent
    WHERE project_id = ${projectId} AND created_at >= ${since} AND type IN ('STATUS', 'DOC', 'MEDIA', 'MILESTONE', 'CREATED', 'CREATED_FOR', 'PLAN')
    GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')`);
  const map = new Map<string, { date: string; reports: number; events: number; hours: number }>();
  for (const r of reports) map.set(r.d, { date: r.d, reports: Number(r.n), events: 0, hours: Number(r.h) });
  for (const e of events) {
    const x = map.get(e.d) ?? { date: e.d, reports: 0, events: 0, hours: 0 };
    x.events = Number(e.n);
    map.set(e.d, x);
  }
  const daysOut = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  // Streaks over days with a report.
  const reported = new Set(daysOut.filter((d) => d.reports > 0).map((d) => d.date));
  let current = 0;
  for (let t = Date.now(); ; t -= 86_400_000) {
    const k = new Date(t).toISOString().slice(0, 10);
    if (reported.has(k)) current += 1;
    else if (current > 0 || k !== new Date().toISOString().slice(0, 10)) break;
    if (k < since) break;
  }
  let longest = 0;
  let run = 0;
  for (let i = 0; i < span; i++) {
    const k = new Date(Date.parse(`${since}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    run = reported.has(k) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return {
    since,
    days: span,
    activity: daysOut,
    stats: {
      activeDays: daysOut.filter((d) => d.reports + d.events > 0).length,
      reports: daysOut.reduce((s, d) => s + d.reports, 0),
      hours: Math.round(daysOut.reduce((s, d) => s + d.hours, 0) * 10) / 10,
      currentStreak: current,
      longestStreak: longest,
    },
  };
}
