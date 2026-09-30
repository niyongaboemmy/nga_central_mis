import logger from "../../utils/logger";
import { dispatchDue } from "./dispatcher";
import { expandAll } from "./expander";
import { loadVapidKeys } from "./webPush";
import { ensureTelegramWebhook } from "./telegram";
import { syncAllGoogleCalendars } from "./googleCalendar";

const DISPATCH_EVERY_MS = 60_000;
const EXPAND_EVERY_MS = 30 * 60_000;
/** Google has its own copy of each reminder; a slow full pass catches drift. */
const GOOGLE_EVERY_MS = 2 * 3_600_000;

let started = false;

/**
 * Starts the Reminder Hub loops. Each tick is awaited before the next can
 * run in this process (a slow tick never overlaps itself), and the claim
 * token in dispatchDue guards against a second process.
 */
export const startReminderScheduler = () => {
  if (started) return;
  started = true;
  loadVapidKeys();

  let dispatching = false;
  const dispatch = async () => {
    if (dispatching) return;
    dispatching = true;
    try {
      const { sent } = await dispatchDue();
      if (sent) logger.info(`[reminders] sent ${sent} reminder(s)`);
    } catch (error) {
      logger.error("[reminders] dispatch tick failed", { error });
    } finally {
      dispatching = false;
    }
  };

  let expanding = false;
  const expand = async () => {
    if (expanding) return;
    expanding = true;
    try {
      const { users, planned } = await expandAll();
      if (users) logger.info(`[reminders] planned ${planned} reminder(s) for ${users} user(s)`);
    } catch (error) {
      logger.error("[reminders] expand tick failed", { error });
    } finally {
      expanding = false;
    }
  };

  let googleSyncing = false;
  const googleSync = async () => {
    if (googleSyncing) return;
    googleSyncing = true;
    try {
      const synced = await syncAllGoogleCalendars();
      if (synced) logger.info(`[reminders] synced ${synced} Google calendar(s)`);
    } catch (error) {
      logger.error("[reminders] google sync tick failed", { error });
    } finally {
      googleSyncing = false;
    }
  };

  // Telegram needs to know where to deliver updates (idempotent).
  setTimeout(() => {
    ensureTelegramWebhook().catch((error) => logger.warn("[reminders] telegram webhook not registered", { data: { error: String(error?.message || error) } }));
  }, 5_000).unref();

  // Let the server finish booting (and other startup sweeps run) first.
  setTimeout(expand, 45_000).unref();
  setTimeout(dispatch, 50_000).unref();
  setInterval(dispatch, DISPATCH_EVERY_MS).unref();
  setInterval(expand, EXPAND_EVERY_MS).unref();
  setTimeout(googleSync, 90_000).unref();
  setInterval(googleSync, GOOGLE_EVERY_MS).unref();
  logger.info("[reminders] scheduler started");
};
