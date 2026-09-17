import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { LessonReport } from "../db/schema";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createSchemeOfWork,
  createSchemeOfWorkEntry,
  createLoLesson,
} from "../test/fixtures";

// Note: submitting with neither lesson_id nor entry_id is now the ad-hoc
// path (Phase 2 — see lessonReportAdHoc.test.ts), which requires
// subject_id/class_group_id and validates a TeacherSubjectAssignment. That
// scenario is covered there, not here.

// Phase 1 (schema foundation): LessonReport now denormalizes subject_id and
// class_group_id at write time from the lesson's scheme-of-work chain, so
// they're queryable/reportable even if the lesson/entry is later deleted.
describe("POST /reports/lessons — subject/class-group denormalization", () => {
  let userId: number;
  let token: string;
  let academicTermId: number;
  let subjectId: number;
  let classGroupId: number;
  let lessonId: number;
  let entryId: number;

  beforeAll(async () => {
    userId = await createUser();
    token = signToken(userId);

    const { academicYearId, academicTermId: termId } = await createAcademicPeriod();
    academicTermId = termId;
    classGroupId = await createProgramGradeClassGroup();
    subjectId = await createSubject();

    const schemeId = await createSchemeOfWork({ userId, subjectId, classGroupId, academicTermId });
    entryId = await createSchemeOfWorkEntry(schemeId);
    lessonId = await createLoLesson({ userId, entryId, lessonDate: "2026-02-10" });
  });

  it("persists subject_id and class_group_id derived from the lesson's scheme chain", async () => {
    const res = await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        lesson_id: lessonId,
        entry_id: entryId,
        delivery_date: "2026-02-10",
        status: "DELIVERED",
        academic_term_id: academicTermId,
      });

    expect(res.status).toBe(201);
    const reportId = res.body.data.lesson_report_id as number;

    const rows = await db
      .select({ subject_id: LessonReport.subject_id, class_group_id: LessonReport.class_group_id })
      .from(LessonReport)
      .where(eq(LessonReport.lesson_report_id, reportId));

    expect(rows[0].subject_id).toBe(subjectId);
    expect(rows[0].class_group_id).toBe(classGroupId);
  });

  it("leaves subject_id/class_group_id null when a scheduled lesson has no linked scheme entry", async () => {
    // lesson_id is present (so this stays on the scheduled path, not ad-hoc)
    // but the lesson itself has no entry_id, so there's no chain to derive
    // subject/class-group from — should degrade to null, not error.
    const orphanLessonId = await createLoLesson({
      userId,
      lessonDate: "2026-02-11",
    });

    const res = await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        lesson_id: orphanLessonId,
        delivery_date: "2026-02-11",
        status: "MISSED",
      });

    expect(res.status).toBe(201);
    const reportId = res.body.data.lesson_report_id as number;

    const rows = await db
      .select({ subject_id: LessonReport.subject_id, class_group_id: LessonReport.class_group_id })
      .from(LessonReport)
      .where(eq(LessonReport.lesson_report_id, reportId));

    expect(rows[0].subject_id).toBeNull();
    expect(rows[0].class_group_id).toBeNull();
  });

  it("rejects a duplicate (reporter, lesson, date) submission via the new unique constraint", async () => {
    const first = await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        lesson_id: lessonId,
        entry_id: entryId,
        delivery_date: "2026-02-12",
        status: "DELIVERED",
        academic_term_id: academicTermId,
      });
    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        lesson_id: lessonId,
        entry_id: entryId,
        delivery_date: "2026-02-12",
        status: "PARTIAL",
        academic_term_id: academicTermId,
      });
    expect(duplicate.status).toBe(409);
  });
});
