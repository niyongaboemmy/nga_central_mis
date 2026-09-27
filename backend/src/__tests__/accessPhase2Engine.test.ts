import { describe, it, expect, beforeAll, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import {
  AccessGrant,
  AccessPermission,
  AccessRole,
  AccessRolePermission,
  AccessShadowDiff,
  Department,
  DepartmentSubject,
  UserAccessVersion,
} from "../db/accessSchema";
import { Role, System } from "../db/schema";
import {
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createSubject,
  createTeacherSubjectAssignment,
  createUser,
  signToken,
} from "../test/fixtures";
import { ensureAccessRegistry, syncManifest } from "../services/access/registry";
import { compileSnapshot } from "../services/access/compile";
import { clearSnapshotCache, getSnapshot } from "../services/access/snapshotCache";
import { checkGrant } from "../services/access/delegation";
import { holdersOf } from "../services/access/admin";
import { authorizeIn } from "../services/access/policy";
import { authenticate } from "../middleware/auth";
import { decide, scopeFor } from "../vendor/nga-access";

/**
 * Access control v2 -- Phase 2 (plan §3, §7): snapshot compiler, depth,
 * delegation, grant lifecycle, role edits, holders, manifests, shadow mode.
 */

const presetRole = async (key: string) => {
  const [r] = await db.select().from(AccessRole).where(eq(AccessRole.preset_key, key)).limit(1);
  return r.role_id;
};

async function grant(
  userId: number,
  roleId: number,
  scopeType: string,
  scopeId: number | null = null,
  extra: Partial<typeof AccessGrant.$inferInsert> = {},
) {
  const [res] = (await db.insert(AccessGrant).values({
    user_id: userId,
    role_id: roleId,
    scope_type: scopeType as any,
    scope_id: scopeId,
    source: "MANUAL",
    status: "ACTIVE",
    ...extra,
  })) as any;
  await db
    .update(UserAccessVersion)
    .set({ access_version: sql`${UserAccessVersion.access_version} + 1` })
    .where(eq(UserAccessVersion.user_id, userId));
  return res.insertId as number;
}

const version = async (userId: number) =>
  (await db.select({ v: UserAccessVersion.access_version }).from(UserAccessVersion).where(eq(UserAccessVersion.user_id, userId)))[0].v;

let yearId: number;
let primary: { programId: number; gradeId: number; classGroupId: number };
let primaryB: { classGroupId: number };
let igcse: { programId: number; gradeId: number; classGroupId: number };
let maths: number;
let physics: number;
let deptId: number;
let platformOwner: number;
let head: number;
let dos: number;
let teacher: number;
let schoolAdmin: number;

beforeAll(async () => {
  await ensureAccessRegistry();
  yearId = (await createAcademicPeriod()).academicYearId;
  primary = await createProgramGradeClassGroupDetailed();
  primaryB = await createProgramGradeClassGroupDetailed({ programId: primary.programId, gradeId: primary.gradeId });
  igcse = await createProgramGradeClassGroupDetailed();
  maths = await createSubject();
  physics = await createSubject();
  await createTeacherSubjectAssignment({ userId: await createUser(), subjectId: physics, classGroupId: igcse.classGroupId, academicYearId: yearId });

  const [dres] = (await db.insert(Department).values({ code: `SCI${Date.now() % 100000}`, name: "Sciences" })) as any;
  deptId = dres.insertId;
  await db.insert(DepartmentSubject).values({ department_id: deptId, subject_id: physics });

  const [sa] = await db.select().from(Role).where(eq(Role.name, "SUPER_ADMIN")).limit(1);
  const saRole = sa ? sa.role_id : await presetRole("platform_owner");
  platformOwner = await createUser({ userType: "ADMIN" });
  await grant(platformOwner, saRole, "PLATFORM");

  head = await createUser();
  await grant(head, await presetRole("head_teacher"), "SCHOOL");

  dos = await createUser();
  await grant(dos, await presetRole("director_of_studies"), "PROGRAM", primary.programId);
  // The same person also teaches maths in an IGCSE class -- the non-pooling case.
  await grant(dos, await presetRole("subject_teacher"), "SUBJECT_CLASS", maths, { scope_id2: igcse.classGroupId });

  teacher = await createUser();
  await grant(teacher, await presetRole("class_teacher"), "CLASS_GROUP", primary.classGroupId);

  schoolAdmin = await createUser({ userType: "ADMIN" });
  await grant(schoolAdmin, await presetRole("school_administrator"), "SCHOOL");
});

afterEach(() => {
  delete process.env.ACCESS_V2_MIS_MODE;
});

describe("snapshot compiler", () => {
  it("expands a programme grant and never pools it with other grants", async () => {
    const s = await compileSnapshot(dos, "mis", { yearId });
    expect(decide(s, "VIEW_RESULTS", { programId: primary.programId }).allowed).toBe(true);
    expect(decide(s, "VIEW_RESULTS", { classGroupId: primaryB.classGroupId }).depth).toBe("detail");
    expect(decide(s, "VALIDATE_SCHEME_OF_WORK", { classGroupId: primary.classGroupId }).allowed).toBe(true);
    // DOS powers stop at the programme: the IGCSE class is only covered for
    // the subject-teacher capabilities of maths.
    expect(decide(s, "VALIDATE_SCHEME_OF_WORK", { classGroupId: igcse.classGroupId, subjectId: maths }).allowed).toBe(false);
    expect(decide(s, "ENTER_MARKS", { classGroupId: igcse.classGroupId, subjectId: maths }).allowed).toBe(true);
    expect(decide(s, "ENTER_MARKS", { classGroupId: igcse.classGroupId, subjectId: physics }).allowed).toBe(false);
  });

  it("drops school-only capabilities on narrower nodes", async () => {
    // Give the DOS role a school-only capability; it must not appear for a PROGRAM grant.
    const roleId = await presetRole("director_of_studies");
    const [p] = await db.select().from(AccessPermission).where(eq(AccessPermission.name, "MANAGE_SSO_CLIENTS"));
    await db.insert(AccessRolePermission).values({ role_id: roleId, perm_id: p.perm_id });
    try {
      const s = await compileSnapshot(dos, "mis", { yearId });
      expect(s.caps.MANAGE_SSO_CLIENTS).toBeUndefined();
    } finally {
      await db.delete(AccessRolePermission).where(and(eq(AccessRolePermission.role_id, roleId), eq(AccessRolePermission.perm_id, p.perm_id)));
    }
  });

  it("gives the school administrator no marks/discipline by default, and summaries with the insights add-on", async () => {
    let s = await compileSnapshot(schoolAdmin, "mis", { yearId });
    expect(s.caps.VIEW_RESULTS).toBeUndefined();
    expect(s.caps.VIEW_ATTENDANCE).toBeUndefined();

    await grant(schoolAdmin, await presetRole("academic_insights_viewer"), "SCHOOL");
    s = await compileSnapshot(schoolAdmin, "mis", { yearId });
    expect(decide(s, "VIEW_RESULTS", { programId: primary.programId })).toMatchObject({ allowed: true, depth: "summary" });
    expect(decide(s, "VIEW_RESULTS", { classGroupId: primary.classGroupId }, "detail").allowed).toBe(false);
    expect(scopeFor(s, "VIEW_RESULTS", "detail")).toBeNull();
  });

  it("expands a department to its subjects wherever they are taught", async () => {
    const hod = await createUser();
    await grant(hod, await presetRole("head_of_department"), "DEPARTMENT", deptId);
    const s = await compileSnapshot(hod, "mis", { yearId });
    expect(decide(s, "VIEW_RESULTS", { departmentId: deptId }).allowed).toBe(true);
    expect(decide(s, "VIEW_RESULTS", { classGroupId: igcse.classGroupId, subjectId: physics }).allowed).toBe(true);
    expect(decide(s, "VIEW_RESULTS", { classGroupId: igcse.classGroupId, subjectId: maths }).allowed).toBe(false);
    expect(decide(s, "VIEW_RESULTS", { classGroupId: igcse.classGroupId }).allowed).toBe(false);
  });

  it("ignores ended, suspended, expired, future and other-year grants", async () => {
    const u = await createUser();
    const r = await presetRole("head_teacher");
    await grant(u, r, "SCHOOL", null, { status: "ENDED" });
    await grant(u, r, "SCHOOL", null, { status: "SUSPENDED" });
    await grant(u, r, "SCHOOL", null, { valid_until: "2020-01-01" });
    await grant(u, r, "SCHOOL", null, { valid_from: "2999-01-01" });
    await grant(u, r, "SCHOOL", null, { academic_year_id: yearId + 100000 });
    const s = await compileSnapshot(u, "mis", { yearId });
    expect(Object.keys(s.caps)).toEqual([]);
  });

  it("filters a snapshot to one app, and serves a fresh one after any access change", async () => {
    await syncManifest({
      app: "tsnap",
      name: "Snapshot test",
      capabilities: { THING_VIEW: { label: "View", domain: "ACADEMICS", kind: "READ", depths: ["summary", "detail"] } },
    });
    const roleId = await presetRole("class_teacher");
    const [p] = await db.select().from(AccessPermission).where(eq(AccessPermission.name, "tsnap:THING_VIEW"));
    await db.insert(AccessRolePermission).values({ role_id: roleId, perm_id: p.perm_id, depth: "summary" });

    clearSnapshotCache();
    const before = await getSnapshot(teacher, "tsnap");
    expect(Object.keys(before.caps)).toEqual(["THING_VIEW"]); // app-local key, other apps excluded
    expect(before.caps.THING_VIEW[0]).toMatchObject({ depth: "summary", scope: { class_groups: [primary.classGroupId] } });

    await db.delete(AccessRolePermission).where(and(eq(AccessRolePermission.role_id, roleId), eq(AccessRolePermission.perm_id, p.perm_id)));

    // A new grant bumps access_version; the cache must not serve the old snapshot.
    await grant(teacher, await presetRole("head_teacher"), "SCHOOL");
    const after = await getSnapshot(teacher, "mis");
    expect(after.v).toBeGreaterThan(before.v);
    expect(decide(after, "VIEW_RESULTS", {}).allowed).toBe(true);
    await db.update(AccessGrant).set({ status: "ENDED" }).where(and(eq(AccessGrant.user_id, teacher), eq(AccessGrant.scope_type, "SCHOOL")));
    await db.update(UserAccessVersion).set({ access_version: sql`${UserAccessVersion.access_version} + 1` }).where(eq(UserAccessVersion.user_id, teacher));
  });
});

describe("HTTP", () => {
  it("GET /access/me returns the caller's snapshot; /auth/verify carries access_version", async () => {
    const me = await request(app).get("/access/me?app=mis").set("Authorization", `Bearer ${signToken(dos)}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.id).toBe(dos);
    expect(me.body.data.home).toBe(`insights:PROGRAM:${primary.programId}`);

    const verify = await request(app).get("/auth/verify").set("Authorization", `Bearer ${signToken(dos)}`);
    expect(verify.status).toBe(200);
    expect(verify.body.data.access_version).toBe(await version(dos));
  });

  it("guards Studio endpoints by capability", async () => {
    const noStudio = await request(app).get("/access/roles").set("Authorization", `Bearer ${signToken(teacher)}`);
    expect(noStudio.status).toBe(403);
    const ok = await request(app).get("/access/roles").set("Authorization", `Bearer ${signToken(head)}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.find((r: any) => r.preset_key === "head_teacher")).toBeDefined();
  });

  it("previewing another user's access is audited and needs ACCESS_PREVIEW_AS", async () => {
    const denied = await request(app).get(`/access/users/${teacher}`).set("Authorization", `Bearer ${signToken(head)}`);
    expect(denied.status).toBe(403);
    const ok = await request(app).get(`/access/users/${teacher}`).set("Authorization", `Bearer ${signToken(platformOwner)}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.id).toBe(teacher);
  });
});

describe("delegation", () => {
  it("lets the head appoint a DOS, and the new DOS gets access", async () => {
    const newDos = await createUser();
    const res = await request(app)
      .post("/access/grants")
      .set("Authorization", `Bearer ${signToken(head)}`)
      .send({ user_id: newDos, role_id: await presetRole("director_of_studies"), scope_type: "PROGRAM", scope_id: primary.programId, title: "DOS — Primary" });
    expect(res.status).toBe(201);
    const s = await getSnapshot(newDos, "mis");
    expect(decide(s, "VALIDATE_SCHEME_OF_WORK", { programId: primary.programId }).allowed).toBe(true);
  });

  it("follows the intended appointment chains", async () => {
    const chains: Array<[number, string, string, number | null]> = [
      [head, "deputy_head_academics", "SCHOOL", null],
      [head, "director_of_studies", "PROGRAM", primary.programId],
      [head, "deputy_head_discipline", "SCHOOL", null],
      [head, "discipline_lead", "PROGRAM", primary.programId],
      [head, "head_of_department", "DEPARTMENT", deptId],
      [head, "grade_coordinator", "GRADE", primary.gradeId],
      [head, "academic_insights_viewer", "SCHOOL", null],
      [head, "counsellor", "SCHOOL", null],
      [head, "communications_officer", "SCHOOL", null],
      [platformOwner, "bursar", "SCHOOL", null],
      [platformOwner, "registrar", "SCHOOL", null],
      [platformOwner, "it_support", "SCHOOL", null],
    ];
    for (const [actor, preset, scopeType, scopeId] of chains) {
      const r = await checkGrant(actor, { userId: teacher, roleId: await presetRole(preset), scopeType: scopeType as any, scopeId });
      expect(r.errors, `${preset}`).toEqual([]);
    }
  });

  it("refuses what the rule forbids", async () => {
    const target = await createUser();
    const cases: Array<[number, string, string, number | null, RegExp]> = [
      [teacher, "director_of_studies", "PROGRAM", primary.programId, /cannot assign positions/],
      [dos, "director_of_studies", "PROGRAM", igcse.programId, /cannot assign positions/],
      [dos, "head_of_department", "DEPARTMENT", deptId, /cannot assign positions/],
      [dos, "head_teacher", "SCHOOL", null, /cannot assign positions|do not hold/],
      [head, "it_support", "SCHOOL", null, /platform owner/],
      [head, "bursar", "SCHOOL", null, /do not hold MANAGE_FEES/],
      [head, "head_of_department", "PROGRAM", primary.programId, /can only be granted at: DEPARTMENT/],
      [head, "mentor", "MENTEES", null, /auto-assignment rules/],
    ];
    for (const [actor, preset, scopeType, scopeId, why] of cases) {
      const r = await checkGrant(actor, { userId: target, roleId: await presetRole(preset), scopeType: scopeType as any, scopeId });
      expect(r.ok, `${preset}@${scopeType}`).toBe(false);
      expect(r.errors.join(" | "), `${preset}@${scopeType}`).toMatch(why);
    }
    const self = await checkGrant(head, { userId: head, roleId: await presetRole("counsellor"), scopeType: "SCHOOL" });
    expect(self.errors.join(" ")).toMatch(/yourself/);
  });

  it("enforces max holders", async () => {
    const r1 = await createUser();
    const roleId = await presetRole("deputy_head_discipline"); // max_holders = 1
    await grant(r1, roleId, "SCHOOL");
    const r = await checkGrant(head, { userId: await createUser(), roleId, scopeType: "SCHOOL" });
    expect(r.errors.join(" ")).toMatch(/maximum of 1/);
    await db.update(AccessGrant).set({ status: "ENDED" }).where(eq(AccessGrant.user_id, r1));
  });

  it("requires justification and an end date for restricted access", async () => {
    await syncManifest({
      app: "tres",
      name: "Restricted test",
      capabilities: {
        CASES_VIEW: { label: "Cases", domain: "WELFARE", kind: "READ", depths: ["summary", "sensitive"], restricted: ["sensitive"] },
      },
    });
    const [p] = await db.select().from(AccessPermission).where(eq(AccessPermission.name, "tres:CASES_VIEW"));
    const roleId = await presetRole("counsellor");
    await db.insert(AccessRolePermission).values({ role_id: roleId, perm_id: p.perm_id, depth: "sensitive" });
    try {
      const target = await createUser();
      const bare = await checkGrant(platformOwner, { userId: target, roleId, scopeType: "SCHOOL" });
      expect(bare.restricted).toBe(true);
      expect(bare.errors.join(" ")).toMatch(/justification/);
      expect(bare.errors.join(" ")).toMatch(/end date/);
      const future = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
      const ok = await checkGrant(platformOwner, {
        userId: target, roleId, scopeType: "SCHOOL", validUntil: future, justification: "Safeguarding caseload for term 1",
      });
      expect(ok.errors).toEqual([]);
      const tooLong = await checkGrant(platformOwner, {
        userId: target, roleId, scopeType: "SCHOOL", validUntil: "2999-01-01", justification: "Safeguarding caseload for term 1",
      });
      expect(tooLong.errors.join(" ")).toMatch(/at most/);
    } finally {
      await db.delete(AccessRolePermission).where(and(eq(AccessRolePermission.role_id, roleId), eq(AccessRolePermission.perm_id, p.perm_id)));
    }
  });
});

describe("grant lifecycle", () => {
  it("ends, suspends and resumes manual grants, bumping the holder's version", async () => {
    const u = await createUser();
    const create = await request(app)
      .post("/access/grants")
      .set("Authorization", `Bearer ${signToken(head)}`)
      .send({ user_id: u, role_id: await presetRole("counsellor"), scope_type: "SCHOOL" });
    expect(create.status).toBe(201);
    const id = create.body.data.grant_id;
    const v1 = await version(u);

    const noReason = await request(app).post(`/access/grants/${id}/end`).set("Authorization", `Bearer ${signToken(head)}`).send({});
    expect(noReason.status).toBe(400);
    const sus = await request(app).post(`/access/grants/${id}/suspend`).set("Authorization", `Bearer ${signToken(head)}`).send({ reason: "on leave" });
    expect(sus.status).toBe(200);
    expect(await version(u)).toBeGreaterThan(v1);
    expect(decide(await getSnapshot(u, "mis"), "VIEW_LEADERSHIP_STRUCTURE").allowed).toBe(false);
    await request(app).post(`/access/grants/${id}/resume`).set("Authorization", `Bearer ${signToken(head)}`).send({});
    const end = await request(app).post(`/access/grants/${id}/end`).set("Authorization", `Bearer ${signToken(head)}`).send({ reason: "left the school" });
    expect(end.status).toBe(200);
  });

  it("will not end a rule-owned grant or the last school-wide access manager", async () => {
    const u = await createUser();
    const [res] = (await db.insert(AccessGrant).values({
      user_id: u, role_id: await presetRole("class_teacher"), scope_type: "CLASS_GROUP", scope_id: primary.classGroupId,
      source: "RULE", rule_id: 999999, source_ref: `test:${u}`, status: "ACTIVE",
    })) as any;
    const ruleEnd = await request(app).post(`/access/grants/${res.insertId}/end`).set("Authorization", `Bearer ${signToken(head)}`).send({ reason: "test" });
    expect(ruleEnd.status).toBe(409);

    // Temporarily make `head` the only school-wide manager.
    const managerRoles = (
      await db
        .select({ role_id: AccessRolePermission.role_id })
        .from(AccessRolePermission)
        .innerJoin(AccessPermission, eq(AccessPermission.perm_id, AccessRolePermission.perm_id))
        .where(eq(AccessPermission.name, "ACCESS_GRANTS_MANAGE"))
    ).map((r) => r.role_id);
    const others = await db
      .select({ grant_id: AccessGrant.grant_id })
      .from(AccessGrant)
      .where(and(eq(AccessGrant.status, "ACTIVE"), sql`${AccessGrant.scope_type} IN ('SCHOOL','PLATFORM')`, sql`${AccessGrant.role_id} IN (${sql.join(managerRoles.map((r) => sql`${r}`), sql`, `)})`));
    const [headGrant] = await db.select().from(AccessGrant).where(and(eq(AccessGrant.user_id, head), eq(AccessGrant.status, "ACTIVE")));
    const toPark = others.map((o) => o.grant_id).filter((id) => id !== headGrant.grant_id);
    for (const id of toPark) await db.update(AccessGrant).set({ status: "SUSPENDED" }).where(eq(AccessGrant.grant_id, id));
    try {
      const { wouldLockOut } = await import("../services/access/delegation");
      expect(await wouldLockOut(headGrant.grant_id)).toBe(true);
    } finally {
      for (const id of toPark) await db.update(AccessGrant).set({ status: "ACTIVE" }).where(eq(AccessGrant.grant_id, id));
    }
  });
});

describe("role editing", () => {
  it("lets an editor add only what they hold school-wide, and bumps every holder", async () => {
    const create = await request(app)
      .post("/access/roles")
      .set("Authorization", `Bearer ${signToken(head)}`)
      .send({ name: `Exams Officer ${Date.now()}`, allowed_scope_types: ["SCHOOL"], capabilities: [{ name: "VIEW_RESULTS", depth: "summary" }] });
    expect(create.status).toBe(201);
    const roleId = create.body.data.role_id;

    const holder = await createUser();
    await grant(holder, roleId, "SCHOOL");
    const v1 = await version(holder);

    const escalate = await request(app)
      .patch(`/access/roles/${roleId}`)
      .set("Authorization", `Bearer ${signToken(head)}`)
      .send({ capabilities: [{ name: "VIEW_RESULTS", depth: "summary" }, { name: "DATABASE_MANAGEMENT" }] });
    expect(escalate.status).toBe(400);
    expect(JSON.stringify(escalate.body)).toMatch(/DATABASE_MANAGEMENT/);

    const deepen = await request(app)
      .patch(`/access/roles/${roleId}`)
      .set("Authorization", `Bearer ${signToken(head)}`)
      .send({ capabilities: [{ name: "VIEW_RESULTS", depth: "detail" }] });
    expect(deepen.status).toBe(200);
    expect(await version(holder)).toBeGreaterThan(v1);
    expect(decide(await getSnapshot(holder, "mis"), "VIEW_RESULTS", {}, "detail").allowed).toBe(true);

    const badDepth = await request(app)
      .patch(`/access/roles/${roleId}`)
      .set("Authorization", `Bearer ${signToken(head)}`)
      .send({ capabilities: [{ name: "VIEW_RESULTS", depth: "sensitive" }] });
    expect(badDepth.status).toBe(400);
  });

  it("refuses to rename roles the code relies on", async () => {
    const [sa] = await db.select().from(Role).where(eq(Role.name, "SUPER_ADMIN")).limit(1);
    const res = await request(app)
      .patch(`/access/roles/${sa.role_id}`)
      .set("Authorization", `Bearer ${signToken(platformOwner)}`)
      .send({ name: "Owner" });
    expect(res.status).toBe(400);
  });
});

describe("holders and manifests", () => {
  it("finds who can act on a target (approval pools)", async () => {
    const viewer = await createUser();
    await grant(viewer, await presetRole("academic_insights_viewer"), "SCHOOL");

    const ids = (await holdersOf("VIEW_RESULTS", { classGroupId: primary.classGroupId })).map((h) => h.user_id);
    expect(ids).toEqual(expect.arrayContaining([head, dos, viewer]));

    // A summary-only holder is not in a pool that needs individual records.
    const detail = (await holdersOf("VIEW_RESULTS", { classGroupId: primary.classGroupId }, "detail")).map((h) => h.user_id);
    expect(detail).toEqual(expect.arrayContaining([head, dos]));
    expect(detail).not.toContain(viewer);

    // Nor is anyone whose node does not cover the target.
    const igcseIds = (await holdersOf("VALIDATE_SCHEME_OF_WORK", { classGroupId: igcse.classGroupId })).map((h) => h.user_id);
    expect(igcseIds).toContain(head);
    expect(igcseIds).not.toContain(dos);
  });

  it("lets an app publish only its own manifest with its client credentials", async () => {
    const secret = crypto.randomBytes(8).toString("hex");
    const clientId = "taskmentor_app";
    const [existing] = await db.select().from(System).where(eq(System.client_id, clientId)).limit(1);
    if (!existing) {
      await db.insert(System).values({ name: `TaskMentor ${Date.now()}`, client_id: clientId, client_secret: secret, icon_url: "x", home_url: "x", status: "ACTIVE" });
    } else {
      await db.update(System).set({ client_secret: secret, status: "ACTIVE" }).where(eq(System.client_id, clientId));
    }
    const basic = `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
    const manifest = {
      app: "tm",
      name: "Task Mentor",
      capabilities: { QUIZZES_EDIT: { label: "Edit quizzes", domain: "ASSESSMENT", kind: "WRITE" } },
    };
    const ok = await request(app).put("/access/manifests/tm").set("Authorization", basic).send(manifest);
    expect(ok.status).toBe(200);
    const [row] = await db.select().from(AccessPermission).where(eq(AccessPermission.name, "tm:QUIZZES_EDIT"));
    expect(row).toMatchObject({ app: "tm", cap_key: "QUIZZES_EDIT" });

    const other = await request(app).put("/access/manifests/da").set("Authorization", basic).send({ ...manifest, app: "da" });
    expect(other.status).toBe(403);
    const invalid = await request(app).put("/access/manifests/tm").set("Authorization", basic).send({ app: "tm", name: "", capabilities: {} });
    expect(invalid.status).toBe(400);
    const anonymous = await request(app).put("/access/manifests/tm").send(manifest);
    expect(anonymous.status).toBe(401);
  });
});

describe("MIS modes", () => {
  // A dedicated role/holder, so the probe does not depend on what the shared
  // Class Teacher preset contains in this database.
  let probeUser: number;
  beforeAll(async () => {
    const [p] = await db.select().from(AccessPermission).where(eq(AccessPermission.name, "VIEW_RESULTS"));
    const { insertRoleWithNextId } = await import("../services/access/registry");
    const roleId = await insertRoleWithNextId({ name: `Probe ${Date.now()}`, allowed_scope_types: "CLASS_GROUP" });
    await db.insert(AccessRolePermission).values({ role_id: roleId, perm_id: p.perm_id, depth: "detail" });
    probeUser = await createUser();
    await grant(probeUser, roleId, "CLASS_GROUP", primary.classGroupId);
  });

  const miniApp = () => {
    const a = express();
    a.get(
      "/probe/:classGroupId",
      authenticate,
      authorizeIn("VIEW_RESULTS", (req) => ({ classGroupId: Number(req.params.classGroupId) }), { legacy: [] }),
      (_req, res) => res.json({ ok: true }),
    );
    return a;
  };

  it("shadow: legacy decides, disagreements are recorded", async () => {
    process.env.ACCESS_V2_MIS_MODE = "shadow";
    // Route was open to everyone (legacy []), v2 would refuse the teacher on another class.
    const res = await request(miniApp()).get(`/probe/${igcse.classGroupId}`).set("Authorization", `Bearer ${signToken(probeUser)}`);
    expect(res.status).toBe(200);
    const [diff] = await db
      .select()
      .from(AccessShadowDiff)
      .where(and(eq(AccessShadowDiff.user_id, probeUser), eq(AccessShadowDiff.capability, "VIEW_RESULTS")));
    expect(diff).toMatchObject({ legacy_allowed: 1, v2_allowed: 0 });
  });

  it("enforce: v2 decides", async () => {
    process.env.ACCESS_V2_MIS_MODE = "enforce";
    const refused = await request(miniApp()).get(`/probe/${igcse.classGroupId}`).set("Authorization", `Bearer ${signToken(probeUser)}`);
    expect(refused.status).toBe(403);
    const allowed = await request(miniApp()).get(`/probe/${primary.classGroupId}`).set("Authorization", `Bearer ${signToken(probeUser)}`);
    expect(allowed.status).toBe(200);
  });

  it("off (the test default): legacy only, nothing recorded", async () => {
    const before = (await db.select({ n: sql<number>`COUNT(*)` }).from(AccessShadowDiff))[0].n;
    const res = await request(miniApp()).get(`/probe/${igcse.classGroupId}`).set("Authorization", `Bearer ${signToken(dos)}`);
    expect(res.status).toBe(200);
    const after = (await db.select({ n: sql<number>`COUNT(*)` }).from(AccessShadowDiff))[0].n;
    expect(Number(after)).toBe(Number(before));
  });
});
