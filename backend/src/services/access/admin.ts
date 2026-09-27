import { and, asc, eq, inArray, isNull, gte, lte, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  AccessGrant,
  AccessPermission,
  AccessRole,
  AccessRolePermission,
  AccessRule,
  Department,
  DepartmentSubject,
} from "../../db/accessSchema";
import {
  AcademicYear,
  ClassGroup,
  Grade,
  Program,
  Subject,
  User,
  UserProfile,
  UserRole,
} from "../../db/schema";
import { Depth, DEPTHS, entryCovers, depthSatisfies, ScopeType, SCOPE_TYPES, Target } from "../../vendor/nga-access";
import {
  ConflictError,
  NotFoundError,
  AuthorizationError,
  ValidationError,
} from "../../errors/CustomError";
import { effectiveDepth, expandScope } from "./compile";
import { coversNode, isPlatformActor, nodeTarget } from "./delegation";
import { getSnapshot } from "./snapshotCache";
import { bumpAccessVersion, syncRuleGrants } from "./ruleEngine";
import { insertRoleWithNextId, isRestrictedGrant, writeAudit } from "./registry";
import { getCurrentAcademicYearId } from "../../utils/academicYear";

// ---------------------------------------------------------------------------
// Holders of a role (for access_version bumps after role edits)
// ---------------------------------------------------------------------------

export async function roleHolderIds(roleId: number): Promise<number[]> {
  const [grants, legacy] = await Promise.all([
    db
      .selectDistinct({ user_id: AccessGrant.user_id })
      .from(AccessGrant)
      .where(and(eq(AccessGrant.role_id, roleId), inArray(AccessGrant.status, ["ACTIVE", "SUSPENDED"]))),
    db.selectDistinct({ user_id: UserRole.user_id }).from(UserRole).where(eq(UserRole.role_id, roleId)),
  ]);
  return Array.from(new Set([...grants, ...legacy].map((r) => r.user_id)));
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export interface RoleCapabilityInput {
  name: string;
  depth?: Depth | null;
}

export async function listRoles() {
  const roles = await db.select().from(AccessRole).orderBy(asc(AccessRole.name));
  const links = await db
    .select({
      role_id: AccessRolePermission.role_id,
      name: AccessPermission.name,
      app: AccessPermission.app,
      kind: AccessPermission.kind,
      depths: AccessPermission.depths,
      depth: AccessRolePermission.depth,
      deprecated_at: AccessPermission.deprecated_at,
    })
    .from(AccessRolePermission)
    .innerJoin(AccessPermission, eq(AccessPermission.perm_id, AccessRolePermission.perm_id));
  const counts = await db
    .select({ role_id: AccessGrant.role_id, n: sql<number>`COUNT(DISTINCT ${AccessGrant.user_id})` })
    .from(AccessGrant)
    .where(eq(AccessGrant.status, "ACTIVE"))
    .groupBy(AccessGrant.role_id);
  const holders = new Map(counts.map((c) => [c.role_id, Number(c.n)]));

  return roles.map((r) => ({
    ...r,
    allowed_scope_types: (r.allowed_scope_types ?? "").split(",").filter(Boolean),
    holders: holders.get(r.role_id) ?? 0,
    capabilities: links
      .filter((l) => l.role_id === r.role_id)
      .map((l) => ({
        name: l.name,
        app: l.app,
        kind: l.kind,
        depth: effectiveDepth(l),
        deprecated: l.deprecated_at !== null,
      })),
  }));
}

async function actorForRoleEdit(actorId: number) {
  const actor = await getSnapshot(actorId, "*");
  const platform = isPlatformActor(actor);
  return { actor, platform };
}

async function validateCapabilities(
  actorId: number,
  caps: RoleCapabilityInput[],
): Promise<Array<{ perm_id: number; name: string; depth: Depth | null }>> {
  const names = Array.from(new Set(caps.map((c) => c.name)));
  if (names.length !== caps.length) throw new ValidationError("A capability is listed twice");
  const rows = names.length
    ? await db.select().from(AccessPermission).where(inArray(AccessPermission.name, names))
    : [];
  const byName = new Map(rows.map((r) => [r.name, r]));
  const { actor, platform } = await actorForRoleEdit(actorId);
  const errors: string[] = [];
  const out: Array<{ perm_id: number; name: string; depth: Depth | null }> = [];

  for (const c of caps) {
    const p = byName.get(c.name);
    if (!p || p.status !== "ACTIVE") {
      errors.push(`Unknown capability ${c.name}`);
      continue;
    }
    let depth: Depth | null = null;
    if (p.kind === "READ") {
      const supported = (p.depths ?? "detail").split(",") as Depth[];
      depth = (c.depth ?? (supported.includes("detail") ? "detail" : supported[0])) as Depth;
      if (!DEPTHS.includes(depth) || !supported.includes(depth)) {
        errors.push(`${c.name} supports ${supported.join("/")}, not "${c.depth}"`);
        continue;
      }
    } else if (c.depth) {
      errors.push(`${c.name} is a write capability and has no depth`);
      continue;
    }
    // A role editor changes what every holder can do, so (like delegation)
    // they may only put in a role what they hold school-wide themselves.
    if (!platform && !coversNode(actor, c.name, { scopeType: "SCHOOL" }, depth)) {
      errors.push(`You do not hold ${c.name}${depth ? ` (${depth})` : ""} school-wide yourself`);
    }
    if (!platform && (await isRestrictedGrant(c.name, depth)) &&
        !coversNode(actor, "ACCESS_GRANTS_RESTRICTED", { scopeType: "SCHOOL" })) {
      errors.push(`${c.name} (${depth}) is restricted; you cannot add it to a role`);
    }
    out.push({ perm_id: p.perm_id, name: p.name, depth });
  }
  if (errors.length) throw new ValidationError("Invalid capabilities", errors);
  return out;
}

function validateScopeTypes(types: unknown): string | null {
  if (types === undefined) return null;
  if (!Array.isArray(types) || types.length === 0) {
    throw new ValidationError("allowed_scope_types must be a non-empty list");
  }
  for (const t of types) {
    if (!SCOPE_TYPES.includes(t as ScopeType)) throw new ValidationError(`Unknown scope type ${t}`);
  }
  return Array.from(new Set(types as string[])).join(",");
}

export async function createRole(
  actorId: number,
  body: {
    name?: string;
    description?: string;
    category?: string;
    allowed_scope_types?: string[];
    max_holders?: number | null;
    capabilities?: RoleCapabilityInput[];
  },
) {
  const name = String(body.name ?? "").trim();
  if (name.length < 3 || name.length > 100) throw new ValidationError("Role name must be 3-100 characters");
  const [clash] = await db.select().from(AccessRole).where(eq(AccessRole.name, name)).limit(1);
  if (clash) throw new ConflictError("A role with this name already exists");
  const scopes = validateScopeTypes(body.allowed_scope_types ?? ["SCHOOL"]);
  const caps = await validateCapabilities(actorId, body.capabilities ?? []);

  const roleId = await insertRoleWithNextId({
    name,
    description: body.description?.slice(0, 255) ?? null,
    category: body.category ?? null,
    allowed_scope_types: scopes,
    max_holders: body.max_holders ?? null,
  });
  for (const c of caps) {
    await db.insert(AccessRolePermission).values({ role_id: roleId, perm_id: c.perm_id, depth: c.depth });
  }
  await writeAudit({
    actorId,
    action: "role.create",
    target: { roleId, name },
    after: { capabilities: caps.map((c) => ({ name: c.name, depth: c.depth })), scopes },
  });
  return roleId;
}

export async function updateRole(
  actorId: number,
  roleId: number,
  body: {
    name?: string;
    description?: string | null;
    category?: string | null;
    allowed_scope_types?: string[];
    max_holders?: number | null;
    capabilities?: RoleCapabilityInput[];
  },
) {
  const [role] = await db.select().from(AccessRole).where(eq(AccessRole.role_id, roleId)).limit(1);
  if (!role) throw new NotFoundError("Role not found");
  const { platform } = await actorForRoleEdit(actorId);
  if (role.platform_only && !platform) {
    throw new AuthorizationError("Only the platform owner can edit this role");
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 3 || name.length > 100) throw new ValidationError("Role name must be 3-100 characters");
    if (role.preset_key && role.name !== name && ["SUPER_ADMIN", "TEACHER", "CLASS_TEACHER", "STUDENT", "PARENT", "STAFF"].includes(role.name)) {
      // Code still keys off these names literally.
      throw new ValidationError(`${role.name} cannot be renamed`);
    }
    patch.name = name;
  }
  if (body.description !== undefined) patch.description = body.description?.slice(0, 255) ?? null;
  if (body.category !== undefined) patch.category = body.category;
  if (body.allowed_scope_types !== undefined) patch.allowed_scope_types = validateScopeTypes(body.allowed_scope_types);
  if (body.max_holders !== undefined) patch.max_holders = body.max_holders;

  const before = (await listRoles()).find((r) => r.role_id === roleId);
  let capsChanged = false;
  if (body.capabilities !== undefined) {
    const wanted = await validateCapabilities(actorId, body.capabilities);
    const current = await db
      .select({ perm_id: AccessRolePermission.perm_id, depth: AccessRolePermission.depth })
      .from(AccessRolePermission)
      .where(eq(AccessRolePermission.role_id, roleId));
    const currentById = new Map(current.map((c) => [c.perm_id, c.depth]));
    const wantedById = new Map(wanted.map((w) => [w.perm_id, w.depth]));
    for (const [permId] of currentById) {
      if (!wantedById.has(permId)) {
        await db
          .delete(AccessRolePermission)
          .where(and(eq(AccessRolePermission.role_id, roleId), eq(AccessRolePermission.perm_id, permId)));
        capsChanged = true;
      }
    }
    for (const [permId, depth] of wantedById) {
      if (!currentById.has(permId)) {
        await db.insert(AccessRolePermission).values({ role_id: roleId, perm_id: permId, depth });
        capsChanged = true;
      } else if ((currentById.get(permId) ?? null) !== depth) {
        await db
          .update(AccessRolePermission)
          .set({ depth })
          .where(and(eq(AccessRolePermission.role_id, roleId), eq(AccessRolePermission.perm_id, permId)));
        capsChanged = true;
      }
    }
  }

  if (Object.keys(patch).length || capsChanged) {
    await db
      .update(AccessRole)
      .set({ ...patch, version: sql`${AccessRole.version} + 1`, updated_at: new Date() })
      .where(eq(AccessRole.role_id, roleId));
    await bumpAccessVersion(await roleHolderIds(roleId));
    const after = (await listRoles()).find((r) => r.role_id === roleId);
    await writeAudit({ actorId, action: "role.update", target: { roleId }, before, after });
  }
}

export async function setRoleStatus(actorId: number, roleId: number, status: "ACTIVE" | "DISABLED") {
  const [role] = await db.select().from(AccessRole).where(eq(AccessRole.role_id, roleId)).limit(1);
  if (!role) throw new NotFoundError("Role not found");
  if (status === "DISABLED" && ["SUPER_ADMIN"].includes(role.name)) {
    throw new ValidationError(`${role.name} cannot be disabled`);
  }
  const { platform } = await actorForRoleEdit(actorId);
  if (role.platform_only && !platform) throw new AuthorizationError("Only the platform owner can change this role");
  await db
    .update(AccessRole)
    .set({ status, version: sql`${AccessRole.version} + 1`, updated_at: new Date() })
    .where(eq(AccessRole.role_id, roleId));
  await bumpAccessVersion(await roleHolderIds(roleId));
  await writeAudit({ actorId, action: `role.${status === "ACTIVE" ? "enable" : "disable"}`, target: { roleId, name: role.name } });
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const TRIGGERS = ["PERSONA", "CLASS_TEACHER", "SUBJECT_TEACHER", "PROGRAM_LEAD", "MENTOR", "PARENT"] as const;
const USER_TYPES = ["STUDENT", "TEACHER", "ADMIN", "PARENT", "STAFF"];

async function assertRoleGrantableByRule(actorId: number, roleId: number) {
  const [role] = await db.select().from(AccessRole).where(eq(AccessRole.role_id, roleId)).limit(1);
  if (!role || role.status !== "ACTIVE") throw new ValidationError("Role not found or disabled");
  if (role.platform_only) throw new ValidationError("Platform-only roles cannot be granted by rules");
  const { actor, platform } = await actorForRoleEdit(actorId);
  if (platform) return;
  const caps = await db
    .select({ name: AccessPermission.name, kind: AccessPermission.kind, depths: AccessPermission.depths, depth: AccessRolePermission.depth })
    .from(AccessRolePermission)
    .innerJoin(AccessPermission, eq(AccessPermission.perm_id, AccessRolePermission.perm_id))
    .where(eq(AccessRolePermission.role_id, roleId));
  const missing = caps.filter((c) => !coversNode(actor, c.name, { scopeType: "SCHOOL" }, effectiveDepth(c)));
  if (missing.length) {
    throw new ValidationError(
      "A rule grants this role to many people; you must hold all of it school-wide yourself",
      missing.map((m) => m.name),
    );
  }
}

function validateRuleFilter(trigger: string, filter: any): string | null {
  if (trigger !== "PERSONA") return null;
  const userType = String(filter?.user_type ?? "");
  if (!USER_TYPES.includes(userType)) {
    throw new ValidationError(`PERSONA rules need trigger_filter.user_type in ${USER_TYPES.join(", ")}`);
  }
  return JSON.stringify({ user_type: userType });
}

export async function createRule(actorId: number, body: any) {
  const name = String(body?.name ?? "").trim();
  if (name.length < 3) throw new ValidationError("Rule name is required");
  if (!TRIGGERS.includes(body?.trigger_type)) throw new ValidationError(`trigger_type must be one of ${TRIGGERS.join(", ")}`);
  const roleId = Number(body?.role_id);
  await assertRoleGrantableByRule(actorId, roleId);
  const filter = validateRuleFilter(body.trigger_type, body.trigger_filter);
  const [res] = (await db.insert(AccessRule).values({
    name,
    trigger_type: body.trigger_type,
    trigger_filter: filter,
    role_id: roleId,
    status: body.status === "PAUSED" ? "PAUSED" : "ACTIVE",
    created_by: actorId,
  })) as any;
  const ruleId = res.insertId as number;
  await writeAudit({ actorId, action: "rule.create", target: { ruleId }, after: { name, trigger: body.trigger_type, roleId, filter } });
  const sync = await syncRuleGrants({ ruleIds: [ruleId], actorId });
  return { ruleId, sync };
}

export async function updateRule(actorId: number, ruleId: number, body: any) {
  const [rule] = await db.select().from(AccessRule).where(eq(AccessRule.rule_id, ruleId)).limit(1);
  if (!rule) throw new NotFoundError("Rule not found");
  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.role_id !== undefined) {
    await assertRoleGrantableByRule(actorId, Number(body.role_id));
    patch.role_id = Number(body.role_id);
  }
  if (body.trigger_filter !== undefined) patch.trigger_filter = validateRuleFilter(rule.trigger_type, body.trigger_filter);
  if (body.status !== undefined) {
    if (!["ACTIVE", "PAUSED"].includes(body.status)) throw new ValidationError("status must be ACTIVE or PAUSED");
    patch.status = body.status;
  }
  await db.update(AccessRule).set(patch).where(eq(AccessRule.rule_id, ruleId));
  await writeAudit({ actorId, action: "rule.update", target: { ruleId }, before: rule, after: patch });
  return syncRuleGrants({ ruleIds: [ruleId], actorId });
}

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

export async function listGrants(filters: {
  userId?: number;
  roleId?: number;
  scopeType?: string;
  scopeId?: number;
  status?: string;
}) {
  const rows = await db
    .select({
      grant: AccessGrant,
      role_name: AccessRole.name,
      username: User.username,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      year_name: AcademicYear.name,
    })
    .from(AccessGrant)
    .innerJoin(AccessRole, eq(AccessRole.role_id, AccessGrant.role_id))
    .innerJoin(User, eq(User.user_id, AccessGrant.user_id))
    .leftJoin(UserProfile, eq(UserProfile.user_id, AccessGrant.user_id))
    .leftJoin(AcademicYear, eq(AcademicYear.academic_year_id, AccessGrant.academic_year_id))
    .where(
      and(
        filters.userId ? eq(AccessGrant.user_id, filters.userId) : undefined,
        filters.roleId ? eq(AccessGrant.role_id, filters.roleId) : undefined,
        filters.scopeType ? eq(AccessGrant.scope_type, filters.scopeType as any) : undefined,
        filters.scopeId ? eq(AccessGrant.scope_id, filters.scopeId) : undefined,
        filters.status ? eq(AccessGrant.status, filters.status as any) : inArray(AccessGrant.status, ["ACTIVE", "SUSPENDED"]),
      ),
    )
    .orderBy(asc(AccessGrant.grant_id))
    .limit(2000);
  return rows.map((r) => ({
    ...r.grant,
    role_name: r.role_name,
    academic_year_name: r.year_name ?? null,
    username: r.username,
    full_name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.username,
  }));
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

async function bumpDepartmentHolders(departmentId: number) {
  const hods = await db
    .selectDistinct({ user_id: AccessGrant.user_id })
    .from(AccessGrant)
    .where(and(eq(AccessGrant.scope_type, "DEPARTMENT"), eq(AccessGrant.scope_id, departmentId)));
  await bumpAccessVersion(hods.map((h) => h.user_id));
}

export async function listDepartments() {
  const depts = await db.select().from(Department).orderBy(asc(Department.name));
  const links = await db
    .select({ department_id: DepartmentSubject.department_id, subject_id: Subject.subject_id, code: Subject.code, name: Subject.name })
    .from(DepartmentSubject)
    .innerJoin(Subject, eq(Subject.subject_id, DepartmentSubject.subject_id));
  return depts.map((d) => ({ ...d, subjects: links.filter((l) => l.department_id === d.department_id) }));
}

export async function saveDepartment(actorId: number, body: any, departmentId?: number) {
  const code = String(body?.code ?? "").trim().toUpperCase();
  const name = String(body?.name ?? "").trim();
  if (!/^[A-Z0-9_-]{2,40}$/.test(code)) throw new ValidationError("code must be 2-40 letters, digits, - or _");
  if (name.length < 2 || name.length > 150) throw new ValidationError("name must be 2-150 characters");
  const status = body?.status === "DISABLED" ? "DISABLED" : "ACTIVE";
  const [clash] = await db.select().from(Department).where(eq(Department.code, code)).limit(1);
  if (clash && clash.department_id !== departmentId) throw new ConflictError("A department with this code already exists");
  if (departmentId) {
    const [d] = await db.select().from(Department).where(eq(Department.department_id, departmentId)).limit(1);
    if (!d) throw new NotFoundError("Department not found");
    await db.update(Department).set({ code, name, status }).where(eq(Department.department_id, departmentId));
    await writeAudit({ actorId, action: "department.update", target: { departmentId }, before: d, after: { code, name, status } });
    await bumpDepartmentHolders(departmentId);
    return departmentId;
  }
  const [res] = (await db.insert(Department).values({ code, name, status })) as any;
  await writeAudit({ actorId, action: "department.create", target: { departmentId: res.insertId }, after: { code, name } });
  return res.insertId as number;
}

export async function setDepartmentSubjects(actorId: number, departmentId: number, subjectIds: unknown) {
  if (!Array.isArray(subjectIds)) throw new ValidationError("subjectIds must be a list");
  const ids = Array.from(new Set(subjectIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)));
  const [d] = await db.select().from(Department).where(eq(Department.department_id, departmentId)).limit(1);
  if (!d) throw new NotFoundError("Department not found");
  if (ids.length) {
    const found = await db.select({ id: Subject.subject_id }).from(Subject).where(inArray(Subject.subject_id, ids));
    if (found.length !== ids.length) throw new ValidationError("Unknown subject id(s)");
    const taken = await db
      .select({ subject_id: DepartmentSubject.subject_id, department_id: DepartmentSubject.department_id })
      .from(DepartmentSubject)
      .where(inArray(DepartmentSubject.subject_id, ids));
    const elsewhere = taken.filter((t) => t.department_id !== departmentId);
    if (elsewhere.length) {
      throw new ConflictError(
        "A subject belongs to one department only",
        elsewhere.map((e) => ({ subject_id: e.subject_id, department_id: e.department_id })),
      );
    }
  }
  const before = await db.select().from(DepartmentSubject).where(eq(DepartmentSubject.department_id, departmentId));
  await db.delete(DepartmentSubject).where(eq(DepartmentSubject.department_id, departmentId));
  for (const id of ids) await db.insert(DepartmentSubject).values({ department_id: departmentId, subject_id: id });
  await writeAudit({
    actorId,
    action: "department.subjects",
    target: { departmentId },
    before: before.map((b) => b.subject_id),
    after: ids,
  });
  await bumpDepartmentHolders(departmentId);
}

// ---------------------------------------------------------------------------
// Holders: who can do `cap` on `target` (approval pools, notifications)
// ---------------------------------------------------------------------------

export async function holdersOf(capName: string, target: Target, minDepth: Depth | null = null) {
  const yearId = await getCurrentAcademicYearId();
  const d = new Date().toISOString().slice(0, 10);
  const links = await db
    .select({
      role_id: AccessRolePermission.role_id,
      kind: AccessPermission.kind,
      depths: AccessPermission.depths,
      depth: AccessRolePermission.depth,
      scopeable: AccessPermission.scopeable,
    })
    .from(AccessRolePermission)
    .innerJoin(AccessPermission, eq(AccessPermission.perm_id, AccessRolePermission.perm_id))
    .where(and(eq(AccessPermission.name, capName), eq(AccessPermission.status, "ACTIVE"), isNull(AccessPermission.deprecated_at)));
  if (links.length === 0) return [];
  const linkByRole = new Map(links.map((l) => [l.role_id, l]));

  const grants = await db
    .select({ grant: AccessGrant })
    .from(AccessGrant)
    .innerJoin(AccessRole, eq(AccessRole.role_id, AccessGrant.role_id))
    .innerJoin(User, eq(User.user_id, AccessGrant.user_id))
    .where(
      and(
        inArray(AccessGrant.role_id, [...linkByRole.keys()]),
        eq(AccessGrant.status, "ACTIVE"),
        eq(AccessRole.status, "ACTIVE"),
        eq(User.status, "ACTIVE"),
        or(isNull(AccessGrant.valid_from), lte(AccessGrant.valid_from, d)),
        or(isNull(AccessGrant.valid_until), gte(AccessGrant.valid_until, d)),
        yearId === null
          ? isNull(AccessGrant.academic_year_id)
          : or(isNull(AccessGrant.academic_year_id), eq(AccessGrant.academic_year_id, yearId)),
      ),
    );

  const out = new Map<number, { user_id: number; depth: Depth | null; via: number[] }>();
  for (const { grant } of grants) {
    const link = linkByRole.get(grant.role_id)!;
    const wide = grant.scope_type === "SCHOOL" || grant.scope_type === "PLATFORM";
    if (!link.scopeable && !wide) continue;
    const depth = effectiveDepth(link);
    if (!depthSatisfies(depth, minDepth)) continue;
    const scope = await expandScope(grant, yearId);
    if (!entryCovers(scope, target)) continue;
    const cur = out.get(grant.user_id);
    if (cur) cur.via.push(grant.grant_id);
    else out.set(grant.user_id, { user_id: grant.user_id, depth, via: [grant.grant_id] });
  }
  return [...out.values()];
}

// ---------------------------------------------------------------------------
// Hierarchy for pickers and the organisation chart
// ---------------------------------------------------------------------------

export async function hierarchyNodes() {
  const [programs, grades, classGroups, departments, subjects] = await Promise.all([
    db.select({ id: Program.program_id, name: Program.name }).from(Program).orderBy(asc(Program.name)),
    db.select({ id: Grade.grade_id, name: Grade.name, program_id: Grade.program_id, level_order: Grade.level_order }).from(Grade).orderBy(asc(Grade.level_order)),
    db.select({ id: ClassGroup.class_group_id, name: ClassGroup.name, grade_id: ClassGroup.grade_id }).from(ClassGroup).orderBy(asc(ClassGroup.name)),
    db.select({ id: Department.department_id, code: Department.code, name: Department.name, status: Department.status }).from(Department).orderBy(asc(Department.name)),
    db.select({ id: Subject.subject_id, code: Subject.code, name: Subject.name }).from(Subject).orderBy(asc(Subject.name)),
  ]);
  return { programs, grades, classGroups, departments, subjects };
}

export { nodeTarget };
