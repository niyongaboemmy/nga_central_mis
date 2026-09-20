import { describe, it, expect } from "vitest";
import { planPagination, SchemeReportRow, SKIPPED_MERGED_COLSPAN } from "../services/schemeReportPdf";

// Regression coverage for two real bugs found via manual UI/design review of the Scheme of Work
// PDF export:
//
// 1. Skipped weeks rendered their merged "Skipped / Holiday" message cell with colspan=5, but
//    the table has 9 leaf columns (Weeks, Learning outcome, Duration, IC, Activities, Resources,
//    Evidence, Place, Observation) -- after the 3 real cells (Weeks, Learning outcome, Duration),
//    the message must span the remaining 6, not 5. The old off-by-one silently dropped the
//    Observation column and misaligned every skipped row against the rest of the table.
//
// 2. Consecutive weeks sharing one Learning Outcome used to repeat the LO text on every row
//    instead of a real rowspan-merged cell (a deliberate earlier workaround for a Chromium PDF
//    pagination bug: a rowspan cell can't be split across a page break, so a naive rowspan
//    covering a 12-week LO group spanning ~4 pages was actually impossible, not just ugly).
//    planPagination restores the professional merged-cell look by computing page breaks FIRST
//    from real measured row heights, then only ever grouping rows into one rowspan when they
//    land on the same computed page -- so a rowspan can never straddle a break.
describe("SKIPPED_MERGED_COLSPAN", () => {
  it("spans exactly the 6 remaining columns after Weeks, Learning outcome, and Duration", () => {
    // 9 leaf columns - Weeks - Learning outcome - Duration = 6.
    expect(SKIPPED_MERGED_COLSPAN).toBe(6);
  });
});

describe("planPagination", () => {
  const makeRow = (overrides: Partial<SchemeReportRow>): SchemeReportRow => ({
    entry_id: 1,
    week_number: "Week 1",
    start_date: "2026-01-05",
    end_date: "2026-01-09",
    topic: "Topic",
    methodology: "Methodology",
    resources: "Resources",
    evaluation: "Evaluation",
    learning_place: "Classroom",
    observation: null,
    entry_status: "PLANNED",
    duration: null,
    competencyId: null,
    competencyTitle: null,
    competencyElementNumber: null,
    competencyHours: null,
    ...overrides,
  });

  it("merges consecutive rows sharing a competency into one rowspan group when they all fit on one page", () => {
    const rows = [1, 2, 3].map((n) =>
      makeRow({ entry_id: n, week_number: `Week ${n}`, competencyId: 100 }),
    );
    // Tiny rows relative to a full page -- everything fits on page 1.
    const heights = { topBlockHeight: 100, theadHeight: 20, rowHeights: [30, 30, 30] };

    const plan = planPagination(rows, heights);

    expect(plan[0]).toMatchObject({ isGroupStart: true, rowSpan: 3, pageBreakBefore: false });
    expect(plan[1]).toMatchObject({ isGroupStart: false, pageBreakBefore: false });
    expect(plan[2]).toMatchObject({ isGroupStart: false, pageBreakBefore: false });
  });

  it("starts a new rowspan group whenever the competency changes, even without a page break", () => {
    const rows = [
      makeRow({ entry_id: 1, competencyId: 100 }),
      makeRow({ entry_id: 2, competencyId: 100 }),
      makeRow({ entry_id: 3, competencyId: 200 }),
    ];
    const heights = { topBlockHeight: 100, theadHeight: 20, rowHeights: [30, 30, 30] };

    const plan = planPagination(rows, heights);

    expect(plan[0]).toMatchObject({ isGroupStart: true, rowSpan: 2 });
    expect(plan[1]).toMatchObject({ isGroupStart: false });
    expect(plan[2]).toMatchObject({ isGroupStart: true, rowSpan: 1 });
  });

  it("never lets a rowspan group straddle a forced page break, splitting it into two groups instead", () => {
    // Same competency for all 3 rows, but the 2nd row is deliberately too tall to fit in what's
    // left on page 1 -- this is the exact scenario that used to push the ENTIRE group to page 2,
    // wasting most of page 1 (found via manual testing against a real 12-week single-LO scheme).
    const rows = [1, 2, 3].map((n) => makeRow({ entry_id: n, competencyId: 100 }));
    const topBlockHeight = 600;
    const theadHeight = 20;
    // CONTENT_HEIGHT_PX ~= 680.3px for A4 landscape with the module's configured margins.
    // firstPageAvail = 680.3 - 600 - 20 - 8(safety) = ~52.3px -- room for row 0 (30px) but not
    // row 1 (200px), which must move to a fresh page.
    const heights = { topBlockHeight, theadHeight, rowHeights: [30, 200, 30] };

    const plan = planPagination(rows, heights);

    expect(plan[0]).toMatchObject({ isGroupStart: true, pageBreakBefore: false });
    // Row 1 forces a page break -- and must start its OWN new group, not extend row 0's rowspan
    // across the break.
    expect(plan[1]).toMatchObject({ isGroupStart: true, pageBreakBefore: true });
    // Row 2 fits on the same (new) page as row 1 and shares its competency -- merges with it.
    expect(plan[2]).toMatchObject({ isGroupStart: false, pageBreakBefore: false });
    expect(plan[1].rowSpan).toBe(2);
  });

  it("treats consecutive rows with no Learning Outcome (competencyId null) as their own group, same as a real competency", () => {
    const rows = [
      makeRow({ entry_id: 1, entry_status: "SKIPPED", competencyId: null }),
      makeRow({ entry_id: 2, entry_status: "SKIPPED", competencyId: null }),
    ];
    const heights = { topBlockHeight: 100, theadHeight: 20, rowHeights: [20, 20] };

    const plan = planPagination(rows, heights);

    expect(plan[0]).toMatchObject({ isGroupStart: true, rowSpan: 2 });
    expect(plan[1]).toMatchObject({ isGroupStart: false });
  });

  it("never forces a page break before the very first row, even if it alone exceeds a full page", () => {
    const rows = [makeRow({ entry_id: 1 })];
    const heights = { topBlockHeight: 100, theadHeight: 20, rowHeights: [10000] };

    const plan = planPagination(rows, heights);

    expect(plan[0].pageBreakBefore).toBe(false);
  });
});
