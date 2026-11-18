import { sql, SQL } from "drizzle-orm";
import { db } from "../../db";

/**
 * Student side projects (STUDENT_PROJECTS_IMPLEMENTATION_PLAN.md): shared vocabulary,
 * errors and small SQL helpers. Every write stamps UTC_TIMESTAMP() and every read formats
 * dates as ISO-8601 UTC, so the browser never guesses a timezone.
 */

export const CAP = {
  OWN: "SIDE_PROJECTS_MANAGE_OWN",
  ASSIGNED: "SIDE_PROJECTS_ASSIGNED",
  VIEW: "SIDE_PROJECTS_VIEW",
  REVIEW: "SIDE_PROJECTS_REVIEW",
  ANY: "SIDE_PROJECTS_MANAGE_ANY",
  /** choose a project's classification (migration 132); never a student account */
  CLASSIFY: "SIDE_PROJECTS_CLASSIFY",
} as const;

/** Teams, plan and tasks (migration 133). */
export const TEAM_MODES = ["PERSONAL", "TEAM"] as const;
export type TeamMode = (typeof TEAM_MODES)[number];
export const ROLE_KEYS = ["LEAD", "DEVELOPER", "DESIGNER", "TESTER", "RESEARCHER", "ANALYST", "DOCUMENTER", "OTHER"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];
export const PLAN_STATUSES = ["BACKLOG", "PLANNED", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Classification (migration 132). Students' projects are always STUDENT. */
export const KINDS = ["STUDENT", "DELIVERY_STUDIO", "INDIVIDUAL"] as const;
export type Kind = (typeof KINDS)[number];
export const isKind = (k: unknown): k is Kind => typeof k === "string" && (KINDS as readonly string[]).includes(k.toUpperCase());

/** Whether this account is a student's (they may never choose the classification). */
export async function isStudentAccount(userId: number) {
  const r = await one(sql`SELECT user_type FROM UserProfile WHERE user_id = ${userId}`);
  return String(r?.user_type ?? "").toUpperCase() === "STUDENT";
}

/** Lifecycle (migration 131). IN_PROGRESS is shown as "Building". ON_HOLD is a pause. */
export const STATUSES = ["IDEA", "PLANNING", "IN_PROGRESS", "TESTING", "COMPLETED", "ON_HOLD"] as const;
export type Status = (typeof STATUSES)[number];
/** The stages that take time and have a planned window, in order. */
export const STAGES = ["IDEA", "PLANNING", "IN_PROGRESS", "TESTING"] as const;
export type Stage = (typeof STAGES)[number];
/** The ordered path on the board (ON_HOLD sits beside it). */
export const PATH = ["IDEA", "PLANNING", "IN_PROGRESS", "TESTING", "COMPLETED"] as const;
export const REVIEW_STATES = ["NONE", "CHANGES_REQUESTED", "AWAITING_VERIFICATION", "VERIFIED"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];
export const DOC_TYPES = ["CONCEPT", "SRS", "IMPLEMENTATION_PLAN"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const LINK_KINDS = ["VIDEO", "DESIGN", "DOCS", "STORE", "OTHER"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** Document kinds a concept / SRS / plan may be (fileKinds.ts kinds). */
export const DOC_FILE_KINDS: Record<DocType, string[]> = {
  CONCEPT: ["pdf", "word", "markdown", "text", "slides"],
  SRS: ["pdf", "word", "markdown", "text"],
  IMPLEMENTATION_PLAN: ["pdf", "word", "markdown", "text", "sheet", "slides"],
};

const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};
export const limits = () => ({
  maxFiles: envInt("SIDE_PROJECT_MAX_FILES", 40),
  maxBytes: envInt("SIDE_PROJECT_MAX_MB", 300) * 1024 * 1024,
  staleDays: envInt("SIDE_PROJECT_STALE_DAYS", 21),
  maxLinks: 10,
  maxTags: 15,
  maxMilestones: 30,
});

export class SideProjectError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}
export const fail = (status: number, code: string, message: string, field?: string): never => {
  throw new SideProjectError(status, code, message, field);
};

export const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
export const one = async (q: SQL): Promise<any | undefined> => rows(await db.execute(q))[0];
export const many = async (q: SQL): Promise<any[]> => rows(await db.execute(q));
export const insertId = (r: unknown): number => {
  const head = Array.isArray(r) ? r[0] : r;
  return Number((head as any)?.insertId);
};
export const iso = (col: string) => sql.raw(`DATE_FORMAT(${col}, '%Y-%m-%dT%H:%i:%sZ')`);
export const ymd = (col: string) => sql.raw(`DATE_FORMAT(${col}, '%Y-%m-%d')`);
export const inList = (ids: number[]) => sql.join(ids.map((i) => sql`${i}`), sql`, `);
export const fullName = (alias: string) =>
  sql.raw(`TRIM(CONCAT(COALESCE(${alias}.first_name, ''), ' ', COALESCE(${alias}.last_name, '')))`);

export const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
export const titleKey = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 150);

export async function recordEvent(projectId: number, actorId: number | null, type: string, from?: string | null, to?: string | null, note?: string | null) {
  await db.execute(sql`
    INSERT INTO SideProjectEvent (project_id, actor_id, type, from_value, to_value, note, created_at)
    VALUES (${projectId}, ${actorId}, ${type}, ${from ?? null}, ${to ?? null}, ${note ? clip(note, 500) : null}, UTC_TIMESTAMP())`);
}

/** A student wrote something: keeps STALE honest and the project "active" in this year. */
export async function touch(projectId: number, yearId: number | null) {
  await db.execute(sql`
    UPDATE SideProject SET last_activity_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP(),
           last_active_year_id = COALESCE(${yearId}, last_active_year_id)
    WHERE project_id = ${projectId}`);
}
