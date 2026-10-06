import { describe, it, expect } from "vitest";
import { noteReachesStudent } from "../controllers/lessonNoteController";

// The pure audience rule behind "Notes Shared With Me"; the HTTP-level cases live in
// lessonNoteSharedWithMe.test.ts.
describe("noteReachesStudent", () => {
  const year1Note = { subject_id: 7, class_group_id: 10, class_grade_id: 1 };
  const year2Student = { classGroupIds: [20], gradeIds: [2], subjectIds: [7] };

  it("reads share ids stored as JSON text (MariaDB) as ids, not as a substring", () => {
    // "[123]".includes(12) would be true; student 12 was never picked.
    const share = { filter_type: "specific_students", filter_ids: "[123]", expires_at: null };
    expect(noteReachesStudent(year1Note, [share], year2Student, 12)).toBe(false);
    expect(noteReachesStudent(year1Note, [share], year2Student, 123)).toBe(true);
  });

  it("ignores an expired share", () => {
    const share = { filter_type: "specific_students", filter_ids: [12], expires_at: "2020-01-01T00:00:00Z" };
    expect(noteReachesStudent(year1Note, [share], year2Student, 12)).toBe(false);
  });

  it("lets a classless note reach everyone enrolled in its subject", () => {
    const classless = { subject_id: 7, class_group_id: null, class_grade_id: null };
    expect(noteReachesStudent(classless, [], year2Student, 12)).toBe(true);
  });
});
