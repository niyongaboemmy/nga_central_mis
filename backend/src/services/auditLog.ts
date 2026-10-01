import { and, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { ActivityLog, User, UserProfile } from "../db/schema";

/**
 * Times: rows are written with DEFAULT CURRENT_TIMESTAMP, i.e. in the database
 * session's time zone, which differs between dev (CAT) and hosted MySQL (often
 * UTC). Everything here is shown, grouped and filtered in Kigali time (UTC+2, no
 * DST): stored values are shifted by (Kigali − session offset), taken from the
 * session itself, and range bounds are shifted the other way so the created_at
 * index still applies. JS Dates are never sent (drizzle would send them as UTC).
 *
 * Audit log (ActivityLog): what people changed in the MIS -- creates, updates,
 * deletes, publishes, permission changes, sign-ins. Read by the "Audit log" page in
 * Usage & Monitoring.
 *
 * Every figure is computed over the whole filtered range in SQL; the page never
 * aggregates the 20 rows it happens to show.
 */

export interface AuditFilters {
  from: Date;
  to: Date;
  fromDay: string;
  toDay: string;
  userId: number | null;
  actions: string[];
  entities: string[];
  verbs: string[];
  q: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Minutes to add to a stored value to get Kigali time. Statement-constant. */
const SHIFT = sql`(120 - TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()))`;
const kigali = (col: unknown) => sql`DATE_ADD(${col}, INTERVAL ${SHIFT} MINUTE)`;
/** A Kigali wall-clock bound expressed in the session's time, for index-friendly comparisons. */
const storedBound = (kigaliText: string) => sql`DATE_SUB(${kigaliText}, INTERVAL ${SHIFT} MINUTE)`;
const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v.join(",") : String(v ?? ""))
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && /^[A-Za-z0-9_.-]{1,60}$/.test(s));
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The verb at the end of an action type: LESSON_NOTE_DELETE → DELETE. */
export const VERBS = ["CREATE", "UPDATE", "DELETE", "PUBLISH", "LOGIN", "SECURITY", "AI", "OTHER"] as const;
export const verbOf = (action: string): (typeof VERBS)[number] => {
  const a = action.toUpperCase();
  if (a.includes("AI_GENERATE") || a.endsWith("_AI")) return "AI";
  if (a.startsWith("LOGIN") || a.startsWith("LOGOUT") || a.includes("SIGN_IN") || a.includes("SIGNIN")) return "LOGIN";
  if (/(PASSWORD|PERMISSION|ROLE|ACCESS|GRANT|OTP|TOKEN|SECRET)/.test(a)) return "SECURITY";
  if (/(DELETE|REMOVE|ARCHIVE|REVOKE|DISABLE)/.test(a)) return "DELETE";
  if (/(CREATE|ADD|UPLOAD|IMPORT|REGISTER|ENROLL)/.test(a)) return "CREATE";
  if (/(PUBLISH|SHARE|SUBMIT|APPROVE|VALIDATE|SEND)/.test(a)) return "PUBLISH";
  if (/(UPDATE|EDIT|CHANGE|ASSIGN|MOVE|RENAME|SET|ENABLE)/.test(a)) return "UPDATE";
  return "OTHER";
};

export function parseAuditFilters(q: Record<string, unknown>): AuditFilters {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 6 * 86_400_000);
  // Accept the old start_date / end_date names too.
  const fromDay = DAY.test(String(q.from ?? q.start_date ?? "")) ? String(q.from ?? q.start_date) : ymd(weekAgo);
  let toDay = DAY.test(String(q.to ?? q.end_date ?? "")) ? String(q.to ?? q.end_date) : ymd(today);
  if (toDay < fromDay) toDay = fromDay;
  const userId = Number(q.user_id);
  const search = String(q.q ?? "").trim().slice(0, 100);
  return {
    from: new Date(`${fromDay}T00:00:00`),
    to: new Date(`${toDay}T23:59:59.999`),
    fromDay,
    toDay,
    userId: Number.isInteger(userId) && userId > 0 ? userId : null,
    actions: list(q.action),
    entities: list(q.entity),
    verbs: list(q.verb).map((v) => v.toUpperCase()).filter((v) => (VERBS as readonly string[]).includes(v)),
    q: search || null,
  };
}

/** Matching user ids for a free-text search on names and usernames (bounded). */
async function usersMatching(text: string): Promise<number[]> {
  const pat = `%${text.replace(/[%_\\]/g, "\\$&")}%`;
  const rows = await db
    .select({ id: User.user_id })
    .from(User)
    .leftJoin(UserProfile, eq(UserProfile.user_id, User.user_id))
    .where(
      or(
        like(User.username, pat),
        like(UserProfile.first_name, pat),
        like(UserProfile.last_name, pat),
        sql`CONCAT_WS(' ', ${UserProfile.first_name}, ${UserProfile.last_name}) LIKE ${pat}`,
      ),
    )
    .limit(500);
  return rows.map((r) => Number(r.id));
}

async function whereOf(f: AuditFilters, opts: { skipVerbs?: boolean } = {}): Promise<SQL> {
  const c: SQL[] = [sql`${ActivityLog.created_at} >= ${storedBound(`${f.fromDay} 00:00:00`)}`, sql`${ActivityLog.created_at} <= ${storedBound(`${f.toDay} 23:59:59`)}`];
  if (f.userId) c.push(or(eq(ActivityLog.user_id, f.userId), eq(ActivityLog.actor_id, f.userId))!);
  if (f.actions.length) c.push(inArray(ActivityLog.action_type, f.actions));
  if (f.entities.length) c.push(inArray(ActivityLog.entity_type, f.entities));
  if (f.q) {
    const pat = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    const ids = await usersMatching(f.q);
    const parts: SQL[] = [like(ActivityLog.description, pat), like(ActivityLog.action_type, pat), like(ActivityLog.entity_type, pat)];
    if (ids.length) parts.push(inArray(ActivityLog.user_id, ids), inArray(ActivityLog.actor_id, ids));
    if (/^\d+$/.test(f.q)) parts.push(eq(ActivityLog.entity_id, Number(f.q)));
    c.push(or(...parts)!);
  }
  return and(...c)!;
}

/** Verb filtering happens on the action types in range (the verb is derived, not stored). */
async function actionsForVerbs(f: AuditFilters): Promise<string[] | null> {
  if (!f.verbs.length) return null;
  const rows = await db
    .selectDistinct({ a: ActivityLog.action_type })
    .from(ActivityLog)
    .where(await whereOf(f));
  return rows.map((r) => r.a).filter((a) => f.verbs.includes(verbOf(a)));
}

async function effectiveWhere(f: AuditFilters): Promise<SQL | null> {
  const verbActions = await actionsForVerbs(f);
  if (verbActions && verbActions.length === 0) return null; // nothing can match
  const base = await whereOf(f);
  return verbActions ? and(base, inArray(ActivityLog.action_type, verbActions))! : base;
}

type Person = { id: number; name: string; username: string | null };
async function peopleById(ids: number[]): Promise<Map<number, Person>> {
  const unique = Array.from(new Set(ids.filter((n) => Number.isInteger(n) && n > 0)));
  if (!unique.length) return new Map();
  const rows = await db
    .select({ id: User.user_id, username: User.username, first: UserProfile.first_name, last: UserProfile.last_name })
    .from(User)
    .leftJoin(UserProfile, eq(UserProfile.user_id, User.user_id))
    .where(inArray(User.user_id, unique));
  return new Map(
    rows.map((r) => [
      Number(r.id),
      { id: Number(r.id), username: r.username, name: [r.first, r.last].filter(Boolean).join(" ") || r.username || `User ${r.id}` },
    ]),
  );
}

export async function listAuditLogs(f: AuditFilters, page: { limit: number; offset: number }) {
  const where = await effectiveWhere(f);
  if (!where) return { rows: [], total: 0 };
  const [{ n }] = (await db.select({ n: sql<number>`COUNT(*)` }).from(ActivityLog).where(where)) as any;
  const rows = await db
    .select({
      activity_id: ActivityLog.activity_id,
      user_id: ActivityLog.user_id,
      actor_id: ActivityLog.actor_id,
      action_type: ActivityLog.action_type,
      description: ActivityLog.description,
      entity_type: ActivityLog.entity_type,
      entity_id: ActivityLog.entity_id,
      metadata: ActivityLog.metadata,
      at: sql<string>`DATE_FORMAT(${kigali(ActivityLog.created_at)}, '%Y-%m-%d %H:%i:%s')`,
    })
    .from(ActivityLog)
    .where(where)
    .orderBy(desc(ActivityLog.created_at), desc(ActivityLog.activity_id))
    .limit(page.limit)
    .offset(page.offset);
  const people = await peopleById(rows.flatMap((r) => [Number(r.user_id), Number(r.actor_id ?? 0)]));
  return {
    total: Number(n),
    rows: rows.map((r) => {
      const u = people.get(Number(r.user_id));
      const a = r.actor_id ? people.get(Number(r.actor_id)) : undefined;
      return {
        ...r,
        created_at: r.at,
        verb: verbOf(r.action_type),
        user_name: u?.name ?? null,
        user_username: u?.username ?? null,
        actor_name: a?.name ?? null,
        actor_username: a?.username ?? null,
      };
    }),
  };
}

/** Figures for the whole filtered range: series, splits, top people, hour × weekday. */
export async function summarizeAuditLogs(f: AuditFilters) {
  const days = Math.round((f.to.getTime() - f.from.getTime()) / 86_400_000);
  const hourly = days <= 2;
  const where = await effectiveWhere(f);
  const empty = { total: 0, people: 0, gran: hourly ? "hour" : "day", series: [], verbs: [], actions: [], entities: [], users: [], heatmap: [], busiest: null };
  if (!where) return empty;

  const k = kigali(ActivityLog.created_at);
  const bucket = hourly ? sql`DATE_FORMAT(${k}, '%Y-%m-%d %H:00')` : sql`DATE_FORMAT(${k}, '%Y-%m-%d')`;
  const [totals, series, actions, entities, users, heat] = await Promise.all([
    db.select({ n: sql<number>`COUNT(*)`, people: sql<number>`COUNT(DISTINCT ${ActivityLog.user_id})` }).from(ActivityLog).where(where),
    db.select({ b: sql<string>`${bucket}`, n: sql<number>`COUNT(*)` }).from(ActivityLog).where(where).groupBy(sql`1`),
    db.select({ a: ActivityLog.action_type, n: sql<number>`COUNT(*)` }).from(ActivityLog).where(where).groupBy(ActivityLog.action_type).orderBy(sql`2 DESC`),
    db.select({ e: ActivityLog.entity_type, n: sql<number>`COUNT(*)` }).from(ActivityLog).where(where).groupBy(ActivityLog.entity_type).orderBy(sql`2 DESC`).limit(12),
    db.select({ u: ActivityLog.user_id, n: sql<number>`COUNT(*)`, last: sql<string>`DATE_FORMAT(MAX(${k}), '%Y-%m-%d %H:%i:%s')` }).from(ActivityLog).where(where).groupBy(ActivityLog.user_id).orderBy(sql`2 DESC`).limit(10),
    db
      .select({ d: sql<number>`WEEKDAY(${k})`, h: sql<number>`HOUR(${k})`, n: sql<number>`COUNT(*)` })
      .from(ActivityLog)
      .where(where)
      .groupBy(sql`1`, sql`2`),
  ]);

  // Continuous buckets so quiet periods show as zero, not as a gap.
  const counts = new Map(series.map((s) => [String(s.b), Number(s.n)]));
  const points: { bucket: string; count: number }[] = [];
  if (hourly) {
    for (let t = new Date(f.from); t <= f.to; t = new Date(t.getTime() + 3_600_000)) {
      const k = `${ymd(t)} ${String(t.getHours()).padStart(2, "0")}:00`;
      points.push({ bucket: k, count: counts.get(k) ?? 0 });
    }
  } else {
    for (let t = new Date(f.from); t <= f.to; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) {
      const k = ymd(t);
      points.push({ bucket: k, count: counts.get(k) ?? 0 });
    }
  }

  const verbTotals = new Map<string, number>();
  for (const a of actions) verbTotals.set(verbOf(a.a), (verbTotals.get(verbOf(a.a)) ?? 0) + Number(a.n));
  const people = await peopleById(users.map((u) => Number(u.u)));
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const c of heat) grid[Number(c.d)][Number(c.h)] = Number(c.n);
  const busiest = points.reduce<{ bucket: string; count: number } | null>((m, p) => (!m || p.count > m.count ? p : m), null);

  return {
    total: Number(totals[0]?.n ?? 0),
    people: Number(totals[0]?.people ?? 0),
    gran: hourly ? "hour" : "day",
    series: points,
    verbs: [...verbTotals].map(([verb, count]) => ({ verb, count })).sort((a, b) => b.count - a.count),
    actions: actions.map((a) => ({ action: a.a, verb: verbOf(a.a), count: Number(a.n) })),
    entities: entities.map((e) => ({ entity: e.e ?? null, count: Number(e.n) })),
    users: users.map((u) => ({ user_id: Number(u.u), name: people.get(Number(u.u))?.name ?? `User ${u.u}`, username: people.get(Number(u.u))?.username ?? null, count: Number(u.n), last_at: u.last })),
    heatmap: grid,
    busiest: busiest && busiest.count > 0 ? busiest : null,
  };
}

/** Action and entity types present in the range (unfiltered by them), for the pickers. */
export async function auditFacets(f: AuditFilters) {
  const base = await whereOf({ ...f, actions: [], entities: [], verbs: [], q: null });
  const [actions, entities] = await Promise.all([
    db.select({ v: ActivityLog.action_type, n: sql<number>`COUNT(*)` }).from(ActivityLog).where(base).groupBy(ActivityLog.action_type).orderBy(sql`2 DESC`),
    db.select({ v: ActivityLog.entity_type, n: sql<number>`COUNT(*)` }).from(ActivityLog).where(base).groupBy(ActivityLog.entity_type).orderBy(sql`2 DESC`),
  ]);
  return {
    actions: actions.map((a) => ({ value: a.v, verb: verbOf(a.v), count: Number(a.n) })),
    entities: entities.filter((e) => e.v).map((e) => ({ value: e.v as string, count: Number(e.n) })),
  };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
};

/** CSV of the filtered range, newest first, capped. */
export async function auditCsv(f: AuditFilters, cap = 50_000): Promise<string> {
  const { rows } = await listAuditLogs(f, { limit: cap, offset: 0 });
  const head = ["when", "action", "kind", "description", "user_id", "user", "actor_id", "actor", "entity_type", "entity_id", "metadata"];
  const lines = rows.map((r) =>
    [r.at, r.action_type, r.verb, r.description, r.user_id, r.user_name, r.actor_id, r.actor_name, r.entity_type, r.entity_id, r.metadata].map(csvCell).join(","),
  );
  return [head.join(","), ...lines].join("\n");
}
