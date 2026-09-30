import crypto from "crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "../../db";
import { ReminderJob, TelegramLink, TelegramLinkCode } from "../../db/reminderSchema";
import logger from "../../utils/logger";
import { apiUrl, appUrl } from "./webPush";

/**
 * Telegram bot channel (REMINDERS_SOLUTION_PROPOSAL.md §6.4) -- free, native
 * push on every phone and desktop, including iPhones without the installed
 * app and computers whose browser is closed.
 *
 * Setup (once): create a bot with @BotFather, then set on the API server
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME (without @),
 *   TELEGRAM_WEBHOOK_SECRET (random, 1-256 chars of A-Za-z0-9_-).
 * On start the API registers its webhook (REMINDERS_API_URL + /reminders/telegram/webhook).
 * Without the token the channel simply reports itself unavailable.
 */

export interface TelegramConfig {
  token: string;
  username: string;
  webhookSecret: string;
}

export const telegramConfig = (): TelegramConfig | null => {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!token || !username || !webhookSecret) return null;
  return { token, username, webhookSecret };
};

export type TelegramCall = (method: string, body: Record<string, unknown>) => Promise<any>;

/** The real Bot API call. Tests inject a fake. */
export const callTelegram: TelegramCall = async (method, body) => {
  const cfg = telegramConfig();
  if (!cfg) throw new Error("Telegram is not configured");
  const res = await fetch(`https://api.telegram.org/bot${cfg.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!json.ok) {
    const err: any = new Error(json.description || `Telegram ${method} failed (${res.status})`);
    err.code = json.error_code ?? res.status;
    err.retryAfter = json.parameters?.retry_after;
    throw err;
  }
  return json.result;
};

let call: TelegramCall = callTelegram;
/** Test hook. */
export const setTelegramTransport = (fn: TelegramCall | null) => {
  call = fn ?? callTelegram;
};

// ─── pacing (https://core.telegram.org/bots/faq) ────────────────────────────
// Free bots may send about 30 messages/second overall and at most one per
// second to a single chat; stay under both.
const MIN_GAP_MS = 45; // ≈ 22 msg/s overall
const PER_CHAT_GAP_MS = 1100;
let nextSlot = 0;
const nextChatSlot = new Map<number, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const paced = async <T>(chatId: number, fn: () => Promise<T>): Promise<T> => {
  const now = Date.now();
  const chatReady = nextChatSlot.get(chatId) ?? 0;
  const at = Math.max(now, nextSlot, chatReady);
  nextSlot = at + MIN_GAP_MS;
  nextChatSlot.set(chatId, at + PER_CHAT_GAP_MS);
  if (nextChatSlot.size > 5000) for (const [id, t] of nextChatSlot) if (t < now) nextChatSlot.delete(id);
  if (at > now) await sleep(at - now);
  return fn();
};

/** Longest 429 back-off we wait for inline before giving up on this reminder. */
const MAX_RETRY_AFTER_S = 30;

// ─── linking ─────────────────────────────────────────────────────────────────
const LINK_TTL_MS = 15 * 60_000;

/** A one-time deep link: t.me/<bot>?start=<code>. */
export const createLinkCode = async (userId: number, now = new Date()) => {
  const cfg = telegramConfig();
  if (!cfg) return null;
  // Telegram start parameters allow up to 64 chars of A-Za-z0-9_-.
  const code = crypto.randomBytes(24).toString("base64url");
  await db.delete(TelegramLinkCode).where(eq(TelegramLinkCode.user_id, userId));
  await db.delete(TelegramLinkCode).where(lt(TelegramLinkCode.expires_at, now));
  await db.insert(TelegramLinkCode).values({ code, user_id: userId, expires_at: new Date(now.getTime() + LINK_TTL_MS) });
  return { code, url: `https://t.me/${cfg.username}?start=${code}`, expiresAt: new Date(now.getTime() + LINK_TTL_MS) };
};

export const getTelegramLink = async (userId: number) => {
  const [row] = await db.select().from(TelegramLink).where(eq(TelegramLink.user_id, userId)).limit(1);
  return row ?? null;
};

export const unlinkTelegram = async (userId: number, notify = true) => {
  const link = await getTelegramLink(userId);
  if (!link) return false;
  await db.delete(TelegramLink).where(eq(TelegramLink.user_id, userId));
  if (notify) {
    await call("sendMessage", { chat_id: link.chat_id, text: "NGA reminders are turned off for this chat. Link it again from the Reminders page any time." }).catch(() => undefined);
  }
  return true;
};

// ─── outgoing reminders ──────────────────────────────────────────────────────
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface TelegramDelivery {
  ok: boolean;
  gone: boolean;
  error?: string;
}

/** Send one reminder with "Got it" / "Snooze 5 min" buttons. */
export const sendTelegramReminder = async (
  chatId: number,
  job: { job_id: number; link: string | null; source_type: string },
  text: { title: string; body: string },
): Promise<TelegramDelivery> => {
  const buttons =
    job.source_type === "test"
      ? []
      : [[{ text: "✅ Got it", callback_data: `ack:${job.job_id}` }, { text: "⏰ Snooze 5 min", callback_data: `snooze:${job.job_id}` }]];
  const open = [{ text: "Open in NGA", url: appUrl(job.link) }];
  try {
    const message = {
      chat_id: chatId,
      text: `<b>${escapeHtml(text.title)}</b>${text.body ? `\n${escapeHtml(text.body)}` : ""}`,
      parse_mode: "HTML",
      // Bot API 7.0+: replaces the deprecated disable_web_page_preview.
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [...buttons, open] },
    };
    try {
      await paced(chatId, () => call("sendMessage", message));
    } catch (error: any) {
      // 429 Too Many Requests: Telegram says how long to wait -- once.
      const wait = Number(error?.retryAfter);
      if (error?.code !== 429 || !Number.isFinite(wait) || wait > MAX_RETRY_AFTER_S) throw error;
      await sleep(wait * 1000);
      await paced(chatId, () => call("sendMessage", message));
    }
    return { ok: true, gone: false };
  } catch (error: any) {
    // 403: the user blocked the bot or deleted the chat -- stop trying.
    return { ok: false, gone: error?.code === 403, error: String(error?.message || error).slice(0, 200) };
  }
};

// ─── incoming updates (webhook) ──────────────────────────────────────────────

export const verifyWebhookSecret = (given: string | undefined) => {
  const cfg = telegramConfig();
  if (!cfg || !given) return false;
  const a = Buffer.from(cfg.webhookSecret);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export interface UpdateActions {
  ack: (jobId: number, userId: number) => Promise<boolean>;
  snooze: (jobId: number, userId: number) => Promise<{ ok: boolean; reason?: string }>;
}

const reply = (chatId: number, text: string) => call("sendMessage", { chat_id: chatId, text }).catch(() => undefined);

/** Handle one Telegram update. Never throws: Telegram retries failed webhooks. */
export const handleTelegramUpdate = async (update: any, actions: UpdateActions, now = new Date()) => {
  try {
    const message = update?.message;
    if (message?.chat?.id && typeof message.text === "string") {
      const chatId = Number(message.chat.id);
      const [command, arg] = message.text.trim().split(/\s+/, 2);
      if (command === "/start" && arg) {
        const [code] = await db
          .select()
          .from(TelegramLinkCode)
          .where(and(eq(TelegramLinkCode.code, arg), gt(TelegramLinkCode.expires_at, now)))
          .limit(1);
        if (!code) {
          await reply(chatId, "That link has expired. Open Reminders in NGA and press “Connect Telegram” again.");
          return "expired";
        }
        await db.delete(TelegramLinkCode).where(eq(TelegramLinkCode.code, arg));
        // One chat per user, and one user per chat (a shared phone relinks).
        await db.delete(TelegramLink).where(eq(TelegramLink.chat_id, chatId));
        const values = { user_id: code.user_id, chat_id: chatId, username: message.from?.username ?? null, linked_at: now };
        await db.insert(TelegramLink).values(values).onDuplicateKeyUpdate({ set: { chat_id: chatId, username: values.username, linked_at: now } });
        await reply(chatId, "✅ Connected. NGA will remind you here before lessons, quizzes and deadlines. Send /stop to turn it off.");
        return "linked";
      }
      if (command === "/stop") {
        const [link] = await db.select().from(TelegramLink).where(eq(TelegramLink.chat_id, chatId)).limit(1);
        if (link) await unlinkTelegram(link.user_id);
        else await reply(chatId, "This chat isn't connected to NGA.");
        return "stopped";
      }
      if (command === "/start") {
        await reply(chatId, "Hi! To get NGA reminders here, open Reminders in NGA and press “Connect Telegram”.");
        return "hello";
      }
      return "ignored";
    }

    const cb = update?.callback_query;
    if (cb?.id && typeof cb.data === "string") {
      const chatId = Number(cb.message?.chat?.id);
      const [action, idText] = cb.data.split(":");
      const jobId = Number(idText);
      const [link] = await db.select().from(TelegramLink).where(eq(TelegramLink.chat_id, chatId)).limit(1);
      const [job] = Number.isInteger(jobId)
        ? await db.select({ user_id: ReminderJob.user_id }).from(ReminderJob).where(eq(ReminderJob.job_id, jobId)).limit(1)
        : [];
      // A button only works from the chat linked to the reminder's owner.
      if (!link || !job || job.user_id !== link.user_id) {
        await call("answerCallbackQuery", { callback_query_id: cb.id, text: "This reminder isn't yours." }).catch(() => undefined);
        return "rejected";
      }
      let text = "Done";
      if (action === "ack") {
        await actions.ack(jobId, link.user_id);
        text = "Marked as seen ✅";
      } else if (action === "snooze") {
        const result = await actions.snooze(jobId, link.user_id);
        text = result.ok ? "Snoozed for 5 minutes ⏰" : "Too late to snooze — it's about to start";
      }
      await call("answerCallbackQuery", { callback_query_id: cb.id, text }).catch(() => undefined);
      if (cb.message?.message_id) {
        await call("editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: cb.message.message_id,
          reply_markup: { inline_keyboard: [[{ text, callback_data: "noop" }]] },
        }).catch(() => undefined);
      }
      return action;
    }
    return "ignored";
  } catch (error) {
    logger.error("[reminders] telegram update failed", { error });
    return "error";
  }
};

/** Register the webhook and commands (idempotent; called on start). */
export const ensureTelegramWebhook = async () => {
  const cfg = telegramConfig();
  if (!cfg) return false;
  await call("setWebhook", {
    url: apiUrl("/reminders/telegram/webhook"),
    secret_token: cfg.webhookSecret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
  await call("setMyCommands", {
    commands: [
      { command: "start", description: "Connect NGA reminders" },
      { command: "stop", description: "Turn NGA reminders off here" },
    ],
  }).catch(() => undefined);
  logger.info("[reminders] telegram webhook registered");
  return true;
};
