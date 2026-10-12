/**
 * Staff absence and cover (nga-desktop docs/NEXT_FEATURES_ANALYSIS.md §3 #9).
 *
 * A teacher reports an absence (or a cover manager records it for them). Once
 * approved, every timetabled lesson it leaves without a teacher becomes a
 * CoverLesson. For each, MIS suggests colleagues who are free then (no lesson
 * of their own, not absent, not already covering), best first: same subject,
 * then teaches that class, then fewest covers this week. The manager assigns
 * one and the cover teacher is notified (MIS, and NGA Desktop banners).
 *
 * Lessons come from the same "live lesson" rule as every timetable read
 * (calendarController loadTeacherLessons).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { loadTeacherLessons } from "../controllers/calendarController";
import { holdersOf } from "./access/admin";
import { notifyUsers } from "../utils/notifications";
import logger from "../utils/logger";
import { addDaysYmd, dbDateToYmd, dowOfYmd, kigaliParts, parseClock } from "./reminders/time";

export const CAP = "STAFF_COVER_MANAGE";
export const REASONS = ["sick", "family", "training", "official", "other"] as const;
export const MAX_DAYS = 30;

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const ids = (list: number[]) => sql.join(list.map((i) => sql`${i}`), sql`, `);
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

export class CoverError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

interface Term {
  termId: number;
  yearId: number;
  startYmd: string | null;
  endYmd: string | null;
}

async function currentTerm(): Promise<Term | null> {
  const [t] = rows(await db.execute(sql`
    SELECT academic_term_id AS termId, academic_year_id AS yearId, start_date AS s, end_date AS e
    FROM AcademicTerm WHERE is_current = 1 LIMIT 1`));
  return t ? { termId: Number(t.termId), yearId: Number(t.yearId), startYmd: dbDateToYmd(t.s), endYmd: dbDateToYmd(t.e) } : null;
}

export interface LessonOnDate {
  slot_id: number;
  date: string;
  start: string;
  end: string | null;
  subject_id: number | null;
  subject_name: string | null;
  class_group_id: number | null;
  class_name: string | null;
  location: string | null;
}

/** Dates from `from` to `to` inclusive (≤ 62). Pure. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 62; d = addDaysYmd(d, 1)) out.push(d);
  return out;
}

/** Two clock ranges overlap ("08:00"-"08:40" vs "08:20"-"09:00"). Pure. */
export function overlaps(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null): boolean {
  const as = parseClock(aStart) ?? 0;
  const bs = parseClock(bStart) ?? 0;
  const ae = parseClock(aEnd) ?? as + 40;
  const be = parseClock(bEnd) ?? bs + 40;
  return as < be && bs < ae;
}

type LessonSource = (teacherId: number, from: string, to: string) => Promise<LessonOnDate[]>;
let lessonSource: LessonSource | null = null;
/** Tests: supply timetables directly (null restores the real timetable). */
export const setLessonSource = (fn: LessonSource | null) => {
  lessonSource = fn;
};

/** A teacher's timetabled lessons on each date in [from, to], inside the term. */
export async function lessonsOf(teacherId: number, from: string, to: string, term?: Term | null): Promise<LessonOnDate[]> {
  if (lessonSource) return lessonSource(teacherId, from, to);
  const t = term === undefined ? await currentTerm() : term;
  if (!t) return [];
  const slots: any[] = await loadTeacherLessons({ userId: teacherId, termId: t.termId, yearId: t.yearId });
  const out: LessonOnDate[] = [];
  for (const date of datesBetween(from, to)) {
    if ((t.startYmd && date < t.startYmd) || (t.endYmd && date > t.endYmd)) continue;
    const dow = dowOfYmd(date);
    for (const s of slots) {
      if (Number(s.day_of_week) !== dow) continue;
      out.push({
        slot_id: Number(s.slot_id),
        date,
        start: String(s.start_time).slice(0, 5),
        end: s.end_time ? String(s.end_time).slice(0, 5) : null,
        subject_id: s.subject_id ? Number(s.subject_id) : null,
        subject_name: s.subject_name ?? null,
        class_group_id: s.class_group_id ? Number(s.class_group_id) : null,
        class_name: s.class_group_name ?? null,
        location: s.location ?? null,
      });
    }
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/** Cover managers (for "new absence" alerts). */
export async function managerIds(): Promise<number[]> {
  const set = new Set<number>();
  try {
    for (const h of await holdersOf(CAP, { type: "SCHOOL" } as any)) set.add(h.user_id);
  } catch {
    /* v2 tables unavailable */
  }
  try {
    for (const r of rows(await db.execute(sql`
      SELECT DISTINCT ur.user_id AS id FROM UserRole ur
      JOIN RolePermission rp ON rp.role_id = ur.role_id
      JOIN Permission p ON p.perm_id = rp.perm_id AND p.name = ${CAP}
      JOIN User u ON u.user_id = ur.user_id AND u.status = 'ACTIVE'`))) set.add(Number(r.id));
  } catch {
    /* legacy tables unavailable */
  }
  return [...set];
}

const nameOf = async (userId: number): Promise<string> => {
  const [r] = rows(await db.execute(sql`SELECT TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) AS n FROM UserProfile WHERE user_id = ${userId}`));
  return r?.n || `User ${userId}`;
};

const when = (date: string, start: string) => {
  const d = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${d} ${start}`;
};

// ─── absences ───────────────────────────────────────────────────────────────

export async function reportAbsence(by: number, isManager: boolean, b: any, now = new Date()) {
  const teacherId = b?.teacherId && isManager ? Math.trunc(Number(b.teacherId)) : by;
  const from = String(b?.from || "");
  const to = String(b?.to || b?.from || "");
  if (!ymdRe.test(from) || !ymdRe.test(to) || to < from) throw new CoverError("Choose the first and last day of the absence");
  if (datesBetween(from, to).length > MAX_DAYS) throw new CoverError(`At most ${MAX_DAYS} days at a time`);
  const today = kigaliParts(now).ymd;
  if (to < addDaysYmd(today, -7)) throw new CoverError("That absence is too far in the past");
  const reason = String(b?.reason || "");
  if (!(REASONS as readonly string[]).includes(reason)) throw new CoverError("Choose a reason");
  const [overlap] = rows(await db.execute(sql`
    SELECT absence_id AS id FROM StaffAbsence
    WHERE teacher_id = ${teacherId} AND status IN ('pending', 'approved') AND from_date <= ${to} AND to_date >= ${from} LIMIT 1`));
  if (overlap) throw new CoverError("An absence is already recorded for some of those days");
  const res: any = await db.execute(sql`
    INSERT INTO StaffAbsence (teacher_id, from_date, to_date, reason, note, status, reported_by, created_at)
    VALUES (${teacherId}, ${from}, ${to}, ${reason}, ${b?.note ? String(b.note).slice(0, 500) : null}, 'pending', ${by}, UTC_TIMESTAMP())`);
  const id = Number((Array.isArray(res) ? res[0] : res)?.insertId);
  if (isManager && teacherId !== by) {
    await decide(id, by, true);
  } else {
    const lessons = await lessonsOf(teacherId, from, to);
    const managers = (await managerIds()).filter((m) => m !== teacherId);
    if (managers.length) {
      await notifyUsers(managers, {
        kind: "staff_cover",
        title: `${await nameOf(teacherId)} reported an absence`,
        body: `${from === to ? from : `${from} to ${to}`}: ${lessons.length} lesson${lessons.length === 1 ? "" : "s"} need cover once approved.`,
        link: `/cover?absence=${id}`,
        subjectType: "staff_absence",
        subjectId: id,
        actorId: teacherId,
      });
    }
  }
  return id;
}

/** Approve (creating the cover lessons) or decline. */
export async function decide(absenceId: number, by: number, approve: boolean) {
  const [a] = rows(await db.execute(sql`
    SELECT teacher_id AS teacherId, DATE_FORMAT(from_date, '%Y-%m-%d') AS f, DATE_FORMAT(to_date, '%Y-%m-%d') AS t, status
    FROM StaffAbsence WHERE absence_id = ${absenceId}`));
  if (!a) throw new CoverError("Absence not found", 404);
  if (a.status !== "pending") throw new CoverError("This absence was already decided");
  await db.execute(sql`
    UPDATE StaffAbsence SET status = ${approve ? "approved" : "declined"}, decided_by = ${by}, decided_at = UTC_TIMESTAMP()
    WHERE absence_id = ${absenceId}`);
  let created = 0;
  if (approve) {
    for (const l of await lessonsOf(Number(a.teacherId), a.f, a.t)) {
      const r: any = await db.execute(sql`
        INSERT IGNORE INTO CoverLesson (absence_id, slot_id, lesson_date, start_time, end_time, subject_id, subject_name, class_group_id, class_name, location, status, created_at)
        VALUES (${absenceId}, ${l.slot_id}, ${l.date}, ${l.start}, ${l.end}, ${l.subject_id}, ${l.subject_name}, ${l.class_group_id}, ${l.class_name}, ${l.location}, 'open', UTC_TIMESTAMP())`);
      created += Number((Array.isArray(r) ? r[0] : r)?.affectedRows ?? 0);
    }
  }
  if (Number(a.teacherId) !== by) {
    await notifyUsers([Number(a.teacherId)], {
      kind: "staff_cover",
      title: approve ? "Your absence was approved" : "Your absence was declined",
      body: approve ? `${created} lesson${created === 1 ? "" : "s"} will be covered.` : "Talk to the deputy head or the DOS.",
      link: "/cover",
      subjectType: "staff_absence",
      subjectId: absenceId,
      actorId: by,
    });
  }
  return { created };
}

/** Withdraw an absence: its open cover lessons go; assigned cover teachers are told. */
export async function cancelAbsence(absenceId: number, by: number, isManager: boolean) {
  const [a] = rows(await db.execute(sql`SELECT teacher_id AS teacherId, status FROM StaffAbsence WHERE absence_id = ${absenceId}`));
  if (!a) throw new CoverError("Absence not found", 404);
  if (Number(a.teacherId) !== by && !isManager) throw new CoverError("Only the teacher or a cover manager can withdraw it", 403);
  if (!["pending", "approved"].includes(a.status)) throw new CoverError("This absence is already closed");
  const assigned = rows(await db.execute(sql`
    SELECT cover_teacher_id AS t, DATE_FORMAT(lesson_date, '%Y-%m-%d') AS d, start_time AS s, class_name AS c, subject_name AS sub
    FROM CoverLesson WHERE absence_id = ${absenceId} AND status = 'assigned' AND lesson_date >= ${kigaliParts(new Date()).ymd}`));
  await db.execute(sql`UPDATE StaffAbsence SET status = 'cancelled', decided_by = ${by}, decided_at = UTC_TIMESTAMP() WHERE absence_id = ${absenceId}`);
  await db.execute(sql`DELETE FROM CoverLesson WHERE absence_id = ${absenceId} AND lesson_date >= ${kigaliParts(new Date()).ymd}`);
  for (const r of assigned) {
    await notifyUsers([Number(r.t)], {
      kind: "staff_cover",
      title: "Cover no longer needed",
      body: `${r.sub || "Lesson"} · ${r.c || ""} · ${when(r.d, r.s)}`,
      link: "/cover",
      subjectType: "staff_absence",
      subjectId: absenceId,
      actorId: by,
    });
  }
}

// ─── cover ──────────────────────────────────────────────────────────────────

export interface Suggestion {
  teacherId: number;
  name: string;
  score: number;
  reasons: string[];
}

/** Rank free colleagues (pure, unit-tested). */
export function rankCandidates(
  candidates: Array<{ teacherId: number; name: string; busy: boolean; sameSubject: boolean; teachesClass: boolean; coversThisWeek: number }>,
): Suggestion[] {
  return candidates
    .filter((c) => !c.busy)
    .map((c) => {
      const reasons: string[] = [];
      let score = 0;
      if (c.sameSubject) {
        score += 3;
        reasons.push("Teaches this subject");
      }
      if (c.teachesClass) {
        score += 2;
        reasons.push("Teaches this class");
      }
      score -= Math.min(3, c.coversThisWeek);
      reasons.push(c.coversThisWeek ? `${c.coversThisWeek} cover${c.coversThisWeek === 1 ? "" : "s"} this week` : "No covers this week");
      return { teacherId: c.teacherId, name: c.name, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

async function coverRow(coverId: number) {
  const [c] = rows(await db.execute(sql`
    SELECT c.cover_id AS id, c.absence_id AS absenceId, a.teacher_id AS absentTeacherId, DATE_FORMAT(c.lesson_date, '%Y-%m-%d') AS date,
           c.start_time AS start, c.end_time AS end, c.subject_id AS subjectId, c.subject_name AS subject,
           c.class_group_id AS classGroupId, c.class_name AS className, c.location, c.status, c.cover_teacher_id AS coverTeacherId
    FROM CoverLesson c JOIN StaffAbsence a ON a.absence_id = c.absence_id WHERE c.cover_id = ${coverId}`));
  return c ?? null;
}

/** Is this teacher free for (date, start-end)? (no own lesson, not absent, not covering) */
async function isFree(teacherId: number, date: string, start: string, end: string | null, term: Term | null, exceptCover?: number) {
  const own = await lessonsOf(teacherId, date, date, term);
  if (own.some((l) => overlaps(l.start, l.end, start, end))) return false;
  const [abs] = rows(await db.execute(sql`
    SELECT 1 AS x FROM StaffAbsence WHERE teacher_id = ${teacherId} AND status IN ('pending', 'approved') AND from_date <= ${date} AND to_date >= ${date} LIMIT 1`));
  if (abs) return false;
  const covering = rows(await db.execute(sql`
    SELECT start_time AS s, end_time AS e FROM CoverLesson
    WHERE cover_teacher_id = ${teacherId} AND lesson_date = ${date} AND status = 'assigned' ${exceptCover ? sql`AND cover_id <> ${exceptCover}` : sql``}`));
  return !covering.some((c: any) => overlaps(c.s, c.e, start, end));
}

export async function suggestions(coverId: number): Promise<Suggestion[]> {
  const c = await coverRow(coverId);
  if (!c) throw new CoverError("Lesson not found", 404);
  const term = await currentTerm();
  const teachers = rows(await db.execute(sql`
    SELECT u.user_id AS id, TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS name
    FROM User u JOIN UserProfile p ON p.user_id = u.user_id AND p.user_type = 'TEACHER'
    WHERE u.status = 'ACTIVE' AND u.user_id <> ${Number(c.absentTeacherId)}`));
  if (!teachers.length) return [];
  const tIds = teachers.map((t: any) => Number(t.id));
  const assignments = term
    ? rows(await db.execute(sql`
        SELECT user_id AS u, subject_id AS s, class_group_id AS c FROM TeacherSubjectAssignment
        WHERE academic_year_id = ${term.yearId} AND user_id IN (${ids(tIds)})`))
    : [];
  const weekStart = addDaysYmd(c.date, dowOfYmd(c.date) === 0 ? -6 : 1 - dowOfYmd(c.date));
  const weekCovers = new Map<number, number>();
  for (const r of rows(await db.execute(sql`
    SELECT cover_teacher_id AS t, COUNT(*) AS n FROM CoverLesson
    WHERE status = 'assigned' AND lesson_date BETWEEN ${weekStart} AND ${addDaysYmd(weekStart, 6)} AND cover_teacher_id IN (${ids(tIds)})
    GROUP BY cover_teacher_id`))) weekCovers.set(Number(r.t), Number(r.n));
  const candidates = [];
  for (const t of teachers) {
    const id = Number(t.id);
    candidates.push({
      teacherId: id,
      name: t.name || `Teacher ${id}`,
      busy: !(await isFree(id, c.date, c.start, c.end, term, coverId)),
      sameSubject: assignments.some((a: any) => Number(a.u) === id && c.subjectId && Number(a.s) === Number(c.subjectId)),
      teachesClass: assignments.some((a: any) => Number(a.u) === id && c.classGroupId && Number(a.c) === Number(c.classGroupId)),
      coversThisWeek: weekCovers.get(id) ?? 0,
    });
  }
  return rankCandidates(candidates).slice(0, 10);
}

export async function assign(coverId: number, teacherId: number | null, by: number, note?: string) {
  const c = await coverRow(coverId);
  if (!c) throw new CoverError("Lesson not found", 404);
  if (teacherId === null) {
    await db.execute(sql`UPDATE CoverLesson SET cover_teacher_id = NULL, status = 'open', assigned_by = ${by}, assigned_at = UTC_TIMESTAMP() WHERE cover_id = ${coverId}`);
    if (c.coverTeacherId) {
      await notifyUsers([Number(c.coverTeacherId)], {
        kind: "staff_cover", title: "Cover no longer needed", body: `${c.subject || "Lesson"} · ${c.className || ""} · ${when(c.date, c.start)}`,
        link: "/cover", subjectType: "cover_lesson", subjectId: coverId, actorId: by,
      });
    }
    return coverRow(coverId);
  }
  if (teacherId === Number(c.absentTeacherId)) throw new CoverError("That teacher is the one who is absent");
  if (!(await isFree(teacherId, c.date, c.start, c.end, await currentTerm(), coverId))) throw new CoverError("That teacher isn't free then");
  await db.execute(sql`
    UPDATE CoverLesson SET cover_teacher_id = ${teacherId}, status = 'assigned', note = ${note ? String(note).slice(0, 500) : null}, assigned_by = ${by}, assigned_at = UTC_TIMESTAMP()
    WHERE cover_id = ${coverId}`);
  try {
    await notifyUsers([teacherId], {
      kind: "staff_cover",
      title: `Cover: ${c.subject || "lesson"} with ${c.className || "a class"}`,
      body: `${when(c.date, c.start)}${c.end ? `–${c.end}` : ""}${c.location ? ` · ${c.location}` : ""}${note ? ` · ${String(note).slice(0, 120)}` : ""}`,
      link: "/cover",
      subjectType: "cover_lesson",
      subjectId: coverId,
      actorId: by,
    });
  } catch (error) {
    logger.error("cover: notification failed", { error });
  }
  return coverRow(coverId);
}

// ─── views ──────────────────────────────────────────────────────────────────

/** For cover managers: pending absences and the cover lessons from `from` (7 days). */
export async function board(fromYmd?: string) {
  const from = fromYmd && ymdRe.test(fromYmd) ? fromYmd : kigaliParts(new Date()).ymd;
  const to = addDaysYmd(from, 6);
  const pending = rows(await db.execute(sql`
    SELECT a.absence_id AS id, a.teacher_id AS teacherId, TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS teacher,
           DATE_FORMAT(a.from_date, '%Y-%m-%d') AS "from", DATE_FORMAT(a.to_date, '%Y-%m-%d') AS "to", a.reason, a.note,
           DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt
    FROM StaffAbsence a LEFT JOIN UserProfile p ON p.user_id = a.teacher_id
    WHERE a.status = 'pending' ORDER BY a.from_date`));
  const lessons = rows(await db.execute(sql`
    SELECT c.cover_id AS id, c.absence_id AS absenceId, DATE_FORMAT(c.lesson_date, '%Y-%m-%d') AS date, c.start_time AS start, c.end_time AS end,
           c.subject_name AS subject, c.class_name AS className, c.location, c.status, c.note,
           a.teacher_id AS absentTeacherId, TRIM(CONCAT(COALESCE(ap.first_name, ''), ' ', COALESCE(ap.last_name, ''))) AS absentTeacher,
           c.cover_teacher_id AS coverTeacherId, TRIM(CONCAT(COALESCE(cp.first_name, ''), ' ', COALESCE(cp.last_name, ''))) AS coverTeacher
    FROM CoverLesson c JOIN StaffAbsence a ON a.absence_id = c.absence_id
    LEFT JOIN UserProfile ap ON ap.user_id = a.teacher_id
    LEFT JOIN UserProfile cp ON cp.user_id = c.cover_teacher_id
    WHERE c.lesson_date BETWEEN ${from} AND ${to} ORDER BY c.lesson_date, c.start_time`));
  for (const p of pending) p.lessons = (await lessonsOf(Number(p.teacherId), p.from, p.to)).length;
  return { from, to, pending, lessons, open: lessons.filter((l: any) => l.status === "open").length };
}

/** For any teacher: their own absences and the covers they're doing. */
export async function mine(userId: number) {
  const today = kigaliParts(new Date()).ymd;
  const absences = rows(await db.execute(sql`
    SELECT absence_id AS id, DATE_FORMAT(from_date, '%Y-%m-%d') AS "from", DATE_FORMAT(to_date, '%Y-%m-%d') AS "to", reason, note, status,
           (SELECT COUNT(*) FROM CoverLesson c WHERE c.absence_id = a.absence_id) AS lessons,
           (SELECT COUNT(*) FROM CoverLesson c WHERE c.absence_id = a.absence_id AND c.status = 'assigned') AS covered
    FROM StaffAbsence a WHERE teacher_id = ${userId} AND to_date >= ${addDaysYmd(today, -30)} ORDER BY from_date DESC LIMIT 20`));
  const covers = rows(await db.execute(sql`
    SELECT c.cover_id AS id, DATE_FORMAT(c.lesson_date, '%Y-%m-%d') AS date, c.start_time AS start, c.end_time AS end, c.subject_name AS subject,
           c.class_name AS className, c.location, c.note,
           TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS forTeacher
    FROM CoverLesson c JOIN StaffAbsence a ON a.absence_id = c.absence_id LEFT JOIN UserProfile p ON p.user_id = a.teacher_id
    WHERE c.cover_teacher_id = ${userId} AND c.status = 'assigned' AND c.lesson_date >= ${today}
    ORDER BY c.lesson_date, c.start_time LIMIT 50`));
  return { absences: absences.map((a: any) => ({ ...a, lessons: Number(a.lessons), covered: Number(a.covered) })), covers };
}

/** Teachers for the manager's "record an absence for…" picker. */
export async function teacherList() {
  return rows(await db.execute(sql`
    SELECT u.user_id AS id, TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS name
    FROM User u JOIN UserProfile p ON p.user_id = u.user_id AND p.user_type = 'TEACHER'
    WHERE u.status = 'ACTIVE' ORDER BY p.first_name, p.last_name`)).map((r: any) => ({ id: Number(r.id), name: r.name || `Teacher ${r.id}` }));
}
