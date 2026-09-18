import { describe, it, expect } from "vitest";
import { buildWeekEntries } from "../controllers/schemeAIController";
import { computeWeekDates } from "../utils/weekDates";

// Regression test for the bug reported against mis.amashuri.com/scheme-of-work/calendar: a week
// marked "skip" (e.g. a holiday) during AI generation used to be omitted from the database
// entirely, leaving a completely blank, unlabeled calendar cell instead of a visible placeholder.
// buildWeekEntries must always produce exactly one row per week slot, with skip weeks marked
// SKIPPED (not missing) so the calendar/timeline/PDF can render them.
describe("buildWeekEntries — skip-week placeholder fix", () => {
  const makeGeneratedWeeks = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      week_number: i + 1,
      topic: `Topic ${i + 1}`,
      objective: `Objective ${i + 1}`,
      methodology: `Methodology ${i + 1}`,
      resources: `Resources ${i + 1}`,
      evaluation: `Evaluation ${i + 1}`,
    }));

  it("produces exactly totalWeeks rows with no omissions when a middle week is skipped", () => {
    const totalWeeks = 5;
    const skipWeeks = new Set([3]);
    const weekDates = computeWeekDates(new Date("2026-09-07"), totalWeeks);
    const generatedWeeks = makeGeneratedWeeks(totalWeeks - skipWeeks.size);

    const { entries } = buildWeekEntries({
      totalWeeks,
      skipWeeks,
      generatedWeeks,
      weekDates,
      competencyIdByElement: new Map(),
    });

    expect(entries).toHaveLength(totalWeeks);
    expect(entries.map((e) => e.week_number)).toEqual([
      "Week 1",
      "Week 2",
      "Week 3",
      "Week 4",
      "Week 5",
    ]);

    const skipped = entries[2];
    expect(skipped.entry_status).toBe("SKIPPED");
    expect(skipped.topic).toBe("");
    expect(skipped.objective).toBe("");
    expect(skipped.start_date).toBe(weekDates[2].start_date);
    expect(skipped.end_date).toBe(weekDates[2].end_date);

    for (const idx of [0, 1, 3, 4]) {
      expect(entries[idx].entry_status).toBe("PLANNED");
      expect(entries[idx].topic).not.toBe("");
    }
  });

  it("handles skips at the start, end, and multiple skips at once", () => {
    const totalWeeks = 6;
    const skipWeeks = new Set([1, 6]);
    const weekDates = computeWeekDates(new Date("2026-09-07"), totalWeeks);
    const generatedWeeks = makeGeneratedWeeks(totalWeeks - skipWeeks.size);

    const { entries } = buildWeekEntries({
      totalWeeks,
      skipWeeks,
      generatedWeeks,
      weekDates,
      competencyIdByElement: new Map(),
    });

    expect(entries).toHaveLength(totalWeeks);
    expect(entries[0].entry_status).toBe("SKIPPED");
    expect(entries[5].entry_status).toBe("SKIPPED");
    expect(entries.slice(1, 5).every((e) => e.entry_status === "PLANNED")).toBe(true);
  });

  it("treats a shortfall in AI-returned weeks as empty PLANNED rows, never a gap", () => {
    const totalWeeks = 4;
    const skipWeeks = new Set<number>();
    const weekDates = computeWeekDates(new Date("2026-09-07"), totalWeeks);
    // AI returned only 2 weeks even though 4 were requested.
    const generatedWeeks = makeGeneratedWeeks(2);

    const { entries } = buildWeekEntries({
      totalWeeks,
      skipWeeks,
      generatedWeeks,
      weekDates,
      competencyIdByElement: new Map(),
    });

    expect(entries).toHaveLength(4);
    expect(entries[0].entry_status).toBe("PLANNED");
    expect(entries[1].entry_status).toBe("PLANNED");
    // Shortfall rows: PLANNED (not SKIPPED — a teacher still needs to fill these in), but empty.
    expect(entries[2].entry_status).toBe("PLANNED");
    expect(entries[2].topic).toBe("");
    expect(entries[3].entry_status).toBe("PLANNED");
    expect(entries[3].topic).toBe("");
  });

  it("resolves lo_number into competency_id via the provided map, and collects entryLoNumbers/entryCriteriaNumbers", () => {
    const totalWeeks = 2;
    const weekDates = computeWeekDates(new Date("2026-09-07"), totalWeeks);
    const generatedWeeks = [
      { ...makeGeneratedWeeks(1)[0], lo_number: 1, criteria_numbers: ["1.1", "1.2"] },
      { ...makeGeneratedWeeks(1)[0], lo_number: 2 },
    ];

    const { entries, entryCriteriaNumbers, entryLoNumbers } = buildWeekEntries({
      totalWeeks,
      skipWeeks: new Set(),
      generatedWeeks,
      weekDates,
      competencyIdByElement: new Map([[1, 101]]), // LO 2 has no matching competency yet
    });

    expect(entries[0].competency_id).toBe(101);
    expect(entries[1].competency_id).toBeNull();
    expect(entryLoNumbers).toEqual({ "Week 1": 1, "Week 2": 2 });
    expect(entryCriteriaNumbers).toEqual({ "Week 1": ["1.1", "1.2"] });
  });

  it("throws no error and returns zero entries when totalWeeks is 0", () => {
    const { entries } = buildWeekEntries({
      totalWeeks: 0,
      skipWeeks: new Set(),
      generatedWeeks: [],
      weekDates: [],
      competencyIdByElement: new Map(),
    });
    expect(entries).toHaveLength(0);
  });
});
