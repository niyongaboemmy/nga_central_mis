import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  ClassGroup,
  Grade,
  MentorAssignment,
  Parenting,
  Program,
  TeacherSubjectAssignment,
  UserGrade,
  UserProgramLead,
  UserProfile,
} from "../../db/schema";
import { Department, DepartmentSubject } from "../../db/accessSchema";
import {
  AccessSnapshot,
  CapabilityEntry,
  Depth,
  depthSatisfies,
  GrantInfo,
  maxDepth,
  ScopeEntry,
} from "../../vendor/nga-access";
import { MIS_MANIFEST } from "../../access/manifest";
import { getEffectivePermissions, getUserRoleNames } from "../../utils/auth";
import { engineReady, misAccessMode, recordShadowDiff } from "../access/policy";
import { getSnapshot } from "../access/snapshotCache";
import { HomeLens, LensType } from "./contract";

// ============================================================================
// Home decides nothing about access itself (plan §3, §15): it asks the access
// engine. Which engine depends on the MIS access mode, so Home always agrees
// with the routes its buttons lead to:
//
//   enforce  -> the v2 snapshot (grants x capabilities x depth)
//   off / shadow -> today's permissions, lifted into the same snapshot shape
//               ("legacy snapshot") so every rule below is written once, in
//               v2 terms, and simply starts reading real grants at cut-over.
//
// In shadow mode the v2 lenses are computed as well and every difference is
// recorded in AccessShadowDiff (route "/home/overview"), so leadership can
// see Home's cut-over effect in Access Studio before enforcing.
// ============================================================================

const READ_CAPS = new Set(
  Object.entries(MIS_MANIFEST.capabilities)
    .filter(([, def]) => def.kind === "READ")
    .map(([name]) => name),
);

/** Own-work permissions: they apply where the user teaches. */
const TEACHING_PERMS = new Set([
  "TEACHER_DASHBOARD",
  "VIEW_MY_ASSIGNED_SUBJECTS",
  "VIEW_MY_STUDENTS",
  "VIEW_MY_CALENDAR",
  "SUBMIT_REPORTING",
  "MANAGE_LESSON_NOTES",
  "MANAGE_COURSE_CONTENT",
  "OVERRIDE_COURSE_PROGRESS",
  "MARK_ATTENDANCE",
  "ENTER_MARKS",
  "UPLOAD_SUBJECT_DOCUMENTS",
]);

/** Class-teacher permissions: they apply to the class(es) the user leads. */
const CLASS_PERMS = new Set([
  "VIEW_USERS_BY_CLASS_TEACHER_GRADE",
  "VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE",
  "VIEW_CALENDAR_BY_CLASS_TEACHER_GRADE",
]);

/** Programme-lead permissions: they apply to the led programme(s). */
const PROGRAM_PERMS = new Set(["VIEW_PROGRAM_USERS", "VIEW_PROGRAM_ACADEMICS"]);

/**
 * Oversight / operations permissions. Legacy semantics (resolveUserScope):
 * scoped to the user's class or programme placements, school-wide without any.
 * Only these can put a School lens on the page -- a teacher holding, say,
 * VIEW_ACADEMIC_CALENDAR must not become a "school" viewer.
 */
export const OVERSIGHT_PERMS = new Set([
  "VALIDATE_SCHEME_OF_WORK",
  "VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST",
  "VIEW_REPORTS",
  "ALL_SUBMITTED_REPORTS",
  "MANAGE_REPORTS",
  "VIEW_ACADEMICS",
  "MANAGE_ACADEMICS",
  "ASSIGN_STUDENT_CLASS_GROUPS",
  "ASSIGN_TEACHER_SUBJECTS",
  "ASSIGN_GRADE_TO_CLASS_TEACHER",
  "MANAGE_USERS",
  "MANAGE_ACADEMIC_CALENDAR",
  "MANAGE_MENTOR_ASSIGNMENTS",
  "VIEW_ALL_COURSES",
  "SUPER_ADMIN_DASHBOARD",
  "MANAGE_SYSTEMS",
]);

/** Synthetic grant ids for the legacy snapshot (negative, never collide with AccessGrant). */
const G_SELF = -1;
const G_TEACHING = -2;
const G_MENTEES = -3;
const G_CHILDREN = -4;
const G_SCHOOL = -5;
const G_CLASS_BASE = -1000;
const G_PROGRAM_BASE = -2000;

export interface Structure {
  classGroups: Map<number, { name: string; grade_id: number; program_id: number }>;
  grades: Map<number, { name: string; program_id: number }>;
  programs: Map<number, { name: string }>;
  departments: Map<number, { name: string; subject_ids: number[] }>;
}

/** The school hierarchy, small enough to hold in memory for one request. */
export async function loadStructure(withDepartments: boolean): Promise<Structure> {
  const [cgRows, gradeRows, programRows, deptRows, deptSubjectRows] = await Promise.all([
    db
      .select({ id: ClassGroup.class_group_id, name: ClassGroup.name, grade_id: ClassGroup.grade_id })
      .from(ClassGroup),
    db.select({ id: Grade.grade_id, name: Grade.name, program_id: Grade.program_id }).from(Grade),
    db.select({ id: Program.program_id, name: Program.name }).from(Program),
    withDepartments
      ? db.select({ id: Department.department_id, name: Department.name }).from(Department)
      : Promise.resolve([] as Array<{ id: number; name: string }>),
    withDepartments
      ? db
          .select({ department_id: DepartmentSubject.department_id, subject_id: DepartmentSubject.subject_id })
          .from(DepartmentSubject)
      : Promise.resolve([] as Array<{ department_id: number; subject_id: number }>),
  ]);
  const grades = new Map(gradeRows.map((g) => [g.id, { name: g.name, program_id: g.program_id }]));
  const classGroups = new Map(
    cgRows.map((c) => [
      c.id,
      { name: c.name, grade_id: c.grade_id, program_id: grades.get(c.grade_id)?.program_id ?? 0 },
    ]),
  );
  const departments = new Map(
    deptRows.map((d) => [
      d.id,
      {
        name: d.name,
        subject_ids: deptSubjectRows.filter((s) => s.department_id === d.id).map((s) => s.subject_id),
      },
    ]),
  );
  return {
    classGroups,
    grades,
    programs: new Map(programRows.map((p) => [p.id, { name: p.name }])),
    departments,
  };
}

const classGroupsOfGrade = (s: Structure, gradeId: number) =>
  [...s.classGroups.entries()].filter(([, c]) => c.grade_id === gradeId).map(([id]) => id);
const classGroupsOfProgram = (s: Structure, programId: number) =>
  [...s.classGroups.entries()].filter(([, c]) => c.program_id === programId).map(([id]) => id);
const gradesOfProgram = (s: Structure, programId: number) =>
  [...s.grades.entries()].filter(([, g]) => g.program_id === programId).map(([id]) => id);

export interface Placements {
  /**
   * Holds (or held) a class-teacher or programme-lead placement in ANY year.
   * Such a user is never widened to the whole school just because the
   * selected year has no placement for them -- the same rule as
   * resolveUserScope ("assigned in another year" is scoped, not unrestricted).
   */
  everPlaced: boolean;
  pairs: Array<[number, number]>;
  classLeads: Array<{ grade_id: number; class_group_id: number | null }>;
  programLeads: number[];
  mentees: number[];
  children: number[];
}

const everPlaced = async (userId: number): Promise<boolean> => {
  const [grade, program] = await Promise.all([
    db.select({ id: UserGrade.user_id }).from(UserGrade).where(eq(UserGrade.user_id, userId)).limit(1),
    db.select({ id: UserProgramLead.user_id }).from(UserProgramLead).where(eq(UserProgramLead.user_id, userId)).limit(1),
  ]);
  return grade.length > 0 || program.length > 0;
};

export async function loadPlacements(userId: number, yearId: number | null): Promise<Placements> {
  if (!yearId) {
    const [children, placedEver] = await Promise.all([
      db.select({ id: Parenting.student_id }).from(Parenting).where(eq(Parenting.parent_id, userId)),
      everPlaced(userId),
    ]);
    return {
      everPlaced: placedEver,
      pairs: [],
      classLeads: [],
      programLeads: [],
      mentees: [],
      children: children.map((c) => c.id),
    };
  }
  const [tsa, grades, programs, mentees, children, placedEver] = await Promise.all([
    db
      .select({ s: TeacherSubjectAssignment.subject_id, c: TeacherSubjectAssignment.class_group_id })
      .from(TeacherSubjectAssignment)
      .where(and(eq(TeacherSubjectAssignment.user_id, userId), eq(TeacherSubjectAssignment.academic_year_id, yearId))),
    db
      .select({ grade_id: UserGrade.grade_id, class_group_id: UserGrade.class_group_id })
      .from(UserGrade)
      .where(and(eq(UserGrade.user_id, userId), eq(UserGrade.academic_year_id, yearId))),
    db
      .select({ program_id: UserProgramLead.program_id })
      .from(UserProgramLead)
      .where(and(eq(UserProgramLead.user_id, userId), eq(UserProgramLead.academic_year_id, yearId))),
    db
      .select({ student_id: MentorAssignment.student_id })
      .from(MentorAssignment)
      .where(
        and(
          eq(MentorAssignment.mentor_id, userId),
          eq(MentorAssignment.academic_year_id, yearId),
          eq(MentorAssignment.status, "ACTIVE"),
        ),
      ),
    db.select({ id: Parenting.student_id }).from(Parenting).where(eq(Parenting.parent_id, userId)),
    everPlaced(userId),
  ]);
  return {
    everPlaced: placedEver,
    pairs: tsa.map((r) => [r.s, r.c] as [number, number]),
    classLeads: grades.map((g) => ({ grade_id: g.grade_id, class_group_id: g.class_group_id ?? null })),
    programLeads: [...new Set(programs.map((p) => p.program_id))],
    mentees: [...new Set(mentees.map((m) => m.student_id))],
    children: [...new Set(children.map((c) => c.id))],
  };
}

/**
 * Today's permissions lifted into the v2 snapshot shape. Each placement
 * becomes a synthetic grant so lenses, non-pooling and "why" work exactly as
 * they will with real grants.
 */
export async function buildLegacySnapshot(params: {
  userId: number;
  yearId: number | null;
  persona: string | null;
  structure: Structure;
  placements: Placements;
}): Promise<AccessSnapshot> {
  const { userId, yearId, persona, structure: s, placements: p } = params;
  const [perms, roleNames] = await Promise.all([getEffectivePermissions(userId), getUserRoleNames(userId)]);
  const roleLabel = roleNames.length > 0 ? roleNames.join(", ") : persona ?? "Account";

  const grants: Record<string, GrantInfo> = {};
  const addGrant = (id: number, role: string, scope_type: GrantInfo["scope_type"], scope_id: number | null = null) => {
    grants[String(id)] = { role, role_id: 0, title: null, scope_type, scope_id, scope_id2: null, valid_until: null };
  };

  addGrant(G_SELF, roleLabel, "SELF");
  const selfEntry = (): ScopeEntry => ({ self: userId });

  const classEntries: Array<{ id: number; scope: ScopeEntry }> = [];
  p.classLeads.forEach((cl, i) => {
    const id = G_CLASS_BASE - i;
    if (cl.class_group_id) {
      addGrant(id, "Class teacher", "CLASS_GROUP", cl.class_group_id);
      classEntries.push({ id, scope: { class_groups: [cl.class_group_id], grades: [cl.grade_id] } });
    } else {
      addGrant(id, "Class teacher", "GRADE", cl.grade_id);
      classEntries.push({ id, scope: { grades: [cl.grade_id], class_groups: classGroupsOfGrade(s, cl.grade_id) } });
    }
  });

  const programEntries: Array<{ id: number; scope: ScopeEntry }> = p.programLeads.map((programId, i) => {
    const id = G_PROGRAM_BASE - i;
    addGrant(id, "Programme lead", "PROGRAM", programId);
    return {
      id,
      scope: {
        programs: [programId],
        grades: gradesOfProgram(s, programId),
        class_groups: classGroupsOfProgram(s, programId),
      },
    };
  });

  if (p.pairs.length > 0) addGrant(G_TEACHING, "Subject teacher", "SUBJECT_CLASS");
  if (p.mentees.length > 0) addGrant(G_MENTEES, "Mentor", "MENTEES");
  if (p.children.length > 0) addGrant(G_CHILDREN, "Parent", "CHILDREN");

  const placed = classEntries.length > 0 || programEntries.length > 0;
  const holdsOversight = perms.some((perm) => OVERSIGHT_PERMS.has(perm));
  // School-wide only for someone with oversight rights and no class or
  // programme placement in any year (see Placements.everPlaced).
  const schoolWide = !placed && !p.everPlaced && holdsOversight;
  if (schoolWide) addGrant(G_SCHOOL, roleLabel, "SCHOOL");

  const caps: Record<string, CapabilityEntry[]> = {};
  const push = (cap: string, scope: ScopeEntry, via: number) => {
    (caps[cap] ??= []).push({ depth: READ_CAPS.has(cap) ? "detail" : null, scope, via: [via] });
  };

  for (const perm of perms) {
    if (TEACHING_PERMS.has(perm)) {
      push(perm, selfEntry(), G_SELF);
      if (p.pairs.length > 0) push(perm, { pairs: p.pairs, self: userId }, G_TEACHING);
    } else if (CLASS_PERMS.has(perm)) {
      for (const e of classEntries) push(perm, e.scope, e.id);
    } else if (PROGRAM_PERMS.has(perm)) {
      for (const e of programEntries) push(perm, e.scope, e.id);
    } else if (OVERSIGHT_PERMS.has(perm)) {
      if (placed) {
        for (const e of [...classEntries, ...programEntries]) push(perm, e.scope, e.id);
      } else if (schoolWide) {
        push(perm, { all: true }, G_SCHOOL);
      }
    } else {
      push(perm, selfEntry(), G_SELF);
    }
  }
  if (p.mentees.length > 0) push("MENTOR_OF_STUDENTS", { students: p.mentees }, G_MENTEES);
  if (p.children.length > 0) push("PARENT_OF_STUDENTS", { students: p.children }, G_CHILDREN);

  return {
    v: 0,
    app: "mis",
    core: "legacy",
    user: { id: userId, persona, school_id: 1 },
    year: yearId,
    caps,
    grants,
    home: null,
    systems: [],
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Lenses
// ---------------------------------------------------------------------------

export interface ResolvedLens extends HomeLens {
  /** Class groups this lens covers; null = the whole school. */
  classGroupIds: number[] | null;
  /** DEPARTMENT lenses restrict to these subjects. */
  subjectIds: number[] | null;
  /** TEACHING lens: its (subject, class) pairs. */
  pairs: Array<[number, number]>;
  scopeId: number | null;
}

const LENS_ORDER: LensType[] = [
  "SCHOOL",
  "PLATFORM",
  "PROGRAM",
  "DEPARTMENT",
  "GRADE",
  "CLASS_GROUP",
  "TEACHING",
  "MENTEES",
  "CHILDREN",
  "SELF",
];

const lensTypeOf = (scopeType: string): LensType | null => {
  switch (scopeType) {
    case "SUBJECT_CLASS":
      return "TEACHING";
    case "SELF":
    case "MENTEES":
    case "CHILDREN":
    case "CLASS_GROUP":
    case "GRADE":
    case "DEPARTMENT":
    case "PROGRAM":
    case "SCHOOL":
    case "PLATFORM":
      return scopeType;
    default:
      return null;
  }
};

export function buildLenses(snapshot: AccessSnapshot, s: Structure, pairs: Array<[number, number]>): ResolvedLens[] {
  const byKey = new Map<string, ResolvedLens>();
  for (const [gid, g] of Object.entries(snapshot.grants)) {
    const type = lensTypeOf(g.scope_type);
    if (!type) continue;
    const scoped = ["CLASS_GROUP", "GRADE", "DEPARTMENT", "PROGRAM"].includes(type);
    if (scoped && !g.scope_id) continue;
    const key = scoped ? `${type}:${g.scope_id}` : type;
    const existing = byKey.get(key);
    if (existing) {
      existing.via.push(Number(gid));
      if (!existing.reason.includes(g.title ?? g.role)) existing.reason += `, ${g.title ?? g.role}`;
      continue;
    }
    let label = "";
    let classGroupIds: number[] | null = [];
    let subjectIds: number[] | null = null;
    const id = g.scope_id ?? null;
    switch (type) {
      case "SELF":
        label = "Me";
        classGroupIds = [];
        break;
      case "TEACHING":
        label = "Teaching";
        classGroupIds = [...new Set(pairs.map(([, c]) => c))];
        break;
      case "MENTEES":
        label = "My mentees";
        break;
      case "CHILDREN":
        label = "My children";
        break;
      case "CLASS_GROUP":
        label = `Class ${s.classGroups.get(id!)?.name ?? `#${id}`}`;
        classGroupIds = [id!];
        break;
      case "GRADE":
        label = s.grades.get(id!)?.name ?? `Grade #${id}`;
        classGroupIds = classGroupsOfGrade(s, id!);
        break;
      case "PROGRAM":
        label = `${s.programs.get(id!)?.name ?? `Programme #${id}`}`;
        classGroupIds = classGroupsOfProgram(s, id!);
        break;
      case "DEPARTMENT":
        label = `${s.departments.get(id!)?.name ?? `Department #${id}`} department`;
        classGroupIds = null;
        subjectIds = s.departments.get(id!)?.subject_ids ?? [];
        break;
      case "SCHOOL":
        label = "School";
        classGroupIds = null;
        break;
      case "PLATFORM":
        label = "Platform";
        classGroupIds = null;
        break;
    }
    byKey.set(key, {
      key,
      type,
      label: g.title && type !== "SELF" && type !== "TEACHING" ? g.title : label,
      reason: g.title ?? g.role,
      via: [Number(gid)],
      classGroupIds,
      subjectIds,
      pairs: type === "TEACHING" ? pairs : [],
      scopeId: id,
    });
  }
  // Every account has a "Me" lens, even with no SELF grant yet.
  if (![...byKey.values()].some((l) => l.type === "SELF")) {
    byKey.set("SELF", {
      key: "SELF",
      type: "SELF",
      label: "Me",
      reason: "Your account",
      via: [],
      classGroupIds: [],
      subjectIds: null,
      pairs: [],
      scopeId: null,
    });
  }
  return [...byKey.values()].sort(
    (a, b) => LENS_ORDER.indexOf(a.type) - LENS_ORDER.indexOf(b.type) || a.label.localeCompare(b.label),
  );
}

/**
 * Is `cap` held AT this lens -- through a grant that put the lens on the page?
 * Grants are never pooled (RBAC principle 4): a school-wide grant does not make
 * a programme lens show school-wide work, and vice versa.
 */
export function heldAt(
  snapshot: AccessSnapshot,
  cap: string | string[],
  lens: ResolvedLens,
  minDepth: Depth | null = null,
): { allowed: boolean; depth: Depth | null; kind: "read" | "write" | null; via: number[] } {
  let depth: Depth | null = null;
  let found = false;
  let write = false;
  const via: number[] = [];
  for (const c of Array.isArray(cap) ? cap : [cap]) {
    for (const e of snapshot.caps?.[c] ?? []) {
      if (!e.via.some((g) => lens.via.includes(g))) continue;
      found = true;
      if (e.depth === null) write = true;
      depth = maxDepth(depth, e.depth);
      for (const g of e.via) if (!via.includes(g)) via.push(g);
    }
  }
  if (!found) return { allowed: false, depth: null, kind: null, via: [] };
  const allowed = write || depthSatisfies(depth, minDepth);
  return { allowed, depth, kind: write && !depth ? "write" : "read", via };
}

// ---------------------------------------------------------------------------
// The access context for one Home request
// ---------------------------------------------------------------------------

export interface HomeAccessContext {
  userId: number;
  persona: string | null;
  firstName: string | null;
  lastName: string | null;
  snapshot: AccessSnapshot;
  source: "legacy" | "v2";
  mode: "off" | "shadow" | "enforce";
  lenses: ResolvedLens[];
  structure: Structure;
  placements: Placements;
  v2Ready: boolean;
}

export async function resolveHomeAccess(userId: number, yearId: number | null): Promise<HomeAccessContext> {
  const mode = misAccessMode();
  const v2Ready = await engineReady();
  const [profileRows, structure, placements] = await Promise.all([
    db
      .select({ first_name: UserProfile.first_name, last_name: UserProfile.last_name, user_type: UserProfile.user_type })
      .from(UserProfile)
      .where(eq(UserProfile.user_id, userId))
      .limit(1),
    loadStructure(v2Ready),
    loadPlacements(userId, yearId),
  ]);
  const persona = profileRows[0]?.user_type ?? null;

  const legacy = mode === "enforce" && v2Ready
    ? null
    : await buildLegacySnapshot({ userId, yearId, persona, structure, placements });
  const v2 = v2Ready && mode !== "off" ? await getSnapshot(userId, "mis") : null;

  const snapshot = legacy ?? v2!;
  const lenses = buildLenses(snapshot, structure, placements.pairs);

  if (mode === "shadow" && v2 && legacy) {
    const v2Keys = new Set(buildLenses(v2, structure, placements.pairs).map((l) => l.key));
    const legacyKeys = new Set(lenses.map((l) => l.key));
    for (const key of new Set([...v2Keys, ...legacyKeys])) {
      if (v2Keys.has(key) === legacyKeys.has(key)) continue;
      // Fire and forget: a review log must never slow Home down or fail it.
      void recordShadowDiff({
        userId,
        capability: `home.lens:${key}`,
        route: "/home/overview",
        legacyAllowed: legacyKeys.has(key),
        v2: { allowed: v2Keys.has(key), depth: null, via: [] },
      });
    }
  }

  return {
    userId,
    persona,
    firstName: profileRows[0]?.first_name ?? null,
    lastName: profileRows[0]?.last_name ?? null,
    snapshot,
    source: legacy ? "legacy" : "v2",
    mode,
    lenses,
    structure,
    placements,
    v2Ready,
  };
}

export const lensesOfType = (ctx: HomeAccessContext, ...types: LensType[]) =>
  ctx.lenses.filter((l) => types.includes(l.type));

/** Distinct values helper. */
export const uniq = <T,>(xs: T[]) => [...new Set(xs)];
