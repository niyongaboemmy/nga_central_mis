import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
} from "../test/fixtures";

// Follow-up fix: ad-hoc reports had no CalendarSlot behind them, so they
// never appeared in getReportableLessons at all — a submitted ad-hoc report
// was invisible on the calendar and impossible to revisit. This also
// exercises the new GET/PUT /reports/lessons/:id endpoints that make
// editing an already-submitted report possible.
describe("Ad-hoc report visibility + edit", () => {
  let token: string;
  let userId: number;
  let academicTermId: number;
  let subjectId: number;
  let classGroupId: number;

  beforeAll(async () => {
    userId = await createUser();
    token = signToken(userId);

    const { academicYearId, academicTermId: termId } = await createAcademicPeriod();
    academicTermId = termId;
    classGroupId = await createProgramGradeClassGroup();
    subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId, subjectId, classGroupId, academicYearId });
  });

  it("shows a submitted ad-hoc report as a REPORTED occurrence in getReportableLessons", async () => {
    const submitRes = await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        delivery_date: "2026-06-10",
        subject_id: subjectId,
        class_group_id: classGroupId,
        academic_term_id: academicTermId,
        reflection_notes: "Ad-hoc revision session",
      });
    expect(submitRes.status).toBe(201);
    const reportId = submitRes.body.data.lesson_report_id;

    const listRes = await request(app)
      .get("/reports/lessons/reportable")
      .query({ academic_term_id: academicTermId, from_date: "2026-06-10", to_date: "2026-06-10" })
      .set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    const occurrence = listRes.body.data.find((o: any) => o.date === "2026-06-10");
    expect(occurrence).toBeDefined();
    expect(occurrence.reporting_status).toBe("REPORTED");
    expect(occurrence.is_ad_hoc).toBe(true);
    expect(occurrence.lesson_report.lesson_report_id).toBe(reportId);
  });

  it("GET /reports/lessons/:id returns full details including category tags, ownership-checked", async () => {
    const otherUserId = await createUser();
    const otherToken = signToken(otherUserId);

    const submitRes = await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        delivery_date: "2026-06-11",
        subject_id: subjectId,
        class_group_id: classGroupId,
        academic_term_id: academicTermId,
        reflection_notes: "Detail fetch test",
      });
    const reportId = submitRes.body.data.lesson_report_id;

    const ownerRes = await request(app)
      .get(`/reports/lessons/${reportId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data.lesson_report_id).toBe(reportId);
    expect(ownerRes.body.data.is_ad_hoc).toBe(true);
    expect(ownerRes.body.data.reflection_notes).toBe("Detail fetch test");

    const otherRes = await request(app)
      .get(`/reports/lessons/${reportId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(otherRes.status).toBe(403);
  });

  it("PUT /reports/lessons/:id updates the reality fields and replaces category tags, ownership-checked", async () => {
    const otherUserId = await createUser();
    const otherToken = signToken(otherUserId);

    const submitRes = await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        delivery_date: "2026-06-12",
        subject_id: subjectId,
        class_group_id: classGroupId,
        academic_term_id: academicTermId,
        reflection_notes: "Original note",
      });
    const reportId = submitRes.body.data.lesson_report_id;

    const blockedRes = await request(app)
      .put(`/reports/lessons/${reportId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ reflection_notes: "Hijacked" });
    expect(blockedRes.status).toBe(403);

    const updateRes = await request(app)
      .put(`/reports/lessons/${reportId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        reflection_notes: "Updated note",
        attendance_count: 18,
        completion_rate: 80,
      });
    expect(updateRes.status).toBe(200);

    const detailRes = await request(app)
      .get(`/reports/lessons/${reportId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detailRes.body.data.reflection_notes).toBe("Updated note");
    expect(detailRes.body.data.attendance_count).toBe(18);
    expect(detailRes.body.data.status).toBe("UNPLANNED"); // ad-hoc stays UNPLANNED regardless of input
  });
});
