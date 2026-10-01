import { readFileSync, writeFileSync } from "fs";
import { vi } from "vitest";
import storageService from "../utils/fileServer";

/**
 * In-memory stand-in for the internal file-server (which doesn't run under test). Spies on
 * the real singleton rather than vi.mock — the suite runs with isolate:false, where a module
 * mock only works if no earlier file imported the module. streamTo honours Range like the
 * real file-server's sendFile.
 */
export function installFakeFileServer() {
  const store = new Map<string, Buffer>();
  vi.spyOn(storageService, "uploadFile").mockImplementation(async (data: Buffer | string, remotePath: string) => {
    store.set(remotePath, Buffer.isBuffer(data) ? data : readFileSync(data));
  });
  vi.spyOn(storageService, "downloadToBuffer").mockImplementation(async (remotePath: string) => {
    const buf = store.get(remotePath);
    if (!buf) throw new Error(`not stored: ${remotePath}`);
    return buf;
  });
  vi.spyOn(storageService, "downloadToFile").mockImplementation(async (remotePath: string, localPath: string) => {
    const buf = store.get(remotePath);
    if (!buf) throw new Error(`not stored: ${remotePath}`);
    writeFileSync(localPath, buf);
    return buf.length;
  });
  vi.spyOn(storageService, "fileExists").mockImplementation(async (remotePath: string) => store.has(remotePath));
  vi.spyOn(storageService, "deleteFile").mockImplementation(async (remotePath: string) => {
    store.delete(remotePath);
  });
  vi.spyOn(storageService, "streamTo").mockImplementation(async (res: any, remotePath: string, opts: any = {}) => {
    const buf = store.get(remotePath);
    if (!buf) {
      res.status(404).json({ success: false, message: "File not found in storage" });
      return;
    }
    res.setHeader("Content-Type", opts.contentType || "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (opts.filename) res.setHeader("Content-Disposition", `${opts.disposition || "inline"}; filename*=UTF-8''${encodeURIComponent(opts.filename)}`);
    const m = /^bytes=(\d*)-(\d*)$/.exec(opts.range || "");
    if (m) {
      const start = m[1] ? Number(m[1]) : buf.length - Number(m[2]);
      const end = m[1] && m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
      res.status(206).setHeader("Content-Range", `bytes ${start}-${end}/${buf.length}`);
      res.end(buf.subarray(start, end + 1));
      return;
    }
    res.status(200).end(buf);
  });
  return { store };
}
