import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import request from "supertest";
import app from "../app";
import path from "path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  AccessGrant,
  AccessPermission,
  AccessPresetLink,
  AccessRole,
  AccessRolePermission,
  AccessRule,
  UserAccessVersion,
} from "../db/accessSchema";
import {
  MentorAssignment,
  Parenting,
  Permission,
  Role,
  RolePermission,
  UserGrade,
  UserRole,
} from "../db/schema";
import {
  assignRole,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createProgramLead,
  createSubject,
  createTeacherSubjectAssignment,
  createUser,
  createUserGradeAssignment,
  createRoleWithPermissions,
  signToken,
} from "../test/fixtures";
import { MIS_MANIFEST } from "../access/manifest";
import { PRESETS } from "../access/presets";
import {
  ensureAccessRegistry,
  ensurePresets,
  isV2OnlyCapability,
  ManifestValidationError,
  syncManifest,
  V2_ONLY_CAPABILITIES,
} from "../services/access/registry";
import { syncRuleGrants, applyPlacementChange } from "../services/access/ruleEngine";
import { backfillLegacyGrants } from "../services/access/backfill";
import { getEffectivePermissions } from "../utils/auth";
import { Manifest } from "../vendor/nga-access";

/**
 * Access control v2 -- Phase 1 (plan §4-§6): registry, presets, rules,
 * backfill -- and the guarantees that none of it changes anyone's current
 * MIS access.
 */

async function roleIdByPreset(key: string): Promise<number> {
  const [r] = await db
    .select({ role_id: AccessRole.role_id })
    .from(AccessRole)
    .where(eq(AccessRole.preset_key, key))
    .limit(1);
  return r.role_id;
}

async function grantsOf(userId: number) {
  return db.select().from(AccessGrant).where(eq(AccessGrant.user_id, userId));
}

async function accessVersion(userId: number) {
  const [u] = await db
    .select({ v: UserAccessVersion.access_version })
    .from(UserAccessVersion)
    .where(eq(UserAccessVersion.user_id, userId));
  return u.v;
}

async function permNamesOfRole(roleId: number) {
  const rows = await db
    .select({ name: Permission.name })
    .from(RolePermission)
    .innerJoin(Permission, eq(Permission.perm_id, RolePermission.perm_id))
    .where(eq(RolePermission.role_id, roleId));
  return rows.map((r) => r.name).sort();
}

/** An existing, HELD legacy role (like TEACHER in production). */
async function ensureHeldLegacyRole(name: string, perms: string[]) {
  const [existing] = await db.select().from(Role).where(eq(Role.name, name)).limit(1);
  let roleId = existing?.role_id;
  if (!roleId) {
    const next = (await db.execute(
      sql.raw("SELECT COALESCE(MAX(role_id), 0) + 1 AS id FROM `Role`"),
    )) as any;
    roleId = next[0][0].id as number;
    await db.insert(Role).values({ role_id: roleId, name, status: "ACTIVE" });
  }
  for (const p of perms) {
    let [perm] = await db.select().from(Permission).where(eq(Permission.name, p)).limit(1);
    if (!perm) {
      await db.insert(Permission).values({ name: p, status: "ACTIVE" });
      [perm] = await db.select().from(Permission).where(eq(Permission.name, p)).limit(1);
    }
    await db.execute(
      sql`INSERT IGNORE INTO RolePermission (role_id, perm_id) VALUES (${roleId}, ${perm.perm_id})`,
    );
  }
  const holder = await createUser();
  await db.execute(sql`INSERT IGNORE INTO UserRole (user_id, role_id) VALUES (${holder}, ${roleId})`);
  return { roleId: roleId as number, holder };
}

describe("Phase 1 -- capability registry", () => {
  it("registers the MIS manifest idempotently", async () => {
    await syncManifest(MIS_MANIFEST);
    const again = await syncManifest(MIS_MANIFEST);
    expect(again.unchanged).toBe(true);

    const rows = await db
      .select()
      .from(AccessPermission)
      .where(inArray(AccessPermission.name, ["VIEW_RESULTS", "ACCESS_GRANTS_MANAGE"]));
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName.VIEW_RESULTS).toMatchObject({ app: "mis", kind: "READ", depths: "summary,detail", domain: "ASSESSMENT" });
    expect(byName.ACCESS_GRANTS_MANAGE).toMatchObject({ app: "mis", kind: "WRITE", cap_key: "ACCESS_GRANTS_MANAGE" });
  });

  it("namespaces satellite capabilities, deprecates removed ones, revives re-added ones", async () => {
    const app = `t${Date.now().toString(36)}`;
    const v1: Manifest = {
      app,
      name: "Test app",
      version: "1",
      capabilities: {
        THING_VIEW: { label: "View", domain: "ACADEMICS", kind: "READ", depths: ["summary", "detail"] },
        THING_EDIT: { label: "Edit", domain: "ACADEMICS", kind: "WRITE" },
      },
    };
    const r1 = await syncManifest(v1);
    expect(r1.created.sort()).toEqual([`${app}:THING_EDIT`, `${app}:THING_VIEW`]);

    const v2: Manifest = { ...v1, version: "2", capabilities: { THING_VIEW: v1.capabilities.THING_VIEW } };
    const r2 = await syncManifest(v2);
    expect(r2.deprecated).toEqual([`${app}:THING_EDIT`]);
    const [dep] = await db.select().from(AccessPermission).where(eq(AccessPermission.name, `${app}:THING_EDIT`));
    expect(dep.deprecated_at).not.toBeNull();

    const r3 = await syncManifest({ ...v1, version: "3" });
    expect(r3.revived).toEqual([`${app}:THING_EDIT`]);
  });

  it("rejects an invalid manifest without touching the registry", async () => {
    const bad: any = { app: "BAD APP", name: "", capabilities: {} };
    await expect(syncManifest(bad)).rejects.toBeInstanceOf(ManifestValidationError);
  });

  it("registers every permission a MIS route checks", () => {
    const routesDir = path.resolve(__dirname, "../routes");
    const checked = new Set<string>();
    for (const file of fs.readdirSync(routesDir)) {
      const src = fs.readFileSync(path.join(routesDir, file), "utf8");
      for (const m of src.matchAll(/authorize\(\s*\[?([^)]*?)\]?\s*\)/g)) {
        for (const q of m[1].matchAll(/["']([A-Z][A-Z0-9_]+)["']/g)) checked.add(q[1]);
        for (const q of m[1].matchAll(/Permissions\.([A-Z][A-Z0-9_]+)/g)) checked.add(q[1]);
      }
    }
    expect(checked.size).toBeGreaterThan(40);
    const missing = [...checked].filter((p) => !(p in MIS_MANIFEST.capabilities));
    expect(missing).toEqual([]);
  });
});

describe("Phase 1 -- v2-only names are invisible to the spoke apps' role heuristics", () => {
  // Copied from nga-discipline-attendance/server/src/routes/sso.ts and
  // nga-communication-module/packages/shared/src/roles.ts. A v2 capability
  // name matching one of these would silently change someone's role there.
  const KEYWORDS = [
    "MANAGE_USER", "MANAGE_ROLE", "MANAGE_STAFF", "MANAGE_SYSTEM", "MANAGE_SCHOOL", "ADMIN",
    "MARK_ATTENDANCE", "TAKE_ATTENDANCE", "MANAGE_ATTENDANCE", "MANAGE_DISCIPLINE", "LOG_INCIDENT",
    "MANAGE_LESSON", "CREATE_LESSON", "MANAGE_RESULT", "ENTER_RESULT", "GRADE", "MANAGE_CLASS",
    "MANAGE_STUDENT", "TEACHER", "STAFF", "PARENT", "GUARDIAN", "STUDENT", "VIEW_RESULTS",
    "VIEW_ATTENDANCE", "VIEW_STUDENT_CALENDAR", "VIEW_LESSON",
  ];
  it("no v2-only capability contains a heuristic keyword", () => {
    const clashes = [...V2_ONLY_CAPABILITIES].filter((name) =>
      KEYWORDS.some((k) => name.toUpperCase().includes(k)),
    );
    expect(clashes).toEqual([]);
  });

  it("satellite capabilities never reach the legacy permission list", async () => {
    await syncManifest({
      app: "tmguard",
      name: "Guard",
      capabilities: { DASHBOARD_VIEW_ADMIN: { label: "Admin dashboard", domain: "REPORTING", kind: "READ", depths: ["summary"] } },
    });
    const [perm] = await db.select().from(Permission).where(eq(Permission.name, "tmguard:DASHBOARD_VIEW_ADMIN"));
    const userId = await createUser();
    const next = (await db.execute(sql.raw("SELECT COALESCE(MAX(role_id), 0) + 1 AS id FROM `Role`"))) as any;
    const roleId = next[0][0].id as number;
    await db.insert(Role).values({ role_id: roleId, name: `guard_${roleId}`, status: "ACTIVE" });
    await db.insert(RolePermission).values({ role_id: roleId, perm_id: perm.perm_id });
    await assignRole(userId, roleId);
    expect(await getEffectivePermissions(userId)).toEqual([]);
    expect(isV2OnlyCapability("tmguard:DASHBOARD_VIEW_ADMIN")).toBe(true);
  });
});

describe("Phase 1 -- presets never change current access", () => {
  let held: { roleId: number; holder: number };
  let before: string[];
  // These tests edit shared preset roles; put them back exactly as found so
  // the suite can re-run on a dirty test database in any file order.
  let savedLinks: Array<{ role_id: number; perm_id: number; depth: any }> = [];
  let savedPresetLinks: Array<{ preset_key: string; perm_name: string }> = [];

  afterAll(async () => {
    if (!held) return;
    await db.delete(AccessRolePermission).where(eq(AccessRolePermission.role_id, held.roleId));
    for (const l of savedLinks) await db.insert(AccessRolePermission).values(l);
    await db.delete(AccessPresetLink).where(eq(AccessPresetLink.preset_key, "class_teacher"));
    for (const l of savedPresetLinks) await db.insert(AccessPresetLink).values(l);
  });

  beforeAll(async () => {
    await syncManifest(MIS_MANIFEST);
    // CLASS_TEACHER exists and is held; its preset lists VIEW_ATTENDANCE and
    // VIEW_RESULTS, which a held role must NOT receive.
    held = await ensureHeldLegacyRole("CLASS_TEACHER", ["VIEW_MY_ASSIGNED_SUBJECTS", "VIEW_MY_STUDENTS"]);
    savedLinks = await db
      .select({ role_id: AccessRolePermission.role_id, perm_id: AccessRolePermission.perm_id, depth: AccessRolePermission.depth })
      .from(AccessRolePermission)
      .where(eq(AccessRolePermission.role_id, held.roleId));
    savedPresetLinks = await db
      .select({ preset_key: AccessPresetLink.preset_key, perm_name: AccessPresetLink.perm_name })
      .from(AccessPresetLink)
      .where(eq(AccessPresetLink.preset_key, "class_teacher"));
    // Order-independent: another file may already have seeded this role while
    // it had no holders (and so gave it the full bundle). Start from a role
    // without the preset's legacy links and with no preset history.
    const legacyLinks = await db
      .select({ perm_id: Permission.perm_id })
      .from(Permission)
      .where(inArray(Permission.name, ["VIEW_ATTENDANCE", "VIEW_RESULTS"]));
    if (legacyLinks.length) {
      await db
        .delete(RolePermission)
        .where(and(eq(RolePermission.role_id, held.roleId), inArray(RolePermission.perm_id, legacyLinks.map((l) => l.perm_id))));
    }
    await db.delete(AccessPresetLink).where(eq(AccessPresetLink.preset_key, "class_teacher"));
    before = await getEffectivePermissions(held.holder);
    await ensurePresets();
  });

  it("a held role keeps exactly its legacy MIS permissions", async () => {
    expect((await getEffectivePermissions(held.holder)).sort()).toEqual(before.sort());
    const names = await permNamesOfRole(held.roleId);
    expect(names).not.toContain("VIEW_ATTENDANCE");
    expect(names).not.toContain("VIEW_RESULTS");
    expect(names).toContain("VIEW_LEADERSHIP_STRUCTURE"); // v2-only addition
  });

  it("creates every new preset role, marked as a preset, with its scope types", async () => {
    for (const p of PRESETS.filter((x) => !x.existingName)) {
      const [r] = await db.select().from(AccessRole).where(eq(AccessRole.preset_key, p.key));
      expect(r, p.key).toBeDefined();
      expect(r.is_preset).toBe(1);
      expect(r.allowed_scope_types).toBe(p.scopes.join(","));
    }
  });

  it("gives an unheld preset role its full bundle, with depths", async () => {
    const roleId = await roleIdByPreset("academic_insights_viewer");
    const rows = await db
      .select({ name: AccessPermission.name, depth: AccessRolePermission.depth })
      .from(AccessRolePermission)
      .innerJoin(AccessPermission, eq(AccessPermission.perm_id, AccessRolePermission.perm_id))
      .where(eq(AccessRolePermission.role_id, roleId));
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.depth]));
    expect(byName.VIEW_RESULTS).toBe("summary");
    expect(byName.VIEW_ATTENDANCE).toBe("summary");
    expect(byName.ENTER_MARKS).toBeUndefined();
  });

  it("never re-adds a link leadership removed", async () => {
    const roleId = await roleIdByPreset("academic_insights_viewer");
    const [perm] = await db.select().from(Permission).where(eq(Permission.name, "VIEW_RESULTS"));
    const [link] = await db
      .select()
      .from(AccessRolePermission)
      .where(and(eq(AccessRolePermission.role_id, roleId), eq(AccessRolePermission.perm_id, perm.perm_id)));
    await db
      .delete(RolePermission)
      .where(and(eq(RolePermission.role_id, roleId), eq(RolePermission.perm_id, perm.perm_id)));
    try {
      await ensurePresets();
      expect(await permNamesOfRole(roleId)).not.toContain("VIEW_RESULTS");
    } finally {
      if (link) await db.insert(AccessRolePermission).values(link);
    }
  });

  it("refreshes a role's holders when seeding adds capabilities to it", async () => {
    // Remove one v2-only link from the held role and forget it was applied,
    // so the next seeding re-adds it -- as when a new app manifest arrives.
    const [perm] = await db.select().from(Permission).where(eq(Permission.name, "VIEW_LEADERSHIP_STRUCTURE"));
    await db.delete(RolePermission).where(and(eq(RolePermission.role_id, held.roleId), eq(RolePermission.perm_id, perm.perm_id)));
    await db.delete(AccessPresetLink).where(and(eq(AccessPresetLink.preset_key, "class_teacher"), eq(AccessPresetLink.perm_name, "VIEW_LEADERSHIP_STRUCTURE")));
    const [before] = await db.select({ v: UserAccessVersion.access_version }).from(UserAccessVersion).where(eq(UserAccessVersion.user_id, held.holder));
    await ensurePresets();
    const [after] = await db.select({ v: UserAccessVersion.access_version }).from(UserAccessVersion).where(eq(UserAccessVersion.user_id, held.holder));
    expect(after.v).toBeGreaterThan(before.v);
    expect(await permNamesOfRole(held.roleId)).toContain("VIEW_LEADERSHIP_STRUCTURE");
  });

  it("full bootstrap is idempotent", async () => {
    await ensureAccessRegistry();
    const count1 = (await db.select({ n: sql<number>`COUNT(*)` }).from(RolePermission))[0].n;
    const rules1 = (await db.select({ n: sql<number>`COUNT(*)` }).from(AccessRule))[0].n;
    await ensureAccessRegistry();
    const count2 = (await db.select({ n: sql<number>`COUNT(*)` }).from(RolePermission))[0].n;
    const rules2 = (await db.select({ n: sql<number>`COUNT(*)` }).from(AccessRule))[0].n;
    expect(Number(count2)).toBe(Number(count1));
    expect(Number(rules2)).toBe(Number(rules1));
    expect(Number(rules1)).toBeGreaterThanOrEqual(10);
  });
});

describe("Phase 1 -- auto-assignment rules", () => {
  let yearId: number;
  let chain: { programId: number; gradeId: number; classGroupId: number };

  beforeAll(async () => {
    await ensureAccessRegistry();
    yearId = (await createAcademicPeriod()).academicYearId;
    chain = await createProgramGradeClassGroupDetailed();
  });

  it("a class-teacher assignment becomes a CLASS_GROUP grant, and removing it ends the grant", async () => {
    const teacher = await createUser();
    const v0 = await accessVersion(teacher);
    await createUserGradeAssignment({ userId: teacher, gradeId: chain.gradeId, classGroupId: chain.classGroupId, academicYearId: yearId });
    await applyPlacementChange([teacher]);

    const roleId = await roleIdByPreset("class_teacher");
    let grants = (await grantsOf(teacher)).filter((g) => g.role_id === roleId);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      scope_type: "CLASS_GROUP",
      scope_id: chain.classGroupId,
      academic_year_id: yearId,
      source: "RULE",
      status: "ACTIVE",
    });
    expect(await accessVersion(teacher)).toBeGreaterThan(v0);

    await db.delete(UserGrade).where(eq(UserGrade.user_id, teacher));
    await applyPlacementChange([teacher]);
    grants = (await grantsOf(teacher)).filter((g) => g.role_id === roleId);
    expect(grants[0]).toMatchObject({ status: "ENDED", end_reason: "placement removed" });

    // Re-assigning revives the same grant row rather than duplicating it.
    await createUserGradeAssignment({ userId: teacher, gradeId: chain.gradeId, classGroupId: chain.classGroupId, academicYearId: yearId });
    await applyPlacementChange([teacher]);
    grants = (await grantsOf(teacher)).filter((g) => g.role_id === roleId);
    expect(grants).toHaveLength(1);
    expect(grants[0].status).toBe("ACTIVE");
  });

  it("maps subject assignments, programme leads, mentors, parents and personas", async () => {
    const teacher = await createUser();
    const subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacher, subjectId, classGroupId: chain.classGroupId, academicYearId: yearId });

    const lead = await createUser();
    await createProgramLead({ userId: lead, programId: chain.programId, academicYearId: yearId });

    const student = await createUser({ userType: "STUDENT" });
    const mentor = await createUser();
    await db.insert(MentorAssignment).values({ mentor_id: mentor, student_id: student, academic_year_id: yearId, assigned_by: mentor, status: "ACTIVE" });

    const parent = await createUser({ userType: "PARENT" as any });
    await db.insert(Parenting).values({ student_id: student, parent_id: parent });

    await applyPlacementChange([teacher, lead, student, mentor, parent]);

    const [tg, lg, sg, mg, pg] = await Promise.all([
      grantsOf(teacher), grantsOf(lead), grantsOf(student), grantsOf(mentor), grantsOf(parent),
    ]);
    expect(tg.find((g) => g.role_id === 0)).toBeUndefined();
    expect(tg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope_type: "SUBJECT_CLASS", scope_id: subjectId, scope_id2: chain.classGroupId }),
        expect.objectContaining({ scope_type: "SELF" }), // TEACHER persona
      ]),
    );
    expect(lg).toEqual(expect.arrayContaining([expect.objectContaining({ scope_type: "PROGRAM", scope_id: chain.programId })]));
    expect(sg).toEqual([expect.objectContaining({ scope_type: "SELF", role_id: await roleIdByPreset("student") })]);
    expect(mg).toEqual(expect.arrayContaining([expect.objectContaining({ scope_type: "MENTEES", role_id: await roleIdByPreset("mentor") })]));
    expect(pg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope_type: "CHILDREN", role_id: await roleIdByPreset("parent") }),
        expect.objectContaining({ scope_type: "SELF", role_id: await roleIdByPreset("parent") }),
      ]),
    );
  });

  it("pausing a rule ends its grants; editing its role repoints them", async () => {
    const teacher = await createUser();
    const subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacher, subjectId, classGroupId: chain.classGroupId, academicYearId: yearId });
    const [rule] = await db.select().from(AccessRule).where(eq(AccessRule.rule_key, "subject_teacher"));
    await syncRuleGrants({ userIds: [teacher] });

    const otherRole = await roleIdByPreset("grade_coordinator");
    await db.update(AccessRule).set({ role_id: otherRole }).where(eq(AccessRule.rule_id, rule.rule_id));
    let r = await syncRuleGrants({ userIds: [teacher] });
    expect(r.repointed).toBe(1);
    expect((await grantsOf(teacher)).find((g) => g.rule_id === rule.rule_id)?.role_id).toBe(otherRole);

    await db.update(AccessRule).set({ status: "PAUSED" }).where(eq(AccessRule.rule_id, rule.rule_id));
    r = await syncRuleGrants({ userIds: [teacher] });
    expect(r.ended).toBe(1);
    expect((await grantsOf(teacher)).find((g) => g.rule_id === rule.rule_id)).toMatchObject({ status: "ENDED", end_reason: "rule paused" });

    // Restore the shared rule for the rest of the suite.
    await db
      .update(AccessRule)
      .set({ status: "ACTIVE", role_id: rule.role_id })
      .where(eq(AccessRule.rule_id, rule.rule_id));
    await syncRuleGrants({ userIds: [teacher] });
    expect((await grantsOf(teacher)).find((g) => g.rule_id === rule.rule_id)).toMatchObject({ status: "ACTIVE", role_id: rule.role_id });
  });
});

describe("Phase 1 -- legacy backfill", () => {
  it("dry run reports and writes nothing; apply creates a PLATFORM grant for super admins and flags unplaced class teachers", async () => {
    await ensureAccessRegistry();
    const [sa] = await db.select().from(Role).where(eq(Role.name, "SUPER_ADMIN")).limit(1);
    let saRoleId = sa?.role_id;
    if (!saRoleId) {
      const next = (await db.execute(sql.raw("SELECT COALESCE(MAX(role_id), 0) + 1 AS id FROM `Role`"))) as any;
      saRoleId = next[0][0].id as number;
      await db.insert(Role).values({ role_id: saRoleId, name: "SUPER_ADMIN", status: "ACTIVE" });
      await ensureAccessRegistry();
    }
    const admin = await createUser({ userType: "ADMIN" });
    await assignRole(admin, saRoleId!);

    const [ct] = await db.select().from(Role).where(eq(Role.name, "CLASS_TEACHER")).limit(1);
    const unplaced = await createUser();
    await assignRole(unplaced, ct.role_id);

    const dry = await backfillLegacyGrants();
    expect(dry.applied).toBe(false);
    expect(dry.migrationGrants).toEqual(expect.arrayContaining([{ userId: admin, role: "SUPER_ADMIN", scope: "PLATFORM" }]));
    expect(dry.needsAttention.map((n) => n.userId)).toContain(unplaced);
    expect(await grantsOf(admin)).toEqual([]);

    const applied = await backfillLegacyGrants({ apply: true });
    expect(applied.ruleSync).not.toBeNull();
    const g = (await grantsOf(admin)).filter((x) => x.source === "MIGRATION");
    expect(g).toEqual([expect.objectContaining({ scope_type: "PLATFORM", role_id: saRoleId, status: "ACTIVE" })]);
    // The unplaced class teacher is never widened to the school.
    expect((await grantsOf(unplaced)).filter((x) => x.role_id === ct.role_id)).toEqual([]);

    // Idempotent.
    const again = await backfillLegacyGrants({ apply: true });
    expect(again.migrationGrants.find((m) => m.userId === admin)).toBeUndefined();
  });
});

describe("Phase 1 -- the legacy Roles & Permissions screen leaves v2 alone", () => {
  it("hides v2 capabilities and keeps them (and read depths) across a legacy save", async () => {
    await ensureAccessRegistry();
    const adminRole = await createRoleWithPermissions("P1_PERM_ADMIN", ["MANAGE_ROLES", "MANAGE_PERMISSIONS"]);
    const admin = await createUser({ userType: "ADMIN" });
    await assignRole(admin, adminRole);
    const token = signToken(admin);

    // A role holding two legacy permissions (one READ with a summary depth)
    // and one v2-only capability.
    const roleId = await createRoleWithPermissions("P1_EDITED", ["VIEW_RESULTS", "ENTER_MARKS", "ACCESS_STUDIO_VIEW"]);
    const [vr] = await db.select().from(Permission).where(eq(Permission.name, "VIEW_RESULTS"));
    const [em] = await db.select().from(Permission).where(eq(Permission.name, "ENTER_MARKS"));
    const [studio] = await db.select().from(Permission).where(eq(Permission.name, "ACCESS_STUDIO_VIEW"));
    await db
      .update(AccessRolePermission)
      .set({ depth: "summary" })
      .where(and(eq(AccessRolePermission.role_id, roleId), eq(AccessRolePermission.perm_id, vr.perm_id)));

    const list = await request(app).get(`/permissions/roles/${roleId}/permissions`).set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((p: any) => p.name).sort()).toEqual(["ENTER_MARKS", "VIEW_RESULTS"]);

    const catalog = await request(app).get("/permissions/permissions").set("Authorization", `Bearer ${token}`);
    expect(catalog.status).toBe(200);
    const names = catalog.body.data.map((p: any) => p.name);
    expect(names).toContain("VIEW_RESULTS");
    expect(names).not.toContain("ACCESS_STUDIO_VIEW");
    expect(names.some((n: string) => n.includes(":"))).toBe(false);

    // Save: drop ENTER_MARKS, keep VIEW_RESULTS, try to smuggle a v2 id in.
    const save = await request(app)
      .post(`/permissions/roles/${roleId}/permissions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ permissionIds: [vr.perm_id, vr.perm_id, studio.perm_id] });
    expect(save.status).toBe(200);

    const rows = await db
      .select({ perm_id: AccessRolePermission.perm_id, depth: AccessRolePermission.depth })
      .from(AccessRolePermission)
      .where(eq(AccessRolePermission.role_id, roleId));
    const byId = new Map(rows.map((r) => [r.perm_id, r.depth]));
    expect(byId.has(em.perm_id)).toBe(false);
    expect(byId.get(vr.perm_id)).toBe("summary"); // depth survived the save
    expect(byId.has(studio.perm_id)).toBe(true); // v2 capability untouched
  });
});

// UserRole is referenced through fixtures; keep the import for readers.
void UserRole;
