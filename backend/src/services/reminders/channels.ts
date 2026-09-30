import { and, eq, gt, inArray, isNull, lte, notInArray } from "drizzle-orm";
import { db } from "../../db";
import { User } from "../../db/schema";
import { ReminderJob } from "../../db/reminderSchema";
import logger from "../../utils/logger";
import { getPreferences } from "./preferences";
import { getTelegramLink, sendTelegramReminder, telegramConfig, unlinkTelegram } from "./telegram";
import { googleConfig, syncGoogleCalendar } from "./googleCalendar";
import { GoogleCalendarLink } from "../../db/reminderSchema";
import { appUrl } from "./webPush";

/**
 * The optional channels on top of in-app + Web Push (proposal §6):
 * - Telegram: every reminder, when the person linked a chat and left it on;
 * - email: only a *critical* reminder nobody acknowledged (opt-in);
 * - Google Calendar: a mirror of the plan, re-synced when things change.
 * Each is inert until its credentials are configured.
 */

export interface ExtraDelivery {
  channels: string[];
  errors: string[];
}

/** Telegram for one job (called by deliverJob). Never throws. */
export const deliverTelegram = async (
  job: { job_id: number; user_id: number; link: string | null; source_type: string },
  text: { title: string; body: string },
): Promise<ExtraDelivery> => {
  const out: ExtraDelivery = { channels: [], errors: [] };
  if (!telegramConfig()) return out;
  try {
    const link = await getTelegramLink(job.user_id);
    if (!link) return out;
    const prefs = await getPreferences(job.user_id);
    if (!prefs.channels.telegram && job.source_type !== "test") return out;
    const result = await sendTelegramReminder(Number(link.chat_id), job, text);
    if (result.ok) out.channels.push("telegram");
    else {
      out.errors.push(`telegram: ${result.error}`);
      // Blocked the bot or deleted the chat: stop trying.
      if (result.gone) await unlinkTelegram(job.user_id, false);
    }
  } catch (error: any) {
    out.errors.push(`telegram: ${String(error?.message || error).slice(0, 200)}`);
  }
  return out;
};

// ─── Email escalation ────────────────────────────────────────────────────────

/** How long a critical reminder may go unacknowledged before email. */
export const ESCALATE_AFTER_MS = 10 * 60_000;

export type EmailSender = (to: string, subject: string, html: string, text: string) => Promise<boolean>;
const realEmail: EmailSender = async (to, subject, html, text) => {
  const { default: emailService } = await import("../../utils/email");
  return emailService.sendEmail({ to, subject, html, text }, false);
};
let sendEmail: EmailSender = realEmail;
/** Test hook. */
export const setEmailSender = (fn: EmailSender | null) => {
  sendEmail = fn ?? realEmail;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const escalationEmail = (job: { title: string; body: string | null; link: string | null }, text: { title: string; body: string }) => {
  const url = appUrl(job.link);
  const subject = `Reminder: ${text.title}`.slice(0, 200);
  const plain = `${text.title}\n${text.body}\n\nOpen: ${url}\n\nYou get this email because a reminder marked important wasn't opened. Turn it off under Reminders → Channels.`;
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#0f172a">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin:0 0 8px">NGA reminder</p>
  <h1 style="font-size:20px;margin:0 0 8px">${esc(text.title)}</h1>
  ${text.body ? `<p style="margin:0 0 20px;color:#334155">${esc(text.body)}</p>` : ""}
  <a href="${esc(url)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Open in NGA</a>
  <p style="font-size:12px;color:#64748b;margin-top:24px">You get this email because a reminder marked important wasn't opened. Turn it off under Reminders → Channels.</p>
</div>`;
  return { subject, html, text: plain };
};

/**
 * Critical reminders sent more than ESCALATE_AFTER_MS ago, still not
 * acknowledged, whose event hasn't started: email once (if the person opted
 * in). Every candidate is stamped `escalated_at` so it's looked at once.
 */
export const escalateUnacked = async (
  describe: (job: typeof ReminderJob.$inferSelect, now: Date) => { title: string; body: string },
  now = new Date(),
) => {
  const due = await db
    .select()
    .from(ReminderJob)
    .where(
      and(
        eq(ReminderJob.critical, 1),
        eq(ReminderJob.status, "sent"),
        isNull(ReminderJob.acked_at),
        isNull(ReminderJob.escalated_at),
        lte(ReminderJob.sent_at, new Date(now.getTime() - ESCALATE_AFTER_MS)),
        gt(ReminderJob.event_start, now),
        notInArray(ReminderJob.source_type, ["test", "briefing"]),
      ),
    )
    .limit(50);
  if (due.length === 0) return 0;

  const users = await db
    .select({ user_id: User.user_id, email: User.email })
    .from(User)
    .where(inArray(User.user_id, Array.from(new Set(due.map((j) => j.user_id)))));
  const emailOf = new Map(users.map((u: any) => [Number(u.user_id), u.email as string]));

  let sent = 0;
  for (const job of due) {
    let delivered = false;
    try {
      const prefs = await getPreferences(job.user_id);
      const to = emailOf.get(job.user_id);
      if (prefs.channels.email && to && /@/.test(to)) {
        const mail = escalationEmail(job, describe(job, now));
        delivered = await sendEmail(to, mail.subject, mail.html, mail.text);
      }
    } catch (error) {
      logger.warn("[reminders] escalation email failed", { data: { jobId: job.job_id, error: String(error) } });
    }
    await db
      .update(ReminderJob)
      .set({
        escalated_at: now,
        ...(delivered ? { channels: [job.channels, "email"].filter(Boolean).join(",").slice(0, 100) } : {}),
      })
      .where(eq(ReminderJob.job_id, job.job_id));
    if (delivered) sent++;
  }
  return sent;
};

// ─── Google Calendar re-sync ─────────────────────────────────────────────────

const pending = new Set<number>();
let timer: NodeJS.Timeout | null = null;
/** Coalesce bursts (a teacher editing a quiz several times) into one sync. */
const GOOGLE_DEBOUNCE_MS = 20_000;

/** Re-sync the Google calendars of these users soon, if they connected one. */
export const syncGoogleSoon = (userIds: number[]) => {
  if (!googleConfig() || process.env.NODE_ENV === "test") return;
  for (const id of userIds) if (Number.isInteger(id) && id > 0) pending.add(id);
  if (timer || pending.size === 0) return;
  timer = setTimeout(async () => {
    timer = null;
    const batch = Array.from(pending);
    pending.clear();
    try {
      const linked = await db
        .select({ user_id: GoogleCalendarLink.user_id })
        .from(GoogleCalendarLink)
        .where(and(eq(GoogleCalendarLink.status, "active"), inArray(GoogleCalendarLink.user_id, batch)));
      for (const { user_id } of linked) await syncGoogleCalendar(Number(user_id));
    } catch (error) {
      logger.error("[reminders] google re-sync failed", { error });
    }
  }, GOOGLE_DEBOUNCE_MS);
  timer.unref?.();
};
