import { and, count, eq, gte } from "drizzle-orm";
import { db } from "../../db";
import { AIUsageLog, UserProfile } from "../../db/schema";
import { perMinute } from "../../middleware/rateLimit";
import { kigaliInstant, kigaliParts } from "../reminders/time";

/**
 * NGA Desktop "Ask AI" (docs/TOOLS_HUB_IMPLEMENTATION_PLAN.md §5.6, decision D1):
 * teachers, staff and admins get the assistant; students get the AI Tutor (tutor
 * mode, answer/safety check, safeguarding review: services/desktop/tutor.ts);
 * parents later.
 */
export const FEATURE = "desktop-assistant";

export type AssistantPersona = "teacher" | "staff" | "admin" | "student" | "parent";

export const persona = (userType: string | null | undefined): AssistantPersona => {
  switch (String(userType ?? "").trim().toUpperCase()) {
    case "STUDENT": return "student";
    case "PARENT": return "parent";
    case "TEACHER": return "teacher";
    case "ADMIN": return "admin";
    default: return "staff";
  }
};

/** Who may use it now; null = allowed. Students get the AI Tutor (services/desktop/tutor.ts). */
export const blockedReason = (p: AssistantPersona): "PARENTS_SOON" | null => (p === "parent" ? "PARENTS_SOON" : null);

const envInt = (k: string, d: number) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d;
};

/** Messages per person per Kigali day (free quotas are shared by the whole school). */
export const dailyLimit = (p: AssistantPersona) =>
  p === "admin" ? envInt("AI_ASSISTANT_DAILY_ADMIN", 60) : envInt("AI_ASSISTANT_DAILY_STAFF", 40);

/** Bursts: at most 8 messages a minute per person. */
export const burst = perMinute(8);

export async function loadPersona(userId: number): Promise<{ persona: AssistantPersona; firstName: string }> {
  const [row] = await db
    .select({ user_type: UserProfile.user_type, first_name: UserProfile.first_name })
    .from(UserProfile)
    .where(eq(UserProfile.user_id, userId))
    .limit(1);
  return { persona: persona(row?.user_type), firstName: (row?.first_name ?? "").trim() };
}

export async function usedToday(userId: number, now = new Date()): Promise<number> {
  const start = kigaliInstant(kigaliParts(now).ymd, 0);
  const [row] = await db
    .select({ n: count() })
    .from(AIUsageLog)
    .where(and(eq(AIUsageLog.actor_user_id, userId), eq(AIUsageLog.feature, FEATURE), eq(AIUsageLog.ok, 1), gte(AIUsageLog.occurred_at, start)));
  return Number(row?.n ?? 0);
}

/** The server-side instructions; never sent by the desktop. */
export function systemPrompt(p: AssistantPersona, firstName: string, now = new Date()): string {
  const who =
    p === "teacher"
      ? "a teacher"
      : p === "admin"
        ? "a member of the school's leadership or administration"
        : "a member of staff";
  return [
    `You are NGA Assistant, the AI helper built into NGA Desktop at New Generation Academy (NGA), a secondary school in Rwanda (S1–S6, Rwandan Competence-Based Curriculum).`,
    `You are talking with ${firstName ? `${firstName}, ` : ""}${who}. Today is ${kigaliParts(now).ymd} (Kigali).`,
    `Help with teaching and school work: lesson ideas and starters, explanations, quiz and exam questions with answer keys, rubrics, feedback comments, differentiation, emails and letters (to parents, colleagues, partners), summaries, translations between English, French and Kinyarwanda, and spreadsheet formulas.`,
    `Answer in the language of the question unless asked otherwise. Be concise and practical; use short paragraphs, lists and tables in Markdown. Write maths with LaTeX between $…$ (inline) or $$…$$ (display).`,
    `When unsure, say so; never invent facts, laws, statistics or citations. For Kinyarwanda, keep it simple and give key terms in English too.`,
    `Do not ask for or repeat personal information about students (full names with marks, health, family details). If such details appear, work with them minimally and remind the user to anonymise.`,
  ].join("\n");
}
