import { and, eq, inArray, isNull, lte, gte, or } from "drizzle-orm";
import { db } from "../../db";
import {
  AccessGrant,
  AccessPermission,
  AccessRole,
  AccessRolePermission,
  DepartmentSubject,
  UserAccessVersion,
} from "../../db/accessSchema";
import {
  ClassGroup,
  Grade,
  GradeSubject,
  MentorAssignment,
  Parenting,
  StudentClassGroup,
  TeacherSubjectAssignment,
  UserProfile,
} from "../../db/schema";
import {
  ACCESS_CORE_VERSION,
  AccessSnapshot,
  CapabilityEntry,
  Depth,
  GrantInfo,
  ScopeEntry,
  ScopeType,
} from "../../vendor/nga-access";
import { getCurrentAcademicYearId } from "../../utils/academicYear";

/**
 * Compiles a user's active grants into an AccessSnapshot for one app
 * (plan §7.1). The snapshot is the ONLY thing an app needs to decide: every
 * grant's node is pre-expanded to id lists, and each capability carries the
 * scopes (and read depths) of exactly the grants that give it -- never pooled.
 *
 * app = "*" compiles every app at once, keyed by registry name ("VIEW_RESULTS",
 * "da:DISCIPLINE_VIEW") -- used by MIS itself for delegation checks.
 */

export type GrantRow = typeof AccessGrant.$inferSelect;

const today = () => new Date().toISOString().slice(0, 10);

/** Grants in force today for the year (year-bound grants of other years are ignored). */
export async function loadActiveGrants(
  userId: number,
  yearId: number | null,
): Promise<Array<GrantRow & { role_name: string; role_preset: string | null; platform_only: number }>> {
  const d = today();
  const rows = await db
    .select({
      grant: AccessGrant,
      role_name: AccessRole.name,
      role_preset: AccessRole.preset_key,
      platform_only: AccessRole.platform_only,
    })
    .from(AccessGrant)
    .innerJoin(AccessRole, eq(AccessRole.role_id, AccessGrant.role_id))
    .where(
      and(
        eq(AccessGrant.user_id, userId),
        eq(AccessGrant.status, "ACTIVE"),
        eq(AccessRole.status, "ACTIVE"),
        or(isNull(AccessGrant.valid_from), lte(AccessGrant.valid_from, d)),
        or(isNull(AccessGrant.valid_until), gte(AccessGrant.valid_until, d)),
        yearId === null
          ? isNull(AccessGrant.academic_year_id)
          : or(isNull(AccessGrant.academic_year_id), eq(AccessGrant.academic_year_id, yearId)),
      ),
    );
  return rows.map((r) => ({
    ...r.grant,
    role_name: r.role_name,
    role_preset: r.role_preset,
    platform_only: r.platform_only,
  }));
}

const uniq = (xs: number[]) => Array.from(new Set(xs));

/** Expands one grant's node to plain id lists (plan §3.3). */
export async function expandScope(
  grant: Pick<GrantRow, "scope_type" | "scope_id" | "scope_id2" | "user_id" | "academic_year_id">,
  yearId: number | null,
): Promise<ScopeEntry> {
  const year = grant.academic_year_id ?? yearId;
  switch (grant.scope_type as ScopeType) {
    case "PLATFORM":
    case "SCHOOL":
      return { all: true };

    case "PROGRAM": {
      const programId = grant.scope_id!;
      const grades = await db
        .select({ grade_id: Grade.grade_id })
        .from(Grade)
        .where(eq(Grade.program_id, programId));
      const gradeIds = grades.map((g) => g.grade_id);
      const scope = await gradesToScope(gradeIds, year);
      return { programs: [programId], ...scope };
    }

    case "GRADE":
      return gradesToScope([grant.scope_id!], year);

    case "CLASS_GROUP":
      return { class_groups: [grant.scope_id!] };

    case "SUBJECT_CLASS":
      return { pairs: [[grant.scope_id!, grant.scope_id2!]] };

    case "DEPARTMENT": {
      const departmentId = grant.scope_id!;
      const subjects = (
        await db
          .select({ subject_id: DepartmentSubject.subject_id })
          .from(DepartmentSubject)
          .where(eq(DepartmentSubject.department_id, departmentId))
      ).map((s) => s.subject_id);
      if (subjects.length === 0) return { departments: [departmentId] };
      const taught = await db
        .select({
          subject_id: TeacherSubjectAssignment.subject_id,
          class_group_id: TeacherSubjectAssignment.class_group_id,
        })
        .from(TeacherSubjectAssignment)
        .where(
          and(
            inArray(TeacherSubjectAssignment.subject_id, subjects),
            year ? eq(TeacherSubjectAssignment.academic_year_id, year) : undefined,
          ),
        );
      const seen = new Set<string>();
      const pairs: Array<[number, number]> = [];
      for (const t of taught) {
        const k = `${t.subject_id}:${t.class_group_id}`;
        if (!seen.has(k)) {
          seen.add(k);
          pairs.push([t.subject_id, t.class_group_id]);
        }
      }
      return { departments: [departmentId], subjects, ...(pairs.length ? { pairs } : {}) };
    }

    case "MENTEES": {
      const rows = await db
        .select({ student_id: MentorAssignment.student_id })
        .from(MentorAssignment)
        .where(
          and(
            eq(MentorAssignment.mentor_id, grant.user_id),
            eq(MentorAssignment.status, "ACTIVE"),
            year ? eq(MentorAssignment.academic_year_id, year) : undefined,
          ),
        );
      return { students: uniq(rows.map((r) => r.student_id)) };
    }

    case "CHILDREN": {
      const rows = await db
        .select({ student_id: Parenting.student_id })
        .from(Parenting)
        .where(eq(Parenting.parent_id, grant.user_id));
      return { students: uniq(rows.map((r) => r.student_id)) };
    }

    case "SELF":
      return { self: grant.user_id };

    default:
      return {};
  }
}

async function gradesToScope(gradeIds: number[], year: number | null): Promise<ScopeEntry> {
  if (gradeIds.length === 0) return { grades: [] };
  const classGroups = (
    await db
      .select({ class_group_id: ClassGroup.class_group_id })
      .from(ClassGroup)
      .where(inArray(ClassGroup.grade_id, gradeIds))
  ).map((c) => c.class_group_id);
  const gradeSubjects = (
    await db
      .select({ subject_id: GradeSubject.subject_id })
      .from(GradeSubject)
      .where(inArray(GradeSubject.grade_id, gradeIds))
  ).map((s) => s.subject_id);
  const taughtSubjects = classGroups.length
    ? (
        await db
          .selectDistinct({ subject_id: TeacherSubjectAssignment.subject_id })
          .from(TeacherSubjectAssignment)
          .where(
            and(
              inArray(TeacherSubjectAssignment.class_group_id, classGroups),
              year ? eq(TeacherSubjectAssignment.academic_year_id, year) : undefined,
            ),
          )
      ).map((s) => s.subject_id)
    : [];
  const subjects = uniq([...gradeSubjects, ...taughtSubjects]);
  const out: ScopeEntry = { grades: gradeIds };
  if (classGroups.length) out.class_groups = classGroups;
  if (subjects.length) out.subjects = subjects;
  return out;
}

interface RoleCap {
  role_id: number;
  name: string;
  app: string;
  cap_key: string | null;
  kind: "READ" | "WRITE";
  depths: string | null;
  scopeable: number;
  depth: Depth | null;
}

async function loadRoleCaps(roleIds: number[], app: string): Promise<RoleCap[]> {
  if (roleIds.length === 0) return [];
  const rows = await db
    .select({
      role_id: AccessRolePermission.role_id,
      name: AccessPermission.name,
      app: AccessPermission.app,
      cap_key: AccessPermission.cap_key,
      kind: AccessPermission.kind,
      depths: AccessPermission.depths,
      scopeable: AccessPermission.scopeable,
      depth: AccessRolePermission.depth,
    })
    .from(AccessRolePermission)
    .innerJoin(AccessPermission, eq(AccessPermission.perm_id, AccessRolePermission.perm_id))
    .where(
      and(
        inArray(AccessRolePermission.role_id, roleIds),
        eq(AccessPermission.status, "ACTIVE"),
        isNull(AccessPermission.deprecated_at),
        app === "*" ? undefined : eq(AccessPermission.app, app),
      ),
    );
  return rows as RoleCap[];
}

/**
 * Depth a READ link grants. A link with no depth (every legacy link) means
 * "detail" -- the full access it always gave -- capped to what the
 * capability supports.
 */
export function effectiveDepth(link: Pick<RoleCap, "kind" | "depths" | "depth">): Depth | null {
  if (link.kind !== "READ") return null;
  const supported = (link.depths ?? "detail").split(",").filter(Boolean) as Depth[];
  const wanted: Depth = link.depth ?? "detail";
  if (supported.includes(wanted)) return wanted;
  // Deepest supported depth not deeper than the wanted one, else the shallowest.
  const order: Depth[] = ["summary", "detail", "sensitive"];
  const allowed = supported.filter((d) => order.indexOf(d) <= order.indexOf(wanted));
  return allowed.length ? allowed[allowed.length - 1] : supported[0] ?? null;
}

function homeFor(grants: GrantRow[]): string | null {
  const rank: Record<string, number> = {
    PLATFORM: 7, SCHOOL: 6, PROGRAM: 5, DEPARTMENT: 4, GRADE: 3, CLASS_GROUP: 2, SUBJECT_CLASS: 1,
  };
  let best: GrantRow | null = null;
  for (const g of grants) {
    if (!(g.scope_type in rank)) continue;
    if (!best || rank[g.scope_type] > rank[best.scope_type]) best = g;
  }
  if (!best) return null;
  switch (best.scope_type) {
    case "PLATFORM":
    case "SCHOOL":
      return "insights:SCHOOL";
    case "PROGRAM":
    case "DEPARTMENT":
    case "GRADE":
      return `insights:${best.scope_type}:${best.scope_id}`;
    default:
      return "teacher-dashboard";
  }
}

export async function currentAccessVersion(userId: number): Promise<number> {
  const [u] = await db
    .select({ v: UserAccessVersion.access_version })
    .from(UserAccessVersion)
    .where(eq(UserAccessVersion.user_id, userId))
    .limit(1);
  return u?.v ?? 0;
}

/**
 * Class groups a person belongs to as a learner this year: a student's own,
 * a parent's children's. Membership for relationship rules in the apps (e.g.
 * Tupo's "students may message their teachers and classmates").
 */
async function learnerClassGroups(userId: number, persona: string | null, yearId: number | null): Promise<number[]> {
  if (!yearId || (persona !== "STUDENT" && persona !== "PARENT")) return [];
  const learners =
    persona === "STUDENT"
      ? [userId]
      : (await db.select({ id: Parenting.student_id }).from(Parenting).where(eq(Parenting.parent_id, userId))).map((r) => r.id);
  if (learners.length === 0) return [];
  const rows = await db
    .selectDistinct({ class_group_id: StudentClassGroup.class_group_id })
    .from(StudentClassGroup)
    .where(
      and(
        inArray(StudentClassGroup.user_id, learners),
        eq(StudentClassGroup.academic_year_id, yearId),
        eq(StudentClassGroup.status, "ACTIVE"),
      ),
    );
  return rows.map((r) => r.class_group_id);
}

/** Build the snapshot (uncached -- see snapshotCache.ts). */
export async function compileSnapshot(
  userId: number,
  app: string,
  opts: { yearId?: number | null } = {},
): Promise<AccessSnapshot> {
  const yearId = opts.yearId !== undefined ? opts.yearId : await getCurrentAcademicYearId();
  const [v, loaded, profile, account] = await Promise.all([
    currentAccessVersion(userId),
    loadActiveGrants(userId, yearId),
    db
      .select({ user_type: UserProfile.user_type })
      .from(UserProfile)
      .where(eq(UserProfile.user_id, userId))
      .limit(1),
    db
      .select({ status: UserAccessVersion.status })
      .from(UserAccessVersion)
      .where(eq(UserAccessVersion.user_id, userId))
      .limit(1),
  ]);
  // A disabled or suspended account holds nothing, whatever grants remain.
  const grants = account[0]?.status === "ACTIVE" ? loaded : [];

  const caps = await loadRoleCaps(uniq(grants.map((g) => g.role_id)), app);
  const capsByRole = new Map<number, RoleCap[]>();
  for (const c of caps) {
    const list = capsByRole.get(c.role_id) ?? [];
    list.push(c);
    capsByRole.set(c.role_id, list);
  }

  const out: Record<string, CapabilityEntry[]> = {};
  const grantInfo: Record<string, GrantInfo> = {};
  const appsWithCaps = new Set<string>();

  for (const g of grants) {
    const roleCaps = capsByRole.get(g.role_id) ?? [];
    grantInfo[String(g.grant_id)] = {
      role: g.role_name,
      role_id: g.role_id,
      title: g.title ?? null,
      scope_type: g.scope_type as ScopeType,
      scope_id: g.scope_id ?? null,
      scope_id2: g.scope_id2 ?? null,
      valid_until: g.valid_until ?? null,
    };
    if (roleCaps.length === 0) continue;
    const scope = await expandScope(g, yearId);
    const wide = g.scope_type === "SCHOOL" || g.scope_type === "PLATFORM";
    for (const c of roleCaps) {
      // School-only capabilities (SSO clients, settings...) mean nothing on a
      // narrower node -- a programme lead cannot own "the SSO clients of
      // programme 2".
      if (!c.scopeable && !wide) continue;
      const key = app === "*" ? c.name : c.cap_key ?? c.name;
      (out[key] ??= []).push({ depth: effectiveDepth(c), scope, via: [g.grant_id] });
      appsWithCaps.add(c.app);
    }
  }

  return {
    v,
    app,
    core: ACCESS_CORE_VERSION,
    user: {
      id: userId,
      persona: profile[0]?.user_type ?? null,
      school_id: grants[0]?.school_id ?? 1,
      class_groups:
        account[0]?.status === "ACTIVE"
          ? await learnerClassGroups(userId, profile[0]?.user_type ?? null, yearId)
          : [],
    },
    year: yearId,
    caps: out,
    grants: grantInfo,
    home: homeFor(grants),
    systems: Array.from(appsWithCaps).sort(),
    generated_at: new Date().toISOString(),
  };
}
