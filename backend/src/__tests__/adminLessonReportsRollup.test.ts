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

// Phase 3: Subject -> Class Group -> Week rollup, the data source for the
// grouped export. Confirms grouping is correct across two subjects, two
// class groups, and two distinct weeks within the same term.
describe("GET /reports/admin/lesson-reports/rollup", () => {
  let teacherToken: string;
  let adminToken: string;
  let academicTermId: number;
  let subjectA: number;
  let subjectB: number;
  let classGroupA: number;
  let classGroupB: number;
  let termStartDate: string;

  beforeAll(async () => {
    const teacherId = await createUser();
    teacherToken = signToken(teacherId);

    const adminId = await createUser({ userType: "ADMIN" });
    const adminRoleId = await createRoleWithPermissions("ROLLUP_ADMIN", [
      Permissions.ALL_SUBMITTED_REPORTS,
    ]);
    await assignRole(adminId, adminRoleId);
    adminToken = signToken(adminId);

    const { academicYearId, academicTermId: termId } = await createAcademicPeriod();
    academicTermId = termId;
    termStartDate = "2026-01-01"; // matches createAcademicPeriod's fixed term start

    classGroupA = await createProgramGradeClassGroup();
    classGroupB = await createProgramGradeClassGroup();
    subjectA = await createSubject();
    subjectB = await createSubject();

    await createTeacherSubjectAssignment({ userId: teacherId, subjectId: subjectA, classGroupId: classGroupA, academicYearId });
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId: subjectB, classGroupId: classGroupB, academicYearId });

    // Week 1 (term start): Subject A / Class Group A
    await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ delivery_date: "2026-01-02", subject_id: subjectA, class_group_id: classGroupA, academic_term_id: academicTermId });

    // Week 1 again: Subject B / Class Group B — must not collide with Subject A's bucket
    await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ delivery_date: "2026-01-03", subject_id: subjectB, class_group_id: classGroupB, academic_term_id: academicTermId });

    // Week 3 (14+ days later): Subject A / Class Group A again — separate week bucket
    await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ delivery_date: "2026-01-16", subject_id: subjectA, class_group_id: classGroupA, academic_term_id: academicTermId });
  });

  it("requires start_date, end_date, and academic_term_id", async () => {
    const res = await request(app)
      .get("/reports/admin/lesson-reports/rollup")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("groups reports by subject -> class group -> week, across two subjects and two weeks", async () => {
    const res = await request(app)
      .get("/reports/admin/lesson-reports/rollup")
      .query({ start_date: "2026-01-01", end_date: "2026-01-31", academic_term_id: academicTermId })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const { subjects } = res.body.data;
    expect(subjects.length).toBe(2);

    const subjA = subjects.find((s: any) => s.subject_id === subjectA);
    const subjB = subjects.find((s: any) => s.subject_id === subjectB);

    expect(subjA.class_groups.length).toBe(1);
    expect(subjA.class_groups[0].class_group_id).toBe(classGroupA);
    // Two distinct weeks (Jan 2 and Jan 16 are 14 days apart => different week buckets)
    expect(subjA.class_groups[0].weeks.length).toBe(2);
    expect(subjA.class_groups[0].weeks[0].entries.length).toBe(1);
    expect(subjA.class_groups[0].weeks[1].entries.length).toBe(1);

    expect(subjB.class_groups.length).toBe(1);
    expect(subjB.class_groups[0].class_group_id).toBe(classGroupB);
    expect(subjB.class_groups[0].weeks.length).toBe(1);
    expect(subjB.class_groups[0].weeks[0].entries.length).toBe(1);
  });

  it("narrows to a single subject/class-group when filters are supplied", async () => {
    const res = await request(app)
      .get("/reports/admin/lesson-reports/rollup")
      .query({
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        academic_term_id: academicTermId,
        subject_id: subjectA,
        class_group_id: classGroupA,
      })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.subjects.length).toBe(1);
    expect(res.body.data.subjects[0].subject_id).toBe(subjectA);
  });
});
