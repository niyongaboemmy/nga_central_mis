import { db } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  LessonReport,
  LO_Lesson,
  LO_LearningOutcome,
  SchemeOfWorkEntry,
  CalendarSlot,
  AcademicTerm,
  Subject,
  MentorshipSession,
  ReportProjectUpdate,
  User,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ValidationError, NotFoundError } from "../errors/CustomError";
import { recordActivity } from "../utils/activityLogger";

// Identical to the helper in reportController — formats DB date values to yyyy-MM-dd
// using UTC methods to avoid timezone off-by-one shifts.
const formatDbDate = (d: any): string | null => {
  if (!d) return null;
  if (typeof d === "string") return d.split("T")[0];
  const dateObj = d as Date;
  const year  = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Parse a UTC midnight Date from a "yyyy-MM-dd" string to avoid local-timezone drift
// when computing week differences late at night.
const utcDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/lessons/reportable
// Returns a list of "reportable lessons" for the logged-in instructor based on
// their CalendarSlots, expanded into individual occurrence dates for the window.
// ─────────────────────────────────────────────────────────────────────────────
export const getReportableLessons = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const { academic_term_id, from_date, to_date } = req.query;

  // 1. Resolve term
  let termRecord: { academic_term_id: number; start_date: any; end_date: any } | null = null;

  if (academic_term_id) {
    const rows = await db
      .select({
        academic_term_id: AcademicTerm.academic_term_id,
        start_date: AcademicTerm.start_date,
        end_date: AcademicTerm.end_date,
      })
      .from(AcademicTerm)
      .where(eq(AcademicTerm.academic_term_id, parseInt(academic_term_id as string)))
      .limit(1);
    termRecord = rows[0] ?? null;
  } else {
    const rows = await db
      .select({
        academic_term_id: AcademicTerm.academic_term_id,
        start_date: AcademicTerm.start_date,
        end_date: AcademicTerm.end_date,
      })
      .from(AcademicTerm)
      .where(eq(AcademicTerm.is_current, 1))
      .limit(1);
    termRecord = rows[0] ?? null;
  }

  if (!termRecord) throw new NotFoundError("No active academic term found");

  const termId = termRecord.academic_term_id;
  const termStart = formatDbDate(termRecord.start_date)!;
  const termEnd   = formatDbDate(termRecord.end_date)!;

  // 2. Compute effective date window (default ±14 days, clamped to term bounds)
  const today     = new Date();
  const todayStr  = formatDbDate(today)!;
  const defaultStart = formatDbDate(new Date(today.getTime() - 14 * 86400000))!;
  const defaultEnd   = formatDbDate(new Date(today.getTime() + 14 * 86400000))!;

  const rawStart = (from_date as string | undefined) ?? defaultStart;
  const rawEnd   = (to_date   as string | undefined) ?? defaultEnd;

  const effectiveStart = rawStart > termStart ? rawStart : termStart;
  const effectiveEnd   = rawEnd   < termEnd   ? rawEnd   : termEnd;

  // 3. Fetch instructor's active CalendarSlots for this term
  const slots = await db
    .select({
      slot_id:        CalendarSlot.slot_id,
      day_of_week:    CalendarSlot.day_of_week,
      subject_id:     CalendarSlot.subject_id,
      class_group_id: CalendarSlot.class_group_id,
      start_time:     CalendarSlot.start_time,
      end_time:       CalendarSlot.end_time,
      subject_name:   Subject.name,
      subject_code:   Subject.code,
      subject_color:  Subject.color,
    })
    .from(CalendarSlot)
    .leftJoin(Subject, eq(CalendarSlot.subject_id, Subject.subject_id))
    .where(
      and(
        eq(CalendarSlot.user_id, userId),
        eq(CalendarSlot.academic_term_id, termId),
        eq(CalendarSlot.is_active, 1),
      ),
    );

  if (slots.length === 0) {
    return successResponse(res, "Reportable lessons retrieved", []);
  }

  // 4. Expand recurring slots into individual dates within the window
  // CalendarSlot.day_of_week: 0=Sun … 6=Sat — matches JS Date.getDay()
  interface Occurrence {
    slot_id: number;
    date: string;
    subject_id: number;
    subject_name: string | null;
    subject_code: string | null;
    subject_color: string | null;
    start_time: string | null;
    end_time: string | null;
    class_group_id: number | null;
  }

  const occurrences: Occurrence[] = [];
  const [sy, sm, sd] = effectiveStart.split("-").map(Number);
  const [ey, em, ed] = effectiveEnd.split("-").map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs   = Date.UTC(ey, em - 1, ed);

  for (const slot of slots) {
    let cursor = new Date(startMs);
    while (cursor.getTime() <= endMs) {
      if (cursor.getUTCDay() === slot.day_of_week) {
        const yyyy = cursor.getUTCFullYear();
        const mm   = String(cursor.getUTCMonth() + 1).padStart(2, "0");
        const dd   = String(cursor.getUTCDate()).padStart(2, "0");
        occurrences.push({
          slot_id:        slot.slot_id,
          date:           `${yyyy}-${mm}-${dd}`,
          subject_id:     slot.subject_id,
          subject_name:   slot.subject_name ?? null,
          subject_code:   slot.subject_code ?? null,
          subject_color:  slot.subject_color ?? null,
          start_time:     slot.start_time ?? null,
          end_time:       slot.end_time ?? null,
          class_group_id: slot.class_group_id ?? null,
        });
      }
      cursor = new Date(cursor.getTime() + 86400000);
    }
  }

  if (occurrences.length === 0) {
    return successResponse(res, "Reportable lessons retrieved", []);
  }

  // 5. Batch-fetch LO_Lessons for this user within the date window
  const lessons = await db
    .select({
      id:          LO_Lesson.id,
      entry_id:    LO_Lesson.entry_id,
      lesson_date: LO_Lesson.lesson_date,
      module_code: LO_Lesson.module_code,
      module_name: LO_Lesson.module_name,
      big_question: LO_Lesson.big_question,
      week:        LO_Lesson.week,
    })
    .from(LO_Lesson)
    .where(
      and(
        eq(LO_Lesson.user_id, userId),
        sql`DATE_FORMAT(${LO_Lesson.lesson_date}, '%Y-%m-%d') BETWEEN ${effectiveStart} AND ${effectiveEnd}`,
      ),
    );

  // Map: "yyyy-MM-dd" → first matching LO_Lesson
  const lessonByDate = new Map<string, typeof lessons[0]>();
  for (const l of lessons) {
    const key = formatDbDate(l.lesson_date);
    if (key && !lessonByDate.has(key)) lessonByDate.set(key, l);
  }

  // 6. Batch-fetch SchemeOfWorkEntries for the entry_ids found above
  const entryIds = lessons
    .map((l) => l.entry_id)
    .filter((e): e is number => e !== null && e !== undefined);

  const entries =
    entryIds.length > 0
      ? await db
          .select({
            entry_id:    SchemeOfWorkEntry.entry_id,
            week_number: SchemeOfWorkEntry.week_number,
            topic:       SchemeOfWorkEntry.topic,
            sub_topic:   SchemeOfWorkEntry.sub_topic,
            objective:   SchemeOfWorkEntry.objective,
          })
          .from(SchemeOfWorkEntry)
          .where(inArray(SchemeOfWorkEntry.entry_id, entryIds))
      : [];

  const entryMap = new Map(entries.map((e) => [e.entry_id, e]));

  // 7. Batch-fetch Learning Outcomes for those lessons
  const lessonIds = lessons.map((l) => l.id);
  const learningOutcomes =
    lessonIds.length > 0
      ? await db
          .select({
            lesson_id:   LO_LearningOutcome.lesson_id,
            code:        LO_LearningOutcome.code,
            title:       LO_LearningOutcome.title,
            description: LO_LearningOutcome.description,
          })
          .from(LO_LearningOutcome)
          .where(inArray(LO_LearningOutcome.lesson_id, lessonIds))
      : [];

  const losByLesson = new Map<number, typeof learningOutcomes>();
  for (const lo of learningOutcomes) {
    const arr = losByLesson.get(lo.lesson_id) ?? [];
    arr.push(lo);
    losByLesson.set(lo.lesson_id, arr);
  }

  // 8. Fetch existing LessonReports for this user within the window
  const existingReports = await db
    .select({
      lesson_report_id: LessonReport.lesson_report_id,
      lesson_id:        LessonReport.lesson_id,
      delivery_date:    LessonReport.delivery_date,
      status:           LessonReport.status,
      attendance_count: LessonReport.attendance_count,
      completion_rate:  LessonReport.completion_rate,
      schedule_flag:    LessonReport.schedule_flag,
    })
    .from(LessonReport)
    .where(
      and(
        eq(LessonReport.reported_by, userId),
        sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') BETWEEN ${effectiveStart} AND ${effectiveEnd}`,
      ),
    );

  // Map: "yyyy-MM-dd" → LessonReport
  const reportByDate = new Map<string, typeof existingReports[0]>();
  for (const r of existingReports) {
    const key = formatDbDate(r.delivery_date);
    if (key) reportByDate.set(key, r);
  }

  // 9. Assemble output
  const result = occurrences.map((occ) => {
    const lesson = lessonByDate.get(occ.date) ?? null;
    const entry  = lesson?.entry_id ? entryMap.get(lesson.entry_id) ?? null : null;
    const report = reportByDate.get(occ.date) ?? null;
    const los    = lesson ? (losByLesson.get(lesson.id) ?? []) : [];

    let reporting_status: "REPORTED" | "PENDING" | "UPCOMING";
    if (report) {
      reporting_status = "REPORTED";
    } else if (occ.date > todayStr) {
      reporting_status = "UPCOMING";
    } else {
      reporting_status = "PENDING";
    }

    return {
      slot_id:          occ.slot_id,
      date:             occ.date,
      start_time:       occ.start_time,
      end_time:         occ.end_time,
      subject_name:     occ.subject_name,
      subject_code:     occ.subject_code,
      subject_color:    occ.subject_color,
      module_code:      lesson?.module_code    ?? null,
      module_name:      lesson?.module_name    ?? null,
      big_question:     lesson?.big_question   ?? null,
      topic:            entry?.topic           ?? null,
      sub_topic:        entry?.sub_topic       ?? null,
      objective:        entry?.objective       ?? null,
      learning_outcomes: los,
      lesson_id:        lesson?.id     ?? null,
      entry_id:         lesson?.entry_id ?? null,
      reporting_status,
      lesson_report: report
        ? {
            lesson_report_id: report.lesson_report_id,
            status:           report.status,
            attendance_count: report.attendance_count,
            completion_rate:  report.completion_rate,
            schedule_flag:    report.schedule_flag,
          }
        : null,
    };
  });

  // Sort ascending by date so the calendar gets chronological order
  result.sort((a, b) => (a.date < b.date ? -1 : 1));

  return successResponse(res, "Reportable lessons retrieved", result);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reports/lessons
// Submits a single lesson delivery report.
// ─────────────────────────────────────────────────────────────────────────────
export const submitLessonReport = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const {
    lesson_id,
    entry_id,
    delivery_date,
    status,
    attendance_count,
    completion_rate,
    reflection_notes,
    evidence_url,
    academic_term_id,
  } = req.body;

  if (!delivery_date) throw new ValidationError("delivery_date is required");
  if (!status || !["DELIVERED", "PARTIAL", "MISSED"].includes(status))
    throw new ValidationError("status must be DELIVERED, PARTIAL, or MISSED");

  // 1. Validate lesson ownership if lesson_id provided
  if (lesson_id) {
    const lesson = await db
      .select({ id: LO_Lesson.id })
      .from(LO_Lesson)
      .where(and(eq(LO_Lesson.id, Number(lesson_id)), eq(LO_Lesson.user_id, userId)))
      .limit(1);
    if (lesson.length === 0) throw new NotFoundError("Lesson not found or access denied");
  }

  // 2. Compute schedule_flag using UTC midnight arithmetic to avoid off-by-one
  let schedule_flag: "ON_TIME" | "AHEAD" | "BEHIND" = "ON_TIME";

  if (entry_id && academic_term_id) {
    const [entryRows, termRows] = await Promise.all([
      db
        .select({ week_number: SchemeOfWorkEntry.week_number })
        .from(SchemeOfWorkEntry)
        .where(eq(SchemeOfWorkEntry.entry_id, Number(entry_id)))
        .limit(1),
      db
        .select({ start_date: AcademicTerm.start_date })
        .from(AcademicTerm)
        .where(eq(AcademicTerm.academic_term_id, Number(academic_term_id)))
        .limit(1),
    ]);

    if (entryRows.length > 0 && termRows.length > 0) {
      // "Week 5" → 5
      const sowWeek = parseInt(
        (entryRows[0].week_number ?? "").replace(/[^0-9]/g, ""),
        10,
      );

      const termStartStr = formatDbDate(termRows[0].start_date)!;
      const termStartMs  = utcDate(termStartStr).getTime();
      const deliveryMs   = utcDate(delivery_date as string).getTime();
      const daysDiff     = Math.floor((deliveryMs - termStartMs) / 86400000);
      const deliveryWeek = Math.floor(daysDiff / 7) + 1;

      if (!isNaN(sowWeek) && !isNaN(deliveryWeek)) {
        if (deliveryWeek < sowWeek) schedule_flag = "AHEAD";
        else if (deliveryWeek > sowWeek) schedule_flag = "BEHIND";
      }
    }
  }

  // 3. Insert the LessonReport
  const insertResult = await db.insert(LessonReport).values({
    lesson_id:        lesson_id        ? Number(lesson_id)        : null,
    entry_id:         entry_id         ? Number(entry_id)         : null,
    reported_by:      userId,
    delivery_date:    utcDate(delivery_date as string),
    status:           status as "DELIVERED" | "PARTIAL" | "MISSED",
    attendance_count: attendance_count ? Number(attendance_count) : null,
    completion_rate:  completion_rate  ? Number(completion_rate)  : null,
    reflection_notes: reflection_notes ?? null,
    evidence_url:     evidence_url     ?? null,
    schedule_flag,
  });

  const newId = (insertResult as any)[0].insertId as number;

  await recordActivity(
    userId,
    "LESSON_REPORT_SUBMIT",
    `Lesson delivery reported for ${delivery_date} (status: ${status}, schedule: ${schedule_flag})`,
    "LessonReport",
    newId,
  );

  return successResponse(
    res,
    "Lesson report submitted",
    { lesson_report_id: newId },
    201,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/weekly-summary
// Aggregates LessonReports + MentorshipSessions + ProjectUpdates for a given
// academic week, providing a read-only summary for principals/admins.
// ─────────────────────────────────────────────────────────────────────────────
export const getWeeklySummary = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const { week_number, academic_term_id } = req.query;

  if (!week_number || !academic_term_id)
    throw new ValidationError("week_number and academic_term_id are required");

  const weekNum = parseInt(week_number as string);
  const termId  = parseInt(academic_term_id as string);

  if (isNaN(weekNum) || weekNum < 1)
    throw new ValidationError("week_number must be a positive integer");

  // 1. Resolve term start date to derive week boundaries
  const termRows = await db
    .select({ start_date: AcademicTerm.start_date })
    .from(AcademicTerm)
    .where(eq(AcademicTerm.academic_term_id, termId))
    .limit(1);

  if (termRows.length === 0) throw new NotFoundError("Academic term not found");

  const termStartStr = formatDbDate(termRows[0].start_date)!;
  const termStartMs  = utcDate(termStartStr).getTime();

  // Week N: days [(N-1)*7 .. N*7-1] offset from term start (UTC midnight)
  const weekStartMs = termStartMs + (weekNum - 1) * 7 * 86400000;
  const weekEndMs   = weekStartMs + 6 * 86400000;
  const weekStart   = formatDbDate(new Date(weekStartMs))!;
  const weekEnd     = formatDbDate(new Date(weekEndMs))!;

  // 2. LessonReport details for this user within the week
  const lessonDetails = await db
    .select({
      lesson_report_id: LessonReport.lesson_report_id,
      delivery_date:    LessonReport.delivery_date,
      status:           LessonReport.status,
      schedule_flag:    LessonReport.schedule_flag,
      attendance_count: LessonReport.attendance_count,
      completion_rate:  LessonReport.completion_rate,
      module_code:      LO_Lesson.module_code,
      module_name:      LO_Lesson.module_name,
    })
    .from(LessonReport)
    .leftJoin(LO_Lesson, eq(LessonReport.lesson_id, LO_Lesson.id))
    .where(
      and(
        eq(LessonReport.reported_by, userId),
        sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') BETWEEN ${weekStart} AND ${weekEnd}`,
      ),
    );

  // 3. MentorshipSession details for this user within the week
  const mentorshipDetails = await db
    .select({
      mentorship_id:    MentorshipSession.mentorship_id,
      session_date:     MentorshipSession.session_date,
      duration_minutes: MentorshipSession.duration_minutes,
      student_name:     MentorshipSession.student_name,
    })
    .from(MentorshipSession)
    .where(
      and(
        eq(MentorshipSession.user_id, userId),
        sql`DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d') BETWEEN ${weekStart} AND ${weekEnd}`,
      ),
    );

  // 4. Standalone project updates for this user
  const projectDetails = await db
    .select({
      project_update_id: ReportProjectUpdate.project_update_id,
      project_name:      ReportProjectUpdate.project_name,
      status:            ReportProjectUpdate.status,
      role:              ReportProjectUpdate.role,
    })
    .from(ReportProjectUpdate)
    .where(eq(ReportProjectUpdate.user_id, userId));

  return successResponse(res, "Weekly summary retrieved", {
    week_number:    weekNum,
    week_start:     weekStart,
    week_end:       weekEnd,
    lessons_delivered: lessonDetails.length,
    mentorship_count:  mentorshipDetails.length,
    project_updates:   projectDetails.length,
    lesson_details: lessonDetails.map((l) => ({
      ...l,
      delivery_date: formatDbDate(l.delivery_date),
    })),
    mentorship_details: mentorshipDetails.map((m) => ({
      ...m,
      session_date: formatDbDate(m.session_date),
    })),
    project_details: projectDetails,
  });
});
