import katex from "katex";
import fs from "fs";
import path from "path";
import { renderPdf } from "./documents/letterhead";

// KaTeX's CSS references its font files via relative `url(fonts/...)` paths, which won't
// resolve for a page loaded via page.setContent() (no real origin/base URL to resolve
// against). Base64-inlining every referenced font directly into the CSS sidesteps that
// entirely — computed once and cached, not per-request, since the fonts never change.
let cachedInlineKatexCss: string | null = null;
function getInlineKatexCss(): string {
  if (cachedInlineKatexCss) return cachedInlineKatexCss;
  const katexDistDir = path.dirname(require.resolve("katex/dist/katex.min.css"));
  const css = fs.readFileSync(path.join(katexDistDir, "katex.min.css"), "utf8");
  cachedInlineKatexCss = css.replace(/url\(fonts\/([^)]+?\.woff2)\)/g, (_match, fontFile) => {
    const fontPath = path.join(katexDistDir, "fonts", fontFile);
    const base64 = fs.readFileSync(fontPath).toString("base64");
    return `url(data:font/woff2;base64,${base64})`;
  });
  return cachedInlineKatexCss;
}

// Mirrors the same $...$ inline-math convention the editor's Mathematics extension uses
// (decoration-based, default regex) — pre-rendered here to real KaTeX markup server-side
// since Puppeteer has no live editor instance to do it for us.
const MATH_DELIMITER_RE = /\$([^$]+)\$/g;
function renderMathInHtml(html: string): string {
  return html.replace(MATH_DELIMITER_RE, (match, latex) => {
    try {
      return katex.renderToString(latex, { throwOnError: false, displayMode: false });
    } catch {
      return match;
    }
  });
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const today = () =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// ============================================================================
// Design tokens — one deliberate palette/type pairing shared by the running
// header/footer (Puppeteer chrome) and the in-page content, so the whole document
// reads as one designed artifact rather than a page dump with page numbers stapled on.
// A single clean sans-serif family throughout — the same kind of face a real handout,
// worksheet, or study guide uses (Word/Docs default, not a decorative display serif),
// since this is meant to be read and studied from, not admired as a printed invitation.
// ============================================================================
const INK = "#1a2333"; // heading / primary text
const BODY = "#374151"; // body copy
const MUTED = "#6b7280"; // captions, meta
const FAINT = "#9ca3af"; // footer, tertiary
const ACCENT = "#1d4ed8"; // brand blue
const ACCENT_SOFT = "#eef2ff";
const RULE = "#e2e6ee";
const FONT = `"Segoe UI", Arial, Helvetica, sans-serif`;

// Shared print-optimized content styling — deliberately not the editor's own on-screen
// CSS: generous margins, print-safe colors, no interactive chrome.
const CONTENT_CSS = `
  * { box-sizing: border-box; }
  body {
    font-family: ${FONT};
    color: ${BODY};
    line-height: 1.65;
    font-size: 13px;
    margin: 0;
    padding: 0;
  }
  .kicker {
    display: inline-block;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: ${ACCENT};
    background: ${ACCENT_SOFT};
    padding: 3px 9px;
    border-radius: 3px;
    margin-bottom: 10px;
  }
  .doc-title {
    font-size: 23px;
    font-weight: 700;
    color: ${INK};
    margin: 0 0 8px;
    line-height: 1.3;
  }
  .doc-meta {
    font-size: 10.5px;
    color: ${MUTED};
    padding-bottom: 16px;
    margin-bottom: 20px;
    border-bottom: 1px solid ${RULE};
  }
  .doc-meta b { color: ${BODY}; font-weight: 600; }
  .content h1 { font-size: 18px; font-weight: 700; color: ${INK}; margin-top: 1.5em; margin-bottom: 0.5em; }
  .content h2 {
    font-size: 15px;
    font-weight: 700;
    color: ${INK};
    margin-top: 1.6em;
    margin-bottom: 0.6em;
    padding-top: 10px;
    border-top: 1px solid ${RULE};
  }
  .content h2:first-child { border-top: none; padding-top: 0; }
  .content h3 { font-size: 13.5px; font-weight: 700; color: ${INK}; margin-top: 1.3em; margin-bottom: 0.4em; }
  .content h4 { font-size: 13px; font-weight: 700; color: ${INK}; margin-top: 1.1em; margin-bottom: 0.3em; }
  .content p, .content li { font-size: 13px; }
  .content ul, .content ol { padding-left: 1.3em; }
  .content li { margin-bottom: 0.35em; }
  .content table {
    border-collapse: collapse;
    width: 100%;
    margin: 1.2em 0;
    font-size: 12px;
  }
  .content table td, .content table th {
    border: 1px solid ${RULE};
    padding: 7px 10px;
    text-align: left;
  }
  .content table th {
    background-color: #f6f7fb;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: ${MUTED};
  }
  .content table tr:nth-child(even) td { background-color: #fafbfd; }
  .content img { max-width: 100%; border-radius: 3px; }
  .content blockquote {
    background: ${ACCENT_SOFT};
    border-left: 3px solid ${ACCENT};
    margin: 1.2em 0;
    padding: 10px 16px;
    border-radius: 0 4px 4px 0;
    color: #3730a3;
    font-style: italic;
  }
  .content blockquote p { margin: 0; }
  .content mark { background-color: #fef08a; padding: 0 2px; border-radius: 2px; }
  .content ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  .content ul[data-type="taskList"] li { display: flex; gap: 6px; align-items: flex-start; }
  .content strong { color: ${INK}; }
`;

// The school's letterhead (documents logo on top, its footer below) repeats on every page --
// that is what makes the export read as the school's own document. The header's right side
// carries the document title; the footer's small line says who it is from (teacher · subject)
// so a loose printed page can still be traced, next to "Page N of M".
const printHtmlToPdf = (html: string, docTitle: string, footerLeft: string): Promise<Buffer> =>
  renderPdf(html, { sideMm: 14, title: docTitle, note: `${footerLeft} · ${today()}`, minTopMm: 22, minBottomMm: 16 });

export interface LessonNotePdfData {
  title: string;
  subjectName: string;
  classGroupName: string | null;
  weekLabel: string | null;
  teacherName: string;
  contentHtml: string;
}

const buildPrintHtml = (data: LessonNotePdfData): string => `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>${getInlineKatexCss()}</style>
<style>${CONTENT_CSS}</style>
</head>
<body>
  <div style="padding: 4px 0 0;">
    <span class="kicker">${escapeHtml(data.subjectName)}</span>
    <h1 class="doc-title">${escapeHtml(data.title)}</h1>
    <div class="doc-meta">
      ${data.classGroupName ? `<b>${escapeHtml(data.classGroupName)}</b> · ` : ""}${
        data.weekLabel ? `${escapeHtml(data.weekLabel)} · ` : ""
      }Prepared by <b>${escapeHtml(data.teacherName)}</b>
    </div>
  </div>
  <div class="content">
    ${renderMathInHtml(data.contentHtml)}
  </div>
</body>
</html>`;

export async function renderLessonNotePdf(data: LessonNotePdfData): Promise<Buffer> {
  const footerLeft = `${data.teacherName} · ${data.subjectName}`;
  return printHtmlToPdf(buildPrintHtml(data), data.title, footerLeft);
}
