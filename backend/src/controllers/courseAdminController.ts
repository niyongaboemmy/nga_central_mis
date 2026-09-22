import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  AcademicTerm,
  ClassGroup,
  Course,
  CourseItem,
  CourseItemProgress,
  CourseSection,
  Grade,
  LearningEvent,
  Program,
  SchemeOfWork,
  Subject,
  UserProfile,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { AuthorizationError, ValidationError } from "../errors/CustomError";
import { resolveUserScope, UserScope } from "../services/userScope";
import { academicYearOfTerm, assertCanBuildCourse, loadCourse, CourseRow } from "../services/elearning/courseMembership";
import { buildCourseAnalytics } from "./courseAnalyticsController";
import { courseMasteryMatrix, studentMastery } from "../services/elearning/courseMastery";
import { courseCoverage } from "../services/elearning/courseCoverage";

const parseId = (raw: unknown, label = "id"): number => {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) throw new ValidationError(`Invalid ${label}`);
  return n;
};

/**
 * Super admins see everything; programme leads / class teachers only their scope
 * (services/userScope), resolved for the course's own academic year — a lead's programme
 * assignment is per year, so "current year" would be wrong for last term's course.
 */
async function assertCourseInScope(course: CourseRow, userId: number) {
  const scope: UserScope = await resolveUserScope(userId, await academicYearOfTerm(course.academic_term_id));
  if (!scope.scoped) return;
  if (!scope.classGroupIds.includes(course.class_group_id)) throw new AuthorizationError("This course is outside your scope");
}

/**
 * `GET /admin/courses` — the digital-delivery register (plan §3.3): every scheme of the
 * selected year/term, whether it has a course, how much is published, and class engagement.
 */
export const listCoursesRegister = asyncHandler(async (req: any, res: any) => {
  const yearId = req.query.academic_year_id ? parseId(req.query.academic_year_id, "academic year") : undefined;
  const termId = req.query.academic_term_id ? parseId(req.query.academic_term_id, "academic term") : undefined;
  const programId = req.query.program_id ? parseId(req.query.program_id, "program") : undefined;
  const gradeId = req.query.grade_id ? parseId(req.query.grade_id, "grade") : undefined;
  const subjectId = req.query.subject_id ? parseId(req.query.subject_id, "subject") : undefined;
  const scope = await resolveUserScope(req.user.userId, yearId ?? null);

  const rows = await db
    .select({
      scheme_id: SchemeOfWork.scheme_id,
      validation_status: SchemeOfWork.validation_status,
      subject_id: Subject.subject_id,
      subject_name: Subject.name,
      subject_code: Subject.code,
      subject_color: Subject.color,
      class_group_id: ClassGroup.class_group_id,
      class_group_name: ClassGroup.name,
      grade_id: Grade.grade_id,
      grade_name: Grade.name,
      program_id: Program.program_id,
      program_name: Program.name,
      academic_term_id: AcademicTerm.academic_term_id,
      term_name: AcademicTerm.name,
      academic_year_id: AcademicTerm.academic_year_id,
      teacher_id: SchemeOfWork.user_id,
      teacher_first: UserProfile.first_name,
      teacher_last: UserProfile.last_name,
      course: Course,
    })
    .from(SchemeOfWork)
    .innerJoin(Subject, eq(Subject.subject_id, SchemeOfWork.subject_id))
    .innerJoin(ClassGroup, eq(ClassGroup.class_group_id, SchemeOfWork.class_group_id))
    .innerJoin(Grade, eq(Grade.grade_id, ClassGroup.grade_id))
    .innerJoin(Program, eq(Program.program_id, Grade.program_id))
    .innerJoin(AcademicTerm, eq(AcademicTerm.academic_term_id, SchemeOfWork.academic_term_id))
    .leftJoin(UserProfile, eq(UserProfile.user_id, SchemeOfWork.user_id))
    .leftJoin(Course, eq(Course.scheme_id, SchemeOfWork.scheme_id))
    .where(
      and(
        yearId ? eq(AcademicTerm.academic_year_id, yearId) : undefined,
        termId ? eq(SchemeOfWork.academic_term_id, termId) : undefined,
        programId ? eq(Program.program_id, programId) : undefined,
        gradeId ? eq(Grade.grade_id, gradeId) : undefined,
        subjectId ? eq(Subject.subject_id, subjectId) : undefined,
        scope.scoped ? (scope.classGroupIds.length ? inArray(ClassGroup.class_group_id, scope.classGroupIds) : sql`1 = 0`) : undefined,
      ),
    )
    .orderBy(desc(AcademicTerm.academic_year_id), Program.name, Grade.name, Subject.name);

  const courseIds = rows.map((r) => r.course?.course_id).filter((n): n is number => !!n);
  const [sectionStats, itemStats, engagement] = await Promise.all([
    courseIds.length
      ? db
          .select({
            course_id: CourseSection.course_id,
            sections: sql<number>`COUNT(*)`,
            published: sql<number>`SUM(CASE WHEN ${CourseSection.status} = 'PUBLISHED' THEN 1 ELSE 0 END)`,
          })
          .from(CourseSection)
          .where(inArray(CourseSection.course_id, courseIds))
          .groupBy(CourseSection.course_id)
      : [],
    courseIds.length
      ? db
          .select({ course_id: CourseSection.course_id, items: sql<number>`COUNT(${CourseItem.item_id})` })
          .from(CourseSection)
          .leftJoin(CourseItem, eq(CourseItem.section_id, CourseSection.section_id))
          .where(inArray(CourseSection.course_id, courseIds))
          .groupBy(CourseSection.course_id)
      : [],
    courseIds.length
      ? db
          .select({
            course_id: CourseSection.course_id,
            active_students: sql<number>`COUNT(DISTINCT ${CourseItemProgress.user_id})`,
            completed_items: sql<number>`SUM(CASE WHEN ${CourseItemProgress.state} = 'COMPLETED' THEN 1 ELSE 0 END)`,
            last_activity: sql<Date | null>`MAX(${CourseItemProgress.last_viewed_at})`,
          })
          .from(CourseItemProgress)
          .innerJoin(CourseItem, eq(CourseItem.item_id, CourseItemProgress.item_id))
          .innerJoin(CourseSection, eq(CourseSection.section_id, CourseItem.section_id))
          .where(inArray(CourseSection.course_id, courseIds))
          .groupBy(CourseSection.course_id)
      : [],
  ]);
  // Curriculum coverage per course (targets planned by the scheme vs items that address them).
  const coverageBy = new Map<number, number>();
  for (const r of rows) {
    if (!r.course) continue;
    try {
      coverageBy.set(r.course.course_id, (await courseCoverage(r.course)).coverage_pct);
    } catch {
      /* a course with no curriculum simply shows 0 */
    }
  }
  const sec = new Map(sectionStats.map((s) => [s.course_id, s]));
  const items = new Map(itemStats.map((s) => [s.course_id, s]));
  const eng = new Map(engagement.map((s) => [s.course_id, s]));

  const register = rows.map((r) => {
    const c = r.course;
    const s = c ? sec.get(c.course_id) : undefined;
    return {
      scheme_id: r.scheme_id,
      scheme_validation_status: r.validation_status,
      subject_id: r.subject_id,
      subject_name: r.subject_name,
      subject_code: r.subject_code,
      subject_color: r.subject_color,
      class_group_id: r.class_group_id,
      class_group_name: r.class_group_name,
      grade_name: r.grade_name,
      program_name: r.program_name,
      term_name: r.term_name,
      academic_year_id: r.academic_year_id,
      teacher_id: r.teacher_id,
      teacher_name: `${r.teacher_first || ""} ${r.teacher_last || ""}`.trim(),
      course_id: c?.course_id ?? null,
      course_status: c?.status ?? null,
      sections: Number(s?.sections || 0),
      published_sections: Number(s?.published || 0),
      published_pct: s && Number(s.sections) ? Math.round((Number(s.published) / Number(s.sections)) * 100) : 0,
      items: Number((c && items.get(c.course_id)?.items) || 0),
      coverage_pct: c ? coverageBy.get(c.course_id) ?? 0 : 0,
      active_students: Number((c && eng.get(c.course_id)?.active_students) || 0),
      completed_items: Number((c && eng.get(c.course_id)?.completed_items) || 0),
      last_activity_at: (c && eng.get(c.course_id)?.last_activity) || null,
      updated_at: c?.updated_at ?? null,
    };
  });

  const withCourse = register.filter((r) => r.course_id);
  const live = withCourse.filter((r) => r.course_status === "PUBLISHED");
  const approved = register.filter((r) => r.scheme_validation_status === "APPROVED");
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  successResponse(res, "Register", {
    kpis: {
      schemes: register.length,
      courses: withCourse.length,
      courses_live: live.length,
      approved_schemes_with_live_course_pct: approved.length ? Math.round((approved.filter((r) => r.course_status === "PUBLISHED").length / approved.length) * 100) : 0,
      students_active_this_week: register.filter((r) => r.last_activity_at && new Date(r.last_activity_at) >= weekAgo).reduce((n, r) => n + r.active_students, 0),
      median_published_pct: live.length ? live.map((r) => r.published_pct).sort((a, b) => a - b)[Math.floor(live.length / 2)] : 0,
      median_coverage_pct: live.length ? live.map((r) => r.coverage_pct).sort((a, b) => a - b)[Math.floor(live.length / 2)] : 0,
    },
    rows: register,
    scoped: scope.scoped,
  });
});

export const adminCourseAnalytics = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  await assertCourseInScope(course, req.user.userId);
  successResponse(res, "Analytics", await buildCourseAnalytics(course));
});

export const adminCourseCoverage = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  await assertCourseInScope(course, req.user.userId);
  successResponse(res, "Coverage", await courseCoverage(course));
});

export const adminCourseMastery = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  await assertCourseInScope(course, req.user.userId);
  successResponse(res, "Mastery", await courseMasteryMatrix(course));
});

/** Teacher-side mastery matrix (same payload, builder scoping). */
export const teacherCourseMastery = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  await assertCanBuildCourse(course, req.user.userId);
  successResponse(res, "Mastery", await courseMasteryMatrix(course));
});

/** Student's own mastery page. */
export const myMastery = asyncHandler(async (req: any, res: any) => {
  successResponse(res, "My mastery", await studentMastery(req.user.userId));
});

/** Opt-in personal weekly streak: consecutive ISO weeks with at least one COMPLETED event. */
export const myStreak = asyncHandler(async (req: any, res: any) => {
  const rows = await db
    .select({ occurred_at: LearningEvent.occurred_at })
    .from(LearningEvent)
    .where(and(eq(LearningEvent.actor_user_id, req.user.userId), eq(LearningEvent.verb, "COMPLETED")))
    .orderBy(desc(LearningEvent.occurred_at))
    .limit(500);
  const weekKey = (d: Date) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return `${t.getUTCFullYear()}-${Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)}`;
  };
  const weeks = new Set(rows.map((r) => weekKey(new Date(r.occurred_at))));
  const thisWeek = weekKey(new Date());
  let streak = 0;
  const cursor = new Date();
  // Forgiving: the current week counts if active, otherwise we start counting from last week.
  if (!weeks.has(thisWeek)) cursor.setDate(cursor.getDate() - 7);
  while (weeks.has(weekKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }
  successResponse(res, "Streak", { weeks: streak, this_week: weeks.has(thisWeek) });
});

/**
 * Per-course student progress report (CSV): completion, time, status, criteria covered/shown.
 * Available to the course's teacher and to oversight roles in scope.
 */
export const courseProgressReportCsv = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  const perms: string[] = req.user.permissions || [];
  if (perms.includes("VIEW_ALL_COURSES")) await assertCourseInScope(course, req.user.userId);
  else await assertCanBuildCourse(course, req.user.userId);
  const [analytics, matrix] = await Promise.all([buildCourseAnalytics(course), courseMasteryMatrix(course)]);
  const masteryBy = new Map(matrix.students.map((s) => [s.user_id, s]));
  const head = ["Student", "Status", "Completed", "Required", "Percent", "Overdue", "Minutes", "Last seen", "Criteria covered", "Criteria shown", `Criteria total (${matrix.criteria_total})`];
  const lines = analytics.students.map((s) => {
    const m = masteryBy.get(s.user_id);
    return [s.name, s.status, s.required_done, s.required_total, s.percent, s.overdue, Math.round(s.seconds_spent / 60), s.last_seen_at ? new Date(s.last_seen_at).toISOString().slice(0, 10) : "", m?.covered ?? 0, m?.demonstrated ?? 0, matrix.criteria_total];
  });
  const csv = [head, ...lines].map((row: any[]) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="course-${course.course_id}-progress.csv"`);
  res.send(csv);
});

/** CSV export of the register (Excel opens it directly). */
export const exportRegisterCsv = asyncHandler(async (req: any, res: any) => {
  // Reuse the register handler by faking a response object.
  const data: any = await new Promise((resolve, reject) => {
    const fake: any = { status: () => fake, json: (body: any) => resolve(body.data) };
    (listCoursesRegister as any)(req, fake, reject);
  });
  const head = ["Program", "Grade", "Class group", "Subject", "Term", "Teacher", "Scheme status", "Course", "Weeks live", "Items", "Curriculum coverage %", "Active students", "Completed items", "Last activity"];
  const lines = data.rows.map((r: any) => [
    r.program_name, r.grade_name, r.class_group_name, r.subject_name, r.term_name, r.teacher_name, r.scheme_validation_status,
    r.course_status || "none", `${r.published_sections}/${r.sections}`, r.items, r.coverage_pct, r.active_students, r.completed_items,
    r.last_activity_at ? new Date(r.last_activity_at).toISOString().slice(0, 10) : "",
  ]);
  const csv = [head, ...lines].map((row: any[]) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="elearning-register.csv"');
  res.send(csv);
});
