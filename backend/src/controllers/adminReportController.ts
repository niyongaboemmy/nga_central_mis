import { db } from "../db";
import { eq, and, sql, count, desc, inArray, asc } from "drizzle-orm";
import {
  LessonReport,
  MentorshipSession,
  ReportProjectUpdate,
  UserProfile,
  SchemeOfWorkEntry,
  SchemeOfWork,
  LO_Lesson,
  CalendarSlot,
  Subject,
  ClassGroup,
  Grade,
  Program,
  StudentClassGroup,
  AcademicTerm,
  SupportRequestCategory,
  ChallengeCategory,
  LessonReportSupportRequest,
  LessonReportChallengeTag,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ValidationError, NotFoundError } from "../errors/CustomError";
import { buildLessonReportRollup } from "../services/lessonReportRollupService";

const formatDbDate = (d: any): string | null => {
  if (!d) return null;
  if (typeof d === "string") return d.split("T")[0];
  const dateObj = d as Date;
  const year  = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/admin/dashboard
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminDashboardStats = asyncHandler(async (req: any, res: any) => {
  const { start_date, end_date, academic_term_id, instructor_id, subject_id, class_group_id } = req.query;

  const lrDateFilter = and(
    start_date ? sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') >= ${start_date}` : sql`1=1`,
    end_date   ? sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') <= ${end_date}`   : sql`1=1`,
    subject_id     ? eq(LessonReport.subject_id,     parseInt(subject_id as string))     : sql`1=1`,
    class_group_id ? eq(LessonReport.class_group_id, parseInt(class_group_id as string)) : sql`1=1`,
  );
  const msDateFilter = and(
    start_date ? sql`DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d') >= ${start_date}` : sql`1=1`,
    end_date   ? sql`DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d') <= ${end_date}`   : sql`1=1`,
  );
  const instFilter = instructor_id
    ? eq(LessonReport.reported_by, parseInt(instructor_id as string))
    : sql`1=1`;
  const msInstFilter = instructor_id
    ? eq(MentorshipSession.user_id, parseInt(instructor_id as string))
    : sql`1=1`;

  const [totalLR] = await db
    .select({ total: count() })
    .from(LessonReport)
    .where(and(instFilter, lrDateFilter));

  const statusBreakdown = await db
    .select({ status: LessonReport.status, total: count() })
    .from(LessonReport)
    .where(and(instFilter, lrDateFilter))
    .groupBy(LessonReport.status);

  const scheduleBreakdown = await db
    .select({ schedule_flag: LessonReport.schedule_flag, total: count() })
    .from(LessonReport)
    .where(and(instFilter, lrDateFilter))
    .groupBy(LessonReport.schedule_flag);

  const [totalMS] = await db
    .select({ total: count() })
    .from(MentorshipSession)
    .where(and(msInstFilter, msDateFilter));

  const termCondition = and(
    academic_term_id ? eq(SchemeOfWork.academic_term_id, parseInt(academic_term_id as string)) : sql`1=1`,
    subject_id       ? eq(SchemeOfWork.subject_id,       parseInt(subject_id as string))       : sql`1=1`,
    class_group_id   ? eq(SchemeOfWork.class_group_id,   parseInt(class_group_id as string))   : sql`1=1`,
  );

  const [totalEntries] = await db
    .select({ total: count() })
    .from(SchemeOfWorkEntry)
    .innerJoin(SchemeOfWork, eq(SchemeOfWorkEntry.scheme_id, SchemeOfWork.scheme_id))
    .where(termCondition);

  const [deliveredEntries] = await db
    .select({
      total: sql<number>`COUNT(DISTINCT ${LessonReport.entry_id})`,
    })
    .from(LessonReport)
    .where(
      and(
        eq(LessonReport.status, "DELIVERED"),
        sql`${LessonReport.entry_id} IS NOT NULL`,
        lrDateFilter,
      ),
    );

  const coveragePct =
    totalEntries.total > 0
      ? Math.round(((deliveredEntries.total as number) / totalEntries.total) * 100)
      : 0;

  const trendData = await db
    .select({
      date:  sql<string>`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d')`,
      total: count(),
    })
    .from(LessonReport)
    .where(and(instFilter, lrDateFilter))
    .groupBy(sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d')`)
    .orderBy(sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') ASC`);

  return successResponse(res, "Admin dashboard stats retrieved", {
    total_lesson_reports:      totalLR.total,
    total_mentorship_sessions: totalMS.total,
    curriculum_coverage_pct:   coveragePct,
    total_sow_entries:         totalEntries.total,
    delivered_entries:         deliveredEntries.total as number,
    status_breakdown:          statusBreakdown,
    schedule_breakdown:        scheduleBreakdown,
    trend_data:                trendData,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/admin/compliance
// ─────────────────────────────────────────────────────────────────────────────
export const getComplianceReport = asyncHandler(async (req: any, res: any) => {
  const { start_date, end_date, academic_term_id, subject_id, class_group_id } = req.query;

  if (!start_date || !end_date) {
    throw new ValidationError("start_date and end_date are required");
  }

  const termId = academic_term_id ? parseInt(academic_term_id as string) : null;
  const startMs   = new Date(start_date as string).getTime();
  const endMs     = new Date(end_date   as string).getTime();
  const totalDays = Math.ceil((endMs - startMs) / 86400000) + 1;

  const instructorSlots = await db
    .select({
      user_id:    CalendarSlot.user_id,
      first_name: UserProfile.first_name,
      last_name:  UserProfile.last_name,
      slot_count: sql<number>`COUNT(DISTINCT ${CalendarSlot.slot_id})`,
    })
    .from(CalendarSlot)
    .innerJoin(UserProfile, eq(CalendarSlot.user_id, UserProfile.user_id))
    .where(
      and(
        eq(CalendarSlot.is_active, 1),
        termId ? eq(CalendarSlot.academic_term_id, termId) : sql`1=1`,
        subject_id     ? eq(CalendarSlot.subject_id,     parseInt(subject_id as string))     : sql`1=1`,
        class_group_id ? eq(CalendarSlot.class_group_id, parseInt(class_group_id as string)) : sql`1=1`,
      ),
    )
    .groupBy(CalendarSlot.user_id, UserProfile.first_name, UserProfile.last_name);

  if (instructorSlots.length === 0) {
    return successResponse(res, "Compliance report retrieved", []);
  }

  const userIds = instructorSlots.map((i) => i.user_id);

  const reportCounts = await db
    .select({
      reported_by:   LessonReport.reported_by,
      reported:      count(),
      non_delivered: sql<number>`SUM(CASE WHEN ${LessonReport.status} IN ('MISSED','PARTIAL') THEN 1 ELSE 0 END)`,
    })
    .from(LessonReport)
    .where(
      and(
        inArray(LessonReport.reported_by, userIds),
        sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') >= ${start_date}`,
        sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') <= ${end_date}`,
        subject_id     ? eq(LessonReport.subject_id,     parseInt(subject_id as string))     : sql`1=1`,
        class_group_id ? eq(LessonReport.class_group_id, parseInt(class_group_id as string)) : sql`1=1`,
      ),
    )
    .groupBy(LessonReport.reported_by);

  const reportMap = new Map(reportCounts.map((r) => [r.reported_by, r]));

  const result = instructorSlots.map((inst) => {
    const expected       = Math.ceil(inst.slot_count * (totalDays / 7));
    const reported       = reportMap.get(inst.user_id)?.reported ?? 0;
    const non_delivered  = Number(reportMap.get(inst.user_id)?.non_delivered ?? 0);
    const compliance_pct = expected > 0
      ? Math.min(100, Math.round((reported / expected) * 100))
      : 0;

    return {
      user_id:          inst.user_id,
      instructor_name:  `${inst.first_name} ${inst.last_name}`,
      expected_lessons: expected,
      reported_lessons: reported,
      non_delivered,
      compliance_pct,
    };
  });

  result.sort((a, b) => a.compliance_pct - b.compliance_pct);
  return successResponse(res, "Compliance report retrieved", result);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/admin/coverage
// Per-subject SOW (expected) vs LessonReport (actual) compliance heatmap.
// ─────────────────────────────────────────────────────────────────────────────
export const getSubjectCoverageStats = asyncHandler(async (req: any, res: any) => {
  const { academic_term_id, start_date, end_date, subject_id, class_group_id } = req.query;

  const termCondition = and(
    academic_term_id ? eq(SchemeOfWork.academic_term_id, parseInt(academic_term_id as string)) : sql`1=1`,
    subject_id       ? eq(SchemeOfWork.subject_id,       parseInt(subject_id as string))       : sql`1=1`,
    class_group_id   ? eq(SchemeOfWork.class_group_id,   parseInt(class_group_id as string))   : sql`1=1`,
  );

  const sowRows = await db
    .select({
      subject_id:    Subject.subject_id,
      subject_name:  Subject.name,
      subject_code:  Subject.code,
      total_entries: sql<number>`COUNT(DISTINCT ${SchemeOfWorkEntry.entry_id})`,
    })
    .from(SchemeOfWork)
    .innerJoin(Subject, eq(SchemeOfWork.subject_id, Subject.subject_id))
    .innerJoin(SchemeOfWorkEntry, eq(SchemeOfWorkEntry.scheme_id, SchemeOfWork.scheme_id))
    .where(termCondition)
    .groupBy(Subject.subject_id, Subject.name, Subject.code);

  if (sowRows.length === 0) {
    return successResponse(res, "Subject coverage stats retrieved", []);
  }

  const subjectIds = sowRows.map((s) => s.subject_id);

  const deliveredRows = await db
    .select({
      subject_id: SchemeOfWork.subject_id,
      delivered:  sql<number>`COUNT(DISTINCT ${LessonReport.lesson_report_id})`,
    })
    .from(LessonReport)
    .innerJoin(SchemeOfWorkEntry, eq(LessonReport.entry_id, SchemeOfWorkEntry.entry_id))
    .innerJoin(SchemeOfWork, eq(SchemeOfWorkEntry.scheme_id, SchemeOfWork.scheme_id))
    .where(
      and(
        eq(LessonReport.status, "DELIVERED"),
        sql`${LessonReport.entry_id} IS NOT NULL`,
        inArray(SchemeOfWork.subject_id, subjectIds),
        class_group_id ? eq(SchemeOfWork.class_group_id, parseInt(class_group_id as string)) : sql`1=1`,
        start_date ? sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') >= ${start_date}` : sql`1=1`,
        end_date   ? sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') <= ${end_date}`   : sql`1=1`,
      ),
    )
    .groupBy(SchemeOfWork.subject_id);

  const deliveredMap = new Map(deliveredRows.map((r) => [r.subject_id, r.delivered]));

  const result = sowRows.map((s) => {
    const delivered    = deliveredMap.get(s.subject_id) ?? 0;
    const coverage_pct = s.total_entries > 0
      ? Math.round((delivered / s.total_entries) * 100)
      : 0;
    return {
      subject_id:    s.subject_id,
      subject_name:  s.subject_name,
      subject_code:  s.subject_code,
      total_entries: s.total_entries,
      delivered,
      pending:       Math.max(0, s.total_entries - delivered),
      coverage_pct,
    };
  });

  result.sort((a, b) => a.coverage_pct - b.coverage_pct);
  return successResponse(res, "Subject coverage stats retrieved", result);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/admin/lesson-reports
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminLessonReports = asyncHandler(async (req: any, res: any) => {
  const { start_date, end_date, instructor_id, schedule_flag, status, subject_id, class_group_id, program_id, grade_id } = req.query;

  const rows = await db
    .select({
      lesson_report_id: LessonReport.lesson_report_id,
      reported_by:      LessonReport.reported_by,
      instructor_name:  sql<string>`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
      delivery_date:    LessonReport.delivery_date,
      status:           LessonReport.status,
      schedule_flag:    LessonReport.schedule_flag,
      validation_status:  LessonReport.validation_status,
      validation_comment: LessonReport.validation_comment,
      attendance_count: LessonReport.attendance_count,
      completion_rate:  LessonReport.completion_rate,
      reflection_notes: LessonReport.reflection_notes,
      module_code:      LO_Lesson.module_code,
      module_name:      LO_Lesson.module_name,
      big_question:     LO_Lesson.big_question,
      topic:            SchemeOfWorkEntry.topic,
      sub_topic:        SchemeOfWorkEntry.sub_topic,
      objective:        SchemeOfWorkEntry.objective,
      // Denormalized directly on LessonReport (Phase 1) — works for both
      // scheduled AND ad-hoc reports, unlike the old SchemeOfWork-join path
      // which was always null for ad-hoc rows (no entry_id to join through).
      subject_id:       LessonReport.subject_id,
      subject_name:     Subject.name,
      class_group_id:   LessonReport.class_group_id,
      class_group_name: ClassGroup.name,
    })
    .from(LessonReport)
    .innerJoin(UserProfile, eq(LessonReport.reported_by, UserProfile.user_id))
    .leftJoin(LO_Lesson, eq(LessonReport.lesson_id, LO_Lesson.id))
    .leftJoin(SchemeOfWorkEntry, eq(LessonReport.entry_id, SchemeOfWorkEntry.entry_id))
    .leftJoin(Subject, eq(LessonReport.subject_id, Subject.subject_id))
    .leftJoin(ClassGroup, eq(LessonReport.class_group_id, ClassGroup.class_group_id))
    // Program/Grade aren't columns on LessonReport itself — resolved via the
    // report's class group, same join chain getAllAdminReports uses for the
    // weekly-summary list, so the "Program"/"Grade" filters in the Admin
    // Reporting UI actually narrow this list instead of being silently
    // ignored (they were previously accepted by the frontend but dropped here).
    .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .leftJoin(Program, eq(Grade.program_id, Program.program_id))
    .where(
      and(
        instructor_id ? eq(LessonReport.reported_by, parseInt(instructor_id as string)) : sql`1=1`,
        schedule_flag ? eq(LessonReport.schedule_flag, schedule_flag as any) : sql`1=1`,
        status        ? eq(LessonReport.status, status as any) : sql`1=1`,
        subject_id     ? eq(LessonReport.subject_id,     parseInt(subject_id as string))     : sql`1=1`,
        class_group_id ? eq(LessonReport.class_group_id, parseInt(class_group_id as string)) : sql`1=1`,
        grade_id      ? eq(Grade.grade_id, parseInt(grade_id as string))     : sql`1=1`,
        program_id    ? eq(Program.program_id, parseInt(program_id as string)) : sql`1=1`,
        start_date    ? sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') >= ${start_date}` : sql`1=1`,
        end_date      ? sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') <= ${end_date}`   : sql`1=1`,
      ),
    )
    .orderBy(desc(LessonReport.delivery_date));

  return successResponse(
    res,
    "Lesson reports retrieved",
    rows.map((r) => ({ ...r, delivery_date: formatDbDate(r.delivery_date) })),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/admin/lessons-rollup
// Groups LessonReport rows by Subject -> Class Group -> Week within a date
// range, matching the reviewed reference document's structure (Analysis
// §5.4). Investigated getWeeklyStitchedReport first (Phase 3 task 1): it
// combines lessons/mentorship/projects into one per-instructor, ungrouped
// list — no subject/class-group/week grouping at all, so it isn't reusable
// for this shape without pulling mentorship/project data into scope (out of
// bounds for this restructure). Built as a new, lesson-only endpoint instead,
// alongside the existing unified view rather than replacing it.
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminLessonReportsRollup = asyncHandler(async (req: any, res: any) => {
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
  });

  return successResponse(res, "Lesson reports rollup retrieved", rollup);
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/reports/admin/lesson-reports/:id/approval
// Mirrors adminUpdateCheckIn's approve/reject pattern (mentorshipController.ts).
// ─────────────────────────────────────────────────────────────────────────────
export const adminUpdateLessonReportApproval = asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) throw new ValidationError("Invalid lesson report ID");

  const { validation_status, validation_comment } = req.body;
  if (!["PENDING", "APPROVED", "REJECTED"].includes(validation_status)) {
    throw new ValidationError("validation_status must be PENDING, APPROVED, or REJECTED");
  }
  if (validation_status === "REJECTED" && !validation_comment?.trim()) {
    throw new ValidationError("A comment is required when rejecting a report");
  }

  const [existing] = await db
    .select({ lesson_report_id: LessonReport.lesson_report_id })
    .from(LessonReport)
    .where(eq(LessonReport.lesson_report_id, id))
    .limit(1);

  if (!existing) throw new NotFoundError("Lesson report not found");

  await db
    .update(LessonReport)
    .set({
      validation_status,
      validation_comment: validation_comment ?? null,
      validated_by: req.user.userId,
      validated_at: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(LessonReport.lesson_report_id, id));

  return successResponse(res, "Lesson report approval updated", { lesson_report_id: id, validation_status });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/admin/support-requests/summary
// GROUP BY category, COUNT(*), ordered descending — turns the categorized
// "Support Needed" selections (Phase 4) into a rankable list instead of only
// readable one report's free text at a time (Analysis §5.1).
// ─────────────────────────────────────────────────────────────────────────────
export const getSupportRequestSummary = asyncHandler(async (req: any, res: any) => {
  const { start_date, end_date, subject_id, class_group_id } = req.query;

  const rows = await db
    .select({
      category_id: SupportRequestCategory.category_id,
      label: SupportRequestCategory.label,
      total: count(),
    })
    .from(LessonReportSupportRequest)
    .innerJoin(
      SupportRequestCategory,
      eq(LessonReportSupportRequest.category_id, SupportRequestCategory.category_id),
    )
    .innerJoin(LessonReport, eq(LessonReportSupportRequest.lesson_report_id, LessonReport.lesson_report_id))
    .where(
      and(
        start_date ? sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') >= ${start_date}` : sql`1=1`,
        end_date   ? sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') <= ${end_date}`   : sql`1=1`,
        subject_id     ? eq(LessonReport.subject_id,     parseInt(subject_id as string))     : sql`1=1`,
        class_group_id ? eq(LessonReport.class_group_id, parseInt(class_group_id as string)) : sql`1=1`,
      ),
    )
    .groupBy(SupportRequestCategory.category_id, SupportRequestCategory.label)
    .orderBy(desc(count()));

  return successResponse(res, "Support request summary retrieved", rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/admin/challenges/summary
// Same shape as above, for the "Challenges Encountered" tags (Analysis §5.3)
// — surfaces a recurring challenge (e.g. "Electricity/Power") as a ranked,
// counted pattern across subjects/teachers instead of buried in free text.
// ─────────────────────────────────────────────────────────────────────────────
export const getChallengeSummary = asyncHandler(async (req: any, res: any) => {
  const { start_date, end_date, subject_id, class_group_id } = req.query;

  const rows = await db
    .select({
      category_id: ChallengeCategory.category_id,
      label: ChallengeCategory.label,
      total: count(),
    })
    .from(LessonReportChallengeTag)
    .innerJoin(ChallengeCategory, eq(LessonReportChallengeTag.category_id, ChallengeCategory.category_id))
    .innerJoin(LessonReport, eq(LessonReportChallengeTag.lesson_report_id, LessonReport.lesson_report_id))
    .where(
      and(
        start_date ? sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') >= ${start_date}` : sql`1=1`,
        end_date   ? sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') <= ${end_date}`   : sql`1=1`,
        subject_id     ? eq(LessonReport.subject_id,     parseInt(subject_id as string))     : sql`1=1`,
        class_group_id ? eq(LessonReport.class_group_id, parseInt(class_group_id as string)) : sql`1=1`,
      ),
    )
    .groupBy(ChallengeCategory.category_id, ChallengeCategory.label)
    .orderBy(desc(count()));

  return successResponse(res, "Challenge summary retrieved", rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/admin/mentorship-logs
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminMentorshipLogs = asyncHandler(async (req: any, res: any) => {
  const { start_date, end_date, instructor_id, subject_id, class_group_id, program_id, grade_id } = req.query;

  // Alias for instructor and student profiles
  const InstructorProfile = UserProfile;

  const rows = await db
    .select({
      mentorship_id:    MentorshipSession.mentorship_id,
      user_id:          MentorshipSession.user_id,
      instructor_name:  sql<string>`CONCAT(ip.first_name, ' ', ip.last_name)`,
      session_date:     MentorshipSession.session_date,
      student_id:       MentorshipSession.student_id,
      student_name:     sql<string>`CONCAT(COALESCE(sp.first_name, ''), ' ', COALESCE(sp.last_name, ''))`,
      topic:            MentorshipSession.topic,
      duration_minutes: MentorshipSession.duration_minutes,
      wellbeing_status: MentorshipSession.wellbeing_status,
      session_status:   MentorshipSession.session_status,
      validation_status:  MentorshipSession.validation_status,
      validation_comment: MentorshipSession.validation_comment,
      notes:            MentorshipSession.notes,
      action_items:     MentorshipSession.action_items,
      follow_up_required: MentorshipSession.follow_up_required,
    })
    .from(MentorshipSession)
    .innerJoin(
      sql`UserProfile ip`,
      sql`${MentorshipSession.user_id} = ip.user_id`,
    )
    .leftJoin(
      sql`UserProfile sp`,
      sql`${MentorshipSession.student_id} = sp.user_id`,
    )
    // Subject/Class Group/Grade/Program aren't columns on MentorshipSession
    // (subject_id is, the rest resolve via the mentee's class group) — same
    // filters the Admin Reporting UI already collects for the Lesson tab,
    // previously accepted by the frontend but dropped entirely for this
    // endpoint. A student who has moved between class groups mid-year can
    // have more than one ACTIVE StudentClassGroup row, so this join can
    // occasionally fan out a session into more than one row when a
    // class-group/grade/program filter is applied — acceptable for this
    // low-frequency admin filtering view.
    .leftJoin(
      StudentClassGroup,
      and(eq(MentorshipSession.student_id, StudentClassGroup.user_id), eq(StudentClassGroup.status, "ACTIVE")),
    )
    .leftJoin(ClassGroup, eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id))
    .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .leftJoin(Program, eq(Grade.program_id, Program.program_id))
    .where(
      and(
        instructor_id ? eq(MentorshipSession.user_id, parseInt(instructor_id as string)) : sql`1=1`,
        subject_id     ? eq(MentorshipSession.subject_id, parseInt(subject_id as string))     : sql`1=1`,
        class_group_id ? eq(ClassGroup.class_group_id,    parseInt(class_group_id as string)) : sql`1=1`,
        grade_id       ? eq(Grade.grade_id,                parseInt(grade_id as string))       : sql`1=1`,
        program_id     ? eq(Program.program_id,            parseInt(program_id as string))     : sql`1=1`,
        start_date    ? sql`DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d') >= ${start_date}` : sql`1=1`,
        end_date      ? sql`DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d') <= ${end_date}`   : sql`1=1`,
      ),
    )
    .orderBy(desc(MentorshipSession.session_date));

  return successResponse(
    res,
    "Mentorship logs retrieved",
    rows.map((r) => ({
      ...r,
      session_date: formatDbDate(r.session_date),
      student_name: r.student_name?.trim() || null,
    })),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/reports/admin/mentorship-logs/:id/approval
// Mirrors adminUpdateCheckIn's approve/reject pattern (mentorshipController.ts).
// Distinct from MenteeCheckIn's approval workflow — this validates
// MentorshipSession rows (the "Mentorship" reporting log), not check-ins.
// ─────────────────────────────────────────────────────────────────────────────
export const adminUpdateMentorshipSessionApproval = asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) throw new ValidationError("Invalid mentorship session ID");

  const { validation_status, validation_comment } = req.body;
  if (!["PENDING", "APPROVED", "REJECTED"].includes(validation_status)) {
    throw new ValidationError("validation_status must be PENDING, APPROVED, or REJECTED");
  }
  if (validation_status === "REJECTED" && !validation_comment?.trim()) {
    throw new ValidationError("A comment is required when rejecting a report");
  }

  const [existing] = await db
    .select({ mentorship_id: MentorshipSession.mentorship_id })
    .from(MentorshipSession)
    .where(eq(MentorshipSession.mentorship_id, id))
    .limit(1);

  if (!existing) throw new NotFoundError("Mentorship session not found");

  await db
    .update(MentorshipSession)
    .set({
      validation_status,
      validation_comment: validation_comment ?? null,
      validated_by: req.user.userId,
      validated_at: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(MentorshipSession.mentorship_id, id));

  return successResponse(res, "Mentorship session approval updated", { mentorship_id: id, validation_status });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/admin/student-timeline/:studentId
// Returns the full chronological mentorship timeline for a specific student
// (visible to admins across all instructors).
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminStudentTimeline = asyncHandler(async (req: any, res: any) => {
  const studentId = parseInt(req.params.studentId, 10);

  if (!studentId || isNaN(studentId)) {
    throw new ValidationError("Invalid student ID");
  }

  const sessions = await db
    .select({
      mentorship_id:    MentorshipSession.mentorship_id,
      session_date:     MentorshipSession.session_date,
      topic:            MentorshipSession.topic,
      duration_minutes: MentorshipSession.duration_minutes,
      wellbeing_status: MentorshipSession.wellbeing_status,
      session_status:   MentorshipSession.session_status,
      follow_up_required: MentorshipSession.follow_up_required,
      action_items:     MentorshipSession.action_items,
      next_steps:       MentorshipSession.next_steps,
      notes:            MentorshipSession.notes,
      challenges_identified: MentorshipSession.challenges_identified,
      academic_planning: MentorshipSession.academic_planning,
      instructor_name:  sql<string>`CONCAT(ip.first_name, ' ', ip.last_name)`,
    })
    .from(MentorshipSession)
    .innerJoin(
      sql`UserProfile ip`,
      sql`${MentorshipSession.user_id} = ip.user_id`,
    )
    .where(eq(MentorshipSession.student_id, studentId))
    .orderBy(asc(MentorshipSession.session_date));

  // Build wellbeing trend data (numeric scale for chart)
  const WELLBEING_SCALE: Record<string, number> = {
    STRUGGLING: 1,
    CONCERNED:  2,
    NEUTRAL:    3,
    GOOD:       4,
    EXCELLENT:  5,
  };

  const wellbeingTrend = sessions
    .filter((s) => s.wellbeing_status && WELLBEING_SCALE[s.wellbeing_status])
    .map((s) => ({
      date:  formatDbDate(s.session_date),
      score: WELLBEING_SCALE[s.wellbeing_status!],
      label: s.wellbeing_status,
    }));

  const formatted = sessions.map((s) => ({
    ...s,
    session_date:       formatDbDate(s.session_date),
    follow_up_required: Boolean(s.follow_up_required),
  }));

  return successResponse(res, "Student timeline retrieved", {
    sessions: formatted,
    wellbeing_trend: wellbeingTrend,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/admin/project-updates
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminProjectUpdates = asyncHandler(async (req: any, res: any) => {
  const { instructor_id } = req.query;

  const rows = await db
    .select({
      project_update_id: ReportProjectUpdate.project_update_id,
      user_id:           ReportProjectUpdate.user_id,
      instructor_name:   sql<string>`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
      project_name:      ReportProjectUpdate.project_name,
      role:              ReportProjectUpdate.role,
      status:            ReportProjectUpdate.status,
      work_completed:    ReportProjectUpdate.work_completed,
      key_outputs:       ReportProjectUpdate.key_outputs,
      challenges:        ReportProjectUpdate.challenges,
    })
    .from(ReportProjectUpdate)
    .innerJoin(UserProfile, eq(ReportProjectUpdate.user_id, UserProfile.user_id))
    .where(
      instructor_id
        ? eq(ReportProjectUpdate.user_id, parseInt(instructor_id as string))
        : sql`1=1`,
    )
    .orderBy(desc(ReportProjectUpdate.project_update_id));

  return successResponse(res, "Project updates retrieved", rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/admin/weekly-stitched
// Unifies LessonReports + MentorshipSessions + ProjectUpdates into one document
// for a given date range (and optionally an instructor).
// ─────────────────────────────────────────────────────────────────────────────
export const getWeeklyStitchedReport = asyncHandler(async (req: any, res: any) => {
  const { start_date, end_date, instructor_id } = req.query;

  if (!start_date || !end_date) {
    throw new ValidationError("start_date and end_date are required");
  }

  const instFilter   = instructor_id ? eq(LessonReport.reported_by,    parseInt(instructor_id as string)) : sql`1=1`;
  const msInstFilter = instructor_id ? eq(MentorshipSession.user_id,   parseInt(instructor_id as string)) : sql`1=1`;
  const prInstFilter = instructor_id ? eq(ReportProjectUpdate.user_id, parseInt(instructor_id as string)) : sql`1=1`;

  const [lessons, mentorship, projects] = await Promise.all([
    db
      .select({
        lesson_report_id: LessonReport.lesson_report_id,
        instructor_name:  sql<string>`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
        delivery_date:    LessonReport.delivery_date,
        status:           LessonReport.status,
        schedule_flag:    LessonReport.schedule_flag,
        attendance_count: LessonReport.attendance_count,
        completion_rate:  LessonReport.completion_rate,
        reflection_notes: LessonReport.reflection_notes,
        module_code:      LO_Lesson.module_code,
        module_name:      LO_Lesson.module_name,
        topic:            SchemeOfWorkEntry.topic,
        objective:        SchemeOfWorkEntry.objective,
      })
      .from(LessonReport)
      .innerJoin(UserProfile, eq(LessonReport.reported_by, UserProfile.user_id))
      .leftJoin(LO_Lesson, eq(LessonReport.lesson_id, LO_Lesson.id))
      .leftJoin(SchemeOfWorkEntry, eq(LessonReport.entry_id, SchemeOfWorkEntry.entry_id))
      .where(
        and(
          instFilter,
          sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') >= ${start_date}`,
          sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') <= ${end_date}`,
        ),
      )
      .orderBy(desc(LessonReport.delivery_date)),

    db
      .select({
        mentorship_id:    MentorshipSession.mentorship_id,
        instructor_name:  sql<string>`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
        session_date:     MentorshipSession.session_date,
        student_name:     MentorshipSession.student_name,
        duration_minutes: MentorshipSession.duration_minutes,
        wellbeing_status: MentorshipSession.wellbeing_status,
        notes:            MentorshipSession.notes,
        follow_up_required: MentorshipSession.follow_up_required,
      })
      .from(MentorshipSession)
      .innerJoin(UserProfile, eq(MentorshipSession.user_id, UserProfile.user_id))
      .where(
        and(
          msInstFilter,
          sql`DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d') >= ${start_date}`,
          sql`DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d') <= ${end_date}`,
        ),
      )
      .orderBy(desc(MentorshipSession.session_date)),

    db
      .select({
        project_update_id: ReportProjectUpdate.project_update_id,
        instructor_name:   sql<string>`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
        project_name:      ReportProjectUpdate.project_name,
        role:              ReportProjectUpdate.role,
        status:            ReportProjectUpdate.status,
        work_completed:    ReportProjectUpdate.work_completed,
        key_outputs:       ReportProjectUpdate.key_outputs,
        challenges:        ReportProjectUpdate.challenges,
      })
      .from(ReportProjectUpdate)
      .innerJoin(UserProfile, eq(ReportProjectUpdate.user_id, UserProfile.user_id))
      .where(prInstFilter)
      .orderBy(desc(ReportProjectUpdate.project_update_id)),
  ]);

  const formattedLessons    = lessons.map((r) => ({ ...r, delivery_date: formatDbDate(r.delivery_date) }));
  const formattedMentorship = mentorship.map((r) => ({ ...r, session_date: formatDbDate(r.session_date) }));

  return successResponse(res, "Weekly stitched report retrieved", {
    period: { start_date, end_date },
    summary: {
      total_lessons:    formattedLessons.length,
      total_mentorship: formattedMentorship.length,
      total_projects:   projects.length,
      delivered:        formattedLessons.filter((l) => l.status === "DELIVERED").length,
      partial:          formattedLessons.filter((l) => l.status === "PARTIAL").length,
      missed:           formattedLessons.filter((l) => l.status === "MISSED").length,
    },
    lessons:    formattedLessons,
    mentorship: formattedMentorship,
    projects,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/admin/export
// Streams CSV (default) or an HTML print document (format=html).
// category: lessons | mentorship | projects | unified
// ─────────────────────────────────────────────────────────────────────────────
export const exportReportingData = asyncHandler(async (req: any, res: any) => {
  const {
    start_date,
    end_date,
    category = "lessons",
    format   = "csv",
    instructor_id,
  } = req.query;

  const lrDateFilter = and(
    start_date ? sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') >= ${start_date}` : sql`1=1`,
    end_date   ? sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') <= ${end_date}`   : sql`1=1`,
  );
  const msDateFilter = and(
    start_date ? sql`DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d') >= ${start_date}` : sql`1=1`,
    end_date   ? sql`DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d') <= ${end_date}`   : sql`1=1`,
  );

  // ── Fetch data for each needed category ──────────────────────────────────
  const needsLessons    = category === "lessons"    || category === "unified";
  const needsMentorship = category === "mentorship" || category === "unified";
  const needsProjects   = category === "projects"   || category === "unified";

  let lessonData:     any[] = [];
  let mentorshipData: any[] = [];
  let projectData:    any[] = [];

  if (needsLessons) {
    lessonData = await db
      .select({
        lesson_report_id: LessonReport.lesson_report_id,
        instructor_name:  sql<string>`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
        delivery_date:    LessonReport.delivery_date,
        status:           LessonReport.status,
        schedule_flag:    LessonReport.schedule_flag,
        attendance_count: LessonReport.attendance_count,
        completion_rate:  LessonReport.completion_rate,
        module_code:      LO_Lesson.module_code,
        module_name:      LO_Lesson.module_name,
        topic:            SchemeOfWorkEntry.topic,
        reflection_notes: LessonReport.reflection_notes,
      })
      .from(LessonReport)
      .innerJoin(UserProfile, eq(LessonReport.reported_by, UserProfile.user_id))
      .leftJoin(LO_Lesson, eq(LessonReport.lesson_id, LO_Lesson.id))
      .leftJoin(SchemeOfWorkEntry, eq(LessonReport.entry_id, SchemeOfWorkEntry.entry_id))
      .where(
        and(
          instructor_id ? eq(LessonReport.reported_by, parseInt(instructor_id as string)) : sql`1=1`,
          lrDateFilter,
        ),
      )
      .orderBy(desc(LessonReport.delivery_date));
  }

  if (needsMentorship) {
    mentorshipData = await db
      .select({
        mentorship_id:    MentorshipSession.mentorship_id,
        instructor_name:  sql<string>`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
        session_date:     MentorshipSession.session_date,
        student_name:     MentorshipSession.student_name,
        duration_minutes: MentorshipSession.duration_minutes,
        wellbeing_status: MentorshipSession.wellbeing_status,
        notes:            MentorshipSession.notes,
      })
      .from(MentorshipSession)
      .innerJoin(UserProfile, eq(MentorshipSession.user_id, UserProfile.user_id))
      .where(
        and(
          instructor_id ? eq(MentorshipSession.user_id, parseInt(instructor_id as string)) : sql`1=1`,
          msDateFilter,
        ),
      )
      .orderBy(desc(MentorshipSession.session_date));
  }

  if (needsProjects) {
    projectData = await db
      .select({
        project_update_id: ReportProjectUpdate.project_update_id,
        instructor_name:   sql<string>`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
        project_name:      ReportProjectUpdate.project_name,
        role:              ReportProjectUpdate.role,
        status:            ReportProjectUpdate.status,
        work_completed:    ReportProjectUpdate.work_completed,
        key_outputs:       ReportProjectUpdate.key_outputs,
      })
      .from(ReportProjectUpdate)
      .innerJoin(UserProfile, eq(ReportProjectUpdate.user_id, UserProfile.user_id))
      .where(
        instructor_id
          ? eq(ReportProjectUpdate.user_id, parseInt(instructor_id as string))
          : sql`1=1`,
      )
      .orderBy(desc(ReportProjectUpdate.project_update_id));
  }

  // ── HTML / PDF export ─────────────────────────────────────────────────────
  if (format === "html") {
    const period = `${start_date ?? "All time"} → ${end_date ?? "today"}`;

    const esc = (s: any) =>
      String(s ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const statusColor = (s: string) => {
      if (s === "DELIVERED" || s === "ON_TIME" || s === "COMPLETED" || s === "ON_TRACK") return "#10B981";
      if (s === "AHEAD")   return "#3B82F6";
      if (s === "PARTIAL") return "#F59E0B";
      return "#EF4444";
    };

    const tableHead = (cols: string[]) =>
      `<tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;

    const lessonRows = lessonData.map((r) =>
      `<tr>
        <td>${esc(r.instructor_name)}</td>
        <td>${esc(formatDbDate(r.delivery_date))}</td>
        <td>${esc(r.module_code ? `[${r.module_code}] ${r.module_name ?? ""}` : r.module_name)}</td>
        <td>${esc(r.topic)}</td>
        <td><span class="badge" style="background:${statusColor(r.status)}20;color:${statusColor(r.status)};border:1px solid ${statusColor(r.status)}40">${esc(r.status)}</span></td>
        <td><span class="badge" style="background:${statusColor(r.schedule_flag)}20;color:${statusColor(r.schedule_flag)};border:1px solid ${statusColor(r.schedule_flag)}40">${esc(r.schedule_flag?.replace("_", " "))}</span></td>
        <td>${esc(r.attendance_count)}</td>
        <td>${r.completion_rate != null ? `${r.completion_rate}%` : "—"}</td>
        <td class="notes">${esc(r.reflection_notes)}</td>
      </tr>`
    ).join("");

    const mentorshipRows = mentorshipData.map((r) =>
      `<tr>
        <td>${esc(r.instructor_name)}</td>
        <td>${esc(formatDbDate(r.session_date))}</td>
        <td>${esc(r.student_name)}</td>
        <td>${r.duration_minutes != null ? `${r.duration_minutes} min` : "—"}</td>
        <td>${esc(r.wellbeing_status)}</td>
        <td class="notes">${esc(r.notes)}</td>
      </tr>`
    ).join("");

    const projectRows = projectData.map((r) =>
      `<tr>
        <td>${esc(r.instructor_name)}</td>
        <td>${esc(r.project_name)}</td>
        <td>${esc(r.role)}</td>
        <td>${esc(r.status)}</td>
        <td class="notes">${esc(r.work_completed)}</td>
        <td class="notes">${esc(r.key_outputs)}</td>
      </tr>`
    ).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Instructor Activity Report — ${esc(period)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1f2937;background:#fff;padding:24px}
  h1{font-size:18px;font-weight:800;color:#111827;margin-bottom:4px}
  .subtitle{font-size:11px;color:#6b7280;margin-bottom:20px}
  .section{margin-bottom:28px}
  .section-title{font-size:13px;font-weight:700;color:#1d4ed8;border-bottom:2px solid #dbeafe;padding-bottom:6px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th{background:#f3f4f6;color:#374151;font-weight:700;text-align:left;padding:6px 8px;border:1px solid #e5e7eb;font-size:9px;text-transform:uppercase;letter-spacing:.04em}
  td{padding:5px 8px;border:1px solid #e5e7eb;vertical-align:top}
  tr:nth-child(even) td{background:#f9fafb}
  .notes{max-width:200px;white-space:pre-wrap;word-break:break-word}
  .badge{display:inline-block;padding:1px 7px;border-radius:20px;font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
  .summary-grid{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
  .summary-box{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;min-width:100px}
  .summary-box .val{font-size:22px;font-weight:800;color:#1d4ed8}
  .summary-box .lbl{font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
  .empty{color:#9ca3af;font-style:italic;padding:12px}
  @media print{body{padding:12px}@page{margin:1.5cm}}
</style>
</head>
<body>
<h1>Instructor Activity Report</h1>
<p class="subtitle">Period: ${esc(period)}</p>

<div class="summary-grid">
  <div class="summary-box"><div class="val">${lessonData.length}</div><div class="lbl">Lesson Reports</div></div>
  <div class="summary-box"><div class="val">${lessonData.filter((l: any) => l.status === "DELIVERED").length}</div><div class="lbl">Delivered</div></div>
  <div class="summary-box"><div class="val">${mentorshipData.length}</div><div class="lbl">Mentorship Sessions</div></div>
  <div class="summary-box"><div class="val">${projectData.length}</div><div class="lbl">Project Updates</div></div>
</div>

${needsLessons ? `
<div class="section">
  <div class="section-title">Lesson Delivery Logs</div>
  ${lessonData.length > 0 ? `<table>
    <thead>${tableHead(["Instructor","Date","Module","Topic","Status","Schedule","Attendance","Completion","Reflection"])}</thead>
    <tbody>${lessonRows}</tbody>
  </table>` : `<p class="empty">No lesson reports for this period.</p>`}
</div>` : ""}

${needsMentorship ? `
<div class="section">
  <div class="section-title">Mentorship Sessions</div>
  ${mentorshipData.length > 0 ? `<table>
    <thead>${tableHead(["Instructor","Date","Student","Duration","Wellbeing","Notes"])}</thead>
    <tbody>${mentorshipRows}</tbody>
  </table>` : `<p class="empty">No mentorship sessions for this period.</p>`}
</div>` : ""}

${needsProjects ? `
<div class="section">
  <div class="section-title">Project Updates</div>
  ${projectData.length > 0 ? `<table>
    <thead>${tableHead(["Instructor","Project","Role","Status","Work Completed","Key Outputs"])}</thead>
    <tbody>${projectRows}</tbody>
  </table>` : `<p class="empty">No project updates found.</p>`}
</div>` : ""}

<p style="color:#9ca3af;font-size:9px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:8px">
  Generated on ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} — NGA Central MIS
</p>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  let headers: string[] = [];
  let rows: (string | number | null)[][] = [];

  if (category === "unified") {
    headers = ["Category", "ID", "Instructor", "Date", "Status", "Schedule / Duration", "Module / Project", "Topic / Student", "Attendance / Role", "Notes"];
    rows = [
      ...lessonData.map((r) => [
        "Lesson",
        r.lesson_report_id,
        r.instructor_name,
        formatDbDate(r.delivery_date),
        r.status,
        r.schedule_flag,
        r.module_code ? `[${r.module_code}] ${r.module_name ?? ""}` : (r.module_name ?? ""),
        r.topic ?? "",
        r.attendance_count ?? "",
        (r.reflection_notes ?? "").replace(/"/g, '""'),
      ]),
      ...mentorshipData.map((r) => [
        "Mentorship",
        r.mentorship_id,
        r.instructor_name,
        formatDbDate(r.session_date),
        "",
        r.duration_minutes ? `${r.duration_minutes} min` : "",
        "",
        r.student_name ?? "",
        "",
        (r.notes ?? "").replace(/"/g, '""'),
      ]),
      ...projectData.map((r) => [
        "Project",
        r.project_update_id,
        r.instructor_name,
        "",
        r.status ?? "",
        "",
        r.project_name ?? "",
        "",
        r.role ?? "",
        (r.work_completed ?? "").replace(/"/g, '""'),
      ]),
    ];
  } else if (category === "lessons") {
    headers = ["ID", "Instructor", "Delivery Date", "Status", "Schedule", "Attendance", "Completion %", "Module", "Topic", "Reflection"];
    rows = lessonData.map((r) => [
      r.lesson_report_id,
      r.instructor_name,
      formatDbDate(r.delivery_date),
      r.status,
      r.schedule_flag,
      r.attendance_count ?? "",
      r.completion_rate  ?? "",
      r.module_code ? `[${r.module_code}] ${r.module_name ?? ""}` : (r.module_name ?? ""),
      r.topic ?? "",
      (r.reflection_notes ?? "").replace(/"/g, '""'),
    ]);
  } else if (category === "mentorship") {
    headers = ["ID", "Instructor", "Session Date", "Student", "Duration (min)", "Wellbeing", "Notes"];
    rows = mentorshipData.map((r) => [
      r.mentorship_id,
      r.instructor_name,
      formatDbDate(r.session_date),
      r.student_name ?? "",
      r.duration_minutes ?? "",
      r.wellbeing_status ?? "",
      (r.notes ?? "").replace(/"/g, '""'),
    ]);
  } else if (category === "projects") {
    headers = ["ID", "Instructor", "Project", "Role", "Status", "Work Completed", "Key Outputs"];
    rows = projectData.map((r) => [
      r.project_update_id,
      r.instructor_name,
      r.project_name ?? "",
      r.role ?? "",
      r.status ?? "",
      (r.work_completed ?? "").replace(/"/g, '""'),
      (r.key_outputs ?? "").replace(/"/g, '""'),
    ]);
  } else {
    throw new ValidationError("category must be lessons, mentorship, projects, or unified");
  }

  const csvLines = [
    headers.map((h) => `"${h}"`).join(","),
    ...rows.map((row) =>
      row.map((cell) =>
        typeof cell === "string" ? `"${cell}"` : String(cell ?? ""),
      ).join(","),
    ),
  ];

  const filename = `report-${category}-${start_date ?? "all"}-to-${end_date ?? "all"}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csvLines.join("\n"));
});
