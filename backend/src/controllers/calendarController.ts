import { db } from "../db";
import {
  eq,
  and,
  or,
  sql,
  desc,
  lte,
  gte,
  isNull,
  SQL,
  inArray,
} from "drizzle-orm";
import {
  CalendarSlot,
  CalendarNotification,
  CalendarActivity,
  AcademicCalendar,
  AcademicTerm,
  AcademicYear,
  ClassGroup,
  Grade,
  Subject,
  User,
  UserProfile,
  TeacherSubjectAssignment,
  SchemeOfWork,
  SchemeOfWorkEntry,
  LO_Lesson,
  LO_LearningOutcome,
  LO_LearningOutcomeActivity,
  LO_LearningOutcomeResource,
  LO_LessonSection,
  LO_IndicativeContent,
  LO_LessonAssignment,
  LO_LessonEvaluation,
  StudentSubjectEnrollment,
  StudentClassGroup,
} from "../db/schema";
import { sanitizeString } from "../utils/sanitization";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
} from "../errors/CustomError";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import logger from "../utils/logger";
import { resolveUserScope, isClassGroupInScope } from "../services/userScope";

/**
 * A calendar and every slot on it belong to exactly one class group. A scoped
 * caller (class teacher / program lead) may only write to the class groups
 * named in their own assignments -- being a class teacher of L3 Class A does
 * not confer anything over L3 Class B, even though they share a grade.
 */
const assertClassGroupWritable = async (
  req: any,
  classGroupId: number,
  academicYearId?: number | null,
) => {
  const scope = await resolveUserScope(req.user?.userId, academicYearId);
  if (!isClassGroupInScope(classGroupId, scope)) {
    throw new AuthorizationError(
      "This class group is outside your assigned class groups",
    );
  }
};

/**
 * The same rule applied to reads.
 *
 * Writes have been scope-guarded since 066, but the list endpoints were not:
 * MANAGE_ACADEMIC_CALENDAR is enough to pass `authorize()`, and CLASS_TEACHER
 * holds it, so a class teacher asking for a term's slots got back every class
 * group in the school. Returns the class group ids a caller may read, or null
 * when they are unscoped (an admin) and may read everything.
 *
 * A scoped caller assigned to nothing gets an empty list rather than null --
 * "assigned to nothing" must resolve to no rows, never to all of them.
 */
const readableClassGroupIds = async (
  req: any,
  academicYearId?: number | null,
): Promise<number[] | null> => {
  const scope = await resolveUserScope(req.user?.userId, academicYearId);
  return scope.scoped ? scope.classGroupIds : null;
};

/**
 * The academic year a calendar request is about.
 *
 * Class-teacher assignments are per year, so the scope has to be resolved
 * against the year being *viewed*, not whichever year happens to be flagged
 * current -- otherwise last term's calendar is judged against this year's
 * assignments and the caller silently reads as unscoped.
 */
const academicYearForRequest = async (params: {
  calendarId?: number | null;
  academicTermId?: number | null;
}): Promise<number | undefined> => {
  if (params.calendarId) {
    const [calendar] = await db
      .select({ academic_year_id: AcademicCalendar.academic_year_id })
      .from(AcademicCalendar)
      .where(eq(AcademicCalendar.calendar_id, params.calendarId))
      .limit(1);
    if (calendar?.academic_year_id) return calendar.academic_year_id;
  }

  if (params.academicTermId) {
    const [term] = await db
      .select({ academic_year_id: AcademicTerm.academic_year_id })
      .from(AcademicTerm)
      .where(eq(AcademicTerm.academic_term_id, params.academicTermId))
      .limit(1);
    if (term?.academic_year_id) return term.academic_year_id;
  }

  return undefined;
};

// Helper function to format date for MySQL
const formatDateForMySQL = (dateStr: string | undefined) => {
  if (!dateStr) return null;
  // If it's already in YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
};

// ============================================
// Shared "what is a live lesson" rules
// ============================================

// A slot's term / class group are denormalised copies of its calendar's and
// the two drift (see getCalendarSlots). Every read resolves them the same
// way: the calendar's value wins, the slot's own copy is the fallback for
// rows that predate calendars.
const effectiveTermSql = sql`COALESCE(${AcademicCalendar.academic_term_id}, ${CalendarSlot.academic_term_id})`;
const effectiveClassGroupSql = sql`COALESCE(${AcademicCalendar.class_group_id}, ${CalendarSlot.class_group_id})`;

/**
 * A lesson only exists on a timetable while everything it hangs off is still
 * live: the slot itself, the calendar it sits on, and the subject it teaches.
 * Disabling a subject (Subject.status = DISABLED) or a calendar leaves their
 * slot rows in place, and every read used to keep showing them -- so a
 * retired subject's lessons stayed on teacher and student timetables next to
 * the subject that replaced them, which looked like duplication.
 *
 * Requires the query to have joined AcademicCalendar and Subject.
 */
const liveLessonFilters = (): SQL[] => [
  eq(CalendarSlot.is_active, 1),
  or(isNull(CalendarSlot.calendar_id), eq(AcademicCalendar.is_active, 1))!,
  eq(Subject.status, "ACTIVE"),
];

/**
 * The (subject, class group) pairs a teacher currently teaches in a year --
 * TeacherSubjectAssignment is the source of truth for that, not the user_id
 * stamped on a slot when it was created (see getMyCalendar).
 */
const teacherAssignmentKeys = async (
  userId: number,
  yearId: number,
): Promise<Set<string>> => {
  const assignments = await db
    .select({
      subject_id: TeacherSubjectAssignment.subject_id,
      class_group_id: TeacherSubjectAssignment.class_group_id,
    })
    .from(TeacherSubjectAssignment)
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, userId),
        eq(TeacherSubjectAssignment.academic_year_id, yearId),
      ),
    );
  return new Set(
    assignments.map((a: any) => `${a.subject_id}:${a.class_group_id}`),
  );
};

/**
 * Collapse rows that resolve to the same lesson. The DB's unique_slot key is
 * on the slot's *denormalised* term / class group, so two rows can coexist
 * for one (class group, day, start) once one of them has drifted -- and both
 * came back, drawing the same lesson twice. Prefer the row whose own columns
 * still agree with its calendar (the one the write path's collision check
 * will find), then the newest.
 */
const dedupeLessons = <
  T extends {
    slot_id: number;
    calendar_id: number | null;
    academic_term_id: number | null;
    class_group_id: number | null;
    own_term_id?: number | null;
    own_class_group_id?: number | null;
    day_of_week: number;
    start_time: string;
  },
>(
  slots: T[],
): T[] => {
  const consistent = (s: T) =>
    (s.own_term_id ?? s.academic_term_id) === s.academic_term_id &&
    (s.own_class_group_id ?? s.class_group_id) === s.class_group_id;
  const byKey = new Map<string, T>();
  for (const slot of slots) {
    const key = `${slot.class_group_id}:${slot.day_of_week}:${slot.start_time}`;
    const kept = byKey.get(key);
    if (
      !kept ||
      (consistent(slot) && !consistent(kept)) ||
      (consistent(slot) === consistent(kept) && slot.slot_id > kept.slot_id)
    ) {
      byKey.set(key, slot);
    }
  }
  const keptIds = new Set(Array.from(byKey.values()).map((s) => s.slot_id));
  return slots.filter((s) => keptIds.has(s.slot_id));
};

/** Strip the drift-detection columns dedupeLessons needs off the payload. */
const stripOwnColumns = <T extends object>(slots: T[]) =>
  slots.map(({ own_term_id, own_class_group_id, ...rest }: any) => rest);

/**
 * A teacher's live lessons for a term: slots stamped with their user_id,
 * still backed by a current TeacherSubjectAssignment, on live calendars and
 * subjects, de-duplicated. Shared by my-calendar and the upcoming-lesson
 * notification check so the two can never disagree about what a teacher
 * teaches.
 */
const loadTeacherLessons = async (params: {
  userId: number;
  termId: number;
  yearId: number | null;
  classGroupId?: number | null;
  dayOfWeek?: number | null;
}) => {
  const { userId, termId, yearId, classGroupId, dayOfWeek } = params;

  let assignmentKeys: Set<string> | null = null;
  if (yearId) {
    assignmentKeys = await teacherAssignmentKeys(userId, yearId);
    if (assignmentKeys.size === 0) return [];
  }

  const filters: SQL[] = [
    eq(CalendarSlot.user_id, userId),
    sql`${effectiveTermSql} = ${termId}`,
    ...liveLessonFilters(),
  ];
  if (classGroupId) {
    filters.push(sql`${effectiveClassGroupSql} = ${classGroupId}`);
  }
  if (dayOfWeek !== undefined && dayOfWeek !== null) {
    filters.push(eq(CalendarSlot.day_of_week, dayOfWeek));
  }

  const slots = await db
    .select({
      slot_id: CalendarSlot.slot_id,
      calendar_id: CalendarSlot.calendar_id,
      academic_term_id: sql<number>`${effectiveTermSql}`,
      class_group_id: sql<number>`${effectiveClassGroupSql}`,
      own_term_id: CalendarSlot.academic_term_id,
      own_class_group_id: CalendarSlot.class_group_id,
      subject_id: CalendarSlot.subject_id,
      user_id: CalendarSlot.user_id,
      day_of_week: CalendarSlot.day_of_week,
      start_time: CalendarSlot.start_time,
      end_time: CalendarSlot.end_time,
      location: CalendarSlot.location,
      color: Subject.color,
      notes: CalendarSlot.notes,
      // Related data
      subject_name: Subject.name,
      subject_code: Subject.code,
      class_group_name: ClassGroup.name,
    })
    .from(CalendarSlot)
    .leftJoin(
      AcademicCalendar,
      eq(CalendarSlot.calendar_id, AcademicCalendar.calendar_id),
    )
    .leftJoin(Subject, eq(CalendarSlot.subject_id, Subject.subject_id))
    .leftJoin(
      ClassGroup,
      sql`${ClassGroup.class_group_id} = ${effectiveClassGroupSql}`,
    )
    .where(and(...filters))
    .orderBy(CalendarSlot.day_of_week, CalendarSlot.start_time);

  const assigned = assignmentKeys
    ? slots.filter((slot: any) =>
        assignmentKeys!.has(`${slot.subject_id}:${slot.class_group_id}`),
      )
    : slots;

  return stripOwnColumns(dedupeLessons(assigned));
};

/** "HH:MM" -> minutes since midnight, for interval comparisons. */
const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Refuse a lesson that would run at the same time as another live lesson of
 * the same class group -- not only one that starts at the same minute.
 *
 * unique_slot (and the check above it in createCalendarSlot) only key on
 * start_time, so a 10:50-12:30 lesson slipped in beside a 10:00-11:40 one.
 * The class-group grid never drew the second (its start row sits under the
 * first's rowSpan), so admins could neither see nor delete it, while the
 * teacher whose only lesson there was the hidden one saw it on every
 * timetable -- reported as a "duplicated" slot the calendar didn't have.
 *
 * Same tombstone rule as the start-time check: a soft-deleted row, or one
 * teaching a DISABLED subject, shows nowhere and does not block.
 */
const assertNoOverlappingLesson = async (params: {
  termId: number | null;
  classGroupId: number | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  excludeSlotId?: number | null;
}) => {
  const { termId, classGroupId, dayOfWeek, startTime, endTime, excludeSlotId } =
    params;
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (!(end > start)) {
    throw new ValidationError("End time must be after start time");
  }

  const sameDay = await db
    .select({
      slot_id: CalendarSlot.slot_id,
      start_time: CalendarSlot.start_time,
      end_time: CalendarSlot.end_time,
      subject_name: Subject.name,
    })
    .from(CalendarSlot)
    .leftJoin(Subject, eq(CalendarSlot.subject_id, Subject.subject_id))
    .where(
      and(
        termId === null
          ? isNull(CalendarSlot.academic_term_id)
          : eq(CalendarSlot.academic_term_id, termId),
        classGroupId === null
          ? isNull(CalendarSlot.class_group_id)
          : eq(CalendarSlot.class_group_id, classGroupId),
        eq(CalendarSlot.day_of_week, dayOfWeek),
        eq(CalendarSlot.is_active, 1),
        or(isNull(Subject.status), sql`${Subject.status} <> 'DISABLED'`)!,
      ),
    );

  const clash = sameDay.find(
    (s: any) =>
      s.slot_id !== excludeSlotId &&
      timeToMinutes(s.start_time) < end &&
      timeToMinutes(s.end_time) > start,
  );
  if (clash) {
    throw new ConflictError(
      `This class group already has ${clash.subject_name ?? "a lesson"} ` +
        `at ${clash.start_time}-${clash.end_time} on that day, which overlaps ` +
        `${startTime}-${endTime}`,
    );
  }
};

// ============================================
// Calendar Slot Management (Admin functions)
// ============================================

// Get all calendar slots with filters
export const getCalendarSlots = asyncHandler(async (req: any, res: any) => {
  const { calendar_id, academic_term_id, class_group_id, day_of_week } =
    req.query;
  const user = req.user;

  logger.info("Fetching calendar slots", {
    calendar_id,
    academic_term_id,
    class_group_id,
    day_of_week,
    userId: user?.userId || user?.user_id || user?.id,
  });

  const filters: SQL[] = [];

  // calendar_id is the key the write path uses (see createCalendarSlot's
  // duplicate check), so it is the only filter that is guaranteed to agree
  // with what actually got stored. Asking by calendar also keeps the payload
  // to one grid's worth of slots instead of every slot in the school.
  if (calendar_id) {
    const calendarId = parseInt(calendar_id);
    if (!isNaN(calendarId)) {
      filters.push(eq(CalendarSlot.calendar_id, calendarId));
    }
  }

  // A slot's academic_term_id / class_group_id are denormalised copies of its
  // calendar's. Older rows were written from the request body and can hold a
  // stale (or outright wrong) value, which used to hide them from every read
  // while they still blocked the timeslot on create. Match the calendar's
  // value as well so such a row stays visible and can be fixed or deleted.
  if (academic_term_id) {
    const termId = parseInt(academic_term_id);
    if (!isNaN(termId)) {
      filters.push(
        or(
          eq(CalendarSlot.academic_term_id, termId),
          eq(AcademicCalendar.academic_term_id, termId),
        )!,
      );
    }
  }
  if (class_group_id) {
    const classGroupId = parseInt(class_group_id);
    if (!isNaN(classGroupId)) {
      filters.push(
        or(
          eq(CalendarSlot.class_group_id, classGroupId),
          eq(AcademicCalendar.class_group_id, classGroupId),
        )!,
      );
    }
  }
  if (day_of_week) {
    const day = parseInt(day_of_week);
    if (!isNaN(day)) {
      filters.push(eq(CalendarSlot.day_of_week, day));
    }
  }

  // Confine a class teacher / program lead to their own class groups. Matched
  // through the calendar (a slot's own class_group_id is only a denormalised
  // copy) so the scope can't be side-stepped by a stale value.
  const allowedClassGroups = await readableClassGroupIds(
    req,
    await academicYearForRequest({
      calendarId: calendar_id ? parseInt(calendar_id) : null,
      academicTermId: academic_term_id ? parseInt(academic_term_id) : null,
    }),
  );
  if (allowedClassGroups !== null) {
    if (allowedClassGroups.length === 0) {
      return successResponse(res, "Calendar slots retrieved successfully", []);
    }
    filters.push(
      sql`COALESCE(${AcademicCalendar.class_group_id}, ${CalendarSlot.class_group_id}) IN (${sql.join(
        allowedClassGroups.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  }

  // Only live lessons: active slot, on an active calendar, teaching an
  // ACTIVE subject. This endpoint also feeds the attendance app's timetable
  // sync, so a disabled subject's slots must not leak out here either. The
  // write path treats such a slot as a tombstone (see createCalendarSlot),
  // so hiding it cannot leave an invisible row blocking the timeslot.
  filters.push(...liveLessonFilters());

  const slots = await db
    .select({
      slot_id: CalendarSlot.slot_id,
      calendar_id: CalendarSlot.calendar_id, // needed by CalendarGrid to filter slots per grid
      // Report the calendar's term/class group when the slot's own copy has
      // drifted, so the client sees the values the slot actually belongs to.
      academic_term_id: sql<number>`COALESCE(${AcademicCalendar.academic_term_id}, ${CalendarSlot.academic_term_id})`,
      class_group_id: sql<number>`COALESCE(${AcademicCalendar.class_group_id}, ${CalendarSlot.class_group_id})`,
      subject_id: CalendarSlot.subject_id,
      user_id: CalendarSlot.user_id,
      day_of_week: CalendarSlot.day_of_week,
      start_time: CalendarSlot.start_time,
      end_time: CalendarSlot.end_time,
      location: CalendarSlot.location,
      color: Subject.color,
      notes: CalendarSlot.notes,
      // Related data
      subject_name: Subject.name,
      subject_code: Subject.code,
      instructor_name: UserProfile.first_name,
      instructor_lastname: UserProfile.last_name,
      class_group_name: ClassGroup.name,
    })
    .from(CalendarSlot)
    .leftJoin(
      AcademicCalendar,
      eq(CalendarSlot.calendar_id, AcademicCalendar.calendar_id),
    )
    .leftJoin(Subject, eq(CalendarSlot.subject_id, Subject.subject_id))
    .leftJoin(User, eq(CalendarSlot.user_id, User.user_id))
    .leftJoin(UserProfile, eq(CalendarSlot.user_id, UserProfile.user_id))
    .leftJoin(
      ClassGroup,
      sql`${ClassGroup.class_group_id} = COALESCE(${AcademicCalendar.class_group_id}, ${CalendarSlot.class_group_id})`,
    )
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(CalendarSlot.day_of_week, CalendarSlot.start_time);

  successResponse(res, "Calendar slots retrieved successfully", slots);
});

// Create a new calendar slot
export const createCalendarSlot = asyncHandler(async (req: any, res: any) => {
  const {
    calendar_id,
    academic_term_id,
    class_group_id,
    subject_id,
    user_id,
    day_of_week,
    start_time,
    end_time,
    location,
    color,
    notes,
  } = req.body;

  // Validation - calendar_id is now required (it contains the class group)
  if (
    !calendar_id ||
    !subject_id ||
    !user_id ||
    day_of_week === undefined ||
    !start_time ||
    !end_time
  ) {
    throw new ValidationError("All required fields must be provided");
  }

  if (day_of_week < 0 || day_of_week > 6) {
    throw new ValidationError(
      "Day of week must be between 0-6 (Sunday-Saturday)",
    );
  }

  // Validate time format (HH:MM)
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
    throw new ValidationError("Time must be in HH:MM format");
  }

  // Get the calendar to verify it exists and get its class_group_id
  const calendar = await db
    .select()
    .from(AcademicCalendar)
    .where(eq(AcademicCalendar.calendar_id, calendar_id))
    .limit(1);

  if (calendar.length === 0) {
    throw new NotFoundError("Academic calendar not found");
  }

  const calendarClassGroupId = calendar[0].class_group_id;
  await assertClassGroupWritable(
    req,
    calendarClassGroupId,
    calendar[0].academic_year_id,
  );

  // The DB enforces UNIQUE unique_slot (academic_term_id, class_group_id,
  // day_of_week, start_time) with no is_active in it. Look the key up the
  // same way -- ignoring calendar_id and is_active -- otherwise a
  // soft-deleted slot (or one on a sibling calendar of the same class group)
  // slips past this check and the INSERT dies with a bare "Duplicate entry".
  // A live holder is a real duplicate; a soft-deleted one is just a tombstone
  // we revive with the new details.
  //
  // A slot whose subject has since been DISABLED is a tombstone too: no read
  // shows it any more (liveLessonFilters), so refusing the timeslot on its
  // account would leave the admin staring at an empty cell they can't fill.
  const termId = calendar[0].academic_term_id;
  const existingSlot = await db
    .select({
      slot_id: CalendarSlot.slot_id,
      is_active: CalendarSlot.is_active,
      subject_status: Subject.status,
    })
    .from(CalendarSlot)
    .leftJoin(Subject, eq(CalendarSlot.subject_id, Subject.subject_id))
    .where(
      and(
        termId === null
          ? isNull(CalendarSlot.academic_term_id)
          : eq(CalendarSlot.academic_term_id, termId),
        calendarClassGroupId === null
          ? isNull(CalendarSlot.class_group_id)
          : eq(CalendarSlot.class_group_id, calendarClassGroupId),
        eq(CalendarSlot.day_of_week, day_of_week),
        eq(CalendarSlot.start_time, start_time),
      ),
    )
    .limit(1);

  if (existingSlot.length > 0) {
    if (
      existingSlot[0].is_active === 1 &&
      existingSlot[0].subject_status !== "DISABLED"
    ) {
      throw new ConflictError(
        "A slot already exists at this day and time for this class group",
      );
    }

    const slotId = existingSlot[0].slot_id;
    await assertNoOverlappingLesson({
      termId,
      classGroupId: calendarClassGroupId,
      dayOfWeek: day_of_week,
      startTime: start_time,
      endTime: end_time,
      excludeSlotId: slotId,
    });
    await db
      .update(CalendarSlot)
      .set({
        calendar_id,
        subject_id,
        user_id,
        end_time,
        location: location || null,
        ...(color !== undefined && { color }),
        notes: notes || null,
        is_active: 1,
      })
      .where(eq(CalendarSlot.slot_id, slotId));

    logger.info("Calendar slot created by reviving soft-deleted row", {
      slotId,
      userId: req.user?.userId || req.user?.user_id || req.user?.id,
    });

    return successResponse(
      res,
      "Calendar slot created successfully",
      { slot_id: slotId },
      201,
    );
  }

  await assertNoOverlappingLesson({
    termId,
    classGroupId: calendarClassGroupId,
    dayOfWeek: day_of_week,
    startTime: start_time,
    endTime: end_time,
  });

  const result = await db.insert(CalendarSlot).values({
    calendar_id,
    academic_term_id: termId,
    class_group_id: calendarClassGroupId,
    subject_id,
    user_id,
    day_of_week,
    start_time,
    end_time,
    location: location || null,
    ...(color !== undefined && { color }),
    notes: notes || null,
  });

  const resultHeader = Array.isArray(result) ? result[0] : result;
  const slotId = (resultHeader as any).insertId;

  logger.info("Calendar slot created", {
    slotId,
    userId: req.user?.userId || req.user?.user_id || req.user?.id,
  });

  successResponse(
    res,
    "Calendar slot created successfully",
    { slot_id: slotId },
    201,
  );
});

// Update a calendar slot
export const updateCalendarSlot = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const slotId = parseInt(id);

  if (isNaN(slotId)) {
    throw new ValidationError("Invalid slot ID");
  }

  const {
    subject_id,
    user_id,
    day_of_week,
    start_time,
    end_time,
    location,
    color,
    notes,
    is_active,
  } = req.body;

  // Check if slot exists
  const existingSlot = await db
    .select()
    .from(CalendarSlot)
    .where(eq(CalendarSlot.slot_id, slotId))
    .limit(1);

  if (existingSlot.length === 0) {
    throw new NotFoundError("Calendar slot not found");
  }

  // A slot inherits its class group from its calendar -- guard the write on
  // that, not on the slot's own denormalised column.
  if (existingSlot[0].class_group_id) {
    await assertClassGroupWritable(req, existingSlot[0].class_group_id);
  }

  // Validate time format if provided
  if (start_time) {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(start_time)) {
      throw new ValidationError("Time must be in HH:MM format");
    }
  }

  if (day_of_week !== undefined && (day_of_week < 0 || day_of_week > 6)) {
    throw new ValidationError(
      "Day of week must be between 0-6 (Sunday-Saturday)",
    );
  }

  // Same unique_slot key as createCalendarSlot: if the slot is moving onto a
  // (day, start_time) another row already holds, clear a soft-deleted holder
  // out of the way, or refuse clearly when the holder is live.
  const targetDay =
    day_of_week !== undefined ? day_of_week : existingSlot[0].day_of_week;
  const targetStart = start_time || existingSlot[0].start_time;
  if (
    targetDay !== existingSlot[0].day_of_week ||
    targetStart !== existingSlot[0].start_time
  ) {
    const holder = await db
      .select({
        slot_id: CalendarSlot.slot_id,
        is_active: CalendarSlot.is_active,
        subject_status: Subject.status,
      })
      .from(CalendarSlot)
      .leftJoin(Subject, eq(CalendarSlot.subject_id, Subject.subject_id))
      .where(
        and(
          existingSlot[0].academic_term_id === null
            ? isNull(CalendarSlot.academic_term_id)
            : eq(
                CalendarSlot.academic_term_id,
                existingSlot[0].academic_term_id,
              ),
          existingSlot[0].class_group_id === null
            ? isNull(CalendarSlot.class_group_id)
            : eq(CalendarSlot.class_group_id, existingSlot[0].class_group_id),
          eq(CalendarSlot.day_of_week, targetDay),
          eq(CalendarSlot.start_time, targetStart),
        ),
      )
      .limit(1);

    if (holder.length > 0 && holder[0].slot_id !== slotId) {
      // Same tombstone rule as createCalendarSlot: a live holder on a
      // DISABLED subject is invisible everywhere, so it gives way.
      if (
        holder[0].is_active === 1 &&
        holder[0].subject_status !== "DISABLED"
      ) {
        throw new ConflictError(
          "A slot already exists at this day and time for this class group",
        );
      }
      await db
        .delete(CalendarSlot)
        .where(eq(CalendarSlot.slot_id, holder[0].slot_id));
    }
  }

  // Any change to when the lesson runs has to keep it clear of the class
  // group's other lessons, not just off their start minutes.
  const targetEnd = end_time || existingSlot[0].end_time;
  const timeChanged =
    targetDay !== existingSlot[0].day_of_week ||
    targetStart !== existingSlot[0].start_time ||
    targetEnd !== existingSlot[0].end_time;
  if (timeChanged && (is_active === undefined || is_active === 1)) {
    await assertNoOverlappingLesson({
      termId: existingSlot[0].academic_term_id,
      classGroupId: existingSlot[0].class_group_id,
      dayOfWeek: targetDay,
      startTime: targetStart,
      endTime: targetEnd,
      excludeSlotId: slotId,
    });
  }

  await db
    .update(CalendarSlot)
    .set({
      ...(subject_id && { subject_id }),
      ...(user_id && { user_id }),
      ...(day_of_week !== undefined && { day_of_week }),
      ...(start_time && { start_time }),
      ...(end_time && { end_time }),
      ...(location !== undefined && { location }),
      ...(color !== undefined && { color }),
      ...(notes !== undefined && { notes }),
      ...(is_active !== undefined && { is_active }),
    })
    .where(eq(CalendarSlot.slot_id, slotId));

  logger.info("Calendar slot updated", {
    slotId,
    userId: req.user?.userId || req.user?.user_id || req.user?.id,
  });

  successResponse(res, "Calendar slot updated successfully", {
    slot_id: slotId,
  });
});

// Delete a calendar slot (soft delete)
export const deleteCalendarSlot = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const slotId = parseInt(id);

  if (isNaN(slotId)) {
    throw new ValidationError("Invalid slot ID");
  }

  const existingSlot = await db
    .select()
    .from(CalendarSlot)
    .where(eq(CalendarSlot.slot_id, slotId))
    .limit(1);

  if (existingSlot.length === 0) {
    throw new NotFoundError("Calendar slot not found");
  }

  // A slot inherits its class group from its calendar -- guard the write on
  // that, not on the slot's own denormalised column.
  if (existingSlot[0].class_group_id) {
    await assertClassGroupWritable(req, existingSlot[0].class_group_id);
  }

  await db
    .update(CalendarSlot)
    .set({ is_active: 0 })
    .where(eq(CalendarSlot.slot_id, slotId));

  logger.info("Calendar slot deleted", {
    slotId,
    userId: req.user?.userId || req.user?.user_id || req.user?.id,
  });

  successResponse(res, "Calendar slot deleted successfully", null);
});

// ============================================
// Instructor Calendar (My Calendar)
// ============================================

// Get instructor's calendar (only their assigned subjects)
export const getMyCalendar = asyncHandler(async (req: any, res: any) => {
  const { academic_term_id, class_group_id } = req.query;
  const userId = req.user?.userId || req.user?.user_id || req.user?.id;

  logger.info("Fetching instructor calendar", {
    userId,
    academic_term_id,
    class_group_id,
  });

  // Get the current or specified academic term
  let termId = academic_term_id ? parseInt(academic_term_id) : null;
  let yearId: number | null = null;

  if (!termId) {
    const currentTerm = await db
      .select({
        academic_term_id: AcademicTerm.academic_term_id,
        academic_year_id: AcademicTerm.academic_year_id,
      })
      .from(AcademicTerm)
      .where(eq(AcademicTerm.is_current, 1))
      .limit(1);

    if (currentTerm.length > 0) {
      termId = currentTerm[0].academic_term_id;
      yearId = currentTerm[0].academic_year_id;
    }
  } else {
    const termRecord = await db
      .select({ academic_year_id: AcademicTerm.academic_year_id })
      .from(AcademicTerm)
      .where(eq(AcademicTerm.academic_term_id, termId))
      .limit(1);
    if (termRecord.length > 0) {
      yearId = termRecord[0].academic_year_id;
    }
  }

  if (!termId) {
    throw new ValidationError("No academic term specified or found");
  }

  // `CalendarSlot.user_id` is set once when a lesson slot is created and is
  // never touched again when a teacher is reassigned (updateTeacherSubjectAssignment
  // only rewrites TeacherSubjectAssignment) — so a slot can keep pointing at a
  // teacher who no longer actually teaches that class/subject. TeacherSubjectAssignment
  // is the real source of truth for "who currently teaches what" (it's what backs
  // the dashboard's "Assigned Subjects" count), so loadTeacherLessons cross-checks
  // against it the same way getStudentCalendar cross-checks slots against
  // StudentSubjectEnrollment, and drops lessons on disabled subjects/calendars.
  const filteredSlots = await loadTeacherLessons({
    userId,
    termId,
    yearId,
    classGroupId: class_group_id ? parseInt(class_group_id) : null,
  });

  // Get upcoming lessons (lessons starting soon - within 30 mins)
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const currentDayOfWeek = now.getDay();

  const upcomingSlots = filteredSlots
    .filter((slot: any) => {
      const [hours, minutes] = slot.start_time.split(":").map(Number);
      const slotTimeInMinutes = hours * 60 + minutes;
      const timeDiff = slotTimeInMinutes - currentTimeInMinutes;
      // Handle wrap-around for days (0=Sun, 6=Sat)
      const dayDiff = (slot.day_of_week - currentDayOfWeek + 7) % 7;

      // User requested: "upcoming means lessons of the following day only"
      return dayDiff === 1;
    })
    .map((slot: any) => {
      const [hours, minutes] = slot.start_time.split(":").map(Number);
      const slotTimeInMinutes = hours * 60 + minutes;
      const timeDiffInMinutes = slotTimeInMinutes - currentTimeInMinutes;
      // For tomorrow's lessons, total time difference is 24h + time to start
      const totalTimeDiff = 1 * 24 * 60 + timeDiffInMinutes;

      return {
        slot_id: slot.slot_id,
        subject_name: slot.subject_name,
        class_name: slot.class_group_name,
        location: slot.location,
        start_time: slot.start_time,
        end_time: slot.end_time,
        minutes_until_start: totalTimeDiff,
        day_diff: 1,
        notification_type: "LESSON_STARTING",
      };
    })
    .sort((a, b) => a.minutes_until_start - b.minutes_until_start);

  const response = {
    slots: filteredSlots,
    upcoming: upcomingSlots,
    term_id: termId,
  };

  successResponse(res, "My calendar retrieved successfully", response);
});

// ============================================
// Calendar Notifications
// ============================================

// Get notification settings for current user
export const getNotificationSettings = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user?.userId || req.user?.user_id || req.user?.id;

    const notifications = await db
      .select()
      .from(CalendarNotification)
      .where(eq(CalendarNotification.user_id, userId));

    successResponse(
      res,
      "Notification settings retrieved successfully",
      notifications,
    );
  },
);

// Update notification settings
export const updateNotificationSettings = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user?.userId || req.user?.user_id || req.user?.id;
    const { notifications } = req.body;

    if (!Array.isArray(notifications) || notifications.length === 0) {
      throw new ValidationError("Notifications array is required");
    }

    // Delete existing notifications
    await db
      .delete(CalendarNotification)
      .where(eq(CalendarNotification.user_id, userId));

    // Insert new notifications
    const insertValues = notifications.map((n: any) => ({
      user_id: userId,
      notification_type: n.notification_type || "LESSON_STARTING",
      minutes_before: n.minutes_before || 30,
      is_enabled: n.is_enabled !== undefined ? n.is_enabled : 1,
      notification_method: n.notification_method || "IN_APP",
    }));

    for (const val of insertValues) {
      await db.insert(CalendarNotification).values(val);
    }

    logger.info("Notification settings updated", { userId });

    successResponse(
      res,
      "Notification settings updated successfully",
      insertValues,
    );
  },
);

// Check for upcoming lessons that need notifications
export const checkUpcomingLessons = asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.userId || req.user?.user_id || req.user?.id;

  // Get user's notification preferences
  const notifications = await db
    .select()
    .from(CalendarNotification)
    .where(
      and(
        eq(CalendarNotification.user_id, userId),
        eq(CalendarNotification.is_enabled, 1),
      ),
    );

  if (notifications.length === 0) {
    return successResponse(res, "No notifications enabled", []);
  }

  // Get current term
  const currentTerm = await db
    .select()
    .from(AcademicTerm)
    .where(eq(AcademicTerm.is_current, 1))
    .limit(1);

  if (currentTerm.length === 0) {
    return successResponse(res, "No active term", []);
  }

  const termId = currentTerm[0].academic_term_id;

  // Today's live lessons for the user -- same rules as my-calendar, so a
  // teacher is never reminded of a lesson their timetable doesn't show.
  const now = new Date();
  const currentDayOfWeek = now.getDay();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;

  const todaySlots = await loadTeacherLessons({
    userId,
    termId,
    yearId: currentTerm[0].academic_year_id,
    dayOfWeek: currentDayOfWeek,
  });

  // Filter lessons starting within notification window
  const upcomingLessons = [];

  for (const notification of notifications) {
    const windowMinutes = notification.minutes_before;

    for (const slot of todaySlots) {
      const [hours, minutes] = slot.start_time.split(":").map(Number);
      const slotTimeInMinutes = hours * 60 + minutes;
      const timeDiff = slotTimeInMinutes - currentTimeInMinutes;

      if (timeDiff > 0 && timeDiff <= windowMinutes) {
        upcomingLessons.push({
          slot_id: slot.slot_id,
          subject_name: slot.subject_name,
          class_name: slot.class_group_name,
          location: slot.location,
          start_time: slot.start_time,
          end_time: slot.end_time,
          minutes_until_start: timeDiff,
          notification_type: notification.notification_type,
        });
      }
    }
  }

  successResponse(res, "Upcoming lessons retrieved", upcomingLessons);
});

// ============================================
// Calendar Activities (Non-subject events)
// ============================================

// Get calendar activities
export const getCalendarActivities = asyncHandler(
  async (req: any, res: any) => {
    const {
      academic_term_id,
      class_group_id,
      day_of_week,
      start_date,
      end_date,
    } = req.query;

    const filters: SQL[] = [eq(CalendarActivity.is_active, 1)];

    if (academic_term_id) {
      filters.push(
        eq(CalendarActivity.academic_term_id, parseInt(academic_term_id)),
      );
    }
    if (class_group_id) {
      filters.push(
        eq(CalendarActivity.class_group_id, parseInt(class_group_id)),
      );
    }
    if (day_of_week !== undefined) {
      filters.push(eq(CalendarActivity.day_of_week, parseInt(day_of_week)));
    }

    // School-wide activities (no class group) stay visible to everyone; the
    // ones pinned to a class group follow the same confinement as slots.
    const allowedClassGroups = await readableClassGroupIds(
      req,
      await academicYearForRequest({
        academicTermId: academic_term_id ? parseInt(academic_term_id) : null,
      }),
    );
    if (allowedClassGroups !== null) {
      filters.push(
        allowedClassGroups.length === 0
          ? isNull(CalendarActivity.class_group_id)
          : or(
              isNull(CalendarActivity.class_group_id),
              inArray(CalendarActivity.class_group_id, allowedClassGroups),
            )!,
      );
    }

    let activities = await db
      .select({
        activity_id: CalendarActivity.activity_id,
        academic_term_id: CalendarActivity.academic_term_id,
        class_group_id: CalendarActivity.class_group_id,
        activity_name: CalendarActivity.activity_name,
        activity_type: CalendarActivity.activity_type,
        day_of_week: CalendarActivity.day_of_week,
        start_date: CalendarActivity.start_date,
        end_date: CalendarActivity.end_date,
        start_time: CalendarActivity.start_time,
        end_time: CalendarActivity.end_time,
        location: CalendarActivity.location,
        description: CalendarActivity.description,
        color: CalendarActivity.color,
        is_recurring: CalendarActivity.is_recurring,
        class_group_name: ClassGroup.name,
      })
      .from(CalendarActivity)
      .leftJoin(
        ClassGroup,
        eq(CalendarActivity.class_group_id, ClassGroup.class_group_id),
      )
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(CalendarActivity.start_time);

    // Filter by date range if provided
    if (start_date && end_date) {
      const start = formatDateForMySQL(start_date);
      const end = formatDateForMySQL(end_date);
      if (start && end) {
        activities = activities.filter((a: any) => {
          if (a.is_recurring) return true; // Include recurring activities
          if (!a.start_date) return true;
          return a.start_date >= start && a.start_date <= end;
        });
      }
    }

    successResponse(
      res,
      "Calendar activities retrieved successfully",
      activities,
    );
  },
);

// Create calendar activity
export const createCalendarActivity = asyncHandler(
  async (req: any, res: any) => {
    const {
      academic_term_id,
      class_group_id,
      activity_name,
      activity_type,
      day_of_week,
      start_date,
      end_date,
      start_time,
      end_time,
      location,
      description,
      color,
      is_recurring,
    } = req.body;

    if (
      !academic_term_id ||
      !activity_name ||
      !activity_type ||
      !start_time ||
      !end_time
    ) {
      throw new ValidationError("Required fields must be provided");
    }

    const result = await db.insert(CalendarActivity).values({
      academic_term_id: sql`${academic_term_id}`,
      class_group_id: class_group_id ? sql`${class_group_id}` : null,
      activity_name,
      activity_type,
      day_of_week: day_of_week !== undefined ? sql`${day_of_week}` : null,
      start_date: start_date ? sql`${formatDateForMySQL(start_date)}` : null,
      end_date: end_date ? sql`${formatDateForMySQL(end_date)}` : null,
      start_time,
      end_time,
      location: location || null,
      description: description || null,
      color: color || "#10B981",
      is_recurring: is_recurring !== undefined ? is_recurring : 1,
    });

    const resultHeader = Array.isArray(result) ? result[0] : result;
    const activityId = (resultHeader as any).insertId;

    logger.info("Calendar activity created", {
      activityId,
      userId: req.user?.userId || req.user?.user_id || req.user?.id,
    });

    successResponse(
      res,
      "Calendar activity created successfully",
      { activity_id: activityId },
      201,
    );
  },
);

// Update calendar activity
export const updateCalendarActivity = asyncHandler(
  async (req: any, res: any) => {
    const { id } = req.params;
    const activityId = parseInt(id);

    if (isNaN(activityId)) {
      throw new ValidationError("Invalid activity ID");
    }

    const existingActivity = await db
      .select()
      .from(CalendarActivity)
      .where(eq(CalendarActivity.activity_id, activityId))
      .limit(1);

    if (existingActivity.length === 0) {
      throw new NotFoundError("Calendar activity not found");
    }

    const {
      class_group_id,
      activity_name,
      activity_type,
      day_of_week,
      start_date,
      end_date,
      start_time,
      end_time,
      location,
      description,
      color,
      is_recurring,
      is_active,
    } = req.body;

    await db
      .update(CalendarActivity)
      .set({
        ...(class_group_id !== undefined && { class_group_id }),
        ...(activity_name && { activity_name }),
        ...(activity_type && { activity_type }),
        ...(day_of_week !== undefined && { day_of_week }),
        ...(start_date && { start_date: formatDateForMySQL(start_date) }),
        ...(end_date && { end_date: formatDateForMySQL(end_date) }),
        ...(start_time && { start_time }),
        ...(end_time && { end_time }),
        ...(location !== undefined && { location }),
        ...(description !== undefined && { description }),
        ...(color !== undefined && { color }),
        ...(is_recurring !== undefined && { is_recurring }),
        ...(is_active !== undefined && { is_active }),
      })
      .where(eq(CalendarActivity.activity_id, activityId));

    logger.info("Calendar activity updated", {
      activityId,
      userId: req.user?.userId || req.user?.user_id || req.user?.id,
    });

    successResponse(res, "Calendar activity updated successfully", {
      activity_id: activityId,
    });
  },
);

// Delete calendar activity
export const deleteCalendarActivity = asyncHandler(
  async (req: any, res: any) => {
    const { id } = req.params;
    const activityId = parseInt(id);

    if (isNaN(activityId)) {
      throw new ValidationError("Invalid activity ID");
    }

    const existingActivity = await db
      .select()
      .from(CalendarActivity)
      .where(eq(CalendarActivity.activity_id, activityId))
      .limit(1);

    if (existingActivity.length === 0) {
      throw new NotFoundError("Calendar activity not found");
    }

    await db
      .update(CalendarActivity)
      .set({ is_active: 0 })
      .where(eq(CalendarActivity.activity_id, activityId));

    logger.info("Calendar activity deleted", {
      activityId,
      userId: req.user?.userId || req.user?.user_id || req.user?.id,
    });

    successResponse(res, "Calendar activity deleted successfully", null);
  },
);

// ============================================
// Lesson Plan Integration
// ============================================

// Helper to get full lesson details (outcomes, sections, etc.)
const getFullLessonDetails = async (lesson: any) => {
  if (!lesson) return null;

  const outcomes = await db
    .select()
    .from(LO_LearningOutcome)
    .where(eq(LO_LearningOutcome.lesson_id, lesson.id));

  const outcomesWithDetails = await Promise.all(
    outcomes.map(async (outcome) => {
      const activities = await db
        .select()
        .from(LO_LearningOutcomeActivity)
        .where(eq(LO_LearningOutcomeActivity.learning_outcome_id, outcome.id));

      const resources = await db
        .select()
        .from(LO_LearningOutcomeResource)
        .where(eq(LO_LearningOutcomeResource.learning_outcome_id, outcome.id));

      return { ...outcome, activities, resources };
    }),
  );

  const sections = await db
    .select()
    .from(LO_LessonSection)
    .where(eq(LO_LessonSection.lesson_id, lesson.id));

  const indicativeContent = await db
    .select()
    .from(LO_IndicativeContent)
    .where(eq(LO_IndicativeContent.lesson_id, lesson.id));

  const assignments = await db
    .select()
    .from(LO_LessonAssignment)
    .where(eq(LO_LessonAssignment.lesson_id, lesson.id));

  const evaluation = await db
    .select()
    .from(LO_LessonEvaluation)
    .where(eq(LO_LessonEvaluation.lesson_id, lesson.id));

  return {
    ...lesson,
    outcomes: outcomesWithDetails,
    sections,
    indicativeContent,
    assignments,
    evaluation: evaluation[0] || null,
  };
};

// Get lesson plan for a specific calendar slot
export const getLessonPlanForSlot = asyncHandler(async (req: any, res: any) => {
  const { slot_id } = req.params;
  const { lesson_date } = req.query;
  const userId = req.user?.userId || req.user?.user_id || req.user?.id;

  const slotId = parseInt(slot_id);
  if (isNaN(slotId)) {
    throw new ValidationError("Invalid slot ID");
  }

  // Get the slot details
  const slot = await db
    .select({
      slot_id: CalendarSlot.slot_id,
      subject_id: CalendarSlot.subject_id,
      class_group_id: CalendarSlot.class_group_id,
      academic_term_id: CalendarSlot.academic_term_id,
      user_id: CalendarSlot.user_id,
      day_of_week: CalendarSlot.day_of_week,
      start_time: CalendarSlot.start_time,
      end_time: CalendarSlot.end_time,
    })
    .from(CalendarSlot)
    .where(eq(CalendarSlot.slot_id, slotId))
    .limit(1);

  if (slot.length === 0) {
    throw new NotFoundError("Calendar slot not found");
  }

  // Check if user has access
  const isInstructor = slot[0].user_id === userId;
  const isSysAdmin = req.user.permissions?.includes("ADMIN");
  const hasManagePermission = req.user.permissions?.includes(
    "MANAGE_ACADEMIC_CALENDAR",
  );
  const hasViewPermission = req.user.permissions?.includes(
    "VIEW_ACADEMIC_CALENDAR",
  );
  const hasFullLessonPlanPermission = req.user.permissions?.includes(
    "VIEW_CALENDAR_SUBJECT_LESSON_PLAN",
  );
  const hasSummaryPermission = req.user.permissions?.includes(
    "STUDENT_VIEW_LESSON_PLAN_SUMMARY",
  );

  const hasFullAccess =
    isInstructor ||
    isSysAdmin ||
    hasManagePermission ||
    hasViewPermission ||
    hasFullLessonPlanPermission;
  const hasAnyAccess = hasFullAccess || hasSummaryPermission;

  if (!hasAnyAccess) {
    throw new ValidationError("You don't have access to this lesson plan");
  }

  // OPTION 1: If lesson_date is provided, try to find a lesson plan for that specific date
  if (lesson_date) {
    const formattedDate = formatDateForMySQL(lesson_date as string);
    if (formattedDate) {
      const specificLesson = await db
        .select({
          lesson: LO_Lesson,
        })
        .from(LO_Lesson)
        .leftJoin(
          SchemeOfWorkEntry,
          eq(LO_Lesson.entry_id, SchemeOfWorkEntry.entry_id),
        )
        .leftJoin(
          SchemeOfWork,
          eq(SchemeOfWorkEntry.scheme_id, SchemeOfWork.scheme_id),
        )
        .where(
          and(
            eq(LO_Lesson.lesson_date, sql`${formattedDate}`),
            eq(LO_Lesson.user_id, slot[0].user_id),
            // Ensure we match the exact subject/class from the slot
            eq(SchemeOfWork.subject_id, slot[0].subject_id),
            slot[0].class_group_id
              ? eq(SchemeOfWork.class_group_id, slot[0].class_group_id)
              : undefined,
            // Add time specificity if needed (optional precision)
            eq(LO_Lesson.start_time, slot[0].start_time),
            eq(LO_Lesson.end_time, slot[0].end_time),
          ),
        )
        .limit(1);

      if (specificLesson.length > 0) {
        const fullDetails = await getFullLessonDetails(
          specificLesson[0].lesson,
        );

        if (!hasFullAccess && hasSummaryPermission) {
          return successResponse(
            res,
            "Lesson plan summary retrieved successfully",
            {
              is_summary: true,
              module_name: fullDetails.module_name,
              big_question: fullDetails.big_question,
              lesson_date: fullDetails.lesson_date,
              start_time: fullDetails.start_time,
              end_time: fullDetails.end_time,
              sector: fullDetails.sector,
              trade: fullDetails.trade,
            },
          );
        }

        return successResponse(
          res,
          "Specific lesson plan for date retrieved successfully",
          {
            ...fullDetails,
            // The real timetable slot's own time — a fallback for the edit
            // form when this LO_Lesson row's own start_time/end_time are
            // empty (e.g. an AI-generated plan, which never captures a real
            // time slot), so editing doesn't show blank inputs for a time
            // that's genuinely known from the calendar.
            slot_start_time: slot[0].start_time,
            slot_end_time: slot[0].end_time,
          },
        );
      }
    }
  }

  // OPTION 2: Fallback to Scheme of Work entries matching the date range
  const formattedDate = lesson_date
    ? formatDateForMySQL(lesson_date as string)
    : null;

  const entriesQuery = db
    .select({
      entry: SchemeOfWorkEntry,
    })
    .from(SchemeOfWorkEntry)
    .innerJoin(
      SchemeOfWork,
      eq(SchemeOfWorkEntry.scheme_id, SchemeOfWork.scheme_id),
    )
    .where(
      and(
        eq(SchemeOfWork.subject_id, slot[0].subject_id),
        slot[0].class_group_id
          ? eq(SchemeOfWork.class_group_id, slot[0].class_group_id)
          : undefined,
        slot[0].academic_term_id
          ? eq(SchemeOfWork.academic_term_id, slot[0].academic_term_id)
          : undefined,
        formattedDate
          ? and(
              lte(SchemeOfWorkEntry.start_date, sql`${formattedDate}`),
              gte(SchemeOfWorkEntry.end_date, sql`${formattedDate}`),
            )
          : undefined,
      ),
    )
    .orderBy(SchemeOfWorkEntry.week_number)
    .limit(1);

  const entries = await entriesQuery;

  if (entries.length === 0) {
    // If no date range match, try to get the very first entry as last resort
    const lastResort = await db
      .select({ entry: SchemeOfWorkEntry })
      .from(SchemeOfWorkEntry)
      .innerJoin(
        SchemeOfWork,
        eq(SchemeOfWorkEntry.scheme_id, SchemeOfWork.scheme_id),
      )
      .where(
        and(
          eq(SchemeOfWork.subject_id, slot[0].subject_id),
          slot[0].class_group_id
            ? eq(SchemeOfWork.class_group_id, slot[0].class_group_id)
            : undefined,
        ),
      )
      .orderBy(SchemeOfWorkEntry.week_number)
      .limit(1);

    if (lastResort.length === 0) {
      return successResponse(res, "No lesson plan found", null);
    }
    entries.push(lastResort[0]);
  }

  // Get the full lesson plan details for this entry
  const lessonPlan = await db
    .select()
    .from(LO_Lesson)
    .where(eq(LO_Lesson.entry_id, entries[0].entry.entry_id))
    .limit(1);

  const fullDetails =
    lessonPlan.length > 0 ? await getFullLessonDetails(lessonPlan[0]) : null;

  if (fullDetails && !hasFullAccess && hasSummaryPermission) {
    return successResponse(res, "Lesson plan summary retrieved successfully", {
      is_summary: true,
      module_name: fullDetails.module_name,
      big_question: fullDetails.big_question,
      lesson_date: fullDetails.lesson_date,
      start_time: fullDetails.start_time,
      end_time: fullDetails.end_time,
      sector: fullDetails.sector,
      trade: fullDetails.trade,
    });
  }

  // No lesson has been generated for this entry yet — for a full-access
  // viewer (the instructor/an admin), still hand back the resolved scheme
  // entry so the preview can offer "Generate with AI" instead of a dead end.
  // A summary-only viewer (e.g. a student) can't generate anything, so they
  // keep seeing a plain empty state.
  if (!fullDetails && hasFullAccess) {
    return successResponse(res, "No lesson plan generated yet", {
      entry_id: entries[0].entry.entry_id,
      week_number: entries[0].entry.week_number,
      topic: entries[0].entry.topic,
      lesson_date: formattedDate || entries[0].entry.start_date,
      has_plan: false,
    });
  }

  successResponse(res, "Lesson plan retrieved successfully", {
    ...fullDetails,
    slot_start_time: slot[0].start_time,
    slot_end_time: slot[0].end_time,
  });
});

// ============================================
// Student Calendar View
// ============================================

// Get student's enrolled subjects calendar
export const getStudentCalendar = asyncHandler(async (req: any, res: any) => {
  const { academic_term_id, academic_year_id } = req.query;
  const userId = req.user?.userId || req.user?.user_id || req.user?.id;

  logger.info("Fetching student calendar", {
    userId,
    academic_term_id,
    academic_year_id,
  });

  // Get the current or specified academic term
  let termId = academic_term_id ? parseInt(academic_term_id) : null;
  let yearId: number | null = null;

  if (!termId) {
    const currentTerm = await db
      .select({
        academic_term_id: AcademicTerm.academic_term_id,
        academic_year_id: AcademicTerm.academic_year_id,
      })
      .from(AcademicTerm)
      .where(eq(AcademicTerm.is_current, 1))
      .limit(1);

    if (currentTerm.length > 0) {
      termId = currentTerm[0].academic_term_id;
      yearId = currentTerm[0].academic_year_id;
    }
  } else {
    const termRecord = await db
      .select({ academic_year_id: AcademicTerm.academic_year_id })
      .from(AcademicTerm)
      .where(eq(AcademicTerm.academic_term_id, termId))
      .limit(1);
    if (termRecord.length > 0) {
      yearId = termRecord[0].academic_year_id;
    }
  }

  if (!termId) {
    throw new ValidationError("No academic term specified or found");
  }

  if (!yearId) {
    throw new ValidationError(
      "Could not resolve academic year for the specified term",
    );
  }

  // Get student's enrolled subjects for this academic year
  const enrollments = await db
    .select({
      subject_id: StudentSubjectEnrollment.subject_id,
    })
    .from(StudentSubjectEnrollment)
    .where(
      and(
        eq(StudentSubjectEnrollment.user_id, userId),
        eq(StudentSubjectEnrollment.academic_year_id, yearId),
        eq(StudentSubjectEnrollment.status, "ACTIVE"),
      ),
    );

  if (enrollments.length === 0) {
    return successResponse(res, "No enrolled subjects for this term", {
      slots: [],
      term_id: termId,
    });
  }

  const subjectIds = enrollments.map((e: any) => e.subject_id);

  // Get the student's class groups for this academic year. StudentClassGroup
  // is keyed per year and ClassGroup rows are reused across years, so an
  // unscoped lookup also matched the group the student sat in last year --
  // and if that group's calendar teaches the same subject this term, the
  // student's timetable drew the lesson twice (once per class group).
  const studentClassGroups = await db
    .select({
      class_group_id: StudentClassGroup.class_group_id,
    })
    .from(StudentClassGroup)
    .where(
      and(
        eq(StudentClassGroup.user_id, userId),
        eq(StudentClassGroup.academic_year_id, yearId),
        eq(StudentClassGroup.status, "ACTIVE"),
      ),
    );

  const classGroupIds = studentClassGroups.map((c: any) => c.class_group_id);

  if (classGroupIds.length === 0) {
    return successResponse(res, "No class group assigned", {
      slots: [],
      term_id: termId,
    });
  }

  // Get calendar slots for enrolled subjects in student's class groups.
  // Match the calendar's term/class group, falling back to the slot's own
  // denormalised copy — the two drift, and keying off CalendarSlot alone drops
  // lessons whose calendar term has moved on (same bug fixed for the admin and
  // teacher grids).
  const effectiveTerm = effectiveTermSql;
  const effectiveClassGroup = effectiveClassGroupSql;

  const filters: SQL[] = [
    sql`${effectiveTerm} = ${termId}`,
    ...liveLessonFilters(),
    sql`${effectiveClassGroup} IN (${sql.join(
      classGroupIds.map((id) => sql`${id}`),
      sql`, `,
    )})`,
  ];

  const slots = await db
    .select({
      slot_id: CalendarSlot.slot_id,
      calendar_id: CalendarSlot.calendar_id,
      academic_term_id: sql<number>`${effectiveTerm}`,
      class_group_id: sql<number>`${effectiveClassGroup}`,
      own_term_id: CalendarSlot.academic_term_id,
      own_class_group_id: CalendarSlot.class_group_id,
      subject_id: CalendarSlot.subject_id,
      user_id: CalendarSlot.user_id,
      day_of_week: CalendarSlot.day_of_week,
      start_time: CalendarSlot.start_time,
      end_time: CalendarSlot.end_time,
      location: CalendarSlot.location,
      color: Subject.color,
      notes: CalendarSlot.notes,
      // Related data
      subject_name: Subject.name,
      subject_code: Subject.code,
      instructor_name: UserProfile.first_name,
      instructor_lastname: UserProfile.last_name,
      class_group_name: ClassGroup.name,
    })
    .from(CalendarSlot)
    .leftJoin(
      AcademicCalendar,
      eq(CalendarSlot.calendar_id, AcademicCalendar.calendar_id),
    )
    .leftJoin(Subject, eq(CalendarSlot.subject_id, Subject.subject_id))
    .leftJoin(User, eq(CalendarSlot.user_id, User.user_id))
    .leftJoin(UserProfile, eq(CalendarSlot.user_id, UserProfile.user_id))
    .leftJoin(
      ClassGroup,
      sql`${ClassGroup.class_group_id} = ${effectiveClassGroup}`,
    )
    .where(and(...filters))
    .orderBy(CalendarSlot.day_of_week, CalendarSlot.start_time);

  // Filter to only show slots for subjects the student is enrolled in, and
  // collapse drift duplicates (see dedupeLessons).
  const filteredSlots = stripOwnColumns(
    dedupeLessons(
      slots.filter((slot: any) => subjectIds.includes(slot.subject_id)),
    ),
  );

  // Get upcoming lessons
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const currentDayOfWeek = now.getDay();

  const upcomingSlots = filteredSlots
    .filter((slot: any) => {
      const [hours, minutes] = slot.start_time.split(":").map(Number);
      const slotTimeInMinutes = hours * 60 + minutes;
      const timeDiff = slotTimeInMinutes - currentTimeInMinutes;
      const dayDiff = (slot.day_of_week - currentDayOfWeek + 7) % 7;

      // User requested: "upcoming means lessons of the following day only"
      return dayDiff === 1;
    })
    .map((slot: any) => {
      const [hours, minutes] = slot.start_time.split(":").map(Number);
      const slotTimeInMinutes = hours * 60 + minutes;
      const timeDiffInMinutes = slotTimeInMinutes - currentTimeInMinutes;
      // For tomorrow's lessons, total time difference is 24h + time to start
      const totalTimeDiff = 1 * 24 * 60 + timeDiffInMinutes;

      return {
        slot_id: slot.slot_id,
        subject_name: slot.subject_name,
        class_name: slot.class_group_name,
        location: slot.location,
        start_time: slot.start_time,
        end_time: slot.end_time,
        minutes_until_start: totalTimeDiff,
        day_diff: 1,
        notification_type: "LESSON_STARTING",
      };
    })
    .sort((a, b) => a.minutes_until_start - b.minutes_until_start);

  const response = {
    slots: filteredSlots,
    upcoming: upcomingSlots,
    term_id: termId,
  };

  successResponse(res, "Student calendar retrieved successfully", response);
});

// Get classes and subjects for calendar setup (for admin)
export const getCalendarSetupData = asyncHandler(async (req: any, res: any) => {
  const { academic_term_id, class_group_id } = req.query;

  let termId = academic_term_id ? parseInt(academic_term_id) : null;
  let yearId: number | null = null;
  let classGroupId = class_group_id ? parseInt(class_group_id) : null;

  if (!termId) {
    const currentTerm = await db
      .select()
      .from(AcademicTerm)
      .where(eq(AcademicTerm.is_current, 1))
      .limit(1);

    if (currentTerm.length > 0) {
      termId = currentTerm[0].academic_term_id;
      yearId = Number(currentTerm[0].academic_year_id);
    }
  } else {
    // Get the academic year from the term
    const termData = await db
      .select()
      .from(AcademicTerm)
      .where(eq(AcademicTerm.academic_term_id, termId))
      .limit(1);
    if (termData.length > 0) {
      yearId = Number(termData[0].academic_year_id);
    }
  }

  if (!termId || !yearId) {
    throw new ValidationError("No academic term specified or found");
  }

  // Same class-group clamp as the picker -- the slot form must not offer a
  // class group the caller was never assigned.
  const setupScope = await resolveUserScope(req.user?.userId, yearId);
  const setupScopeFilter =
    setupScope.scoped && setupScope.classGroupIds.length > 0
      ? inArray(ClassGroup.class_group_id, setupScope.classGroupIds)
      : undefined;

  // Get class groups that actually have a teacher assignment in this
  // academic year -- ClassGroup itself is a permanent label (no year), so
  // "relevant to this year" is now determined via TeacherSubjectAssignment.
  const classGroups =
    setupScope.scoped && setupScope.classGroupIds.length === 0
      ? []
      : await db
          .selectDistinct({
            class_group_id: ClassGroup.class_group_id,
            name: ClassGroup.name,
            grade_name: Grade.name,
            level_order: Grade.level_order,
          })
          .from(ClassGroup)
          .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
          .innerJoin(
            TeacherSubjectAssignment,
            and(
              eq(
                TeacherSubjectAssignment.class_group_id,
                ClassGroup.class_group_id,
              ),
              eq(TeacherSubjectAssignment.academic_year_id, yearId),
            ),
          )
          .where(setupScopeFilter)
          .orderBy(Grade.level_order, ClassGroup.name);

  // Get subjects - if class_group_id is provided, filter by that class group
  let subjects: any[];
  let subjectTeachers: any[];

  if (classGroupId) {
    // Get subjects assigned to this class group via TeacherSubjectAssignment
    const classGroupSubjects = await db
      .select({
        subject_id: TeacherSubjectAssignment.subject_id,
        class_group_id: TeacherSubjectAssignment.class_group_id,
        user_id: TeacherSubjectAssignment.user_id,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      })
      .from(TeacherSubjectAssignment)
      .leftJoin(
        UserProfile,
        eq(TeacherSubjectAssignment.user_id, UserProfile.user_id),
      )
      // Year-scoped: without this, a class group carried over from a prior
      // year offered that year's subject/teacher pairs in the slot form.
      .where(
        and(
          eq(TeacherSubjectAssignment.class_group_id, classGroupId),
          eq(TeacherSubjectAssignment.academic_year_id, yearId),
        ),
      );

    // Get unique subject IDs
    const subjectIds = [
      ...new Set(classGroupSubjects.map((s) => s.subject_id)),
    ];

    // Get subject details for these subjects
    // Use inArray() — NOT sql`IN (${ids.join(",")})` which Drizzle binds as a
    // single string parameter, causing MySQL to coerce "1,2,3" → 1 only.
    if (subjectIds.length > 0) {
      subjects = await db
        .select({
          subject_id: Subject.subject_id,
          name: Subject.name,
          code: Subject.code,
        })
        .from(Subject)
        .where(
          and(
            eq(Subject.status, "ACTIVE"),
            inArray(Subject.subject_id, subjectIds),
          ),
        )
        .orderBy(Subject.name);
    } else {
      subjects = [];
    }

    // Map teachers to subjects for this class group
    subjectTeachers = classGroupSubjects;
  } else {
    // Get all subjects with their assigned teachers for this term
    subjectTeachers = await db
      .select({
        subject_id: TeacherSubjectAssignment.subject_id,
        class_group_id: TeacherSubjectAssignment.class_group_id,
        user_id: TeacherSubjectAssignment.user_id,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      })
      .from(TeacherSubjectAssignment)
      .innerJoin(
        ClassGroup,
        eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
      )
      .leftJoin(
        UserProfile,
        eq(TeacherSubjectAssignment.user_id, UserProfile.user_id),
      )
      .where(eq(TeacherSubjectAssignment.academic_year_id, yearId));

    // Get all active subjects
    subjects = await db
      .select({
        subject_id: Subject.subject_id,
        name: Subject.name,
        code: Subject.code,
      })
      .from(Subject)
      .where(eq(Subject.status, "ACTIVE"))
      .orderBy(Subject.name);
  }

  // Map teachers to subjects with class_group_id
  const subjectTeacherMap: Record<
    number,
    {
      user_id: number;
      first_name: string;
      last_name: string;
      class_group_id: number;
    }[]
  > = {};
  subjectTeachers.forEach((st) => {
    if (!subjectTeacherMap[st.subject_id]) {
      subjectTeacherMap[st.subject_id] = [];
    }
    subjectTeacherMap[st.subject_id].push({
      user_id: st.user_id,
      first_name: st.first_name || "",
      last_name: st.last_name || "",
      class_group_id: st.class_group_id,
    });
  });

  // Add teachers to subjects
  const subjectsWithTeachers = subjects.map((s) => ({
    ...s,
    teachers: subjectTeacherMap[s.subject_id] || [],
  }));

  successResponse(res, "Calendar setup data retrieved successfully", {
    academic_term_id: termId,
    class_groups: classGroups, // Always return all class groups
    subjects: subjectsWithTeachers,
  });
});

// ============================================
// Academic Calendar Management
// ============================================

// Create a new academic calendar (associates year, term, and class group)
export const createAcademicCalendar = asyncHandler(
  async (req: any, res: any) => {
    const {
      academic_year_id,
      academic_term_id,
      class_group_id,
      name,
      description,
    } = req.body;

    // Validation
    if (!academic_year_id || !academic_term_id || !class_group_id) {
      throw new ValidationError(
        "Academic year, term, and class group are required",
      );
    }

    await assertClassGroupWritable(req, class_group_id, academic_year_id);

    // Check if calendar already exists for this combination
    const existingCalendar = await db
      .select()
      .from(AcademicCalendar)
      .where(
        and(
          eq(AcademicCalendar.academic_year_id, academic_year_id),
          eq(AcademicCalendar.academic_term_id, academic_term_id),
          eq(AcademicCalendar.class_group_id, class_group_id),
        ),
      )
      .limit(1);

    if (existingCalendar.length > 0) {
      throw new ConflictError(
        "A calendar already exists for this academic year, term, and class group combination",
      );
    }

    const result = await db.insert(AcademicCalendar).values({
      academic_year_id,
      academic_term_id,
      class_group_id,
      name: name || null,
      description: description || null,
    });

    const resultHeader = Array.isArray(result) ? result[0] : result;
    const calendarId = (resultHeader as any).insertId;

    logger.info("Academic calendar created", {
      calendarId,
      academic_year_id,
      academic_term_id,
      class_group_id,
      userId: req.user?.userId || req.user?.user_id || req.user?.id,
    });

    successResponse(res, "Academic calendar created successfully", {
      calendar_id: calendarId,
    });
  },
);

// Get all academic calendars with filters
export const getAcademicCalendars = asyncHandler(async (req: any, res: any) => {
  const { academic_year_id, academic_term_id, class_group_id, is_active } =
    req.query;

  const filters: SQL[] = [];

  if (academic_year_id) {
    filters.push(
      eq(AcademicCalendar.academic_year_id, parseInt(academic_year_id)),
    );
  }
  if (academic_term_id) {
    filters.push(
      eq(AcademicCalendar.academic_term_id, parseInt(academic_term_id)),
    );
  }
  if (class_group_id) {
    filters.push(eq(AcademicCalendar.class_group_id, parseInt(class_group_id)));
  }
  if (is_active !== undefined) {
    filters.push(eq(AcademicCalendar.is_active, parseInt(is_active)));
  }

  // Same confinement the slot list applies: a class teacher may only list the
  // calendars of the class groups they were assigned.
  const allowedClassGroups = await readableClassGroupIds(
    req,
    academic_year_id ? parseInt(academic_year_id) : undefined,
  );
  if (allowedClassGroups !== null) {
    if (allowedClassGroups.length === 0) {
      return successResponse(
        res,
        "Academic calendars retrieved successfully",
        [],
      );
    }
    filters.push(inArray(AcademicCalendar.class_group_id, allowedClassGroups));
  }

  const calendars = await db
    .select({
      calendar_id: AcademicCalendar.calendar_id,
      academic_year_id: AcademicCalendar.academic_year_id,
      academic_term_id: AcademicCalendar.academic_term_id,
      class_group_id: AcademicCalendar.class_group_id,
      name: AcademicCalendar.name,
      description: AcademicCalendar.description,
      is_active: AcademicCalendar.is_active,
      created_at: AcademicCalendar.created_at,
      updated_at: AcademicCalendar.updated_at,
      // Related data
      academic_year_name: AcademicYear.name,
      academic_term_name: AcademicTerm.name,
      class_group_name: ClassGroup.name,
      grade_name: Grade.name,
    })
    .from(AcademicCalendar)
    .leftJoin(
      AcademicYear,
      eq(AcademicCalendar.academic_year_id, AcademicYear.academic_year_id),
    )
    .leftJoin(
      AcademicTerm,
      eq(AcademicCalendar.academic_term_id, AcademicTerm.academic_term_id),
    )
    .leftJoin(
      ClassGroup,
      eq(AcademicCalendar.class_group_id, ClassGroup.class_group_id),
    )
    .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(AcademicYear.name, AcademicTerm.name, ClassGroup.name);

  successResponse(res, "Academic calendars retrieved successfully", calendars);
});

// Get a single academic calendar by ID
export const getAcademicCalendar = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;

  const calendars = await db
    .select({
      calendar_id: AcademicCalendar.calendar_id,
      academic_year_id: AcademicCalendar.academic_year_id,
      academic_term_id: AcademicCalendar.academic_term_id,
      class_group_id: AcademicCalendar.class_group_id,
      name: AcademicCalendar.name,
      description: AcademicCalendar.description,
      is_active: AcademicCalendar.is_active,
      created_at: AcademicCalendar.created_at,
      updated_at: AcademicCalendar.updated_at,
      // Related data
      academic_year_name: AcademicYear.name,
      academic_term_name: AcademicTerm.name,
      class_group_name: ClassGroup.name,
      grade_name: Grade.name,
    })
    .from(AcademicCalendar)
    .leftJoin(
      AcademicYear,
      eq(AcademicCalendar.academic_year_id, AcademicYear.academic_year_id),
    )
    .leftJoin(
      AcademicTerm,
      eq(AcademicCalendar.academic_term_id, AcademicTerm.academic_term_id),
    )
    .leftJoin(
      ClassGroup,
      eq(AcademicCalendar.class_group_id, ClassGroup.class_group_id),
    )
    .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .where(eq(AcademicCalendar.calendar_id, parseInt(id)))
    .limit(1);

  if (calendars.length === 0) {
    throw new NotFoundError("Academic calendar not found");
  }

  successResponse(
    res,
    "Academic calendar retrieved successfully",
    calendars[0],
  );
});

// Update an academic calendar
export const updateAcademicCalendar = asyncHandler(
  async (req: any, res: any) => {
    const { id } = req.params;
    const { name, description, is_active } = req.body;

    const existingCalendar = await db
      .select()
      .from(AcademicCalendar)
      .where(eq(AcademicCalendar.calendar_id, parseInt(id)))
      .limit(1);

    if (existingCalendar.length === 0) {
      throw new NotFoundError("Academic calendar not found");
    }

    await assertClassGroupWritable(
      req,
      existingCalendar[0].class_group_id,
      existingCalendar[0].academic_year_id,
    );

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (is_active !== undefined) updateData.is_active = is_active;

    await db
      .update(AcademicCalendar)
      .set(updateData)
      .where(eq(AcademicCalendar.calendar_id, parseInt(id)));

    logger.info("Academic calendar updated", {
      calendarId: id,
      userId: req.user?.userId || req.user?.user_id || req.user?.id,
    });

    successResponse(res, "Academic calendar updated successfully");
  },
);

// Delete an academic calendar
export const deleteAcademicCalendar = asyncHandler(
  async (req: any, res: any) => {
    const { id } = req.params;

    const existingCalendar = await db
      .select()
      .from(AcademicCalendar)
      .where(eq(AcademicCalendar.calendar_id, parseInt(id)))
      .limit(1);

    if (existingCalendar.length === 0) {
      throw new NotFoundError("Academic calendar not found");
    }

    // Check if there are slots associated with this calendar
    await assertClassGroupWritable(
      req,
      existingCalendar[0].class_group_id,
      existingCalendar[0].academic_year_id,
    );

    const slotsWithCalendar = await db
      .select()
      .from(CalendarSlot)
      .where(eq(CalendarSlot.calendar_id, parseInt(id)))
      .limit(1);

    if (slotsWithCalendar.length > 0) {
      throw new ValidationError(
        "Cannot delete calendar with associated slots. Please delete slots first.",
      );
    }

    await db
      .delete(AcademicCalendar)
      .where(eq(AcademicCalendar.calendar_id, parseInt(id)));

    logger.info("Academic calendar deleted", {
      calendarId: id,
      userId: req.user?.userId || req.user?.user_id || req.user?.id,
    });

    successResponse(res, "Academic calendar deleted successfully");
  },
);

// Get class groups for calendar creation (grouped by academic year and term)
export const getCalendarClassGroups = asyncHandler(
  async (req: any, res: any) => {
    const { academic_year_id } = req.query;

    const yearId = Number(academic_year_id);

    if (!yearId || isNaN(yearId)) {
      throw new ValidationError("Academic year is required");
    }

    // A class teacher leads *one class group*, not a whole grade -- L3 Class A
    // and L3 Class B are different assignments held by different people. Clamp
    // on class_group_id so the picker offers exactly what the caller was
    // assigned in their auth payload, and enforce it here rather than
    // filtering in the browser so the dropdown and the data behind it agree.
    const scope = await resolveUserScope(req.user?.userId, yearId);
    const scopeFilter =
      scope.scoped && scope.classGroupIds.length > 0
        ? inArray(ClassGroup.class_group_id, scope.classGroupIds)
        : undefined;

    // Get class groups that have a teacher assignment in this academic
    // year -- ClassGroup itself is a permanent label with no year of its
    // own, so "for this academic year" is derived via TeacherSubjectAssignment.
    const classGroups =
      scope.scoped && scope.classGroupIds.length === 0
        ? []
        : await db
            .selectDistinct({
              class_group_id: ClassGroup.class_group_id,
              name: ClassGroup.name,
              grade_id: ClassGroup.grade_id,
              grade_name: Grade.name,
              grade_level: Grade.level_order,
            })
            .from(ClassGroup)
            .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
            .innerJoin(
              TeacherSubjectAssignment,
              and(
                eq(
                  TeacherSubjectAssignment.class_group_id,
                  ClassGroup.class_group_id,
                ),
                eq(TeacherSubjectAssignment.academic_year_id, yearId),
              ),
            )
            .where(scopeFilter)
            .orderBy(Grade.level_order, ClassGroup.name);

    successResponse(res, "Class groups retrieved successfully", classGroups);
  },
);

// Get the class groups the current teacher is assigned to teach in
export const getMyClassGroups = asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.userId || req.user?.user_id || req.user?.id;
  const { academic_year_id } = req.query;

  let yearId = academic_year_id ? parseInt(academic_year_id) : null;

  if (!yearId) {
    const currentYear = await db
      .select({ academic_year_id: AcademicYear.academic_year_id })
      .from(AcademicYear)
      .where(eq(AcademicYear.is_current, 1))
      .limit(1);

    if (currentYear.length > 0) {
      yearId = currentYear[0].academic_year_id;
    }
  }

  if (!yearId) {
    throw new ValidationError("No academic year specified or found");
  }

  const classGroups = await db
    .selectDistinct({
      class_group_id: ClassGroup.class_group_id,
      name: ClassGroup.name,
      grade_name: Grade.name,
      grade_level: Grade.level_order,
    })
    .from(TeacherSubjectAssignment)
    .innerJoin(
      ClassGroup,
      eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
    )
    .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, userId),
        eq(TeacherSubjectAssignment.academic_year_id, yearId),
      ),
    )
    .orderBy(Grade.level_order, ClassGroup.name);

  successResponse(res, "Class groups retrieved successfully", classGroups);
});
