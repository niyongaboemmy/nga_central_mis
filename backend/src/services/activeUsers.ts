// Active users only (ACTIVE_USERS_CONTRACTS.md, "MIS" section).
//
// Lists of people -- rosters, pickers, searches, directories, recipients and
// counts that drive an action -- return ACTIVE users only. History (grades,
// records, audit logs) is not filtered. Every roster fix goes through these
// helpers so "active" means the same thing everywhere:
//   - active user     User.status = 'ACTIVE' (INACTIVE / SUSPENDED are not)
//   - active student  active user + STUDENT + ACTIVE StudentClassGroup row in
//                     the year (default: the current academic year)
//   - subject roster  also an ACTIVE StudentSubjectEnrollment row that year
import { and, eq, or, sql, SQL } from "drizzle-orm";
import {
  User,
  UserProfile,
  StudentClassGroup,
  StudentSubjectEnrollment,
  UserRole,
  Role,
  TeacherSubjectAssignment,
} from "../db/schema";
import { ValidationError } from "../errors/CustomError";

export const USER_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const isUserStatus = (v: unknown): v is UserStatus =>
  typeof v === "string" && (USER_STATUSES as readonly string[]).includes(v);

/** `User.status = 'ACTIVE'` -- put it in a join condition or a WHERE. */
export const activeUser: SQL = eq(User.status, "ACTIVE");

/** Join condition for `User` on a user-id column, ACTIVE users only:
 *  `.innerJoin(User, activeUserJoin(StudentClassGroup.user_id))`. */
export const activeUserJoin = (userIdColumn: any): SQL =>
  and(eq(User.user_id, userIdColumn), activeUser) as SQL;

/** ACTIVE StudentClassGroup placement, in `yearId` when one is known. */
export const activeStudentPlacement = (yearId?: number | null): SQL =>
  (yearId
    ? and(
        eq(StudentClassGroup.status, "ACTIVE"),
        eq(StudentClassGroup.academic_year_id, yearId),
      )
    : eq(StudentClassGroup.status, "ACTIVE")) as SQL;

/** ACTIVE StudentSubjectEnrollment row, in `yearId` when one is known. */
export const activeEnrollment = (yearId?: number | null): SQL =>
  (yearId
    ? and(
        eq(StudentSubjectEnrollment.status, "ACTIVE"),
        eq(StudentSubjectEnrollment.academic_year_id, yearId),
      )
    : eq(StudentSubjectEnrollment.status, "ACTIVE")) as SQL;

/** The enrollment row counts only when the subject is taught, that year, to
 *  the class group the student actively sits in -- or when the subject has no
 *  teaching assignment that year yet (then the enrollment alone decides, so an
 *  unassigned subject does not vanish). A stale enrollment left behind when a
 *  student moved class must not show them the subject's work (2026-11-22: ten
 *  SPES Year 2 A students kept GENEG302, a Year 1 A subject, and saw its
 *  assignments on their dashboard). Needs `StudentSubjectEnrollment` in the
 *  query; correlated EXISTS, so it never multiplies rows. */
export const enrollmentInTaughtClass: SQL = sql`(
  NOT EXISTS (
    SELECT 1 FROM ${TeacherSubjectAssignment} tsa_any
    WHERE tsa_any.subject_id = ${StudentSubjectEnrollment.subject_id}
      AND tsa_any.academic_year_id = ${StudentSubjectEnrollment.academic_year_id}
  )
  OR EXISTS (
    SELECT 1 FROM ${TeacherSubjectAssignment} tsa_cls
    JOIN ${StudentClassGroup} scg_cls
      ON scg_cls.class_group_id = tsa_cls.class_group_id
     AND scg_cls.academic_year_id = tsa_cls.academic_year_id
     AND scg_cls.status = 'ACTIVE'
    WHERE tsa_cls.subject_id = ${StudentSubjectEnrollment.subject_id}
      AND tsa_cls.academic_year_id = ${StudentSubjectEnrollment.academic_year_id}
      AND scg_cls.user_id = ${StudentSubjectEnrollment.user_id}
  )
)`;

/** A real student: the profile says STUDENT, or they hold the STUDENT role.
 *  Needs `User` and `UserProfile` in the query. EXISTS rather than a join so a
 *  user holding several roles is never returned twice. */
export const isStudentPredicate: SQL = or(
  eq(UserProfile.user_type, "STUDENT"),
  sql`EXISTS (SELECT 1 FROM ${UserRole} ur JOIN ${Role} r ON r.role_id = ur.role_id
              WHERE ur.user_id = ${User.user_id} AND r.name = 'STUDENT')`,
) as SQL;

// ---- raw SQL fragments, for code written with db.execute(sql`...`) --------

/** `<alias>.status = 'ACTIVE'` for a User alias: sql`... AND ${activeUserSql("u")}`. */
export const activeUserSql = (alias = "u"): SQL =>
  sql.raw(`${alias}.status = 'ACTIVE'`);

/** `JOIN User <alias> ON <alias>.user_id = <col> AND <alias>.status = 'ACTIVE'`. */
export const joinActiveUserSql = (userIdColumn: string, alias = "au"): SQL =>
  sql.raw(
    `JOIN User ${alias} ON ${alias}.user_id = ${userIdColumn} AND ${alias}.status = 'ACTIVE'`,
  );

/** `EXISTS (... active user ...)` for a user-id column: no join needed. */
export const isActiveUserSql = (userIdColumn: string): SQL =>
  sql.raw(
    `EXISTS (SELECT 1 FROM User au_x WHERE au_x.user_id = ${userIdColumn} AND au_x.status = 'ACTIVE')`,
  );

/** Parse a `status` query parameter for admin user lists.
 *  undefined/"" -> the given default; "all" -> null (no filter);
 *  ACTIVE|INACTIVE|SUSPENDED (any case) -> that status; anything else -> throws. */
export const parseStatusFilter = (
  raw: unknown,
  fallback: UserStatus | null = "ACTIVE",
): UserStatus | null => {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const v = String(raw).trim().toUpperCase();
  if (v === "ALL") return null;
  if (isUserStatus(v)) return v;
  throw new ValidationError(
    "status must be one of ACTIVE, INACTIVE, SUSPENDED or all",
  );
};

/** `include_inactive=1` is honoured only for callers who manage users. */
export const wantsInactive = (req: any): boolean => {
  const flag = String(req?.query?.include_inactive ?? "").toLowerCase();
  if (!(flag === "1" || flag === "true")) return false;
  const perms: string[] = req?.user?.permissions ?? [];
  return perms.includes("MANAGE_USERS");
};
