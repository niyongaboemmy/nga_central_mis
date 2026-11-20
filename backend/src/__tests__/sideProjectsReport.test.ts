// The All projects report (Excel / PDF / CSV): words people read, the one-line time in stage,
// totals, the workbook's sheets and the PDF page. No database.
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildCsv, buildReportHtml, reportRow, stageSummary, totals, PDF_MAX_ROWS } from "../services/sideProjects/report";

const p = (over: any = {}) => ({
  student: { name: "Test Student", regNumber: "120823-0011", type: "STUDENT" },
  class: { name: "L3. Class A" },
  year: { name: "2026 - 2027" },
  title: "Smart Automated System",
  kind: "STUDENT",
  status: "TESTING",
  progress: 12,
  health: "ON_TRACK",
  stage: { daysIn: 1, daysLeft: 10, overrunDays: 0 },
  lastReport: null,
  docs: { CONCEPT: true },
  techTags: ["React"],
  ...over,
});

describe("time in stage, summarised", () => {
  it("reads like the table", () => {
    expect(stageSummary(p())).toBe("Day 2 · 10 days left");
    expect(stageSummary(p({ stage: { daysIn: 0, daysLeft: 1, overrunDays: 0 } }))).toBe("Day 1 · 1 day left");
    expect(stageSummary(p({ stage: { daysIn: 8, daysLeft: null, overrunDays: 3 } }))).toBe("Day 9 · 3 days over");
    expect(stageSummary(p({ stage: { daysIn: 8, daysLeft: -2, overrunDays: 0 } }))).toBe("Day 9 · 2 days over");
    expect(stageSummary(p({ stage: { daysIn: 4, daysLeft: 0, overrunDays: 0 } }))).toBe("Day 5 · due today");
    expect(stageSummary(p({ status: "ON_HOLD", pausedFrom: "IN_PROGRESS", stage: { daysIn: 4 } }))).toBe("4 days paused · Building");
    expect(stageSummary(p({ status: "COMPLETED" }))).toBe("Completed");
  });
});

describe("rows and totals", () => {
  it("uses words, never codes", () => {
    const r = reportRow(p({ status: "IN_PROGRESS", health: "STALE", kind: "DELIVERY_STUDIO", customer: { name: "Kigali Green Farms" } }));
    expect(r).toMatchObject({ Status: "Building", Health: "No recent activity", Type: "NGA Delivery Studio", Customer: "Kigali Green Farms", "Owner type": "Student", Concept: "Yes", SRS: "No" });
  });
  it("counts by status, health and type, and flags quiet and late projects", () => {
    const t = totals([p(), p({ status: "COMPLETED", progress: 100, health: "DONE" }), p({ stage: { daysIn: 9, overrunDays: 2 }, lastReport: new Date().toISOString().slice(0, 10) })]);
    expect(t.total).toBe(3);
    expect(t.avgProgress).toBe(41);
    expect(t.byStatus).toEqual({ Testing: 2, Completed: 1 });
    expect(t.overdue).toBe(1);
    expect(t.noRecentReport).toBe(1);
  });
  it("CSV has a BOM for Excel and the summarised column", () => {
    const csv = buildCsv([p()]).toString("utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Time in stage");
    expect(csv).toContain("Day 2 · 10 days left");
    expect(XLSX.read(csv.slice(1), { type: "string" }).SheetNames.length).toBe(1);
  });
});

describe("PDF page", () => {
  it("has the filters, the tiles and one row per project, escaped", () => {
    const html = buildReportHtml([p({ title: "<b>XSS</b> & co" }), p({ status: "COMPLETED" })], ["Year 2026 - 2027"], { generatedBy: "Delivery Studio", total: 2 });
    expect(html).toContain("Projects report");
    expect(html).toContain("Year 2026 - 2027");
    expect(html).toContain("&lt;b&gt;XSS&lt;/b&gt; &amp; co");
    expect(html).not.toContain("<b>XSS</b>");
    expect(html).toContain("Day 2 · 10 days left");
    expect((html.match(/<tr>/g) ?? []).length).toBe(3);
  });
  it("says when it lists only the first rows", () => {
    const many = Array.from({ length: PDF_MAX_ROWS + 5 }, () => p());
    expect(buildReportHtml(many, [], { generatedBy: "x", total: many.length })).toContain(`first ${PDF_MAX_ROWS} of ${PDF_MAX_ROWS + 5}`);
  });
});
