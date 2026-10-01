import { promises as fsp } from "fs";
import { PDFParse } from "pdf-parse";
import mammoth = require("mammoth");
import JSZip = require("jszip");
import * as XLSX from "xlsx";
import { sanitizeExtractedText } from "../../utils/lessonNotePdf";
import type { FileKind } from "./fileKinds";

/**
 * Plain text of an uploaded file, for the Week Context Pack and the AI tutor (LESSON_STUDIO
 * plan §10.5). Only teaching text leaves this function — it is what grounds the AI, so it
 * never needs layout. Office formats without a native reader (doc/ppt/odt/odp/rtf/ods) are
 * read from their PDF derivative instead.
 */

export const MAX_TEXT_CHARS = 200_000;
/** Below this many characters a file is treated as "no readable text" (a scan, an image deck). */
export const MIN_USEFUL_CHARS = 50;

export type ExtractMethod = "pdf-parse" | "mammoth" | "pptx-xml" | "sheet-csv" | "plain" | "none";

export interface Extracted {
  text: string;
  pages?: number;
  method: ExtractMethod;
}

const clean = (t: string) => sanitizeExtractedText(t).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT_CHARS);

export async function pdfText(path: string): Promise<Extracted> {
  const data = await fsp.readFile(path);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    return { text: clean(result.pages.map((p) => p.text || "").join("\n\n")), pages: result.total, method: "pdf-parse" };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Slide text in slide order, then the speaker notes — teachers often put the real explanation there. */
export async function pptxText(path: string): Promise<Extracted> {
  const zip = await JSZip.loadAsync(await fsp.readFile(path));
  const num = (name: string) => Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0);
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
  const parts: string[] = [];
  for (const name of slides) {
    const xml = await zip.file(name)!.async("string");
    const paragraphs = xml
      .split(/<\/a:p>/)
      .map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(""))
      .map((p) => p.trim())
      .filter(Boolean);
    const notesName = `ppt/notesSlides/notesSlide${num(name)}.xml`;
    let notes = "";
    if (zip.file(notesName)) {
      const nx = await zip.file(notesName)!.async("string");
      notes = [...nx.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(" ").replace(/\s+/g, " ").trim();
      // A bare slide number is not a note.
      if (/^\d+$/.test(notes)) notes = "";
    }
    parts.push(`Slide ${num(name)}\n${paragraphs.join("\n")}${notes ? `\nSpeaker notes: ${notes}` : ""}`);
  }
  return { text: clean(parts.join("\n\n")), pages: slides.length, method: "pptx-xml" };
}

export async function sheetText(path: string): Promise<Extracted> {
  const wb = XLSX.read(await fsp.readFile(path), { type: "buffer", sheetRows: 200 });
  const parts = wb.SheetNames.slice(0, 10).map((name) => `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false })}`);
  return { text: clean(parts.join("\n\n")), method: "sheet-csv" };
}

/**
 * Text for any supported kind. `pdfPath` is the converted PDF when one exists — used for the
 * office formats that have no native reader here.
 */
export async function extractText(path: string, kind: FileKind, ext: string, pdfPath?: string | null): Promise<Extracted> {
  if (kind === "pdf") return pdfText(path);
  if (ext === "docx") return { text: clean((await mammoth.extractRawText({ path })).value), method: "mammoth" };
  if (ext === "pptx") return pptxText(path);
  if (ext === "xlsx" || ext === "xls" || ext === "ods" || kind === "csv") {
    if (kind === "csv") return { text: clean((await fsp.readFile(path, "utf8")).split("\n").slice(0, 400).join("\n")), method: "plain" };
    return sheetText(path);
  }
  if (kind === "text" || kind === "markdown" || kind === "code") return { text: clean(await fsp.readFile(path, "utf8")), method: "plain" };
  if (pdfPath) return pdfText(pdfPath);
  return { text: "", method: "none" };
}
