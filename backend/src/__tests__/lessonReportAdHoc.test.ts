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
  createTeacherSubjectAssignment,
} from "../test/fixtures";

// Phase 2: ad-hoc/unscheduled reporting — an instructor can log subject
// activity with no CalendarSlot/LO_Lesson behind it, as long as they're
// actually assigned to teach that subject for that class group.
describe("POST /reports/lessons — ad-hoc (unscheduled) reporting", () => {
  let userId: number;
  let token: string;
  let assignedSubjectId: number;
  let assignedClassGroupId: number;
  let unassignedSubjectId: number;
  let unassignedClassGroupId: number;

  beforeAll(async () => {
    userId = await createUser();
    token = signToken(userId);

    const { academicYearId } = await createAcademicPeriod();
    assignedClassGroupId = await createProgramGradeClassGroup();
    assignedSubjectId = await createSubject();
    await createTeacherSubjectAssignment({
      userId,
      subjectId: assignedSubjectId,
      classGroupId: assignedClassGroupId,
      academicYearId,
    });

    unassignedClassGroupId = await createProgramGradeClassGroup();
    unassignedSubjectId = await createSubject();
    // Deliberately no TeacherSubjectAssignment row for this combo.
  });

  it("rejects an ad-hoc report missing subject_id/class_group_id", async () => {
    const res = await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({ delivery_date: "2026-03-02" });
    expect(res.status).toBe(400);
  });

  it("rejects ad-hoc reporting for a subject/class-group the instructor isn't assigned to", async () => {
    const res = await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        delivery_date: "2026-03-02",
        subject_id: unassignedSubjectId,
        class_group_id: unassignedClassGroupId,
      });
    expect(res.status).toBe(403);
  });

  it("accepts an ad-hoc report for an assigned subject/class-group, sets status UNPLANNED", async () => {
    const res = await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        delivery_date: "2026-03-02",
        subject_id: assignedSubjectId,
        class_group_id: assignedClassGroupId,
        reflection_notes: "Covered an extra revision session, no plan existed for today.",
      });

    expect(res.status).toBe(201);
    const reportId = res.body.data.lesson_report_id as number;

    const rows = await db
      .select({
        status: LessonReport.status,
        lesson_id: LessonReport.lesson_id,
        subject_id: LessonReport.subject_id,
        class_group_id: LessonReport.class_group_id,
      })
      .from(LessonReport)
      .where(eq(LessonReport.lesson_report_id, reportId));

    expect(rows[0].status).toBe("UNPLANNED");
    expect(rows[0].lesson_id).toBeNull();
    expect(rows[0].subject_id).toBe(assignedSubjectId);
    expect(rows[0].class_group_id).toBe(assignedClassGroupId);
  });

  it("ignores a client-supplied status and forces UNPLANNED on the ad-hoc path", async () => {
    const res = await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        delivery_date: "2026-03-03",
        subject_id: assignedSubjectId,
        class_group_id: assignedClassGroupId,
        status: "DELIVERED",
      });

    expect(res.status).toBe(201);
    const reportId = res.body.data.lesson_report_id as number;
    const rows = await db
      .select({ status: LessonReport.status })
      .from(LessonReport)
      .where(eq(LessonReport.lesson_report_id, reportId));
    expect(rows[0].status).toBe("UNPLANNED");
  });

  // A scheduled CalendarSlot occurrence with no LO_Lesson plan entry yet for
  // this date has no lesson_id/entry_id either — structurally identical to
  // an ad-hoc submission — but it explicitly flags `is_scheduled_slot` and
  // must keep the real delivery status the instructor picked, unlike a true
  // unscheduled-activity report (see the test above).
  it("honors a client-supplied status when is_scheduled_slot is set", async () => {
    const res = await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        delivery_date: "2026-03-04",
        subject_id: assignedSubjectId,
        class_group_id: assignedClassGroupId,
        is_scheduled_slot: true,
        status: "DELIVERED",
      });

    expect(res.status).toBe(201);
    const reportId = res.body.data.lesson_report_id as number;
    const rows = await db
      .select({ status: LessonReport.status })
      .from(LessonReport)
      .where(eq(LessonReport.lesson_report_id, reportId));
    expect(rows[0].status).toBe("DELIVERED");
  });
});
