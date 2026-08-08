import { PDFParse } from "pdf-parse";
import mammoth = require("mammoth");

/** Extracts plain text from an uploaded .docx, .pdf, or .txt file (default: DOCX). */
export const extractTextFromFile = async (
  file: Express.Multer.File,
): Promise<string> => {
  const name = file.originalname.toLowerCase();
  if (name.endsWith(".pdf")) {
    const parser = new PDFParse({ data: file.buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }
  if (name.endsWith(".txt")) {
    return file.buffer.toString("utf-8");
  }
  const result = await mammoth.extractRawText({ buffer: file.buffer });
  return result.value;
};

export interface LearningOutcomeSection {
  loNumber: number;
  title: string;
  hours: number | null;
  /** Char offset in the source text where this LO's own content begins (after its header/hours). */
  start: number;
  /** Char offset (exclusive) where this LO's content ends. */
  end: number;
}

export interface ContentItem {
  index: number;
  text: string;
  start: number;
  end: number;
}

export interface CurriculumStructure {
  hasStructure: boolean;
  los: LearningOutcomeSection[];
}

// Only the "Learning outcome N" anchor is required to be tight — the title and hours are found
// afterwards via a bounded window search, so a page-break/footer/header intervening between the
// title and its "Learning hours" line (common in PDF-extracted text) doesn't drop the whole LO.
const LO_ANCHOR_RE = /learning\s+outcome\s+(\d+)\s*[:.\-]?\s*/gi;
const HOURS_RE = /learning\s+hours?\s*[:\-]?\s*(\d+)/i;
const INDICATIVE_HEADER_RE = /indicative\s+content/i;
const RESOURCES_HEADER_RE = /resources\s+required/i;

const TAIL_MARKER_RE =
  /integrated\s*\/?\s*summative\s+assessment|references\s*:?/i;

// RTB curriculum PDFs repeat this exact footer on every page; strip it out if it lands inside a
// captured title (e.g. when an LO's title/hours straddle a page break in the extracted text).
// Two variants: `g` for in-place replace, plain for stateless boolean checks (global regexes are
// stateful across repeated .test() calls, which would otherwise skip matches intermittently).
const PAGE_FOOTER_RE =
  /\d+\s*\|\s*page|employable\s+skills\s+for\s+sustainable\s+job\s+creation/gi;
const PAGE_FOOTER_CHECK_RE =
  /\d+\s*\|\s*page|employable\s+skills\s+for\s+sustainable\s+job\s+creation/i;

/**
 * RTB TVET curriculum documents are organized into a handful of "Learning Outcome" (LO)
 * sections, each with an explicit hour budget (e.g. "Learning outcome 2: Draw digital sketch"
 * followed, somewhere nearby, by "Learning hours: 40"). This scans the raw extracted text for
 * that repeating template and returns the exact [start, end) slice of each LO, so a specific LO's
 * content can be isolated from the rest of a full-year document instead of feeding the whole thing
 * to the AI.
 */
export const extractCurriculumStructure = (
  rawText: string,
): CurriculumStructure => {
  const byLoNumber = new Map<number, { headerStart: number; titleStart: number }>();

  for (const m of rawText.matchAll(LO_ANCHOR_RE)) {
    const loNumber = Number(m[1]);
    const headerStart = m.index ?? 0;
    const titleStart = headerStart + m[0].length;

    // If the same LO number appears more than once (e.g. noise from a summary table), keep the
    // occurrence that appears later in the document — the real "Course content" section always
    // follows the "Elements of Competency" summary table.
    const existing = byLoNumber.get(loNumber);
    if (!existing || headerStart > existing.headerStart) {
      byLoNumber.set(loNumber, { headerStart, titleStart });
    }
  }

  const ordered = Array.from(byLoNumber.entries())
    .map(([loNumber, v]) => ({ loNumber, ...v }))
    .sort((a, b) => a.loNumber - b.loNumber);

  if (ordered.length < 2) {
    return { hasStructure: false, los: [] };
  }

  const tailMatch = rawText
    .slice(ordered[ordered.length - 1].titleStart)
    .match(TAIL_MARKER_RE);
  const tailMarkerOffset =
    tailMatch && tailMatch.index != null
      ? ordered[ordered.length - 1].titleStart + tailMatch.index
      : null;

  const los: LearningOutcomeSection[] = ordered.map((lo, i) => {
    const sectionEnd =
      i + 1 < ordered.length
        ? ordered[i + 1].headerStart
        : (tailMarkerOffset ?? rawText.length);

    // Search for the hours clause anywhere between this LO's title and the next LO (or the
    // document tail) — tolerant of intervening page-break/footer noise.
    const window = rawText.slice(lo.titleStart, sectionEnd);
    const hoursMatch = window.match(HOURS_RE);
    const hours = hoursMatch ? Number(hoursMatch[1]) : null;

    const titleEndRel = hoursMatch?.index ?? window.search(INDICATIVE_HEADER_RE);
    const rawTitle =
      titleEndRel >= 0 ? window.slice(0, titleEndRel) : window.slice(0, 200);
    const title = rawTitle
      .replace(PAGE_FOOTER_RE, " ")
      .replace(/\s+/g, " ")
      .replace(/[:.\-\s]+$/, "")
      .trim();

    const contentStart = hoursMatch
      ? lo.titleStart + hoursMatch.index! + hoursMatch[0].length
      : lo.titleStart;

    return {
      loNumber: lo.loNumber,
      title,
      hours,
      start: contentStart,
      end: sectionEnd,
    };
  });

  return { hasStructure: true, los };
};

/**
 * Splits an LO's "Indicative content" body (between the "Indicative content" marker and the
 * "Resources required..." marker, if present) into individually selectable lines — the finer
 * grain a user needs when a term won't cover an entire Learning Outcome.
 */
export const extractLoContentItems = (
  rawText: string,
  lo: LearningOutcomeSection,
): ContentItem[] => {
  const sectionText = rawText.slice(lo.start, lo.end);

  const indicativeMatch = sectionText.match(INDICATIVE_HEADER_RE);
  const bodyStartRel = indicativeMatch
    ? (indicativeMatch.index ?? 0) + indicativeMatch[0].length
    : 0;

  const resourcesMatch = sectionText
    .slice(bodyStartRel)
    .match(RESOURCES_HEADER_RE);
  const bodyEndRel = resourcesMatch
    ? bodyStartRel + (resourcesMatch.index ?? sectionText.length - bodyStartRel)
    : sectionText.length;

  const contentStart = lo.start + bodyStartRel;
  const contentEnd = lo.start + bodyEndRel;

  const items: ContentItem[] = [];
  let pos = contentStart;
  let idx = 0;
  while (pos <= contentEnd) {
    const nlIdx = rawText.indexOf("\n", pos);
    const lineEnd = nlIdx === -1 || nlIdx > contentEnd ? contentEnd : nlIdx;
    const rawLine = rawText.slice(pos, lineEnd);
    const trimmed = rawLine.trim();
    if (trimmed.length > 2 && !PAGE_FOOTER_CHECK_RE.test(trimmed)) {
      const leadingWs = rawLine.length - rawLine.trimStart().length;
      const itemStart = pos + leadingWs;
      items.push({
        index: idx++,
        text: trimmed,
        start: itemStart,
        end: itemStart + trimmed.length,
      });
    }
    pos = lineEnd + 1;
  }

  return items;
};

/**
 * Maps an academic term (by its 1-based ordinal position among sibling terms in the same
 * academic year) to the Learning Outcome(s) that should be covered that term. Only auto-selects
 * when the document's LO count matches the year's term count 1:1 — otherwise the user must pick
 * manually, since there's no reliable way to guess a partial mapping.
 */
export const mapTermToLearningOutcome = (
  los: LearningOutcomeSection[],
  termOrdinal: number,
  totalTermsInYear: number,
): { autoSelectedLoNumbers: number[] } => {
  if (
    los.length === totalTermsInYear &&
    termOrdinal >= 1 &&
    termOrdinal <= los.length
  ) {
    return { autoSelectedLoNumbers: [los[termOrdinal - 1].loNumber] };
  }
  return { autoSelectedLoNumbers: [] };
};
