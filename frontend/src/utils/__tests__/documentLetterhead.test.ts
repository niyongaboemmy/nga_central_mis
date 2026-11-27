import { describe, it, expect, vi, beforeEach } from "vitest";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  EMPTY_LETTERHEAD,
  Letterhead,
  currentLetterhead,
  footerLinesOf,
  letterheadFrame,
  letterheadLayout,
  loadLetterhead,
  resetLetterhead,
  setLetterheadSource,
  stampLetterhead,
} from "../documentLetterhead";
import { LessonReportRollupService } from "../../services/LessonReportRollupService";

/**
 * The browser letterhead (utils/documentLetterhead.ts): the school's header and footer on
 * every page of every jsPDF document. Same measurements as the server (pinned there too).
 */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const lh: Letterhead = {
  schoolName: "Test School",
  header: { dataUrl: PNG, width: 248, height: 108 },
  footer: { dataUrl: PNG, width: 1245, height: 159 },
  footerLines: ["Line one"],
};

describe("letterheadLayout", () => {
  it("matches the server's sizes", () => {
    const l = letterheadLayout({ ...lh, footerLines: [] }, 210, { sideMm: 14 });
    expect([l.topMm, l.bottomMm, l.footerImageWidthMm, l.footerImageHeightMm]).toEqual([23, 37, 172.26, 22]);
    const plain = letterheadLayout({ ...EMPTY_LETTERHEAD, schoolName: "X" }, 210);
    expect([plain.topMm, plain.bottomMm]).toEqual([16, 14]);
  });
});

describe("letterheadFrame", () => {
  it("answers in the document's own unit", () => {
    const mm = letterheadFrame(new jsPDF("p", "mm", "a4"), lh);
    expect(mm.top).toBeCloseTo(23, 5);
    expect(mm.bottom).toBeCloseTo(41.6, 5); // 37 + one 3.6 mm text line + 1 mm under the image
    expect(mm.pageBottom).toBeCloseTo(297 - 41.6, 1);
    expect(mm.shift(10)).toBeCloseTo(13, 5);
    expect(mm.shift(40)).toBe(0);
    const pt = letterheadFrame(new jsPDF({ unit: "pt", format: "a4" }), lh);
    expect(pt.top).toBeCloseTo((23 * 72) / 25.4, 3);
  });
});

describe("stampLetterhead", () => {
  it("draws the header, the footer image, the text lines and 'Page N of M' on every page", () => {
    const doc = new jsPDF("p", "mm", "a4");
    doc.addPage();
    doc.addPage();
    const images = vi.spyOn(doc, "addImage");
    const text = vi.spyOn(doc, "text");
    stampLetterhead(doc, lh, { note: "A report" });
    expect(images).toHaveBeenCalledTimes(6); // header + footer on 3 pages
    const said = text.mock.calls.map((c) => String(c[0]));
    expect(said.filter((t) => t === "Line one")).toHaveLength(3);
    expect(said).toEqual(expect.arrayContaining(["Page 1 of 3", "Page 2 of 3", "Page 3 of 3", "A report"]));
    // The footer image sits above the bottom margin, inside the reserved band.
    const footerCall = (images.mock.calls as unknown as unknown[][]).find((c) => c[6] === "lh-footer")!;
    const [y, h] = [Number(footerCall[3]), Number(footerCall[5])];
    expect(y + h).toBeLessThanOrEqual(297 - 6);
    expect(y).toBeGreaterThanOrEqual(297 - letterheadLayout(lh, 210).bottomMm);
  });

  it("prints the school's name when there is no header image, and can leave the page numbers out", () => {
    const doc = new jsPDF();
    const text = vi.spyOn(doc, "text");
    stampLetterhead(doc, { ...EMPTY_LETTERHEAD, schoolName: "Plain School" }, { pageNumbers: false });
    const said = text.mock.calls.map((c) => String(c[0]));
    expect(said).toContain("Plain School");
    expect(said.some((t) => t.startsWith("Page "))).toBe(false);
  });

  it("keeps a table's rows out of the header and footer bands", () => {
    const doc = new jsPDF("p", "mm", "a4");
    const frame = letterheadFrame(doc, lh);
    autoTable(doc, { startY: frame.top, head: [["#"]], body: Array.from({ length: 120 }, (_, i) => [String(i)]), margin: { top: frame.top, bottom: frame.bottom } });
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    expect((doc as any).lastAutoTable.finalY).toBeLessThanOrEqual(frame.pageBottom + 0.01);
  });
});

describe("a converted generator", () => {
  it("the lesson report rollup carries the letterhead on each page", () => {
    const rollup: any = {
      period: { start_date: "2026-01-01", end_date: "2026-01-31", academic_term_id: 1 },
      subjects: [1, 2].map((n) => ({ subject_id: n, subject_name: `S${n}`, subject_code: null, class_groups: [{ class_group_id: n, class_group_name: `C${n}`, weeks: [] }] })),
    };
    const spy = vi.spyOn((jsPDF as any).API, "addImage");
    const doc = LessonReportRollupService.buildReport(rollup, { academicTermName: "Term 1", schoolName: "Test School" } as any, lh);
    expect(doc.getNumberOfPages()).toBe(2);
    expect(spy.mock.calls.filter((c) => c[6] === "lh-header")).toHaveLength(2);
    expect(spy.mock.calls.filter((c) => c[6] === "lh-footer")).toHaveLength(2);
    spy.mockRestore();
  });
});

describe("loading", () => {
  beforeEach(() => resetLetterhead());

  it("reads the source once, keeps it, and turns failures into an empty letterhead", async () => {
    const source = vi.fn(async () => ({ schoolName: "Loaded School", headerUrl: null, footerText: "a\n\nb" }));
    setLetterheadSource(source);
    const first = await loadLetterhead();
    await loadLetterhead();
    expect(source).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ schoolName: "Loaded School", header: null, footer: null, footerLines: ["a", "b"] });
    await Promise.resolve();
    expect(currentLetterhead().schoolName).toBe("Loaded School");

    setLetterheadSource(async () => {
      throw new Error("offline");
    });
    expect(await loadLetterhead()).toBe(EMPTY_LETTERHEAD);
  });

  it("splits footer text into at most four lines", () => {
    expect(footerLinesOf("1\n2\n\n3\n4\n5")).toEqual(["1", "2", "3", "4"]);
  });
});
