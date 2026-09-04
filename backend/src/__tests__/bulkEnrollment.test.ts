import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import { GradeSubject } from "../db/schema";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createSubject,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";

// Class-group assignment now drives subject enrollment automatically off the
// grade's curriculum (GradeSubject), and admins can enroll/assign many
// students in one request instead of one profile modal at a time.
describe("Bulk subject enrollment", () => {
  let adminToken: string;
  let noPermToken: string;
  let gradeId: number;
  let classGroupId: number;
  let academicYearId: number;
  let subjectAId: number;
  let subjectBId: number;

  beforeAll(async () => {
    const adminId = await createUser({ userType: "ADMIN" });
    const roleId = await createRoleWithPermissions("bulk-enroll-admin", [
      "ASSIGN_STUDENT_CLASS_GROUPS",
      "MANAGE_STUDENT_ENROLLMENTS",
    ]);
    await assignRole(adminId, roleId);
    adminToken = signToken(adminId);

    const noPermId = await createUser({ userType: "ADMIN" });
    noPermToken = signToken(noPermId);

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;

    const chain = await createProgramGradeClassGroupDetailed();
    gradeId = chain.gradeId;
    classGroupId = chain.classGroupId;

    subjectAId = await createSubject();
    subjectBId = await createSubject();
    await db
      .insert(GradeSubject)
      .values([
        { grade_id: gradeId, subject_id: subjectAId },
        { grade_id: gradeId, subject_id: subjectBId },
      ]);
  });

  it("auto-enrolls a student into the grade curriculum when assigned to a class group (single-student flow)", async () => {
    const studentId = await createUser({ userType: "STUDENT" });

    const assignRes = await request(app)
      .post("/academics/students/assign-class-group")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        user_id: studentId,
        class_group_id: classGroupId,
        academic_year_id: academicYearId,
      });
    expect(assignRes.status).toBe(201);

    const enrolledRes = await request(app)
      .get(`/academics/students/${studentId}/enrolled-subjects`)
      .query({ academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(enrolledRes.status).toBe(200);
    const subjectIds = enrolledRes.body.data.map((e: any) => e.subject_id);
    expect(subjectIds).toContain(subjectAId);
    expect(subjectIds).toContain(subjectBId);
  });

  it("bulk-assigns many students to a class group and auto-enrolls all of them", async () => {
    const studentIds = [
      await createUser({ userType: "STUDENT" }),
      await createUser({ userType: "STUDENT" }),
      await createUser({ userType: "STUDENT" }),
    ];

    const res = await request(app)
      .post("/academics/students/bulk-assign-class-group")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        user_ids: studentIds,
        class_group_id: classGroupId,
        academic_year_id: academicYearId,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.assigned).toBe(3);
    expect(res.body.data.subjects_enrolled).toBe(6); // 3 students x 2 subjects

    for (const studentId of studentIds) {
      const enrolledRes = await request(app)
        .get(`/academics/students/${studentId}/enrolled-subjects`)
        .query({ academic_year_id: academicYearId })
        .set("Authorization", `Bearer ${adminToken}`);
      expect(enrolledRes.body.data.map((e: any) => e.subject_id)).toEqual(
        expect.arrayContaining([subjectAId, subjectBId]),
      );
    }

    // Re-running the same bulk assignment is idempotent: nothing new to
    // insert on either the class-group or the subject-enrollment side.
    const repeatRes = await request(app)
      .post("/academics/students/bulk-assign-class-group")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        user_ids: studentIds,
        class_group_id: classGroupId,
        academic_year_id: academicYearId,
      });
    expect(repeatRes.status).toBe(200);
    expect(repeatRes.body.data.already_active).toBe(3);
    expect(repeatRes.body.data.subjects_enrolled).toBe(0);
  });

  it("bulk-enrolls specific students into specific subjects, skipping ones already enrolled", async () => {
    const studentIds = [
      await createUser({ userType: "STUDENT" }),
      await createUser({ userType: "STUDENT" }),
    ];

    // Pre-enroll the first student in subject A only, via the class-group
    // auto-enroll path (also exercises the two flows sharing one source of
    // truth).
    await request(app)
      .post("/academics/students/bulk-assign-class-group")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        user_ids: [studentIds[0]],
        class_group_id: classGroupId,
        academic_year_id: academicYearId,
      });

    const res = await request(app)
      .post("/academics/students/bulk-enroll-subjects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        user_ids: studentIds,
        subject_ids: [subjectAId, subjectBId],
        academic_year_id: academicYearId,
      });

    expect(res.status).toBe(200);
    // 2 students x 2 subjects = 4 total pairs; studentIds[0] already has
    // both (2 already enrolled via the class-group auto-enroll), so 2 new.
    expect(res.body.data.total).toBe(4);
    expect(res.body.data.enrolled).toBe(2);
    expect(res.body.data.skipped).toBe(2);
  });

  it("returns the class group's curriculum coverage roster", async () => {
    const res = await request(app)
      .get(`/academics/class-groups/${classGroupId}/enrollment-roster`)
      .query({ academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.subjects.map((s: any) => s.subject_id)).toEqual(
      expect.arrayContaining([subjectAId, subjectBId]),
    );
    expect(Array.isArray(res.body.data.students)).toBe(true);
    for (const student of res.body.data.students) {
      expect(student.total_subjects).toBe(2);
      expect(student.enrolled_count).toBeLessThanOrEqual(2);
    }
  });

  it("403s bulk-assign-class-group without the required permission", async () => {
    const res = await request(app)
      .post("/academics/students/bulk-assign-class-group")
      .set("Authorization", `Bearer ${noPermToken}`)
      .send({
        user_ids: [1],
        class_group_id: classGroupId,
        academic_year_id: academicYearId,
      });
    expect(res.status).toBe(403);
  });

  it("403s bulk-enroll-subjects without the required permission", async () => {
    const res = await request(app)
      .post("/academics/students/bulk-enroll-subjects")
      .set("Authorization", `Bearer ${noPermToken}`)
      .send({
        user_ids: [1],
        subject_ids: [subjectAId],
        academic_year_id: academicYearId,
      });
    expect(res.status).toBe(403);
  });

  it("400s bulk-assign-class-group with an empty user_ids array", async () => {
    const res = await request(app)
      .post("/academics/students/bulk-assign-class-group")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ user_ids: [], class_group_id: classGroupId, academic_year_id: academicYearId });
    expect(res.status).toBe(400);
  });
});
