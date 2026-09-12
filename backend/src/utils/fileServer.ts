import logger from "./logger";

// Drop-in replacement for the old FTP-backed utils/ftp.ts, same method
// names/signatures, so every caller (documentController, curriculumController,
// lessonNoteController) needed zero changes beyond the import line. Talks to
// the internal file-server service over the loopback interface (both run on
// the same EC2 box) rather than the public cdn.amashuri.com domain, since
// there's no reason for server-to-server calls to leave the box.

const FILE_SERVER_URL =
  process.env.FILE_SERVER_URL || "http://127.0.0.1:5004";
const FILE_SERVER_API_KEY = process.env.FILE_SERVER_API_KEY || "";

// Every path this backend passes to the file-server is namespaced under
// its own app folder so it can never collide with another app's files in
// the shared storage root.
const NAMESPACE = "nga_central_mis";

function namespaced(remotePath: string): string {
  return `${NAMESPACE}/${remotePath}`;
}

async function request(
  urlPath: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${FILE_SERVER_URL}${urlPath}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "X-API-Key": FILE_SERVER_API_KEY,
    },
  });
  return res;
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

    const res = await request("/files", { method: "POST", body: form });
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
    const res = await request(
      `/files?path=${encodeURIComponent(namespaced(remotePath))}`,
    );
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

  async deleteFile(remotePath: string): Promise<void> {
    const res = await request(
      `/files?path=${encodeURIComponent(namespaced(remotePath))}`,
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to delete file: ${res.status}`);
    }
    logger.info(`File deleted: ${remotePath}`);
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
      const res = await request(
        `/files/exists?path=${encodeURIComponent(namespaced(remotePath))}`,
      );
      if (!res.ok) return false;
      const data = (await res.json()) as { exists: boolean };
      return data.exists;
    } catch (error) {
      logger.error("file-server exists check failed:", error);
      return false;
    }
  }
}

export default new FileServerService();
