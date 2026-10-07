import logger from "../utils/logger";
import { dowOfYmd, kigaliParts } from "./reminders/time";
import { sendWeeklyDigests } from "./families";

/**
 * The weekly family summary: Friday from 16:30 (Kigali). Checked every 10
 * minutes; FamilyDigestLog makes each parent's summary go out once a week even
 * across restarts. FAMILY_DIGEST=false switches it off; tests never start it.
 */
let running = false;
export const startFamiliesScheduler = () => {
  if (process.env.FAMILY_DIGEST === "false") return;
  const tick = async () => {
    if (running) return;
    const at = kigaliParts(new Date());
    if (dowOfYmd(at.ymd) !== 5 || at.minutes < 16 * 60 + 30) return;
    running = true;
    try {
      const r = await sendWeeklyDigests();
      if (r.sent) logger.info(`[families] weekly summary ${r.week}: ${r.sent} parent(s)`);
    } catch (error) {
      logger.error("[families] weekly summary failed", { error });
    } finally {
      running = false;
    }
  };
  setTimeout(() => void tick(), 90_000).unref();
  setInterval(() => void tick(), 10 * 60_000).unref();
};
