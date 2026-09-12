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
server.headersTimeout = 60000;
server.keepAliveTimeout = 65000;
