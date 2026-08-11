import dotenv from "dotenv";
import path from "path";
// Resolve .env relative to this file, not process.cwd() -- pm2 restarts can
// run with a different working directory, which otherwise makes dotenv
// silently find nothing (bit us hard on the other two services already).
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import express from "express";
import cors from "cors";
import fs from "fs";
import config from "./config";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import filesRouter from "./routes/files";

fs.mkdirSync(config.storageRoot, { recursive: true });

const app = express();

app.use(
  cors({
    origin: config.corsOrigin.length ? config.corsOrigin : false,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ success: true, message: "file-server healthy" });
});

app.use("/files", apiKeyAuth, filesRouter);

// Multer errors (e.g. file too large) land here rather than the route's
// try/catch since they're thrown by the upload middleware itself.
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json({ success: false, message: "File exceeds maximum size" });
    }
    console.error(err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  },
);

app.listen(config.port, () => {
  console.log(`file-server listening on port ${config.port}`);
  console.log(`storage root: ${config.storageRoot}`);
});
