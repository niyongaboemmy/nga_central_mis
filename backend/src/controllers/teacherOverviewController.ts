import { db } from "../db";
import { and, desc, eq } from "drizzle-orm";
import {
  ClassGroup,
  Course,
  LessonNote,
  Subject,
  UserProfile,
} from "../db/schema";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import { countTeacherStudents } from "../services/teacherRoster";
import {
  loadSchemeStatus,
  loadTeacherAssignments,
} from "../services/teacherSchemes";
import logger from "../utils/logger";
import { resolvePeriod } from "../services/academicPeriod";
import {
  loadAssignedActivities,
  loadTeacherLessons,
} from "./calendarController";

// ============================================================================
// Teacher overview — everything the Teacher Dashboard shows, in one request.
//
// The page is a "what do I need to do today" board, so it deliberately mixes
// three kinds of data that otherwise live in three modules: the timetable
// (calendar), the paperwork that can fall behind (schemes of work, lesson
// notes, e-learning courses), and the roster figures. Assembling it here
// keeps the dashboard to a single round-trip and, more importantly, lets the
// timetable slice reuse the calendar module's own "what is a live lesson"
// rules (loadTeacherLessons) instead of inventing a second, divergent answer.
// ============================================================================

export interface TeacherLessonToday {
  slot_id: number;
  subject_id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_group_name: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  color: string | null;
}

/**
 * An optional panel must not be able to take the whole board down.
 *
 * This endpoint fans out over six modules. Without this, one failing
 * side-panel query — a table an environment hasn't migrated yet, a timeout on
 * a slow join — turns the entire dashboard into an error page, including the
 * timetable and the alerts that are the reason to open it. The core sections
 * (period, assignments, schedule, schemes) stay fatal; the rest degrade to
 * empty and say so in the log.
 */
const optional = <T>(
  work: Promise<T>,
  fallback: T,
  panel: string,
): Promise<T> =>
  work.catch((error) => {
    logger.warn("Teacher overview panel failed; serving it empty", {
      panel,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  });

/** "HH:MM[:SS]" -> minutes since midnight. */
const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Whole days from today to `date`, or null when there is no date. */
const daysUntil = (date: Date | string | null): number | null => {
  if (!date) return null;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round(
    (target.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000),
  );
};

export const getTeacherOverview = asyncHandler(async (req: any, res: any) => {
  const teacherId = req.user.userId;
  const queryYearId = req.query.academic_year_id
    ? parseInt(req.query.academic_year_id)
    : undefined;
  const queryTermId = req.query.academic_term_id
    ? parseInt(req.query.academic_term_id)
    : undefined;

  const { term, year } = await resolvePeriod(queryYearId, queryTermId);
  const termId = term?.academic_term_id ?? null;
  const yearId = year?.academic_year_id ?? null;

  // ── Wave 1: everything that needs only the resolved period ──────────────
  //
  // This endpoint is an aggregate of six modules, and awaiting each query in
  // turn made it ~15 strictly serial round-trips. The API runs on a
  // deliberately single-connection pool (see db/index.ts), so those round
  // trips queue behind every other request on the box — the endpoint answered
  // fine on an idle server and blew the client's 10s timeout on a busy one.
  // Independent work is now issued in waves, each wave's queries dispatched
  // together, so the driver can pipeline them instead of the controller
  // idling between every await.
  const [profileRows, assignments, weekLessons, activities, courseRows] =
    await Promise.all([
      db
        .select({
          first_name: UserProfile.first_name,
          last_name: UserProfile.last_name,
        })
        .from(UserProfile)
        .where(eq(UserProfile.user_id, teacherId))
        .limit(1),

      // Assignments: the source of truth for what this teacher teaches.
      loadTeacherAssignments(teacherId, yearId),

      // Timetable slice — the same rules the weekly grid uses, so the
      // dashboard can never advertise a lesson the timetable no longer draws.
      termId != null
        ? loadTeacherLessons({ userId: teacherId, termId, yearId })
        : Promise.resolve([] as any[]),

      // Non-subject events (duties, meetings, exams) assigned to this teacher.
      termId != null
        ? optional(
            loadAssignedActivities({
              userId: teacherId,
              termId,
              classGroupId: null,
            }),
            [] as any[],
            "activities",
          )
        : Promise.resolve([] as any[]),

      termId != null
        ? optional(
            db
              .select({
                course_id: Course.course_id,
                title: Course.title,
                status: Course.status,
                updated_at: Course.updated_at,
                subject_name: Subject.name,
                class_group_name: ClassGroup.name,
              })
              .from(Course)
              .leftJoin(Subject, eq(Course.subject_id, Subject.subject_id))
              .leftJoin(
                ClassGroup,
                eq(Course.class_group_id, ClassGroup.class_group_id),
              )
              .where(
                and(
                  eq(Course.owner_user_id, teacherId),
                  eq(Course.academic_term_id, termId),
                ),
              )
              .orderBy(desc(Course.updated_at)),
            [] as any[],
            "courses",
          )
        : Promise.resolve([] as any[]),
    ]);

  const [profile] = profileRows;
  const subjectIds = [...new Set(assignments.map((a: any) => a.subject_id))];
  const classGroupIds = [
    ...new Set(assignments.map((a: any) => a.class_group_id)),
  ];

  const today = new Date();
  const todayDow = today.getDay();
  const nowMinutes = today.getHours() * 60 + today.getMinutes();

  const sortByStart = <T extends { start_time: string }>(rows: T[]) =>
    [...rows].sort(
      (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time),
    );

  const toLesson = (slot: any): TeacherLessonToday => ({
    slot_id: slot.slot_id,
    subject_id: slot.subject_id,
    subject_name: slot.subject_name,
    subject_code: slot.subject_code,
    class_group_name: slot.class_group_name,
    start_time: slot.start_time,
    end_time: slot.end_time,
    location: slot.location,
    color: slot.color,
  });

  const todayLessons = sortByStart(
    weekLessons.filter((s: any) => s.day_of_week === todayDow),
  ).map(toLesson);

  // Tomorrow wraps to the next weekday that actually has lessons, so a Friday
  // afternoon shows Monday's load rather than an empty "tomorrow".
  let nextTeachingDay: {
    day_of_week: number;
    lessons: TeacherLessonToday[];
  } | null = null;
  for (let offset = 1; offset <= 7; offset++) {
    const dow = (todayDow + offset) % 7;
    const lessons = sortByStart(
      weekLessons.filter((s: any) => s.day_of_week === dow),
    ).map(toLesson);
    if (lessons.length > 0) {
      nextTeachingDay = { day_of_week: dow, lessons };
      break;
    }
  }

  const currentLesson =
    todayLessons.find(
      (l) =>
        timeToMinutes(l.start_time) <= nowMinutes &&
        timeToMinutes(l.end_time) > nowMinutes,
    ) ?? null;

  const nextLessonToday =
    todayLessons.find((l) => timeToMinutes(l.start_time) > nowMinutes) ?? null;

  // Periods per weekday, for the "teaching load" strip.
  const weekLoad = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
    day_of_week: dow,
    periods: weekLessons.filter((s: any) => s.day_of_week === dow).length,
  }));

  const weeklyMinutes = weekLessons.reduce(
    (total: number, slot: any) =>
      total +
      Math.max(
        0,
        timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time),
      ),
    0,
  );

  const todayActivities = activities.filter(
    (a: any) => a.day_of_week === null || a.day_of_week === todayDow,
  );

  // ── Wave 2: everything that needed the assignments ──────────────────────
  //
  // Schemes of work: one row per assignment. A missing SchemeOfWork is the
  // thing the teacher has to act on, so the list is built from assignments
  // outward, not from the schemes that happen to exist. The validation
  // verdict lives on the scheme's first entry (see
  // getAllTeachersSchemeOfWork) — mirrored here so the two screens can't
  // disagree.
  const [totalStudents, schemes, noteRows] = await Promise.all([
    assignments.length > 0 && yearId
      ? countTeacherStudents(teacherId, yearId)
      : Promise.resolve(0),

    loadSchemeStatus({ teacherId, termId, assignments }),

    subjectIds.length > 0
      ? optional(
          db
            .select({
              note_id: LessonNote.note_id,
              title: LessonNote.title,
              status: LessonNote.status,
              updated_at: LessonNote.updated_at,
              subject_name: Subject.name,
              class_group_name: ClassGroup.name,
            })
            .from(LessonNote)
            .leftJoin(Subject, eq(LessonNote.subject_id, Subject.subject_id))
            .leftJoin(
              ClassGroup,
              eq(LessonNote.class_group_id, ClassGroup.class_group_id),
            )
            .where(
              termId != null
                ? and(
                    eq(LessonNote.user_id, teacherId),
                    eq(LessonNote.academic_term_id, termId),
                  )
                : eq(LessonNote.user_id, teacherId),
            )
            .orderBy(desc(LessonNote.updated_at)),
          [] as any[],
          "lesson-notes",
        )
      : Promise.resolve([] as any[]),
  ]);

  // `schemes` already carries entry counts and validation verdicts — the
  // shared service resolves both, so the dashboard and the Scheme of Work
  // list can never report a different figure for the same scheme.
  const schemeRows = schemes;

  // Lesson notes and courses were both fetched in the waves above.
  const draftNotes = noteRows.filter((n: any) => n.status === "DRAFT");

  successResponse(res, "Teacher overview retrieved successfully", {
    teacher: {
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
    },
    period: {
      academic_year_id: yearId,
      academic_year_name: year?.name ?? null,
      academic_term_id: termId,
      academic_term_name: term?.name ?? null,
      term_start_date: term?.start_date ?? null,
      term_end_date: term?.end_date ?? null,
      days_remaining_in_term: daysUntil(term?.end_date ?? null),
    },
    kpis: {
      assignedSubjects: subjectIds.length,
      totalStudents,
      assignedClassGroups: classGroupIds.length,
      weeklyPeriods: weekLessons.length,
      weeklyMinutes,
    },
    schedule: {
      server_day_of_week: todayDow,
      today: todayLessons,
      today_activities: todayActivities,
      current_lesson: currentLesson,
      next_lesson_today: nextLessonToday,
      next_teaching_day: nextTeachingDay,
      week_load: weekLoad,
    },
    classes: assignments.map((a) => ({
      subject_id: a.subject_id,
      subject_name: a.subject_name,
      subject_code: a.subject_code,
      subject_color: a.subject_color,
      class_group_id: a.class_group_id,
      class_group_name: a.class_group_name,
      grade_name: a.grade_name,
      periods_per_week: weekLessons.filter(
        (s: any) =>
          s.subject_id === a.subject_id &&
          s.class_group_id === a.class_group_id,
      ).length,
    })),
    schemes: {
      total: schemeRows.length,
      submitted: schemeRows.filter((s) => s.status === "submitted").length,
      pending: schemeRows.filter((s) => s.status === "pending").length,
      approved: schemeRows.filter(
        (s) => s.status === "submitted" && s.validation_status === "APPROVED",
      ).length,
      rejected: schemeRows.filter(
        (s) => s.status === "submitted" && s.validation_status === "REJECTED",
      ).length,
      awaiting_validation: schemeRows.filter(
        (s) => s.status === "submitted" && s.validation_status === "PENDING",
      ).length,
      rows: schemeRows,
    },
    lessonNotes: {
      total: noteRows.length,
      drafts: draftNotes.length,
      published: noteRows.length - draftNotes.length,
      recent_drafts: draftNotes.slice(0, 5),
    },
    courses: {
      total: courseRows.length,
      drafts: courseRows.filter((c) => c.status === "DRAFT").length,
      published: courseRows.filter((c) => c.status === "PUBLISHED").length,
      recent: courseRows.slice(0, 5),
    },
  });
});
