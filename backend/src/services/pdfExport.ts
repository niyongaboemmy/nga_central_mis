import puppeteer from "puppeteer";
import katex from "katex";
import fs from "fs";
import path from "path";
import { LOGO_DATA_URI } from "./pdfAssets";

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

// Puppeteer renders headerTemplate/footerTemplate in a constrained frame sized to the
// page's margins — no access to the page's own <style>, external stylesheets, or custom
// fonts, and flexbox inside it is unreliable (items collapse/stack instead of sitting on
// one row, observed directly rather than assumed). A two-cell table is the pattern that
// actually behaves predictably in this frame, so that's what both templates use. This is
// the real letterhead: it repeats on every page, which is what makes the export read as
// an institutional document rather than a one-off printout.
const buildHeaderTemplate = (docTitle: string) => `
  <table style="width: 100%; font-family: ${FONT}; border-collapse: collapse; margin: 0 14mm; border-bottom: 1px solid ${RULE};">
    <tr>
      <td style="text-align: left; vertical-align: middle; padding-bottom: 6px; white-space: nowrap;">
        <img src="${LOGO_DATA_URI}" style="height: 14px; width: auto; vertical-align: middle; margin-right: 6px;" /><span style="font-size: 9px; font-weight: 700; letter-spacing: 0.06em; color: ${ACCENT}; text-transform: uppercase; vertical-align: middle;">NGA Central MIS</span>
      </td>
      <td style="text-align: right; vertical-align: middle; padding-bottom: 6px;">
        <span style="font-size: 8.5px; color: ${FAINT};">${escapeHtml(docTitle)}</span>
      </td>
    </tr>
  </table>
`;

// Left cell carries the "who this document is from/for" attribution (teacher name, plus
// subject/class when it's a single, unambiguous author) — repeated on every page so a
// printed or reshuffled page is still traceable back to its source without the cover page
// in hand. Right cell keeps the date (secondary here — the header already carries the
// brand) and page count.
const buildFooterTemplate = (footerLeft: string) => `
  <table style="width: 100%; font-family: ${FONT}; border-collapse: collapse; margin: 0 14mm; border-top: 1px solid ${RULE};">
    <tr>
      <td style="text-align: left; vertical-align: middle; padding-top: 5px;">
        <span style="font-size: 8.5px; color: ${MUTED};">${footerLeft}</span>
      </td>
      <td style="text-align: right; vertical-align: middle; padding-top: 5px; white-space: nowrap;">
        <span style="font-size: 8px; color: ${FAINT};">${today()} &nbsp;·&nbsp; Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </td>
    </tr>
  </table>
`;

// Shared print-optimized content styling — deliberately not the editor's own on-screen
// CSS: generous margins, print-safe colors, no interactive chrome. Used by both the
// single-note and combined-notes renderers so they stay visually consistent.
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

async function printHtmlToPdf(html: string, docTitle: string, footerLeft: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "22mm", bottom: "16mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: buildHeaderTemplate(docTitle),
      footerTemplate: buildFooterTemplate(footerLeft),
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

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
  const footerLeft = `${escapeHtml(data.teacherName)} · ${escapeHtml(data.subjectName)}`;
  return printHtmlToPdf(buildPrintHtml(data), data.title, footerLeft);
}

export interface CombinedNoteSection {
  title: string;
  subjectName: string;
  teacherName: string;
  contentHtml: string;
}

export interface CombinedPdfOptions {
  heading: string;
  generatedFor: string;
  /** When every section shares one author (a teacher's own combined packet), repeat their
   * name in the footer too — matches the single-note export. Omitted for the student
   * shared-notes combine, where sections can come from different teachers and a single
   * running footer credit would misattribute some of them. */
  singleAuthor?: string;
}

const buildCombinedPrintHtml = (sections: CombinedNoteSection[], opts: CombinedPdfOptions): string => `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>${getInlineKatexCss()}</style>
<style>${CONTENT_CSS}
  .cover-title {
    font-size: 28px;
    font-weight: 700;
    color: ${INK};
    margin: 14px 0 6px;
    line-height: 1.25;
  }
  .cover-meta {
    font-size: 11px;
    color: ${MUTED};
    margin-bottom: 36px;
  }
  .toc-heading {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${MUTED};
    margin-bottom: 14px;
    padding-bottom: 8px;
    border-bottom: 1px solid ${RULE};
  }
  .toc-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 11px 0;
    border-bottom: 1px solid ${RULE};
  }
  .toc-num {
    font-size: 11px;
    font-weight: 700;
    color: ${ACCENT};
    min-width: 20px;
  }
  .toc-title { font-size: 13.5px; color: ${INK}; font-weight: 600; }
  .toc-subject { font-size: 10.5px; color: ${MUTED}; margin-top: 1px; }
  .note-section { page-break-before: always; }
</style>
</head>
<body>
  <div>
    <span class="kicker">Combined Packet</span>
    <h1 class="cover-title">${escapeHtml(opts.heading)}</h1>
    <div class="cover-meta">${sections.length} note${sections.length === 1 ? "" : "s"} · Prepared for <b>${escapeHtml(opts.generatedFor)}</b> · ${today()}</div>
    <div class="toc-heading">Contents</div>
    <div>
      ${sections
        .map(
          (s, i) => `
        <div class="toc-row">
          <span class="toc-num">${String(i + 1).padStart(2, "0")}</span>
          <div>
            <div class="toc-title">${escapeHtml(s.title)}</div>
            <div class="toc-subject">${escapeHtml(s.subjectName)} · ${escapeHtml(s.teacherName)}</div>
          </div>
        </div>`,
        )
        .join("")}
    </div>
  </div>
  ${sections
    .map(
      (s) => `
    <div class="note-section">
      <span class="kicker">${escapeHtml(s.subjectName)}</span>
      <h1 class="doc-title">${escapeHtml(s.title)}</h1>
      <div class="doc-meta">Prepared by <b>${escapeHtml(s.teacherName)}</b></div>
      <div class="content">${renderMathInHtml(s.contentHtml)}</div>
    </div>`,
    )
    .join("")}
</body>
</html>`;

export async function renderCombinedLessonNotesPdf(
  sections: CombinedNoteSection[],
  opts: CombinedPdfOptions,
): Promise<Buffer> {
  const footerLeft = opts.singleAuthor
    ? `${escapeHtml(opts.singleAuthor)} · ${sections.length} note${sections.length === 1 ? "" : "s"}`
    : `Compiled for ${escapeHtml(opts.generatedFor)}`;
  return printHtmlToPdf(buildCombinedPrintHtml(sections, opts), opts.heading, footerLeft);
}
