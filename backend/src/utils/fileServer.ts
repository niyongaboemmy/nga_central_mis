import logger from "./logger";
import { AppError } from "../middleware/errorHandler";
import { PRIMARY_TENANT_ID, tenantPathFor } from "../vendor/nga-tenancy";
import { resolveDataTid } from "../tenancy/context";

// Drop-in replacement for the old FTP-backed utils/ftp.ts, same method
// names/signatures, so every caller (documentController, curriculumController,
// lessonNoteController) needed zero changes beyond the import line. Talks to
// the internal file-server service over the loopback interface (both run on
// the same EC2 box) rather than the public cdn.amashuri.com domain, since
// there's no reason for server-to-server calls to leave the box.

const FILE_SERVER_URL =
  process.env.FILE_SERVER_URL || "http://127.0.0.1:5004";
const FILE_SERVER_API_KEY = process.env.FILE_SERVER_API_KEY || "";
// Upper bound on any single file-server call. Without it a stalled
// file-server leaves the API request (and the user's preview modal) hanging
// until the browser gives up; with it the caller gets a 504 it can show.
const FILE_SERVER_TIMEOUT_MS = parseInt(
  process.env.FILE_SERVER_TIMEOUT_MS || "30000",
  10,
);

// Every path this backend passes to the file-server is namespaced under
// its own app folder so it can never collide with another app's files in
// the shared storage root -- and, with multi-tenancy (MIS-A14, contract §8),
// under the school: `nga_central_mis/t/<tid>/<remotePath>`. The remote paths
// callers store in the database stay the same ("avatars/12", "<userId>/x.pdf");
// only the storage location carries the tenant, so ids that repeat across
// school databases can never collide in storage.
const NAMESPACE = "nga_central_mis";

/** The school the current request/job stores files for. */
const storageTid = () => resolveDataTid("file storage");

/** Where a new write goes: nga_central_mis/t/<tid>/<remotePath>. */
export function namespaced(remotePath: string, tid: number = storageTid()): string {
  return tenantPathFor(tid, NAMESPACE, remotePath);
}

/** The pre-tenancy location (tenant 1's existing files). */
export function legacyNamespaced(remotePath: string): string {
  return `${NAMESPACE}/${remotePath}`;
}

/**
 * Where a read may find the file, in order: the tenant path, then -- for the
 * primary tenant only, while FILE_SERVER_LEGACY_READ is not "false" -- the old
 * un-tenanted path, so every file stored before tenancy keeps resolving. Other
 * schools never fall back: the legacy tree is NGA's.
 */
export function readCandidates(remotePath: string, tid: number = storageTid()): string[] {
  const out = [namespaced(remotePath, tid)];
  if (tid === PRIMARY_TENANT_ID && process.env.FILE_SERVER_LEGACY_READ !== "false") out.push(legacyNamespaced(remotePath));
  return out;
}

async function request(
  urlPath: string,
  init: RequestInit = {},
  { timeout = true }: { timeout?: boolean } = {},
): Promise<Response> {
  try {
    return await fetch(`${FILE_SERVER_URL}${urlPath}`, {
      ...init,
      signal: timeout ? AbortSignal.timeout(FILE_SERVER_TIMEOUT_MS) : undefined,
      headers: {
        ...(init.headers || {}),
        "X-API-Key": FILE_SERVER_API_KEY,
      },
    });
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      logger.error(
        `file-server did not respond within ${FILE_SERVER_TIMEOUT_MS}ms: ${urlPath}`,
      );
      throw new AppError("File storage did not respond in time", 504);
    }
    throw err;
  }
}

class FileServerService {
  async uploadFile(
    localPathOrBuffer: string | Buffer,
    remotePath: string,
  ): Promise<void> {
    // A string is a path to a file already sitting on disk (large uploads are
    // streamed there by multer's diskStorage so we never hold two full
    // in-memory copies at once). fs.openAsBlob() opens a Blob backed by the
    // file handle -- undici/fetch reads it lazily as the request body is
    // sent, rather than buffering the whole file into memory up front.
    const filePart =
      typeof localPathOrBuffer === "string"
        ? await (await import("fs")).openAsBlob(localPathOrBuffer)
        : new Blob([new Uint8Array(localPathOrBuffer)]);

    const form = new FormData();
    // "path" must be appended before "file": the file-server streams the
    // upload straight to its final destination via multer diskStorage, and
    // that destination is resolved from this field, which multer can only
    // see if it arrives before the file part in the multipart body.
    form.append("path", namespaced(remotePath));
    form.append("file", filePart, remotePath.split("/").pop());

    const res = await request(
      "/files",
      { method: "POST", body: form },
      { timeout: false },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error("file-server upload failed:", body);
      throw new Error(`Failed to upload file: ${res.status} ${body}`);
    }
    logger.info(`File uploaded: ${remotePath}`);
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const buffer = await this.downloadToBuffer(remotePath);
    const fs = await import("fs");
    const path = await import("path");
    const localDir = path.dirname(localPath);
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(localPath, buffer);
    logger.info(`File downloaded: ${remotePath}`);
  }

  async downloadToBuffer(remotePath: string): Promise<Buffer> {
    const res = await this.firstFound(remotePath);
    if (!res.ok) {
      throw new Error(`Failed to download file: ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) {
      throw new Error("Downloaded buffer is empty");
    }
    return buffer;
  }

  /**
   * Streams a stored file to an HTTP response without buffering it (LESSON_STUDIO plan G9):
   * the Range header is forwarded, so audio can seek and pdf.js can fetch pages lazily,
   * and a 200 MB deck never sits in this process's memory. Only the wait for the
   * file-server's *headers* is time-limited; the body streams for as long as it takes.
   */
  async streamTo(
    res: import("express").Response,
    remotePath: string,
    opts: {
      range?: string;
      contentType?: string;
      filename?: string;
      disposition?: "inline" | "attachment";
      cacheSeconds?: number;
    } = {},
  ): Promise<void> {
    let upstream!: Response;
    for (const candidate of readCandidates(remotePath)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FILE_SERVER_TIMEOUT_MS);
      try {
        upstream = await fetch(`${FILE_SERVER_URL}/files?path=${encodeURIComponent(candidate)}`, {
          signal: controller.signal,
          headers: { "X-API-Key": FILE_SERVER_API_KEY, ...(opts.range ? { Range: opts.range } : {}) },
        });
      } catch (err: any) {
        clearTimeout(timer);
        if (err?.name === "AbortError") throw new AppError("File storage did not respond in time", 504);
        throw err;
      }
      clearTimeout(timer);
      if (upstream.status !== 404) break;
    }
    if (upstream.status === 404) throw new AppError("File not found in storage", 404);
    if (upstream.status === 416) {
      res.status(416).setHeader("Content-Range", upstream.headers.get("content-range") || "");
      res.end();
      return;
    }
    if (!upstream.ok || !upstream.body) throw new Error(`Failed to stream file: ${upstream.status}`);

    res.status(upstream.status === 206 ? 206 : 200);
    res.setHeader("Content-Type", opts.contentType || upstream.headers.get("content-type") || "application/octet-stream");
    for (const h of ["content-length", "content-range", "last-modified", "etag"]) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", `private, max-age=${opts.cacheSeconds ?? 0}`);
    if (opts.filename) {
      res.setHeader(
        "Content-Disposition",
        `${opts.disposition || "inline"}; filename*=UTF-8''${encodeURIComponent(opts.filename)}`,
      );
    }
    const { Readable } = await import("stream");
    const body = Readable.fromWeb(upstream.body as any);
    await new Promise<void>((resolve, reject) => {
      body.on("error", reject);
      res.on("close", () => {
        body.destroy();
        resolve();
      });
      body.pipe(res).on("finish", resolve);
    });
  }

  /** Streams a stored file to a local path (for conversion / text extraction), never buffering it. */
  async downloadToFile(remotePath: string, localPath: string): Promise<number> {
    const res = await this.firstFound(remotePath, { timeout: false });
    if (!res.ok || !res.body) throw new Error(`Failed to download file: ${res.status}`);
    const fs = await import("fs");
    const { Readable } = await import("stream");
    const { pipeline } = await import("stream/promises");
    await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(localPath));
    return (await fs.promises.stat(localPath)).size;
  }

  async deleteFile(remotePath: string): Promise<void> {
    // Every location the file may be in (tenant 1: the new and the legacy path).
    for (const candidate of readCandidates(remotePath)) {
      const res = await request(`/files?path=${encodeURIComponent(candidate)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        throw new Error(`Failed to delete file: ${res.status}`);
      }
    }
    logger.info(`File deleted: ${remotePath}`);
  }

  /** GET the first candidate location that exists (404 moves on to the next). */
  private async firstFound(remotePath: string, opts: { timeout?: boolean } = {}): Promise<Response> {
    let res!: Response;
    for (const candidate of readCandidates(remotePath)) {
      res = await request(`/files?path=${encodeURIComponent(candidate)}`, {}, opts);
      if (res.status !== 404) return res;
    }
    return res;
  }

  async createDirectory(remotePath: string): Promise<void> {
    const res = await request("/files/mkdir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: namespaced(remotePath) }),
    });
    if (!res.ok) {
      throw new Error(`Failed to create directory: ${res.status}`);
    }
    logger.info(`Directory created: ${remotePath}`);
  }

  async fileExists(remotePath: string): Promise<boolean> {
    try {
      for (const candidate of readCandidates(remotePath)) {
        const res = await request(`/files/exists?path=${encodeURIComponent(candidate)}`);
        if (!res.ok) continue;
        const data = (await res.json()) as { exists: boolean };
        if (data.exists) return true;
      }
      return false;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error("file-server exists check failed:", error);
      return false;
    }
  }
}

export default new FileServerService();
