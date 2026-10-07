/**
 * Families (nga-desktop docs/NEXT_FEATURES_ANALYSIS.md §3 #2), on free channels.
 *
 * - Parents see each child's week in plain words (/family): lessons missed and
 *   lateness (Tendo), discipline notes (Tendo), work handed in and marks (Task
 *   Mentor), from the same daily signals early warning uses (StudentSignal).
 *   Staff-only things (early-warning levels, interventions, safeguarding) are
 *   never shown to families.
 * - A weekly summary goes out on Friday afternoon: an MIS notification, plus
 *   Telegram when the parent linked it (Reminder Hub) and email when they have
 *   one. No SMS (it costs money).
 * - Registrars import parents from a list: account + link to the child +
 *   the usual "your account" email.
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { notifyUsers } from "../utils/notifications";
import logger from "../utils/logger";
import { addDaysYmd, dowOfYmd, kigaliParts } from "./reminders/time";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const STALE_DAYS = 7;

export interface ChildSummary {
  studentId: number;
  name: string;
  firstName: string;
  className: string | null;
  asOf: string | null;
  attendance: string | null;
  conduct: string | null;
  schoolwork: string | null;
  /** Something worth a word with the child or the school this week. */
  attention: boolean;
}

type Metrics = Record<string, number | null>;
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/** Plain, parent-friendly sentences from the latest signals (pure, unit-tested). */
export function describe(tendo: Metrics | null, taskmentor: Metrics | null): Pick<ChildSummary, "attendance" | "conduct" | "schoolwork" | "attention"> {
  let attention = false;
  let attendance: string | null = null;
  let conduct: string | null = null;
  let schoolwork: string | null = null;
  if (tendo) {
    const abs = n(tendo.absences_14d) ?? 0;
    const late = n(tendo.lates_14d) ?? 0;
    if (!abs && !late) attendance = "At every lesson on time in the last 2 weeks.";
    else {
      const parts = [abs ? `missed ${plural(abs, "lesson")}` : null, late ? `was late ${plural(late, "time")}` : null].filter(Boolean);
      attendance = `In the last 2 weeks: ${parts.join(" and ")}.`;
      if (abs >= 3 || late >= 4) attention = true;
    }
    const inc = n(tendo.incidents_30d) ?? 0;
    conduct = inc ? `${plural(inc, "discipline note")} this month.` : "No discipline notes this month.";
    if (inc >= 2) attention = true;
  }
  if (taskmentor) {
    const due = n(taskmentor.due_14d) ?? 0;
    const missed = n(taskmentor.missed_14d) ?? 0;
    const avg = n(taskmentor.avg_pct_30d);
    const parts: string[] = [];
    if (due) parts.push(`handed in ${due - missed} of ${plural(due, "piece")} of work in the last 2 weeks`);
    if (avg !== null) parts.push(`average mark ${Math.round(avg)}% this month`);
    schoolwork = parts.length ? `${parts[0][0].toUpperCase()}${parts.join("; ").slice(1)}.` : "No work was due in the last 2 weeks.";
    if (missed >= 2 || (avg !== null && avg < 50)) attention = true;
  }
  return { attendance, conduct, schoolwork, attention };
}

export async function childrenOf(parentId: number): Promise<ChildSummary[]> {
  const kids = rows(await db.execute(sql`
    SELECT p.student_id AS id, TRIM(CONCAT(COALESCE(up.first_name, ''), ' ', COALESCE(up.last_name, ''))) AS name, up.first_name AS first,
           (SELECT cg.name FROM StudentClassGroup s JOIN ClassGroup cg ON cg.class_group_id = s.class_group_id
             WHERE s.user_id = p.student_id ORDER BY s.academic_year_id DESC LIMIT 1) AS className
    FROM Parenting p JOIN UserProfile up ON up.user_id = p.student_id
    JOIN User u ON u.user_id = p.student_id AND u.status = 'ACTIVE'
    WHERE p.parent_id = ${parentId} ORDER BY up.first_name`));
  if (!kids.length) return [];
  const cutoff = addDaysYmd(kigaliParts(new Date()).ymd, -STALE_DAYS);
  const sig = new Map<number, { tendo?: Metrics; taskmentor?: Metrics; asOf?: string }>();
  try {
    for (const r of rows(await db.execute(sql`
      SELECT student_id AS id, source, metrics, DATE_FORMAT(as_of, '%Y-%m-%d') AS asOf FROM StudentSignal
      WHERE as_of >= ${cutoff} AND student_id IN (${sql.join(kids.map((k: any) => sql`${Number(k.id)}`), sql`, `)})`))) {
      const cur = sig.get(Number(r.id)) ?? {};
      try {
        (cur as any)[r.source] = JSON.parse(r.metrics);
      } catch {
        /* bad row */
      }
      cur.asOf = !cur.asOf || r.asOf > cur.asOf ? r.asOf : cur.asOf;
      sig.set(Number(r.id), cur);
    }
  } catch {
    /* early warning not migrated: summaries without data */
  }
  return kids.map((k: any) => {
    const s = sig.get(Number(k.id)) ?? {};
    return {
      studentId: Number(k.id),
      name: k.name || `Student ${k.id}`,
      firstName: k.first || k.name || "Your child",
      className: k.className ?? null,
      asOf: s.asOf ?? null,
      ...describe(s.tendo ?? null, s.taskmentor ?? null),
    };
  });
}

// ─── preferences ────────────────────────────────────────────────────────────

export async function preferences(parentId: number) {
  const [p] = rows(await db.execute(sql`SELECT weekly_digest AS w, digest_email AS e FROM FamilyPreference WHERE parent_id = ${parentId}`));
  return { weeklyDigest: p ? !!p.w : true, digestEmail: p ? !!p.e : true };
}

export async function savePreferences(parentId: number, b: { weeklyDigest?: boolean; digestEmail?: boolean }) {
  const cur = await preferences(parentId);
  const next = { weeklyDigest: b.weeklyDigest ?? cur.weeklyDigest, digestEmail: b.digestEmail ?? cur.digestEmail };
  await db.execute(sql`
    INSERT INTO FamilyPreference (parent_id, weekly_digest, digest_email, updated_at) VALUES (${parentId}, ${next.weeklyDigest ? 1 : 0}, ${next.digestEmail ? 1 : 0}, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE weekly_digest = VALUES(weekly_digest), digest_email = VALUES(digest_email), updated_at = UTC_TIMESTAMP()`);
  return next;
}

// ─── weekly summary ─────────────────────────────────────────────────────────

/** The text of one parent's weekly summary (pure). */
export function digestText(children: ChildSummary[]): { title: string; body: string } {
  const lines: string[] = [];
  for (const c of children) {
    const facts = [c.attendance, c.conduct, c.schoolwork].filter(Boolean);
    lines.push(`${c.firstName}${c.className ? ` (${c.className})` : ""}: ${facts.length ? facts.join(" ") : "no information from the school this week."}`);
  }
  const anyAttention = children.some((c) => c.attention);
  return {
    title: anyAttention ? "This week at school: worth a look" : "This week at school",
    body: lines.join("\n") + (anyAttention ? "\nTalk with your child, or contact the class teacher if you have questions." : ""),
  };
}

export type Sender = {
  telegram: (parentId: number, text: { title: string; body: string }) => Promise<boolean>;
  email: (to: string, subject: string, html: string, text: string) => Promise<boolean>;
};

const realSender: Sender = {
  telegram: async (parentId, text) => {
    const { getTelegramLink, sendTelegramReminder, telegramConfig } = await import("./reminders/telegram");
    if (!telegramConfig()) return false;
    const link = await getTelegramLink(parentId);
    if (!link) return false;
    const r = await sendTelegramReminder(Number(link.chat_id), { job_id: 0, link: "/family", source_type: "test" }, text);
    return !!r.ok;
  },
  email: async (to, subject, html, text) => {
    const { default: emailService } = await import("../utils/email");
    return emailService.sendEmail({ to, subject, html, text }, false);
  },
};
let sender: Sender = realSender;
/** Tests. */
export const setFamilySender = (s: Sender | null) => {
  sender = s ?? realSender;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Monday of the Kigali week of `ymd`. Pure. */
export const weekOf = (ymd: string) => addDaysYmd(ymd, dowOfYmd(ymd) === 0 ? -6 : 1 - dowOfYmd(ymd));

/** Sends this week's summary to every parent who wants it and hasn't had it. */
export async function sendWeeklyDigests(now = new Date()) {
  const week = weekOf(kigaliParts(now).ymd);
  const parents = rows(await db.execute(sql`
    SELECT DISTINCT p.parent_id AS id, u.email
    FROM Parenting p JOIN User u ON u.user_id = p.parent_id AND u.status = 'ACTIVE'
    LEFT JOIN FamilyPreference f ON f.parent_id = p.parent_id
    LEFT JOIN FamilyDigestLog l ON l.parent_id = p.parent_id AND l.week_start = ${week}
    WHERE COALESCE(f.weekly_digest, 1) = 1 AND l.parent_id IS NULL`));
  let sent = 0;
  for (const p of parents) {
    const parentId = Number(p.id);
    try {
      const kids = await childrenOf(parentId);
      if (!kids.length) continue;
      const text = digestText(kids);
      const channels: string[] = [];
      await notifyUsers([parentId], { kind: "family_digest", title: text.title, body: text.body.slice(0, 480), link: "/family", subjectType: "family_digest", subjectId: Number(week.replace(/-/g, "")) });
      channels.push("app");
      if (await sender.telegram(parentId, text).catch(() => false)) channels.push("telegram");
      const prefs = await preferences(parentId);
      if (prefs.digestEmail && p.email && /@/.test(p.email)) {
        const html = `<h2 style="font-family:sans-serif">${esc(text.title)}</h2>${text.body.split("\n").map((l) => `<p style="font-family:sans-serif">${esc(l)}</p>`).join("")}<p style="font-family:sans-serif;color:#64748b">New Generation Academy · <a href="https://mis.amashuri.com/family">See more in NGA MIS</a></p>`;
        if (await sender.email(p.email, text.title, html, text.body).catch(() => false)) channels.push("email");
      }
      await db.execute(sql`INSERT IGNORE INTO FamilyDigestLog (parent_id, week_start, channels, sent_at) VALUES (${parentId}, ${week}, ${channels.join(",")}, UTC_TIMESTAMP())`);
      sent++;
    } catch (error) {
      logger.error("families: weekly summary failed for a parent", { error });
    }
  }
  return { week, sent };
}

// ─── import ─────────────────────────────────────────────────────────────────

export interface ImportRow {
  student: string;
  parentName: string;
  email: string;
  phone?: string | null;
  relationship?: string | null;
}
export interface ImportResult {
  row: number;
  outcome: "created" | "linked" | "already_linked" | "error";
  message?: string;
  parentId?: number;
}

const RELATIONSHIPS = ["MOTHER", "FATHER", "GUARDIAN", "PARENT", "OTHER"];

async function findStudent(ref: string): Promise<number | null> {
  const s = ref.trim();
  if (!s) return null;
  const [r] = rows(await db.execute(sql`
    SELECT u.user_id AS id FROM User u JOIN UserProfile p ON p.user_id = u.user_id AND p.user_type = 'STUDENT'
    WHERE u.status = 'ACTIVE' AND (u.user_id = ${/^\d+$/.test(s) ? Number(s) : -1} OR u.username = ${s} OR u.email = ${s} OR p.registration_number = ${s})
    LIMIT 1`));
  return r ? Number(r.id) : null;
}

export type AccountMailer = (email: string, username: string, password: string) => Promise<unknown>;
let mailer: AccountMailer = async (email, username, password) => {
  const { default: emailService } = await import("../utils/email");
  return emailService.sendAccountCreation(email, username, password);
};
/** Tests. */
export const setAccountMailer = (m: AccountMailer | null) => {
  if (m) mailer = m;
};

/** Creates (or reuses) parent accounts and links them to children. One result per row. */
export async function importParents(list: ImportRow[], by: number): Promise<ImportResult[]> {
  if (!Array.isArray(list) || !list.length) return [];
  if (list.length > 500) throw Object.assign(new Error("At most 500 rows at a time"), { status: 400 });
  const [parentRole] = rows(await db.execute(sql`SELECT role_id AS id FROM Role WHERE name = 'PARENT' LIMIT 1`));
  const out: ImportResult[] = [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i] ?? ({} as ImportRow);
    const row = i + 1;
    try {
      const email = String(r.email || "").trim().toLowerCase();
      const name = String(r.parentName || "").trim().replace(/\s+/g, " ");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("A valid email is needed");
      if (name.length < 2) throw new Error("The parent's name is missing");
      const studentId = await findStudent(String(r.student || ""));
      if (!studentId) throw new Error(`No active student "${r.student}"`);
      const rel = RELATIONSHIPS.includes(String(r.relationship || "").toUpperCase()) ? String(r.relationship).toUpperCase() : "PARENT";

      let [existing] = rows(await db.execute(sql`
        SELECT u.user_id AS id, p.user_type AS type FROM User u LEFT JOIN UserProfile p ON p.user_id = u.user_id WHERE u.email = ${email} LIMIT 1`));
      let created = false;
      if (existing && existing.type && existing.type !== "PARENT") throw new Error("That email belongs to a staff or student account");
      if (!existing) {
        let username = email.split("@")[0].replace(/[^a-z0-9._-]/g, "").slice(0, 40) || "parent";
        for (let k = 1; rows(await db.execute(sql`SELECT 1 AS x FROM User WHERE username = ${username} LIMIT 1`)).length; k++) username = `${username.replace(/\d+$/, "")}${k}`;
        const phone = r.phone ? String(r.phone).replace(/[^\d+]/g, "").slice(0, 20) || null : null;
        await db.execute(sql`INSERT INTO User (username, email, phone_number, status) VALUES (${username}, ${email}, ${phone}, 'ACTIVE')`);
        [existing] = rows(await db.execute(sql`SELECT user_id AS id FROM User WHERE email = ${email} LIMIT 1`));
        const parentId = Number(existing.id);
        const [first, ...rest] = name.split(" ");
        await db.execute(sql`INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (${parentId}, ${first}, ${rest.join(" ") || null}, 'PARENT')`);
        const password = crypto.randomBytes(8).toString("hex");
        const hash = await bcrypt.hash(password, await bcrypt.genSalt(12));
        await db.execute(sql`INSERT INTO AuthCredential (user_id, password_hash, force_password_change) VALUES (${parentId}, ${hash}, 1)`);
        if (parentRole) await db.execute(sql`INSERT IGNORE INTO UserRole (user_id, role_id) VALUES (${parentId}, ${Number(parentRole.id)})`);
        try {
          await mailer(email, username, password);
        } catch (error) {
          logger.warn("families: account email failed", { error });
        }
        created = true;
      }
      const parentId = Number(existing.id);
      const [link] = rows(await db.execute(sql`SELECT parenting_id AS id FROM Parenting WHERE parent_id = ${parentId} AND student_id = ${studentId} LIMIT 1`));
      if (link) {
        out.push({ row, outcome: created ? "created" : "already_linked", parentId });
        continue;
      }
      await db.execute(sql`INSERT INTO Parenting (student_id, parent_id, relationship) VALUES (${studentId}, ${parentId}, ${rel})`);
      // Parents see their children through access control v2 (parent_children rule).
      try {
        const { syncRuleGrants } = await import("./access/ruleEngine");
        await syncRuleGrants({ userIds: [parentId] } as any);
      } catch {
        /* the daily reconcile will pick it up */
      }
      out.push({ row, outcome: created ? "created" : "linked", parentId });
    } catch (error: any) {
      out.push({ row, outcome: "error", message: String(error?.message || error).slice(0, 200) });
    }
  }
  logger.info(`[families] import by ${by}: ${out.filter((o) => o.outcome === "created").length} created, ${out.filter((o) => o.outcome === "linked").length} linked, ${out.filter((o) => o.outcome === "error").length} errors`);
  return out;
}
