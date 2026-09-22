import { describe, it, expect } from "vitest";
import {
  subjectKey,
  highlightState,
  countPeriodsBySubject,
} from "../subjectHighlight";

describe("subjectKey", () => {
  it("prefers the subject id", () => {
    expect(subjectKey({ subject_id: 9, subject_name: "Maths" })).toBe("id:9");
  });

  it("falls back to the trimmed name when there is no id", () => {
    expect(subjectKey({ subject_id: null, subject_name: " Maths " })).toBe(
      "name:Maths",
    );
  });

  it("keys a custom activity by its name, case-insensitively, never by subject id", () => {
    const a = { subject_id: 0, subject_name: "Supervised Self Study", __activity: { activity_name: "Supervised Self Study" } };
    const b = { subject_id: 0, subject_name: "supervised self study", __activity: { activity_name: "supervised self study" } };
    const c = { subject_id: 0, subject_name: "Student Led clubs", __activity: { activity_name: "Student Led clubs" } };
    expect(subjectKey(a)).toBe("activity:supervised self study");
    expect(subjectKey(a)).toBe(subjectKey(b));
    expect(subjectKey(c)).not.toBe(subjectKey(a));
    // a real lesson that happens to have subject_id 0 is still not an event
    expect(subjectKey({ subject_id: 0, subject_name: "X" })).toBe("id:0");
  });

  it("is null for a slot that names no subject at all", () => {
    expect(subjectKey({ subject_id: null, subject_name: "" })).toBeNull();
    expect(subjectKey({})).toBeNull();
  });
});

describe("highlightState", () => {
  const maths = { subject_id: 9, subject_name: "Maths" };
  const physics = { subject_id: 10, subject_name: "Physics" };

  it("is idle for everything when nothing is hovered", () => {
    expect(highlightState(null, maths)).toBe("idle");
    expect(highlightState(null, physics)).toBe("idle");
  });

  it("matches only the hovered subject and marks every other one as other", () => {
    expect(highlightState("id:9", maths)).toBe("match");
    expect(highlightState("id:9", physics)).toBe("other");
  });

  it("matches the same subject taught to a different class group", () => {
    expect(
      highlightState("id:9", { ...maths, class_group_id: 4 } as any),
    ).toBe("match");
  });

  it("does not match on name when ids differ", () => {
    expect(
      highlightState("id:9", { subject_id: 11, subject_name: "Maths" }),
    ).toBe("other");
  });
});

describe("countPeriodsBySubject", () => {
  it("counts lessons per subject and skips subject-less slots", () => {
    const counts = countPeriodsBySubject([
      { subject_id: 9, subject_name: "Maths" },
      { subject_id: 9, subject_name: "Maths" },
      { subject_id: 10, subject_name: "Physics" },
      { subject_id: null, subject_name: null },
    ]);
    expect(counts.get("id:9")).toBe(2);
    expect(counts.get("id:10")).toBe(1);
    expect(counts.size).toBe(2);
  });
});
