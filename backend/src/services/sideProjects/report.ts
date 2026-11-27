import * as XLSX from "xlsx";
import { sql } from "drizzle-orm";
import { renderPdf } from "../documents/letterhead";
import { one } from "./core";
import type { MonitorFilters } from "./monitor";

/**
 * The All projects report (monitor → Excel / PDF / CSV): the same filtered rows as the table, with
 * the words people read on screen (statuses, health, "Day 2 · 10 days left"), never the codes.
 * Excel: a Summary sheet (filters, totals) and a Projects sheet (widths, filter row).
 * PDF: A4 landscape, Puppeteer printing an HTML page like the other MIS PDFs. Rendered on demand.
 */

export const PDF_MAX_ROWS = 1000;

const STATUS: Record<string, string> = { IDEA: "Idea", PLANNING: "Planning", IN_PROGRESS: "Building", TESTING: "Testing", COMPLETED: "Completed", ON_HOLD: "On hold" };
const HEALTH: Record<string, string> = { ON_TRACK: "On track", STALE: "No recent activity", OVERDUE: "Overdue", BLOCKED: "Blocked", DONE: "Done", IDLE: "Not started", PAUSED: "Paused" };
const KIND: Record<string, string> = { STUDENT: "Student project", DELIVERY_STUDIO: "NGA Delivery Studio", INDIVIDUAL: "Individual project" };
const REVIEW: Record<string, string> = { NONE: "", CHANGES_REQUESTED: "Changes requested", AWAITING_VERIFICATION: "Awaiting verification", VERIFIED: "Verified" };
const OWNER: Record<string, string> = { STUDENT: "Student", TEACHER: "Teacher", STAFF: "Staff", ADMIN: "Staff", PARENT: "Parent" };

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** "Day 2 · 10 days left", "Day 9 · 3 days over", "4 days paused · Building", "Completed". */
export function stageSummary(p: any): string {
  const t = p.stage ?? {};
  if (p.status === "COMPLETED") return "Completed";
  if (p.status === "ON_HOLD") return `${t.daysIn != null ? `${days(t.daysIn)} paused` : "Paused"} · ${STATUS[p.pausedFrom] ?? "Idea"}`;
  const day = t.daysIn != null ? `Day ${t.daysIn + 1}` : STATUS[p.status] ?? p.status;
  if (t.overrunDays > 0) return `${day} · ${days(t.overrunDays)} over`;
  if (t.daysLeft != null && t.daysLeft < 0) return `${day} · ${days(-t.daysLeft)} over`;
  if (t.daysLeft === 0) return `${day} · due today`;
  if (t.daysLeft != null) return `${day} · ${days(t.daysLeft)} left`;
  return day;
}

const ymd = (v: unknown) => (v ? String(v).slice(0, 10) : "");
const kigali = (d = new Date()) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kigali" });

/** The filters in words, for the report's heading. */
export async function describeFilters(f: MonitorFilters): Promise<string[]> {
  const out: string[] = [];
  const name = async (q: ReturnType<typeof sql>) => (await one(q))?.name as string | undefined;
  if (f.yearId) out.push(`Year ${(await name(sql`SELECT name FROM AcademicYear WHERE academic_year_id = ${f.yearId}`)) ?? f.yearId}`);
  if (f.classId) out.push(`Class ${(await name(sql`SELECT name FROM ClassGroup WHERE class_group_id = ${f.classId}`)) ?? f.classId}`);
  else if (f.gradeId) out.push(`Grade ${(await name(sql`SELECT name FROM Grade WHERE grade_id = ${f.gradeId}`)) ?? f.gradeId}`);
  else if (f.programId) out.push(`Programme ${(await name(sql`SELECT name FROM Program WHERE program_id = ${f.programId}`)) ?? f.programId}`);
  if (f.ownerType) out.push(f.ownerType === "STUDENT" ? "Students" : "Staff & others");
  if (f.status) out.push(f.status.split(",").map((s) => STATUS[s] ?? s).join(", "));
  if (f.kind) out.push(KIND[f.kind]);
  if (f.customerId) out.push(`Customer ${(await name(sql`SELECT name FROM SideProjectCustomer WHERE customer_id = ${f.customerId}`)) ?? f.customerId}`);
  if (f.categoryId) out.push(`Category ${(await name(sql`SELECT name FROM SideProjectCategory WHERE category_id = ${f.categoryId}`)) ?? f.categoryId}`);
  if (f.health) out.push(HEALTH[f.health] ?? f.health);
  if (f.review) out.push(REVIEW[f.review] || f.review);
  if (f.missing) out.push(`Missing ${f.missing.toLowerCase().replace(/_/g, " ")}`);
  if (f.hasGithub) out.push("With GitHub");
  if (f.hasAccess) out.push("With a live link");
  if (f.q) out.push(`"${f.q}"`);
  return out;
}

/** One row as people read it. */
export function reportRow(p: any) {
  return {
    "Reg. number": p.student?.regNumber ?? "",
    Owner: p.student?.name ?? "",
    "Owner type": OWNER[String(p.student?.type ?? "").toUpperCase()] ?? p.student?.type ?? "",
    Class: p.class?.name ?? "",
    Grade: p.class?.grade ?? "",
    Programme: p.class?.program ?? "",
    "Academic year": p.year?.name ?? "",
    Project: p.title,
    Type: KIND[p.kind] ?? p.kind,
    Customer: p.customer?.name ?? "Own initiative",
    Category: p.category?.name ?? "",
    Technologies: (p.techTags ?? []).join(", "),
    Status: STATUS[p.status] ?? p.status,
    "Progress %": p.progress,
    Health: HEALTH[p.health] ?? p.health,
    "Time in stage": stageSummary(p),
    "Stage due": p.stage?.plannedEnd ?? "",
    Review: REVIEW[p.reviewState] ?? "",
    "Last report": ymd(p.lastReport),
    Concept: p.docs?.CONCEPT ? "Yes" : p.conceptPending ? "Pending" : "No",
    SRS: p.docs?.SRS ? "Yes" : "No",
    "Implementation plan": p.docs?.IMPLEMENTATION_PLAN ? "Yes" : "No",
    Supervisor: p.supervisor?.name ?? "",
    GitHub: p.githubUrl ?? "",
    "Live link": p.accessUrl ?? "",
    "Last activity": ymd(p.lastActivityAt),
    Created: ymd(p.createdAt),
    Completed: ymd(p.completedAt),
    Verified: ymd(p.verifiedAt),
  };
}

/** Totals for the summary sheet and the PDF tiles. */
export function totals(rows: any[]) {
  const by = (key: (p: any) => string) => rows.reduce<Record<string, number>>((m, p) => ((m[key(p)] = (m[key(p)] ?? 0) + 1), m), {});
  const avg = rows.length ? Math.round(rows.reduce((s, p) => s + (Number(p.progress) || 0), 0) / rows.length) : 0;
  const cutoff = Date.now() - 14 * 86_400_000;
  const quiet = rows.filter((p) => p.status !== "COMPLETED" && (!p.lastReport || Date.parse(`${ymd(p.lastReport)}T12:00:00Z`) < cutoff)).length;
  const overdue = rows.filter((p) => (p.stage?.overrunDays ?? 0) > 0 && p.status !== "COMPLETED").length;
  return {
    total: rows.length,
    avgProgress: avg,
    noRecentReport: quiet,
    overdue,
    byStatus: by((p) => STATUS[p.status] ?? p.status),
    byHealth: by((p) => HEALTH[p.health] ?? p.health),
    byType: by((p) => KIND[p.kind] ?? p.kind),
  };
}

const WIDTHS: Record<string, number> = {
  "Reg. number": 14, Owner: 24, "Owner type": 11, Class: 14, Grade: 10, Programme: 16, "Academic year": 12, Project: 36, Type: 20, Customer: 22, Category: 16,
  Technologies: 26, Status: 11, "Progress %": 10, Health: 16, "Time in stage": 22, "Stage due": 11, Review: 18, "Last report": 11, Concept: 9, SRS: 7,
  "Implementation plan": 10, Supervisor: 22, GitHub: 34, "Live link": 30, "Last activity": 12, Created: 11, Completed: 11, Verified: 11,
};

export async function buildWorkbook(rows: any[], f: MonitorFilters): Promise<Buffer> {
  const data = rows.map(reportRow);
  const t = totals(rows);
  const filters = await describeFilters(f);
  const summary: Array<Array<string | number>> = [
    ["Projects report"],
    [`Generated ${kigali()} (Kigali)`],
    [`Filters: ${filters.length ? filters.join(" · ") : "none"}`],
    [],
    ["Projects", t.total],
    ["Average progress %", t.avgProgress],
    ["Behind their stage plan", t.overdue],
    ["No report in 14 days", t.noRecentReport],
    [],
    ["By status", ""],
    ...Object.entries(t.byStatus).map(([k, v]) => [k, v]),
    [],
    ["By health", ""],
    ...Object.entries(t.byHealth).map(([k, v]) => [k, v]),
    [],
    ["By type", ""],
    ...Object.entries(t.byType).map(([k, v]) => [k, v]),
  ];
  const s = XLSX.utils.aoa_to_sheet(summary);
  s["!cols"] = [{ wch: 30 }, { wch: 12 }];
  const headers = Object.keys(reportRow({ stage: {}, docs: {} }));
  const p = XLSX.utils.json_to_sheet(data, { header: headers });
  p["!cols"] = headers.map((h) => ({ wch: WIDTHS[h] ?? 14 }));
  p["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, data.length), c: headers.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, s, "Summary");
  XLSX.utils.book_append_sheet(wb, p, "Projects");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildCsv(rows: any[]): Buffer {
  const headers = Object.keys(reportRow({ stage: {}, docs: {} }));
  const ws = XLSX.utils.json_to_sheet(rows.map(reportRow), { header: headers });
  return Buffer.from("﻿" + XLSX.utils.sheet_to_csv(ws), "utf8");
}

const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const STATUS_COLOR: Record<string, string> = { Idea: "#64748b", Planning: "#2563eb", Building: "#1d4ed8", Testing: "#0f766e", Completed: "#047857", "On hold": "#b45309" };
const HEALTH_COLOR: Record<string, string> = { "On track": "#047857", Done: "#047857", Overdue: "#b91c1c", Blocked: "#b91c1c", "No recent activity": "#b45309", "Not started": "#64748b", Paused: "#b45309" };

export function buildReportHtml(rows: any[], filters: string[], meta: { generatedBy: string; total: number }): string {
  const t = totals(rows);
  const shown = rows.slice(0, PDF_MAX_ROWS);
  const tile = (label: string, value: string | number, note = "") => `<div class="tile"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div>${note ? `<div class="n">${esc(note)}</div>` : ""}</div>`;
  const bars = Object.entries(t.byStatus)
    .map(([k, v]) => `<span class="seg" style="flex:${v};background:${STATUS_COLOR[k] ?? "#94a3b8"}" title="${esc(k)}"></span>`)
    .join("");
  const legend = Object.entries(t.byStatus).map(([k, v]) => `<span><i style="background:${STATUS_COLOR[k] ?? "#94a3b8"}"></i>${esc(k)} ${v}</span>`).join("");
  const body = shown
    .map((p) => {
      const r = reportRow(p);
      return `<tr>
        <td><b>${esc(r.Owner)}</b><div class="sub">${esc(r["Reg. number"] || r["Owner type"])}</div></td>
        <td>${esc(r.Class || "—")}<div class="sub">${esc(r["Academic year"])}</div></td>
        <td><b>${esc(r.Project)}</b><div class="sub">${esc([r.Type, r.Customer !== "Own initiative" ? r.Customer : "", r.Category].filter(Boolean).join(" · "))}</div></td>
        <td><span class="pill" style="color:${STATUS_COLOR[r.Status] ?? "#334155"}">${esc(r.Status)}</span></td>
        <td class="num"><div class="bar"><span style="width:${Math.max(0, Math.min(100, Number(r["Progress %"]) || 0))}%"></span></div>${esc(r["Progress %"])}%</td>
        <td class="nowrap">${esc(r["Time in stage"])}</td>
        <td style="color:${HEALTH_COLOR[r.Health] ?? "#334155"}">${esc(r.Health)}</td>
        <td class="nowrap">${esc(r["Last report"] || "None")}</td>
        <td>${esc(r.Supervisor || "—")}</td>
      </tr>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { background: #fff; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #334155; font-size: 9.5px; margin: 0; }
  .head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .head img { height: 34px; }
  .head h1 { font-size: 17px; margin: 0; color: #0f172a; }
  .head .meta { color: #64748b; font-size: 9.5px; margin-top: 2px; }
  .filters { color: #475569; font-size: 9.5px; margin-bottom: 10px; }
  .filters b { color: #1d4ed8; }
  .tiles { display: flex; gap: 8px; margin-bottom: 8px; }
  .tile { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; }
  .tile .v { font-size: 16px; font-weight: 700; color: #0f172a; }
  .tile .l { font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
  .tile .n { font-size: 8.5px; color: #94a3b8; }
  .dist { display: flex; height: 6px; border-radius: 3px; overflow: hidden; gap: 1px; margin: 4px 0 4px; }
  .legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 8.5px; color: #475569; margin-bottom: 10px; }
  .legend i { display: inline-block; width: 7px; height: 7px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; background: #f1f5f9; padding: 5px 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #eef2f7; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .sub { color: #94a3b8; font-size: 8.5px; margin-top: 1px; }
  .pill { font-weight: 700; }
  .num { white-space: nowrap; }
  .nowrap { white-space: nowrap; }
  .bar { display: inline-block; width: 38px; height: 4px; background: #e2e8f0; border-radius: 2px; margin-right: 5px; vertical-align: middle; overflow: hidden; }
  .bar span { display: block; height: 100%; background: #2563eb; }
  .more { margin-top: 8px; color: #b45309; font-size: 9px; }
  </style></head><body>
  <div class="head"><div><h1>Projects report</h1><div class="meta">Generated ${esc(kigali())} (Kigali) by ${esc(meta.generatedBy)}</div></div></div>
  <div class="filters"><b>Filters:</b> ${filters.length ? esc(filters.join(" · ")) : "none"}</div>
  <div class="tiles">
    ${tile("Projects", t.total)}
    ${tile("Average progress", `${t.avgProgress}%`)}
    ${tile("Behind their stage plan", t.overdue)}
    ${tile("No report in 14 days", t.noRecentReport, "not completed")}
  </div>
  ${rows.length ? `<div class="dist">${bars}</div><div class="legend">${legend}</div>` : ""}
  <table>
    <thead><tr><th>Owner</th><th>Class</th><th>Project</th><th>Status</th><th>Progress</th><th>Time in stage</th><th>Health</th><th>Last report</th><th>Supervisor</th></tr></thead>
    <tbody>${body || `<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:20px">No projects match these filters.</td></tr>`}</tbody>
  </table>
  ${meta.total > shown.length ? `<div class="more">The PDF lists the first ${shown.length} of ${meta.total} projects. Export Excel for all of them.</div>` : ""}
  </body></html>`;
}

export async function buildPdf(rows: any[], f: MonitorFilters, generatedBy: string): Promise<Buffer> {
  const html = buildReportHtml(rows, await describeFilters(f), { generatedBy, total: rows.length });
  // The school's letterhead on every page (services/documents/letterhead.ts).
  return renderPdf(html, { landscape: true, sideMm: 10, note: "Projects report", minBottomMm: 14 });
}
