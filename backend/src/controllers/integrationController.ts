import { and, asc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ValidationError } from "../errors/CustomError";
import {
  AcademicCalendar,
  AcademicTerm,
  AcademicYear,
  AssessmentScore,
  SubjectCompetency,
  CompetencyPerformanceCriteria,
  CalendarActivity,
  CalendarSlot,
  ClassGroup,
  Grade,
  GradeSubject,
  LO_IndicativeContent,
  LO_LearningOutcome,
  LO_LearningOutcomeActivity,
  LO_LearningOutcomeResource,
  LO_Lesson,
  LO_LessonAssignment,
  LO_LessonEvaluation,
  LO_LessonSection,
  LessonNote,
  Program,
  Role,
  SchemeOfWork,
  SchemeOfWorkEntry,
  School,
  StudentClassGroup,
  StudentSubjectEnrollment,
  Subject,
  TeacherSubjectAssignment,
  User,
  UserGrade,
  UserProfile,
  UserRole,
} from "../db/schema";

/**
 * Read-only sync API for partner systems (Ganzaa).
 *
 * WHY THIS EXISTS RATHER THAN REUSING /users AND /academics/*
 *
 * Those endpoints are built for a person clicking around the MIS UI: one
 * resource per call, a user's roles/grades/programs behind three more calls
 * each. A partner pulling the whole school that way costs 1 + 4N requests —
 * thousands of round trips for a few thousand rows, most of it re-fetched every
 * run because none of them can say "only what changed".
 *
 * So this exposes three calls instead:
 *
 *   GET /integrations/sync/reference  — the academic skeleton, whole
 *   GET /integrations/sync/people     — people + their links, keyset-paged
 *   GET /integrations/sync/academics  — the work itself: notes, schemes, lesson
 *                                       plans, timetables, marks
 *
 * and all obey the same two rules: every child collection is fetched with ONE
 * batched `IN (...)` query and grouped in memory (never per-parent), and paging
 * is keyset, never OFFSET, so page 40 costs the same as page 1.
 *
 * SCOPING — READ THIS BEFORE ASSUMING A SCHOOL FILTER EXISTS
 *
 * In this schema only School, SchoolSystemAssignment and RoleSystemFragment
 * carry a `school_id`. User, Program, Grade, Subject, ClassGroup, AcademicYear
 * and every link table between them do NOT. Academic data in this instance is
 * therefore global, and no endpoint here can honestly filter by school — a
 * `school_id` parameter would be a lie that silently returned everything.
 *
 * The consequence for the caller is explicit in the payload: `scope.schoolFilter`
 * is always "instance", meaning "this is the whole MIS instance, not one
 * school". If academic data ever becomes school-scoped, add the column, filter
 * here, and change that value — the partner can then detect the change instead
 * of guessing.
 */

/** Reference data has no updated_at columns, so it is always sent whole. */
const REFERENCE_IS_DELTA_CAPABLE = false;

/** Keyset page size for /people. Bounded so one call can't pin the DB. */
const DEFAULT_PAGE = 500;
const MAX_PAGE = 2000;

function parseSince(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError(
      "`since` must be an ISO-8601 timestamp, e.g. 2026-08-15T00:00:00Z",
    );
  }
  return d;
}

function parseCursor(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new ValidationError("`cursor` must be a non-negative integer user id");
  }
  return n;
}

function parseLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_PAGE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError("`limit` must be a positive integer");
  }
  return Math.min(n, MAX_PAGE);
}

/** Group rows by a numeric key in one pass. */
function groupBy<T>(rows: T[], key: (row: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = out.get(k);
    if (bucket) bucket.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/**
 * GET /integrations/ping
 *
 * Cheap identity + reachability check, for the "Test connection" button on the
 * partner's settings screen. Returns who the token is and how much data stands
 * behind it, so a misconfigured base URL or a token pointed at the wrong
 * environment is obvious immediately rather than at 2am during the first sync.
 */
export const ping = asyncHandler(async (req: any, res: any) => {
  const [[users], [subjects], [classGroups], [schools]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(User),
    db.select({ n: sql<number>`count(*)` }).from(Subject),
    db.select({ n: sql<number>`count(*)` }).from(ClassGroup),
    db.select({ n: sql<number>`count(*)` }).from(School),
  ]);

  successResponse(res, "Integration token is valid", {
    client: {
      name: req.service.name,
      scopes: req.service.scopes,
    },
    scope: {
      schoolFilter: "instance",
      note: "Academic data in this MIS is not school-scoped; this token returns the whole instance.",
    },
    counts: {
      users: Number(users?.n ?? 0),
      subjects: Number(subjects?.n ?? 0),
      classGroups: Number(classGroups?.n ?? 0),
      schools: Number(schools?.n ?? 0),
    },
    serverTime: new Date().toISOString(),
  });
});

/**
 * GET /integrations/sync/reference
 *
 * The academic skeleton a partner needs before it can place a single person:
 * academic years and terms, programs, grades, subjects (with their grade links),
 * class groups, and the role catalogue.
 *
 * Sent whole every time, because none of these tables carry an updated_at to
 * filter on. That is a deliberate trade, not an oversight: the whole payload is
 * a few thousand small rows fetched in one round of parallel queries, which is
 * cheaper than the schema migration and write-path changes that per-row change
 * tracking would need. `delta.supported: false` tells the caller not to bother
 * sending `since` here.
 */
export const syncReference = asyncHandler(async (_req: any, res: any) => {
  const [
    years,
    terms,
    programs,
    grades,
    subjects,
    gradeSubjects,
    classGroups,
    roles,
  ] = await Promise.all([
    db
      .select({
        id: AcademicYear.academic_year_id,
        name: AcademicYear.name,
        startDate: AcademicYear.start_date,
        endDate: AcademicYear.end_date,
        isCurrent: AcademicYear.is_current,
      })
      .from(AcademicYear)
      .orderBy(asc(AcademicYear.academic_year_id)),
    db
      .select({
        id: AcademicTerm.academic_term_id,
        academicYearId: AcademicTerm.academic_year_id,
        name: AcademicTerm.name,
        startDate: AcademicTerm.start_date,
        endDate: AcademicTerm.end_date,
        isCurrent: AcademicTerm.is_current,
      })
      .from(AcademicTerm)
      .orderBy(asc(AcademicTerm.academic_term_id)),
    db
      .select({
        id: Program.program_id,
        name: Program.name,
        description: Program.description,
      })
      .from(Program)
      .orderBy(asc(Program.program_id)),
    db
      .select({
        id: Grade.grade_id,
        programId: Grade.program_id,
        name: Grade.name,
        levelOrder: Grade.level_order,
      })
      .from(Grade)
      .orderBy(asc(Grade.grade_id)),
    db
      .select({
        id: Subject.subject_id,
        code: Subject.code,
        name: Subject.name,
        description: Subject.description,
        courseCategoryId: Subject.course_category_id,
        maxMarks: Subject.max_marks,
        color: Subject.color,
        status: Subject.status,
      })
      .from(Subject)
      .orderBy(asc(Subject.subject_id)),
    db
      .select({
        gradeId: GradeSubject.grade_id,
        subjectId: GradeSubject.subject_id,
      })
      .from(GradeSubject),
    db
      .select({
        id: ClassGroup.class_group_id,
        gradeId: ClassGroup.grade_id,
        name: ClassGroup.name,
      })
      .from(ClassGroup)
      .orderBy(asc(ClassGroup.class_group_id)),
    db
      .select({
        id: Role.role_id,
        name: Role.name,
        description: Role.description,
        status: Role.status,
      })
      .from(Role)
      .orderBy(asc(Role.role_id)),
  ]);

  successResponse(res, "Reference data retrieved", {
    scope: { schoolFilter: "instance" },
    delta: {
      supported: REFERENCE_IS_DELTA_CAPABLE,
      reason: "Reference tables carry no updated_at column",
    },
    generatedAt: new Date().toISOString(),
    academicYears: years,
    academicTerms: terms,
    programs,
    grades,
    subjects,
    gradeSubjects,
    classGroups,
    roles,
  });
});

/**
 * GET /integrations/sync/people?since=&cursor=&limit=
 *
 * People and every link that decides what they are: profile, roles, class-group
 * membership, subject enrolments, teaching assignments, grade assignments.
 *
 * Paged by keyset on user_id — `cursor` is the last id you received, NOT a page
 * number. OFFSET was rejected on purpose: it re-walks every skipped row, so a
 * later page gets slower exactly when a big sync needs it not to, and rows
 * shifting mid-run can silently skip a user.
 *
 * `since` filters on User.updated_at for incremental runs. Note the honest
 * limitation: it tracks changes to the USER row, so a student who is moved
 * between class groups without their own row being touched will not appear in a
 * delta run. Callers should do a full pass (no `since`) periodically — the
 * response says as much in `delta.caveat` rather than leaving it to be
 * discovered.
 */
export const syncPeople = asyncHandler(async (req: any, res: any) => {
  const since = parseSince(req.query.since);
  const cursor = parseCursor(req.query.cursor);
  const limit = parseLimit(req.query.limit);

  const filters = [gt(User.user_id, cursor)];
  if (since) filters.push(gte(User.updated_at, since));

  // One page of users. Everything below is keyed off exactly these ids.
  const users = await db
    .select({
      id: User.user_id,
      username: User.username,
      email: User.email,
      phone: User.phone_number,
      status: User.status,
      preferredTheme: User.preferred_theme,
      createdAt: User.created_at,
      updatedAt: User.updated_at,
      firstName: UserProfile.first_name,
      lastName: UserProfile.last_name,
      gender: UserProfile.gender,
      dateOfBirth: UserProfile.date_of_birth,
      address: UserProfile.address,
      userType: UserProfile.user_type,
      externalId: UserProfile.external_id,
    })
    .from(User)
    .leftJoin(UserProfile, eq(UserProfile.user_id, User.user_id))
    .where(and(...filters))
    .orderBy(asc(User.user_id))
    .limit(limit);

  const ids = users.map((u) => u.id);

  // Five batched lookups, not five-per-user. With no ids we skip the queries
  // entirely rather than issue `IN ()`, which is a syntax error in MySQL.
  const [roleRows, classGroupRows, subjectRows, teachingRows, gradeRows] =
    ids.length === 0
      ? [[], [], [], [], []]
      : await Promise.all([
          db
            .select({
              userId: UserRole.user_id,
              roleId: UserRole.role_id,
              roleName: Role.name,
            })
            .from(UserRole)
            .innerJoin(Role, eq(Role.role_id, UserRole.role_id))
            .where(inArray(UserRole.user_id, ids)),
          db
            .select({
              userId: StudentClassGroup.user_id,
              classGroupId: StudentClassGroup.class_group_id,
              academicYearId: StudentClassGroup.academic_year_id,
              assignedAt: StudentClassGroup.assigned_at,
              status: StudentClassGroup.status,
            })
            .from(StudentClassGroup)
            .where(inArray(StudentClassGroup.user_id, ids)),
          db
            .select({
              userId: StudentSubjectEnrollment.user_id,
              subjectId: StudentSubjectEnrollment.subject_id,
              academicYearId: StudentSubjectEnrollment.academic_year_id,
              enrolledAt: StudentSubjectEnrollment.enrolled_at,
              status: StudentSubjectEnrollment.status,
            })
            .from(StudentSubjectEnrollment)
            .where(inArray(StudentSubjectEnrollment.user_id, ids)),
          db
            .select({
              userId: TeacherSubjectAssignment.user_id,
              subjectId: TeacherSubjectAssignment.subject_id,
              classGroupId: TeacherSubjectAssignment.class_group_id,
              academicYearId: TeacherSubjectAssignment.academic_year_id,
              assignedAt: TeacherSubjectAssignment.assigned_at,
            })
            .from(TeacherSubjectAssignment)
            .where(inArray(TeacherSubjectAssignment.user_id, ids)),
          db
            .select({
              userId: UserGrade.user_id,
              gradeId: UserGrade.grade_id,
              classGroupId: UserGrade.class_group_id,
              academicYearId: UserGrade.academic_year_id,
              assignedAt: UserGrade.assigned_at,
            })
            .from(UserGrade)
            .where(inArray(UserGrade.user_id, ids)),
        ]);

  const byRole = groupBy(roleRows, (r) => Number(r.userId));
  const byClassGroup = groupBy(classGroupRows, (r) => Number(r.userId));
  const bySubject = groupBy(subjectRows, (r) => Number(r.userId));
  const byTeaching = groupBy(teachingRows, (r) => Number(r.userId));
  const byGrade = groupBy(gradeRows, (r) => Number(r.userId));

  const data = users.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    phone: u.phone,
    status: u.status,
    preferredTheme: u.preferredTheme,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    profile: {
      firstName: u.firstName,
      lastName: u.lastName,
      fullName: [u.firstName, u.lastName].filter(Boolean).join(" ") || null,
      gender: u.gender,
      dateOfBirth: u.dateOfBirth,
      address: u.address,
      userType: u.userType,
      externalId: u.externalId,
    },
    roles: (byRole.get(u.id) ?? []).map((r) => ({
      id: r.roleId,
      name: r.roleName,
    })),
    classGroups: byClassGroup.get(u.id) ?? [],
    subjectEnrollments: bySubject.get(u.id) ?? [],
    teachingAssignments: byTeaching.get(u.id) ?? [],
    gradeAssignments: byGrade.get(u.id) ?? [],
  }));

  // A full page means "there may be more"; a short page is the end. This never
  // claims hasMore on an exactly-full final page being followed by an empty one,
  // which is harmless — the caller just makes one extra request that returns [].
  const nextCursor = data.length === limit ? data[data.length - 1].id : null;

  successResponse(res, "People retrieved", {
    scope: { schoolFilter: "instance" },
    delta: {
      supported: true,
      appliedSince: since ? since.toISOString() : null,
      caveat:
        "Filters on User.updated_at only. Link-table changes (class group, enrolment) do not touch the user row, so run a full pass periodically.",
    },
    generatedAt: new Date().toISOString(),
    pagination: {
      limit,
      returned: data.length,
      cursor,
      nextCursor,
      hasMore: nextCursor !== null,
    },
    users: data,
  });
});

/**
 * GET /integrations/sync/academics?since=
 *
 * /reference says what the school teaches and /people says who is in it. This
 * says what actually HAPPENS: the lesson notes teachers wrote, the schemes of
 * work those notes hang off, the structured lesson plans, the weekly timetable,
 * and the marks. A partner mirroring the school needs all three — without this
 * one it imports an empty timetable and a roster with nothing to do.
 *
 * Everything here is keyed by the ids /reference and /people already handed
 * over (subject, class group, term, user), so the caller resolves foreign keys
 * against maps it has rather than against ids embedded in prose.
 *
 * NO PAGING, deliberately. Unlike users, these tables are bounded by how much
 * teaching a school has recorded, and the whole payload is one round of
 * parallel queries. The one row here that can be genuinely large is
 * LessonNote.content_html, so `since` (applied to the tables that carry an
 * updated_at) is the pressure valve: an incremental run sends the notes that
 * changed, not every note ever written. `truncation` in the response reports
 * whether any collection hit its ceiling, so a caller is never quietly handed a
 * partial mirror it believes is complete.
 */

/** Ceiling per collection. Hitting it is reported, never silent. */
const ACADEMICS_MAX_ROWS = 5000;

export const syncAcademics = asyncHandler(async (req: any, res: any) => {
  const since = parseSince(req.query.since);

  // `since` only applies where the table actually records one. LO_* and the
  // scheme entries carry created_at at best, so they are always sent whole —
  // saying otherwise would drop rows a caller thinks it received.
  const noteFilter = since ? gte(LessonNote.updated_at, since) : undefined;
  const schemeFilter = since ? gte(SchemeOfWork.updated_at, since) : undefined;
  const calendarFilter = since
    ? gte(AcademicCalendar.updated_at, since)
    : undefined;
  const slotFilter = since ? gte(CalendarSlot.updated_at, since) : undefined;
  const activityFilter = since
    ? gte(CalendarActivity.updated_at, since)
    : undefined;

  const [notes, schemes, lessons, calendars, slots, activities, competencies, scores] =
    await Promise.all([
      db
        .select({
          id: LessonNote.note_id,
          userId: LessonNote.user_id,
          subjectId: LessonNote.subject_id,
          classGroupId: LessonNote.class_group_id,
          schemeEntryId: LessonNote.scheme_entry_id,
          academicTermId: LessonNote.academic_term_id,
          title: LessonNote.title,
          contentJson: LessonNote.content_json,
          contentHtml: LessonNote.content_html,
          status: LessonNote.status,
          source: LessonNote.source,
          createdAt: LessonNote.created_at,
          updatedAt: LessonNote.updated_at,
        })
        .from(LessonNote)
        .where(noteFilter)
        .orderBy(asc(LessonNote.note_id))
        .limit(ACADEMICS_MAX_ROWS),
      db
        .select({
          id: SchemeOfWork.scheme_id,
          userId: SchemeOfWork.user_id,
          subjectId: SchemeOfWork.subject_id,
          classGroupId: SchemeOfWork.class_group_id,
          academicTermId: SchemeOfWork.academic_term_id,
          validationStatus: SchemeOfWork.validation_status,
          source: SchemeOfWork.source,
          createdAt: SchemeOfWork.created_at,
          updatedAt: SchemeOfWork.updated_at,
        })
        .from(SchemeOfWork)
        .where(schemeFilter)
        .orderBy(asc(SchemeOfWork.scheme_id))
        .limit(ACADEMICS_MAX_ROWS),
      db
        .select({
          id: LO_Lesson.id,
          entryId: LO_Lesson.entry_id,
          userId: LO_Lesson.user_id,
          moduleCode: LO_Lesson.module_code,
          moduleName: LO_Lesson.module_name,
          week: LO_Lesson.week,
          term: LO_Lesson.term,
          schoolYear: LO_Lesson.school_year,
          className: LO_Lesson.class_name,
          lessonDate: LO_Lesson.lesson_date,
          startTime: LO_Lesson.start_time,
          endTime: LO_Lesson.end_time,
          instructorName: LO_Lesson.instructor_name,
          bigQuestion: LO_Lesson.big_question,
          totalDurationMinutes: LO_Lesson.total_duration_minutes,
          createdAt: LO_Lesson.created_at,
        })
        .from(LO_Lesson)
        .orderBy(asc(LO_Lesson.id))
        .limit(ACADEMICS_MAX_ROWS),
      db
        .select({
          id: AcademicCalendar.calendar_id,
          academicYearId: AcademicCalendar.academic_year_id,
          academicTermId: AcademicCalendar.academic_term_id,
          classGroupId: AcademicCalendar.class_group_id,
          name: AcademicCalendar.name,
          description: AcademicCalendar.description,
          isActive: AcademicCalendar.is_active,
          createdAt: AcademicCalendar.created_at,
          updatedAt: AcademicCalendar.updated_at,
        })
        .from(AcademicCalendar)
        .where(calendarFilter)
        .orderBy(asc(AcademicCalendar.calendar_id))
        .limit(ACADEMICS_MAX_ROWS),
      db
        .select({
          id: CalendarSlot.slot_id,
          calendarId: CalendarSlot.calendar_id,
          // No academicYearId: CalendarSlot has an academic_year_id column in
          // MySQL that schema.ts does not declare and that is NULL in every
          // row. The year is reachable through the term either way, so the
          // caller loses nothing and this avoids exporting a field that is
          // always null.
          academicTermId: CalendarSlot.academic_term_id,
          classGroupId: CalendarSlot.class_group_id,
          subjectId: CalendarSlot.subject_id,
          userId: CalendarSlot.user_id,
          dayOfWeek: CalendarSlot.day_of_week,
          startTime: CalendarSlot.start_time,
          endTime: CalendarSlot.end_time,
          location: CalendarSlot.location,
          color: CalendarSlot.color,
          notes: CalendarSlot.notes,
          isActive: CalendarSlot.is_active,
          createdAt: CalendarSlot.created_at,
          updatedAt: CalendarSlot.updated_at,
        })
        .from(CalendarSlot)
        .where(slotFilter)
        .orderBy(asc(CalendarSlot.slot_id))
        .limit(ACADEMICS_MAX_ROWS),
      db
        .select({
          id: CalendarActivity.activity_id,
          // See CalendarSlot above — same undeclared, always-null column.
          academicTermId: CalendarActivity.academic_term_id,
          classGroupId: CalendarActivity.class_group_id,
          name: CalendarActivity.activity_name,
          activityType: CalendarActivity.activity_type,
          dayOfWeek: CalendarActivity.day_of_week,
          startDate: CalendarActivity.start_date,
          endDate: CalendarActivity.end_date,
          startTime: CalendarActivity.start_time,
          endTime: CalendarActivity.end_time,
          location: CalendarActivity.location,
          description: CalendarActivity.description,
          color: CalendarActivity.color,
          isRecurring: CalendarActivity.is_recurring,
          isActive: CalendarActivity.is_active,
          createdAt: CalendarActivity.created_at,
          updatedAt: CalendarActivity.updated_at,
        })
        .from(CalendarActivity)
        .where(activityFilter)
        .orderBy(asc(CalendarActivity.activity_id))
        .limit(ACADEMICS_MAX_ROWS),
      // Curriculum — the Elements of Competency a subject is taught against, and
      // the performance criteria under each. This is the spine of what a course
      // IS: a partner mirroring lesson notes and schemes without it has the
      // paperwork and none of the curriculum the paperwork refers to.
      //
      // Sent whole: neither table carries updated_at, and the whole catalogue is
      // a few hundred short rows.
      db
        .select({
          id: SubjectCompetency.competency_id,
          subjectId: SubjectCompetency.subject_id,
          elementNumber: SubjectCompetency.element_number,
          title: SubjectCompetency.title,
          description: SubjectCompetency.description,
          indicativeContent: SubjectCompetency.indicative_content,
          learningHours: SubjectCompetency.learning_hours,
          sortOrder: SubjectCompetency.sort_order,
        })
        .from(SubjectCompetency)
        .orderBy(asc(SubjectCompetency.subject_id), asc(SubjectCompetency.sort_order))
        .limit(ACADEMICS_MAX_ROWS),
      db
        .select({
          id: AssessmentScore.score_id,
          studentId: AssessmentScore.student_id,
          subjectId: AssessmentScore.subject_id,
          academicYearId: AssessmentScore.academic_year_id,
          term: AssessmentScore.term,
          assessmentType: AssessmentScore.assessment_type,
          title: AssessmentScore.title,
          score: AssessmentScore.score,
          maxScore: AssessmentScore.max_score,
          assessedAt: AssessmentScore.assessed_at,
          recordedBy: AssessmentScore.recorded_by,
          createdAt: AssessmentScore.created_at,
        })
        .from(AssessmentScore)
        .orderBy(asc(AssessmentScore.score_id))
        .limit(ACADEMICS_MAX_ROWS),
    ]);

  // Children, one batched query each — keyed to the parents just fetched, so a
  // `since`-filtered run doesn't drag along entries for schemes it isn't sending.
  const schemeIds = schemes.map((s) => s.id);
  const lessonIds = lessons.map((l) => l.id);
  const competencyIds = competencies.map((c) => c.id);

  const criteria =
    competencyIds.length === 0
      ? []
      : await db
          .select({
            id: CompetencyPerformanceCriteria.criteria_id,
            competencyId: CompetencyPerformanceCriteria.competency_id,
            criteriaNumber: CompetencyPerformanceCriteria.criteria_number,
            description: CompetencyPerformanceCriteria.description,
            sortOrder: CompetencyPerformanceCriteria.sort_order,
          })
          .from(CompetencyPerformanceCriteria)
          .where(inArray(CompetencyPerformanceCriteria.competency_id, competencyIds))
          .orderBy(
            asc(CompetencyPerformanceCriteria.competency_id),
            asc(CompetencyPerformanceCriteria.sort_order),
          );

  const [entries, outcomes, sections, indicative, assignments, evaluations] =
    await Promise.all([
      schemeIds.length === 0
        ? []
        : db
            .select({
              id: SchemeOfWorkEntry.entry_id,
              schemeId: SchemeOfWorkEntry.scheme_id,
              weekNumber: SchemeOfWorkEntry.week_number,
              startDate: SchemeOfWorkEntry.start_date,
              endDate: SchemeOfWorkEntry.end_date,
              topic: SchemeOfWorkEntry.topic,
              subTopic: SchemeOfWorkEntry.sub_topic,
              objective: SchemeOfWorkEntry.objective,
              methodology: SchemeOfWorkEntry.methodology,
              resources: SchemeOfWorkEntry.resources,
              evaluation: SchemeOfWorkEntry.evaluation,
              duration: SchemeOfWorkEntry.duration,
              learningPlace: SchemeOfWorkEntry.learning_place,
              observation: SchemeOfWorkEntry.observation,
              isCompleted: SchemeOfWorkEntry.is_completed,
              validationStatus: SchemeOfWorkEntry.validation_status,
            })
            .from(SchemeOfWorkEntry)
            .where(inArray(SchemeOfWorkEntry.scheme_id, schemeIds))
            .orderBy(asc(SchemeOfWorkEntry.entry_id)),
      lessonIds.length === 0
        ? []
        : db
            .select({
              id: LO_LearningOutcome.id,
              lessonId: LO_LearningOutcome.lesson_id,
              code: LO_LearningOutcome.code,
              title: LO_LearningOutcome.title,
              description: LO_LearningOutcome.description,
              durationMinutes: LO_LearningOutcome.duration_minutes,
            })
            .from(LO_LearningOutcome)
            .where(inArray(LO_LearningOutcome.lesson_id, lessonIds))
            .orderBy(asc(LO_LearningOutcome.id)),
      lessonIds.length === 0
        ? []
        : db
            .select({
              id: LO_LessonSection.id,
              lessonId: LO_LessonSection.lesson_id,
              sectionType: LO_LessonSection.section_type,
              trainerActivities: LO_LessonSection.trainer_activities,
              learnerActivities: LO_LessonSection.learner_activities,
              resources: LO_LessonSection.resources,
              durationMinutes: LO_LessonSection.duration_minutes,
            })
            .from(LO_LessonSection)
            .where(inArray(LO_LessonSection.lesson_id, lessonIds))
            .orderBy(asc(LO_LessonSection.id)),
      lessonIds.length === 0
        ? []
        : db
            .select({
              id: LO_IndicativeContent.id,
              lessonId: LO_IndicativeContent.lesson_id,
              category: LO_IndicativeContent.category,
              content: LO_IndicativeContent.content,
            })
            .from(LO_IndicativeContent)
            .where(inArray(LO_IndicativeContent.lesson_id, lessonIds))
            .orderBy(asc(LO_IndicativeContent.id)),
      lessonIds.length === 0
        ? []
        : db
            .select({
              id: LO_LessonAssignment.id,
              lessonId: LO_LessonAssignment.lesson_id,
              description: LO_LessonAssignment.description,
            })
            .from(LO_LessonAssignment)
            .where(inArray(LO_LessonAssignment.lesson_id, lessonIds))
            .orderBy(asc(LO_LessonAssignment.id)),
      lessonIds.length === 0
        ? []
        : db
            .select({
              id: LO_LessonEvaluation.id,
              lessonId: LO_LessonEvaluation.lesson_id,
              teacherNotes: LO_LessonEvaluation.teacher_notes,
              references: LO_LessonEvaluation.references,
              preparedBy: LO_LessonEvaluation.prepared_by,
              verifiedBy: LO_LessonEvaluation.verified_by,
            })
            .from(LO_LessonEvaluation)
            .where(inArray(LO_LessonEvaluation.lesson_id, lessonIds))
            .orderBy(asc(LO_LessonEvaluation.id)),
    ]);

  // Grandchildren of the learning outcomes — one more batched round, still not
  // per-parent.
  const outcomeIds = outcomes.map((o) => o.id);
  const [outcomeActivities, outcomeResources] =
    outcomeIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({
              id: LO_LearningOutcomeActivity.id,
              learningOutcomeId:
                LO_LearningOutcomeActivity.learning_outcome_id,
              trainerActivities:
                LO_LearningOutcomeActivity.trainer_activities,
              learnerActivities:
                LO_LearningOutcomeActivity.learner_activities,
            })
            .from(LO_LearningOutcomeActivity)
            .where(
              inArray(
                LO_LearningOutcomeActivity.learning_outcome_id,
                outcomeIds,
              ),
            ),
          db
            .select({
              id: LO_LearningOutcomeResource.id,
              learningOutcomeId:
                LO_LearningOutcomeResource.learning_outcome_id,
              resourceName: LO_LearningOutcomeResource.resource_name,
            })
            .from(LO_LearningOutcomeResource)
            .where(
              inArray(
                LO_LearningOutcomeResource.learning_outcome_id,
                outcomeIds,
              ),
            ),
        ]);

  const entriesByScheme = groupBy(entries, (r) => Number(r.schemeId));
  const outcomesByLesson = groupBy(outcomes, (r) => Number(r.lessonId));
  const sectionsByLesson = groupBy(sections, (r) => Number(r.lessonId));
  const indicativeByLesson = groupBy(indicative, (r) => Number(r.lessonId));
  const assignmentsByLesson = groupBy(assignments, (r) => Number(r.lessonId));
  const evaluationsByLesson = groupBy(evaluations, (r) => Number(r.lessonId));
  const activitiesByOutcome = groupBy(outcomeActivities, (r) =>
    Number(r.learningOutcomeId),
  );
  const resourcesByOutcome = groupBy(outcomeResources, (r) =>
    Number(r.learningOutcomeId),
  );
  const criteriaByCompetency = groupBy(criteria, (r) => Number(r.competencyId));

  const slotsByCalendar = groupBy(
    slots.filter((s) => s.calendarId !== null),
    (r) => Number(r.calendarId),
  );

  // A collection that came back exactly at the ceiling may have more behind it.
  // Reported per-collection so the caller can act on it instead of trusting a
  // silently-truncated mirror.
  const truncated = Object.entries({
    lessonNotes: notes.length,
    schemesOfWork: schemes.length,
    lessonPlans: lessons.length,
    calendars: calendars.length,
    calendarSlots: slots.length,
    calendarActivities: activities.length,
    competencies: competencies.length,
    performanceCriteria: criteria.length,
    assessmentScores: scores.length,
  })
    .filter(([, n]) => n >= ACADEMICS_MAX_ROWS)
    .map(([name]) => name);

  successResponse(res, "Academic records retrieved", {
    scope: { schoolFilter: "instance" },
    delta: {
      supported: true,
      appliedSince: since ? since.toISOString() : null,
      appliesTo: [
        "lessonNotes",
        "schemesOfWork",
        "calendars",
        "calendarSlots",
        "calendarActivities",
      ],
      caveat:
        "LO_* lesson plans and assessment scores carry no updated_at and are always sent whole. Scheme entries follow their parent scheme, so a `since` run only carries entries for schemes that changed.",
    },
    truncation: {
      limit: ACADEMICS_MAX_ROWS,
      truncated,
      complete: truncated.length === 0,
    },
    generatedAt: new Date().toISOString(),

    lessonNotes: notes,

    schemesOfWork: schemes.map((s) => ({
      ...s,
      entries: entriesByScheme.get(s.id) ?? [],
    })),

    lessonPlans: lessons.map((l) => ({
      ...l,
      learningOutcomes: (outcomesByLesson.get(l.id) ?? []).map((o) => ({
        ...o,
        activities: activitiesByOutcome.get(o.id) ?? [],
        resources: resourcesByOutcome.get(o.id) ?? [],
      })),
      sections: sectionsByLesson.get(l.id) ?? [],
      indicativeContent: indicativeByLesson.get(l.id) ?? [],
      assignments: assignmentsByLesson.get(l.id) ?? [],
      evaluation: (evaluationsByLesson.get(l.id) ?? [])[0] ?? null,
    })),

    // Slots are also sent flat, because CalendarSlot.calendar_id is nullable —
    // a slot with no calendar is real timetable data and would vanish if the
    // nested form were the only one.
    calendars: calendars.map((c) => ({
      ...c,
      slots: slotsByCalendar.get(c.id) ?? [],
    })),
    calendarSlots: slots,
    calendarActivities: activities,

    // Nested: an element without its performance criteria is not a curriculum
    // element, it is a heading. The flat list is sent alongside for callers that
    // would rather join it themselves.
    competencies: competencies.map((c) => ({
      ...c,
      criteria: criteriaByCompetency.get(c.id) ?? [],
    })),
    performanceCriteria: criteria,

    assessmentScores: scores,
  });
});
