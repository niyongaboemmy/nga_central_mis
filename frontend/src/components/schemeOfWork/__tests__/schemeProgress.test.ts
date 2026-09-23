import { describe, it, expect } from "vitest";
import {
  applyFilter,
  applySort,
  buildCards,
  searchCards,
  summarise,
} from "../schemeProgress";
import type { SchemeProgressRow } from "../../../api/schemeOfWork";

const row = (over: Partial<SchemeProgressRow> = {}): SchemeProgressRow => ({
  subject_id: 1,
  class_group_id: 11,
  subject_name: "Maths",
  subject_code: "M1",
  subject_color: "#2a78d6",
  class_group_name: "L3. Class A",
  grade_name: "Year 1",
  scheme_id: 5,
  status: "submitted",
  entries_count: 6,
  validation_status: "PENDING",
  validation_comment: null,
  updated_at: null,
  ...over,
});

describe("buildCards", () => {
  it("measures planned weeks against the week the term is in", () => {
    const [card] = buildCards([row({ entries_count: 3 })], 6);
    expect(card.planned).toBe(3);
    expect(card.target).toBe(6);
    expect(card.percent).toBe(50);
    expect(card.tone).toBe("warning");
    expect(card.statusLabel).toBe("3 weeks behind");
  });

  it("keeps the join correct when coverage re-orders the rows", () => {
    // coverageRows sorts worst-first, so joining by index would attach the
    // wrong progress to the wrong subject.
    const cards = buildCards(
      [
        row({ subject_id: 1, subject_name: "OnTrack", entries_count: 6 }),
        row({
          subject_id: 2,
          class_group_id: 12,
          subject_name: "Missing",
          status: "pending",
          scheme_id: null,
          entries_count: 0,
        }),
      ],
      5,
    );
    expect(cards.map((c) => c.subject_name)).toEqual(["OnTrack", "Missing"]);
    expect(cards[0].tone).toBe("good");
    expect(cards[1].tone).toBe("critical");
  });

  it("does not claim progress when the term has no dates to measure against", () => {
    const [card] = buildCards([row({ entries_count: 4 })], null);
    expect(card.target).toBe(0);
    expect(card.percent).toBe(0);
    expect(card.tone).toBe("good");
  });
});

describe("summarise", () => {
  const cards = () =>
    buildCards(
      [
        row({ subject_id: 1, entries_count: 6, validation_status: "APPROVED" }),
        row({ subject_id: 2, class_group_id: 12, entries_count: 2 }),
        row({
          subject_id: 3,
          class_group_id: 13,
          status: "pending",
          scheme_id: null,
          entries_count: 0,
        }),
        row({
          subject_id: 4,
          class_group_id: 14,
          entries_count: 6,
          validation_status: "REJECTED",
        }),
      ],
      6,
    );

  it("measures coverage against what every scheme owes, not what it has", () => {
    const s = summarise(cards());
    // 6 + 2 + 0 + 6 planned against 4 schemes × 6 weeks.
    expect(s.totalPlanned).toBe(14);
    expect(s.totalTarget).toBe(24);
    expect(s.coveragePercent).toBe(58);
  });

  it("counts review state and attention separately", () => {
    const s = summarise(cards());
    expect(s.total).toBe(4);
    expect(s.submitted).toBe(3);
    expect(s.approved).toBe(1);
    expect(s.rejected).toBe(1);
    // behind + not submitted + sent back
    expect(s.needsAttention).toBe(3);
  });

  it("reports no percentage rather than a fake one when there is no target", () => {
    expect(summarise(buildCards([row()], null)).coveragePercent).toBeNull();
  });
});

describe("filtering and sorting", () => {
  const cards = buildCards(
    [
      row({ subject_id: 1, subject_name: "Zebra", entries_count: 6 }),
      row({
        subject_id: 2,
        class_group_id: 12,
        subject_name: "Alpha",
        entries_count: 1,
      }),
      row({
        subject_id: 3,
        class_group_id: 13,
        subject_name: "Beta",
        status: "pending",
        scheme_id: null,
        entries_count: 0,
      }),
      row({
        subject_id: 4,
        class_group_id: 14,
        subject_name: "Gamma",
        entries_count: 6,
        validation_status: "APPROVED",
      }),
    ],
    6,
  );

  it("filters to what still needs work", () => {
    expect(applyFilter(cards, "attention").map((c) => c.subject_name)).toEqual([
      "Alpha",
      "Beta",
    ]);
    expect(applyFilter(cards, "approved").map((c) => c.subject_name)).toEqual([
      "Gamma",
    ]);
    expect(applyFilter(cards, "all")).toHaveLength(4);
  });

  it("puts the most urgent first by default", () => {
    expect(applySort(cards, "attention").map((c) => c.subject_name)).toEqual([
      "Beta",
      "Alpha",
      "Zebra",
      "Gamma",
    ]);
  });

  it("sorts by coverage and by name on request", () => {
    expect(applySort(cards, "coverage")[0].subject_name).toBe("Beta");
    expect(applySort(cards, "name").map((c) => c.subject_name)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
      "Zebra",
    ]);
  });

  it("does not mutate the array it is given", () => {
    const before = cards.map((c) => c.subject_name);
    applySort(cards, "name");
    expect(cards.map((c) => c.subject_name)).toEqual(before);
  });

  it("searches the class and grade, not only the subject", () => {
    expect(searchCards(cards, "zeb")).toHaveLength(1);
    expect(searchCards(cards, "L3. Class A")).toHaveLength(4);
    expect(searchCards(cards, "Year 1")).toHaveLength(4);
    expect(searchCards(cards, "  ")).toHaveLength(4);
  });
});
