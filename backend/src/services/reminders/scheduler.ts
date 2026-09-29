import logger from "../../utils/logger";
import { dispatchDue } from "./dispatcher";
import { expandAll } from "./expander";
import { loadVapidKeys } from "./webPush";

const DISPATCH_EVERY_MS = 60_000;
const EXPAND_EVERY_MS = 30 * 60_000;

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

  // Let the server finish booting (and other startup sweeps run) first.
  setTimeout(expand, 45_000).unref();
  setTimeout(dispatch, 50_000).unref();
  setInterval(dispatch, DISPATCH_EVERY_MS).unref();
  setInterval(expand, EXPAND_EVERY_MS).unref();
  logger.info("[reminders] scheduler started");
};
