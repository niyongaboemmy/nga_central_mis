import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  LessonReportSupportRequest,
  LessonReportChallengeTag,
  SupportRequestCategory,
  ChallengeCategory,
} from "../db/schema";
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

// Phase 4: submitting a lesson report with support_request_category_ids /
// challenge_category_ids persists them into the join tables, and the ranked
// admin summaries correctly GROUP BY category across multiple reports.
describe("Lesson report categorization (Support Needed / Challenges)", () => {
  let teacherToken: string;
  let adminToken: string;
  let subjectId: number;
  let classGroupId: number;
  let academicTermId: number;
  let supportCategoryId: number;
  let challengeCategoryId: number;
  let otherChallengeCategoryId: number;

  beforeAll(async () => {
    const teacherId = await createUser();
    teacherToken = signToken(teacherId);

    const adminId = await createUser({ userType: "ADMIN" });
    const adminRoleId = await createRoleWithPermissions("CATEGORIZATION_ADMIN", [
      Permissions.ALL_SUBMITTED_REPORTS,
    ]);
    await assignRole(adminId, adminRoleId);
    adminToken = signToken(adminId);

    const { academicYearId, academicTermId: termId } = await createAcademicPeriod();
    academicTermId = termId;
    classGroupId = await createProgramGradeClassGroup();
    subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId });

    const supportRows = await db.select().from(SupportRequestCategory).limit(1);
    supportCategoryId = supportRows[0].category_id;

    const challengeRows = await db.select().from(ChallengeCategory).limit(2);
    challengeCategoryId = challengeRows[0].category_id;
    otherChallengeCategoryId = challengeRows[1].category_id;
  });

  it("persists selected support/challenge categories alongside a submitted report", async () => {
    const res = await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        delivery_date: "2026-04-01",
        subject_id: subjectId,
        class_group_id: classGroupId,
        academic_term_id: academicTermId,
        support_request_category_ids: [supportCategoryId],
        challenge_category_ids: [challengeCategoryId],
      });
    expect(res.status).toBe(201);
    const reportId = res.body.data.lesson_report_id;

    const supportRows = await db
      .select()
      .from(LessonReportSupportRequest)
      .where(eq(LessonReportSupportRequest.lesson_report_id, reportId));
    expect(supportRows.length).toBe(1);
    expect(supportRows[0].category_id).toBe(supportCategoryId);

    const challengeRows = await db
      .select()
      .from(LessonReportChallengeTag)
      .where(eq(LessonReportChallengeTag.lesson_report_id, reportId));
    expect(challengeRows.length).toBe(1);
    expect(challengeRows[0].category_id).toBe(challengeCategoryId);
  });

  it("ranks challenge categories by frequency across multiple reports", async () => {
    // Report 2: same challenge category as report 1 (making it the top-ranked one)
    await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        delivery_date: "2026-04-02",
        subject_id: subjectId,
        class_group_id: classGroupId,
        academic_term_id: academicTermId,
        challenge_category_ids: [challengeCategoryId],
      });

    // Report 3: a different challenge category, mentioned only once
    await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        delivery_date: "2026-04-03",
        subject_id: subjectId,
        class_group_id: classGroupId,
        academic_term_id: academicTermId,
        challenge_category_ids: [otherChallengeCategoryId],
      });

    // Scoped to this test's own subject/class-group so repeated local runs
    // against a non-reset test DB don't accumulate counts across runs.
    const res = await request(app)
      .get("/reports/admin/challenges/summary")
      .query({
        start_date: "2026-04-01",
        end_date: "2026-04-30",
        subject_id: subjectId,
        class_group_id: classGroupId,
      })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const rows = res.body.data as any[];
    const top = rows.find((r) => r.category_id === challengeCategoryId);
    const second = rows.find((r) => r.category_id === otherChallengeCategoryId);

    expect(Number(top.total)).toBe(2);
    expect(Number(second.total)).toBe(1);
    // Ordered descending by count
    expect(rows.indexOf(top)).toBeLessThan(rows.indexOf(second));
  });
});
