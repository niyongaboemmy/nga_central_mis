import dotenv from "dotenv";
import path from "path";
// Resolve .env relative to this file, not process.cwd() — pm2 restarts can
// run with a different working directory, which otherwise makes dotenv
// silently find nothing.
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import config from "./config";
import logger from "./utils/logger";
import app from "./app";

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});

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
  setTimeout(runSweeps, 30_000);
  setInterval(runSweeps, 6 * 60 * 60 * 1000).unref();
}
server.headersTimeout = 60000;
server.keepAliveTimeout = 65000;
