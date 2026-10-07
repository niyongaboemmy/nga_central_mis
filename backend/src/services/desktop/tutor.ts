import { sql } from "drizzle-orm";
import { db } from "../../db";
import { completeChat, type ChatMessage } from "../aiProviders/chat";
import { kigaliInstant, kigaliParts } from "../reminders/time";

/**
 * The student AI tutor in NGA Desktop (TOOLS_HUB plan §5.7.4). Control is a
 * pipeline, not just a prompt: safeguarding words are flagged first; the tutor
 * drafts; a second AI pass checks the draft for a full solution or unsafe content;
 * a leaking draft is redone once with a stricter instruction, then replaced by a
 * safe reply. Every question and reply is logged for school review.
 */

export const TUTOR_FEATURE = "desktop-tutor";
export const CHECK_FEATURE = "desktop-tutor-check";

export interface TutorSettings {
  enabled: boolean;
  /** Questions per student per Kigali day. */
  dailyCap: number;
}
export const DEFAULT_TUTOR: TutorSettings = { enabled: true, dailyCap: 15 };

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const missing = (e: any) => e?.code === "ER_NO_SUCH_TABLE" || e?.cause?.code === "ER_NO_SUCH_TABLE";
const iso = (col: string) => sql.raw(`DATE_FORMAT(${col}, '%Y-%m-%dT%H:%i:%sZ')`);

export function mergeTutor(v: unknown): TutorSettings {
  const s = (v && typeof v === "object" ? v : {}) as Partial<TutorSettings>;
  const cap = Number(s.dailyCap);
  return {
    enabled: typeof s.enabled === "boolean" ? s.enabled : DEFAULT_TUTOR.enabled,
    dailyCap: Number.isFinite(cap) ? Math.max(1, Math.min(100, Math.round(cap))) : DEFAULT_TUTOR.dailyCap,
  };
}

export async function loadTutorSettings(): Promise<TutorSettings> {
  try {
    const [r] = rows(await db.execute(sql`SELECT value FROM DesktopToolSetting WHERE setting_key = 'tutor' LIMIT 1`));
    return mergeTutor(typeof r?.value === "string" ? JSON.parse(r.value) : r?.value);
  } catch (e) {
    if (missing(e)) return DEFAULT_TUTOR;
    throw e;
  }
}

export async function saveTutorSettings(s: TutorSettings, userId: number) {
  await db.execute(sql`
    INSERT INTO DesktopToolSetting (setting_key, value, updated_by, updated_at) VALUES ('tutor', ${JSON.stringify(s)}, ${userId}, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)`);
}

/** Questions this student asked today (Kigali). */
export async function questionsToday(userId: number, now = new Date()): Promise<number> {
  try {
    // Stored in UTC (UTC_TIMESTAMP on insert): compare with a UTC string, never a Date (driver time zone).
    const start = kigaliInstant(kigaliParts(now).ymd, 0).toISOString().slice(0, 19).replace("T", " ");
    const [r] = rows(await db.execute(sql`SELECT COUNT(*) AS n FROM DesktopTutorMessage WHERE user_id = ${userId} AND role = 'student' AND created_at >= ${start}`));
    return Number(r?.n ?? 0);
  } catch (e) {
    if (missing(e)) return 0;
    throw e;
  }
}

// ─── safeguarding ───────────────────────────────────────────────────────────

const WORRY: Array<[string, RegExp]> = [
  ["self-harm", /\b(kill myself|suicid\w*|end my life|want to die|hurt myself|self[- ]?harm|cut myself|kwiyahura|kwiyica|me suicider|me tuer)\b/i],
  ["abuse", /\b(abus(e|ed|ing)|touch(ed|es) me|rape[ds]?|beats? me|hits? me at home|harc[eè]l\w*|viol[ée]?e?)\b/i],
  ["bullying", /\b(bull(y|ied|ying)|everyone hates me|they threaten me)\b/i],
];

/** A worrying message (for a person to look at), or null. Pure. */
export function worry(text: string): string | null {
  for (const [why, re] of WORRY) if (re.test(text)) return why;
  return null;
}

export const SUPPORT_REPLY =
  "I'm really glad you told me. You don't have to deal with this alone. Please talk to someone you trust today: your class teacher, the school counsellor or nurse, or a parent or guardian. In Rwanda you can also call the free child helpline 116 at any time. If you are in danger right now, go to the nearest teacher or call 112.";

export const SAFE_HINT =
  "Let's work it out together rather than me giving you the answer. What do you already know about this, and what would you try as a first step? Tell me, and I'll give you a hint for the next one.";

// ─── prompts ────────────────────────────────────────────────────────────────

export function tutorPrompt(firstName: string, now = new Date(), stricter = false): string {
  return [
    `You are NGA Tutor, a patient study coach built into NGA Desktop at New Generation Academy, a secondary school in Rwanda (S1–S6, Competence-Based Curriculum). You are talking with ${firstName || "a student"}, a student aged about 12–19. Today is ${kigaliParts(now).ymd}.`,
    "Your job is to help them LEARN, not to do their work:",
    "- Explain concepts clearly, with simple examples, and check understanding with a short question.",
    "- For homework, exercises, tests or essays: never give the final answer or write the work for them. Ask what they tried, give the next small hint, and let them do each step. You may show a fully worked example of a DIFFERENT, similar problem.",
    "- You may check a student's own answer and say whether it is right, and why, once they have given it.",
    "- Keep replies short (a few sentences or a short list). Write maths with LaTeX between $…$.",
    "- Reply in English or French (the language of the question). If they write in Kinyarwanda, reply in simple Kinyarwanda and give key terms in English; never invent words.",
    "- Stay on school learning. Politely decline anything unsafe, adult, hateful or unrelated, and never ask for personal details.",
    "- If a student seems upset, unsafe or at risk, be kind and tell them to talk to a teacher, the school counsellor or a parent, and that the free child helpline is 116.",
    ...(stricter ? ["IMPORTANT: your previous reply gave away the answer. Do NOT state any final answer, result or completed text this time. Ask one guiding question or give one small hint only."] : []),
  ].join("\n");
}

export const CHECK_PROMPT = [
  "You review replies of a school AI tutor for students aged 12–19. The tutor must teach, not do the student's work.",
  'Answer with JSON only: {"gives_final_answer": boolean, "does_the_work": boolean, "unsafe": boolean, "reason": "short"}.',
  "- gives_final_answer: the reply states the final answer/result of the student's exercise, homework or test question (explaining a concept, or a worked example of a DIFFERENT problem, is fine; confirming an answer the student already gave is fine).",
  "- does_the_work: the reply writes the essay, paragraph, code or solution steps the student was asked to produce.",
  "- unsafe: sexual content, violence instructions, self-harm encouragement, hate, personal data requests, or anything inappropriate for a minor.",
].join("\n");

export interface Verdict {
  gives_final_answer: boolean;
  does_the_work: boolean;
  unsafe: boolean;
  reason: string;
  /** The checker couldn't run (all providers busy): the draft was sent unchecked and flagged. */
  unchecked?: boolean;
}

/** Reads the checker's JSON (tolerant of code fences or extra text). Pure. */
export function parseVerdict(raw: string): Verdict | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (typeof j !== "object" || j === null) return null;
    return { gives_final_answer: !!j.gives_final_answer, does_the_work: !!j.does_the_work, unsafe: !!j.unsafe, reason: String(j.reason ?? "").slice(0, 160) };
  } catch {
    return null;
  }
}

export const leaks = (v: Verdict) => v.gives_final_answer || v.does_the_work;

async function check(question: string, reply: string, userId: number, signal?: AbortSignal): Promise<Verdict> {
  try {
    const r = await completeChat({
      system: CHECK_PROMPT,
      messages: [{ role: "user", content: `Student's message:\n${question.slice(0, 3000)}\n\nTutor's reply:\n${reply.slice(0, 4000)}` }],
      audience: "minor",
      actorUserId: userId,
      feature: CHECK_FEATURE,
      signal,
    });
    return parseVerdict(r.text) ?? { gives_final_answer: false, does_the_work: false, unsafe: false, reason: "checker reply unreadable", unchecked: true };
  } catch {
    return { gives_final_answer: false, does_the_work: false, unsafe: false, reason: "checker unavailable", unchecked: true };
  }
}

export interface TutorReply {
  text: string;
  provider: string | null;
  model: string | null;
  verdict: Verdict | null;
  flag: string | null;
}

/** The pipeline: worry check → draft → check → (stricter redraft → check) → safe reply. */
export async function runTutor(opts: { userId: number; firstName: string; messages: ChatMessage[]; signal?: AbortSignal; now?: Date }): Promise<TutorReply> {
  const question = opts.messages[opts.messages.length - 1]?.content ?? "";
  const w = worry(question);
  if (w) return { text: SUPPORT_REPLY, provider: null, model: null, verdict: null, flag: w };

  let stricter = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = await completeChat({
      system: tutorPrompt(opts.firstName, opts.now, stricter),
      messages: opts.messages,
      audience: "minor",
      actorUserId: opts.userId,
      feature: TUTOR_FEATURE,
      signal: opts.signal,
    });
    const verdict = await check(question, draft.text, opts.userId, opts.signal);
    if (verdict.unsafe) return { text: SAFE_HINT, provider: draft.provider, model: draft.model, verdict, flag: "unsafe reply blocked" };
    if (!leaks(verdict)) return { text: draft.text, provider: draft.provider, model: draft.model, verdict, flag: verdict.unchecked ? "sent unchecked" : null };
    stricter = true;
  }
  return { text: SAFE_HINT, provider: null, model: null, verdict: { gives_final_answer: true, does_the_work: false, unsafe: false, reason: "answer withheld twice" }, flag: null };
}

/** The lesson or exam that pauses the tutor for this student now, or null. Pure. */
export function activeLock(windows: Array<{ from: string; to: string; kind: string; label?: string; role?: string }>, now = new Date()): { kind: "exam" | "lesson"; label: string; until: string } | null {
  const t = now.getTime();
  const on = (w: { from: string; to: string }) => Date.parse(w.from) <= t && t < Date.parse(w.to);
  const exam = windows.find((w) => w.kind === "exam" && on(w));
  if (exam) return { kind: "exam", label: exam.label ?? "", until: exam.to };
  const lesson = windows.find((w) => w.kind === "lesson" && on(w) && w.role === "attending");
  return lesson ? { kind: "lesson", label: lesson.label ?? "", until: lesson.to } : null;
}

// ─── log and review ─────────────────────────────────────────────────────────

export async function logExchange(userId: number, conversationId: string, question: string, reply: TutorReply): Promise<number> {
  await db.execute(sql`
    INSERT INTO DesktopTutorMessage (user_id, conversation_id, role, text, flagged, flag_reason, created_at)
    VALUES (${userId}, ${conversationId}, 'student', ${question}, ${reply.flag && !reply.provider ? 1 : 0}, ${reply.flag && !reply.provider ? reply.flag : null}, UTC_TIMESTAMP())`);
  const res: any = await db.execute(sql`
    INSERT INTO DesktopTutorMessage (user_id, conversation_id, role, text, provider, model, verdict, flagged, flag_reason, created_at)
    VALUES (${userId}, ${conversationId}, 'tutor', ${reply.text}, ${reply.provider}, ${reply.model}, ${reply.verdict ? JSON.stringify(reply.verdict).slice(0, 400) : null},
            ${reply.flag && reply.provider ? 1 : 0}, ${reply.flag && reply.provider ? reply.flag : null}, UTC_TIMESTAMP())`);
  return Number((Array.isArray(res) ? res[0] : res)?.insertId);
}

/** The student reports a reply ("wrong", "gave the answer", "inappropriate"). */
export async function report(userId: number, messageId: number, reason: string): Promise<boolean> {
  const res: any = await db.execute(sql`
    UPDATE DesktopTutorMessage SET flagged = 1, flag_reason = ${`reported: ${reason.slice(0, 100)}`}
    WHERE id = ${messageId} AND user_id = ${userId} AND role = 'tutor'`);
  return Number((Array.isArray(res) ? res[0] : res)?.affectedRows) > 0;
}

export async function conversations(opts: { flaggedOnly: boolean; days: number }) {
  try {
    const r = rows(await db.execute(sql`
      SELECT m.conversation_id AS id, m.user_id AS userId,
             TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS name,
             COUNT(*) AS messages, SUM(m.flagged) AS flagged,
             ${iso("MIN(m.created_at)")} AS startedAt, ${iso("MAX(m.created_at)")} AS lastAt,
             SUBSTRING(MIN(CONCAT(LPAD(m.id, 20, '0'), IF(m.role = 'student', m.text, ''))), 21, 140) AS firstQuestion,
             GROUP_CONCAT(DISTINCT m.flag_reason SEPARATOR ', ') AS reasons
      FROM DesktopTutorMessage m LEFT JOIN UserProfile p ON p.user_id = m.user_id
      WHERE m.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${opts.days} DAY)
      GROUP BY m.conversation_id, m.user_id, p.first_name, p.last_name
      ${opts.flaggedOnly ? sql`HAVING SUM(m.flagged) > 0` : sql``}
      ORDER BY lastAt DESC LIMIT 200`));
    return r.map((x: any) => ({ id: String(x.id), userId: Number(x.userId), name: String(x.name || ""), messages: Number(x.messages), flagged: Number(x.flagged), startedAt: x.startedAt, lastAt: x.lastAt, firstQuestion: String(x.firstQuestion || ""), reasons: x.reasons ?? null }));
  } catch (e) {
    if (missing(e)) return [];
    throw e;
  }
}

export async function conversation(id: string) {
  const r = rows(await db.execute(sql`
    SELECT id, role, text, provider, model, verdict, flagged, flag_reason AS flagReason, ${iso("created_at")} AS at
    FROM DesktopTutorMessage WHERE conversation_id = ${id} ORDER BY id`));
  return r.map((x: any) => ({ id: Number(x.id), role: x.role, text: String(x.text), provider: x.provider, model: x.model, verdict: x.verdict ? JSON.parse(x.verdict) : null, flagged: !!Number(x.flagged), flagReason: x.flagReason ?? null, at: x.at }));
}
