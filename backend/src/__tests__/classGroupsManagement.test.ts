import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import { GradeSubject, StudentSubjectEnrollment } from "../db/schema";
import { eq, and } from "drizzle-orm";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createSubject,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createTeacherSubjectAssignment,
  createUserGradeAssignment,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";

// The Class Groups Management tab drives every class-group relationship from
// one screen. Its navigator would otherwise need one roster + one curriculum +
// one assignment request per class group, so these endpoints answer the
// aggregate questions in a single round trip each.
describe("Class Groups Management endpoints", () => {
  let adminToken: string;
  let noPermToken: string;

  let yearId: number;
  let otherYearId: number;

  let programId: number;
  let gradeId: number;
  let classGroupA: number;
  let classGroupB: number;

  let subjectAId: number;
  let subjectBId: number;

  let fullyEnrolledStudent: number;
  let partiallyEnrolledStudent: number;
  let teacherId: number;

  beforeAll(async () => {
    const adminId = await createUser({ userType: "ADMIN" });
    const roleId = await createRoleWithPermissions("classgroups-admin", [
      "VIEW_ACADEMICS",
      "MANAGE_ACADEMICS",
      "MANAGE_USERS",
      "ASSIGN_STUDENT_CLASS_GROUPS",
      "MANAGE_STUDENT_ENROLLMENTS",
    ]);
    await assignRole(adminId, roleId);
    adminToken = signToken(adminId);

    noPermToken = signToken(await createUser({ userType: "ADMIN" }));

    const period = await createAcademicPeriod();
    yearId = period.academicYearId;
    // createAcademicPeriod marks each new year current, so the second one
    // created is what getCurrentAcademicYearId resolves to. Every assertion
    // below passes academic_year_id explicitly for that reason.
    const otherPeriod = await createAcademicPeriod();
    otherYearId = otherPeriod.academicYearId;

    const chain = await createProgramGradeClassGroupDetailed();
    programId = chain.programId;
    gradeId = chain.gradeId;
    classGroupA = chain.classGroupId;

    const second = await createProgramGradeClassGroupDetailed({
      programId,
      gradeId,
    });
    classGroupB = second.classGroupId;

    subjectAId = await createSubject();
    subjectBId = await createSubject();
    await db.insert(GradeSubject).values([
      { grade_id: gradeId, subject_id: subjectAId },
      { grade_id: gradeId, subject_id: subjectBId },
    ]);

    // Class group A: two students, one holding the full curriculum, one half.
    fullyEnrolledStudent = await createUser({ userType: "STUDENT" });
    partiallyEnrolledStudent = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: fullyEnrolledStudent,
      classGroupId: classGroupA,
      academicYearId: yearId,
    });
    await createStudentClassGroup({
      userId: partiallyEnrolledStudent,
      classGroupId: classGroupA,
      academicYearId: yearId,
    });
    for (const subjectId of [subjectAId, subjectBId]) {
      await createStudentSubjectEnrollment({
        userId: fullyEnrolledStudent,
        subjectId,
        academicYearId: yearId,
      });
    }
    await createStudentSubjectEnrollment({
      userId: partiallyEnrolledStudent,
      subjectId: subjectAId,
      academicYearId: yearId,
    });

    // One of two subjects staffed, plus a class teacher.
    teacherId = await createUser({ userType: "TEACHER" });
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId: subjectAId,
      classGroupId: classGroupA,
      academicYearId: yearId,
    });
    await createUserGradeAssignment({
      userId: teacherId,
      gradeId,
      classGroupId: classGroupA,
      academicYearId: yearId,
    });
  });

  describe("GET /academics/class-groups/overview", () => {
    it("reports per-class-group readiness counts for the requested year", async () => {
      const res = await request(app)
        .get("/academics/class-groups/overview")
        .query({ academic_year_id: yearId, program_id: programId })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const rows = res.body.data as any[];

      const a = rows.find((r) => r.class_group_id === classGroupA);
      expect(a).toBeDefined();
      expect(a.student_count).toBe(2);
      expect(a.curriculum_subject_count).toBe(2);
      expect(a.taught_subject_count).toBe(1);
      expect(a.fully_enrolled_student_count).toBe(1);
      expect(a.class_teacher?.user_id).toBe(teacherId);
      expect(a.grade_id).toBe(gradeId);
      expect(a.program_id).toBe(programId);
    });

    it("returns zeros and a null class teacher for an empty class group", async () => {
      const res = await request(app)
        .get("/academics/class-groups/overview")
        .query({ academic_year_id: yearId, program_id: programId })
        .set("Authorization", `Bearer ${adminToken}`);

      const b = (res.body.data as any[]).find(
        (r) => r.class_group_id === classGroupB,
      );
      expect(b).toBeDefined();
      expect(b.student_count).toBe(0);
      expect(b.taught_subject_count).toBe(0);
      expect(b.fully_enrolled_student_count).toBe(0);
      expect(b.class_teacher).toBeNull();
      // Curriculum belongs to the grade, which B shares with A.
      expect(b.curriculum_subject_count).toBe(2);
    });

    it("isolates cohorts by academic year", async () => {
      const res = await request(app)
        .get("/academics/class-groups/overview")
        .query({ academic_year_id: otherYearId, program_id: programId })
        .set("Authorization", `Bearer ${adminToken}`);

      const a = (res.body.data as any[]).find(
        (r) => r.class_group_id === classGroupA,
      );
      expect(a.student_count).toBe(0);
      expect(a.taught_subject_count).toBe(0);
      expect(a.class_teacher).toBeNull();
    });

    it("rejects a caller without VIEW_ACADEMICS", async () => {
      const res = await request(app)
        .get("/academics/class-groups/overview")
        .query({ academic_year_id: yearId })
        .set("Authorization", `Bearer ${noPermToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /academics/students/unassigned", () => {
    it("lists students with no class group for the year", async () => {
      const stray = await createUser({ userType: "STUDENT" });

      const res = await request(app)
        .get("/academics/students/unassigned")
        .query({ academic_year_id: yearId, limit: 100 })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data.students as any[]).map((s) => s.user_id);
      expect(ids).toContain(stray);
      expect(ids).not.toContain(fullyEnrolledStudent);
    });

    it("counts a student assigned only in another year as unassigned", async () => {
      const res = await request(app)
        .get("/academics/students/unassigned")
        .query({ academic_year_id: otherYearId, limit: 200 })
        .set("Authorization", `Bearer ${adminToken}`);

      const ids = (res.body.data.students as any[]).map((s) => s.user_id);
      expect(ids).toContain(fullyEnrolledStudent);
    });

    it("rejects a caller without ASSIGN_STUDENT_CLASS_GROUPS", async () => {
      const res = await request(app)
        .get("/academics/students/unassigned")
        .query({ academic_year_id: yearId })
        .set("Authorization", `Bearer ${noPermToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe("POST /academics/teachers/bulk-assign-subjects", () => {
    it("assigns many subjects at once and is idempotent on re-run", async () => {
      const newTeacher = await createUser({ userType: "TEACHER" });

      const first = await request(app)
        .post("/academics/teachers/bulk-assign-subjects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          user_id: newTeacher,
          subject_ids: [subjectAId, subjectBId],
          class_group_id: classGroupB,
          academic_year_id: yearId,
        });

      expect(first.status).toBe(200);
      expect(first.body.data).toMatchObject({
        assigned: 2,
        skipped: 0,
        total: 2,
      });

      const second = await request(app)
        .post("/academics/teachers/bulk-assign-subjects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          user_id: newTeacher,
          subject_ids: [subjectAId, subjectBId],
          class_group_id: classGroupB,
          academic_year_id: yearId,
        });

      expect(second.status).toBe(200);
      expect(second.body.data).toMatchObject({
        assigned: 0,
        skipped: 2,
        total: 2,
      });
    });

    it("rejects an empty subject list", async () => {
      const res = await request(app)
        .post("/academics/teachers/bulk-assign-subjects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          user_id: teacherId,
          subject_ids: [],
          class_group_id: classGroupA,
          academic_year_id: yearId,
        });
      expect(res.status).toBe(400);
    });

    it("rejects a caller without MANAGE_ACADEMICS", async () => {
      const res = await request(app)
        .post("/academics/teachers/bulk-assign-subjects")
        .set("Authorization", `Bearer ${noPermToken}`)
        .send({
          user_id: teacherId,
          subject_ids: [subjectAId],
          class_group_id: classGroupA,
          academic_year_id: yearId,
        });
      expect(res.status).toBe(403);
    });
  });

  describe("POST /academics/students/bulk-unenroll-subjects", () => {
    it("disables active enrollments and reports pairs that were already inactive", async () => {
      const student = await createUser({ userType: "STUDENT" });
      await createStudentSubjectEnrollment({
        userId: student,
        subjectId: subjectAId,
        academicYearId: yearId,
      });

      const res = await request(app)
        .post("/academics/students/bulk-unenroll-subjects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          user_ids: [student],
          subject_ids: [subjectAId, subjectBId],
          academic_year_id: yearId,
        });

      expect(res.status).toBe(200);
      // Only the (student, subjectA) pair was active; subjectB was never enrolled.
      expect(res.body.data).toMatchObject({
        unenrolled: 1,
        skipped: 1,
        total: 2,
      });

      const rows = await db
        .select({ status: StudentSubjectEnrollment.status })
        .from(StudentSubjectEnrollment)
        .where(
          and(
            eq(StudentSubjectEnrollment.user_id, student),
            eq(StudentSubjectEnrollment.subject_id, subjectAId),
            eq(StudentSubjectEnrollment.academic_year_id, yearId),
          ),
        );
      expect(rows[0].status).toBe("DISABLED");
    });

    it("leaves another year's enrollment untouched", async () => {
      const student = await createUser({ userType: "STUDENT" });
      await createStudentSubjectEnrollment({
        userId: student,
        subjectId: subjectAId,
        academicYearId: otherYearId,
      });

      await request(app)
        .post("/academics/students/bulk-unenroll-subjects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          user_ids: [student],
          subject_ids: [subjectAId],
          academic_year_id: yearId,
        });

      const rows = await db
        .select({ status: StudentSubjectEnrollment.status })
        .from(StudentSubjectEnrollment)
        .where(
          and(
            eq(StudentSubjectEnrollment.user_id, student),
            eq(StudentSubjectEnrollment.academic_year_id, otherYearId),
          ),
        );
      expect(rows[0].status).toBe("ACTIVE");
    });

    it("rejects a caller without MANAGE_STUDENT_ENROLLMENTS", async () => {
      const res = await request(app)
        .post("/academics/students/bulk-unenroll-subjects")
        .set("Authorization", `Bearer ${noPermToken}`)
        .send({
          user_ids: [fullyEnrolledStudent],
          subject_ids: [subjectAId],
          academic_year_id: yearId,
        });
      expect(res.status).toBe(403);
    });
  });

  // getUsers returns the page as `data` and its totals as X-Total-* headers.
  describe("GET /users?class_group_id", () => {
    it("returns only that class group's members for the year", async () => {
      const res = await request(app)
        .get("/users")
        .query({
          class_group_id: classGroupA,
          academic_year_id: yearId,
          limit: 25,
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data as any[]).map((u) => u.user.user_id);
      expect(ids).toContain(fullyEnrolledStudent);
      expect(ids).toContain(partiallyEnrolledStudent);
      expect(ids).not.toContain(teacherId);
      expect(res.headers["x-total-count"]).toBe("2");
    });

    it("returns nothing for a year in which the class group has no cohort", async () => {
      const res = await request(app)
        .get("/users")
        .query({
          class_group_id: classGroupA,
          academic_year_id: otherYearId,
          limit: 25,
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it("rejects a non-numeric class group id", async () => {
      const res = await request(app)
        .get("/users")
        .query({ class_group_id: "not-a-number" })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it("is unaffected when the filter is absent", async () => {
      const res = await request(app)
        .get("/users")
        .query({ limit: 2 })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Number(res.headers["x-total-count"])).toBeGreaterThan(0);
    });
  });
});
