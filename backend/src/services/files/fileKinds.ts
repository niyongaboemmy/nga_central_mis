import { promises as fsp } from "fs";

/**
 * What files a teacher may put on a week, how big, and how each is previewed
 * (LESSON_STUDIO plan §10.1). The frontend mirrors KIND_BY_EXT in lib/files/fileKinds.ts —
 * keep them in step (both are covered by tests on the same table).
 *
 * Videos are refused (decision D4: no video uploads — use a YouTube/Vimeo link).
 */

export type FileKind = "pdf" | "word" | "slides" | "sheet" | "image" | "audio" | "text" | "code" | "markdown" | "csv" | "archive";

export const KIND_BY_EXT: Record<string, FileKind> = {
  pdf: "pdf",
  doc: "word", docx: "word", odt: "word", rtf: "word",
  ppt: "slides", pptx: "slides", odp: "slides",
  xls: "sheet", xlsx: "sheet", ods: "sheet",
  csv: "csv",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image",
  mp3: "audio", m4a: "audio", ogg: "audio", wav: "audio",
  txt: "text",
  md: "markdown",
  json: "code", html: "code", htm: "code", css: "code", js: "code", ts: "code", py: "code", java: "code", c: "code", cpp: "code", h: "code", sql: "code", xml: "code", php: "code",
  zip: "archive",
};

export const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "mkv", "avi", "m4v", "wmv", "flv", "3gp", "mpeg", "mpg"]);
/** Executables, scripts that run on open, and macro-enabled Office files. */
export const BLOCKED_EXTS = new Set(["exe", "bat", "cmd", "sh", "msi", "apk", "dll", "com", "scr", "jar", "ps1", "vbs", "docm", "xlsm", "pptm", "dotm", "xltm", "potm"]);

const MB = 1024 * 1024;
const envMb = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return (Number.isFinite(n) && n > 0 ? n : fallback) * MB;
};
export const maxBytesFor = (kind: FileKind): number =>
  kind === "slides" ? envMb("ELEARNING_SLIDES_MAX_MB", 100) : kind === "audio" ? envMb("ELEARNING_AUDIO_MAX_MB", 50) : kind === "archive" ? envMb("ELEARNING_ZIP_MAX_MB", 50) : envMb("ELEARNING_FILE_MAX_MB", 50);

/** The largest any single upload may be (multer's hard cap). */
export const MAX_UPLOAD_BYTES = Math.max(...(["slides", "audio", "word"] as FileKind[]).map(maxBytesFor));

export const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odp: "application/vnd.oasis.opendocument.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  txt: "text/plain",
  md: "text/markdown",
  zip: "application/zip",
};
/** Code/markup is always served as plain text: an uploaded .html must never run. */
export const mimeFor = (ext: string): string => MIME_BY_EXT[ext] ?? (KIND_BY_EXT[ext] === "code" ? "text/plain" : "application/octet-stream");

export const extensionOf = (name: string): string => {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
};

/** Office files the server converts to PDF for a faithful preview. */
export const CONVERTS_TO_PDF = new Set<FileKind>(["word", "slides", "sheet"]);

export type Verdict = { ok: true; kind: FileKind; ext: string; mime: string } | { ok: false; reason: string };

/**
 * Checks a file by name and by its first bytes (magic numbers): a renamed executable, or
 * a PDF that is really a zip, is refused. Plain-text kinds must not contain NUL bytes.
 */
export async function classifyUpload(originalName: string, filePath: string, size: number): Promise<Verdict> {
  const ext = extensionOf(originalName);
  if (VIDEO_EXTS.has(ext)) {
    return { ok: false, reason: "Videos aren't uploaded. Put the video on YouTube (it can be unlisted) and add it as a Video link." };
  }
  if (BLOCKED_EXTS.has(ext)) return { ok: false, reason: `.${ext} files can't be uploaded (programs and macro-enabled files are blocked).` };
  const kind = KIND_BY_EXT[ext];
  if (!kind) return { ok: false, reason: `.${ext || "?"} files aren't supported. Upload a document, slides, a spreadsheet, a PDF, an image, audio or text.` };
  if (size <= 0) return { ok: false, reason: "The file is empty." };
  if (size > maxBytesFor(kind)) return { ok: false, reason: `That file is too big (max ${Math.round(maxBytesFor(kind) / MB)} MB for this type).` };

  const fh = await fsp.open(filePath, "r");
  const head = Buffer.alloc(16);
  try {
    await fh.read(head, 0, 16, 0);
  } finally {
    await fh.close();
  }
  const hex = head.toString("hex");
  const ascii = head.toString("latin1");
  const isZip = hex.startsWith("504b0304") || hex.startsWith("504b0506");
  const isOle = hex.startsWith("d0cf11e0a1b11ae1");
  const isExe = hex.startsWith("4d5a") || hex.startsWith("7f454c46") || hex.startsWith("cafebabe") || hex.startsWith("feedface") || hex.startsWith("cffaedfe");
  if (isExe) return { ok: false, reason: "That file is a program, not a document." };

  const expect: Record<string, boolean> = {
    pdf: ascii.startsWith("%PDF"),
    docx: isZip, pptx: isZip, xlsx: isZip, odt: isZip, odp: isZip, ods: isZip, zip: isZip,
    doc: isOle, ppt: isOle, xls: isOle || isZip,
    rtf: ascii.startsWith("{\\rtf"),
    png: hex.startsWith("89504e47"),
    jpg: hex.startsWith("ffd8ff"),
    jpeg: hex.startsWith("ffd8ff"),
    gif: ascii.startsWith("GIF8"),
    webp: ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP",
    mp3: ascii.startsWith("ID3") || hex.startsWith("fffb") || hex.startsWith("fff3") || hex.startsWith("fff2"),
    m4a: ascii.slice(4, 8) === "ftyp",
    ogg: ascii.startsWith("OggS"),
    wav: ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE",
  };
  if (ext in expect && !expect[ext]) return { ok: false, reason: `That file doesn't look like a real .${ext} file.` };
  if (ext === "m4a" && /^(isom|mp4|avc|M4V|qt)/.test(ascii.slice(8, 12))) {
    return { ok: false, reason: "Videos aren't uploaded. Put the video on YouTube and add it as a Video link." };
  }
  if (["text", "code", "markdown", "csv"].includes(kind) || ext === "svg") {
    const fh2 = await fsp.open(filePath, "r");
    const sample = Buffer.alloc(Math.min(size, 8192));
    try {
      await fh2.read(sample, 0, sample.length, 0);
    } finally {
      await fh2.close();
    }
    if (sample.includes(0)) return { ok: false, reason: "That doesn't look like a text file." };
  }
  return { ok: true, kind, ext, mime: mimeFor(ext) };
}
