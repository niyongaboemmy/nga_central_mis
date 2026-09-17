import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createSubject,
  createRoleWithPermissions,
  assignRole,
  createTeacherSubjectAssignment,
  createProgramGradeClassGroup,
  createStudentSubjectEnrollment,
} from "../test/fixtures";

// Students previously had no way to see their own enrolled subjects at all —
// no endpoint, no permission, no frontend page. GET /curriculum/my-enrolled-subjects
// is the new list endpoint (gated by VIEW_MY_ENROLLED_SUBJECTS); getSubjectDetail
// and getSubjectCompetencies are now gated by the same permission + an active
// StudentSubjectEnrollment so a student can't browse arbitrary subjects by ID.
describe("GET /curriculum/my-enrolled-subjects", () => {
  let enrolledStudentToken: string;
  let noPermStudentToken: string;
  let teacherToken: string;
  let subjectId: number;
  let otherSubjectId: number;
  let academicYearId: number;

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    subjectId = await createSubject();
    otherSubjectId = await createSubject();

    const teacherId = await createUser({ userType: "TEACHER" });
    teacherToken = signToken(teacherId);
    const classGroupId = await createProgramGradeClassGroup();
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicYearId,
    });

    const studentRoleId = await createRoleWithPermissions(
      "student-enrolled-subjects",
      ["VIEW_MY_ENROLLED_SUBJECTS"],
    );
    const enrolledStudentId = await createUser({ userType: "STUDENT" });
    enrolledStudentToken = signToken(enrolledStudentId);
    await assignRole(enrolledStudentId, studentRoleId);
    await createStudentSubjectEnrollment({
      userId: enrolledStudentId,
      subjectId,
      academicYearId,
    });

    const noPermRoleId = await createRoleWithPermissions(
      "student-no-enrolled-perm",
      [],
    );
    const noPermStudentId = await createUser({ userType: "STUDENT" });
    noPermStudentToken = signToken(noPermStudentId);
    await assignRole(noPermStudentId, noPermRoleId);
    await createStudentSubjectEnrollment({
      userId: noPermStudentId,
      subjectId,
      academicYearId,
    });
  });

  it("lists only the subjects the student is actively enrolled in", async () => {
    const res = await request(app)
      .get("/curriculum/my-enrolled-subjects")
      .set("Authorization", `Bearer ${enrolledStudentToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s: any) => s.subject_id);
    expect(ids).toContain(subjectId);
    expect(ids).not.toContain(otherSubjectId);
  });

  it("blocks a student whose role lacks VIEW_MY_ENROLLED_SUBJECTS", async () => {
    const res = await request(app)
      .get("/curriculum/my-enrolled-subjects")
      .set("Authorization", `Bearer ${noPermStudentToken}`);
    expect(res.status).toBe(403);
  });

  it("lets an enrolled student with the permission view the subject's overview", async () => {
    const res = await request(app)
      .get(`/curriculum/subjects/${subjectId}/detail`)
      .set("Authorization", `Bearer ${enrolledStudentToken}`);
    expect(res.status).toBe(200);
  });

  it("blocks an enrolled student from viewing a subject they aren't enrolled in", async () => {
    const res = await request(app)
      .get(`/curriculum/subjects/${otherSubjectId}/detail`)
      .set("Authorization", `Bearer ${enrolledStudentToken}`);
    expect(res.status).toBe(403);
  });

  it("lets an enrolled student with the permission view the subject's competencies", async () => {
    const res = await request(app)
      .get(`/curriculum/subjects/${subjectId}/competencies`)
      .set("Authorization", `Bearer ${enrolledStudentToken}`);
    expect(res.status).toBe(200);
  });

  it("blocks a student enrolled in the subject but whose role lacks the permission", async () => {
    const res = await request(app)
      .get(`/curriculum/subjects/${subjectId}/detail`)
      .set("Authorization", `Bearer ${noPermStudentToken}`);
    expect(res.status).toBe(403);
  });

  it("still lets the assigned teacher view subject detail and competencies without the new student permission", async () => {
    const detailRes = await request(app)
      .get(`/curriculum/subjects/${subjectId}/detail`)
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(detailRes.status).toBe(200);

    const compRes = await request(app)
      .get(`/curriculum/subjects/${subjectId}/competencies`)
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(compRes.status).toBe(200);
  });
});
