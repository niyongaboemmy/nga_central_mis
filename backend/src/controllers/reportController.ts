import { db } from "../db";
import { eq, and, or, sql, between, desc, count, inArray } from "drizzle-orm";
import {
  InstructorReport,
  ReportTopic,
  ReportLesson,
  MentorshipSession,
  ReportProjectUpdate,
  ReportReflection,
  Subject,
  SchemeOfWork,
  SchemeOfWorkEntry,
  LO_Lesson,
  LO_LearningOutcome,
  User,
  UserProfile,
  AcademicYear,
  AcademicTerm,
  ClassGroup,
  Grade,
  Program,
  TeacherSubjectAssignment,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ValidationError, NotFoundError } from "../errors/CustomError";
import { recordActivity } from "../utils/activityLogger";
import logger from "../utils/logger";

/**
 * Helper to format DB dates to yyyy-MM-dd without timezone shifts
 */
const formatDbDate = (d: any) => {
  if (!d) return null;
  if (typeof d === "string") return d.split("T")[0];
  const dateObj = d as Date;
  // Use UTC methods because mysql2 returns DATE columns as midnight UTC.
  // Using local methods (getFullYear, etc) shifts the date if server is not in UTC.
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Submits a new instructor report with all its components
 */
export const submitReport = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const {
    academic_term_id,
    class_group_id,
    week_number,
    start_date,
    end_date,
    progress_status,
    key_highlights,
    challenges_encountered,
    metrics,
    topics,
    lessons,
    mentorship_sessions,
    project_updates,
    reflections,
  } = req.body;

  if (!start_date || !end_date) {
    throw new ValidationError("Start date and end date are required");
  }

  // 1. Create the main report record
  const reportResult = await db.insert(InstructorReport).values({
    user_id: userId,
    academic_term_id: academic_term_id ? parseInt(academic_term_id) : null,
    class_group_id: class_group_id ? parseInt(class_group_id) : null,
    week_number: week_number ? parseInt(week_number) : null,
    start_date,
    end_date,
    progress_status: progress_status || "ON_TRACK",
    key_highlights,
    challenges_encountered,
    lessons_delivered_count: metrics?.lessons_delivered_count || 0,
    mentorship_sessions_count: metrics?.mentorship_sessions_count || 0,
    active_students_count: metrics?.active_students_count || 0,
    struggling_students_count: metrics?.struggling_students_count || 0,
  });

  const resultHeader = Array.isArray(reportResult)
    ? reportResult[0]
    : reportResult;
  const reportId = (resultHeader as any).insertId;

  // 2. Insert Topics
  if (topics && Array.isArray(topics)) {
    for (const topic of topics) {
      await db.insert(ReportTopic).values({
        report_id: reportId,
        topic_name: topic.topic_name,
        is_planned_for_next_week: topic.is_planned_for_next_week ? 1 : 0,
      });
    }
  }

  // 3. Insert Lessons
  if (lessons && Array.isArray(lessons)) {
    for (const lesson of lessons) {
      await db.insert(ReportLesson).values({
        report_id: reportId,
        lesson_title: lesson.lesson_title,
        planned: lesson.planned ? 1 : 0,
        delivered: lesson.delivered ? 1 : 0,
        notes: lesson.notes,
      });
    }
  }

  // 4. Insert Mentorship Sessions
  if (mentorship_sessions && Array.isArray(mentorship_sessions)) {
    for (const session of mentorship_sessions) {
      const studentIdNum = parseInt(session.student_id);
      const isNumericalId = !isNaN(studentIdNum) && studentIdNum > 0;

      await db.insert(MentorshipSession).values({
        report_id: Number(reportId),
        user_id: Number(userId),
        student_id: isNumericalId ? studentIdNum : null,
        student_name: isNumericalId ? null : session.student_id,
        session_date: session.session_date ? sql`${formatDbDate(session.session_date)}` as any : null,
        duration_minutes: session.duration_minutes
          ? parseInt(session.duration_minutes)
          : null,
        assignment_completion: session.assignment_completion,
        punctuality_attendance: session.punctuality_attendance,
        academic_planning: session.academic_planning,
        next_steps: session.next_steps,
        challenges_identified: session.challenges_identified,
        wellbeing_status: session.wellbeing_status,
        follow_up_required: session.follow_up_required ? 1 : 0,
        notes: session.notes,
      });
    }
  }

  // 5. Insert Project Updates
  if (project_updates && Array.isArray(project_updates)) {
    for (const project of project_updates) {
      await db.insert(ReportProjectUpdate).values({
        report_id: reportId,
        project_name: project.project_name,
        role: project.role,
        work_completed: project.work_completed,
        status: project.status || "ON_TRACK",
        key_outputs: project.key_outputs,
        challenges: project.challenges,
      });
    }
  }

  // 6. Insert Reflections
  if (reflections) {
    await db.insert(ReportReflection).values({
      report_id: reportId,
      what_worked_well: reflections.what_worked_well,
      improvement_areas: reflections.improvement_areas,
      academic_support_needed: reflections.academic_support_needed,
      technical_support_needed: reflections.technical_support_needed,
      infrastructure_support_needed: reflections.infrastructure_support_needed,
      coordination_support_needed: reflections.coordination_support_needed,
    });
  }

  await recordActivity(
    userId,
    "REPORT_SUBMISSION",
    `Submitted instructor report for period ${start_date} to ${end_date}`,
    "InstructorReport",
    reportId,
  );

  successResponse(res, "Report submitted successfully", { reportId }, 201);
});

/**
 * Fetches data for auto-filling the report based on a date range
 */
export const getAutoFillData = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { start_date, end_date, class_group_id, academic_term_id } = req.query;

  if (!start_date || !end_date) {
    throw new ValidationError("Start date and end date are required");
  }

  logger.info(
    `AutoFill Request: start=${start_date}, end=${end_date}, class_group=${class_group_id}, term=${academic_term_id}`,
  );

  // 1. Fetch Teacher's assigned subjects and class groups
  const teacherAssignments = await db
    .select({
      subject_id: TeacherSubjectAssignment.subject_id,
      class_group_id: TeacherSubjectAssignment.class_group_id,
      subject_code: Subject.code,
      class_group_name: ClassGroup.name,
    })
    .from(TeacherSubjectAssignment)
    .innerJoin(
      Subject,
      eq(TeacherSubjectAssignment.subject_id, Subject.subject_id),
    )
    .innerJoin(
      ClassGroup,
      eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
    )
    .where(eq(TeacherSubjectAssignment.user_id, userId));

  let targetClassGroupId = class_group_id ? parseInt(class_group_id) : null;
  if (!targetClassGroupId && teacherAssignments.length > 0) {
    targetClassGroupId = teacherAssignments[0].class_group_id;
  }

  // Filter assignments scope to relevant subjects/codes
  const relevantAssignments = targetClassGroupId
    ? teacherAssignments.filter((a) => a.class_group_id === targetClassGroupId)
    : teacherAssignments;

  const assignedSubjectIds = relevantAssignments.map((a) => a.subject_id);
  const assignedSubjectCodes = relevantAssignments
    .map((a) => a.subject_code)
    .filter(Boolean) as string[];
  const assignedClassGroupNames = relevantAssignments.map(
    (a) => a.class_group_name,
  );

  // 2. Fetch Topics from Scheme of Work (SOW)
  // We look for SOW entries for the subjects assigned to this teacher
  const sowEntries = await db
    .select({
      topic: SchemeOfWorkEntry.topic,
      sub_topic: SchemeOfWorkEntry.sub_topic,
      subject_name: Subject.name,
      subject_code: Subject.code,
      subject_id: Subject.subject_id,
      week_number: SchemeOfWorkEntry.week_number,
    })
    .from(SchemeOfWorkEntry)
    .innerJoin(
      SchemeOfWork,
      eq(SchemeOfWorkEntry.scheme_id, SchemeOfWork.scheme_id),
    )
    .innerJoin(Subject, eq(SchemeOfWork.subject_id, Subject.subject_id))
    .where(
      and(
        assignedSubjectIds.length > 0
          ? inArray(Subject.subject_id, assignedSubjectIds)
          : eq(SchemeOfWork.user_id, userId),
        targetClassGroupId
          ? eq(SchemeOfWork.class_group_id, targetClassGroupId)
          : sql`1=1`,
        academic_term_id
          ? eq(SchemeOfWork.academic_term_id, parseInt(academic_term_id))
          : sql`1=1`,
        sql`DATE_FORMAT(${SchemeOfWorkEntry.start_date}, '%Y-%m-%d') <= ${end_date}`,
        sql`DATE_FORMAT(${SchemeOfWorkEntry.end_date}, '%Y-%m-%d') >= ${start_date}`,
      ),
    );

  logger.info(
    `SOW Entries found: ${sowEntries.length}: ${start_date}: ${end_date}`,
  );
  sowEntries.forEach((e) =>
    logger.info(`  Topic: ${e.topic}, Week: ${e.week_number}`),
  );

  // 3. Fetch Lessons & Learning Outcomes
  // We look for lessons linked to:
  // - The assigned subject IDs (via SOW link)
  // - The specific date range
  // - The matching week number from SOW entries found
  // - Resilient matching by module name containing the subject code

  const activeWeekNumbers = sowEntries
    .map((e) => e.week_number?.replace(/[^0-9]/g, "")) // Extract "10" from "Week 10"
    .filter(Boolean)
    .map((n) => parseInt(n as string));

  const lessonsWithLOs = await db
    .select({
      lesson_id: LO_Lesson.id,
      session_code: LO_Lesson.session_code,
      module_name: LO_Lesson.module_name,
      module_code: LO_Lesson.module_code,
      lesson_date: LO_Lesson.lesson_date,
      big_question: LO_Lesson.big_question,
      lo_title: LO_LearningOutcome.title,
      lo_code: LO_LearningOutcome.code,
      sow_topic: SchemeOfWorkEntry.topic,
      sow_subject_code: Subject.code,
      sow_subject_name: Subject.name,
    })
    .from(LO_Lesson)
    .leftJoin(
      LO_LearningOutcome,
      eq(LO_Lesson.id, LO_LearningOutcome.lesson_id),
    )
    .leftJoin(
      SchemeOfWorkEntry,
      eq(LO_Lesson.entry_id, SchemeOfWorkEntry.entry_id),
    )
    .leftJoin(
      SchemeOfWork,
      eq(SchemeOfWorkEntry.scheme_id, SchemeOfWork.scheme_id),
    )
    .leftJoin(Subject, eq(SchemeOfWork.subject_id, Subject.subject_id))
    .where(
      and(
        or(
          // 1. Exact date match (strongest priority)
          sql`DATE_FORMAT(${LO_Lesson.lesson_date}, '%Y-%m-%d') BETWEEN ${start_date} AND ${end_date}`,
          // 2. Intelligent fallback for lessons WITHOUT a specific date
          and(
            sql`(${LO_Lesson.lesson_date} IS NULL OR DATE_FORMAT(${LO_Lesson.lesson_date}, '%Y-%m-%d') = '')`,
            or(
              // Match by linked SOW entry overlapping with range
              and(
                sql`DATE_FORMAT(${SchemeOfWorkEntry.start_date}, '%Y-%m-%d') <= ${end_date}`,
                sql`DATE_FORMAT(${SchemeOfWorkEntry.end_date}, '%Y-%m-%d') >= ${start_date}`,
              ),
              // Match by week number if we found SOW entries for this range
              activeWeekNumbers.length > 0
                ? inArray(LO_Lesson.week, activeWeekNumbers)
                : sql`0=1`,
            ),
          ),
        ),
        or(
          eq(LO_Lesson.user_id, userId),
          // Flexible matching by subject code in module_name or module_code
          ...(assignedSubjectCodes.length > 0
            ? assignedSubjectCodes.map((code) =>
                or(
                  eq(LO_Lesson.module_code, code),
                  sql`${LO_Lesson.module_name} LIKE ${"%" + code + "%"}`,
                ),
              )
            : [sql`1=1`]),
        ),
      ),
    );

  logger.info(`Lessons with LOs found: ${lessonsWithLOs.length}`);
  lessonsWithLOs.forEach((l) =>
    logger.info(
      `  Lesson: ${l.module_name}, Date: ${l.lesson_date}, SOW Topic: ${l.sow_topic}`,
    ),
  );

  // Group and format lesson entries
  const lessonEntries = lessonsWithLOs.map((l) => {
    let title = `[${l.module_code || "N/A"}] ${l.module_name || ""}`;
    if (l.lo_title) {
      title += `: ${l.lo_code ? l.lo_code + " - " : ""}${l.lo_title}`;
    } else if (l.session_code) {
      title += `: ${l.session_code}`;
    }

    return {
      title,
      date: formatDbDate(l.lesson_date),
      summary: l.big_question,
    };
  });

  // 4. Fetch Mentorship Count
  const mentorshipCount = await db
    .select({ count: count() })
    .from(MentorshipSession)
    .where(
      and(
        eq(MentorshipSession.user_id, userId),
        sql`DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d') BETWEEN ${start_date} AND ${end_date}`,
      ),
    );

  // 5. Build Unified Topics (Prefer SOW Entry linked to Lessons)
  const topicMap = new Map();

  // First, add topics from lessons actually found
  lessonsWithLOs.forEach((l) => {
    if (l.sow_topic) {
      const key = `${l.sow_subject_code}-${l.sow_topic}`;
      if (!topicMap.has(key)) {
        topicMap.set(key, {
          name: l.sow_topic,
          subject: `[${l.sow_subject_code}] ${l.sow_subject_name}`,
        });
      }
    }
  });

  // Then add topics from general SOW query (overlapping range)
  sowEntries.forEach((t) => {
    const key = `${t.subject_code}-${t.topic}`;
    if (!topicMap.has(key)) {
      topicMap.set(key, {
        name: t.topic,
        subject: `[${t.subject_code}] ${t.subject_name}`,
      });
    }
  });

  const finalTopics = Array.from(topicMap.values());

  // 6. Intelligent Status Calculation
  let suggestedStatus = "ON_TRACK";
  const uniqueLessons = new Set(lessonsWithLOs.map((l) => l.lesson_id)).size;
  if (sowEntries.length > uniqueLessons) {
    suggestedStatus = "BEHIND";
  } else if (uniqueLessons === 0 && sowEntries.length === 0) {
    suggestedStatus = "ON_TRACK";
  }

  successResponse(res, "Auto-fill data retrieved successfully", {
    class_group_id: targetClassGroupId,
    topics: finalTopics,
    lessons: lessonEntries,
    metrics: {
      lessons_delivered_count: uniqueLessons,
      mentorship_sessions_count: mentorshipCount[0]?.count || 0,
    },
    suggestedStatus,
  });
});

/**
 * Lists reports with filtering
 */
export const getReports = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { start_date, end_date, user_id, class_group_id } = req.query;

  // Logic: Instructors see only their reports, Admins see all (simplification for now)
  const query = db
    .select({
      report_id: InstructorReport.report_id,
      week_number: InstructorReport.week_number,
      start_date: InstructorReport.start_date,
      end_date: InstructorReport.end_date,
      submission_date: InstructorReport.submission_date,
      progress_status: InstructorReport.progress_status,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
    })
    .from(InstructorReport)
    .innerJoin(UserProfile, eq(InstructorReport.user_id, UserProfile.user_id))
    .where(
      and(
        user_id
          ? eq(InstructorReport.user_id, parseInt(user_id))
          : eq(InstructorReport.user_id, userId),
        start_date
          ? sql`DATE_FORMAT(${InstructorReport.start_date}, '%Y-%m-%d') >= ${start_date}`
          : sql`1=1`,
        end_date
          ? sql`DATE_FORMAT(${InstructorReport.end_date}, '%Y-%m-%d') <= ${end_date}`
          : sql`1=1`,
        class_group_id
          ? eq(InstructorReport.class_group_id, parseInt(class_group_id))
          : sql`1=1`,
      ),
    )
    .orderBy(desc(InstructorReport.submission_date));

  const reports = await query;
  const formattedReports = reports.map((r) => ({
    ...r,
    start_date: formatDbDate(r.start_date),
    end_date: formatDbDate(r.end_date),
  }));

  successResponse(res, "Reports retrieved successfully", formattedReports);
});

/**
 * Gets a single report's full details
 */
export const getReportById = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const reportId = parseInt(id);

  const report = await db
    .select({
      report_id: InstructorReport.report_id,
      user_id: InstructorReport.user_id,
      academic_term_id: InstructorReport.academic_term_id,
      class_group_id: InstructorReport.class_group_id,
      week_number: InstructorReport.week_number,
      start_date: InstructorReport.start_date,
      end_date: InstructorReport.end_date,
      submission_date: InstructorReport.submission_date,
      progress_status: InstructorReport.progress_status,
      key_highlights: InstructorReport.key_highlights,
      challenges_encountered: InstructorReport.challenges_encountered,
      lessons_delivered_count: InstructorReport.lessons_delivered_count,
      mentorship_sessions_count: InstructorReport.mentorship_sessions_count,
      active_students_count: InstructorReport.active_students_count,
      struggling_students_count: InstructorReport.struggling_students_count,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
    })
    .from(InstructorReport)
    .innerJoin(UserProfile, eq(InstructorReport.user_id, UserProfile.user_id))
    .where(eq(InstructorReport.report_id, reportId))
    .limit(1);

  if (report.length === 0) {
    throw new NotFoundError("Report not found");
  }

  const topics = await db
    .select()
    .from(ReportTopic)
    .where(eq(ReportTopic.report_id, reportId));
  const lessons = await db
    .select()
    .from(ReportLesson)
    .where(eq(ReportLesson.report_id, reportId));
  const mentorship = (
    await db
      .select({
        mentorship_id: MentorshipSession.mentorship_id,
        student_id: MentorshipSession.student_id,
        student_name: sql<string>`COALESCE(${MentorshipSession.student_name}, CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name}))`,
        session_date: MentorshipSession.session_date,
        notes: MentorshipSession.notes,
        wellbeing_status: MentorshipSession.wellbeing_status,
      })
      .from(MentorshipSession)
      .leftJoin(UserProfile, eq(MentorshipSession.student_id, UserProfile.user_id))
      .where(eq(MentorshipSession.report_id, reportId))
  ).map((m) => ({
    ...m,
    session_date: formatDbDate(m.session_date),
  }));

  const projectUpdates = await db
    .select()
    .from(ReportProjectUpdate)
    .where(eq(ReportProjectUpdate.report_id, reportId));
  const reflections = await db
    .select()
    .from(ReportReflection)
    .where(eq(ReportReflection.report_id, reportId));

  successResponse(res, "Report details retrieved successfully", {
    ...report[0],
    start_date: formatDbDate(report[0].start_date),
    end_date: formatDbDate(report[0].end_date),
    submission_date: report[0].submission_date,
    topics,
    lessons,
    mentorship,
    project_updates: projectUpdates,
    reflections: reflections[0] || null,
  });
});

/**
 * Gets metrics for the dashboard
 */
export const getDashboardStats = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;

  // Total reports submitted
  const totalReportsCount = await db
    .select({ count: count() })
    .from(InstructorReport)
    .where(eq(InstructorReport.user_id, userId));

  // Total lessons delivered across all reports
  const totalLessons = await db
    .select({ total: sql<number>`SUM(${InstructorReport.lessons_delivered_count})` })
    .from(InstructorReport)
    .where(eq(InstructorReport.user_id, userId));

  // Total mentorship sessions across all reports
  const totalMentorship = await db
    .select({ total: sql<number>`SUM(${InstructorReport.mentorship_sessions_count})` })
    .from(InstructorReport)
    .where(eq(InstructorReport.user_id, userId));

  // Most recent report date
  const lastReport = await db
    .select({ end_date: InstructorReport.end_date })
    .from(InstructorReport)
    .where(eq(InstructorReport.user_id, userId))
    .orderBy(desc(InstructorReport.end_date))
    .limit(1);

  // Recent activity trend (last 8 reports, oldest first for charting)
  const trendRaw = await db
    .select({
      date: InstructorReport.end_date,
      lessons: InstructorReport.lessons_delivered_count,
      mentorship: InstructorReport.mentorship_sessions_count,
    })
    .from(InstructorReport)
    .where(eq(InstructorReport.user_id, userId))
    .orderBy(desc(InstructorReport.end_date))
    .limit(8);

  const trend = trendRaw.reverse().map((r) => ({
    name: formatDbDate(r.date) || '',
    lessons: r.lessons,
    mentorship: r.mentorship,
  }));

  successResponse(res, "Dashboard stats retrieved successfully", {
    totalReports: totalReportsCount[0].count,
    totalLessons: totalLessons[0].total || 0,
    totalMentorship: totalMentorship[0].total || 0,
    lastReportDate: lastReport.length > 0 ? formatDbDate(lastReport[0].end_date) : null,
    trend,
  });
});
/**
 * Checks if a report exists for a specific date (daily report)
 */
export const getReportByDate = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { date } = req.query;

  if (!date) {
    throw new ValidationError("Date is required");
  }

  // Find any report where this date is within its range [start_date, end_date]
  const report = await db
    .select({
      report_id: InstructorReport.report_id,
      start_date: InstructorReport.start_date,
      end_date: InstructorReport.end_date,
    })
    .from(InstructorReport)
    .where(
      and(
        eq(InstructorReport.user_id, userId),
        sql`DATE_FORMAT(${InstructorReport.start_date}, '%Y-%m-%d') <= ${date}`,
        sql`DATE_FORMAT(${InstructorReport.end_date}, '%Y-%m-%d') >= ${date}`,
      ),
    )
    .limit(1);

  successResponse(res, "Report check completed", {
    reported: report.length > 0,
    report:
      report.length > 0
        ? {
            ...report[0],
            start_date: formatDbDate(report[0].start_date),
            end_date: formatDbDate(report[0].end_date),
          }
        : null,
  });
});

/**
 * Updates an existing report
 */
export const updateReport = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const reportId = parseInt(id);

  const {
    academic_term_id,
    class_group_id,
    week_number,
    start_date,
    end_date,
    progress_status,
    key_highlights,
    challenges_encountered,
    metrics,
    topics,
    lessons,
    mentorship_sessions,
    project_updates,
    reflections,
  } = req.body;

  // 1. Verify report exists and belongs to user
  const existing = await db
    .select()
    .from(InstructorReport)
    .where(
      and(
        eq(InstructorReport.report_id, reportId),
        eq(InstructorReport.user_id, userId),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError("Report not found or access denied");
  }

  // 2. Update the main report record
  await db
    .update(InstructorReport)
    .set({
      academic_term_id: academic_term_id ? parseInt(academic_term_id) : null,
      class_group_id: class_group_id ? parseInt(class_group_id) : null,
      week_number: week_number ? parseInt(week_number) : null,
      progress_status: progress_status || "ON_TRACK",
      key_highlights,
      challenges_encountered,
      lessons_delivered_count: metrics?.lessons_delivered_count || 0,
      mentorship_sessions_count: metrics?.mentorship_sessions_count || 0,
      active_students_count: metrics?.active_students_count || 0,
      struggling_students_count: metrics?.struggling_students_count || 0,
    })
    .where(eq(InstructorReport.report_id, reportId));

  // 3. Replace Topics
  await db.delete(ReportTopic).where(eq(ReportTopic.report_id, reportId));
  if (topics && Array.isArray(topics)) {
    for (const topic of topics) {
      await db.insert(ReportTopic).values({
        report_id: reportId,
        topic_name: topic.topic_name,
        is_planned_for_next_week: topic.is_planned_for_next_week ? 1 : 0,
      });
    }
  }

  // 4. Replace Lessons
  await db.delete(ReportLesson).where(eq(ReportLesson.report_id, reportId));
  if (lessons && Array.isArray(lessons)) {
    for (const lesson of lessons) {
      await db.insert(ReportLesson).values({
        report_id: reportId,
        lesson_title: lesson.lesson_title,
        planned: lesson.planned ? 1 : 0,
        delivered: lesson.delivered ? 1 : 0,
        notes: lesson.notes,
      });
    }
  }

  // 5. Replace Mentorship Sessions
  await db
    .delete(MentorshipSession)
    .where(eq(MentorshipSession.report_id, reportId));
  if (mentorship_sessions && Array.isArray(mentorship_sessions)) {
    for (const session of mentorship_sessions) {
      const studentIdNum = parseInt(session.student_id);
      const isNumericalId = !isNaN(studentIdNum) && studentIdNum > 0;

      await db.insert(MentorshipSession).values({
        report_id: Number(reportId),
        user_id: Number(userId),
        student_id: isNumericalId ? studentIdNum : null,
        student_name: isNumericalId ? null : session.student_id,
        session_date: session.session_date ? sql`${formatDbDate(session.session_date)}` as any : null,
        duration_minutes: session.duration_minutes
          ? parseInt(session.duration_minutes)
          : null,
        notes: session.notes,
      });
    }
  }

  // 6. Replace Project Updates
  await db
    .delete(ReportProjectUpdate)
    .where(eq(ReportProjectUpdate.report_id, reportId));
  if (project_updates && Array.isArray(project_updates)) {
    for (const project of project_updates) {
      await db.insert(ReportProjectUpdate).values({
        report_id: reportId,
        project_name: project.project_name,
        role: project.role,
        work_completed: project.work_completed,
        status: project.status || "ON_TRACK",
      });
    }
  }

  // 7. Replace Reflections
  await db.delete(ReportReflection).where(eq(ReportReflection.report_id, reportId));
  if (reflections) {
    await db.insert(ReportReflection).values({
      report_id: reportId,
      what_worked_well: reflections.what_worked_well,
      improvement_areas: reflections.improvement_areas,
      academic_support_needed: reflections.academic_support_needed,
      technical_support_needed: reflections.technical_support_needed,
      infrastructure_support_needed: reflections.infrastructure_support_needed,
      coordination_support_needed: reflections.coordination_support_needed,
    });
  }

  await recordActivity(
    userId,
    "REPORT_UPDATE",
    `Updated instructor report for period ${start_date} to ${end_date}`,
    "InstructorReport",
    reportId,
  );

  successResponse(res, "Report updated successfully", { reportId }, 200);
});

/**
 * Admin: View all submitted reports with filtering
 */
export const getAllAdminReports = asyncHandler(async (req: any, res: any) => {
  const {
    start_date,
    end_date,
    academic_year_id,
    academic_term_id,
    program_id,
    grade_id,
  } = req.query;
  
  logger.info(`Admin Reports Query Params: ${JSON.stringify(req.query)}`);

  const query = db
    .select({
      report_id: InstructorReport.report_id,
      user_id: InstructorReport.user_id,
      instructor_name: sql<string>`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
      academic_year_name: AcademicYear.name,
      academic_term_name: AcademicTerm.name,
      program_name: Program.name,
      grade_name: Grade.name,
      class_group_id: InstructorReport.class_group_id,
      week_number: InstructorReport.week_number,
      start_date: InstructorReport.start_date,
      end_date: InstructorReport.end_date,
      submission_date: InstructorReport.submission_date,
      progress_status: InstructorReport.progress_status,
      lessons_delivered_count: InstructorReport.lessons_delivered_count,
      mentorship_sessions_count: InstructorReport.mentorship_sessions_count,
    })
    .from(InstructorReport)
    .leftJoin(UserProfile, eq(InstructorReport.user_id, UserProfile.user_id))
    .leftJoin(
      AcademicTerm,
      eq(InstructorReport.academic_term_id, AcademicTerm.academic_term_id),
    )
    .leftJoin(
      AcademicYear,
      eq(AcademicTerm.academic_year_id, AcademicYear.academic_year_id),
    )
    .leftJoin(
      ClassGroup,
      eq(InstructorReport.class_group_id, ClassGroup.class_group_id),
    )
    .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .leftJoin(Program, eq(Grade.program_id, Program.program_id))
    .where(
      and(
        start_date
          ? sql`DATE_FORMAT(${InstructorReport.start_date}, '%Y-%m-%d') >= ${start_date}`
          : sql`1=1`,
        end_date
          ? sql`DATE_FORMAT(${InstructorReport.end_date}, '%Y-%m-%d') <= ${end_date}`
          : sql`1=1`,
        academic_year_id
          ? eq(AcademicYear.academic_year_id, parseInt(academic_year_id))
          : sql`1=1`,
        academic_term_id
          ? eq(AcademicTerm.academic_term_id, parseInt(academic_term_id))
          : sql`1=1`,
        program_id ? eq(Program.program_id, parseInt(program_id)) : sql`1=1`,
        grade_id ? eq(Grade.grade_id, parseInt(grade_id)) : sql`1=1`,
      ),
    )
    .orderBy(desc(InstructorReport.submission_date));

  const reports = await query;
  const formattedReports = reports.map((r) => ({
    ...r,
    start_date: formatDbDate(r.start_date),
    end_date: formatDbDate(r.end_date),
  }));

  successResponse(
    res,
    "All submitted reports retrieved successfully",
    formattedReports,
  );
});
