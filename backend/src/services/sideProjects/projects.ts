import { sql, SQL } from "drizzle-orm";
import { db } from "../../db";
import { getCurrentAcademicYearId } from "../../utils/academicYear";
import {
  clip, DocType, fail, fullName, inList, insertId, iso, limits, many, one, recordEvent, Status, STATUSES, titleKey, touch, ymd,
} from "./core";
import { healthOf, progressOf, transition } from "./lifecycle";
import { ProjectAccess } from "./access";
import { avatarUrls } from "../avatar/urls";
import * as v from "./validate";
import { addDocument, documentsOf, mediaOf, storeProjectFiles, Upload, writtenConceptFile, docKindsFor } from "./files";
import { daysBetween, defaultPlan, ensureStageLogs, loadLogs, loadPlan, periodView, planFromEnds, recordStageChange, rescalePlan, savePlan } from "./stages";
import { reportsOf } from "./progress";

/**
 * Side projects: create, edit, board, lifecycle and the one detail shape both the student
 * board and the monitor drawer read (plan §6, §8).
 */

export interface BasicsInput {
  title?: unknown;
  problemStatement?: unknown;
  description?: unknown;
  categoryId?: unknown;
  techTags?: unknown;
  githubUrl?: unknown;
  accessUrl?: unknown;
  startDate?: unknown;
  targetDate?: unknown;
  supervisorId?: unknown;
  progressMode?: unknown;
  progressManual?: unknown;
  links?: unknown;
}

async function validCategory(id: unknown): Promise<number | null> {
  if (id === undefined || id === null || id === "") return null;
  const n = Number(id);
  const c = await one(sql`SELECT category_id FROM SideProjectCategory WHERE category_id = ${n} AND is_active = 1`);
  if (!c) fail(400, "VALIDATION", "Choose a category from the list", "categoryId");
  return n;
}

async function validSupervisor(id: unknown): Promise<number | null> {
  if (id === undefined || id === null || id === "") return null;
  const n = Number(id);
  const u = await one(sql`
    SELECT u.user_id FROM User u JOIN UserProfile p ON p.user_id = u.user_id
    WHERE u.user_id = ${n} AND u.status = 'ACTIVE' AND p.user_type <> 'STUDENT' AND p.user_type <> 'PARENT'`);
  if (!u) fail(400, "VALIDATION", "Choose an active staff member as supervisor", "supervisorId");
  return n;
}

function checkDates(start: string | null, target: string | null) {
  if (start && target && target < start) fail(400, "VALIDATION", "The target date is before the start date", "targetDate");
}

async function assertTitleFree(ownerId: number, title: string, exceptId?: number) {
  const r = await one(sql`
    SELECT project_id FROM SideProject
    WHERE owner_user_id = ${ownerId} AND title_key = ${titleKey(title)} AND deleted_at IS NULL
      ${exceptId ? sql`AND project_id <> ${exceptId}` : sql``}`);
  if (r) fail(409, "DUPLICATE_TITLE", "You already have a project with this title", "title");
}

/** Who owns the project: any active user. Students also get their class stamped. */
async function ownerSnapshot(ownerId: number) {
  const s = await one(sql`
    SELECT u.user_id, u.status, p.user_type, p.registration_number, ${fullName("p")} AS name
    FROM User u JOIN UserProfile p ON p.user_id = u.user_id WHERE u.user_id = ${ownerId}`);
  if (!s) fail(400, "VALIDATION", "Choose the project owner", "studentId");
  if (s.status !== "ACTIVE") fail(400, "VALIDATION", "This account is not active", "studentId");
  const yearId = await getCurrentAcademicYearId();
  const isStudent = String(s.user_type).toUpperCase() === "STUDENT";
  const cls = yearId && isStudent
    ? await one(sql`SELECT MIN(class_group_id) AS id FROM StudentClassGroup WHERE user_id = ${ownerId} AND academic_year_id = ${yearId} AND status = 'ACTIVE'`)
    : null;
  return { yearId, classId: cls?.id ? Number(cls.id) : null, reg: s.registration_number ?? null, name: String(s.name || "").slice(0, 201) };
}

export interface CreateInput extends BasicsInput {
  status?: unknown;
  /** [ideaEnd, planningEnd, buildingEnd] or {IDEA, PLANNING, IN_PROGRESS}: stage boundaries */
  stagePlan?: unknown;
  concept?: Upload | null;
  conceptWritten?: unknown;
}

/**
 * Creates a project. The concept note is mandatory (an upload or the written form) unless
 * `conceptPending` (imported rows, staff-created placeholders).
 */
export async function createProject(ownerId: number, by: number, input: CreateInput, opts: { conceptPending?: boolean; allowAnyStatus?: boolean } = {}) {
  const title = v.text(input.title, "title", { min: 3, max: 150, required: true, label: "Title" })!;
  const problem = v.text(input.problemStatement, "problemStatement", { min: 30, max: 3000, required: true, label: "Problem statement" })!;
  const description = v.text(input.description, "description", { max: 5000, label: "Description" });
  const categoryId = await validCategory(input.categoryId);
  const tags = v.tags(input.techTags);
  const github = v.githubUrl(input.githubUrl);
  const access = v.httpsUrl(input.accessUrl, "accessUrl");
  const start = v.date(input.startDate, "startDate");
  const target = v.date(input.targetDate, "targetDate");
  checkDates(start, target);
  if (!opts.conceptPending) {
    if (!start) fail(400, "VALIDATION", "Choose the start date", "startDate");
    if (!target) fail(400, "VALIDATION", "Choose the closing date", "targetDate");
  }
  // The stage plan: the boundaries the person chose, or the default split.
  const plan = start && target ? (input.stagePlan ? planFromEnds(start, target, parseEnds(input.stagePlan)) : defaultPlan(start, target)) : null;
  const supervisor = await validSupervisor(input.supervisorId);
  const links = v.links(input.links);
  const statusRaw = String(input.status ?? "IDEA").toUpperCase();
  if (!(STATUSES as readonly string[]).includes(statusRaw)) fail(400, "VALIDATION", "Unknown status", "status");
  let status = statusRaw as Status;
  if (!opts.allowAnyStatus && !["IDEA", "PLANNING", "IN_PROGRESS"].includes(status)) fail(400, "SKIP_NOT_ALLOWED", "New projects start as an idea, in planning or in building", "status");

  let written: { problem: string; users: string; solution: string; impact: string } | null = null;
  if (!input.concept && input.conceptWritten) {
    const raw = typeof input.conceptWritten === "string" ? v.safeJson(input.conceptWritten) : (input.conceptWritten as any);
    written = {
      problem: v.text(raw?.problem ?? problem, "concept.problem", { min: 30, max: 3000, required: true, label: "Problem" })!,
      users: v.text(raw?.users, "concept.users", { min: 10, max: 1500, required: true, label: "Who it helps" })!,
      solution: v.text(raw?.solution, "concept.solution", { min: 30, max: 3000, required: true, label: "Proposed solution" })!,
      impact: v.text(raw?.impact, "concept.impact", { min: 10, max: 1500, required: true, label: "Expected impact" })!,
    };
  }
  if (!input.concept && !written && !opts.conceptPending) fail(400, "CONCEPT_REQUIRED", "The concept note is required", "concept");

  await assertTitleFree(ownerId, title);
  const snap = await ownerSnapshot(ownerId);

  // Store the concept before the project row exists, so a refused file creates nothing.
  let conceptAsset = null;
  let source: "UPLOAD" | "WRITTEN" = "UPLOAD";
  if (input.concept) {
    [conceptAsset] = await storeProjectFiles(null, by, [input.concept], docKindsFor("CONCEPT"));
  } else if (written) {
    const f = await writtenConceptFile(title, written);
    [conceptAsset] = await storeProjectFiles(null, by, [f]);
    source = "WRITTEN";
  }
  if (!conceptAsset && !opts.conceptPending) fail(400, "CONCEPT_REQUIRED", "The concept note is required", "concept");

  const pos = await one(sql`SELECT COALESCE(MIN(board_position), 1) - 1 AS p FROM SideProject WHERE owner_user_id = ${ownerId} AND status = ${status} AND deleted_at IS NULL`);
  let projectId: number;
  try {
    const r = await db.execute(sql`
      INSERT INTO SideProject (owner_user_id, title, title_key, problem_statement, description, category_id, tech_tags, status,
        board_position, github_url, access_url, supervisor_user_id, academic_year_id, last_active_year_id, class_group_id,
        reg_number_snapshot, student_name_snapshot, concept_pending, start_date, target_date, started_at, completed_at,
        last_activity_at, created_by, created_at, updated_at)
      VALUES (${ownerId}, ${title}, ${titleKey(title)}, ${problem}, ${description}, ${categoryId}, ${JSON.stringify(tags)}, ${status},
        ${Number(pos?.p ?? 0)}, ${github}, ${access}, ${supervisor}, ${snap.yearId}, ${snap.yearId}, ${snap.classId},
        ${snap.reg}, ${snap.name}, ${conceptAsset ? 0 : 1}, ${start}, ${target},
        ${status !== "IDEA" ? sql`UTC_TIMESTAMP()` : null}, ${status === "COMPLETED" ? sql`UTC_TIMESTAMP()` : null},
        UTC_TIMESTAMP(), ${by}, UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
    projectId = insertId(r);
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY" || /Duplicate entry/.test(String(e?.message))) fail(409, "DUPLICATE_TITLE", "You already have a project with this title", "title");
    throw e;
  }
  if (conceptAsset) await addDocument(projectId, "CONCEPT", conceptAsset, by, source);
  if (links.length) await replaceLinks(projectId, links);
  if (plan) await savePlan(projectId, plan);
  await db.execute(sql`INSERT INTO SideProjectStageLog (project_id, stage, entered_at) VALUES (${projectId}, ${status}, UTC_TIMESTAMP())`);
  await db.execute(sql`UPDATE SideProject SET stage_entered_at = UTC_TIMESTAMP() WHERE project_id = ${projectId}`);
  await recordEvent(projectId, by, by === ownerId ? "CREATED" : "CREATED_FOR", null, status, null);
  return projectId;
}

export async function updateBasics(a: ProjectAccess, by: number, input: BasicsInput) {
  const p = a.project;
  const set: SQL[] = [];
  if (input.title !== undefined) {
    const title = v.text(input.title, "title", { min: 3, max: 150, required: true, label: "Title" })!;
    await assertTitleFree(Number(p.owner_user_id), title, Number(p.project_id));
    set.push(sql`title = ${title}`, sql`title_key = ${titleKey(title)}`);
  }
  if (input.problemStatement !== undefined) set.push(sql`problem_statement = ${v.text(input.problemStatement, "problemStatement", { min: 30, max: 3000, required: true, label: "Problem statement" })}`);
  if (input.description !== undefined) set.push(sql`description = ${v.text(input.description, "description", { max: 5000, label: "Description" })}`);
  if (input.categoryId !== undefined) set.push(sql`category_id = ${await validCategory(input.categoryId)}`);
  if (input.techTags !== undefined) set.push(sql`tech_tags = ${JSON.stringify(v.tags(input.techTags))}`);
  if (input.githubUrl !== undefined) set.push(sql`github_url = ${v.githubUrl(input.githubUrl)}`);
  if (input.accessUrl !== undefined) set.push(sql`access_url = ${v.httpsUrl(input.accessUrl, "accessUrl")}`);
  const start = input.startDate !== undefined ? v.date(input.startDate, "startDate") : p.start_date ? ymdOf(p.start_date) : null;
  const target = input.targetDate !== undefined ? v.date(input.targetDate, "targetDate") : p.target_date ? ymdOf(p.target_date) : null;
  checkDates(start, target);
  if (input.startDate !== undefined) set.push(sql`start_date = ${start}`);
  if (input.targetDate !== undefined) set.push(sql`target_date = ${target}`);
  if ((input.startDate !== undefined || input.targetDate !== undefined) && start && target) {
    const old = await loadPlan(Number(p.project_id));
    const startChanged = ymdOrNull(p.start_date) !== start;
    const targetChanged = ymdOrNull(p.target_date) !== target;
    if (!old.length || startChanged || targetChanged) await savePlan(Number(p.project_id), old.length ? rescalePlan(old, start, target) : defaultPlan(start, target));
  }
  if (input.supervisorId !== undefined) {
    const sup = await validSupervisor(input.supervisorId);
    set.push(sql`supervisor_user_id = ${sup}`);
    if ((sup ?? null) !== (p.supervisor_user_id ? Number(p.supervisor_user_id) : null)) {
      await recordEvent(Number(p.project_id), by, "SUPERVISOR", p.supervisor_user_id ? String(p.supervisor_user_id) : null, sup ? String(sup) : null);
    }
  }
  if (input.progressMode !== undefined) {
    const m = String(input.progressMode).toUpperCase();
    if (m !== "AUTO" && m !== "MANUAL") fail(400, "VALIDATION", "Unknown progress mode", "progressMode");
    set.push(sql`progress_mode = ${m}`);
  }
  if (input.progressManual !== undefined) set.push(sql`progress_manual = ${v.intIn(input.progressManual, "progressManual", 0, 100)}`);
  if (input.links !== undefined) await replaceLinks(Number(p.project_id), v.links(input.links));
  if (set.length) {
    await db.execute(sql`UPDATE SideProject SET ${sql.join(set, sql`, `)}, updated_at = UTC_TIMESTAMP() WHERE project_id = ${p.project_id}`);
  }
  await touch(Number(p.project_id), await getCurrentAcademicYearId());
}

const ymdOf = (d: any) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

async function replaceLinks(projectId: number, links: Array<{ kind: string; label: string; url: string }>) {
  await db.execute(sql`DELETE FROM SideProjectLink WHERE project_id = ${projectId}`);
  for (const [i, l] of links.entries()) {
    await db.execute(sql`INSERT INTO SideProjectLink (project_id, kind, label, url, sort) VALUES (${projectId}, ${l.kind}, ${l.label}, ${l.url}, ${i})`);
  }
}

export async function hasConcept(projectId: number) {
  return !!(await one(sql`SELECT 1 AS x FROM SideProjectDocument WHERE project_id = ${projectId} AND doc_type = 'CONCEPT' LIMIT 1`));
}

/** Board / drawer move. Returns the new status, or throws the lifecycle refusal. */
export async function moveProject(a: ProjectAccess, by: number, body: { to?: unknown; outcomeSummary?: unknown; reason?: unknown; position?: unknown }, opts: { correction?: boolean } = {}) {
  const p = a.project;
  const to = String(body.to ?? "").toUpperCase() as Status;
  const r = transition(
    { status: p.status, review_state: p.review_state, archived: !!p.archived_at, hasConcept: await hasConcept(Number(p.project_id)), paused_from: p.paused_from ?? null },
    { to, outcomeSummary: body.outcomeSummary as string, reason: body.reason as string, correction: opts.correction },
  );
  if (!r.ok) return fail(409, r.code, r.message, r.field);
  const yearId = await getCurrentAcademicYearId();
  const position = Number.isInteger(Number(body.position)) ? Number(body.position) : null;
  await db.execute(sql`
    UPDATE SideProject SET
      status = ${r.status},
      paused_from = ${r.paused_from},
      review_state = ${r.review_state},
      started_at = ${r.setStarted ? sql`COALESCE(started_at, UTC_TIMESTAMP())` : sql`started_at`},
      completed_at = ${r.setCompleted ? sql`UTC_TIMESTAMP()` : r.clearCompleted ? null : sql`completed_at`},
      verified_at = ${r.clearCompleted || r.setCompleted ? null : sql`verified_at`},
      verified_by = ${r.clearCompleted || r.setCompleted ? null : sql`verified_by`},
      outcome_summary = ${r.outcomeSummary !== undefined ? r.outcomeSummary : sql`outcome_summary`},
      board_position = ${position ?? sql`board_position`}
    WHERE project_id = ${p.project_id}`);
  await ensureStageLogs([Number(p.project_id)]);
  await recordStageChange(Number(p.project_id), r.status);
  if (!opts.correction) await touch(Number(p.project_id), yearId);
  else await db.execute(sql`UPDATE SideProject SET updated_at = UTC_TIMESTAMP() WHERE project_id = ${p.project_id}`);
  await recordEvent(Number(p.project_id), by, opts.correction ? "CORRECTION" : "STATUS", p.status, r.status, r.note);
  return { from: p.status as Status, to: r.status, reviewState: r.review_state };
}

/** The team (or the lead) moves the stage boundaries or the project's dates. */
export async function updatePlan(a: ProjectAccess, by: number, body: { startDate?: unknown; targetDate?: unknown; stagePlan?: unknown }) {
  const p = a.project;
  const start = v.date(body.startDate ?? ymdOrNull(p.start_date), "startDate");
  const target = v.date(body.targetDate ?? ymdOrNull(p.target_date), "targetDate");
  if (!start) fail(400, "VALIDATION", "Choose the start date", "startDate");
  if (!target) fail(400, "VALIDATION", "Choose the closing date", "targetDate");
  checkDates(start, target);
  const plan = body.stagePlan ? planFromEnds(start as string, target as string, parseEnds(body.stagePlan)) : defaultPlan(start as string, target as string);
  await db.execute(sql`UPDATE SideProject SET start_date = ${start}, target_date = ${target}, updated_at = UTC_TIMESTAMP() WHERE project_id = ${p.project_id}`);
  await savePlan(Number(p.project_id), plan);
  await recordEvent(Number(p.project_id), by, "PLAN", null, `${start}..${target}`, plan.map((r) => `${r.stage}:${r.end}`).join(" "));
  return plan;
}

const ymdOrNull = (d: any): string | null => (d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : null);

/** Stage boundaries from the client: an array [ideaEnd, planningEnd, buildingEnd] or an object by stage. */
function parseEnds(raw: unknown): Array<string | null> {
  const val = typeof raw === "string" ? v.safeJson(raw) : raw;
  if (Array.isArray(val)) return val.map((x) => (x == null ? null : String(x)));
  if (val && typeof val === "object") {
    const o = val as Record<string, unknown>;
    return ["IDEA", "PLANNING", "IN_PROGRESS"].map((k) => (o[k] == null ? null : String(o[k])));
  }
  return fail(400, "VALIDATION", "The stage plan is invalid", "stagePlan");
}

/** Saves one column's order after a drag (ids the viewer may edit only). */
export async function reorderColumn(userId: number, status: Status, ids: number[]) {
  if (!(STATUSES as readonly string[]).includes(status)) fail(400, "VALIDATION", "Unknown status", "status");
  if (!ids.length) return;
  const mine = await many(sql`
    SELECT sp.project_id FROM SideProject sp
    WHERE sp.project_id IN (${inList(ids)}) AND sp.deleted_at IS NULL AND sp.status = ${status}
      AND (sp.owner_user_id = ${userId} OR EXISTS (SELECT 1 FROM SideProjectMember m WHERE m.project_id = sp.project_id AND m.user_id = ${userId} AND m.status = 'ACCEPTED'))`);
  const allowed = new Set(mine.map((m) => Number(m.project_id)));
  for (const [i, id] of ids.entries()) {
    if (allowed.has(Number(id))) await db.execute(sql`UPDATE SideProject SET board_position = ${i} WHERE project_id = ${Number(id)}`);
  }
}

export async function archiveProject(a: ProjectAccess, by: number, archived: boolean) {
  await db.execute(sql`UPDATE SideProject SET archived_at = ${archived ? sql`UTC_TIMESTAMP()` : null}, updated_at = UTC_TIMESTAMP() WHERE project_id = ${a.project.project_id}`);
  await recordEvent(Number(a.project.project_id), by, archived ? "ARCHIVE" : "RESTORE");
}

export async function deleteProject(a: ProjectAccess, by: number) {
  const p = a.project;
  if (!a.manageAny) {
    if (!a.isOwner) fail(403, "NOT_OWNER", "Only the project owner can delete it");
    if (p.status !== "IDEA") fail(409, "DELETE_NOT_ALLOWED", "Only ideas can be deleted. Archive it instead");
    const reviewed = await one(sql`SELECT 1 AS x FROM SideProjectComment WHERE project_id = ${p.project_id} AND deleted_at IS NULL LIMIT 1`);
    if (reviewed) fail(409, "DELETE_NOT_ALLOWED", "This project has feedback. Archive it instead");
  }
  await db.execute(sql`UPDATE SideProject SET deleted_at = UTC_TIMESTAMP(), deleted_marker = project_id WHERE project_id = ${p.project_id}`);
  await db.execute(sql`
    UPDATE FileAsset a SET a.deleted_at = UTC_TIMESTAMP()
    WHERE a.asset_id IN (SELECT asset_id FROM SideProjectDocument WHERE project_id = ${p.project_id}
                         UNION SELECT asset_id FROM SideProjectMedia WHERE project_id = ${p.project_id})`);
  await recordEvent(Number(p.project_id), by, "DELETE");
}

export async function uploadDocument(a: ProjectAccess, by: number, type: DocType, file: Upload | undefined) {
  if (!file) fail(400, "VALIDATION", "Choose a file", "file");
  const [asset] = await storeProjectFiles(Number(a.project.project_id), by, [file as Upload], docKindsFor(type));
  const version = await addDocument(Number(a.project.project_id), type, asset, by);
  await touch(Number(a.project.project_id), await getCurrentAcademicYearId());
  return { version, assetId: asset.asset_id };
}

// ---------------------------------------------------------------------------------------
// Reads

/** Card columns shared by the board and the monitor list (aliases from projectFrom). */
export const cardColumns = sql`
  sp.project_id AS id, sp.title, sp.status, sp.board_position AS boardPosition, sp.review_state AS reviewState,
  sp.progress_mode AS progressMode, sp.progress_manual AS progressManual, sp.tech_tags AS techTags,
  sp.github_url AS githubUrl, sp.access_url AS accessUrl, sp.cover_asset_id AS coverAssetId,
  sp.concept_pending AS conceptPending, sp.owner_user_id AS ownerId, sp.supervisor_user_id AS supervisorId,
  sp.paused_from AS pausedFrom, ${iso("sp.stage_entered_at")} AS stageEnteredAt,
  (SELECT DATE_FORMAT(st.planned_end, '%Y-%m-%d') FROM SideProjectStage st WHERE st.project_id = sp.project_id AND st.stage = IF(sp.status = 'ON_HOLD', sp.paused_from, sp.status)) AS stageEnd,
  (SELECT DATE_FORMAT(st.planned_start, '%Y-%m-%d') FROM SideProjectStage st WHERE st.project_id = sp.project_id AND st.stage = IF(sp.status = 'ON_HOLD', sp.paused_from, sp.status)) AS stageStart,
  ${ymd("sp.target_date")} AS targetDate, ${iso("sp.last_activity_at")} AS lastActivityAt,
  ${iso("sp.created_at")} AS createdAt, ${iso("sp.completed_at")} AS completedAt, ${iso("sp.verified_at")} AS verifiedAt,
  ${iso("sp.archived_at")} AS archivedAt,
  c.category_id AS categoryId, c.name AS categoryName, c.slug AS categorySlug, c.color AS categoryColor, c.icon AS categoryIcon,
  (SELECT COUNT(*) FROM SideProjectMilestone ms WHERE ms.project_id = sp.project_id) AS msTotal,
  (SELECT COUNT(*) FROM SideProjectMilestone ms WHERE ms.project_id = sp.project_id AND ms.done_at IS NOT NULL) AS msDone,
  (SELECT COUNT(*) FROM SideProjectMilestone ms WHERE ms.project_id = sp.project_id AND ms.done_at IS NULL AND ms.due_date < UTC_DATE()) AS msOverdue,
  (SELECT COUNT(*) FROM SideProjectMedia md WHERE md.project_id = sp.project_id AND md.deleted_at IS NULL) AS mediaCount,
  (SELECT GROUP_CONCAT(DISTINCT d.doc_type) FROM SideProjectDocument d WHERE d.project_id = sp.project_id) AS docTypes,
  (SELECT u2.blockers IS NOT NULL AND u2.blockers <> '' FROM SideProjectUpdate u2 WHERE u2.project_id = sp.project_id ORDER BY u2.created_at DESC, u2.update_id DESC LIMIT 1) AS lastBlocked,
  (SELECT COUNT(*) FROM SideProjectComment cm WHERE cm.project_id = sp.project_id AND cm.deleted_at IS NULL) AS commentCount,
  (SELECT COUNT(*) FROM SideProjectMember mb WHERE mb.project_id = sp.project_id AND mb.status = 'ACCEPTED') AS memberCount`;

/** How long the project has been in its current stage, and how long the plan gives it. */
export function stageTiming(r: any, now: Date) {
  const today = now.toISOString().slice(0, 10);
  const entered = r.stageEnteredAt as string | null;
  const daysIn = entered ? Math.max(0, Math.floor((now.getTime() - Date.parse(entered)) / 86_400_000)) : null;
  const end = (r.stageEnd as string | null) ?? null;
  const start = (r.stageStart as string | null) ?? null;
  const daysLeft = end && r.status !== "COMPLETED" ? daysBetween(today, end) : null;
  const planned = start && end ? daysBetween(start, end) + 1 : null;
  return { enteredAt: entered, daysIn, plannedEnd: end, plannedDays: planned, daysLeft, overrunDays: daysLeft !== null && daysLeft < 0 ? -daysLeft : 0 };
}

export function shapeCard(r: any, now = new Date()) {
  const tags = (() => {
    try {
      const t = JSON.parse(r.techTags || "[]");
      return Array.isArray(t) ? t : [];
    } catch {
      return [];
    }
  })();
  const docs = String(r.docTypes || "").split(",").filter(Boolean);
  const ms = { total: Number(r.msTotal || 0), done: Number(r.msDone || 0) };
  return {
    id: Number(r.id),
    title: r.title,
    status: r.status as Status,
    boardPosition: Number(r.boardPosition || 0),
    reviewState: r.reviewState,
    progress: progressOf({ status: r.status, paused_from: r.pausedFrom, progress_mode: r.progressMode, progress_manual: r.progressManual == null ? null : Number(r.progressManual) }, ms),
    health: healthOf({ status: r.status, last_activity_at: r.lastActivityAt, target_date: r.targetDate, stage_end: r.status === "ON_HOLD" ? null : r.stageEnd }, { overdueMilestones: Number(r.msOverdue || 0), lastUpdateBlocked: Number(r.lastBlocked || 0) === 1 }, now, limits().staleDays),
    pausedFrom: (r.pausedFrom as Status) || null,
    stage: stageTiming(r, now),
    milestones: ms,
    techTags: tags,
    githubUrl: r.githubUrl || null,
    accessUrl: r.accessUrl || null,
    coverAssetId: r.coverAssetId ? Number(r.coverAssetId) : null,
    conceptPending: Number(r.conceptPending) === 1,
    docs: { CONCEPT: docs.includes("CONCEPT"), SRS: docs.includes("SRS"), IMPLEMENTATION_PLAN: docs.includes("IMPLEMENTATION_PLAN") },
    mediaCount: Number(r.mediaCount || 0),
    commentCount: Number(r.commentCount || 0),
    memberCount: Number(r.memberCount || 0),
    category: r.categoryId ? { id: Number(r.categoryId), name: r.categoryName, slug: r.categorySlug, color: r.categoryColor, icon: r.categoryIcon } : null,
    targetDate: r.targetDate || null,
    lastActivityAt: r.lastActivityAt,
    createdAt: r.createdAt,
    completedAt: r.completedAt || null,
    verifiedAt: r.verifiedAt || null,
    archivedAt: r.archivedAt || null,
  };
}

/** The student's board: own projects, co-owned ones, and pending invitations. */
export async function myProjects(userId: number, opts: { archived?: boolean } = {}) {
  const r = await many(sql`
    SELECT ${cardColumns},
           CASE WHEN sp.owner_user_id = ${userId} THEN 'OWNER' ELSE mb.status END AS myRole,
           ${fullName("op")} AS ownerName
    FROM SideProject sp
    LEFT JOIN SideProjectCategory c ON c.category_id = sp.category_id
    LEFT JOIN SideProjectMember mb ON mb.project_id = sp.project_id AND mb.user_id = ${userId}
    LEFT JOIN UserProfile op ON op.user_id = sp.owner_user_id
    WHERE sp.deleted_at IS NULL
      AND (sp.owner_user_id = ${userId} OR mb.user_id IS NOT NULL)
      AND ${opts.archived ? sql`sp.archived_at IS NOT NULL` : sql`sp.archived_at IS NULL`}
    ORDER BY sp.status, sp.board_position, sp.project_id DESC`);
  const now = new Date();
  return r.map((x) => ({ ...shapeCard(x, now), myRole: x.myRole === "OWNER" ? "OWNER" : x.myRole === "ACCEPTED" ? "MEMBER" : "INVITED", ownerName: x.ownerName }));
}

export async function projectDetail(a: ProjectAccess) {
  const id = Number(a.project.project_id);
  await ensureStageLogs([id]);
  const row = await one(sql`
    SELECT ${cardColumns}, sp.problem_statement AS problemStatement, sp.description, sp.outcome_summary AS outcomeSummary,
           ${ymd("sp.start_date")} AS startDate, ${iso("sp.started_at")} AS startedAt,
           sp.reg_number_snapshot AS regSnapshot, sp.student_name_snapshot AS nameSnapshot,
           op.registration_number AS regNumber, op.user_type AS ownerType, ${fullName("op")} AS ownerName, ou.avatar_version AS ownerAvatar,
           ${fullName("sv")} AS supervisorName,
           ay.name AS yearName, sp.academic_year_id AS yearId,
           cg.name AS className, cg.class_group_id AS classId, g.name AS gradeName, pr.name AS programName,
           ${fullName("vb")} AS verifiedByName
    FROM SideProject sp
    LEFT JOIN SideProjectCategory c ON c.category_id = sp.category_id
    LEFT JOIN UserProfile op ON op.user_id = sp.owner_user_id
    LEFT JOIN User ou ON ou.user_id = sp.owner_user_id
    LEFT JOIN UserProfile sv ON sv.user_id = sp.supervisor_user_id
    LEFT JOIN UserProfile vb ON vb.user_id = sp.verified_by
    LEFT JOIN AcademicYear ay ON ay.academic_year_id = sp.academic_year_id
    LEFT JOIN ClassGroup cg ON cg.class_group_id = ${Number(a.project.live_class_id ?? a.project.class_group_id ?? 0)}
    LEFT JOIN Grade g ON g.grade_id = cg.grade_id
    LEFT JOIN Program pr ON pr.program_id = g.program_id
    WHERE sp.project_id = ${id}`);
  const [documents, media, links, milestones, updates, comments, events, members] = await Promise.all([
    documentsOf(id),
    mediaOf(id),
    many(sql`SELECT link_id AS id, kind, label, url FROM SideProjectLink WHERE project_id = ${id} ORDER BY sort, link_id`),
    many(sql`SELECT milestone_id AS id, title, ${ymd("due_date")} AS dueDate, ${iso("done_at")} AS doneAt, sort FROM SideProjectMilestone WHERE project_id = ${id} ORDER BY sort, milestone_id`),
    reportsOf(id),
    many(sql`
      SELECT c.comment_id AS id, c.kind, c.body, ${iso("c.created_at")} AS createdAt, c.author_id AS authorId, ${fullName("p")} AS author,
             p.user_type AS authorType
      FROM SideProjectComment c LEFT JOIN UserProfile p ON p.user_id = c.author_id
      WHERE c.project_id = ${id} AND c.deleted_at IS NULL ORDER BY c.created_at, c.comment_id`),
    many(sql`
      SELECT e.event_id AS id, e.type, e.from_value AS fromValue, e.to_value AS toValue, e.note, ${iso("e.created_at")} AS createdAt,
             e.actor_id AS actorId, ${fullName("p")} AS actor
      FROM SideProjectEvent e LEFT JOIN UserProfile p ON p.user_id = e.actor_id
      WHERE e.project_id = ${id} ORDER BY e.created_at DESC, e.event_id DESC LIMIT 150`),
    many(sql`
      SELECT m.user_id AS id, m.status, ${fullName("p")} AS name, p.registration_number AS regNumber, p.user_type AS type
      FROM SideProjectMember m JOIN UserProfile p ON p.user_id = m.user_id WHERE m.project_id = ${id} ORDER BY m.added_at`),
  ]);
  const card = shapeCard(row);
  const [plan, logs] = await Promise.all([loadPlan(id), loadLogs(id)]);
  const period = periodView(
    { status: row.status, paused_from: row.pausedFrom ?? null, start_date: row.startDate || null, target_date: row.targetDate || null, created_at: row.createdAt },
    plan,
    logs,
    new Date(),
  );
  return {
    ...card,
    problemStatement: row.problemStatement,
    description: row.description,
    outcomeSummary: row.outcomeSummary,
    startDate: row.startDate || null,
    startedAt: row.startedAt || null,
    owner: {
      id: Number(row.ownerId),
      name: row.ownerName || row.nameSnapshot,
      regNumber: row.regNumber || row.regSnapshot,
      type: String(row.ownerType || "STUDENT").toUpperCase(),
      avatar: avatarUrls(Number(row.ownerId), row.ownerAvatar == null ? null : Number(row.ownerAvatar))?.sm ?? null,
    },
    supervisor: row.supervisorId ? { id: Number(row.supervisorId), name: row.supervisorName } : null,
    verifiedBy: row.verifiedByName || null,
    academicYear: row.yearId ? { id: Number(row.yearId), name: row.yearName } : null,
    class: row.classId ? { id: Number(row.classId), name: row.className, grade: row.gradeName, program: row.programName } : null,
    documents,
    media,
    links,
    milestones: milestones.map((m) => ({ ...m, done: !!m.doneAt })),
    updates,
    comments,
    events,
    members,
    period,
    /** every actual stay in a stage, oldest first (the Gantt draws these) */
    stays: logs.map((l) => ({ stage: l.stage, enteredAt: l.entered_at, leftAt: l.left_at })),
    rights: { edit: a.canEdit, owner: a.isOwner, review: a.canReview, manageAny: a.manageAny, supervisor: a.isSupervisor },
  };
}

export async function categories() {
  return many(sql`SELECT category_id AS id, slug, name, icon, color FROM SideProjectCategory WHERE is_active = 1 ORDER BY sort, name`);
}

export async function tagSuggestions(q: string) {
  const r = await many(sql`SELECT tech_tags FROM SideProject WHERE deleted_at IS NULL AND tech_tags IS NOT NULL AND tech_tags <> '[]' ORDER BY updated_at DESC LIMIT 400`);
  const counts = new Map<string, { tag: string; n: number }>();
  for (const x of r) {
    try {
      for (const t of JSON.parse(x.tech_tags) as string[]) {
        const k = String(t).toLowerCase();
        const c = counts.get(k) ?? { tag: String(t), n: 0 };
        c.n += 1;
        counts.set(k, c);
      }
    } catch {
      /* ignore */
    }
  }
  const needle = q.trim().toLowerCase();
  return [...counts.values()].filter((c) => !needle || c.tag.toLowerCase().includes(needle)).sort((a, b) => b.n - a.n).slice(0, 20).map((c) => c.tag);
}

export async function supervisorCandidates(q: string) {
  const needle = `%${clip(q, 60)}%`;
  return many(sql`
    SELECT u.user_id AS id, ${fullName("p")} AS name, p.user_type AS type
    FROM User u JOIN UserProfile p ON p.user_id = u.user_id
    WHERE u.status = 'ACTIVE' AND p.user_type IN ('TEACHER', 'STAFF', 'ADMIN')
      AND (${needle} = '%%' OR CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,'')) LIKE ${needle})
    ORDER BY p.first_name, p.last_name LIMIT 20`);
}
