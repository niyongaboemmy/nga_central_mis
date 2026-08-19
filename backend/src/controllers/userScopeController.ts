import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  ClassGroup,
  Grade,
  Permission,
  Program,
  Role,
  RolePermission,
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
    return successResponse(res, "Subjects retrieved successfully", []);
  }

  const gradeFilter = unrestricted
    ? undefined
    : inArray(ClassGroup.grade_id, gradeIds);
  const yearFilter = yearId
    ? eq(TeacherSubjectAssignment.academic_year_id, yearId)
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
      grade_id: ClassGroup.grade_id,
      grade_name: Grade.name,
      class_group_id: ClassGroup.class_group_id,
      class_group_name: ClassGroup.name,
      teacher_id: User.user_id,
      teacher_username: User.username,
      teacher_first_name: UserProfile.first_name,
      teacher_last_name: UserProfile.last_name,
    })
    .from(Subject)
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
  const enrolledOnly = await db
    .select({
      subject_id: Subject.subject_id,
      code: Subject.code,
      name: Subject.name,
      description: Subject.description,
      status: Subject.status,
      color: Subject.color,
      grade_id: ClassGroup.grade_id,
      grade_name: Grade.name,
      class_group_id: ClassGroup.class_group_id,
      class_group_name: ClassGroup.name,
    })
    .from(Subject)
    .innerJoin(
      StudentSubjectEnrollment,
      eq(Subject.subject_id, StudentSubjectEnrollment.subject_id),
    )
    .innerJoin(
      StudentClassGroup,
      and(
        eq(StudentSubjectEnrollment.user_id, StudentClassGroup.user_id),
        eq(
          StudentSubjectEnrollment.academic_year_id,
          StudentClassGroup.academic_year_id,
        ),
      ),
    )
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .where(
      and(
        ...([
          gradeFilter,
          eq(StudentClassGroup.status, "ACTIVE"),
          yearId ? eq(StudentClassGroup.academic_year_id, yearId) : undefined,
        ].filter(Boolean) as any[]),
      ),
    );

  interface ScopedSubject {
    subject_id: number;
    code: string | null;
    name: string;
    description: string | null;
    status: string | null;
    color: string | null;
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

  for (const row of taught) {
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
    subjects = subjects.filter((s) =>
      matches(search, s.name, s.code, s.description),
    );
  }
  subjects.sort((a, b) => a.name.localeCompare(b.name));

  const totalCount = subjects.length;
  setPaginationHeaders(res, totalCount, pageNum, limitNum);
  successResponse(
    res,
    "Subjects retrieved successfully",
    subjects.slice(offset, offset + limitNum),
  );
});

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
    email: User.email,
    phone_number: User.phone_number,
    status: User.status,
    first_name: UserProfile.first_name,
    last_name: UserProfile.last_name,
    user_type: UserProfile.user_type,
    gender: UserProfile.gender,
    grade_id: ClassGroup.grade_id,
    grade_name: Grade.name,
    class_group_id: ClassGroup.class_group_id,
    class_group_name: ClassGroup.name,
  };

  const students = await db
    .select(baseColumns)
    .from(User)
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .innerJoin(StudentClassGroup, eq(User.user_id, StudentClassGroup.user_id))
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .where(
      and(
        ...([
          gradeFilter,
          eq(StudentClassGroup.status, "ACTIVE"),
          yearId ? eq(StudentClassGroup.academic_year_id, yearId) : undefined,
        ].filter(Boolean) as any[]),
      ),
    );

  const teachers = await db
    .select(baseColumns)
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
            ? eq(TeacherSubjectAssignment.academic_year_id, yearId)
            : undefined,
        ].filter(Boolean) as any[]),
      ),
    );

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
    users: users.slice(offset, offset + limitNum),
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
  if (scope.scoped && targetId !== req.user?.userId) {
    const reachable = await isWithinScope(targetId, scope.classGroupIds, yearId);
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
          ...(yearId ? [eq(StudentClassGroup.academic_year_id, yearId)] : []),
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
        class_group_name: ClassGroup.name,
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
      .where(
        and(
          eq(TeacherSubjectAssignment.user_id, targetId),
          ...(yearId
            ? [eq(TeacherSubjectAssignment.academic_year_id, yearId)]
            : []),
        ),
      ),
    db
      .selectDistinct({
        subject_id: Subject.subject_id,
        name: Subject.name,
        code: Subject.code,
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

  const { password_hash, ...safeUser } = target as any;

  successResponse(res, "User profile retrieved successfully", {
    user: safeUser,
    profile: profileRows[0] ?? null,
    roles,
    permissions: Array.from(
      new Set(roles.flatMap((r) => r.permissions.map((p) => p.name))),
    ),
    assignedGrades: gradeRows,
    classGroups: classGroupRows,
    assignedPrograms: programRows,
    subjectsTaught: taughtRows,
    subjectsEnrolled: enrolledRows,
  });
});

/** Is the target user a student or teacher in any of these class groups? */
const isWithinScope = async (
  targetId: number,
  classGroupIds: number[],
  yearId: number | null,
) => {
  if (classGroupIds.length === 0) return false;

  const asStudent = await db
    .select({ user_id: StudentClassGroup.user_id })
    .from(StudentClassGroup)
    .where(
      and(
        eq(StudentClassGroup.user_id, targetId),
        inArray(StudentClassGroup.class_group_id, classGroupIds),
        ...(yearId ? [eq(StudentClassGroup.academic_year_id, yearId)] : []),
      ),
    )
    .limit(1);
  if (asStudent.length > 0) return true;

  const asTeacher = await db
    .select({ user_id: TeacherSubjectAssignment.user_id })
    .from(TeacherSubjectAssignment)
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, targetId),
        inArray(TeacherSubjectAssignment.class_group_id, classGroupIds),
        ...(yearId
          ? [eq(TeacherSubjectAssignment.academic_year_id, yearId)]
          : []),
      ),
    )
    .limit(1);
  return asTeacher.length > 0;
};
