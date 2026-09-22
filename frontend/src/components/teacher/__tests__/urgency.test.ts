import { describe, it, expect } from "vitest";
import { buildActionItems, countsBySeverity, weekOfTerm } from "../urgency";
import type { TeacherOverview, TeacherSchemeRow } from "../../../api/dashboard";

const scheme = (over: Partial<TeacherSchemeRow> = {}): TeacherSchemeRow => ({
  subject_id: 1,
  subject_name: "Web3 Applications",
  subject_code: "W3",
  subject_color: "#A855F7",
  class_group_id: 11,
  class_group_name: "L4. Class A",
  scheme_id: 5,
  status: "submitted",
  entries_count: 12,
  validation_status: "PENDING",
  validation_comment: null,
  updated_at: null,
  ...over,
});

const overview = (
  schemes: TeacherSchemeRow[],
  over: Partial<TeacherOverview> = {},
): TeacherOverview =>
  ({
    schemes: {
      total: schemes.length,
      submitted: schemes.filter((s) => s.status === "submitted").length,
      pending: schemes.filter((s) => s.status === "pending").length,
      approved: 0,
      rejected: 0,
      awaiting_validation: 0,
      rows: schemes,
    },
    lessonNotes: { total: 0, drafts: 0, published: 0, recent_drafts: [] },
    courses: { total: 0, drafts: 0, published: 0, recent: [] },
    ...over,
  }) as TeacherOverview;

describe("weekOfTerm", () => {
  it("counts from the term's first day, 1-based", () => {
    expect(weekOfTerm("2026-09-07", new Date(2026, 8, 7))).toBe(1);
    expect(weekOfTerm("2026-09-07", new Date(2026, 8, 13))).toBe(1);
    expect(weekOfTerm("2026-09-07", new Date(2026, 8, 14))).toBe(2);
    expect(weekOfTerm("2026-09-07", new Date(2026, 8, 22))).toBe(3);
  });

  it("stands down rather than guessing", () => {
    // No start date, an unparseable one, or a term that hasn't started: a
    // wrong week would invent urgency that isn't there.
    expect(weekOfTerm(null)).toBeNull();
    expect(weekOfTerm("not-a-date")).toBeNull();
    expect(weekOfTerm("2026-09-07", new Date(2026, 8, 1))).toBeNull();
  });
});

describe("buildActionItems", () => {
  it("puts a rejected scheme first and quotes the validator's comment", () => {
    const items = buildActionItems(
      overview([
        scheme({
          validation_status: "REJECTED",
          validation_comment: "Add assessment weeks",
        }),
      ]),
      3,
    );
    expect(items[0].key).toBe("scheme-rejected");
    expect(items[0].severity).toBe("blocking");
    expect(items[0].why).toBe("Add assessment weeks");
  });

  it("escalates a missing scheme once teaching has started", () => {
    const rows = [
      scheme({ status: "pending", scheme_id: null, entries_count: 0 }),
    ];

    // Week 1: still a to-do.
    expect(buildActionItems(overview(rows), 1)[0].severity).toBe("slipping");
    // Week 2 onwards: everything downstream is blocked on it.
    const started = buildActionItems(overview(rows), 2)[0];
    expect(started.severity).toBe("blocking");
    expect(started.why).toContain("week 2");
  });

  it("does not accuse a missing scheme of also being behind", () => {
    // One piece of work, one alarm — a scheme that doesn't exist is reported
    // as missing, never additionally as "behind the calendar".
    const items = buildActionItems(
      overview([
        scheme({ status: "pending", scheme_id: null, entries_count: 0 }),
      ]),
      5,
    );
    expect(items.map((i) => i.key)).toEqual(["scheme-missing"]);
  });

  it("flags a started scheme that has fallen behind the term", () => {
    const items = buildActionItems(overview([scheme({ entries_count: 2 })]), 5);
    const behind = items.find((i) => i.key === "scheme-behind");
    expect(behind?.severity).toBe("slipping");
    expect(behind?.detail).toContain("2/5 weeks");
  });

  it("judges nothing as behind when the term has no start date", () => {
    const items = buildActionItems(
      overview([scheme({ entries_count: 1 })]),
      null,
    );
    expect(items.find((i) => i.key === "scheme-behind")).toBeUndefined();
  });

  it("orders blocking above slipping above tidy", () => {
    const items = buildActionItems(
      overview(
        [
          scheme({ validation_status: "REJECTED" }),
          scheme({ subject_id: 2, class_group_id: 12, entries_count: 1 }),
        ],
        {
          lessonNotes: {
            total: 2,
            drafts: 2,
            published: 0,
            recent_drafts: [],
          },
          courses: { total: 1, drafts: 1, published: 0, recent: [] },
        } as Partial<TeacherOverview>,
      ),
      4,
    );
    expect(items.map((i) => i.severity)).toEqual([
      "blocking",
      "slipping",
      "slipping",
      "tidy",
    ]);
  });

  it("counts the things behind each tier, not the rows", () => {
    const counts = countsBySeverity(
      buildActionItems(
        overview([
          scheme({ validation_status: "REJECTED" }),
          scheme({
            subject_id: 2,
            class_group_id: 12,
            validation_status: "REJECTED",
          }),
        ]),
        1,
      ),
    );
    expect(counts.blocking).toBe(2);
    expect(counts.slipping).toBe(0);
  });

  it("reports nothing when everything is in order", () => {
    expect(
      buildActionItems(overview([scheme({ entries_count: 8 })]), 3),
    ).toEqual([]);
  });
});
