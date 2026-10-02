import logger from "../../utils/logger";
import { dowOfYmd, kigaliParts } from "../reminders/time";
import { autoCloseUnmarked } from "./admin";
import { now } from "./common";
import { morningDigest, registerReminders, weeklyDigests } from "./digests";
import { evaluateEscalations } from "./escalation";
import { notifyEscalations, registerOfficeHoursNotifier } from "./notify";
import { reconcileOfficeHours } from "./reconcile";
import { ensureAllSessions } from "./sessions";
import { expireTransfers } from "./transfers";

/**
 * Office-hours background jobs (plan §7.4). One minute tick in this single
 * pm2 process; each job decides from Kigali time whether it is due and runs
 * once per day/week (in-memory). Every job is idempotent and keyed, so a
 * restart that repeats one only refreshes notices. OFFICE_HOURS_SCHEDULER=false
 * switches it off; tests never start it.
 */
const lastRun = new Map<string, string>();
let running = false;

const once = async (key: string, period: string, fn: () => Promise<unknown>) => {
  if (lastRun.get(key) === period) return;
  lastRun.set(key, period);
  try {
    const result = await fn();
    logger.info(`[office-hours] ${key}`, { result });
  } catch (error) {
    logger.error(`[office-hours] ${key} failed`, { error });
  }
};

export const tick = async () => {
  if (running) return;
  running = true;
  try {
    const at = kigaliParts(now());
    const hour = at.minutes / 60;
    const six = `${at.ymd}:${Math.floor(hour / 6)}`;
    await once("materialise", six, () => ensureAllSessions());
    await once("transfers", `${at.ymd}:${Math.floor(hour)}`, () => expireTransfers());
    const weekday = dowOfYmd(at.ymd) >= 1 && dowOfYmd(at.ymd) <= 5;
    if (weekday && at.minutes >= 6 * 60 + 30) await once("morning-digest", at.ymd, () => morningDigest());
    try {
      await registerReminders();
    } catch (error) {
      logger.error("[office-hours] register reminders failed", { error });
    }
    if (at.minutes >= 18 * 60 + 30) {
      await once("escalations", at.ymd, async () => {
        const created = await evaluateEscalations();
        await notifyEscalations(created);
        return created.length;
      });
    }
    if (at.minutes >= 2 * 60) {
      await once("reconcile", at.ymd, () => reconcileOfficeHours());
      await once("auto-close", at.ymd, () => autoCloseUnmarked());
    }
    if (dowOfYmd(at.ymd) === 5 && at.minutes >= 17 * 60 + 30) await once("weekly-digest", at.ymd, () => weeklyDigests());
  } finally {
    running = false;
  }
};

export const startOfficeHoursScheduler = () => {
  registerOfficeHoursNotifier();
  setTimeout(() => void tick(), 40_000).unref();
  setInterval(() => void tick(), 60_000).unref();
};
