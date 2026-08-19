import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { db } from "../db";
import { AcademicTerm } from "../db/schema";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createUserGradeAssignment,
  createSubject,
  createTeacherSubjectAssignment,
  createCalendarSlot,
  createSchemeOfWork,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// The subject panel's Schedule tab listed every slot the subject had ever had,
// stacking Term 1 and Term 2 periods on the same weekday. A timetable only
// means anything inside one year+term, so the panel now sends the period
// selected in the top bar and the query honours it.
describe("Subject detail — schedule and scheme follow the selected year/term", () => {
  let yearId: number;
  let termOneId: number;
  let termTwoId: number;
  let classTeacherToken: string;
  let subjectId: number;
  let classGroupId: number;
  let teacherId: number;

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    yearId = period.academicYearId;
    termOneId = period.academicTermId;

    // A second term in the SAME year — this is what used to bleed through.
    const [termTwo] = (await db.insert(AcademicTerm).values({
      academic_year_id: yearId,
      name: "Term 2",
      start_date: "2026-07-01",
      end_date: "2026-12-31",
      is_current: 0,
    } as any)) as any;
    termTwoId = termTwo.insertId as number;

    const base = await createProgramGradeClassGroupDetailed();
    classGroupId = base.classGroupId;

    const viewerRoleId = await createRoleWithPermissions("SUBJECT_PERIOD_VIEW", [
      Permissions.VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE,
    ]);
    const classTeacherId = await createUser({ userType: "TEACHER" });
    await assignRole(classTeacherId, viewerRoleId);
    await createUserGradeAssignment({
      userId: classTeacherId,
      gradeId: base.gradeId,
      classGroupId,
      academicYearId: yearId,
    });
    classTeacherToken = signToken(classTeacherId);

    subjectId = await createSubject();
    teacherId = await createUser({ userType: "TEACHER" });
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicYearId: yearId,
    });

    // One period in each term, on different days so they are distinguishable.
    await createCalendarSlot({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicTermId: termOneId,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "09:50",
    });
    await createCalendarSlot({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicTermId: termTwoId,
      dayOfWeek: 3,
      startTime: "14:00",
      endTime: "14:50",
    });

    await createSchemeOfWork({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicTermId: termOneId,
    });
    await createSchemeOfWork({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicTermId: termTwoId,
    });
  });

  const detail = (query: string) =>
    request(app)
      .get(`/users/scope/subjects/${subjectId}?${query}`)
      .set("Authorization", `Bearer ${classTeacherToken}`);

  it("returns only the selected term's periods", async () => {
    const res = await detail(
      `academic_year_id=${yearId}&academic_term_id=${termOneId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.schedule).toHaveLength(1);
    expect(res.body.data.schedule[0].day_of_week).toBe(1);
    expect(res.body.data.schedule[0].start_time).toBe("09:00");
  });

  it("switches with the term", async () => {
    const res = await detail(
      `academic_year_id=${yearId}&academic_term_id=${termTwoId}`,
    );
    expect(res.body.data.schedule).toHaveLength(1);
    expect(res.body.data.schedule[0].day_of_week).toBe(3);
  });

  it("returns only the selected term's scheme of work", async () => {
    const res = await detail(
      `academic_year_id=${yearId}&academic_term_id=${termOneId}`,
    );
    expect(res.body.data.schemes).toHaveLength(1);
    expect(res.body.data.schemes[0].academic_term_id).toBe(termOneId);
  });

  it("falls back to the whole year when no term is given", async () => {
    const res = await detail(`academic_year_id=${yearId}`);
    expect(res.body.data.schedule).toHaveLength(2);
  });
});
