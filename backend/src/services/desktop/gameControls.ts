import { sql } from "drizzle-orm";
import { db } from "../../db";
import { GAME_IDS, RESET } from "./games";
import { loadTeacherClasses } from "./classes";

/**
 * Two finer controls over NGA Desktop's games (nga-desktop TOOLS_HUB plan §6.7.5):
 *  - Class game time (layer 6): a teacher opens chosen games for one of their own
 *    classes for 5–30 minutes, even during their lesson. It never beats an exam.
 *  - Exceptions (layer 8): block or extend one student's games, with a reason and an
 *    end date, set by people with DESKTOP_TOOLS_CONFIGURE.
 * All times are computed in SQL (UTC_TIMESTAMP) and read back as ISO strings, so the
 * connection's time zone never matters.
 */

export class ControlError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const iso = (col: string) => sql.raw(`DATE_FORMAT(${col}, '%Y-%m-%dT%H:%i:%sZ')`);
const missing = (e: any) => e?.code === "ER_NO_SUCH_TABLE" || e?.cause?.code === "ER_NO_SUCH_TABLE";

/** Games a class game time may open: real games, not the always-open resets. */
export function cleanGames(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((g): g is string => typeof g === "string" && (GAME_IDS as readonly string[]).includes(g) && !RESET.has(g)))];
}

export interface ClassGameTime {
  id: number;
  classGroupId: number;
  className: string;
  games: string[];
  startsAt: string;
  endsAt: string;
  by: string;
}

const parseGames = (v: unknown): string[] => cleanGames(typeof v === "string" ? JSON.parse(v) : v);

async function activeFor(classIds: number[]): Promise<ClassGameTime[]> {
  if (!classIds.length) return [];
  try {
    const r = rows(await db.execute(sql`
      SELECT t.id, t.class_group_id AS cg, cg.name AS className, t.games,
             ${iso("t.starts_at")} AS startsAt, ${iso("t.ends_at")} AS endsAt,
             TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS byName
      FROM DesktopClassGameTime t
      JOIN ClassGroup cg ON cg.class_group_id = t.class_group_id
      LEFT JOIN UserProfile p ON p.user_id = t.created_by
      WHERE t.class_group_id IN (${sql.join(classIds.map((id) => sql`${id}`), sql`, `)})
        AND t.starts_at <= UTC_TIMESTAMP() AND t.ends_at > UTC_TIMESTAMP()
      ORDER BY t.ends_at DESC`));
    return r.map((x: any) => ({ id: Number(x.id), classGroupId: Number(x.cg), className: String(x.className), games: parseGames(x.games), startsAt: x.startsAt, endsAt: x.endsAt, by: String(x.byName || "") }));
  } catch (e) {
    if (missing(e)) return [];
    throw e;
  }
}

/** The teacher's classes with any running class game time. */
export async function teacherClassGameTimes(teacherId: number, classes = loadTeacherClasses): Promise<ClassGameTime[]> {
  const mine = await classes(teacherId);
  return activeFor(mine.map((c) => c.classGroupId));
}

export async function startClassGameTime(
  teacherId: number,
  input: { classGroupId?: unknown; games?: unknown; minutes?: unknown },
  classes = loadTeacherClasses,
): Promise<ClassGameTime> {
  const classGroupId = Number(input.classGroupId);
  const games = cleanGames(input.games);
  const minutes = Math.round(Number(input.minutes));
  if (!games.length) throw new ControlError("Pick at least one game.", 400, "NO_GAMES");
  if (!(minutes >= 5 && minutes <= 30)) throw new ControlError("Class game time lasts 5 to 30 minutes.", 400, "BAD_MINUTES");
  const mine = await classes(teacherId);
  if (!mine.some((c) => c.classGroupId === classGroupId)) throw new ControlError("You can only open games for a class you teach.", 403, "NOT_YOUR_CLASS");
  // One at a time per class: a new one replaces the running one.
  await db.execute(sql`UPDATE DesktopClassGameTime SET ends_at = UTC_TIMESTAMP() WHERE class_group_id = ${classGroupId} AND ends_at > UTC_TIMESTAMP()`);
  await db.execute(sql`
    INSERT INTO DesktopClassGameTime (class_group_id, games, starts_at, ends_at, created_by)
    VALUES (${classGroupId}, ${JSON.stringify(games)}, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${minutes} MINUTE), ${teacherId})`);
  const [now] = await activeFor([classGroupId]);
  return now;
}

/** End early: the creator, or any teacher of that class. */
export async function endClassGameTime(teacherId: number, id: number, classes = loadTeacherClasses): Promise<void> {
  const [row] = rows(await db.execute(sql`SELECT class_group_id AS cg, created_by AS creator FROM DesktopClassGameTime WHERE id = ${id} LIMIT 1`));
  if (!row) throw new ControlError("Not found.", 404, "NOT_FOUND");
  const mine = await classes(teacherId);
  if (Number(row.creator) !== teacherId && !mine.some((c) => c.classGroupId === Number(row.cg))) throw new ControlError("Not your class.", 403, "NOT_YOUR_CLASS");
  await db.execute(sql`UPDATE DesktopClassGameTime SET ends_at = LEAST(ends_at, UTC_TIMESTAMP()) WHERE id = ${id}`);
}

/** The class game time that applies to a student now (their current-year classes). */
export async function studentClassGameTime(studentId: number): Promise<ClassGameTime | null> {
  try {
    const cls = rows(await db.execute(sql`
      SELECT scg.class_group_id AS cg FROM StudentClassGroup scg
      JOIN AcademicYear y ON y.academic_year_id = scg.academic_year_id AND y.is_current = 1
      WHERE scg.user_id = ${studentId} AND scg.status = 'ACTIVE'`));
    const [t] = await activeFor(cls.map((c: any) => Number(c.cg)));
    return t ?? null;
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

// ─── exceptions ────────────────────────────────────────────────────────────

export interface Override {
  id: number;
  userId: number;
  name: string;
  kind: "block" | "extend";
  extraMin: number | null;
  reason: string;
  endsAt: string;
  by: string;
  createdAt: string;
}

const overrideSelect = sql`
  SELECT o.id, o.user_id AS userId, TRIM(CONCAT(COALESCE(sp.first_name, ''), ' ', COALESCE(sp.last_name, ''))) AS name,
         o.kind, o.extra_min AS extraMin, o.reason, ${iso("o.ends_at")} AS endsAt, ${iso("o.created_at")} AS createdAt,
         TRIM(CONCAT(COALESCE(bp.first_name, ''), ' ', COALESCE(bp.last_name, ''))) AS byName
  FROM DesktopGameOverride o
  LEFT JOIN UserProfile sp ON sp.user_id = o.user_id
  LEFT JOIN UserProfile bp ON bp.user_id = o.created_by`;
const toOverride = (x: any): Override => ({
  id: Number(x.id), userId: Number(x.userId), name: String(x.name || ""), kind: x.kind === "block" ? "block" : "extend",
  extraMin: x.extraMin === null || x.extraMin === undefined ? null : Number(x.extraMin), reason: String(x.reason), endsAt: x.endsAt, by: String(x.byName || ""), createdAt: x.createdAt,
});

export async function activeOverrides(): Promise<Override[]> {
  try {
    return rows(await db.execute(sql`${overrideSelect} WHERE o.revoked_at IS NULL AND o.ends_at > UTC_TIMESTAMP() ORDER BY o.ends_at ASC LIMIT 500`)).map(toOverride);
  } catch (e) {
    if (missing(e)) return [];
    throw e;
  }
}

/** The exception that applies to a student now: a block beats an extension. */
export async function studentOverride(userId: number): Promise<Override | null> {
  try {
    const r = rows(await db.execute(sql`${overrideSelect} WHERE o.user_id = ${userId} AND o.revoked_at IS NULL AND o.ends_at > UTC_TIMESTAMP()
      ORDER BY (o.kind = 'block') DESC, o.ends_at DESC LIMIT 1`));
    return r[0] ? toOverride(r[0]) : null;
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

export async function createOverride(actorId: number, input: { userId?: unknown; kind?: unknown; extraMin?: unknown; reason?: unknown; days?: unknown }): Promise<Override> {
  const userId = Number(input.userId);
  const kind = input.kind === "block" ? "block" : input.kind === "extend" ? "extend" : null;
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 300) : "";
  const days = Math.round(Number(input.days));
  const extraMin = kind === "extend" ? Math.round(Number(input.extraMin)) : null;
  if (!(userId > 0) || !kind) throw new ControlError("Choose a student and block or extend.", 400, "BAD_INPUT");
  if (reason.length < 3) throw new ControlError("Give a reason (it is kept in the audit log).", 400, "NO_REASON");
  if (!(days >= 1 && days <= 120)) throw new ControlError("Exceptions last 1 to 120 days.", 400, "BAD_DAYS");
  if (kind === "extend" && !(extraMin! >= 5 && extraMin! <= 120)) throw new ControlError("Extra time is 5 to 120 minutes a day.", 400, "BAD_EXTRA");
  const [student] = rows(await db.execute(sql`SELECT user_type FROM UserProfile WHERE user_id = ${userId} LIMIT 1`));
  if (!student || String(student.user_type).toUpperCase() !== "STUDENT") throw new ControlError("Exceptions are for students.", 400, "NOT_STUDENT");
  const res: any = await db.execute(sql`
    INSERT INTO DesktopGameOverride (user_id, kind, extra_min, reason, ends_at, created_by)
    VALUES (${userId}, ${kind}, ${extraMin}, ${reason}, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${days} DAY), ${actorId})`);
  const id = Number((Array.isArray(res) ? res[0] : res)?.insertId);
  return toOverride(rows(await db.execute(sql`${overrideSelect} WHERE o.id = ${id}`))[0]);
}

export async function revokeOverride(actorId: number, id: number): Promise<boolean> {
  const res: any = await db.execute(sql`UPDATE DesktopGameOverride SET revoked_at = UTC_TIMESTAMP(), revoked_by = ${actorId} WHERE id = ${id} AND revoked_at IS NULL`);
  return Number((Array.isArray(res) ? res[0] : res)?.affectedRows) > 0;
}

/** Students matching a name (for the exceptions picker): id, name, class. */
export async function findStudents(q: string): Promise<Array<{ id: number; name: string; className: string | null }>> {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const r = rows(await db.execute(sql`
    SELECT p.user_id AS id, TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS name,
           (SELECT cg.name FROM StudentClassGroup s JOIN ClassGroup cg ON cg.class_group_id = s.class_group_id
              JOIN AcademicYear y ON y.academic_year_id = s.academic_year_id AND y.is_current = 1
             WHERE s.user_id = p.user_id AND s.status = 'ACTIVE' LIMIT 1) AS className
    FROM UserProfile p JOIN User u ON u.user_id = p.user_id AND u.status = 'ACTIVE'
    WHERE UPPER(p.user_type) = 'STUDENT' AND CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, '')) LIKE ${like}
    ORDER BY p.first_name, p.last_name LIMIT 20`));
  return r.map((x: any) => ({ id: Number(x.id), name: String(x.name), className: x.className ?? null }));
}
