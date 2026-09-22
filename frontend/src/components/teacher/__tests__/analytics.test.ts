import { describe, it, expect } from "vitest";
import {
  coverageRows,
  subjectLoad,
  truncateTick,
  weeklyLoad,
} from "../analytics";
import type { TeacherOverview, TeacherSchemeRow } from "../../../api/dashboard";

const scheme = (over: Partial<TeacherSchemeRow> = {}): TeacherSchemeRow => ({
  subject_id: 1,
  subject_name: "Maths",
  subject_code: "M",
  subject_color: "#2a78d6",
  class_group_id: 11,
  class_group_name: "L4. Class A",
  scheme_id: 5,
  status: "submitted",
  entries_count: 6,
  validation_status: "PENDING",
  validation_comment: null,
  updated_at: null,
  ...over,
});

describe("coverageRows", () => {
  it("ranks the worst offender first", () => {
    const rows = coverageRows(
      [
        scheme({ subject_id: 1, subject_name: "On track", entries_count: 6 }),
        scheme({
          subject_id: 2,
          subject_name: "Missing",
          status: "pending",
          scheme_id: null,
          entries_count: 0,
        }),
        scheme({ subject_id: 3, subject_name: "Behind", entries_count: 2 }),
      ],
      5,
    );
    expect(rows.map((r) => r.subject)).toEqual([
      "Missing",
      "Behind",
      "On track",
    ]);
    expect(rows[0].status).toBe("critical");
    expect(rows[1].status).toBe("warning");
    expect(rows[2].status).toBe("good");
  });

  it("names how far behind a scheme is", () => {
    const [row] = coverageRows([scheme({ entries_count: 2 })], 5);
    expect(row.statusLabel).toBe("3 weeks behind");
    expect(row.planned).toBe(2);
    expect(row.target).toBe(5);
  });

  it("reports neutrally when there is no target to judge against", () => {
    const [row] = coverageRows([scheme({ entries_count: 1 })], null);
    expect(row.status).toBe("good");
    expect(row.target).toBe(0);
  });

  it("disambiguates the axis category when one subject has two classes", () => {
    // Recharts bands on the category value, so two rows sharing a subject
    // name would collapse onto one bar.
    const rows = coverageRows(
      [
        scheme({
          class_group_id: 11,
          class_group_name: "L4. A",
          entries_count: 6,
        }),
        scheme({
          class_group_id: 12,
          class_group_name: "L4. B",
          entries_count: 6,
        }),
      ],
      3,
    );
    expect(rows.map((r) => r.axisLabel)).toEqual([
      "Maths · L4. A",
      "Maths · L4. B",
    ]);
  });

  it("leaves a unique subject name alone on the axis", () => {
    const [row] = coverageRows([scheme()], 3);
    expect(row.axisLabel).toBe("Maths");
  });

  it("treats a rejected scheme as critical however many weeks it has", () => {
    const [row] = coverageRows(
      [scheme({ entries_count: 20, validation_status: "REJECTED" })],
      3,
    );
    expect(row.status).toBe("critical");
    expect(row.statusLabel).toBe("Sent back");
  });
});

describe("weeklyLoad", () => {
  const load = (periods: Record<number, number>) =>
    [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      periods: periods[d] ?? 0,
    }));

  it("always shows Mon–Fri and marks today", () => {
    const points = weeklyLoad(load({ 1: 2, 3: 1 }), 3);
    expect(points.map((p) => p.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
    ]);
    expect(points.find((p) => p.label === "Wed")?.isToday).toBe(true);
  });

  it("adds a weekend day only when it actually has periods", () => {
    const points = weeklyLoad(load({ 1: 2, 6: 1 }), 1);
    expect(points.map((p) => p.label)).toContain("Sat");
    expect(points.map((p) => p.label)).not.toContain("Sun");
  });
});

describe("subjectLoad", () => {
  const cls = (name: string, periods: number) =>
    ({
      subject_id: name.length,
      subject_name: name,
      subject_code: null,
      subject_color: null,
      class_group_id: 1,
      class_group_name: "A",
      grade_name: null,
      periods_per_week: periods,
    }) as TeacherOverview["classes"][number];

  it("ranks heaviest first and drops classes with no periods", () => {
    const points = subjectLoad([cls("a", 1), cls("bb", 4), cls("ccc", 0)]);
    expect(points.map((p) => p.subject)).toEqual(["bb", "a"]);
  });

  it("folds the tail into Other rather than shrinking every bar", () => {
    const many = Array.from({ length: 10 }, (_, i) => cls(`s${i}`, 10 - i));
    const points = subjectLoad(many, 4);
    expect(points).toHaveLength(4);
    expect(points[3].subject).toBe("Other");
    // The folded rows keep their periods — 7 + 6 + ... + 1.
    expect(points[3].periods).toBe(28);
    expect(points[3].label).toBe("Other (7)");
  });
});

describe("truncateTick", () => {
  it("shortens only what would overflow the axis gutter", () => {
    expect(truncateTick("Maths", 22)).toBe("Maths");
    expect(
      truncateTick("Web Application Development Using JavaScript", 22),
    ).toBe("Web Application Devel…");
  });
});
