import { PDFParse } from "pdf-parse";

export const LESSON_NOTE_PDF_MAX_BYTES = 25 * 1024 * 1024;

// Everything an uploaded lesson-note PDF yields that the platform stores: the page count
// for the reader's "N pages" label, and the text as note HTML so the student AI tutor and
// the library excerpt keep working exactly as they do for a typed note (they only ever
// read content_html). The text is never displayed as the note — students read the PDF.
export interface ExtractedPdfNote {
  pageCount: number;
  contentHtml: string;
  /** True when the PDF contained no extractable text at all — typically a scan. */
  isTextless: boolean;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A page of PDF text is one hard line break per visual line, with genuinely blank lines
// only between paragraphs (in most generators). Rebuilding paragraphs from that keeps the
// AI's context readable and the excerpt sensible instead of one word-per-line soup.
export const pdfTextToHtml = (pages: string[]): string =>
  pages
    .map((pageText) =>
      pageText
        .replace(/\r/g, "")
        .split(/\n\s*\n+/)
        .map((para) => para.split("\n").map((l) => l.trim()).filter(Boolean).join(" ").trim())
        .filter((para) => para.length > 0)
        .map((para) => `<p>${escapeHtml(para)}</p>`)
        .join(""),
    )
    .filter(Boolean)
    .join("");

export const extractLessonNotePdf = async (buffer: Buffer): Promise<ExtractedPdfNote> => {
  const parser = new PDFParse({ data: buffer });
  try {
    // Page boundaries are kept as separate entries (not the default "-- n of N --" joiner
    // text) so a page footer never leaks into the note body a student asks the AI about.
    const result = await parser.getText({ pageJoiner: "" });
    const pages = result.pages.map((p) => p.text || "");
    const contentHtml = pdfTextToHtml(pages);
    return {
      pageCount: result.total,
      contentHtml,
      isTextless: contentHtml.replace(/<[^>]*>/g, "").trim().length === 0,
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
};

// Multer's mimetype comes from the browser and is trivially spoofable; the %PDF- magic
// header is what actually tells us the bytes are a PDF before we hand them to a parser.
export const looksLikePdf = (buffer: Buffer): boolean =>
  buffer.length > 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-";
