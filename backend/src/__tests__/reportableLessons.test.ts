import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createCalendarSlot,
  createSchemeOfWork,
  createSchemeOfWorkEntry,
  createLoLesson,
  createLessonReport,
} from "../test/fixtures";

// Regression coverage for the same-day, multi-subject date-keying bug fixed
// in lessonReportController.getReportableLessons: the lookup maps used to be
// keyed by date alone, so the first subject's lesson/report "won" and got
// attached to every subject scheduled that same day.
describe("GET /reports/lessons/reportable — date/subject keying", () => {
  let userId: number;
  let token: string;
  let academicTermId: number;
  let sameDayDate: string;
  let dayOfWeek: number;

  beforeAll(async () => {
    userId = await createUser();
    token = signToken(userId);

    const { academicYearId, academicTermId: termId } = await createAcademicPeriod();
    academicTermId = termId;
    const classGroupId = await createProgramGradeClassGroup();

    // Pick a concrete date within the seeded term (2026-01-01..2026-06-30)
    // and derive its day_of_week so the CalendarSlot occurrence expansion
    // (which iterates day_of_week) actually lands on it.
    sameDayDate = "2026-02-04"; // a Wednesday
    dayOfWeek = new Date(Date.UTC(2026, 1, 4)).getUTCDay();

    const subjectA = await createSubject();
    const subjectB = await createSubject();

    await createCalendarSlot({
      userId,
      subjectId: subjectA,
      classGroupId,
      academicTermId,
      dayOfWeek,
    });
    await createCalendarSlot({
      userId,
      subjectId: subjectB,
      classGroupId,
      academicTermId,
      dayOfWeek,
      startTime: "10:00",
      endTime: "11:00",
    });

    const schemeA = await createSchemeOfWork({ userId, subjectId: subjectA, classGroupId, academicTermId });
    const schemeB = await createSchemeOfWork({ userId, subjectId: subjectB, classGroupId, academicTermId });
    const entryA = await createSchemeOfWorkEntry(schemeA);
    const entryB = await createSchemeOfWorkEntry(schemeB);

    const lessonA = await createLoLesson({ userId, entryId: entryA, lessonDate: sameDayDate, moduleName: "Subject A Lesson" });
    await createLoLesson({ userId, entryId: entryB, lessonDate: sameDayDate, moduleName: "Subject B Lesson" });

    // Only Subject A has been reported on — Subject B must remain PENDING.
    // subjectId/classGroupId mirror what submitLessonReport itself resolves
    // and persists at creation time (Phase 1) — getReportableLessons keys
    // off these denormalized columns directly, not derived from lesson_id.
    await createLessonReport({
      userId,
      deliveryDate: sameDayDate,
      lessonId: lessonA,
      subjectId: subjectA,
      classGroupId,
      status: "DELIVERED",
    });
  });

  it("attributes each subject's lesson independently on a shared date", async () => {
    const res = await request(app)
      .get("/reports/lessons/reportable")
      .query({ academic_term_id: academicTermId, from_date: sameDayDate, to_date: sameDayDate })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const occurrences = res.body.data.filter((o: any) => o.date === sameDayDate);
    expect(occurrences.length).toBe(2);

    const byModule = new Map<string, any>(occurrences.map((o: any) => [o.module_name, o]));
    expect(byModule.get("Subject A Lesson")?.module_name).toBe("Subject A Lesson");
    expect(byModule.get("Subject B Lesson")?.module_name).toBe("Subject B Lesson");
  });

  it("marks only the reported subject as REPORTED, not both", async () => {
    const res = await request(app)
      .get("/reports/lessons/reportable")
      .query({ academic_term_id: academicTermId, from_date: sameDayDate, to_date: sameDayDate })
      .set("Authorization", `Bearer ${token}`);

    const occurrences = res.body.data.filter((o: any) => o.date === sameDayDate);
    const reportedOnes = occurrences.filter((o: any) => o.reporting_status === "REPORTED");
    const pendingOnes = occurrences.filter((o: any) => o.reporting_status === "PENDING");

    expect(reportedOnes.length).toBe(1);
    expect(reportedOnes[0].module_name).toBe("Subject A Lesson");
    expect(pendingOnes.length).toBe(1);
    expect(pendingOnes[0].module_name).toBe("Subject B Lesson");
  });
});

// Regression coverage for a second date-keying collision: the SAME subject
// taught in two separate CalendarSlot periods on the same day (e.g. a
// morning and an afternoon session) used to collapse onto a single
// LO_Lesson/LessonReport match (keyed by date+subject only, ignoring time),
// so reporting one period silently marked the other as reported too.
describe("GET /reports/lessons/reportable — same subject, two periods same day", () => {
  let userId: number;
  let token: string;
  let academicTermId: number;
  let sameDayDate: string;
  let dayOfWeek: number;

  beforeAll(async () => {
    userId = await createUser();
    token = signToken(userId);

    const { academicYearId, academicTermId: termId } = await createAcademicPeriod();
    academicTermId = termId;
    const classGroupId = await createProgramGradeClassGroup();

    sameDayDate = "2026-02-04"; // a Wednesday
    dayOfWeek = new Date(Date.UTC(2026, 1, 4)).getUTCDay();

    const subject = await createSubject();

    await createCalendarSlot({
      userId,
      subjectId: subject,
      classGroupId,
      academicTermId,
      dayOfWeek,
      startTime: "11:00",
      endTime: "12:40",
    });
    await createCalendarSlot({
      userId,
      subjectId: subject,
      classGroupId,
      academicTermId,
      dayOfWeek,
      startTime: "13:40",
      endTime: "14:30",
    });

    const scheme = await createSchemeOfWork({ userId, subjectId: subject, classGroupId, academicTermId });
    const entry = await createSchemeOfWorkEntry(scheme);

    const morningLessonId = await createLoLesson({
      userId,
      entryId: entry,
      lessonDate: sameDayDate,
      moduleName: "Morning period",
      startTime: "11:00",
    });
    await createLoLesson({
      userId,
      entryId: entry,
      lessonDate: sameDayDate,
      moduleName: "Afternoon period",
      startTime: "13:40",
    });

    // Only the morning period has been reported on.
    await createLessonReport({
      userId,
      deliveryDate: sameDayDate,
      lessonId: morningLessonId,
      subjectId: subject,
      classGroupId,
      status: "DELIVERED",
    });
  });

  it("keeps the two periods' lessons and report status independent", async () => {
    const res = await request(app)
      .get("/reports/lessons/reportable")
      .query({ academic_term_id: academicTermId, from_date: sameDayDate, to_date: sameDayDate })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const occurrences = res.body.data.filter((o: any) => o.date === sameDayDate);
    expect(occurrences.length).toBe(2);

    const morning = occurrences.find((o: any) => o.start_time === "11:00");
    const afternoon = occurrences.find((o: any) => o.start_time === "13:40");

    expect(morning.module_name).toBe("Morning period");
    expect(morning.reporting_status).toBe("REPORTED");

    expect(afternoon.module_name).toBe("Afternoon period");
    expect(afternoon.reporting_status).toBe("PENDING");
    expect(afternoon.lesson_report).toBeNull();
  });
});
