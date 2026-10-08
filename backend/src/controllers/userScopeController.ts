import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  AcademicTerm,
  CalendarSlot,
  ClassGroup,
  CourseCategory,
  Grade,
  Permission,
  Program,
  Role,
  RolePermission,
  SchemeOfWork,
  StudentClassGroup,
  StudentSubjectEnrollment,
  Subject,
  TeacherSubjectAssignment,
  User,
  UserGrade,
  UserProfile,
  UserProgramLead,
  UserRole,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { avatarUrls, withAvatar } from "../services/avatar/urls";
import { NotFoundError, AuthorizationError } from "../errors/CustomError";
import logger from "../utils/logger";
import { getCurrentAcademicYearId } from "../utils/academicYear";
import {
  parseIdList,
  resolveRequestedGradeIds,
  resolveUserScope,
} from "../services/userScope";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const setPaginationHeaders = (
  res: any,
  totalCount: number,
  pageNum: number,
  limitNum: number,
) => {
  res.setHeader("X-Total-Count", totalCount.toString());
  res.setHeader("X-Total-Pages", Math.ceil(totalCount / limitNum).toString());
  res.setHeader("X-Current-Page", pageNum.toString());
  res.setHeader("X-Per-Page", limitNum.toString());
};

const readPaging = (query: any) => {
  const pageNum = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
  const limitNum = Math.min(
    500,
    Math.max(1, parseInt(query.limit ?? "50", 10) || 50),
  );
  return { pageNum, limitNum, offset: (pageNum - 1) * limitNum };
};

const matches = (needle: string, ...haystack: (string | null | undefined)[]) =>
  haystack.some((v) => (v ?? "").toLowerCase().includes(needle));

/**
 * Resolve the grade ids a request may read, honouring both the caller's own
 * scope and any `grade_ids` narrowing they asked for. Returns null when the
 * caller is scoped to nothing at all -- callers should short-circuit to an
 * empty result rather than querying with an empty IN () list.
 */
const scopeForRequest = async (req: any) => {
  const yearId = req.query.academic_year_id
    ? parseInt(req.query.academic_year_id, 10)
    : await getCurrentAcademicYearId();
  const scope = await resolveUserScope(req.user?.userId, yearId);
  const { gradeIds, unrestricted } = resolveRequestedGradeIds(
    parseIdList(req.query.grade_ids),
    scope,
  );
  return { scope, gradeIds, unrestricted, yearId };
};

/**
 * Keep only each user's most recent placement.
 *
 * StudentClassGroup and StudentSubjectEnrollment rows are stamped with the year
 * they were created, and schools do not re-stamp them the moment a new academic
 * year opens -- in practice a roster written for 2025-2026 is still the live
 * roster well into 2026-2027. Filtering on `= currentYear` therefore emptied
 * every class list. Queries instead select `<= selectedYear` and this collapses
 * the history to the latest row per user, so a student who genuinely moved
 * class group shows up in their new one and only there.
 */
/**
 * The single-user form of the same rule: keep only the rows belonging to the
 * most recent academic year present. A student who sat in L3 Class B last year
 * and L4 Class A this year has two placement rows once the query widens to
 * `<= selectedYear`; the profile must show where they are *now*, not both.
 */
const latestYearOnly = <T extends { academic_year_id: number | null }>(
  rows: T[],
): T[] => {
  if (rows.length === 0) return rows;
  const newest = Math.max(...rows.map((r) => r.academic_year_id ?? 0));
  return rows.filter((r) => (r.academic_year_id ?? 0) === newest);
};

const latestPerKey = <T extends { academic_year_id: number | null }>(
  rows: T[],
  keyOf: (row: T) => number | null | undefined,
): T[] => {
  const newestYear = new Map<number, number>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key == null) continue;
    const year = row.academic_year_id ?? 0;
    if (year >= (newestYear.get(key) ?? -1)) newestYear.set(key, year);
  }
  return rows.filter((row) => {
    const key = keyOf(row);
    return key == null || (row.academic_year_id ?? 0) === newestYear.get(key);
  });
};

const latestPerUser = <T extends { user_id: number; academic_year_id: number | null }>(
  rows: T[],
): T[] => latestPerKey(rows, (row) => row.user_id);

/** Distinct {id, name} values with how many rows carried each, name-sorted. */
const countBy = <T extends { id: number | string; name: string }>(items: T[]) => {
  const counts = new Map<number | string, { id: T["id"]; name: string; count: number }>();
  for (const item of items) {
    const entry = counts.get(item.id) ?? { ...item, count: 0 };
    entry.count += 1;
    counts.set(item.id, entry);
  }
  return Array.from(counts.values()).sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Each student's placement for the selected year, already narrowed to scope.
 *
 * The collapse to the latest placement happens BEFORE the grade filter, and
 * that order is the whole point. Filtering first kept whichever historical row
 * happened to sit in the caller's grades: a student who did Year 1 last year
 * and has moved up to Year 2 still matched the Year 1 filter, so their Year 2
 * enrolments were attributed to their old class group and Year 2 subjects
 * appeared on a Year 1 class teacher's page.
 */
const effectiveStudentPlacements = async (params: {
  yearId: number | null;
  gradeIds: number[];
  unrestricted: boolean;
  userIds?: number[];
}) => {
  if (params.userIds && params.userIds.length === 0) return [];

  const rows = await db
    .select({
      user_id: StudentClassGroup.user_id,
      class_group_id: ClassGroup.class_group_id,
      class_group_name: ClassGroup.name,
      grade_id: ClassGroup.grade_id,
      grade_name: Grade.name,
      academic_year_id: StudentClassGroup.academic_year_id,
    })
    .from(StudentClassGroup)
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .where(
      and(
        ...([
          eq(StudentClassGroup.status, "ACTIVE"),
          params.yearId
            ? lte(StudentClassGroup.academic_year_id, params.yearId)
            : undefined,
          params.userIds?.length
            ? inArray(StudentClassGroup.user_id, params.userIds)
            : undefined,
        ].filter(Boolean) as any[]),
      ),
    );

  const current = latestPerUser(rows);
  return params.unrestricted
    ? current
    : current.filter(
        (row) => row.grade_id != null && params.gradeIds.includes(row.grade_id),
      );
};

/** Every role each of the given users holds, keyed by user_id. */
const rolesByUser = async (userIds: number[]) => {
  if (userIds.length === 0) return new Map<number, any[]>();
  const rows = await db
    .select({
      user_id: UserRole.user_id,
      role_id: Role.role_id,
      name: Role.name,
      description: Role.description,
      status: Role.status,
    })
    .from(UserRole)
    .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
    .where(inArray(UserRole.user_id, userIds));

  const map = new Map<number, any[]>();
  for (const row of rows) {
    const { user_id, ...role } = row;
    const list = map.get(user_id) ?? [];
    // A user can hold the same role through more than one grant path.
    if (!list.some((r) => r.role_id === role.role_id)) list.push(role);
    map.set(user_id, list);
  }
  return map;
};

// ---------------------------------------------------------------------------
// GET /users/stats -- role + status counts in two aggregate queries
// ---------------------------------------------------------------------------

/**
 * Replaces the old client-side fan-out, which issued `3 + 2 * roles` requests
 * to `/users?page=1&limit=1&userRole=<n>[&status=ACTIVE]` purely to read
 * `X-Total-Count` off each response. Two GROUP BY queries answer all of it.
 */
export const getUserStats = asyncHandler(async (req: any, res: any) => {
  const search = (req.query.search as string | undefined)?.trim();
  const searchFilter = search
    ? sql`AND (u.username LIKE ${`%${search}%`} OR u.email LIKE ${`%${search}%`} OR u.phone_number LIKE ${`%${search}%`})`
    : sql``;

  const [overallRows, perRoleRows, roleRows] = await Promise.all([
    db.execute(sql`
      SELECT u.status AS status, COUNT(*) AS count
      FROM User u
      WHERE 1 = 1 ${searchFilter}
      GROUP BY u.status
    `),
    db.execute(sql`
      SELECT ur.role_id AS role_id, u.status AS status, COUNT(DISTINCT u.user_id) AS count
      FROM UserRole ur
      INNER JOIN User u ON u.user_id = ur.user_id
      WHERE 1 = 1 ${searchFilter}
      GROUP BY ur.role_id, u.status
    `),
    db
      .select({
        role_id: Role.role_id,
        name: Role.name,
        description: Role.description,
        status: Role.status,
      })
      .from(Role),
  ]);

  const toRows = (result: any): any[] =>
    Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : [];

  const overallByStatus = new Map<string, number>();
  for (const row of toRows(overallRows)) {
    overallByStatus.set(String(row.status), Number(row.count) || 0);
  }
  const overallTotal = Array.from(overallByStatus.values()).reduce(
    (a, b) => a + b,
    0,
  );
  const overallActive = overallByStatus.get("ACTIVE") ?? 0;

  const perRole = new Map<number, { total: number; active: number }>();
  for (const row of toRows(perRoleRows)) {
    const roleId = Number(row.role_id);
    const count = Number(row.count) || 0;
    const entry = perRole.get(roleId) ?? { total: 0, active: 0 };
    entry.total += count;
    if (String(row.status) === "ACTIVE") entry.active += count;
    perRole.set(roleId, entry);
  }

  const roles = (roleRows as any[]).map((role) => {
    const counts = perRole.get(role.role_id) ?? { total: 0, active: 0 };
    return {
      ...role,
      total: counts.total,
      active: counts.active,
      disabled: Math.max(0, counts.total - counts.active),
    };
  });

  successResponse(res, "User statistics retrieved successfully", {
    overall: {
      total: overallTotal,
      active: overallActive,
      disabled: Math.max(0, overallTotal - overallActive),
    },
    roles,
  });
});

// ---------------------------------------------------------------------------
// GET /users/scope/subjects
// ---------------------------------------------------------------------------

const EMPTY_FACETS = {
  categories: [],
  classGroups: [],
  grades: [],
  teachers: [],
  statuses: [],
  unassigned: 0,
};

export const getScopedSubjects = asyncHandler(async (req: any, res: any) => {
  const { gradeIds, unrestricted, yearId, scope } = await scopeForRequest(req);
  const { pageNum, limitNum, offset } = readPaging(req.query);
  const search = (req.query.search as string | undefined)?.trim().toLowerCase();

  logger.info("Fetching scoped subjects", {
    requestedBy: req.user?.userId,
    scoped: scope.scoped,
    gradeIds,
    unrestricted,
  });

  if (!unrestricted && gradeIds.length === 0) {
    setPaginationHeaders(res, 0, pageNum, limitNum);
    return successResponse(res, "Subjects retrieved successfully", {
      subjects: [],
      facets: EMPTY_FACETS,
    });
  }

  const gradeFilter = unrestricted
    ? undefined
    : inArray(ClassGroup.grade_id, gradeIds);
  // Teacher assignments carry forward the same way a roster does.
  const yearFilter = yearId
    ? lte(TeacherSubjectAssignment.academic_year_id, yearId)
    : undefined;

  // Subjects taught in the scoped class groups, with the teacher on each row.
  // The same teacher can appear on several rows (one per class group), which is
  // exactly the fan-out that used to render duplicate teacher chips -- the
  // grouping below collapses it.
  const taught = await db
    .select({
      subject_id: Subject.subject_id,
      code: Subject.code,
      name: Subject.name,
      description: Subject.description,
      status: Subject.status,
      color: Subject.color,
      category_id: Subject.course_category_id,
      category_name: CourseCategory.name,
      grade_id: ClassGroup.grade_id,
      grade_name: Grade.name,
      class_group_id: ClassGroup.class_group_id,
      class_group_name: ClassGroup.name,
      academic_year_id: TeacherSubjectAssignment.academic_year_id,
      teacher_id: User.user_id,
      teacher_username: User.username,
      teacher_first_name: UserProfile.first_name,
      teacher_last_name: UserProfile.last_name,
    })
    .from(Subject)
    .leftJoin(
      CourseCategory,
      eq(Subject.course_category_id, CourseCategory.category_id),
    )
    .innerJoin(
      TeacherSubjectAssignment,
      eq(Subject.subject_id, TeacherSubjectAssignment.subject_id),
    )
    .innerJoin(
      ClassGroup,
      eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
    )
    .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .leftJoin(User, eq(TeacherSubjectAssignment.user_id, User.user_id))
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(and(...[gradeFilter, yearFilter].filter(Boolean) as any[]));

  // Subjects students are enrolled in that have no teacher assigned yet.
  // Resolved from each student's placement FOR THIS YEAR, so a student who has
  // moved up a grade brings their new grade's subjects to that grade's page
  // only -- never to the one they left.
  const placements = await effectiveStudentPlacements({
    yearId,
    gradeIds,
    unrestricted,
  });
  const placementsByUser = new Map<number, typeof placements>();
  for (const row of placements) {
    placementsByUser.set(row.user_id, [
      ...(placementsByUser.get(row.user_id) ?? []),
      row,
    ]);
  }
  const placedStudentIds = Array.from(placementsByUser.keys());

  const enrolmentRows =
    placedStudentIds.length > 0
      ? await db
          .select({
            subject_id: Subject.subject_id,
            code: Subject.code,
            name: Subject.name,
            description: Subject.description,
            status: Subject.status,
            color: Subject.color,
            category_id: Subject.course_category_id,
            category_name: CourseCategory.name,
            user_id: StudentSubjectEnrollment.user_id,
          })
          .from(StudentSubjectEnrollment)
          .innerJoin(
            Subject,
            eq(StudentSubjectEnrollment.subject_id, Subject.subject_id),
          )
          .leftJoin(
            CourseCategory,
            eq(Subject.course_category_id, CourseCategory.category_id),
          )
          .where(
            and(
              ...([
                inArray(StudentSubjectEnrollment.user_id, placedStudentIds),
                eq(StudentSubjectEnrollment.status, "ACTIVE"),
                // Enrolment is per-year and explicit -- exact match.
                yearId
                  ? eq(StudentSubjectEnrollment.academic_year_id, yearId)
                  : undefined,
              ].filter(Boolean) as any[]),
            ),
          )
      : [];

  // Attribute each enrolment to the class group that student actually sits in.
  const enrolledOnly = enrolmentRows.flatMap((row) =>
    (placementsByUser.get(row.user_id) ?? []).map((placement) => ({
      ...row,
      grade_id: placement.grade_id,
      grade_name: placement.grade_name,
      class_group_id: placement.class_group_id,
      class_group_name: placement.class_group_name,
      academic_year_id: placement.academic_year_id,
    })),
  );

  interface ScopedSubject {
    subject_id: number;
    code: string | null;
    name: string;
    description: string | null;
    status: string | null;
    color: string | null;
    category_id: number | null;
    category_name: string | null;
    teachers: {
      user_id: number;
      username: string | null;
      first_name: string | null;
      last_name: string | null;
    }[];
    grades: { grade_id: number; name: string | null }[];
    class_groups: { class_group_id: number; name: string | null }[];
  }

  const bySubject = new Map<number, ScopedSubject>();

  const ensure = (row: any): ScopedSubject => {
    let entry = bySubject.get(row.subject_id);
    if (!entry) {
      entry = {
        subject_id: row.subject_id,
        code: row.code,
        name: row.name,
        description: row.description,
        status: row.status,
        color: row.color,
        category_id: row.category_id ?? null,
        category_name: row.category_name ?? null,
        teachers: [],
        grades: [],
        class_groups: [],
      };
      bySubject.set(row.subject_id, entry);
    }
    if (
      row.grade_id &&
      !entry.grades.some((g) => g.grade_id === row.grade_id)
    ) {
      entry.grades.push({ grade_id: row.grade_id, name: row.grade_name });
    }
    if (
      row.class_group_id &&
      !entry.class_groups.some((c) => c.class_group_id === row.class_group_id)
    ) {
      entry.class_groups.push({
        class_group_id: row.class_group_id,
        name: row.class_group_name,
      });
    }
    return entry;
  };

  // Each class group contributes only its most recent year's assignments, so a
  // subject dropped after last year stops showing on this year's cards.
  for (const row of latestPerKey(taught, (r) => r.class_group_id)) {
    const entry = ensure(row);
    if (
      row.teacher_id &&
      !entry.teachers.some((t) => t.user_id === row.teacher_id)
    ) {
      entry.teachers.push({
        user_id: row.teacher_id,
        username: row.teacher_username,
        first_name: row.teacher_first_name,
        last_name: row.teacher_last_name,
      });
    }
  }
  for (const row of enrolledOnly) ensure(row);

  let subjects = Array.from(bySubject.values());
  if (search) {
    subjects = subjects.filter(
      (s) =>
        matches(search, s.name, s.code, s.description, s.category_name) ||
        s.teachers.some((t) =>
          matches(search, t.first_name, t.last_name, t.username),
        ) ||
        s.class_groups.some((c) => matches(search, c.name)),
    );
  }

  // Facets are computed over the search-filtered set but BEFORE the facet
  // filters, so the option lists stay put while you toggle them -- a dropdown
  // whose choices vanish as you use it is unusable.
  const facets = {
    categories: countBy(
      subjects.flatMap((s) =>
        s.category_id
          ? [{ id: s.category_id, name: s.category_name ?? "Uncategorised" }]
          : [],
      ),
    ),
    classGroups: countBy(
      subjects.flatMap((s) =>
        s.class_groups.map((c: any) => ({ id: c.class_group_id, name: c.name })),
      ),
    ),
    grades: countBy(
      subjects.flatMap((s) =>
        s.grades.map((g: any) => ({ id: g.grade_id, name: g.name })),
      ),
    ),
    teachers: countBy(
      subjects.flatMap((s) =>
        s.teachers.map((t: any) => ({
          id: t.user_id,
          name:
            `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() ||
            t.username ||
            "Unknown",
        })),
      ),
    ),
    statuses: countBy(
      subjects.map((s) => ({ id: s.status ?? "UNKNOWN", name: s.status ?? "UNKNOWN" })),
    ),
    unassigned: subjects.filter((s) => s.teachers.length === 0).length,
  };

  const classGroupFilter = parseIdList(req.query.class_group_ids);
  const teacherFilter = parseIdList(req.query.teacher_ids);
  const categoryFilter = parseIdList(req.query.category_ids);
  const statusFilter = (req.query.status as string | undefined)?.trim();
  const assignment = (req.query.assignment as string | undefined)?.trim();

  if (classGroupFilter) {
    subjects = subjects.filter((s) =>
      s.class_groups.some((c: any) =>
        classGroupFilter.includes(c.class_group_id),
      ),
    );
  }
  if (teacherFilter) {
    subjects = subjects.filter((s) =>
      s.teachers.some((t: any) => teacherFilter.includes(t.user_id)),
    );
  }
  if (categoryFilter) {
    subjects = subjects.filter(
      (s) => s.category_id != null && categoryFilter.includes(s.category_id),
    );
  }
  if (statusFilter && statusFilter !== "all") {
    subjects = subjects.filter(
      (s) => (s.status ?? "").toUpperCase() === statusFilter.toUpperCase(),
    );
  }
  if (assignment === "assigned") {
    subjects = subjects.filter((s) => s.teachers.length > 0);
  } else if (assignment === "unassigned") {
    subjects = subjects.filter((s) => s.teachers.length === 0);
  }

  const sort = (req.query.sort as string | undefined) ?? "name";
  const compare: Record<string, (a: any, b: any) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    "name-desc": (a, b) => b.name.localeCompare(a.name),
    code: (a, b) => (a.code ?? "").localeCompare(b.code ?? ""),
    teachers: (a, b) => b.teachers.length - a.teachers.length,
    "class-groups": (a, b) => b.class_groups.length - a.class_groups.length,
  };
  subjects.sort(compare[sort] ?? compare.name);

  const totalCount = subjects.length;
  setPaginationHeaders(res, totalCount, pageNum, limitNum);
  successResponse(res, "Subjects retrieved successfully", {
    subjects: subjects.slice(offset, offset + limitNum),
    facets,
  });
});

// ---------------------------------------------------------------------------
// GET /users/scope/subjects/:id -- everything the subject card cannot show
// ---------------------------------------------------------------------------

/**
 * Read-only detail for one subject, narrowed to the caller's own class groups.
 *
 * A class teacher looking at "Applied Physics II" wants to know who teaches it
 * to *their* class, when it sits in the week, who is enrolled, and whether the
 * scheme of work has been submitted. Everything here is therefore filtered by
 * the caller's scope -- the same subject seen by two different class teachers
 * legitimately shows different rosters and different timetable rows.
 */
export const getScopedSubjectDetail = asyncHandler(
  async (req: any, res: any) => {
    const subjectId = parseInt(req.params.id, 10);
    if (!Number.isFinite(subjectId)) throw new NotFoundError("Subject not found");

    const { gradeIds, unrestricted, yearId } = await scopeForRequest(req);
    // The timetable is per year AND per term -- a slot only means anything
    // inside one calendar, and a calendar is scoped to a single year+term+class
    // group triple. Without the term filter the panel stacked every term's
    // periods on top of each other.
    const termId = req.query.academic_term_id
      ? parseInt(req.query.academic_term_id, 10)
      : null;

    const [subject] = await db
      .select({
        subject_id: Subject.subject_id,
        code: Subject.code,
        name: Subject.name,
        description: Subject.description,
        status: Subject.status,
        color: Subject.color,
        max_marks: Subject.max_marks,
        category_name: CourseCategory.name,
      })
      .from(Subject)
      .leftJoin(
        CourseCategory,
        eq(Subject.course_category_id, CourseCategory.category_id),
      )
      .where(eq(Subject.subject_id, subjectId))
      .limit(1);

    if (!subject) throw new NotFoundError("Subject not found");

    if (!unrestricted && gradeIds.length === 0) {
      throw new AuthorizationError(
        "This subject is outside your assigned grades",
      );
    }

    const gradeFilter = unrestricted
      ? undefined
      : inArray(ClassGroup.grade_id, gradeIds);

    // Which of the caller's class groups this subject actually runs in, and
    // who teaches it in each.
    const assignments = await db
      .select({
        class_group_id: ClassGroup.class_group_id,
        class_group_name: ClassGroup.name,
        grade_id: ClassGroup.grade_id,
        grade_name: Grade.name,
        academic_year_id: TeacherSubjectAssignment.academic_year_id,
        teacher_id: User.user_id,
        teacher_username: User.username,
        teacher_email: User.email,
        teacher_phone: User.phone_number,
        teacher_first_name: UserProfile.first_name,
        teacher_last_name: UserProfile.last_name,
      })
      .from(TeacherSubjectAssignment)
      .innerJoin(
        ClassGroup,
        eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
      )
      .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
      .leftJoin(User, eq(TeacherSubjectAssignment.user_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(
        and(
          ...([
            eq(TeacherSubjectAssignment.subject_id, subjectId),
            gradeFilter,
            yearId
              ? lte(TeacherSubjectAssignment.academic_year_id, yearId)
              : undefined,
          ].filter(Boolean) as any[]),
        ),
      );

    // Only the most recent year's assignment per class group counts -- a
    // teacher who handed the subject over last year is no longer its teacher.
    const currentAssignments = latestPerKey(
      assignments,
      (row) => row.class_group_id,
    );

    // Class groups reached through enrolled students too -- a subject can be
    // enrolled before anyone is assigned to teach it. Resolved from each
    // student's placement for THIS year, so a student who has moved up does
    // not drag the subject back onto their old grade's page.
    const detailPlacements = await effectiveStudentPlacements({
      yearId,
      gradeIds,
      unrestricted,
    });
    const detailPlacementsByUser = new Map<number, typeof detailPlacements>();
    for (const row of detailPlacements) {
      detailPlacementsByUser.set(row.user_id, [
        ...(detailPlacementsByUser.get(row.user_id) ?? []),
        row,
      ]);
    }

    const enrolledUserRows =
      detailPlacementsByUser.size > 0
        ? await db
            .select({
              user_id: StudentSubjectEnrollment.user_id,
              username: User.username,
              email: User.email,
              first_name: UserProfile.first_name,
              last_name: UserProfile.last_name,
              status: User.status,
            })
            .from(StudentSubjectEnrollment)
            .innerJoin(User, eq(StudentSubjectEnrollment.user_id, User.user_id))
            .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
            .where(
              and(
                ...([
                  eq(StudentSubjectEnrollment.subject_id, subjectId),
                  eq(StudentSubjectEnrollment.status, "ACTIVE"),
                  inArray(
                    StudentSubjectEnrollment.user_id,
                    Array.from(detailPlacementsByUser.keys()),
                  ),
                  yearId
                    ? eq(StudentSubjectEnrollment.academic_year_id, yearId)
                    : undefined,
                ].filter(Boolean) as any[]),
              ),
            )
        : [];

    // One row per (student, class group they sit in).
    const enrolledStudents = enrolledUserRows.flatMap((row) =>
      (detailPlacementsByUser.get(row.user_id) ?? []).map((placement) => ({
        ...row,
        class_group_id: placement.class_group_id,
        class_group_name: placement.class_group_name,
        academic_year_id: placement.academic_year_id,
      })),
    );

    const enrolledGroups = enrolledStudents.map((row) => ({
      class_group_id: row.class_group_id,
      class_group_name: row.class_group_name,
      grade_id:
        detailPlacementsByUser
          .get(row.user_id)
          ?.find((p) => p.class_group_id === row.class_group_id)?.grade_id ??
        null,
      grade_name:
        detailPlacementsByUser
          .get(row.user_id)
          ?.find((p) => p.class_group_id === row.class_group_id)?.grade_name ??
        null,
      academic_year_id: row.academic_year_id,
    }));

    const classGroups = new Map<number, any>();
    for (const row of [
      ...currentAssignments,
      ...enrolledGroups,
    ]) {
      if (!row.class_group_id || classGroups.has(row.class_group_id)) continue;
      classGroups.set(row.class_group_id, {
        class_group_id: row.class_group_id,
        name: row.class_group_name,
        grade_id: row.grade_id,
        grade_name: row.grade_name,
      });
    }

    // Nothing of this subject touches the caller's class groups -- it is not
    // theirs to look at.
    if (!unrestricted && classGroups.size === 0) {
      throw new AuthorizationError(
        "This subject is outside your assigned grades",
      );
    }

    const classGroupIds = Array.from(classGroups.keys());

    // Teachers, deduped, each carrying the class groups they teach it in.
    const teachers = new Map<number, any>();
    for (const row of currentAssignments) {
      if (!row.teacher_id) continue;
      let entry = teachers.get(row.teacher_id);
      if (!entry) {
        entry = {
          user_id: row.teacher_id,
          username: row.teacher_username,
          email: row.teacher_email,
          phone_number: row.teacher_phone,
          first_name: row.teacher_first_name,
          last_name: row.teacher_last_name,
          class_groups: [] as any[],
        };
        teachers.set(row.teacher_id, entry);
      }
      if (
        row.class_group_id &&
        !entry.class_groups.some(
          (c: any) => c.class_group_id === row.class_group_id,
        )
      ) {
        entry.class_groups.push({
          class_group_id: row.class_group_id,
          name: row.class_group_name,
        });
      }
    }

    const [slots, schemes] = await Promise.all([
      // Where the subject sits in the week, for the caller's class groups.
      classGroupIds.length > 0
        ? db
            .select({
              slot_id: CalendarSlot.slot_id,
              day_of_week: CalendarSlot.day_of_week,
              start_time: CalendarSlot.start_time,
              end_time: CalendarSlot.end_time,
              location: CalendarSlot.location,
              class_group_id: CalendarSlot.class_group_id,
              class_group_name: ClassGroup.name,
              teacher_id: User.user_id,
              teacher_first_name: UserProfile.first_name,
              teacher_last_name: UserProfile.last_name,
              teacher_username: User.username,
            })
            .from(CalendarSlot)
            // A term belongs to exactly one year, so the slot's own term column
            // pins both -- no need to reach through the calendar, which also
            // keeps any slot predating calendar_id in scope.
            .leftJoin(
              AcademicTerm,
              eq(CalendarSlot.academic_term_id, AcademicTerm.academic_term_id),
            )
            .leftJoin(
              ClassGroup,
              eq(CalendarSlot.class_group_id, ClassGroup.class_group_id),
            )
            .leftJoin(User, eq(CalendarSlot.user_id, User.user_id))
            .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
            .where(
              and(
                ...([
                  eq(CalendarSlot.subject_id, subjectId),
                  eq(CalendarSlot.is_active, 1),
                  inArray(CalendarSlot.class_group_id, classGroupIds),
                  termId
                    ? eq(CalendarSlot.academic_term_id, termId)
                    : yearId
                      ? eq(AcademicTerm.academic_year_id, yearId)
                      : undefined,
                ].filter(Boolean) as any[]),
              ),
            )
            .orderBy(CalendarSlot.day_of_week, CalendarSlot.start_time)
        : Promise.resolve([]),

      // Scheme-of-work status per teacher/class group -- the one thing a class
      // teacher usually opens a subject to check.
      classGroupIds.length > 0
        ? db
            .select({
              scheme_id: SchemeOfWork.scheme_id,
              class_group_id: SchemeOfWork.class_group_id,
              class_group_name: ClassGroup.name,
              validation_status: SchemeOfWork.validation_status,
              term_name: AcademicTerm.name,
              academic_term_id: SchemeOfWork.academic_term_id,
              teacher_first_name: UserProfile.first_name,
              teacher_last_name: UserProfile.last_name,
              teacher_username: User.username,
            })
            .from(SchemeOfWork)
            .leftJoin(
              ClassGroup,
              eq(SchemeOfWork.class_group_id, ClassGroup.class_group_id),
            )
            .leftJoin(
              AcademicTerm,
              eq(SchemeOfWork.academic_term_id, AcademicTerm.academic_term_id),
            )
            .leftJoin(User, eq(SchemeOfWork.user_id, User.user_id))
            .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
            .where(
              and(
                eq(SchemeOfWork.subject_id, subjectId),
                inArray(SchemeOfWork.class_group_id, classGroupIds),
                ...(yearId
                  ? [eq(AcademicTerm.academic_year_id, yearId)]
                  : []),
                // A scheme of work covers one term; showing every term's at
                // once made "is it submitted?" unanswerable at a glance.
                ...(termId
                  ? [eq(SchemeOfWork.academic_term_id, termId)]
                  : []),
              ),
            )
        : Promise.resolve([]),
    ]);

    successResponse(res, "Subject detail retrieved successfully", {
      subject,
      classGroups: Array.from(classGroups.values()),
      teachers: Array.from(teachers.values()),
      // Already one row per (student, class group they sit in this year).
      students: enrolledStudents.map((s) => ({
        ...s,
        full_name:
          `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.username,
      })),
      schedule: (slots as any[]).map((s) => ({
        ...s,
        teacher_name:
          `${s.teacher_first_name ?? ""} ${s.teacher_last_name ?? ""}`.trim() ||
          s.teacher_username,
      })),
      schemes: (schemes as any[]).map((s) => ({
        ...s,
        teacher_name:
          `${s.teacher_first_name ?? ""} ${s.teacher_last_name ?? ""}`.trim() ||
          s.teacher_username,
      })),
    });
  },
);

// ---------------------------------------------------------------------------
// GET /users/scope/users
// ---------------------------------------------------------------------------

export const getScopedUsers = asyncHandler(async (req: any, res: any) => {
  const { gradeIds, unrestricted, yearId, scope } = await scopeForRequest(req);
  const { pageNum, limitNum, offset } = readPaging(req.query);
  const search = (req.query.search as string | undefined)?.trim().toLowerCase();
  const roleFilter = (req.query.role as string | undefined)?.trim();

  logger.info("Fetching scoped users", {
    requestedBy: req.user?.userId,
    scoped: scope.scoped,
    gradeIds,
    unrestricted,
  });

  if (!unrestricted && gradeIds.length === 0) {
    setPaginationHeaders(res, 0, pageNum, limitNum);
    return successResponse(res, "Users retrieved successfully", {
      users: [],
      roleGroups: [],
    });
  }

  const gradeFilter = unrestricted
    ? undefined
    : inArray(ClassGroup.grade_id, gradeIds);

  const baseColumns = {
    user_id: User.user_id,
    username: User.username,
    avatar_version: User.avatar_version,
    email: User.email,
    phone_number: User.phone_number,
    status: User.status,
    first_name: UserProfile.first_name,
    last_name: UserProfile.last_name,
    user_type: UserProfile.user_type,
    gender: UserProfile.gender,
    registration_number: UserProfile.registration_number,
    grade_id: ClassGroup.grade_id,
    grade_name: Grade.name,
    class_group_id: ClassGroup.class_group_id,
    class_group_name: ClassGroup.name,
  };

  // Resolved placement-first: collapse to each student's current class group,
  // THEN apply the grade filter. Filtering first kept a student who has since
  // moved up to another grade on their old grade's roster.
  const studentPlacements = await effectiveStudentPlacements({
    yearId,
    gradeIds,
    unrestricted,
  });
  const studentIds = Array.from(
    new Set(studentPlacements.map((p) => p.user_id)),
  );
  const studentProfiles =
    studentIds.length > 0
      ? await db
          .select({
            user_id: User.user_id,
            username: User.username,
            avatar_version: User.avatar_version,
            email: User.email,
            phone_number: User.phone_number,
            status: User.status,
            first_name: UserProfile.first_name,
            last_name: UserProfile.last_name,
            user_type: UserProfile.user_type,
            gender: UserProfile.gender,
            registration_number: UserProfile.registration_number,
          })
          .from(User)
          .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
          .where(inArray(User.user_id, studentIds))
      : [];
  const profileById = new Map(studentProfiles.map((p) => [p.user_id, p]));

  const students = studentPlacements.flatMap((placement) => {
    const profile = profileById.get(placement.user_id);
    return profile
      ? [
          {
            ...profile,
            grade_id: placement.grade_id,
            grade_name: placement.grade_name,
            class_group_id: placement.class_group_id,
            class_group_name: placement.class_group_name,
            academic_year_id: placement.academic_year_id,
          },
        ]
      : [];
  });

  const teacherRows = await db
    .select({
      ...baseColumns,
      academic_year_id: TeacherSubjectAssignment.academic_year_id,
    })
    .from(User)
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .innerJoin(
      TeacherSubjectAssignment,
      eq(User.user_id, TeacherSubjectAssignment.user_id),
    )
    .innerJoin(
      ClassGroup,
      eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
    )
    .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .where(
      and(
        ...([
          gradeFilter,
          yearId
            ? lte(TeacherSubjectAssignment.academic_year_id, yearId)
            : undefined,
        ].filter(Boolean) as any[]),
      ),
    );

  const teachers = latestPerUser(teacherRows);

  // One row per (user, class group) collapses to one entry per user carrying
  // every class group they appear in. The previous implementation also joined
  // UserRole here, so a two-role user produced two rows and the dedupe kept
  // only one -- their second role silently disappeared from the role tabs.
  const byUser = new Map<number, any>();
  for (const row of [...students, ...teachers]) {
    let entry = byUser.get(row.user_id);
    if (!entry) {
      entry = {
        user_id: row.user_id,
        username: row.username,
        email: row.email,
        phone_number: row.phone_number,
        status: row.status,
        first_name: row.first_name,
        last_name: row.last_name,
        user_type: row.user_type,
        gender: row.gender,
        registration_number: row.registration_number ?? null,
        roles: [] as any[],
        grades: [] as any[],
        class_groups: [] as any[],
      };
      byUser.set(row.user_id, entry);
    }
    if (row.grade_id && !entry.grades.some((g: any) => g.grade_id === row.grade_id)) {
      entry.grades.push({ grade_id: row.grade_id, name: row.grade_name });
    }
    if (
      row.class_group_id &&
      !entry.class_groups.some(
        (c: any) => c.class_group_id === row.class_group_id,
      )
    ) {
      entry.class_groups.push({
        class_group_id: row.class_group_id,
        name: row.class_group_name,
      });
    }
  }

  const roleMap = await rolesByUser(Array.from(byUser.keys()));
  for (const [userId, entry] of byUser) {
    entry.roles = roleMap.get(userId) ?? [];
    // Kept for consumers that still read a single role name.
    entry.role_name = entry.roles[0]?.name ?? entry.user_type ?? null;
  }

  let users = Array.from(byUser.values());

  if (search) {
    users = users.filter(
      (u) =>
        matches(
          search,
          u.username,
          u.email,
          u.first_name,
          u.last_name,
          u.phone_number,
          u.registration_number,
        ) || u.roles.some((r: any) => matches(search, r.name)),
    );
  }

  // Role tab counts are computed over the search-filtered set but *before* the
  // role filter, so switching tabs never changes the tab counts themselves.
  const roleGroups = new Map<
    number,
    { role_id: number; name: string; count: number }
  >();
  for (const u of users) {
    for (const role of u.roles) {
      const entry = roleGroups.get(role.role_id) ?? {
        role_id: role.role_id,
        name: role.name,
        count: 0,
      };
      entry.count += 1;
      roleGroups.set(role.role_id, entry);
    }
  }

  if (roleFilter) {
    users = users.filter((u) =>
      u.roles.some(
        (r: any) =>
          r.name === roleFilter || String(r.role_id) === String(roleFilter),
      ),
    );
  }

  users.sort((a, b) =>
    `${a.first_name ?? ""} ${a.last_name ?? ""}`
      .trim()
      .localeCompare(`${b.first_name ?? ""} ${b.last_name ?? ""}`.trim()),
  );

  const totalCount = users.length;
  setPaginationHeaders(res, totalCount, pageNum, limitNum);
  successResponse(res, "Users retrieved successfully", {
    users: users
      .slice(offset, offset + limitNum)
      .map((u: any) => ({ ...u, avatar: avatarUrls(u.user_id, u.avatar_version) })),
    roleGroups: Array.from(roleGroups.values()).sort(
      (a, b) => b.count - a.count,
    ),
  });
});

// ---------------------------------------------------------------------------
// GET /users/scope/users/:id -- read-only detail for the profile viewer
// ---------------------------------------------------------------------------

export const getScopedUserDetail = asyncHandler(async (req: any, res: any) => {
  const targetId = parseInt(req.params.id, 10);
  if (!Number.isFinite(targetId)) throw new NotFoundError("User not found");

  const yearId = req.query.academic_year_id
    ? parseInt(req.query.academic_year_id, 10)
    : await getCurrentAcademicYearId();
  const scope = await resolveUserScope(req.user?.userId, yearId);

  const [target] = await db
    .select()
    .from(User)
    .where(eq(User.user_id, targetId))
    .limit(1);
  if (!target) throw new NotFoundError("User not found");

  // A scoped viewer may only open profiles of people inside their own grades.
  // Without this the read-only viewer would be a way around the MANAGE_USERS
  // requirement on GET /users/:id.
  //
  // Reachability is checked at GRADE level, deliberately matching what
  // getScopedUsers lists. Checking the caller's own class groups instead made
  // the list and the profile disagree: a teacher who teaches a sibling section
  // of the same grade appeared in the roster and then 403'd on open.
  if (scope.scoped && targetId !== req.user?.userId) {
    const reachable = await isWithinScope(targetId, scope.gradeIds, yearId);
    if (!reachable) {
      throw new AuthorizationError(
        "This user is outside your assigned grades",
      );
    }
  }

  const [
    profileRows,
    roleRows,
    gradeRows,
    classGroupRows,
    programRows,
    taughtRows,
    enrolledRows,
  ] = await Promise.all([
    db
      .select()
      .from(UserProfile)
      .where(eq(UserProfile.user_id, targetId))
      .limit(1),
    db
      .select({
        role_id: Role.role_id,
        name: Role.name,
        description: Role.description,
        status: Role.status,
      })
      .from(UserRole)
      .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
      .where(eq(UserRole.user_id, targetId)),
    db
      .select({
        grade_id: Grade.grade_id,
        name: Grade.name,
        program_name: Program.name,
        class_group_id: UserGrade.class_group_id,
        class_group_name: ClassGroup.name,
      })
      .from(UserGrade)
      .innerJoin(Grade, eq(UserGrade.grade_id, Grade.grade_id))
      .leftJoin(Program, eq(Grade.program_id, Program.program_id))
      .leftJoin(
        ClassGroup,
        eq(UserGrade.class_group_id, ClassGroup.class_group_id),
      )
      .where(
        and(
          eq(UserGrade.user_id, targetId),
          ...(yearId ? [eq(UserGrade.academic_year_id, yearId)] : []),
        ),
      ),
    db
      .select({
        class_group_id: ClassGroup.class_group_id,
        name: ClassGroup.name,
        grade_id: Grade.grade_id,
        grade_name: Grade.name,
        program_name: Program.name,
        academic_year_id: StudentClassGroup.academic_year_id,
      })
      .from(StudentClassGroup)
      .innerJoin(
        ClassGroup,
        eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
      )
      .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
      .leftJoin(Program, eq(Grade.program_id, Program.program_id))
      .where(
        and(
          eq(StudentClassGroup.user_id, targetId),
          eq(StudentClassGroup.status, "ACTIVE"),
          ...(yearId ? [lte(StudentClassGroup.academic_year_id, yearId)] : []),
        ),
      ),
    db
      .select({ program_id: Program.program_id, name: Program.name })
      .from(UserProgramLead)
      .innerJoin(Program, eq(UserProgramLead.program_id, Program.program_id))
      .where(
        and(
          eq(UserProgramLead.user_id, targetId),
          ...(yearId ? [eq(UserProgramLead.academic_year_id, yearId)] : []),
        ),
      ),
    db
      .selectDistinct({
        subject_id: Subject.subject_id,
        name: Subject.name,
        code: Subject.code,
        class_group_id: TeacherSubjectAssignment.class_group_id,
        class_group_name: ClassGroup.name,
        grade_name: Grade.name,
        academic_year_id: TeacherSubjectAssignment.academic_year_id,
      })
      .from(TeacherSubjectAssignment)
      .innerJoin(
        Subject,
        eq(TeacherSubjectAssignment.subject_id, Subject.subject_id),
      )
      .leftJoin(
        ClassGroup,
        eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
      )
      .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
      .where(
        and(
          eq(TeacherSubjectAssignment.user_id, targetId),
          ...(yearId
            ? [lte(TeacherSubjectAssignment.academic_year_id, yearId)]
            : []),
        ),
      ),
    db
      .selectDistinct({
        subject_id: Subject.subject_id,
        name: Subject.name,
        code: Subject.code,
        academic_year_id: StudentSubjectEnrollment.academic_year_id,
      })
      .from(StudentSubjectEnrollment)
      .innerJoin(
        Subject,
        eq(StudentSubjectEnrollment.subject_id, Subject.subject_id),
      )
      .where(
        and(
          eq(StudentSubjectEnrollment.user_id, targetId),
          eq(StudentSubjectEnrollment.status, "ACTIVE"),
          // Exact year, as above -- last year's enrolments are not this
          // year's subjects.
          ...(yearId
            ? [eq(StudentSubjectEnrollment.academic_year_id, yearId)]
            : []),
        ),
      ),
  ]);

  const roleIds = roleRows.map((r) => r.role_id);
  const permissionRows =
    roleIds.length > 0
      ? await db
          .select({
            role_id: RolePermission.role_id,
            perm_id: Permission.perm_id,
            name: Permission.name,
            description: Permission.description,
          })
          .from(RolePermission)
          .innerJoin(
            Permission,
            and(
              eq(RolePermission.perm_id, Permission.perm_id),
              eq(Permission.status, "ACTIVE"),
            ),
          )
          .where(inArray(RolePermission.role_id, roleIds))
      : [];

  const roles = roleRows.map((role) => ({
    ...role,
    permissions: permissionRows
      .filter((p) => p.role_id === role.role_id)
      .map(({ role_id, ...perm }) => perm),
  }));

  // A teacher assigned the same subject in two sections produced two rows; the
  // profile wants one card per subject naming both class groups.
  const groupSubjects = (
    rows: any[],
    classGroupsFor: (row: any) => { class_group_id: number; name: string }[],
  ) => {
    const bySubject = new Map<number, any>();
    for (const row of rows) {
      let entry = bySubject.get(row.subject_id);
      if (!entry) {
        entry = {
          subject_id: row.subject_id,
          name: row.name,
          code: row.code,
          class_groups: [],
        };
        bySubject.set(row.subject_id, entry);
      }
      for (const cg of classGroupsFor(row)) {
        if (
          cg.class_group_id &&
          !entry.class_groups.some(
            (c: any) => c.class_group_id === cg.class_group_id,
          )
        ) {
          entry.class_groups.push(cg);
        }
      }
    }
    return Array.from(bySubject.values());
  };

  const currentClassGroups = latestYearOnly(classGroupRows);

  const subjectsTaught = groupSubjects(latestYearOnly(taughtRows), (row) =>
    row.class_group_id
      ? [
          {
            class_group_id: row.class_group_id,
            name: [row.grade_name, row.class_group_name]
              .filter(Boolean)
              .join(" · "),
          },
        ]
      : [],
  );

  // A student's enrolment is not itself tied to a class group, so the section
  // shown is the one they are actually placed in this year.
  const subjectsEnrolled = groupSubjects(latestYearOnly(enrolledRows), () =>
    currentClassGroups.map((cg: any) => ({
      class_group_id: cg.class_group_id,
      name: [cg.grade_name, cg.name].filter(Boolean).join(" · "),
    })),
  );

  const { password_hash, ...safeUser } = target as any;

  successResponse(res, "User profile retrieved successfully", {
    user: withAvatar(safeUser),
    avatar: avatarUrls(safeUser.user_id, safeUser.avatar_version),
    profile: profileRows[0] ?? null,
    roles,
    permissions: Array.from(
      new Set(roles.flatMap((r) => r.permissions.map((p) => p.name))),
    ),
    assignedGrades: gradeRows,
    // Collapsed to the selected year's placement/enrolment -- the queries widen
    // to `<= yearId` so a roster that was never re-stamped still resolves, but
    // the profile must not stack last year's class group on top of this one's.
    classGroups: currentClassGroups,
    assignedPrograms: programRows,
    subjectsTaught,
    subjectsEnrolled,
  });
});

/** Is the target user a student or teacher in any class group of these grades? */
const isWithinScope = async (
  targetId: number,
  gradeIds: number[],
  yearId: number | null,
) => {
  if (gradeIds.length === 0) return false;

  const asStudent = await db
    .select({ user_id: StudentClassGroup.user_id })
    .from(StudentClassGroup)
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .where(
      and(
        eq(StudentClassGroup.user_id, targetId),
        inArray(ClassGroup.grade_id, gradeIds),
        ...(yearId ? [lte(StudentClassGroup.academic_year_id, yearId)] : []),
      ),
    )
    .limit(1);
  if (asStudent.length > 0) return true;

  const asTeacher = await db
    .select({ user_id: TeacherSubjectAssignment.user_id })
    .from(TeacherSubjectAssignment)
    .innerJoin(
      ClassGroup,
      eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
    )
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, targetId),
        inArray(ClassGroup.grade_id, gradeIds),
        ...(yearId
          ? [lte(TeacherSubjectAssignment.academic_year_id, yearId)]
          : []),
      ),
    )
    .limit(1);
  return asTeacher.length > 0;
};
