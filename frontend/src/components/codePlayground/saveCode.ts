import { baseName, extOf, type PlayFile } from "./project";

/**
 * Turning the playground's files into something to keep: one file as it is, or the
 * whole project as a .zip (folders kept). Used by "Download" and "Save to Documents".
 */

const MIME: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  jsx: "text/javascript",
  ts: "text/plain",
  tsx: "text/plain",
  json: "application/json",
  md: "text/markdown",
  sql: "application/sql",
  xml: "application/xml",
  svg: "image/svg+xml",
  zip: "application/zip",
};

/** The type a saved file gets (code is text; Documents previews text files). */
export const mimeFor = (path: string) => MIME[extOf(path)] ?? "text/plain";

/** A name without folders or characters that file systems refuse. */
export function cleanFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 200);
}

/** `name` with the extension `ext` (added when it's missing or different). */
export function withExtension(name: string, ext: string): string {
  const n = cleanFileName(name);
  if (!ext) return n;
  return extOf(n) === ext.toLowerCase() ? n : `${n.replace(/\.$/, "")}.${ext}`;
}

/** "main.py" → "main (2).py"; "app.zip" → "app (3).zip". */
export function numberedName(name: string, n: number): string {
  const ext = extOf(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  const base = stem.replace(/ \(\d+\)$/, "");
  return ext ? `${base} (${n}).${ext}` : `${base} (${n})`;
}

/** The .zip name for a project: its title, else "<language>-project". */
export function projectZipName(title: string, fallback: string): string {
  const slug = (title || fallback)
    .replace(/[^\w-]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${slug || "playground"}.zip`;
}

export function fileBlob(file: PlayFile): Blob {
  return new Blob([file.content], { type: `${mimeFor(file.path)};charset=utf-8` });
}

export async function projectZip(files: PlayFile[]): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.content);
  return zip.generateAsync({ type: "blob", mimeType: "application/zip", compression: "DEFLATE" });
}

/** What "Download" hands over: the file when there is one, else the project as a .zip. */
export async function exportForDownload(files: PlayFile[], zipName: string): Promise<{ blob: Blob; name: string }> {
  if (files.length === 1) return { blob: fileBlob(files[0]), name: baseName(files[0].path) };
  return { blob: await projectZip(files), name: zipName };
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
