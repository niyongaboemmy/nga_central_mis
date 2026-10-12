/**
 * Safeguarding concerns and weekly wellbeing check-ins
 * (nga-desktop docs/NEXT_FEATURES_ANALYSIS.md §3 #5).
 *
 * A concern is one worry about one student. They come from:
 * - the AI Tutor, when a student writes worrying words (tutor.ts `worry`);
 * - the weekly check-in: asking to talk, feeling low or unsafe, or a worrying comment;
 * - the student's own "Report a concern";
 * - staff.
 *
 * Holders of SAFEGUARDING_MANAGE (super admin, head teacher, safeguarding lead and
 * counsellor presets) get a notification for every new concern. The notification
 * says how serious and where it came from, never what the student wrote: that
 * stays behind the permission, and every view of a concern is audited.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { kigaliParts, addDaysYmd } from "./reminders/time";
import { worry } from "./desktop/tutor";
import { holdersOf } from "./access/admin";
import { notifyUsers } from "../utils/notifications";
import logger from "../utils/logger";

export const CAP = "SAFEGUARDING_MANAGE";
export const SOURCES = ["ai_tutor", "check_in", "student", "staff"] as const;
export type Source = (typeof SOURCES)[number];
export const SEVERITIES = ["high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const STATUSES = ["new", "acknowledged", "in_progress", "closed"] as const;
export type Status = (typeof STATUSES)[number];
/** What a student can pick in "Report a concern". */
export const REPORT_CATEGORIES = ["bullying", "unsafe", "someone_else", "health", "home", "other"] as const;

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const iso = (col: string) => sql.raw(`DATE_FORMAT(${col}, '%Y-%m-%dT%H:%i:%sZ')`);
const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

/** How serious a worry category is. Pure. */
export function severityFor(category: string): Severity {
  if (category === "self-harm" || category === "abuse" || category === "unsafe" || category === "home") return "high";
  if (category === "bullying" || category === "someone_else" || category === "wants_talk" || category === "health") return "medium";
  return "low";
}

const SOURCE_LABEL: Record<Source, string> = {
  ai_tutor: "AI Tutor",
  check_in: "weekly check-in",
  student: "student's own report",
  staff: "staff",
};

export interface NewConcern {
  studentId: number;
  source: Source;
  category: string;
  summary: string;
  detail?: string | null;
  ref?: string | null;
  reportedBy?: number | null;
  severity?: Severity;
}

/**
 * Opens a concern, or adds to the same student's open concern of the same kind
 * from the last 24 hours (a student writing several worrying messages in one
 * conversation makes one concern, not five). Alerts the safeguarding team on a
 * new one. Never throws: safeguarding must not break the feature that raised it.
 */
export async function raiseConcern(c: NewConcern): Promise<number | null> {
  try {
    const severity = c.severity ?? severityFor(c.category);
    const detail = c.detail ? clip(c.detail, 4000) : null;
    const [open] = rows(await db.execute(sql`
      SELECT concern_id AS id FROM SafeguardingConcern
      WHERE student_id = ${c.studentId} AND source = ${c.source} AND category = ${c.category}
        AND status <> 'closed' AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)
      ORDER BY concern_id DESC LIMIT 1`));
    if (open) {
      await db.execute(sql`
        INSERT INTO SafeguardingNote (concern_id, author_id, action, text, created_at)
        VALUES (${open.id}, NULL, 'again', ${detail}, UTC_TIMESTAMP())`);
      await db.execute(sql`UPDATE SafeguardingConcern SET updated_at = UTC_TIMESTAMP() WHERE concern_id = ${open.id}`);
      return Number(open.id);
    }
    const res: any = await db.execute(sql`
      INSERT INTO SafeguardingConcern (student_id, source, category, severity, status, summary, detail, ref, reported_by, created_at, updated_at)
      VALUES (${c.studentId}, ${c.source}, ${clip(c.category, 32)}, ${severity}, 'new', ${clip(c.summary, 255)}, ${detail},
              ${c.ref ? clip(c.ref, 64) : null}, ${c.reportedBy ?? null}, UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
    const id = Number((Array.isArray(res) ? res[0] : res)?.insertId);
    await alertTeam(id, severity, c.source);
    return id;
  } catch (error) {
    logger.error("safeguarding: could not record a concern", { error, source: c.source, category: c.category });
    return null;
  }
}

/** Who is alerted: everyone holding SAFEGUARDING_MANAGE for the school. */
export async function teamIds(): Promise<number[]> {
  const ids = new Set<number>();
  try {
    for (const h of await holdersOf(CAP, { type: "SCHOOL" } as any)) ids.add(h.user_id);
  } catch {
    /* access tables unavailable: fall through to legacy roles */
  }
  try {
    // Legacy role assignments (RolePermission), for holders the v2 grants don't cover yet.
    for (const r of rows(await db.execute(sql`
      SELECT DISTINCT ur.user_id AS id FROM UserRole ur
      JOIN RolePermission rp ON rp.role_id = ur.role_id
      JOIN Permission p ON p.perm_id = rp.perm_id AND p.name = ${CAP}
      JOIN User u ON u.user_id = ur.user_id AND u.status = 'ACTIVE'`))) ids.add(Number(r.id));
  } catch {
    /* no legacy table: v2 only */
  }
  return [...ids];
}

async function alertTeam(id: number, severity: Severity, source: Source) {
  const to = await teamIds();
  if (!to.length) {
    logger.warn("safeguarding: a concern was raised but nobody holds SAFEGUARDING_MANAGE", { id });
    return;
  }
  await notifyUsers(to, {
    kind: "safeguarding_concern",
    title: `${severity === "high" ? "Urgent: n" : "N"}ew safeguarding concern`,
    body: `From the ${SOURCE_LABEL[source]}. Open it to see the details.`,
    link: `/safeguarding?concern=${id}`,
    subjectType: "safeguarding_concern",
    subjectId: id,
  });
}

// ─── the team's view ────────────────────────────────────────────────────────

export async function listConcerns(opts: { status: "open" | Status | "all"; limit?: number }) {
  const where =
    opts.status === "all" ? sql`1 = 1` : opts.status === "open" ? sql`c.status <> 'closed'` : sql`c.status = ${opts.status}`;
  const r = rows(await db.execute(sql`
    SELECT c.concern_id AS id, c.student_id AS studentId,
           TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS student,
           c.source, c.category, c.severity, c.status, c.summary,
           c.assigned_to AS assignedTo, TRIM(CONCAT(COALESCE(a.first_name, ''), ' ', COALESCE(a.last_name, ''))) AS assignee,
           ${iso("c.created_at")} AS createdAt, ${iso("c.updated_at")} AS updatedAt,
           (SELECT COUNT(*) FROM SafeguardingNote n WHERE n.concern_id = c.concern_id) AS notes
    FROM SafeguardingConcern c
    LEFT JOIN UserProfile p ON p.user_id = c.student_id
    LEFT JOIN UserProfile a ON a.user_id = c.assigned_to
    WHERE ${where}
    ORDER BY c.status = 'closed', FIELD(c.severity, 'high', 'medium', 'low'), c.updated_at DESC
    LIMIT ${Math.min(500, Math.max(1, opts.limit ?? 200))}`));
  return r.map((x: any) => ({ ...x, id: Number(x.id), studentId: Number(x.studentId), assignedTo: x.assignedTo ? Number(x.assignedTo) : null, notes: Number(x.notes) }));
}

export async function getConcern(id: number) {
  const [c] = rows(await db.execute(sql`
    SELECT c.concern_id AS id, c.student_id AS studentId,
           TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS student,
           (SELECT cg.name FROM StudentClassGroup s JOIN ClassGroup cg ON cg.class_group_id = s.class_group_id
             WHERE s.user_id = c.student_id ORDER BY s.academic_year_id DESC LIMIT 1) AS className,
           c.source, c.category, c.severity, c.status, c.summary, c.detail, c.ref,
           c.reported_by AS reportedBy, TRIM(CONCAT(COALESCE(rb.first_name, ''), ' ', COALESCE(rb.last_name, ''))) AS reporter,
           c.assigned_to AS assignedTo, TRIM(CONCAT(COALESCE(a.first_name, ''), ' ', COALESCE(a.last_name, ''))) AS assignee,
           ${iso("c.created_at")} AS createdAt, ${iso("c.updated_at")} AS updatedAt, ${iso("c.closed_at")} AS closedAt
    FROM SafeguardingConcern c
    LEFT JOIN UserProfile p ON p.user_id = c.student_id
    LEFT JOIN UserProfile rb ON rb.user_id = c.reported_by
    LEFT JOIN UserProfile a ON a.user_id = c.assigned_to
    WHERE c.concern_id = ${id}`));
  if (!c) return null;
  const notes = rows(await db.execute(sql`
    SELECT n.note_id AS id, n.action, n.text, n.author_id AS authorId,
           TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS author, ${iso("n.created_at")} AS at
    FROM SafeguardingNote n LEFT JOIN UserProfile p ON p.user_id = n.author_id
    WHERE n.concern_id = ${id} ORDER BY n.note_id`));
  const history = rows(await db.execute(sql`
    SELECT concern_id AS id, category, severity, status, ${iso("created_at")} AS createdAt
    FROM SafeguardingConcern WHERE student_id = ${c.studentId} AND concern_id <> ${id}
    ORDER BY concern_id DESC LIMIT 10`));
  return {
    ...c,
    id: Number(c.id),
    studentId: Number(c.studentId),
    reportedBy: c.reportedBy ? Number(c.reportedBy) : null,
    assignedTo: c.assignedTo ? Number(c.assignedTo) : null,
    notes: notes.map((n: any) => ({ ...n, id: Number(n.id), authorId: n.authorId ? Number(n.authorId) : null })),
    history: history.map((h: any) => ({ ...h, id: Number(h.id) })),
  };
}

export class SafeguardingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** A note, and/or a status change, and/or (re)assignment, in one step. */
export async function act(id: number, by: number, input: { text?: string; status?: string; assignTo?: number | null }) {
  const [c] = rows(await db.execute(sql`SELECT status, assigned_to AS assignedTo FROM SafeguardingConcern WHERE concern_id = ${id}`));
  if (!c) throw new SafeguardingError("Concern not found", 404);
  const text = clip(input.text, 4000);
  const status = input.status && (STATUSES as readonly string[]).includes(input.status) ? (input.status as Status) : null;
  if (input.status && !status) throw new SafeguardingError("Unknown status");
  if (status === "closed" && !text) throw new SafeguardingError("Say what was done before closing the concern");
  const assignChanged = input.assignTo !== undefined && (input.assignTo ?? null) !== (c.assignedTo ? Number(c.assignedTo) : null);
  if (assignChanged && input.assignTo != null && !(await teamIds()).includes(input.assignTo)) {
    throw new SafeguardingError("Concerns can only be assigned to the safeguarding team");
  }
  if (!text && !status && !assignChanged) throw new SafeguardingError("Nothing to save");
  if (text) {
    await db.execute(sql`INSERT INTO SafeguardingNote (concern_id, author_id, action, text, created_at) VALUES (${id}, ${by}, 'note', ${text}, UTC_TIMESTAMP())`);
  }
  if (status && status !== c.status) {
    await db.execute(sql`
      UPDATE SafeguardingConcern SET status = ${status}, closed_at = ${status === "closed" ? sql`UTC_TIMESTAMP()` : null}, updated_at = UTC_TIMESTAMP()
      WHERE concern_id = ${id}`);
    await db.execute(sql`INSERT INTO SafeguardingNote (concern_id, author_id, action, text, created_at) VALUES (${id}, ${by}, 'status', ${status}, UTC_TIMESTAMP())`);
  }
  if (assignChanged) {
    await db.execute(sql`UPDATE SafeguardingConcern SET assigned_to = ${input.assignTo ?? null}, updated_at = UTC_TIMESTAMP() WHERE concern_id = ${id}`);
    await db.execute(sql`INSERT INTO SafeguardingNote (concern_id, author_id, action, text, created_at) VALUES (${id}, ${by}, 'assign', ${input.assignTo == null ? null : String(input.assignTo)}, UTC_TIMESTAMP())`);
    if (input.assignTo != null && input.assignTo !== by) {
      await notifyUsers([input.assignTo], {
        kind: "safeguarding_concern",
        title: "A safeguarding concern was assigned to you",
        body: "Open it to see the details.",
        link: `/safeguarding?concern=${id}`,
        subjectType: "safeguarding_concern",
        subjectId: id,
        actorId: by,
      });
    }
  }
  if (c.status === "new" && !status) {
    // Anyone acting on a new concern acknowledges it.
    await db.execute(sql`UPDATE SafeguardingConcern SET status = 'acknowledged', updated_at = UTC_TIMESTAMP() WHERE concern_id = ${id} AND status = 'new'`);
  }
  if (text && !status) await db.execute(sql`UPDATE SafeguardingConcern SET updated_at = UTC_TIMESTAMP() WHERE concern_id = ${id}`);
  return getConcern(id);
}

/** Who can be assigned (the team), for the picker. */
export async function team() {
  const ids = await teamIds();
  if (!ids.length) return [];
  const r = rows(await db.execute(sql`
    SELECT user_id AS id, TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) AS name
    FROM UserProfile WHERE user_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) ORDER BY first_name, last_name`));
  return r.map((x: any) => ({ id: Number(x.id), name: x.name || `User ${x.id}` }));
}

// ─── weekly check-in ────────────────────────────────────────────────────────

/** Monday of the Kigali week containing `now` (YYYY-MM-DD). Pure. */
export function weekStart(now = new Date()): string {
  const ymd = kigaliParts(now).ymd;
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDaysYmd(ymd, dow === 0 ? -6 : 1 - dow);
}

export interface CheckIn {
  mood: number;
  safe: number;
  wantsTalk: boolean;
  comment?: string | null;
}

export function validCheckIn(b: any): CheckIn | null {
  const mood = Math.trunc(Number(b?.mood));
  const safe = Math.trunc(Number(b?.safe));
  if (!(mood >= 1 && mood <= 5) || !(safe >= 1 && safe <= 5)) return null;
  return { mood, safe, wantsTalk: !!b?.wantsTalk, comment: b?.comment ? clip(b.comment, 500) : null };
}

/** The concerns a check-in raises (pure, unit-tested): `previousLow` = last week was low too. */
export function checkInConcerns(c: CheckIn, previousLow: boolean): Array<{ category: string; summary: string; severity: Severity }> {
  const out: Array<{ category: string; summary: string; severity: Severity }> = [];
  const w = c.comment ? worry(c.comment) : null;
  if (w) out.push({ category: w, summary: `Weekly check-in comment mentions ${w}`, severity: severityFor(w) });
  if (c.wantsTalk) out.push({ category: "wants_talk", summary: "Asked to talk to someone in the weekly check-in", severity: "medium" });
  if (c.safe <= 2) out.push({ category: "unsafe", summary: "Doesn't feel safe at school (weekly check-in)", severity: c.safe === 1 ? "high" : "medium" });
  const low = c.mood <= 2;
  if (low && (previousLow || c.mood === 1)) {
    out.push({ category: "low_mood", summary: previousLow ? "Low mood two weeks in a row (weekly check-in)" : "Very low mood (weekly check-in)", severity: "medium" });
  }
  return out;
}

export async function myCheckIn(studentId: number, now = new Date()) {
  const week = weekStart(now);
  const [row] = rows(await db.execute(sql`
    SELECT mood, safe, wants_talk AS wantsTalk, ${iso("created_at")} AS at FROM WellbeingCheckIn
    WHERE student_id = ${studentId} AND week_start = ${week}`));
  return { week, done: !!row, checkIn: row ? { mood: Number(row.mood), safe: Number(row.safe), wantsTalk: !!row.wantsTalk, at: row.at } : null };
}

export async function submitCheckIn(studentId: number, c: CheckIn, now = new Date()) {
  const week = weekStart(now);
  const [prev] = rows(await db.execute(sql`
    SELECT mood FROM WellbeingCheckIn WHERE student_id = ${studentId} AND week_start = ${addDaysYmd(week, -7)}`));
  try {
    await db.execute(sql`
      INSERT INTO WellbeingCheckIn (student_id, week_start, mood, safe, wants_talk, comment, created_at)
      VALUES (${studentId}, ${week}, ${c.mood}, ${c.safe}, ${c.wantsTalk ? 1 : 0}, ${c.comment ?? null}, UTC_TIMESTAMP())`);
  } catch (e: any) {
    const code = e?.code ?? e?.cause?.code;
    if (code === "ER_DUP_ENTRY") throw new SafeguardingError("You've already done this week's check-in", 409);
    throw e;
  }
  for (const k of checkInConcerns(c, !!prev && Number(prev.mood) <= 2)) {
    await raiseConcern({
      studentId,
      source: "check_in",
      category: k.category,
      severity: k.severity,
      summary: k.summary,
      detail: [`Mood ${c.mood}/5, feels safe ${c.safe}/5${c.wantsTalk ? ", wants to talk" : ""}.`, c.comment ? `Comment: ${c.comment}` : ""].filter(Boolean).join("\n"),
    });
  }
  return myCheckIn(studentId, now);
}

/** School-wide picture for the team: participation and averages (no names). */
export async function summary(now = new Date()) {
  const week = weekStart(now);
  const weeks = rows(await db.execute(sql`
    SELECT DATE_FORMAT(week_start, '%Y-%m-%d') AS week, COUNT(*) AS n, ROUND(AVG(mood), 2) AS mood, ROUND(AVG(safe), 2) AS safe,
           SUM(wants_talk) AS wantsTalk
    FROM WellbeingCheckIn WHERE week_start >= ${addDaysYmd(week, -7 * 7)}
    GROUP BY week_start ORDER BY week_start`));
  const [open] = rows(await db.execute(sql`
    SELECT SUM(status <> 'closed') AS open, SUM(status = 'new') AS fresh, SUM(status <> 'closed' AND severity = 'high') AS high
    FROM SafeguardingConcern`));
  const [students] = rows(await db.execute(sql`SELECT COUNT(*) AS n FROM User u JOIN UserProfile p ON p.user_id = u.user_id WHERE p.user_type = 'STUDENT' AND u.status = 'ACTIVE'`));
  return {
    week,
    students: Number(students?.n ?? 0),
    concerns: { open: Number(open?.open ?? 0), new: Number(open?.fresh ?? 0), high: Number(open?.high ?? 0) },
    weeks: weeks.map((w: any) => ({ week: w.week, checkIns: Number(w.n), mood: Number(w.mood), safe: Number(w.safe), wantsTalk: Number(w.wantsTalk ?? 0) })),
  };
}
