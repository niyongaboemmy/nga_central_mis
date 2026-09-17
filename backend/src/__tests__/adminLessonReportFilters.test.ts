import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createRoleWithPermissions,
  assignRole,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// Phase 2: admin lesson-report list now filters by subject_id AND
// class_group_id consistently, and — because LessonReport denormalizes both
// (Phase 1) — an ad-hoc report (no CalendarSlot/entry_id) shows up under the
// same filters as a scheduled one, which was impossible before Phase 1/2.
describe("GET /reports/admin/lesson-reports — subject/class-group filters", () => {
  let teacherToken: string;
  let adminToken: string;
  let subjectA: number;
  let subjectB: number;
  let classGroupA: number;
  let classGroupB: number;

  beforeAll(async () => {
    const teacherId = await createUser();
    teacherToken = signToken(teacherId);

    const adminId = await createUser({ userType: "ADMIN" });
    const adminRoleId = await createRoleWithPermissions("REPORT_ADMIN", [
      Permissions.ALL_SUBMITTED_REPORTS,
    ]);
    await assignRole(adminId, adminRoleId);
    adminToken = signToken(adminId);

    const { academicYearId } = await createAcademicPeriod();
    classGroupA = await createProgramGradeClassGroup();
    classGroupB = await createProgramGradeClassGroup();
    subjectA = await createSubject();
    subjectB = await createSubject();

    await createTeacherSubjectAssignment({ userId: teacherId, subjectId: subjectA, classGroupId: classGroupA, academicYearId });
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId: subjectB, classGroupId: classGroupB, academicYearId });

    // Ad-hoc report for Subject A / Class Group A
    await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ delivery_date: "2026-03-10", subject_id: subjectA, class_group_id: classGroupA });

    // Ad-hoc report for Subject B / Class Group B
    await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ delivery_date: "2026-03-10", subject_id: subjectB, class_group_id: classGroupB });
  });

  it("filters admin lesson reports by subject_id, including ad-hoc rows", async () => {
    const res = await request(app)
      .get("/reports/admin/lesson-reports")
      .query({ subject_id: subjectA })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].subject_id).toBe(subjectA);
    expect(res.body.data[0].status).toBe("UNPLANNED");
  });

  it("filters admin lesson reports by class_group_id", async () => {
    const res = await request(app)
      .get("/reports/admin/lesson-reports")
      .query({ class_group_id: classGroupB })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].class_group_id).toBe(classGroupB);
  });

  it("combining subject_id + class_group_id from different reports yields no match", async () => {
    const res = await request(app)
      .get("/reports/admin/lesson-reports")
      .query({ subject_id: subjectA, class_group_id: classGroupB })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });
});
