import { db } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  LessonReport,
  LO_Lesson,
  LO_LearningOutcome,
  SchemeOfWorkEntry,
  SchemeOfWork,
  CalendarSlot,
  AcademicTerm,
  Subject,
  MentorshipSession,
  ReportProjectUpdate,
  User,
  TeacherSubjectAssignment,
  LessonReportSupportRequest,
  LessonReportChallengeTag,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ValidationError, NotFoundError, ConflictError, AuthorizationError } from "../errors/CustomError";
import { recordActivity } from "../utils/activityLogger";
import { buildLessonReportRollup } from "../services/lessonReportRollupService";

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

  // Note: no early-return when slots.length === 0 — an instructor with zero
  // CalendarSlots can still have ad-hoc reports in this window (see step 8b
  // below), which must still be checked and surfaced.

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

  // Same note as above — do not early-return here either; ad-hoc reports
  // (step 8b) must still be checked even when there are no slot occurrences.

  // 5. Batch-fetch LO_Lessons for this user within the date window
  const lessons = await db
    .select({
      id:          LO_Lesson.id,
      entry_id:    LO_Lesson.entry_id,
      lesson_date: LO_Lesson.lesson_date,
      start_time:  LO_Lesson.start_time,
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

  // 6. Batch-fetch SchemeOfWorkEntries for the entry_ids found above, joined
  // through to SchemeOfWork to recover each entry's subject_id — needed so
  // lessons/reports can be keyed by (date, subject) below, not date alone.
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
            subject_id:  SchemeOfWork.subject_id,
          })
          .from(SchemeOfWorkEntry)
          .innerJoin(SchemeOfWork, eq(SchemeOfWorkEntry.scheme_id, SchemeOfWork.scheme_id))
          .where(inArray(SchemeOfWorkEntry.entry_id, entryIds))
      : [];

  const entryMap = new Map(entries.map((e) => [e.entry_id, e]));

  // "date:subjectId" (subjectId "none" for lessons with no resolvable subject)
  // — keeps same-day, multi-subject occurrences from colliding (see below).
  const dateSubjectKey = (date: string, subjectId: number | null | undefined) =>
    `${date}:${subjectId ?? "none"}`;

  // Same as above but also keyed on start_time — a subject taught in two
  // separate CalendarSlot periods on the same day (e.g. 11:00-12:40 and
  // 13:40-14:30) needs each period matched to its own LO_Lesson, not the
  // first one found for that date+subject. Falls back to the coarser
  // dateSubjectKey lookup (see `lessonByDateSubject` below) only when a
  // lesson has no recorded start_time at all.
  const dateSubjectTimeKey = (
    date: string,
    subjectId: number | null | undefined,
    startTime: string | null | undefined,
  ) => `${date}:${subjectId ?? "none"}:${startTime ?? "none"}`;

  // Map: "yyyy-MM-dd:subjectId" → LO_Lesson (coarse fallback), and
  // "yyyy-MM-dd:subjectId:startTime" → LO_Lesson (precise per-period match).
  const lessonByDateSubject = new Map<string, typeof lessons[0]>();
  const lessonByDateSubjectTime = new Map<string, typeof lessons[0]>();
  const entryIdByLessonId = new Map<number, number | null>();
  for (const l of lessons) {
    const key = formatDbDate(l.lesson_date);
    entryIdByLessonId.set(l.id, l.entry_id ?? null);
    if (!key) continue;
    const subjectId = l.entry_id ? entryMap.get(l.entry_id)?.subject_id ?? null : null;
    const compositeKey = dateSubjectKey(key, subjectId);
    if (!lessonByDateSubject.has(compositeKey)) lessonByDateSubject.set(compositeKey, l);
    const timeKey = dateSubjectTimeKey(key, subjectId, l.start_time);
    if (!lessonByDateSubjectTime.has(timeKey)) lessonByDateSubjectTime.set(timeKey, l);
  }

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

  // 8. Fetch existing LessonReports for this user within the window. Uses
  // the denormalized subject_id/class_group_id columns (Phase 1) directly —
  // populated for both scheduled AND ad-hoc reports at submission time — so
  // this correctly keys ad-hoc reports too, which have no lesson_id/entry_id
  // chain to derive a subject from.
  const existingReports = await db
    .select({
      lesson_report_id: LessonReport.lesson_report_id,
      lesson_id:        LessonReport.lesson_id,
      delivery_date:    LessonReport.delivery_date,
      status:           LessonReport.status,
      attendance_count: LessonReport.attendance_count,
      completion_rate:  LessonReport.completion_rate,
      schedule_flag:    LessonReport.schedule_flag,
      subject_id:       LessonReport.subject_id,
      class_group_id:   LessonReport.class_group_id,
    })
    .from(LessonReport)
    .where(
      and(
        eq(LessonReport.reported_by, userId),
        sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') BETWEEN ${effectiveStart} AND ${effectiveEnd}`,
      ),
    );

  // Map: "yyyy-MM-dd:subjectId" → LessonReport (coarse fallback, used only
  // when an occurrence has no specific LO_Lesson to match against — e.g. a
  // scheduled slot with no plan yet, or a true ad-hoc report). LessonReport
  // has no time column of its own, so this is inherently unable to
  // distinguish two same-subject periods on the same day; `reportByLessonId`
  // below is the precise path and is preferred whenever a lesson is resolved.
  const reportByDateSubject = new Map<string, typeof existingReports[0]>();
  // Map: lesson_id → LessonReport — precise match for a specific scheduled
  // period, since each period now resolves to its own distinct LO_Lesson
  // (see `lessonByDateSubjectTime` above).
  const reportByLessonId = new Map<number, typeof existingReports[0]>();
  for (const r of existingReports) {
    const key = formatDbDate(r.delivery_date);
    if (!key) continue;
    reportByDateSubject.set(dateSubjectKey(key, r.subject_id), r);
    if (r.lesson_id) reportByLessonId.set(r.lesson_id, r);
  }

  // 8b. Ad-hoc reports (no lesson_id) have no CalendarSlot behind them, so
  // they never appear in `occurrences` above — without this, a submitted
  // ad-hoc report would be invisible on the calendar and impossible to
  // revisit/edit. Synthesize an occurrence for each one, pulling in the
  // subject name/color for display.
  const adHocReports = existingReports.filter((r) => !r.lesson_id);
  const adHocSubjectIds = Array.from(
    new Set(adHocReports.map((r) => r.subject_id).filter((id): id is number => id != null)),
  );
  const adHocSubjects =
    adHocSubjectIds.length > 0
      ? await db
          .select({ subject_id: Subject.subject_id, name: Subject.name, code: Subject.code, color: Subject.color })
          .from(Subject)
          .where(inArray(Subject.subject_id, adHocSubjectIds))
      : [];
  const adHocSubjectMap = new Map(adHocSubjects.map((s) => [s.subject_id, s]));

  interface ReportableLessonItem {
    slot_id: number;
    date: string;
    start_time: string | null;
    end_time: string | null;
    subject_name: string | null;
    subject_code: string | null;
    subject_color: string | null;
    module_code: string | null;
    module_name: string | null;
    big_question: string | null;
    topic: string | null;
    sub_topic: string | null;
    objective: string | null;
    learning_outcomes: any[];
    lesson_id: number | null;
    entry_id: number | null;
    subject_id: number | null;
    class_group_id: number | null;
    is_ad_hoc: boolean;
    reporting_status: "REPORTED" | "PENDING" | "UPCOMING";
    lesson_report: {
      lesson_report_id: number;
      status: string;
      attendance_count: number | null;
      completion_rate: number | null;
      schedule_flag: string;
    } | null;
  }

  // 9. Assemble output
  const result: ReportableLessonItem[] = occurrences.map((occ) => {
    const compositeKey = dateSubjectKey(occ.date, occ.subject_id);
    const timeKey = dateSubjectTimeKey(occ.date, occ.subject_id, occ.start_time);
    // Prefer the period-specific (time-aware) lesson match; fall back to the
    // coarser date+subject one only if this exact period has no lesson of
    // its own (e.g. a lesson recorded with a blank/mismatched start_time).
    const lesson = lessonByDateSubjectTime.get(timeKey) ?? lessonByDateSubject.get(compositeKey) ?? null;
    const entry  = lesson?.entry_id ? entryMap.get(lesson.entry_id) ?? null : null;
    // When this period resolved a specific lesson, ONLY trust a report tied
    // to that exact lesson_id — falling back to the coarse date+subject map
    // here would risk re-attaching a sibling period's report (the same
    // collision this fix exists to avoid). The coarse map is only used when
    // no lesson could be resolved for this period at all (scheduled without
    // a plan yet, or ad-hoc).
    const report = lesson
      ? reportByLessonId.get(lesson.id) ?? null
      : reportByDateSubject.get(compositeKey) ?? null;
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
      subject_id:       occ.subject_id,
      class_group_id:   occ.class_group_id,
      is_ad_hoc:        false,
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

  // Synthetic occurrences for ad-hoc reports (see step 8b) — these have no
  // CalendarSlot, so they'd otherwise never appear on the calendar at all.
  for (const r of adHocReports) {
    const key = formatDbDate(r.delivery_date);
    if (!key) continue;
    const subject = r.subject_id ? adHocSubjectMap.get(r.subject_id) : null;
    result.push({
      slot_id: -r.lesson_report_id, // negative sentinel — no real CalendarSlot
      date: key,
      start_time: null,
      end_time: null,
      subject_name: subject?.name ?? null,
      subject_code: subject?.code ?? null,
      subject_color: subject?.color ?? null,
      module_code: null,
      module_name: null,
      big_question: null,
      topic: null,
      sub_topic: null,
      objective: null,
      learning_outcomes: [],
      lesson_id: null,
      entry_id: null,
      subject_id: r.subject_id,
      class_group_id: r.class_group_id,
      is_ad_hoc: true,
      reporting_status: "REPORTED",
      lesson_report: {
        lesson_report_id: r.lesson_report_id,
        status: r.status,
        attendance_count: r.attendance_count,
        completion_rate: r.completion_rate,
        schedule_flag: r.schedule_flag,
      },
    });
  }

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
    subject_id,
    class_group_id,
    is_scheduled_slot,
    support_request_category_ids,
    challenge_category_ids,
  } = req.body;

  if (!delivery_date) throw new ValidationError("delivery_date is required");

  // An "ad-hoc" report is unplanned subject activity with no scheduled
  // lesson/entry behind it — the instructor picks the subject/class-group
  // directly instead of inheriting them from a CalendarSlot occurrence.
  const isAdHoc = !lesson_id && !entry_id;

  let resolvedEntryId: number | null = entry_id ? Number(entry_id) : null;
  let resolvedSubjectId: number | null = null;
  let resolvedClassGroupId: number | null = null;
  let resolvedStatus: "DELIVERED" | "PARTIAL" | "MISSED" | "UNPLANNED";

  if (isAdHoc) {
    if (!subject_id || !class_group_id) {
      throw new ValidationError(
        "subject_id and class_group_id are required for an unscheduled/ad-hoc report",
      );
    }

    // Only allow logging activity for a subject/class-group the instructor
    // is actually assigned to teach — prevents reporting against any subject.
    const assignment = await db
      .select({ user_id: TeacherSubjectAssignment.user_id })
      .from(TeacherSubjectAssignment)
      .where(
        and(
          eq(TeacherSubjectAssignment.user_id, userId),
          eq(TeacherSubjectAssignment.subject_id, Number(subject_id)),
          eq(TeacherSubjectAssignment.class_group_id, Number(class_group_id)),
        ),
      )
      .limit(1);
    if (assignment.length === 0) {
      throw new AuthorizationError(
        "You are not assigned to teach this subject for this class group",
      );
    }

    resolvedSubjectId = Number(subject_id);
    resolvedClassGroupId = Number(class_group_id);
    // True ad-hoc submissions (the unscheduled-activity picker) never send
    // `is_scheduled_slot` or a status — those default to UNPLANNED. A
    // scheduled CalendarSlot occurrence with no LO_Lesson plan entry yet for
    // this date also lands here (no lesson_id/entry_id to key off), but it
    // explicitly flags itself via `is_scheduled_slot` and carries a real
    // DELIVERED/PARTIAL/MISSED choice from the Delivery Status picker that
    // must be preserved — gated on the explicit flag (not just "a status was
    // sent") so an ad-hoc submission can't accidentally bypass the
    // UNPLANNED-only invariant by sending a status value.
    resolvedStatus =
      is_scheduled_slot && status && ["DELIVERED", "PARTIAL", "MISSED"].includes(status)
        ? (status as "DELIVERED" | "PARTIAL" | "MISSED")
        : "UNPLANNED";
  } else {
    if (!status || !["DELIVERED", "PARTIAL", "MISSED"].includes(status))
      throw new ValidationError("status must be DELIVERED, PARTIAL, or MISSED");
    resolvedStatus = status;

    // 1. Validate lesson ownership if lesson_id provided, and recover its
    // entry_id (used below to derive subject_id/class_group_id) if the
    // caller didn't already send one.
    if (lesson_id) {
      const lesson = await db
        .select({ id: LO_Lesson.id, entry_id: LO_Lesson.entry_id })
        .from(LO_Lesson)
        .where(and(eq(LO_Lesson.id, Number(lesson_id)), eq(LO_Lesson.user_id, userId)))
        .limit(1);
      if (lesson.length === 0) throw new NotFoundError("Lesson not found or access denied");
      if (!resolvedEntryId && lesson[0].entry_id) resolvedEntryId = lesson[0].entry_id;
    }

    // 1b. Denormalize subject_id/class_group_id at write time from the scheme
    // chain (entry_id -> SchemeOfWorkEntry -> SchemeOfWork), so they survive
    // even if the source lesson/entry is later deleted (Analysis §6 item 2).
    if (resolvedEntryId) {
      const schemeRows = await db
        .select({
          subject_id: SchemeOfWork.subject_id,
          class_group_id: SchemeOfWork.class_group_id,
        })
        .from(SchemeOfWorkEntry)
        .innerJoin(SchemeOfWork, eq(SchemeOfWorkEntry.scheme_id, SchemeOfWork.scheme_id))
        .where(eq(SchemeOfWorkEntry.entry_id, resolvedEntryId))
        .limit(1);
      if (schemeRows.length > 0) {
        resolvedSubjectId = schemeRows[0].subject_id;
        resolvedClassGroupId = schemeRows[0].class_group_id;
      }
    }
  }

  // 2. Resolve the term (for schedule_flag computation and period tagging)
  let schedule_flag: "ON_TIME" | "AHEAD" | "BEHIND" = "ON_TIME";
  let resolvedAcademicYearId: number | null = null;

  if (academic_term_id) {
    const termRows = await db
      .select({
        start_date: AcademicTerm.start_date,
        academic_year_id: AcademicTerm.academic_year_id,
      })
      .from(AcademicTerm)
      .where(eq(AcademicTerm.academic_term_id, Number(academic_term_id)))
      .limit(1);

    if (termRows.length > 0) {
      resolvedAcademicYearId = termRows[0].academic_year_id;

      if (entry_id) {
        const entryRows = await db
          .select({ week_number: SchemeOfWorkEntry.week_number })
          .from(SchemeOfWorkEntry)
          .where(eq(SchemeOfWorkEntry.entry_id, Number(entry_id)))
          .limit(1);

        if (entryRows.length > 0) {
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
    }
  }

  // 3. Insert the LessonReport. A duplicate (reported_by, lesson_id,
  // delivery_date) is a real, expected case now that the unique constraint
  // exists (Phase 1) — surface it as a clear 409, not a raw DB error.
  let insertResult: any;
  try {
    insertResult = await db.insert(LessonReport).values({
      lesson_id:        lesson_id        ? Number(lesson_id)        : null,
      entry_id:         resolvedEntryId,
      reported_by:      userId,
      academic_year_id: resolvedAcademicYearId,
      academic_term_id: academic_term_id ? Number(academic_term_id) : null,
      subject_id:       resolvedSubjectId,
      class_group_id:   resolvedClassGroupId,
      delivery_date:    utcDate(delivery_date as string),
      status:           resolvedStatus,
      attendance_count: attendance_count ? Number(attendance_count) : null,
      completion_rate:  completion_rate  ? Number(completion_rate)  : null,
      reflection_notes: reflection_notes ?? null,
      evidence_url:     evidence_url     ?? null,
      schedule_flag,
    });
  } catch (err: any) {
    if (err?.code === "ER_DUP_ENTRY") {
      throw new ConflictError("A report for this lesson and date has already been submitted");
    }
    throw err;
  }

  const newId = (insertResult as any)[0].insertId as number;

  // Categorized Support Needed / Challenges (Phase 4) — additive alongside
  // the free-text reflection_notes field, not a replacement for it.
  if (Array.isArray(support_request_category_ids) && support_request_category_ids.length > 0) {
    await db.insert(LessonReportSupportRequest).values(
      support_request_category_ids.map((categoryId: number) => ({
        lesson_report_id: newId,
        category_id: Number(categoryId),
      })),
    );
  }
  if (Array.isArray(challenge_category_ids) && challenge_category_ids.length > 0) {
    await db.insert(LessonReportChallengeTag).values(
      challenge_category_ids.map((categoryId: number) => ({
        lesson_report_id: newId,
        category_id: Number(categoryId),
      })),
    );
  }

  await recordActivity(
    userId,
    "LESSON_REPORT_SUBMIT",
    `Lesson delivery reported for ${delivery_date} (status: ${resolvedStatus}, schedule: ${schedule_flag})`,
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
// GET /api/reports/lessons/:id
// Full detail of a single LessonReport, including its categorized tags — used
// to prefill the edit form for an already-submitted report (scheduled or
// ad-hoc). Self-scoped: only the reporting instructor may view it.
// ─────────────────────────────────────────────────────────────────────────────
export const getLessonReportById = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const id = Number(req.params.id);

  const rows = await db
    .select()
    .from(LessonReport)
    .where(eq(LessonReport.lesson_report_id, id))
    .limit(1);

  if (rows.length === 0) throw new NotFoundError("Lesson report not found");
  const report = rows[0];
  if (report.reported_by !== userId) {
    throw new AuthorizationError("You do not have access to this report");
  }

  const supportRows = await db
    .select({ category_id: LessonReportSupportRequest.category_id })
    .from(LessonReportSupportRequest)
    .where(eq(LessonReportSupportRequest.lesson_report_id, id));
  const challengeRows = await db
    .select({ category_id: LessonReportChallengeTag.category_id })
    .from(LessonReportChallengeTag)
    .where(eq(LessonReportChallengeTag.lesson_report_id, id));

  return successResponse(res, "Lesson report retrieved", {
    lesson_report_id: report.lesson_report_id,
    lesson_id: report.lesson_id,
    entry_id: report.entry_id,
    subject_id: report.subject_id,
    class_group_id: report.class_group_id,
    delivery_date: formatDbDate(report.delivery_date),
    status: report.status,
    attendance_count: report.attendance_count,
    completion_rate: report.completion_rate,
    reflection_notes: report.reflection_notes,
    evidence_url: report.evidence_url,
    schedule_flag: report.schedule_flag,
    is_ad_hoc: !report.lesson_id,
    support_request_category_ids: supportRows.map((r) => r.category_id),
    challenge_category_ids: challengeRows.map((r) => r.category_id),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/reports/lessons/:id
// Edits an already-submitted lesson report. The report's identity — which
// lesson/subject/class-group/date it's for — is immutable once created;
// only the "what actually happened" fields can change. Self-scoped: only the
// reporting instructor may edit it.
// ─────────────────────────────────────────────────────────────────────────────
export const updateLessonReport = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const id = Number(req.params.id);
  const {
    status,
    attendance_count,
    completion_rate,
    reflection_notes,
    evidence_url,
    support_request_category_ids,
    challenge_category_ids,
  } = req.body;

  const existing = await db
    .select({ reported_by: LessonReport.reported_by, lesson_id: LessonReport.lesson_id })
    .from(LessonReport)
    .where(eq(LessonReport.lesson_report_id, id))
    .limit(1);

  if (existing.length === 0) throw new NotFoundError("Lesson report not found");
  if (existing[0].reported_by !== userId) {
    throw new AuthorizationError("You do not have access to this report");
  }

  const isAdHoc = !existing[0].lesson_id;
  let resolvedStatus: "DELIVERED" | "PARTIAL" | "MISSED" | "UNPLANNED";
  if (isAdHoc) {
    // `lesson_id IS NULL` also covers a scheduled CalendarSlot occurrence
    // that had no LO_Lesson plan entry yet when it was first reported (see
    // submitLessonReport) — that report carries a real DELIVERED/PARTIAL/
    // MISSED status and must keep it on edit, not just true ad-hoc/
    // unscheduled-activity reports which never send a status at all.
    resolvedStatus =
      status && ["DELIVERED", "PARTIAL", "MISSED"].includes(status)
        ? (status as "DELIVERED" | "PARTIAL" | "MISSED")
        : "UNPLANNED";
  } else {
    if (!status || !["DELIVERED", "PARTIAL", "MISSED"].includes(status)) {
      throw new ValidationError("status must be DELIVERED, PARTIAL, or MISSED");
    }
    resolvedStatus = status;
  }

  await db
    .update(LessonReport)
    .set({
      status: resolvedStatus,
      attendance_count: attendance_count !== undefined ? Number(attendance_count) : null,
      completion_rate: completion_rate !== undefined ? Number(completion_rate) : null,
      reflection_notes: reflection_notes ?? null,
      evidence_url: evidence_url ?? null,
    })
    .where(eq(LessonReport.lesson_report_id, id));

  if (Array.isArray(support_request_category_ids)) {
    await db.delete(LessonReportSupportRequest).where(eq(LessonReportSupportRequest.lesson_report_id, id));
    if (support_request_category_ids.length > 0) {
      await db.insert(LessonReportSupportRequest).values(
        support_request_category_ids.map((categoryId: number) => ({
          lesson_report_id: id,
          category_id: Number(categoryId),
        })),
      );
    }
  }
  if (Array.isArray(challenge_category_ids)) {
    await db.delete(LessonReportChallengeTag).where(eq(LessonReportChallengeTag.lesson_report_id, id));
    if (challenge_category_ids.length > 0) {
      await db.insert(LessonReportChallengeTag).values(
        challenge_category_ids.map((categoryId: number) => ({
          lesson_report_id: id,
          category_id: Number(categoryId),
        })),
      );
    }
  }

  await recordActivity(
    userId,
    "LESSON_REPORT_UPDATE",
    `Lesson report ${id} updated (status: ${resolvedStatus})`,
    "LessonReport",
    id,
  );

  return successResponse(res, "Lesson report updated", { lesson_report_id: id });
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/lessons/rollup
// Self-scoped version of admin's getAdminLessonReportsRollup — same Subject ->
// Class Group -> Week grouping (buildLessonReportRollup), restricted to the
// authenticated instructor's own reports so it needs no admin permission.
// reported_by is hard-set from the session and never read from req.query, so
// an instructor can never pull another teacher's data through this route.
// ─────────────────────────────────────────────────────────────────────────────
export const getMyLessonReportsRollup = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const { start_date, end_date, academic_term_id, subject_id, class_group_id } = req.query;

  if (!start_date || !end_date || !academic_term_id) {
    throw new ValidationError("start_date, end_date, and academic_term_id are required");
  }

  const rollup = await buildLessonReportRollup({
    start_date,
    end_date,
    academic_term_id: parseInt(academic_term_id as string),
    subject_id: subject_id ? parseInt(subject_id as string) : undefined,
    class_group_id: class_group_id ? parseInt(class_group_id as string) : undefined,
    reported_by: userId,
  });

  return successResponse(res, "Lesson reports rollup retrieved", rollup);
});
