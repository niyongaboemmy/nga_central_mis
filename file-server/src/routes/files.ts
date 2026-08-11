import express from "express";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import multer from "multer";
import mime from "mime-types";
import config from "../config";
import { resolveStoragePath, InvalidPathError } from "../utils/paths";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSize },
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

// POST /files  multipart: file, path
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const relativePath = String(req.body.path || "");
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const fullPath = resolveStoragePath(relativePath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, req.file.buffer);

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

    const contentType = mime.lookup(fullPath) || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", stat.size);
    fs.createReadStream(fullPath).pipe(res);
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
