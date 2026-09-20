/// <reference lib="dom" />
import puppeteer, { Browser } from "puppeteer";
import QRCode from "qrcode";
import { db } from "../db";
import { eq, and, inArray } from "drizzle-orm";
import {
  SchemeOfWork,
  SchemeOfWorkEntry,
  Subject,
  ClassGroup,
  AcademicTerm,
  AcademicYear,
  UserProfile,
  SubjectCompetency,
  School,
  TeacherSubjectAssignment,
} from "../db/schema";
import storageService from "../utils/fileServer";
import { NotFoundError } from "../errors/CustomError";
import logger from "../utils/logger";

// Same design language as pdfExport.ts (Lesson Notes), kept as an independent, self-contained
// copy rather than a shared import so this renderer's cover-page/table layout can evolve freely
// without risking the Lesson Notes export.
const INK = "#1a2333";
const BODY = "#374151";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const RULE = "#e2e6ee";
const TAN_SOFT = "#f6efe0";
const FONT = `"Segoe UI", Arial, Helvetica, sans-serif`;

const escapeHtml = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Preserves the "- " bullet lines DOCX import / manual entry may have put into a field (e.g.
// Indicative Content) as a real <br>-separated list instead of one run-on line.
const multilineHtml = (s: unknown): string => {
  const str = String(s ?? "").trim();
  if (!str) return "&mdash;";
  return escapeHtml(str).replace(/\n/g, "<br/>");
};

const fmtDate = (d: unknown): string => {
  if (!d) return "N/A";
  const date = new Date(d as string);
  if (isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const weekRangeLabel = (weekNumber: string | null, start: unknown, end: unknown): string => {
  const label = weekNumber || "";
  if (!start || !end) return escapeHtml(label);
  const s = new Date(start as string);
  const e = new Date(end as string);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return escapeHtml(label);
  const range =
    s.getMonth() === e.getMonth()
      ? `${s.getDate().toString().padStart(2, "0")}-${e.getDate().toString().padStart(2, "0")}/${(s.getMonth() + 1)
          .toString()
          .padStart(2, "0")}/${s.getFullYear()}`
      : `${fmtDate(start)} - ${fmtDate(end)}`;
  return `${escapeHtml(label)}<br/><span style="font-weight:400;color:${MUTED};font-size:9px;">${range}</span>`;
};

/** Resolves a School.logo/partner_logo value into something Puppeteer can embed directly: a
 * full http(s) URL is used as-is (Chromium fetches it natively); anything else is treated as a
 * remote file-server path (the shape used elsewhere in this app for uploaded files) and
 * downloaded/base64-inlined, since Puppeteer's isolated page has no session/API-key context to
 * fetch it through the normal authenticated download flow. Returns null (never a bundled
 * fallback image) when there's nothing to show or the fetch fails. */
function mimeFromExt(value: string): string {
  const ext = value.split(".").pop()?.toLowerCase();
  return ext === "jpg" || ext === "jpeg"
    ? "image/jpeg"
    : ext === "svg"
      ? "image/svg+xml"
      : ext === "webp"
        ? "image/webp"
        : "image/png";
}

async function resolveLogoSrc(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    const buffer = await storageService.downloadToBuffer(value);
    return `data:${mimeFromExt(value)};base64,${buffer.toString("base64")}`;
  } catch (err) {
    logger.warn("Failed to resolve logo for Scheme of Work PDF", {
      value,
      error: (err as Error).message,
    });
    return null;
  }
}

/* Puppeteer's headerTemplate/footerTemplate renders in an isolated frame that cannot fetch
 * external resources -- a plain http(s) <img src> silently renders blank there (unlike the main
 * page, which can load remote images fine). So the header logo specifically must always be a
 * data: URI, even when the stored value is already a full external URL. */
async function resolveLogoForHeader(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const res = await fetch(value);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") || mimeFromExt(value);
      return `data:${contentType};base64,${buffer.toString("base64")}`;
    } catch (err) {
      logger.warn("Failed to fetch remote logo for Scheme of Work PDF header", {
        value,
        error: (err as Error).message,
      });
      return null;
    }
  }
  return resolveLogoSrc(value);
}

/** Base URL of the deployed frontend, used only to build the verification link encoded in the
 * QR code below -- falls back to the local dev server since this app has never needed a
 * frontend-linking env var before now (unlike password-reset emails etc., which this codebase
 * doesn't send either). Set FRONTEND_URL in production to the real public domain. */
const FRONTEND_BASE_URL = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");

/** Generates the verification QR code printed once, on the last page next to the signature
 * block (not repeated on every page -- see buildHtml), encoding a link to the public
 * (unauthenticated) verification endpoint. Sized generously (280px source) since it's now a
 * document-level feature next to the signatures, not a small running-header mark, so it stays
 * crisp and easy to scan off a printed page. Returns null (never blocks the PDF) if QR generation
 * fails for any reason. */
async function buildVerificationQr(schemeId: number): Promise<string | null> {
  try {
    const verifyUrl = `${FRONTEND_BASE_URL}/verify/${schemeId}`;
    return await QRCode.toDataURL(verifyUrl, {
      margin: 0,
      width: 280,
      color: { dark: INK, light: "#ffffff" },
    });
  } catch (err) {
    logger.warn("Failed to generate verification QR code for Scheme of Work PDF", {
      schemeId,
      error: (err as Error).message,
    });
    return null;
  }
}

// Puppeteer renders headerTemplate/footerTemplate in a constrained frame with no access to the
// page's own <style> or external stylesheets, and only inline styles reliably apply there (same
// constraint documented in pdfExport.ts for Lesson Notes) -- every rule below is inlined.
//
// Chromium's header/footer frame always spans the FULL page width, ignoring the left/right
// margins passed to page.pdf() -- those only carve out the body content's margin, not the
// header/footer's. Using CSS `margin` on the inner table (the previous approach) doesn't fix
// this: width:100% plus an additional margin just pushes the box past the frame's right edge
// instead of insetting it symmetrically. `padding` with `box-sizing:border-box` keeps the table
// at exactly 100% of the frame while insetting its content on both sides -- using the same
// MARGIN_SIDE_MM as the body content below, so the header/footer visually lines up with the
// page's actual side margins instead of sitting flush against the paper edge.
//
// The running header repeated on every page shows the school's mark top-left, sized generously
// (48px) to read as a real document header rather than a small watermark -- matching the correct
// template (its header is one logo image with the academy's wordmark baked in, not two
// side-by-side marks; that's only true of the cover page). This logo is School.documents_logo
// specifically (a mark dedicated to reports/documents, distinct from the two cover-page logo
// slots), falling back to School.logo so a school that hasn't set the new field yet doesn't lose
// its header logo. The verification QR code lives once in the document body next to the
// signatures (see buildHtml), not repeated here on every page.
const buildHeaderTemplate = (documentsLogo: string | null, schoolName: string) => `
  <table style="width:100%;box-sizing:border-box;padding:0 ${MARGIN_SIDE_MM}mm;font-family:${FONT};border-collapse:collapse;">
    <tr>
      <td style="text-align:left;vertical-align:middle;">
        ${
          documentsLogo
            ? `<img src="${documentsLogo}" style="height:48px;width:auto;max-width:260px;vertical-align:middle;" />`
            : schoolName
              ? `<span style="font-size:13px;font-weight:700;color:${INK};">${escapeHtml(schoolName)}</span>`
              : ""
        }
      </td>
    </tr>
  </table>
`;

const buildFooterTemplate = (footerText: string) => `
  <table style="width:100%;box-sizing:border-box;padding:0 ${MARGIN_SIDE_MM}mm;font-family:${FONT};border-collapse:collapse;">
    <tr>
      <td style="text-align:center;">
        <span style="font-size:8.5px;color:${MUTED};">${escapeHtml(footerText)} <span class="pageNumber"></span></span>
      </td>
    </tr>
  </table>
`;

export interface SchemeReportRow {
  entry_id: number;
  week_number: string | null;
  start_date: unknown;
  end_date: unknown;
  topic: string | null;
  methodology: string | null;
  resources: string | null;
  evaluation: string | null;
  learning_place: string | null;
  observation: string | null;
  entry_status: string;
  competencyId: number | null;
  competencyTitle: string | null;
  competencyElementNumber: number | null;
  competencyHours: number | null;
}

async function buildReportData(schemeId: number) {
  const [scheme] = await db
    .select({
      scheme_id: SchemeOfWork.scheme_id,
      subject_id: SchemeOfWork.subject_id,
      user_id: SchemeOfWork.user_id,
      academic_year_id: AcademicTerm.academic_year_id,
      module_code: SchemeOfWork.module_code,
      scheme_date: SchemeOfWork.scheme_date,
      approver_name: SchemeOfWork.approver_name,
      approver_title: SchemeOfWork.approver_title,
      trainer_signed: SchemeOfWork.trainer_signed,
      approver_signed: SchemeOfWork.approver_signed,
      subject_name: Subject.name,
      subject_code: Subject.code,
      // RQF Level and Learning Hours are Subject-level facts (shared by every scheme of this
      // subject), not re-entered per scheme -- see migration 079.
      rqf_level: Subject.rqf_level,
      learning_hours: Subject.learning_hours,
      class_group_name: ClassGroup.name,
      term_name: AcademicTerm.name,
      year_name: AcademicYear.name,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
    })
    .from(SchemeOfWork)
    .leftJoin(Subject, eq(SchemeOfWork.subject_id, Subject.subject_id))
    .leftJoin(ClassGroup, eq(SchemeOfWork.class_group_id, ClassGroup.class_group_id))
    .leftJoin(AcademicTerm, eq(SchemeOfWork.academic_term_id, AcademicTerm.academic_term_id))
    .leftJoin(AcademicYear, eq(AcademicTerm.academic_year_id, AcademicYear.academic_year_id))
    .leftJoin(UserProfile, eq(SchemeOfWork.user_id, UserProfile.user_id))
    .where(eq(SchemeOfWork.scheme_id, schemeId))
    .limit(1);

  if (!scheme) {
    throw new NotFoundError("Scheme of work not found");
  }

  // Sector/Trade/Qualification Title are School-level facts (shared by every scheme this school
  // produces) -- see migration 079. This app is single-tenant (one School row); if that ever
  // changes, this needs to resolve the scheme's actual owning school instead of "the first one".
  const [school] = await db.select().from(School).limit(1);

  // "Number of Classes" is derived, not stored: every class group this subject is actually
  // being taught to in the scheme's academic year, via TeacherSubjectAssignment.
  const classGroupRows = scheme.academic_year_id
    ? await db
        .selectDistinct({ class_group_id: TeacherSubjectAssignment.class_group_id })
        .from(TeacherSubjectAssignment)
        .where(
          and(
            eq(TeacherSubjectAssignment.subject_id, scheme.subject_id),
            eq(TeacherSubjectAssignment.academic_year_id, scheme.academic_year_id),
          ),
        )
    : [];
  const numberOfClasses = classGroupRows.length;

  const rawEntries = await db
    .select()
    .from(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.scheme_id, schemeId))
    .orderBy(SchemeOfWorkEntry.start_date);

  const competencyIds = [
    ...new Set(rawEntries.map((e) => e.competency_id).filter((id): id is number => id != null)),
  ];
  const competencies = competencyIds.length
    ? await db
        .select()
        .from(SubjectCompetency)
        .where(inArray(SubjectCompetency.competency_id, competencyIds))
    : [];
  const competencyById = new Map(competencies.map((c) => [c.competency_id, c]));

  // Grouping consecutive rows sharing the same competency_id under one rowspan (the template's
  // "Competence code and name" merge) happens later, in planPagination -- it has to be aware of
  // where page breaks will actually fall, since a rowspan cell can't be split across a PDF page
  // break (see the comment on planPagination for the full story).
  const rows: SchemeReportRow[] = rawEntries.map((e) => {
    const competency = e.competency_id ? competencyById.get(e.competency_id) : undefined;
    return {
      entry_id: e.entry_id,
      week_number: e.week_number,
      start_date: e.start_date,
      end_date: e.end_date,
      topic: e.topic,
      methodology: e.methodology,
      resources: e.resources,
      evaluation: e.evaluation,
      learning_place: e.learning_place,
      observation: e.observation,
      entry_status: e.entry_status,
      competencyId: e.competency_id,
      competencyTitle: competency?.title ?? null,
      competencyElementNumber: competency?.element_number ?? null,
      competencyHours: competency?.learning_hours ?? null,
    };
  });

  return { scheme, school, rows, numberOfClasses };
}

// ============================================================================
// Page geometry -- must match the margins/format passed to page.pdf() below exactly, since the
// pagination plan (planPagination) is computed by measuring real rendered row heights against
// these same budgets. If the margins/format change, these constants must change with them.
// ============================================================================
const PX_PER_MM = 96 / 25.4;
const PAGE_WIDTH_MM = 297; // A4 landscape
const PAGE_HEIGHT_MM = 210;
const MARGIN_TOP_MM = 20; // roomier than the body's other margins so a professionally-sized header logo has space to breathe
const MARGIN_BOTTOM_MM = 14;
const MARGIN_SIDE_MM = 10;
const CONTENT_WIDTH_PX = Math.round((PAGE_WIDTH_MM - 2 * MARGIN_SIDE_MM) * PX_PER_MM);
const CONTENT_HEIGHT_PX = (PAGE_HEIGHT_MM - MARGIN_TOP_MM - MARGIN_BOTTOM_MM) * PX_PER_MM;

const PAGE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: ${FONT}; color: ${BODY}; margin: 0; font-size: 10px; line-height: 1.3; }
  .doc-title { text-align: center; font-size: 14px; font-weight: 800; color: ${INK}; margin: 0 0 3px; }
  .doc-school { text-align: center; font-size: 11px; font-weight: 700; color: #b7472a; margin: 0 0 8px; }
  /* Identification block: two independently-lengthed columns side by side (not one grid where
     every row is forced to pair up) -- the left column (Sector/Trade/Qualification/RQF
     Level/Date) is naturally shorter than the right (Trainer/School Year/Term/Module
     details/Module code/Learning hours/Number of Classes/Class Name), matching the reference
     template's actual layout exactly rather than a single uniform 4-column grid. */
  .detail-grid { display: flex; border: 1px solid ${RULE}; margin-bottom: 10px; }
  .detail-col { flex: 1 1 50%; width: 50%; border-collapse: collapse; font-size: 10px; }
  .detail-col:first-child { border-right: 1px solid ${RULE}; }
  .detail-col td { padding: 4px 10px; }
  .detail-col tr.detail-row:nth-of-type(even) { background: #fbfaf7; }
  .dl-label { font-weight: 700; color: ${INK}; width: 40%; }
  .dl-value { color: ${BODY}; }
  .module-divider td { text-align: left; background: ${INK}; color: #fff; font-weight: 700; padding: 4px 10px; font-size: 10px; }
  .signatures { margin-top: 18px; page-break-inside: avoid; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
  .sig-names { flex: 1; }
  .sig-block { margin-bottom: 12px; }
  .sig-label { font-weight: 700; color: ${INK}; }
  .sig-name { color: ${BODY}; }
  .sig-title { color: ${MUTED}; }
  .verify-block { flex-shrink: 0; text-align: center; }
  .verify-block img { width: 64px; height: 64px; display: block; margin: 0 auto 4px; }
  .verify-block .verify-label { font-size: 8px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; color: ${MUTED}; }
  .verify-block .verify-ref { font-size: 7px; color: ${FAINT}; margin-top: 1px; }
  table.report-table { width: 100%; border-collapse: collapse; font-size: 8.5px; line-height: 1.3; }
  table.report-table thead { display: table-header-group; }
  table.report-table th {
    background: ${TAN_SOFT}; color: ${INK}; font-weight: 700; text-transform: uppercase;
    font-size: 8px; letter-spacing: 0.02em; padding: 4px 6px; border: 1px solid ${RULE}; text-align: left;
  }
  table.report-table td {
    border: 1px solid ${RULE}; padding: 3px 6px; vertical-align: top; word-wrap: break-word;
  }
  table.report-table tr:nth-child(even) td { background: #fbfbfd; }
  table.report-table tr { page-break-inside: avoid; }
  table.report-table tr.lo-group-start td { border-top: 2px solid ${INK}; }
  table.report-table tr.page-break-before { page-break-before: always; }
  .col-week { width: 8%; } .col-lo { width: 14%; } .col-duration { width: 6%; text-align: center; }
  .col-ic { width: 15%; } .col-act { width: 15%; } .col-res { width: 13%; } .col-eval { width: 13%; }
  .col-place { width: 8%; } .col-obs { width: 8%; }
`;

// Two-row header: "Competence code and name" is a group heading over its own three real
// sub-columns (Learning outcome, Duration, Indicative content), matching the reference
// template's grouped header exactly rather than cramming all three into one wide free-text cell.
const THEAD_HTML = `
  <tr>
    <th class="col-week" rowspan="2">Weeks</th>
    <th colspan="3">Competence code and name</th>
    <th class="col-act" rowspan="2">Learning Activities</th>
    <th class="col-res" rowspan="2">Resources (Equipment, tools, materials)</th>
    <th class="col-eval" rowspan="2">Evidences of formative assessment</th>
    <th class="col-place" rowspan="2">Learning Place</th>
    <th class="col-obs" rowspan="2">Observation</th>
  </tr>
  <tr>
    <th class="col-lo">Learning outcome (LO)</th>
    <th class="col-duration">Duration</th>
    <th class="col-ic">Indicative content (IC)</th>
  </tr>
`;

const dlRow = (label: string, value: string) => `
  <tr class="detail-row">
    <td class="dl-label">${escapeHtml(label)}:</td>
    <td class="dl-value">${escapeHtml(value) || "N/A"}</td>
  </tr>
`;

const buildTopBlockHtml = (
  scheme: Awaited<ReturnType<typeof buildReportData>>["scheme"],
  school: Awaited<ReturnType<typeof buildReportData>>["school"],
  numberOfClasses: number,
  docTitle: string,
  trainerName: string,
): string => {
  const moduleCodeAndTitle = [scheme.module_code, scheme.subject_name].filter(Boolean).join(": ");
  return `
  <h1 class="doc-title">${docTitle}</h1>
  <div class="doc-school">${escapeHtml(school?.name)}</div>

  <div class="detail-grid">
    <table class="detail-col">
      ${dlRow("Sector", school?.sector || "")}
      ${dlRow("Trade", school?.trade || "")}
      ${dlRow("Qualification Title", school?.qualification_title || "")}
      ${dlRow("RQF Level", scheme.rqf_level || "")}
      ${dlRow("Date", fmtDate(scheme.scheme_date))}
    </table>
    <table class="detail-col">
      ${dlRow("Trainer", trainerName)}
      ${dlRow("School Year", scheme.year_name || "")}
      ${dlRow("Term", scheme.term_name || "")}
      <tr class="module-divider"><td colspan="2">Module details</td></tr>
      ${dlRow("Module code and title", moduleCodeAndTitle)}
      ${dlRow("Learning hours", scheme.learning_hours || "")}
      ${dlRow("Number of Classes", String(numberOfClasses))}
      ${dlRow("Class Name", scheme.class_group_name || "")}
    </table>
  </div>
`;
};

const buildLoContent = (r: SchemeReportRow): string =>
  r.competencyTitle
    ? `<div style="font-weight:700;color:${INK};">Learning outcome ${r.competencyElementNumber}: ${escapeHtml(r.competencyTitle)}</div>`
    : `<div style="color:${FAINT};font-style:italic;">No Learning Outcome linked</div>`;

const buildDurationContent = (r: SchemeReportRow): string =>
  r.competencyHours ? `${r.competencyHours} hours` : "&mdash;";

/** The "Competence code and name" group's two real sub-columns (matching the reference
 * template): "Learning outcome (LO)" and "Duration" are both Learning-Outcome-level facts, so
 * they rowspan-merge together across a group exactly like the old single combined cell did.
 * Duration always renders as its own bordered cell -- even for an unlinked group, where it just
 * shows the placeholder dash -- so the column stays visually present and consistent down the
 * whole table instead of disappearing whenever a week has no Learning Outcome linked.
 * `rowSpanAttr` is empty for the unspanned measurement pass. */
const buildLoDurationCells = (r: SchemeReportRow, rowSpanAttr: string): string =>
  `<td${rowSpanAttr} class="col-lo">${buildLoContent(r)}</td><td${rowSpanAttr} class="col-duration">${buildDurationContent(r)}</td>`;

// The 9 leaf columns are: Weeks, Learning outcome, Duration, IC, Activities, Resources, Evidence,
// Place, Observation. A skipped week only shows the Weeks cell and (on a group's first row) the
// Learning-outcome/Duration cells, plus one merged message cell -- that message cell must span
// the remaining 6 columns (IC through Observation), not 5 (a previous version's off-by-one
// silently dropped the Observation column and misaligned every skipped row against the rest of
// the table).
export const SKIPPED_MERGED_COLSPAN = 6;

/** Builds one row's <td> cells only (no <tr> wrapper, no rowspan) -- used for the measurement
 * pass, where every row is measured standalone so its real, final rendered height is known
 * regardless of how it ends up grouped. Including the (usually short, 1-2 line) competence text
 * on every measured row is a deliberately safe overestimate for continuation rows, where that
 * cell won't actually be rendered (it's covered by a previous row's rowspan) -- overestimating a
 * row's height risks wasting a little space, underestimating risks overflow, so this errs toward
 * the safe side. */
const buildMeasurementCellsHtml = (r: SchemeReportRow): string => {
  const loDurationCells = buildLoDurationCells(r, "");
  if (r.entry_status === "SKIPPED") {
    return `
      <td>${weekRangeLabel(r.week_number, r.start_date, r.end_date)}</td>
      ${loDurationCells}
      <td colspan="${SKIPPED_MERGED_COLSPAN}" style="text-align:center;color:${MUTED};font-style:italic;background:#fafafa;">
        Skipped / Holiday &mdash; no lesson scheduled this week
      </td>`;
  }
  return `
      <td>${weekRangeLabel(r.week_number, r.start_date, r.end_date)}</td>
      ${loDurationCells}
      <td>${multilineHtml(r.topic)}</td>
      <td>${multilineHtml(r.methodology)}</td>
      <td>${multilineHtml(r.resources)}</td>
      <td>${multilineHtml(r.evaluation)}</td>
      <td>${multilineHtml(r.learning_place)}</td>
      <td>${multilineHtml(r.observation)}</td>`;
};

export interface PlanEntry {
  isGroupStart: boolean;
  rowSpan: number;
  pageBreakBefore: boolean;
}

/** Builds the final <tr> for one row, given its computed plan entry: rowspan-merged Learning
 * Outcome/Duration cells on the group's first row (matching the correct template exactly),
 * omitted entirely on continuation rows (standard HTML rowspan), and an explicit forced page
 * break on rows where planPagination decided a new page must start. Because every page break is
 * forced at a point planPagination chose specifically to be a group boundary, no rowspan cell
 * here can ever straddle a page break. */
const buildFinalRowHtml = (r: SchemeReportRow, plan: PlanEntry): string => {
  const classes = [plan.isGroupStart ? "lo-group-start" : "", plan.pageBreakBefore ? "page-break-before" : ""]
    .filter(Boolean)
    .join(" ");
  const rowAttr = classes ? ` class="${classes}"` : "";
  const loDurationCells = plan.isGroupStart ? buildLoDurationCells(r, ` rowspan="${plan.rowSpan}"`) : "";

  if (r.entry_status === "SKIPPED") {
    return `
        <tr${rowAttr}>
          <td>${weekRangeLabel(r.week_number, r.start_date, r.end_date)}</td>
          ${loDurationCells}
          <td colspan="${SKIPPED_MERGED_COLSPAN}" style="text-align:center;color:${MUTED};font-style:italic;background:#fafafa;">
            Skipped / Holiday &mdash; no lesson scheduled this week
          </td>
        </tr>`;
  }

  return `
        <tr${rowAttr}>
          <td>${weekRangeLabel(r.week_number, r.start_date, r.end_date)}</td>
          ${loDurationCells}
          <td>${multilineHtml(r.topic)}</td>
          <td>${multilineHtml(r.methodology)}</td>
          <td>${multilineHtml(r.resources)}</td>
          <td>${multilineHtml(r.evaluation)}</td>
          <td>${multilineHtml(r.learning_place)}</td>
          <td>${multilineHtml(r.observation)}</td>
        </tr>`;
};

/** Measures the real rendered height (in CSS px, at the exact content width page.pdf() will use)
 * of the identification block, the table header, and every row -- by actually rendering them in
 * a plain, unpaginated page with the identical CSS/markup the final PDF uses. This is what makes
 * planPagination's page-break math trustworthy: it's working from real layout numbers, not
 * estimates, for this exact content (variable-length real text, real fonts, real column widths). */
async function measureLayout(
  browser: Browser,
  topBlockHtml: string,
  rows: SchemeReportRow[],
): Promise<{ topBlockHeight: number; theadHeight: number; rowHeights: number[] }> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: CONTENT_WIDTH_PX, height: 1600 });
    const tbody = rows.map((r) => `<tr>${buildMeasurementCellsHtml(r)}</tr>`).join("");
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>${PAGE_CSS}</style>
</head>
<body>
  <div id="measure-topblock">${topBlockHtml}</div>
  <table class="report-table">
    <thead id="measure-thead">${THEAD_HTML}</thead>
    <tbody id="measure-tbody">${tbody}</tbody>
  </table>
</body>
</html>`;
    await page.setContent(html, { waitUntil: "load" });
    return await page.evaluate(() => {
      const topBlockHeight = document.getElementById("measure-topblock")!.getBoundingClientRect().height;
      const theadHeight = document.getElementById("measure-thead")!.getBoundingClientRect().height;
      // Scoped to the measurement table's own tbody specifically -- a bare "tbody tr" selector
      // also matches the identification block's <table class="detail-col"> rows, since a
      // browser silently wraps any bare <tr>s in an implicit <tbody> even when none is written.
      // That mismatch (more heights than rows) was found directly during testing: it silently
      // shifted every row's height by one slot, corrupting the whole pagination plan.
      const rowHeights = Array.from(document.querySelectorAll("#measure-tbody > tr")).map(
        (el) => el.getBoundingClientRect().height,
      );
      return { topBlockHeight, theadHeight, rowHeights };
    });
  } finally {
    await page.close();
  }
}

/** Decides exactly where the printed table will break across pages, and only then groups
 * consecutive same-Learning-Outcome rows into a real HTML rowspan (matching the correct
 * template's "Competence code and name" merged cell) within each page -- never across one.
 *
 * A true rowspan cell cannot be split across a PDF page break: if a whole multi-week Learning
 * Outcome group doesn't fit in the space left on the page, Chromium moves the ENTIRE group to
 * the next page rather than splitting it. For a scheme where one Learning Outcome spans many
 * consecutive weeks (seen directly in production: 12 weeks under one LO, spanning ~4 pages),
 * naively rowspanning the whole group is not just ugly, it's impossible -- so page breaks are
 * computed first, from real measured row heights against the same content-height budget
 * page.pdf() uses, and a rowspan group is only ever allowed to span rows that land on one
 * computed page together. Every forced page break is therefore also a guaranteed-safe group
 * boundary. */
export function planPagination(
  rows: SchemeReportRow[],
  heights: { topBlockHeight: number; theadHeight: number; rowHeights: number[] },
): PlanEntry[] {
  // Small safety cushion against sub-pixel rounding differences between this measurement pass
  // and the actual print layout (different internal rounding for border/font metrics), so a row
  // that measures as *just* fitting doesn't end up overflowing by a pixel or two in the real PDF.
  const SAFETY_MARGIN_PX = 8;
  const firstPageAvail = CONTENT_HEIGHT_PX - heights.topBlockHeight - heights.theadHeight - SAFETY_MARGIN_PX;
  const laterPageAvail = CONTENT_HEIGHT_PX - heights.theadHeight - SAFETY_MARGIN_PX;

  const plan: PlanEntry[] = rows.map(() => ({ isGroupStart: false, rowSpan: 1, pageBreakBefore: false }));

  let remaining = firstPageAvail;
  let groupStartIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const rowHeight = heights.rowHeights[i] || 0;
    const sameGroupAsPrev = i > 0 && rows[i].competencyId === rows[i - 1].competencyId;

    let pageBreakBefore = false;
    if (i > 0 && rowHeight > remaining) {
      // Doesn't fit in what's left on the current page -- start a fresh page here. This is also
      // always a fresh rowspan group, even if the Learning Outcome is unchanged, since the
      // previous group cannot be extended across the break.
      pageBreakBefore = true;
      remaining = laterPageAvail;
    }

    if (sameGroupAsPrev && !pageBreakBefore) {
      plan[groupStartIdx].rowSpan++;
    } else {
      groupStartIdx = i;
      plan[i] = { isGroupStart: true, rowSpan: 1, pageBreakBefore };
    }

    remaining -= rowHeight;
  }

  return plan;
}

const buildHtml = (
  scheme: Awaited<ReturnType<typeof buildReportData>>["scheme"],
  school: Awaited<ReturnType<typeof buildReportData>>["school"],
  numberOfClasses: number,
  rows: SchemeReportRow[],
  plan: PlanEntry[],
  verificationQr: string | null,
): string => {
  const trainerName = `${scheme.first_name || ""} ${scheme.last_name || ""}`.trim() || "N/A";
  const subjectLabel = scheme.subject_code
    ? `${scheme.subject_code}: ${scheme.subject_name}`
    : scheme.subject_name || "N/A";
  const docTitle = `${escapeHtml(scheme.term_name)} Scheme of Work for ${escapeHtml(subjectLabel)}`;

  const bodyRows = rows.map((r, i) => buildFinalRowHtml(r, plan[i])).join("");

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>${PAGE_CSS}</style>
</head>
<body>
  ${buildTopBlockHtml(scheme, school, numberOfClasses, docTitle, trainerName)}

  <table class="report-table">
    <thead>${THEAD_HTML}</thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="9" style="text-align:center;color:${MUTED};padding:20px;">No weekly entries yet</td></tr>`}
    </tbody>
  </table>

  <div class="signatures">
    <div class="sig-names">
      <div class="sig-block">
        <div class="sig-label">Trainer's name and Signature:</div>
        <div class="sig-name">${escapeHtml(trainerName)}${scheme.trainer_signed ? " &mdash; Signed" : ""}</div>
      </div>
      <div class="sig-block">
        <div class="sig-label">Verified and approved by:</div>
        <div class="sig-name">${escapeHtml(scheme.approver_name || "N/A")}${scheme.approver_signed ? " &mdash; Signed" : ""}</div>
        ${scheme.approver_title ? `<div class="sig-title">${escapeHtml(scheme.approver_title)}</div>` : ""}
      </div>
    </div>
    ${
      verificationQr
        ? `<div class="verify-block">
             <img src="${verificationQr}" />
             <div class="verify-label">Scan to verify</div>
             <div class="verify-ref">Ref #${scheme.scheme_id}</div>
           </div>`
        : ""
    }
  </div>
</body>
</html>`;
};

async function printHtmlToPdf(
  browser: Browser,
  html: string,
  headerTemplate: string,
  footerTemplate: string,
): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "a4",
      landscape: true,
      printBackground: true,
      margin: {
        top: `${MARGIN_TOP_MM}mm`,
        bottom: `${MARGIN_BOTTOM_MM}mm`,
        left: `${MARGIN_SIDE_MM}mm`,
        right: `${MARGIN_SIDE_MM}mm`,
      },
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/** Renders the full Scheme of Work report (identification block, weekly table, and signatures --
 * one continuous flowing document, matching the correct printed template) to a PDF buffer. Used
 * by both the preview (streamed inline) and download endpoints, so preview and export are always
 * pixel-identical -- there is exactly one renderer. The school's documents_logo (or its primary
 * cover-page logo, as a fallback) repeats in a running header and "{School} | {Module} — {Term}
 * Scheme of Work | Page N" repeats in a running footer on every page, matching the reference
 * template exactly. A verification QR code appears once, next to the signature block at the end
 * of the document (so only on the last page, since it's part of the flowing content rather than a
 * repeating header/footer element) -- see buildVerificationQr. Learning Outcome groups are
 * genuinely rowspan-merged (not just repeated), computed by planPagination so a merge never
 * straddles a page break -- see its doc comment for why that matters. */
export async function renderSchemeOfWorkPdf(schemeId: number): Promise<Buffer> {
  const { scheme, school, rows, numberOfClasses } = await buildReportData(schemeId);
  // Reports/documents header uses the dedicated documents_logo when a school has set one, and
  // falls back to the primary cover-page logo otherwise (so nothing goes blank for a school that
  // simply hasn't uploaded the new, more specific logo yet). Resolved via resolveLogoForHeader
  // (always a data: URI), since Puppeteer's header/footer frame can't fetch external http(s)
  // images the way the main page can.
  const headerLogo = await resolveLogoForHeader(school?.documents_logo || school?.logo);
  const verificationQr = await buildVerificationQr(schemeId);

  const trainerName = `${scheme.first_name || ""} ${scheme.last_name || ""}`.trim() || "N/A";
  const subjectLabel = scheme.subject_code
    ? `${scheme.subject_code}: ${scheme.subject_name}`
    : scheme.subject_name || "N/A";
  const docTitle = `${escapeHtml(scheme.term_name)} Scheme of Work for ${escapeHtml(subjectLabel)}`;
  const topBlockHtml = buildTopBlockHtml(scheme, school, numberOfClasses, docTitle, trainerName);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const heights = await measureLayout(browser, topBlockHtml, rows);
    const plan = planPagination(rows, heights);
    const html = buildHtml(scheme, school, numberOfClasses, rows, plan, verificationQr);

    const footerLabel = [
      school?.name,
      [scheme.module_code, `${scheme.term_name} Scheme of Work`].filter(Boolean).join(" — "),
    ]
      .filter(Boolean)
      .join(" | ");
    const headerTemplate = buildHeaderTemplate(headerLogo, school?.name || "");
    const footerTemplate = buildFooterTemplate(`${footerLabel}${footerLabel ? " | Page" : "Page"}`);

    return await printHtmlToPdf(browser, html, headerTemplate, footerTemplate);
  } finally {
    await browser.close();
  }
}
