import dotenv from "dotenv";
import path from "path";
// Resolve .env relative to this file, not process.cwd() — pm2 restarts can
// run with a different working directory, which otherwise makes dotenv
// silently find nothing.
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import config from "./config";
import logger from "./utils/logger";
import app from "./app";

// Graceful shutdown: flush buffered activity first (pm2 kill_timeout allows ~8 s).
const shutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  const done = () => process.exit(0);
  import("./services/activity/engine")
    .then((m) => Promise.race([m.flushOnShutdown(), new Promise((r) => setTimeout(r, 5_000))]))
    .then(done, done);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

const server = app.listen(config.port, () => {
  logger.info(
    `Server running on port ${config.port} in ${config.nodeEnv} mode`,
  );
});

// Node's default 5-minute socket inactivity timeout was aborting large
// document uploads (Materials tab, lesson notes, etc.) partway through on
// slow connections. Disabling it (0 = no timeout) lets those requests run
// as long as they need to; headersTimeout stays finite so a client that
// never sends headers can't hold a socket open forever.
server.timeout = 0;

// E-learning sweeps (ELEARNING_MODULE_IMPLEMENTATION_PLAN.md §3.2 / §3.6). Auto-publish is
// also applied lazily on every course read, so this only exists for notifications and to
// keep sections current while nobody is looking. Skipped under test.
if (config.nodeEnv !== "test") {
  const runSweeps = async () => {
    try {
      const { publishDueSections } = await import("./services/elearning/courseSeeding");
      const { sweepDueSoon, sweepEmptyPublishedSections } = await import("./services/elearning/courseNotifications");
      await publishDueSections();
      const due = await sweepDueSoon();
      const empty = await sweepEmptyPublishedSections();
      if (due || empty) logger.info(`[elearning] sweep: ${due} due-soon, ${empty} empty-week notifications`);
    } catch (error) {
      logger.error("[elearning] sweep failed", { error });
    }
  };
  // Live-presence sweep: expires watchers and keeps SSE streams warm.
  import("./services/elearning/livePresence").then((m) => m.startLiveSweep()).catch(() => undefined);
  setTimeout(runSweeps, 30_000);
  setInterval(runSweeps, 6 * 60 * 60 * 1000).unref();

  // Access control v2 (ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md): register
  // the MIS capability manifest, seed presets/rules (insert-only), then keep
  // rule-owned grants converged with placements once a day. Never throws;
  // ACCESS_V2_BOOTSTRAP=false switches it off.
  import("./services/access/registry")
    .then(async ({ ensureAccessRegistry, accessTablesPresent }) => {
      await ensureAccessRegistry();
      if (process.env.ACCESS_V2_BOOTSTRAP === "false") return;
      const reconcile = async () => {
        try {
          if (!(await accessTablesPresent())) return;
          const { syncRuleGrants } = await import("./services/access/ruleEngine");
          const r = await syncRuleGrants();
          if (r.created + r.ended + r.reactivated + r.repointed > 0) {
            logger.info(`[access] reconcile: +${r.created} ~${r.reactivated + r.repointed} -${r.ended}`);
          }
        } catch (error) {
          logger.error("[access] reconcile failed", { error });
        }
      };
      setTimeout(reconcile, 60_000);
      setInterval(reconcile, 24 * 60 * 60 * 1000).unref();
    })
    .catch(() => undefined);
}
// Platform activity engine (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §9): buffered writes,
// presence, sessions and rollups. Fails soft when migration 095 is absent.
// ACTIVITY_JOBS=false switches the timers off (collection still answers 202).
if (config.nodeEnv !== "test" && process.env.ACTIVITY_JOBS !== "false") {
  import("./services/activity/engine")
    .then(({ startActivityEngine }) => startActivityEngine())
    .catch((error) => logger.error("[activity] engine failed to start", { error }));
}
// Reminder Hub (REMINDERS_SOLUTION_PROPOSAL.md §4): a one-minute dispatcher
// plus a half-hourly re-plan of everyone who has reminders on. Both are
// idempotent and claim-guarded, so an overlapping tick or a second process
// can't double-send. REMINDERS_SCHEDULER=false switches both off.
if (config.nodeEnv !== "test" && process.env.REMINDERS_SCHEDULER !== "false") {
  import("./services/reminders/scheduler")
    .then(({ startReminderScheduler }) => startReminderScheduler())
    .catch((error) => logger.error("[reminders] scheduler failed to start", { error }));
}
server.headersTimeout = 60000;
server.keepAliveTimeout = 65000;
