/**
 * The document letterhead: ONE place that puts a school's fixed header and footer on every
 * page of every PDF this server makes.
 *
 *   header  School.documents_logo (falls back to School.logo, then the school's name)
 *   footer  School.documents_footer (an image across the page) and/or
 *           School.documents_footer_text (lines of text), then a small line with the
 *           document's own note and "Page N of M"
 *
 * Every school (tenant) has its own School record, so the letterhead is the school's the
 * request runs for. A school that has set nothing still gets its name on top and the page
 * numbers below.
 *
 * How to use it:
 *
 *   const pdf = await renderPdf(html, { landscape: true, note: "Projects report" });
 *
 * or, for a generator that drives Puppeteer itself (measures first, then prints):
 *
 *   const lh = await loadLetterhead();
 *   const frame = letterheadFrame(lh, { landscape: true, sideMm: 10 });
 *   // frame.contentHeightMm / frame.margin / frame.headerTemplate / frame.footerTemplate
 *
 * The browser-side twin (jsPDF and printed pages) is frontend/src/utils/documentLetterhead.ts;
 * both follow the same measurements below so a document looks the same whichever side made it.
 */
import puppeteer, { Browser } from "puppeteer";
import sharp from "sharp";
import { asc } from "drizzle-orm";
import { db } from "../../db";
import { School } from "../../db/schema";
import storageService from "../../utils/fileServer";
import logger from "../../utils/logger";
import { isServableLogo } from "../../controllers/schoolController";
import { responseTenant } from "../../tenancy/claims";

// ─── Measurements (mm), shared with the frontend twin ───────────────────────
/** Space between the paper edge and the header / the page-number line. */
export const EDGE_MM = 6;
/** Height of the header mark. */
export const HEADER_LOGO_MM = 13;
/** Widest the header mark may be. */
export const HEADER_LOGO_MAX_WIDTH_MM = 70;
/** Height of the header when there is only the school's name. */
export const HEADER_NAME_MM = 6;
/** Tallest the footer image may be (a wide strip is fitted to the page width first). */
export const FOOTER_IMAGE_MAX_MM = 22;
/** One line of footer text. */
export const FOOTER_TEXT_LINE_MM = 3.6;
/** The note + page number line. */
export const PAGE_LINE_MM = 4;
/** Clear space between the letterhead and the document's content. */
export const GAP_MM = 4;
export const FOOTER_TEXT_MAX_LINES = 4;

// Single quotes: this goes inside style="..." attributes.
const FONT = `'Segoe UI', Arial, Helvetica, sans-serif`;
const INK = "#1a2333";
const MUTED = "#6b7280";

export interface LetterheadImage {
  /** Always a data: URI (Chromium's header/footer frame cannot fetch anything). */
  dataUri: string;
  width: number;
  height: number;
}

export interface Letterhead {
  schoolName: string;
  header: LetterheadImage | null;
  footer: LetterheadImage | null;
  footerLines: string[];
}

export const EMPTY_LETTERHEAD: Letterhead = { schoolName: "", header: null, footer: null, footerLines: [] };

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ─── Loading ────────────────────────────────────────────────────────────────
// Images are read from the file server and re-encoded as PNG once per stored value: paths
// carry a timestamp and are tenant-scoped by the storage service, and the cache key also
// carries the school row's identity, so a new upload is a new key.
const imageCache = new Map<string, Promise<LetterheadImage | null>>();
const CACHE_MAX = 40;

async function readImage(value: string): Promise<LetterheadImage | null> {
  try {
    let buf: Buffer;
    if (/^https?:\/\//i.test(value)) {
      const res = await fetch(value);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    } else {
      buf = await storageService.downloadToBuffer(value);
    }
    // PNG keeps transparency and is understood by every PDF path; SVG/WEBP are rasterised.
    // Nothing is enlarged; a huge upload is brought down to print size (300 dpi across A4).
    const png = await sharp(buf, { density: 300 }).resize({ width: 2400, height: 800, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    return { dataUri: `data:image/png;base64,${png.data.toString("base64")}`, width: png.info.width, height: png.info.height };
  } catch (err) {
    logger.warn("Letterhead image could not be read", { value, error: (err as Error).message });
    return null;
  }
}

function cachedImage(key: string, value: string): Promise<LetterheadImage | null> {
  let hit = imageCache.get(key);
  if (!hit) {
    hit = readImage(value);
    imageCache.set(key, hit);
    // A failed read is not remembered (the file server may just be restarting).
    void hit.then((img) => { if (!img) imageCache.delete(key); });
    if (imageCache.size > CACHE_MAX) imageCache.delete(imageCache.keys().next().value as string);
  }
  return hit;
}

export const footerLinesOf = (text: unknown): string[] =>
  typeof text === "string"
    ? text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, FOOTER_TEXT_MAX_LINES)
    : [];

/** The letterhead of a School row (any object with the School columns). */
export async function letterheadOf(school: Record<string, any> | null | undefined, scope = ""): Promise<Letterhead> {
  if (!school) return EMPTY_LETTERHEAD;
  const key = (v: string) => `${scope}|${school.school_id}|${v}`;
  const headerValue = [school.documents_logo, school.logo].find(isServableLogo);
  const footerValue = isServableLogo(school.documents_footer) ? school.documents_footer : null;
  const [header, footer] = await Promise.all([
    headerValue ? cachedImage(key(headerValue), headerValue) : null,
    footerValue ? cachedImage(key(footerValue), footerValue) : null,
  ]);
  return { schoolName: String(school.name ?? ""), header, footer, footerLines: footerLinesOf(school.documents_footer_text) };
}

/**
 * The letterhead of the school the current request runs for (its active School record, the
 * lowest id). Never throws: a document is still made when the letterhead cannot be read.
 */
export async function loadLetterhead(): Promise<Letterhead> {
  try {
    const rows = await db.select().from(School).orderBy(asc(School.school_id));
    const school = rows.find((r: any) => r.status === "ACTIVE") ?? rows[0] ?? null;
    let scope = "";
    try {
      scope = String(responseTenant().tid);
    } catch {
      /* outside a request: the primary school */
    }
    return await letterheadOf(school, scope);
  } catch (err) {
    logger.warn("Letterhead could not be loaded", { error: (err as Error).message });
    return EMPTY_LETTERHEAD;
  }
}

// ─── Layout ─────────────────────────────────────────────────────────────────
export interface FrameOptions {
  landscape?: boolean;
  /** Left/right page margin of the document (the letterhead lines up with it). Default 14. */
  sideMm?: number;
  /** Small text at the right of the header, e.g. the document's title. */
  title?: string;
  /** Small text at the left of the page-number line, e.g. "Projects report". */
  note?: string;
  /** false leaves the header out (a document that draws its own masthead). Default true. */
  header?: boolean;
  /** Never reserve less than this at the top / bottom (mm). */
  minTopMm?: number;
  minBottomMm?: number;
  /** Paper size in mm when it is not A4. */
  pageWidthMm?: number;
  pageHeightMm?: number;
}

export interface LetterheadFrame {
  pageWidthMm: number;
  pageHeightMm: number;
  sideMm: number;
  /** Top / bottom page margins that keep the content clear of the letterhead. */
  topMm: number;
  bottomMm: number;
  contentWidthMm: number;
  contentHeightMm: number;
  /** Size the footer image is printed at (0 when there is none). */
  footerImageWidthMm: number;
  footerImageHeightMm: number;
  margin: { top: string; bottom: string; left: string; right: string };
  headerTemplate: string;
  footerTemplate: string;
}

/** Sizes only (no HTML): what the letterhead takes from a page. Pure, so it is unit-tested. */
export function letterheadLayout(lh: Letterhead, opts: FrameOptions = {}) {
  const landscape = !!opts.landscape;
  const pageWidthMm = opts.pageWidthMm ?? (landscape ? 297 : 210);
  const pageHeightMm = opts.pageHeightMm ?? (landscape ? 210 : 297);
  const sideMm = opts.sideMm ?? 14;
  const contentWidthMm = pageWidthMm - 2 * sideMm;

  const showHeader = opts.header !== false;
  const headerMm = !showHeader ? 0 : lh.header ? HEADER_LOGO_MM : lh.schoolName || opts.title ? HEADER_NAME_MM : 0;
  const topMm = Math.max(opts.minTopMm ?? 0, headerMm ? EDGE_MM + headerMm + GAP_MM : 12);

  let footerImageWidthMm = 0;
  let footerImageHeightMm = 0;
  if (lh.footer && lh.footer.width > 0 && lh.footer.height > 0) {
    const ratio = lh.footer.width / lh.footer.height;
    footerImageWidthMm = contentWidthMm;
    footerImageHeightMm = contentWidthMm / ratio;
    if (footerImageHeightMm > FOOTER_IMAGE_MAX_MM) {
      footerImageHeightMm = FOOTER_IMAGE_MAX_MM;
      footerImageWidthMm = FOOTER_IMAGE_MAX_MM * ratio;
    }
  }
  const textMm = lh.footerLines.length * FOOTER_TEXT_LINE_MM;
  const bandMm = footerImageHeightMm + textMm + (footerImageHeightMm && textMm ? 1 : 0);
  const bottomMm = Math.max(opts.minBottomMm ?? 0, EDGE_MM + PAGE_LINE_MM + (bandMm ? bandMm + 1 : 0) + GAP_MM);

  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    pageWidthMm,
    pageHeightMm,
    sideMm,
    topMm: r(topMm),
    bottomMm: r(bottomMm),
    contentWidthMm: r(contentWidthMm),
    contentHeightMm: r(pageHeightMm - topMm - bottomMm),
    footerImageWidthMm: r(footerImageWidthMm),
    footerImageHeightMm: r(footerImageHeightMm),
    showHeader,
  };
}

/**
 * Margins plus Chromium header/footer templates for page.pdf(). The templates live in an
 * isolated frame: no page CSS, no network, a zero default font size -- so every rule is inline
 * and every image is a data: URI. The frame spans the whole paper width; padding (not margin)
 * lines the letterhead up with the document's own side margins.
 */
export function letterheadFrame(lh: Letterhead, opts: FrameOptions = {}): LetterheadFrame {
  const l = letterheadLayout(lh, opts);
  const box = `width:100%;box-sizing:border-box;padding:0 ${l.sideMm}mm;margin:0;font-family:${FONT};-webkit-print-color-adjust:exact;print-color-adjust:exact;`;

  const mark = lh.header
    ? `<img src="${lh.header.dataUri}" style="height:${HEADER_LOGO_MM}mm;width:auto;max-width:${HEADER_LOGO_MAX_WIDTH_MM}mm;object-fit:contain;object-position:left center;vertical-align:middle;" />`
    : lh.schoolName
      ? `<span style="font-size:13px;font-weight:700;color:${INK};">${esc(lh.schoolName)}</span>`
      : "";
  const headerTemplate = !l.showHeader || (!mark && !opts.title)
    ? "<span></span>"
    : `<div style="${box}padding-top:${EDGE_MM - 4}mm;">
        <table style="width:100%;border-collapse:collapse;"><tr>
          <td style="text-align:left;vertical-align:middle;padding:0;">${mark}</td>
          <td style="text-align:right;vertical-align:middle;padding:0;"><span style="font-size:8.5px;color:${MUTED};">${esc(opts.title ?? "")}</span></td>
        </tr></table>
      </div>`;

  const image = lh.footer && l.footerImageHeightMm
    ? `<div style="text-align:center;line-height:0;"><img src="${lh.footer.dataUri}" style="width:${l.footerImageWidthMm}mm;height:${l.footerImageHeightMm}mm;" /></div>`
    : "";
  const lines = lh.footerLines
    .map((line) => `<div style="height:${FOOTER_TEXT_LINE_MM}mm;line-height:${FOOTER_TEXT_LINE_MM}mm;font-size:8.5px;color:${INK};text-align:center;white-space:nowrap;overflow:hidden;">${esc(line)}</div>`)
    .join("");
  const footerTemplate = `<div style="${box}padding-bottom:${EDGE_MM - 4}mm;">
      ${image}${image && lines ? `<div style="height:1mm;"></div>` : ""}${lines}
      <table style="width:100%;border-collapse:collapse;margin-top:${image || lines ? 1 : 0}mm;"><tr>
        <td style="text-align:left;vertical-align:middle;padding:0;height:${PAGE_LINE_MM}mm;"><span style="font-size:8px;color:${MUTED};">${esc(opts.note ?? "")}</span></td>
        <td style="text-align:right;vertical-align:middle;padding:0;white-space:nowrap;"><span style="font-size:8px;color:${MUTED};">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></td>
      </tr></table>
    </div>`;

  return {
    pageWidthMm: l.pageWidthMm,
    pageHeightMm: l.pageHeightMm,
    sideMm: l.sideMm,
    topMm: l.topMm,
    bottomMm: l.bottomMm,
    contentWidthMm: l.contentWidthMm,
    contentHeightMm: l.contentHeightMm,
    footerImageWidthMm: l.footerImageWidthMm,
    footerImageHeightMm: l.footerImageHeightMm,
    margin: { top: `${l.topMm}mm`, bottom: `${l.bottomMm}mm`, left: `${l.sideMm}mm`, right: `${l.sideMm}mm` },
    headerTemplate,
    footerTemplate,
  };
}

// ─── Printing ───────────────────────────────────────────────────────────────
export const launchPdfBrowser = (): Promise<Browser> =>
  puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

/** Prints an HTML page inside a frame (see letterheadFrame) with an already open browser. */
export async function printWithFrame(browser: Browser, html: string, frame: LetterheadFrame, landscape = false): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "a4",
      landscape,
      printBackground: true,
      margin: frame.margin,
      displayHeaderFooter: true,
      headerTemplate: frame.headerTemplate,
      footerTemplate: frame.footerTemplate,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export interface RenderPdfOptions extends FrameOptions {
  /** A letterhead already loaded (e.g. another school's); default: the request's school. */
  letterhead?: Letterhead;
}

/**
 * HTML in, A4 PDF out, with the school's header and footer on every page. The one call every
 * server-made PDF goes through.
 */
export async function renderPdf(html: string, opts: RenderPdfOptions = {}): Promise<Buffer> {
  const lh = opts.letterhead ?? (await loadLetterhead());
  const frame = letterheadFrame(lh, opts);
  const browser = await launchPdfBrowser();
  try {
    return await printWithFrame(browser, html, frame, !!opts.landscape);
  } finally {
    await browser.close();
  }
}
