import logger from "../utils/logger";
import { dowOfYmd, kigaliParts } from "./reminders/time";
import { sendWeeklyDigests } from "./families";
import { tenantJob } from "../tenancy/jobs";

/**
 * The weekly family summary: Friday from 16:30 (Kigali). Checked every 10
 * minutes; FamilyDigestLog makes each parent's summary go out once a week even
 * across restarts. FAMILY_DIGEST=false switches it off; tests never start it.
 */
export const startFamiliesScheduler = () => {
  if (process.env.FAMILY_DIGEST === "false") return;
  // Per school: its own Friday 16:30 (tenant timezone); tenantJob locks per (job, tid).
  const tick = tenantJob("families-weekly", async (tenant) => {
    const at = kigaliParts(new Date());
    if (dowOfYmd(at.ymd) !== 5 || at.minutes < 16 * 60 + 30) return;
    try {
      const r = await sendWeeklyDigests();
      if (r.sent) logger.info(`[families] t${tenant.tid} weekly summary ${r.week}: ${r.sent} parent(s)`);
    } catch (error) {
      logger.error("[families] weekly summary failed", { error, tid: tenant.tid });
    }
  });
  setTimeout(() => void tick(), 90_000).unref();
  setInterval(() => void tick(), 10 * 60_000).unref();
};
