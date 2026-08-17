import { describe, it, expect, beforeAll } from "vitest";
import { assertTeacherOwnsScheme } from "../utils/schemeAuthorization";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
} from "../test/fixtures";

// ClassGroup rows are reused across academic years and TeacherSubjectAssignment is keyed by
// (user, subject, class group, year), so a teacher who teaches the same subject to the same class
// group in two consecutive years holds two assignment rows. The scheme guard must pick the row for
// the *term's* year rather than an arbitrary one, otherwise the earlier year's row wins and the
// teacher can never generate/edit a scheme for the current year.
describe("assertTeacherOwnsScheme — assignments spanning multiple academic years", () => {
  let userId: number;
  let subjectId: number;
  let classGroupId: number;
  let oldTermId: number;
  let currentTermId: number;
  let unassignedTermId: number;

  beforeAll(async () => {
    userId = await createUser();
    subjectId = await createSubject();
    classGroupId = await createProgramGradeClassGroup();

    const oldPeriod = await createAcademicPeriod();
    const currentPeriod = await createAcademicPeriod();
    const otherPeriod = await createAcademicPeriod();
    oldTermId = oldPeriod.academicTermId;
    currentTermId = currentPeriod.academicTermId;
    unassignedTermId = otherPeriod.academicTermId;

    // Inserted oldest-first, which is what an unscoped LIMIT 1 lookup tends to return.
    await createTeacherSubjectAssignment({
      userId,
      subjectId,
      classGroupId,
      academicYearId: oldPeriod.academicYearId,
    });
    await createTeacherSubjectAssignment({
      userId,
      subjectId,
      classGroupId,
      academicYearId: currentPeriod.academicYearId,
    });
  });

  it("accepts a term from the later academic year the teacher is assigned to", async () => {
    await expect(
      assertTeacherOwnsScheme(userId, subjectId, classGroupId, currentTermId),
    ).resolves.toBeUndefined();
  });

  it("still accepts a term from the earlier academic year", async () => {
    await expect(
      assertTeacherOwnsScheme(userId, subjectId, classGroupId, oldTermId),
    ).resolves.toBeUndefined();
  });

  it("rejects a term from an academic year the teacher holds no assignment in", async () => {
    await expect(
      assertTeacherOwnsScheme(userId, subjectId, classGroupId, unassignedTermId),
    ).rejects.toThrow(/academic year you are not assigned to teach/i);
  });

  it("rejects a subject the teacher is not assigned to at all", async () => {
    const otherSubjectId = await createSubject();
    await expect(
      assertTeacherOwnsScheme(userId, otherSubjectId, classGroupId, currentTermId),
    ).rejects.toThrow(/not assigned to teach this subject/i);
  });

  it("rejects a term that does not exist", async () => {
    await expect(
      assertTeacherOwnsScheme(userId, subjectId, classGroupId, 99999999),
    ).rejects.toThrow(/does not exist/i);
  });
});
