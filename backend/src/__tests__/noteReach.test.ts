import { describe, it, expect } from "vitest";
import { computeNoteReach } from "../services/elearning/noteReach";

const NOW = new Date("2026-10-10T08:00:00Z");
const open = { is_published: true, section_status: "PUBLISHED", section_unlock_at: null, course_status: "PUBLISHED" };

describe("computeNoteReach", () => {
  it("is LIVE only when every link is open", () => {
    const r = computeNoteReach({ note_status: "PUBLISHED", placement: open }, NOW);
    expect(r.state).toBe("LIVE");
    expect(r.blocker).toBeNull();
    expect(r.steps.every((s) => s.ok)).toBe(true);
  });

  it("names the first thing in the way, with its fix", () => {
    const r = computeNoteReach(
      { note_status: "DRAFT", placement: { ...open, section_status: "HIDDEN", course_status: "DRAFT" } },
      NOW,
    );
    expect(r.state).toBe("BLOCKED");
    expect(r.blocker).toBe("Note is a draft");
    expect(r.steps.filter((s) => !s.ok).map((s) => s.fix)).toEqual(["publish_note", "publish_week", "publish_course"]);
  });

  it("counts a placed-but-hidden item as not reaching students", () => {
    const r = computeNoteReach({ note_status: "PUBLISHED", placement: { ...open, is_published: false } }, NOW);
    expect(r.state).toBe("BLOCKED");
    expect(r.blocker).toBe("Hidden in the week");
  });

  it("is SCHEDULED when only the week's date is left, and LIVE once it passes", () => {
    const later = { ...open, section_status: "SCHEDULED", section_unlock_at: "2026-10-12T06:00:00Z" };
    const r = computeNoteReach({ note_status: "PUBLISHED", placement: later }, NOW);
    expect(r.state).toBe("SCHEDULED");
    expect(r.opens_at).toBe("2026-10-12T06:00:00.000Z");
    const passed = computeNoteReach(
      { note_status: "PUBLISHED", placement: { ...later, section_unlock_at: "2026-10-01T06:00:00Z" } },
      NOW,
    );
    expect(passed.state).toBe("LIVE");
  });

  it("a scheduled week with another blocker is BLOCKED, not SCHEDULED", () => {
    const r = computeNoteReach(
      { note_status: "DRAFT", placement: { ...open, section_status: "SCHEDULED", section_unlock_at: "2026-10-12T06:00:00Z" } },
      NOW,
    );
    expect(r.state).toBe("BLOCKED");
  });

  it("offers placement only when a course exists", () => {
    const withCourse = computeNoteReach({ note_status: "PUBLISHED", placement: null, has_course: true }, NOW);
    expect(withCourse.state).toBe("OFF_COURSE");
    expect(withCourse.steps.find((s) => s.key === "placed")?.fix).toBe("place");
    const without = computeNoteReach({ note_status: "PUBLISHED", placement: null, has_course: false }, NOW);
    expect(without.steps.find((s) => s.key === "placed")?.fix).toBeUndefined();
  });

  it("an archived course has no one-click fix", () => {
    const r = computeNoteReach({ note_status: "PUBLISHED", placement: { ...open, course_status: "ARCHIVED" } }, NOW);
    expect(r.state).toBe("BLOCKED");
    expect(r.steps.find((s) => s.key === "course")?.fix).toBeUndefined();
  });
});
