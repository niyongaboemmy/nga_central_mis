import puppeteer from "puppeteer";
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
async function resolveLogoSrc(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    const buffer = await storageService.downloadToBuffer(value);
    const ext = value.split(".").pop()?.toLowerCase();
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "svg"
          ? "image/svg+xml"
          : ext === "webp"
            ? "image/webp"
            : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (err) {
    logger.warn("Failed to resolve logo for Scheme of Work PDF", {
      value,
      error: (err as Error).message,
    });
    return null;
  }
}

// Puppeteer renders headerTemplate/footerTemplate in a constrained frame with no access to the
// page's own <style> or external stylesheets, and only inline styles reliably apply there (same
// constraint documented in pdfExport.ts for Lesson Notes) -- every rule below is inlined.
const buildHeaderTemplate = (logo1: string | null, logo2: string | null, schoolName: string) => `
  <table style="width:100%;font-family:${FONT};border-collapse:collapse;margin:0 10mm;">
    <tr>
      <td style="text-align:left;vertical-align:middle;">
        ${
          logo1
            ? `<img src="${logo1}" style="height:20px;width:auto;vertical-align:middle;" />`
            : schoolName
              ? `<span style="font-size:9px;font-weight:700;color:${INK};">${escapeHtml(schoolName)}</span>`
              : ""
        }
      </td>
      <td style="text-align:right;vertical-align:middle;">
        ${logo2 ? `<img src="${logo2}" style="height:20px;width:auto;vertical-align:middle;" />` : ""}
      </td>
    </tr>
  </table>
`;

const buildFooterTemplate = (footerText: string) => `
  <table style="width:100%;font-family:${FONT};border-collapse:collapse;margin:0 10mm;">
    <tr>
      <td style="text-align:center;">
        <span style="font-size:8.5px;color:${MUTED};">${escapeHtml(footerText)} <span class="pageNumber"></span></span>
      </td>
    </tr>
  </table>
`;

const detailRow = (label: string, value: string, label2: string, value2: string) => `
  <tr>
    <td style="padding:5px 10px;font-weight:700;color:${INK};width:16%;">${escapeHtml(label)}:</td>
    <td style="padding:5px 10px;color:${BODY};width:34%;">${escapeHtml(value) || "N/A"}</td>
    <td style="padding:5px 10px;font-weight:700;color:${INK};width:16%;">${escapeHtml(label2)}:</td>
    <td style="padding:5px 10px;color:${BODY};width:34%;">${escapeHtml(value2) || "N/A"}</td>
  </tr>
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
  competencyTitle: string | null;
  competencyElementNumber: number | null;
  competencyHours: number | null;
  rowSpan: number;
  isGroupStart: boolean;
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

  // Group consecutive rows sharing the same competency_id under one rowspan, matching the
  // template's "Competence code and name" grouping -- the same rowspan-merge idea the old
  // client-side jsPDF renderer implemented for rendering, now driven by a real FK instead of
  // fragile string-equality on free-text fields.
  const rows: SchemeReportRow[] = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const e = rawEntries[i];
    const competency = e.competency_id ? competencyById.get(e.competency_id) : undefined;
    const isGroupStart = i === 0 || rawEntries[i - 1].competency_id !== e.competency_id;
    let rowSpan = 1;
    if (isGroupStart) {
      for (let j = i + 1; j < rawEntries.length && rawEntries[j].competency_id === e.competency_id; j++) {
        rowSpan++;
      }
    }
    rows.push({
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
      competencyTitle: competency?.title ?? null,
      competencyElementNumber: competency?.element_number ?? null,
      competencyHours: competency?.learning_hours ?? null,
      rowSpan,
      isGroupStart,
    });
  }

  return { scheme, school, rows, numberOfClasses };
}

const buildHtml = (
  scheme: Awaited<ReturnType<typeof buildReportData>>["scheme"],
  school: Awaited<ReturnType<typeof buildReportData>>["school"],
  numberOfClasses: number,
  logo1: string | null,
  logo2: string | null,
  rows: SchemeReportRow[],
): string => {
  const trainerName = `${scheme.first_name || ""} ${scheme.last_name || ""}`.trim() || "N/A";
  const subjectLabel = scheme.subject_code
    ? `${scheme.subject_code}: ${scheme.subject_name}`
    : scheme.subject_name || "N/A";

  const bodyRows = rows
    .map((r) => {
      // Repeated (not rowspan-merged) on every row of the group, deliberately: a true HTML
      // rowspan cell can't be split across a PDF page break, so if a whole multi-week Learning
      // Outcome group didn't fit in the space left on the current page, Chromium moved the
      // ENTIRE group to the next page rather than splitting it -- leaving large blank gaps
      // (confirmed directly against real content during testing). Repeating the text lets every
      // row break independently; `isGroupStart` still gets a visual divider so groups remain
      // easy to scan.
      const rowClass = r.isGroupStart ? ' class="lo-group-start"' : "";
      const competenceCell = `<td>
             ${
               r.competencyTitle
                 ? `<div style="font-weight:700;color:${INK};margin-bottom:2px;">Learning outcome ${r.competencyElementNumber}: ${escapeHtml(r.competencyTitle)}</div>`
                 : `<div style="color:${FAINT};font-style:italic;">No Learning Outcome linked</div>`
             }
             ${r.competencyHours ? `<div style="font-size:8px;color:${MUTED};">Duration: ${r.competencyHours} hours</div>` : ""}
           </td>`;

      if (r.entry_status === "SKIPPED") {
        return `
        <tr${rowClass}>
          <td>${weekRangeLabel(r.week_number, r.start_date, r.end_date)}</td>
          ${competenceCell}
          <td colspan="5" style="text-align:center;color:${MUTED};font-style:italic;background:#fafafa;">
            Skipped / Holiday &mdash; no lesson scheduled this week
          </td>
        </tr>`;
      }

      return `
        <tr${rowClass}>
          <td>${weekRangeLabel(r.week_number, r.start_date, r.end_date)}</td>
          ${competenceCell}
          <td>${multilineHtml(r.topic)}</td>
          <td>${multilineHtml(r.methodology)}</td>
          <td>${multilineHtml(r.resources)}</td>
          <td>${multilineHtml(r.evaluation)}</td>
          <td>${multilineHtml(r.learning_place)}</td>
          <td>${multilineHtml(r.observation)}</td>
        </tr>`;
    })
    .join("");

  const moduleCodeAndTitle = [scheme.module_code, scheme.subject_name].filter(Boolean).join(": ");
  const docTitle = `${escapeHtml(scheme.term_name)} Scheme of Work for ${escapeHtml(subjectLabel)}`;

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: ${FONT}; color: ${BODY}; margin: 0; font-size: 10px; line-height: 1.3; }
  .doc-title { text-align: center; font-size: 14px; font-weight: 800; color: ${INK}; margin: 0 0 3px; }
  .doc-school { text-align: center; font-size: 11px; font-weight: 700; color: #b7472a; margin: 0 0 8px; }
  .detail-table { width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid ${RULE}; margin-bottom: 10px; }
  .detail-table td { padding: 3px 8px; }
  .detail-table tr:nth-child(even) { background: #fbfaf7; }
  .module-divider td { text-align: left; background: ${INK}; color: #fff; font-weight: 700; padding: 3px 8px; font-size: 10px; }
  .signatures { margin-top: 18px; page-break-inside: avoid; }
  .sig-block { margin-bottom: 12px; }
  .sig-label { font-weight: 700; color: ${INK}; }
  .sig-name { color: ${BODY}; }
  .sig-title { color: ${MUTED}; }
  /* table-layout deliberately left as the default (auto), not fixed: fixed layout makes Chromium
     pre-measure the whole table's height up front, which behaves worse with rowspan-merged cells
     during pagination than letting it lay out row by row. Column widths are still steered via
     the col-* percentage widths below, just as hints rather than hard constraints.
     A rowspan cell (the "Competence code and name" grouping) can't be split across a page break,
     so if a whole Learning-Outcome group doesn't fit in the remaining space on the current page,
     Chromium moves that entire group to the next page -- by design, not a bug. Keeping the table
     typography compact (small font/padding here) minimises how often that leaves a large gap. */
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
  .col-week { width: 9%; } .col-comp { width: 20%; } .col-ic { width: 16%; }
  .col-act { width: 15%; } .col-res { width: 13%; } .col-eval { width: 13%; }
  .col-place { width: 7%; } .col-obs { width: 7%; }
</style>
</head>
<body>
  <h1 class="doc-title">${docTitle}</h1>
  <div class="doc-school">${escapeHtml(school?.name)}</div>

  <table class="detail-table">
    ${detailRow("Sector", school?.sector || "", "Trainer", trainerName)}
    ${detailRow("Trade", school?.trade || "", "School Year", scheme.year_name || "")}
    ${detailRow("Qualification Title", school?.qualification_title || "", "Term", scheme.term_name || "")}
    <tr class="module-divider"><td colspan="4">Module details</td></tr>
    ${detailRow("RQF Level", scheme.rqf_level || "", "Module code and title", moduleCodeAndTitle)}
    ${detailRow("Learning hours", scheme.learning_hours || "", "Date", fmtDate(scheme.scheme_date))}
    ${detailRow("Number of Classes", String(numberOfClasses), "Class Name", scheme.class_group_name || "")}
  </table>

  <table class="report-table">
    <thead>
      <tr>
        <th class="col-week" rowspan="2">Weeks</th>
        <th class="col-comp" rowspan="2">Competence code and name</th>
        <th class="col-ic" rowspan="2">Indicative content (IC)</th>
        <th class="col-act" rowspan="2">Learning Activities</th>
        <th class="col-res" rowspan="2">Resources (Equipment, tools, materials)</th>
        <th class="col-eval" rowspan="2">Evidences of formative assessment</th>
        <th class="col-place" rowspan="2">Learning Place</th>
        <th class="col-obs" rowspan="2">Observation</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="8" style="text-align:center;color:${MUTED};padding:20px;">No weekly entries yet</td></tr>`}
    </tbody>
  </table>

  <div class="signatures">
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
</body>
</html>`;
};

async function printHtmlToPdf(
  html: string,
  headerTemplate: string,
  footerTemplate: string,
): Promise<Buffer> {
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
      landscape: true,
      printBackground: true,
      margin: { top: "16mm", bottom: "14mm", left: "10mm", right: "10mm" },
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** Renders the full Scheme of Work report (identification block, weekly table, and signatures --
 * one continuous flowing document, matching the correct printed template) to a PDF buffer. Used
 * by both the preview (streamed inline) and download endpoints, so preview and export are always
 * pixel-identical -- there is exactly one renderer. The school logo(s) repeat in a running header
 * and "{School} | {Module} — {Term} Scheme of Work | Page N" repeats in a running footer on every
 * page, matching the reference template exactly. */
export async function renderSchemeOfWorkPdf(schemeId: number): Promise<Buffer> {
  const { scheme, school, rows, numberOfClasses } = await buildReportData(schemeId);
  const [logo1, logo2] = await Promise.all([
    resolveLogoSrc(school?.logo),
    resolveLogoSrc(school?.partner_logo),
  ]);
  const html = buildHtml(scheme, school, numberOfClasses, logo1, logo2, rows);

  const footerLabel = [
    school?.name,
    [scheme.module_code, `${scheme.term_name} Scheme of Work`].filter(Boolean).join(" — "),
  ]
    .filter(Boolean)
    .join(" | ");
  const headerTemplate = buildHeaderTemplate(logo1, logo2, school?.name || "");
  const footerTemplate = buildFooterTemplate(`${footerLabel}${footerLabel ? " | Page" : "Page"}`);

  return printHtmlToPdf(html, headerTemplate, footerTemplate);
}
