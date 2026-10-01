import express from "express";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import multer from "multer";
import mime from "mime-types";
import config from "../config";
import { resolveStoragePath, InvalidPathError } from "../utils/paths";

const router = express.Router();

// Streams the incoming file straight to its final destination on disk as
// it's received, instead of buffering the whole thing into memory first --
// the old memoryStorage() config meant a large upload sat fully in RAM
// (twice, counting the backend's own copy) before a single byte hit disk.
// This relies on the "path" field arriving before "file" in the multipart
// body (the backend's fileServer.ts client appends them in that order) so
// req.body.path is already populated when this destination callback fires.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        const relativePath = String(req.body.path || "");
        const fullPath = resolveStoragePath(relativePath);
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        (req as any)._resolvedUploadPath = fullPath;
        cb(null, dir);
      } catch (err) {
        cb(err as Error, "");
      }
    },
    filename: (req, _file, cb) => {
      const fullPath = (req as any)._resolvedUploadPath as string;
      cb(null, path.basename(fullPath));
    },
  }),
  limits: config.maxFileSize ? { fileSize: config.maxFileSize } : undefined,
});

function handlePathError(res: express.Response, err: unknown) {
  if (err instanceof InvalidPathError) {
    res.status(400).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

// GET /files/exists?path=...
router.get("/exists", async (req, res) => {
  try {
    const relativePath = String(req.query.path || "");
    const fullPath = resolveStoragePath(relativePath);
    const stat = await fsp.stat(fullPath).catch(() => null);
    res.json({ success: true, exists: !!stat && stat.isFile() });
  } catch (err) {
    if (!handlePathError(res, err)) throw err;
  }
});

// POST /files/mkdir  { path }
router.post("/mkdir", express.json(), async (req, res) => {
  try {
    const relativePath = String(req.body.path || "");
    const fullPath = resolveStoragePath(relativePath);
    await fsp.mkdir(fullPath, { recursive: true });
    res.json({ success: true });
  } catch (err) {
    if (!handlePathError(res, err)) throw err;
  }
});

// POST /files  multipart: path, file (in that order -- see the destination
// callback above). diskStorage has already written the file to its final
// location by the time this handler runs.
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const relativePath = String(req.body.path || "");
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    res.json({ success: true, path: relativePath, size: req.file.size });
  } catch (err) {
    if (!handlePathError(res, err)) throw err;
  }
});

// GET /files?path=...  -- streams the raw file
router.get("/", async (req, res) => {
  try {
    const relativePath = String(req.query.path || "");
    const fullPath = resolveStoragePath(relativePath);

    const stat = await fsp.stat(fullPath).catch(() => null);
    if (!stat || !stat.isFile()) {
      return res
        .status(404)
        .json({ success: false, message: "File not found" });
    }

    // sendFile handles Range (206 partial content), ETag and Last-Modified, so the
    // backend can stream audio/large PDFs page by page instead of the whole file.
    const contentType = mime.lookup(fullPath) || "application/octet-stream";
    res.sendFile(fullPath, { acceptRanges: true, dotfiles: "allow", headers: { "Content-Type": contentType } }, (err) => {
      if (err && !res.headersSent) res.status(500).json({ success: false, message: "Could not read file" });
    });
  } catch (err) {
    if (!handlePathError(res, err)) throw err;
  }
});

// DELETE /files?path=...  -- idempotent, matches the old ftp/local-storage
// delete semantics (deleting an already-absent file is not an error).
router.delete("/", async (req, res) => {
  try {
    const relativePath = String(req.query.path || "");
    const fullPath = resolveStoragePath(relativePath);

    await fsp.unlink(fullPath);
    res.json({ success: true });
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return res
        .status(404)
        .json({ success: false, message: "File not found" });
    }
    if (!handlePathError(res, err)) throw err;
  }
});

export default router;
