import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createSubject,
  createTeacherSubjectAssignment,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createCalendarSlot,
  createSchemeOfWork,
  createSchemeOfWorkEntry,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";

// The Teacher Dashboard's single payload. Its job is to be the *same* answer
// the individual modules give -- the timetable it reports has to obey the
// calendar's live-lesson rules, and the scheme status has to match what the
// Scheme of Work screens show -- so this asserts against those rules rather
// than against the shape alone.
describe("GET /dashboard/teacher-overview", () => {
  let teacherToken: string;
  let teacherId: number;
  let academicYearId: number;
  let academicTermId: number;
  let groupA: number;
  let maths: number;
  let physics: number;
  let unassignedSubject: number;

  const overview = () =>
    request(app)
      .get("/dashboard/teacher-overview")
      .query({
        academic_year_id: academicYearId,
        academic_term_id: academicTermId,
      })
      .set("Authorization", `Bearer ${teacherToken}`);

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;

    const a = await createProgramGradeClassGroupDetailed();
    groupA = a.classGroupId;

    maths = await createSubject();
    physics = await createSubject();
    unassignedSubject = await createSubject();

    teacherId = await createUser({ userType: "TEACHER" });
    const role = await createRoleWithPermissions("overview-teacher", [
      "TEACHER_DASHBOARD",
    ]);
    await assignRole(teacherId, role);
    teacherToken = signToken(teacherId);

    for (const subject of [maths, physics]) {
      await createTeacherSubjectAssignment({
        userId: teacherId,
        subjectId: subject,
        classGroupId: groupA,
        academicYearId,
      });
    }

    // Two students, one of whom takes both subjects: the headline is distinct
    // students, not enrolment rows.
    for (const subjects of [[maths, physics], [maths]]) {
      const student = await createUser({ userType: "STUDENT" });
      await createStudentClassGroup({
        userId: student,
        classGroupId: groupA,
        academicYearId,
      });
      for (const subjectId of subjects) {
        await createStudentSubjectEnrollment({
          userId: student,
          subjectId,
          academicYearId,
        });
      }
    }

    // Monday: two periods of maths, one of physics.
    await createCalendarSlot({
      userId: teacherId,
      subjectId: maths,
      classGroupId: groupA,
      academicTermId,
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "09:40",
    });
    await createCalendarSlot({
      userId: teacherId,
      subjectId: physics,
      classGroupId: groupA,
      academicTermId,
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "10:50",
    });
    // Wednesday: one more period of maths.
    await createCalendarSlot({
      userId: teacherId,
      subjectId: maths,
      classGroupId: groupA,
      academicTermId,
      dayOfWeek: 3,
      startTime: "08:00",
      endTime: "08:50",
    });
    // A slot stamped with this teacher for a subject they are no longer
    // assigned -- the timetable drops it, so the dashboard must too.
    await createCalendarSlot({
      userId: teacherId,
      subjectId: unassignedSubject,
      classGroupId: groupA,
      academicTermId,
      dayOfWeek: 2,
      startTime: "08:00",
      endTime: "08:50",
    });

    // Maths has a scheme with a week in it; physics has none at all.
    const scheme = await createSchemeOfWork({
      userId: teacherId,
      subjectId: maths,
      classGroupId: groupA,
      academicTermId,
    });
    await createSchemeOfWorkEntry(scheme);
  });

  it("reports the teacher's headline figures for the selected period", async () => {
    const res = await overview();
    expect(res.status).toBe(200);

    const { kpis, period } = res.body.data;
    expect(kpis.assignedSubjects).toBe(2);
    expect(kpis.assignedClassGroups).toBe(1);
    expect(kpis.totalStudents).toBe(2);
    expect(period.academic_term_id).toBe(academicTermId);
    expect(period.academic_year_id).toBe(academicYearId);
  });

  it("counts only lessons the timetable itself still draws", async () => {
    const res = await overview();
    const { kpis, schedule } = res.body.data;

    // Three live periods; the slot on the unassigned subject is excluded.
    expect(kpis.weeklyPeriods).toBe(3);
    // 100 + 50 + 50 minutes.
    expect(kpis.weeklyMinutes).toBe(200);

    const monday = schedule.week_load.find((d: any) => d.day_of_week === 1);
    const tuesday = schedule.week_load.find((d: any) => d.day_of_week === 2);
    expect(monday.periods).toBe(2);
    expect(tuesday.periods).toBe(0);
  });

  it("lists one scheme row per assignment, flagging the missing one", async () => {
    const res = await overview();
    const { schemes } = res.body.data;

    expect(schemes.total).toBe(2);
    expect(schemes.submitted).toBe(1);
    expect(schemes.pending).toBe(1);

    const mathsRow = schemes.rows.find((r: any) => r.subject_id === maths);
    const physicsRow = schemes.rows.find((r: any) => r.subject_id === physics);
    expect(mathsRow.status).toBe("submitted");
    expect(mathsRow.entries_count).toBe(1);
    expect(physicsRow.status).toBe("pending");
    expect(physicsRow.scheme_id).toBeNull();
  });

  it("reports periods per week for each class the teacher takes", async () => {
    const res = await overview();
    const classes = res.body.data.classes;

    expect(classes).toHaveLength(2);
    expect(
      classes.find((c: any) => c.subject_id === maths).periods_per_week,
    ).toBe(2);
    expect(
      classes.find((c: any) => c.subject_id === physics).periods_per_week,
    ).toBe(1);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/dashboard/teacher-overview");
    expect(res.status).toBe(401);
  });
});
