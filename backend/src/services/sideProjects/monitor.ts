import { sql, SQL } from "drizzle-orm";
import * as XLSX from "xlsx";
import { ScopeEntry } from "../../vendor/nga-access";
import { getCurrentAcademicYearId } from "../../utils/academicYear";
import { avatarUrls } from "../avatar/urls";
import { fullName, inList, many, one, STAGES, STATUSES, type Status } from "./core";
import { ensureStageLogs } from "./stages";
import { projectFrom, scopeCondition } from "./access";
import { cardColumns, shapeCard } from "./projects";

/**
 * The monitor (plan §7): one filtered population feeds the dashboard, the list, the board
 * and the export, so every number agrees with the rows behind it. A school holds hundreds
 * of projects, not millions: rows are loaded once (capped) and aggregated here.
 * `summary` viewers get aggregates only, with classes of fewer than 5 students folded into
 * "Other" and no names anywhere.
 */

export interface MonitorFilters {
  yearId?: number | null;
  yearMode?: "active" | "started";
  programId?: number | null;
  gradeId?: number | null;
  classId?: number | null;
  status?: string | null;
  review?: string | null;
  categoryId?: number | null;
  health?: string | null;
  hasGithub?: boolean | null;
  hasAccess?: boolean | null;
  missing?: string | null;
  supervisorId?: number | null;
  q?: string | null;
  archived?: boolean;
  supervisedBy?: number | null;
  /** projects this user supervises or is on the team of (not their own) */
  assignedTo?: number | null;
  /** STUDENT = students' projects, STAFF = everyone else's (teachers, staff, parents). */
  ownerType?: "STUDENT" | "STAFF" | null;
}

const num = (v: unknown) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const bool = (v: unknown) => (v === "1" || v === "true" || v === true ? true : v === "0" || v === "false" || v === false ? false : null);

export function parseFilters(q: Record<string, unknown>): MonitorFilters {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    yearId: num(q.yearId),
    yearMode: q.yearMode === "started" ? "started" : "active",
    programId: num(q.programId),
    gradeId: num(q.gradeId),
    classId: num(q.classId),
    status: s(q.status),
    review: s(q.review),
    categoryId: num(q.categoryId),
    health: s(q.health),
    hasGithub: bool(q.hasGithub),
    hasAccess: bool(q.hasAccess),
    missing: s(q.missing),
    supervisorId: num(q.supervisorId),
    q: s(q.q),
    archived: bool(q.archived) === true,
    ownerType: q.ownerType === "STUDENT" || q.ownerType === "STAFF" ? q.ownerType : null,
  };
}

const MAX_ROWS = 5000;

async function loadRows(scope: ScopeEntry | null, f: MonitorFilters) {
  const from = await projectFrom();
  const conds: SQL[] = [
    sql`sp.deleted_at IS NULL`,
    f.assignedTo
      ? sql`(sp.owner_user_id <> ${f.assignedTo} AND (sp.supervisor_user_id = ${f.assignedTo} OR EXISTS (SELECT 1 FROM SideProjectMember am WHERE am.project_id = sp.project_id AND am.user_id = ${f.assignedTo} AND am.status = 'ACCEPTED')))`
      : f.supervisedBy
        ? sql`sp.supervisor_user_id = ${f.supervisedBy}`
        : scopeCondition(scope),
  ];
  conds.push(f.archived ? sql`sp.archived_at IS NOT NULL` : sql`sp.archived_at IS NULL`);
  if (f.yearId) conds.push(f.yearMode === "started" ? sql`sp.academic_year_id = ${f.yearId}` : sql`(sp.last_active_year_id = ${f.yearId} OR sp.academic_year_id = ${f.yearId})`);
  if (f.programId) conds.push(sql`g.program_id = ${f.programId}`);
  if (f.gradeId) conds.push(sql`cg.grade_id = ${f.gradeId}`);
  if (f.classId) conds.push(sql`cg.class_group_id = ${f.classId}`);
  if (f.status && (STATUSES as readonly string[]).includes(f.status)) conds.push(sql`sp.status = ${f.status}`);
  if (f.review) conds.push(sql`sp.review_state = ${f.review}`);
  if (f.categoryId) conds.push(sql`sp.category_id = ${f.categoryId}`);
  if (f.hasGithub === true) conds.push(sql`sp.github_url IS NOT NULL`);
  if (f.hasGithub === false) conds.push(sql`sp.github_url IS NULL`);
  if (f.hasAccess === true) conds.push(sql`sp.access_url IS NOT NULL`);
  if (f.hasAccess === false) conds.push(sql`sp.access_url IS NULL`);
  if (f.missing === "CONCEPT") conds.push(sql`sp.concept_pending = 1`);
  else if (f.missing === "SRS" || f.missing === "IMPLEMENTATION_PLAN") {
    conds.push(sql`NOT EXISTS (SELECT 1 FROM SideProjectDocument d WHERE d.project_id = sp.project_id AND d.doc_type = ${f.missing})`);
  }
  if (f.supervisorId) conds.push(sql`sp.supervisor_user_id = ${f.supervisorId}`);
  if (f.ownerType === "STUDENT") conds.push(sql`up.user_type = 'STUDENT'`);
  if (f.ownerType === "STAFF") conds.push(sql`(up.user_type IS NULL OR up.user_type <> 'STUDENT')`);
  if (f.q) {
    const like = `%${f.q.slice(0, 80)}%`;
    conds.push(sql`(sp.title LIKE ${like} OR up.registration_number LIKE ${like} OR CONCAT(COALESCE(up.first_name,''),' ',COALESCE(up.last_name,'')) LIKE ${like} OR sp.tech_tags LIKE ${like})`);
  }
  const r = await many(sql`
    SELECT ${cardColumns},
           up.registration_number AS regNumber, up.user_type AS ownerType, ${fullName("up")} AS studentName, u.avatar_version AS avatarVersion,
           cg.class_group_id AS classId, cg.name AS className, g.grade_id AS gradeId, g.name AS gradeName,
           pr.program_id AS programId, pr.name AS programName,
           sp.academic_year_id AS yearId, ay.name AS yearName, ${fullName("sv")} AS supervisorName,
           ${f.assignedTo ? sql`IF(sp.supervisor_user_id = ${f.assignedTo}, 'SUPERVISOR', 'MEMBER')` : sql`NULL`} AS relation,
           (SELECT DATE_FORMAT(MAX(COALESCE(ru.work_date, DATE(ru.created_at))), '%Y-%m-%d') FROM SideProjectUpdate ru WHERE ru.project_id = sp.project_id) AS lastReport
    ${from}
    LEFT JOIN SideProjectCategory c ON c.category_id = sp.category_id
    LEFT JOIN AcademicYear ay ON ay.academic_year_id = sp.academic_year_id
    LEFT JOIN UserProfile sv ON sv.user_id = sp.supervisor_user_id
    WHERE ${sql.join(conds, sql` AND `)}
    ORDER BY sp.last_activity_at DESC
    LIMIT ${MAX_ROWS}`);
  const now = new Date();
  let out = r.map((x) => ({
    ...shapeCard(x, now),
    student: {
      id: Number(x.ownerId),
      name: x.studentName,
      regNumber: x.regNumber,
      type: String(x.ownerType || "STUDENT").toUpperCase(),
      avatar: avatarUrls(Number(x.ownerId), x.avatarVersion == null ? null : Number(x.avatarVersion))?.sm ?? null,
    },
    class: x.classId ? { id: Number(x.classId), name: x.className, gradeId: Number(x.gradeId), grade: x.gradeName, programId: Number(x.programId), program: x.programName } : null,
    year: x.yearId ? { id: Number(x.yearId), name: x.yearName } : null,
    supervisor: x.supervisorId ? { id: Number(x.supervisorId), name: x.supervisorName } : null,
    relation: (x.relation as "SUPERVISOR" | "MEMBER" | null) ?? null,
    lastReport: (x.lastReport as string | null) ?? null,
  }));
  if (f.health) out = out.filter((p) => p.health === f.health);
  return out;
}

export type MonitorRow = Awaited<ReturnType<typeof loadRows>>[number];

const SORTS: Record<string, (a: MonitorRow, b: MonitorRow) => number> = {
  activity: (a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt),
  created: (a, b) => b.createdAt.localeCompare(a.createdAt),
  title: (a, b) => a.title.localeCompare(b.title),
  student: (a, b) => String(a.student.name).localeCompare(String(b.student.name)),
  class: (a, b) => String(a.class?.name ?? "~").localeCompare(String(b.class?.name ?? "~")),
  progress: (a, b) => b.progress - a.progress,
  status: (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status),
  stage: (a, b) => b.stage.overrunDays - a.stage.overrunDays || (b.stage.daysIn ?? -1) - (a.stage.daysIn ?? -1),
};

export async function listProjects(scope: ScopeEntry | null, f: MonitorFilters, opts: { sort?: string; dir?: string; page?: number; pageSize?: number }) {
  const all = await loadRows(scope, f);
  const cmp = SORTS[opts.sort ?? "activity"] ?? SORTS.activity;
  all.sort((a, b) => (opts.dir === "asc" ? -cmp(a, b) : cmp(a, b)));
  const pageSize = Math.min(200, Math.max(5, Number(opts.pageSize) || 25));
  const page = Math.max(1, Number(opts.page) || 1);
  return { total: all.length, page, pageSize, rows: all.slice((page - 1) * pageSize, page * pageSize) };
}

/** Rows for the school-wide board (no paging; cards only). */
export async function boardProjects(scope: ScopeEntry | null, f: MonitorFilters) {
  const all = await loadRows(scope, f);
  return all.slice(0, 600);
}

const monthKey = (d: Date) => d.toISOString().slice(0, 7);

async function termWindows() {
  const cur = await one(sql`SELECT academic_term_id AS id, DATE_FORMAT(start_date, '%Y-%m-%d') AS s, DATE_FORMAT(end_date, '%Y-%m-%d') AS e, name FROM AcademicTerm WHERE is_current = 1 LIMIT 1`);
  if (cur?.s) {
    const prev = await one(sql`SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS s, DATE_FORMAT(end_date, '%Y-%m-%d') AS e, name FROM AcademicTerm WHERE end_date < ${cur.s} ORDER BY end_date DESC LIMIT 1`);
    return { current: { from: cur.s, to: cur.e || "9999-12-31", label: cur.name }, previous: prev?.s ? { from: prev.s, to: prev.e, label: prev.name } : null };
  }
  const now = Date.now();
  const d = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { current: { from: d(now - 90 * 86400000), to: "9999-12-31", label: "Last 90 days" }, previous: { from: d(now - 180 * 86400000), to: d(now - 90 * 86400000 - 1), label: "Previous 90 days" } };
}

async function studentsInScope(scope: ScopeEntry | null, f: MonitorFilters): Promise<number> {
  if (f.supervisedBy) return 0;
  const yearId = await getCurrentAcademicYearId();
  const conds: SQL[] = [scopeCondition(scope, "scg.user_id")];
  if (f.programId) conds.push(sql`g.program_id = ${f.programId}`);
  if (f.gradeId) conds.push(sql`cg.grade_id = ${f.gradeId}`);
  if (f.classId) conds.push(sql`cg.class_group_id = ${f.classId}`);
  const r = await one(sql`
    SELECT COUNT(DISTINCT scg.user_id) AS n
    FROM StudentClassGroup scg
    JOIN User u ON u.user_id = scg.user_id AND u.status = 'ACTIVE'
    JOIN ClassGroup cg ON cg.class_group_id = scg.class_group_id
    LEFT JOIN Grade g ON g.grade_id = cg.grade_id
    WHERE scg.status = 'ACTIVE' AND scg.academic_year_id = ${yearId ?? 0} AND ${sql.join(conds, sql` AND `)}`);
  return Number(r?.n ?? 0);
}

export async function summary(scope: ScopeEntry | null, f: MonitorFilters, depth: "summary" | "detail") {
  const rows = await loadRows(scope, f);
  const windows = await termWindows();
  const inWin = (iso: string | null, w: { from: string; to: string } | null) => !!iso && !!w && iso.slice(0, 10) >= w.from && iso.slice(0, 10) <= w.to;
  const byStatus = { IDEA: 0, PLANNING: 0, IN_PROGRESS: 0, TESTING: 0, COMPLETED: 0, ON_HOLD: 0 } as Record<string, number>;
  const health: Record<string, number> = {};
  const review: Record<string, number> = {};
  const owners = new Set<number>();
  const categories = new Map<string, { name: string; color: string; count: number }>();
  const tech = new Map<string, { tag: string; count: number }>();
  const classes = new Map<string, { classId: number | null; name: string; grade: string | null; students: Set<number> } & Record<Status, number>>();
  const studentOwners = new Set<number>();
  let staffProjects = 0;
  let completedNow = 0,
    completedPrev = 0,
    withGithub = 0,
    withAccess = 0,
    conceptPending = 0,
    progressSum = 0;
  for (const p of rows) {
    byStatus[p.status] += 1;
    health[p.health] = (health[p.health] ?? 0) + 1;
    review[p.reviewState] = (review[p.reviewState] ?? 0) + 1;
    owners.add(p.student.id);
    if (p.student.type === "STUDENT") studentOwners.add(p.student.id);
    else staffProjects += 1;
    if (inWin(p.completedAt, windows.current)) completedNow += 1;
    if (inWin(p.completedAt, windows.previous)) completedPrev += 1;
    if (p.githubUrl) withGithub += 1;
    if (p.accessUrl) withAccess += 1;
    if (p.conceptPending) conceptPending += 1;
    progressSum += p.progress;
    const ck = p.category ? p.category.slug : "none";
    const c = categories.get(ck) ?? { name: p.category?.name ?? "Uncategorised", color: p.category?.color ?? "#94a3b8", count: 0 };
    c.count += 1;
    categories.set(ck, c);
    for (const t of p.techTags as string[]) {
      const k = t.toLowerCase();
      const e = tech.get(k) ?? { tag: t, count: 0 };
      e.count += 1;
      tech.set(k, e);
    }
    const staff = p.student.type !== "STUDENT";
    const key = staff ? "staff" : p.class ? String(p.class.id) : "none";
    const cl = classes.get(key) ?? { classId: staff ? null : p.class?.id ?? null, name: staff ? "Staff & others" : p.class?.name ?? "No class", grade: p.class?.grade ?? null, students: new Set<number>(), IDEA: 0, PLANNING: 0, IN_PROGRESS: 0, TESTING: 0, COMPLETED: 0, ON_HOLD: 0 };
    cl.students.add(p.student.id);
    cl[p.status] += 1;
    classes.set(key, cl);
  }

  // Monthly trend: last 12 months of created vs completed.
  const months: Array<{ month: string; created: number; completed: number }> = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ month: monthKey(d), created: 0, completed: 0 });
  }
  const mIdx = new Map(months.map((m, i) => [m.month, i]));
  for (const p of rows) {
    const c = mIdx.get(p.createdAt.slice(0, 7));
    if (c !== undefined) months[c].created += 1;
    if (p.completedAt) {
      const k = mIdx.get(p.completedAt.slice(0, 7));
      if (k !== undefined) months[k].completed += 1;
    }
  }

  // Weekly student activity (updates, uploads, moves): last 16 weeks.
  const ids = rows.map((r) => r.id);
  const weeks: Array<{ week: string; count: number }> = [];
  const monday = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x;
  };
  const start = monday(now);
  for (let i = 15; i >= 0; i--) weeks.push({ week: new Date(start.getTime() - i * 7 * 86400000).toISOString().slice(0, 10), count: 0 });
  if (ids.length) {
    const since = weeks[0].week;
    const ev = await many(sql`
      SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS n FROM (
        SELECT project_id, created_at FROM SideProjectEvent WHERE created_at >= ${since}
        UNION ALL SELECT project_id, created_at FROM SideProjectUpdate WHERE created_at >= ${since}
      ) x WHERE x.project_id IN (${sql.join(ids.slice(0, 3000).map((i) => sql`${i}`), sql`, `)})
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')`);
    for (const e of ev) {
      const wk = monday(new Date(`${e.d}T00:00:00Z`)).toISOString().slice(0, 10);
      const w = weeks.find((x) => x.week === wk);
      if (w) w.count += Number(e.n);
    }
  }

  const statusCounts = (c: Record<string, any>) => Object.fromEntries(STATUSES.map((st) => [st, Number(c[st] ?? 0)])) as Record<Status, number>;
  const sumStatus = (c: Record<string, any>) => STATUSES.reduce((acc, st) => acc + Number(c[st] ?? 0), 0);
  let byClass = [...classes.values()].map((c) => ({ classId: c.classId, name: c.name, grade: c.grade, students: c.students.size, ...statusCounts(c) }));
  if (depth === "summary") {
    const small = byClass.filter((c) => c.students < 5);
    byClass = byClass.filter((c) => c.students >= 5);
    if (small.length) {
      byClass.push(
        small.reduce(
          (acc, c) => ({ ...acc, students: acc.students + c.students, ...Object.fromEntries(STATUSES.map((st) => [st, acc[st] + c[st]])) }),
          { classId: null, name: "Other", grade: null, students: 0, ...statusCounts({}) } as (typeof byClass)[number],
        ),
      );
    }
  }
  byClass.sort((a, b) => sumStatus(b) - sumStatus(a));
  const stageInsights = await stagesInsight(rows, depth);
  const reporting = await reportingInsight(rows, depth);

  const population = await studentsInScope(f.supervisedBy ? null : scope, f);
  const attentionScore = (p: MonitorRow) =>
    (p.reviewState === "AWAITING_VERIFICATION" ? 40 : 0) + (p.health === "OVERDUE" ? 35 : 0) + (p.health === "BLOCKED" ? 30 : 0) + (p.health === "STALE" ? 25 : 0) + (p.conceptPending ? 20 : 0) + (p.reviewState === "CHANGES_REQUESTED" ? 10 : 0);
  const detailLists =
    depth === "detail"
      ? {
          attention: rows
            .map((p) => ({ p, s: attentionScore(p) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s || a.p.lastActivityAt.localeCompare(b.p.lastActivityAt))
            .slice(0, 10)
            .map((x) => x.p),
          recentCompleted: rows
            .filter((p) => p.completedAt)
            .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))
            .slice(0, 8),
        }
      : { attention: [], recentCompleted: [] };

  return {
    depth,
    generatedAt: new Date().toISOString(),
    totals: {
      projects: rows.length,
      students: owners.size,
      population,
      studentOwners: studentOwners.size,
      participation: population ? Math.round((studentOwners.size / population) * 100) : null,
      studentProjects: rows.length - staffProjects,
      staffProjects,
      byStatus,
      completedThisTerm: completedNow,
      completedPreviousTerm: completedPrev,
      termLabel: windows.current.label,
      awaitingVerification: review.AWAITING_VERIFICATION ?? 0,
      verified: review.VERIFIED ?? 0,
      changesRequested: review.CHANGES_REQUESTED ?? 0,
      stale: health.STALE ?? 0,
      overdue: health.OVERDUE ?? 0,
      blocked: health.BLOCKED ?? 0,
      onTrack: health.ON_TRACK ?? 0,
      conceptPending,
      withGithub,
      withAccess,
      avgProgress: rows.length ? Math.round(progressSum / rows.length) : 0,
    },
    months,
    weeks,
    byClass: byClass.slice(0, 30),
    byCategory: [...categories.values()].sort((a, b) => b.count - a.count),
    topTech: [...tech.values()].sort((a, b) => b.count - a.count).slice(0, 12),
    ...detailLists,
    stages: stageInsights,
    reporting,
  };
}

export async function exportRows(scope: ScopeEntry | null, f: MonitorFilters, format: "csv" | "xlsx") {
  const rows = await loadRows(scope, f);
  const data = rows.map((p) => ({
    "Reg. number": p.student.regNumber ?? "",
    Owner: p.student.name ?? "",
    "Owner type": p.student.type,
    Class: p.class?.name ?? "",
    Grade: p.class?.grade ?? "",
    Programme: p.class?.program ?? "",
    "Academic year": p.year?.name ?? "",
    Title: p.title,
    Category: p.category?.name ?? "",
    Technologies: (p.techTags as string[]).join(", "),
    Status: p.status,
    Review: p.reviewState,
    "Progress %": p.progress,
    Health: p.health,
    "Days in stage": p.stage.daysIn ?? "",
    "Stage due": p.stage.plannedEnd ?? "",
    "Stage overrun (days)": p.stage.overrunDays || "",
    "Last report": p.lastReport ?? "",
    Concept: p.docs.CONCEPT ? "yes" : p.conceptPending ? "pending" : "no",
    SRS: p.docs.SRS ? "yes" : "no",
    "Implementation plan": p.docs.IMPLEMENTATION_PLAN ? "yes" : "no",
    GitHub: p.githubUrl ?? "",
    "Live link": p.accessUrl ?? "",
    Supervisor: p.supervisor?.name ?? "",
    "Last activity": p.lastActivityAt,
    Created: p.createdAt,
    Completed: p.completedAt ?? "",
    Verified: p.verifiedAt ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ "Reg. number": "" }]);
  if (format === "csv") return { body: Buffer.from("﻿" + XLSX.utils.sheet_to_csv(ws), "utf8"), count: rows.length };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Side projects");
  return { body: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, count: rows.length };
}

/** Filter options for the bar (only what the viewer can see). */
export async function filterOptions(scope: ScopeEntry | null) {
  const [years, classes, categories] = await Promise.all([
    many(sql`SELECT academic_year_id AS id, name, is_current AS isCurrent FROM AcademicYear ORDER BY start_date DESC, academic_year_id DESC LIMIT 12`),
    many(sql`
      SELECT cg.class_group_id AS id, cg.name, g.grade_id AS gradeId, g.name AS grade, pr.program_id AS programId, pr.name AS program
      FROM ClassGroup cg JOIN Grade g ON g.grade_id = cg.grade_id JOIN Program pr ON pr.program_id = g.program_id
      WHERE ${scopeCondition(scope, "NULL")}
         ${scope?.students?.length ? sql`OR cg.class_group_id IN (SELECT class_group_id FROM StudentClassGroup WHERE status = 'ACTIVE' AND user_id IN (${sql.join(scope.students.map((i) => sql`${i}`), sql`, `)}))` : sql``}
      ORDER BY pr.name, g.level_order, cg.name`),
    many(sql`SELECT category_id AS id, name, color, icon, slug FROM SideProjectCategory WHERE is_active = 1 ORDER BY sort`),
  ]);
  return { years: years.map((y) => ({ ...y, isCurrent: Number(y.isCurrent) === 1 })), classes, categories };
}

/**
 * Time per stage across the population: average actual days (finished and ongoing stays) vs
 * average planned days, how many projects are in each stage now and how many overran, the
 * bottleneck (largest actual/planned ratio) and the projects stuck longest beyond their plan.
 */
async function stagesInsight(rows: MonitorRow[], depth: "summary" | "detail") {
  const ids = rows.map((r) => r.id);
  await ensureStageLogs(ids.slice(0, 2000));
  const actual = ids.length
    ? await many(sql`
        SELECT stage, project_id AS id, SUM(TIMESTAMPDIFF(SECOND, entered_at, COALESCE(left_at, UTC_TIMESTAMP()))) / 86400 AS days
        FROM SideProjectStageLog WHERE project_id IN (${inList(ids.slice(0, 3000))})
        GROUP BY stage, project_id`)
    : [];
  const planned = ids.length
    ? await many(sql`
        SELECT stage, AVG(DATEDIFF(planned_end, planned_start) + 1) AS days, COUNT(*) AS n
        FROM SideProjectStage WHERE project_id IN (${inList(ids.slice(0, 3000))}) GROUP BY stage`)
    : [];
  const stages = STAGES.map((stage) => {
    const a = actual.filter((x) => x.stage === stage).map((x) => Number(x.days));
    const pl = planned.find((x) => x.stage === stage);
    const now = rows.filter((r) => (r.status === "ON_HOLD" ? r.pausedFrom : r.status) === stage);
    return {
      stage,
      avgActualDays: a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0,
      avgPlannedDays: pl ? Math.round(Number(pl.days) * 10) / 10 : null,
      samples: a.length,
      now: now.length,
      overrunNow: now.filter((r) => r.status !== "ON_HOLD" && r.stage.overrunDays > 0).length,
    };
  });
  const onHold = actual.filter((x) => x.stage === "ON_HOLD").map((x) => Number(x.days));
  const ratio = (s: (typeof stages)[number]) => (s.avgPlannedDays ? s.avgActualDays / s.avgPlannedDays : 0);
  const bottleneck = [...stages].filter((s) => s.samples > 0 && s.avgPlannedDays).sort((a, b) => ratio(b) - ratio(a))[0] ?? null;
  const stuck =
    depth === "detail"
      ? rows
          .filter((r) => r.status !== "COMPLETED" && r.status !== "ON_HOLD" && r.stage.daysIn !== null)
          .sort((a, b) => b.stage.overrunDays - a.stage.overrunDays || (b.stage.daysIn ?? 0) - (a.stage.daysIn ?? 0))
          .slice(0, 8)
      : [];
  return {
    stages,
    onHold: { now: rows.filter((r) => r.status === "ON_HOLD").length, avgDays: onHold.length ? Math.round((onHold.reduce((x, y) => x + y, 0) / onHold.length) * 10) / 10 : 0 },
    bottleneck: bottleneck && ratio(bottleneck) > 1 ? { stage: bottleneck.stage, ratio: Math.round(ratio(bottleneck) * 100) / 100 } : null,
    stuck,
  };
}

/** Reporting habits: reports and hours this week, who reported, and working projects gone quiet. */
async function reportingInsight(rows: MonitorRow[], depth: "summary" | "detail") {
  const ids = rows.map((r) => r.id);
  const per = ids.length
    ? await many(sql`
        SELECT project_id AS id,
               SUM(COALESCE(work_date, DATE(created_at)) >= DATE_SUB(UTC_DATE(), INTERVAL 6 DAY)) AS week,
               SUM(IF(COALESCE(work_date, DATE(created_at)) >= DATE_SUB(UTC_DATE(), INTERVAL 6 DAY), COALESCE(hours, 0), 0)) AS hours,
               DATE_FORMAT(MAX(COALESCE(work_date, DATE(created_at))), '%Y-%m-%d') AS last
        FROM SideProjectUpdate WHERE project_id IN (${inList(ids.slice(0, 3000))}) GROUP BY project_id`)
    : [];
  const by = new Map(per.map((p) => [Number(p.id), p]));
  const working = rows.filter((r) => ["PLANNING", "IN_PROGRESS", "TESTING"].includes(r.status));
  const today = new Date().toISOString().slice(0, 10);
  const daysSince = (d: string | null) => (d ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000) : null);
  const quiet = working
    .map((r) => ({ row: r, last: (by.get(r.id)?.last as string | undefined) ?? null }))
    .filter((x) => x.last === null || (daysSince(x.last) ?? 0) >= 14);
  return {
    reportsThisWeek: per.reduce((s, p) => s + Number(p.week), 0),
    hoursThisWeek: Math.round(per.reduce((s, p) => s + Number(p.hours), 0) * 10) / 10,
    // of the working projects (the ring's denominator), how many reported in the last 7 days
    projectsReportedThisWeek: working.filter((r) => Number(by.get(r.id)?.week ?? 0) > 0).length,
    workingProjects: working.length,
    quietCount: quiet.length,
    quiet: depth === "detail" ? quiet.slice(0, 8).map((x) => ({ ...x.row, lastReport: x.last, daysSinceReport: daysSince(x.last) })) : [],
  };
}

/** The Assigned projects page: everything this user supervises or helps build, with counts. */
export async function assignedProjects(userId: number, f: MonitorFilters) {
  const rows = await loadRows(null, { ...f, assignedTo: userId });
  const counts = {
    total: rows.length,
    supervising: rows.filter((r) => r.relation === "SUPERVISOR").length,
    member: rows.filter((r) => r.relation === "MEMBER").length,
    awaitingReview: rows.filter((r) => r.relation === "SUPERVISOR" && r.reviewState === "AWAITING_VERIFICATION").length,
    overdue: rows.filter((r) => r.health === "OVERDUE").length,
    stale: rows.filter((r) => r.health === "STALE").length,
    paused: rows.filter((r) => r.status === "ON_HOLD").length,
    completed: rows.filter((r) => r.status === "COMPLETED").length,
  };
  return { counts, rows: rows.slice(0, 600) };
}
