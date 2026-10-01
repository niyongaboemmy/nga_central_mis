import { spawn, execFile } from "child_process";
import { promises as fsp, existsSync } from "fs";
import os from "os";
import path from "path";
import logger from "../../../utils/logger";

/**
 * Office → PDF conversion, out of process (LESSON_STUDIO plan §10.3, decision D1: on the same
 * EC2 host as the apps). One LibreOffice process per job, one job at a time (the job queue
 * runs previews serially), niced, killed on a timeout or when its memory grows past a cap.
 * Gotenberg is supported behind GOTENBERG_URL for a later move off the host; it is not
 * deployed now.
 */

export interface Converter {
  name: string;
  /** Converts `inputPath` (an office file) to PDF; resolves with the PDF's path in `outDir`. */
  convertToPdf(inputPath: string, outDir: string): Promise<string>;
}

export class ConversionError extends Error {
  constructor(message: string, readonly userMessage: string) {
    super(message);
  }
}

const TIMEOUT_MS = () => Number(process.env.PREVIEW_TIMEOUT_MS) || 120_000;
const MAX_RSS_MB = () => Number(process.env.PREVIEW_MAX_RSS_MB) || 800;

/** Sum of resident memory (MB) of every process in a process group. */
function groupRssMb(pgid: number): Promise<number> {
  return new Promise((resolve) => {
    execFile("ps", ["-eo", "pgid=,rss="], (err, out) => {
      if (err) return resolve(0);
      let kb = 0;
      for (const line of out.split("\n")) {
        const [g, r] = line.trim().split(/\s+/).map(Number);
        if (g === pgid && Number.isFinite(r)) kb += r;
      }
      resolve(kb / 1024);
    });
  });
}

const killGroup = (pid: number) => {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* already gone */
  }
};

export class SofficeConverter implements Converter {
  name = "soffice";
  constructor(private readonly bin: string) {}

  async convertToPdf(inputPath: string, outDir: string): Promise<string> {
    // A private profile per job: soffice allows one running instance per profile.
    const profile = await fsp.mkdtemp(path.join(os.tmpdir(), "lo-"));
    const args = [
      "-n",
      "10",
      this.bin,
      `-env:UserInstallation=file://${profile}`,
      "--headless",
      "--norestore",
      "--nolockcheck",
      "--convert-to",
      "pdf",
      "--outdir",
      outDir,
      inputPath,
    ];
    try {
      await new Promise<void>((resolve, reject) => {
        // `nice` keeps the apps' API requests ahead of a conversion on a shared box.
        const child = spawn("nice", args, { detached: true, stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        child.stderr?.on("data", (d) => (stderr += String(d).slice(0, 2000)));
        let killedFor: "timeout" | "memory" | null = null;
        const timer = setTimeout(() => {
          killedFor = "timeout";
          killGroup(child.pid!);
        }, TIMEOUT_MS());
        const watchdog = setInterval(async () => {
          if (!child.pid) return;
          const mb = await groupRssMb(child.pid);
          if (mb > MAX_RSS_MB()) {
            killedFor = "memory";
            killGroup(child.pid);
          }
        }, 1000);
        child.on("error", (e) => {
          clearTimeout(timer);
          clearInterval(watchdog);
          reject(e);
        });
        child.on("exit", (code) => {
          clearTimeout(timer);
          clearInterval(watchdog);
          if (killedFor === "timeout") return reject(new ConversionError("soffice timed out", "This file took too long to convert for preview. Students can still download it."));
          if (killedFor === "memory") return reject(new ConversionError("soffice exceeded the memory cap", "This file is too complex to preview. Students can still download it."));
          if (code !== 0) return reject(new ConversionError(`soffice exited ${code}: ${stderr}`, "This file couldn't be converted for preview. Students can still download it."));
          resolve();
        });
      });
      const pdf = path.join(outDir, `${path.basename(inputPath, path.extname(inputPath))}.pdf`);
      if (!existsSync(pdf)) throw new ConversionError("soffice produced no PDF", "This file couldn't be converted for preview. Students can still download it.");
      return pdf;
    } finally {
      await fsp.rm(profile, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export class GotenbergConverter implements Converter {
  name = "gotenberg";
  constructor(private readonly url: string) {}

  async convertToPdf(inputPath: string, outDir: string): Promise<string> {
    const form = new FormData();
    form.append("files", await (await import("fs")).openAsBlob(inputPath), path.basename(inputPath));
    const res = await fetch(`${this.url.replace(/\/$/, "")}/forms/libreoffice/convert`, { method: "POST", body: form, signal: AbortSignal.timeout(TIMEOUT_MS()) });
    if (!res.ok) throw new ConversionError(`gotenberg ${res.status}`, "This file couldn't be converted for preview. Students can still download it.");
    const out = path.join(outDir, `${path.basename(inputPath, path.extname(inputPath))}.pdf`);
    await fsp.writeFile(out, Buffer.from(await res.arrayBuffer()));
    return out;
  }
}

let cached: Converter | null | undefined;
let testOverride: Converter | null | undefined;

/** The configured converter, or null when the host has none (the browser falls back). */
export function getConverter(): Converter | null {
  if (testOverride !== undefined) return testOverride;
  if (cached !== undefined) return cached;
  if (process.env.GOTENBERG_URL) cached = new GotenbergConverter(process.env.GOTENBERG_URL);
  else {
    const candidates = [process.env.SOFFICE_PATH, "/usr/bin/soffice", "/usr/local/bin/soffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"].filter(Boolean) as string[];
    const bin = candidates.find((c) => existsSync(c));
    cached = bin ? new SofficeConverter(bin) : null;
  }
  if (!cached) logger.info("[files] no document converter (LibreOffice) found — office previews use the browser fallback");
  return cached;
}

/** Tests only. `undefined` restores auto-detection. */
export function setConverterForTests(c: Converter | null | undefined): void {
  testOverride = c;
}

/** First page as a PNG thumbnail (poppler's pdftoppm). Null when poppler isn't installed. */
export async function pdfThumbnail(pdfPath: string, outDir: string): Promise<string | null> {
  const bin = [process.env.PDFTOPPM_PATH, "/usr/bin/pdftoppm", "/usr/local/bin/pdftoppm", "/opt/homebrew/bin/pdftoppm"].filter(Boolean).find((c) => existsSync(c!));
  if (!bin) return null;
  const prefix = path.join(outDir, "thumb");
  await new Promise<void>((resolve, reject) =>
    execFile(bin, ["-png", "-f", "1", "-l", "1", "-scale-to", "480", "-singlefile", pdfPath, prefix], { timeout: 30_000 }, (err) => (err ? reject(err) : resolve())),
  );
  const out = `${prefix}.png`;
  return existsSync(out) ? out : null;
}
