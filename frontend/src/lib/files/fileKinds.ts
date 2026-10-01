/**
 * File kinds for previews (ELEARNING_AI_LESSON_STUDIO_IMPLEMENTATION_PLAN.md §10.6). Mirrors
 * backend services/files/fileKinds.ts — keep KIND_BY_EXT identical (both tested on the same
 * table). Pure: no React, no network.
 */

export type FileKind = "pdf" | "word" | "slides" | "sheet" | "image" | "audio" | "text" | "code" | "markdown" | "csv" | "archive" | "other";

export const KIND_BY_EXT: Record<string, Exclude<FileKind, "other">> = {
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

export const extensionOf = (name: string): string => /\.([a-z0-9]{1,8})$/i.exec(name || "")?.[1]?.toLowerCase() ?? "";

export function detectFileKind(input: { name?: string | null; mime?: string | null }): FileKind {
  const byExt = KIND_BY_EXT[extensionOf(input.name || "")];
  if (byExt) return byExt;
  const mime = (input.mime || "").toLowerCase();
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/")) return "text";
  return "other";
}

export const KIND_LABEL: Record<FileKind, string> = {
  pdf: "PDF",
  word: "Document",
  slides: "Slides",
  sheet: "Spreadsheet",
  image: "Image",
  audio: "Audio",
  text: "Text",
  code: "Code",
  markdown: "Text",
  csv: "Table",
  archive: "Zip file",
  other: "File",
};

export function formatBytes(n?: number | null): string {
  if (!n || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
