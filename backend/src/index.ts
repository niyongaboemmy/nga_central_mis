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

app.listen(config.port, () => {
  logger.info(
    `Server running on port ${config.port} in ${config.nodeEnv} mode`,
  );
});
