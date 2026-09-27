import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AccessGrant, AccessRole, AccessRule, UserAccessVersion } from "../db/accessSchema";
import { Role } from "../db/schema";
import { createProgramGradeClassGroupDetailed, createUser, signToken } from "../test/fixtures";
import { ensureAccessRegistry } from "../services/access/registry";
import { compileSnapshot } from "../services/access/compile";
import { entryCovers, ScopeEntry, Target } from "../vendor/nga-access";

/**
 * Access control v2 -- adversarial tests: every escalation / leak path we could
 * think of, through the real HTTP API, plus a randomized cross-check of the
 * decision core against an independent reference and a performance bound.
 */

const presetRole = async (key: string) =>
  (await db.select().from(AccessRole).where(eq(AccessRole.preset_key, key)).limit(1))[0].role_id;

async function grant(userId: number, roleId: number, scopeType: string, scopeId: number | null = null, extra: Record<string, unknown> = {}) {
  const [res] = (await db.insert(AccessGrant).values({
    user_id: userId, role_id: roleId, scope_type: scopeType as any, scope_id: scopeId, source: "MANUAL", status: "ACTIVE", ...extra,
  })) as any;
  await db.update(UserAccessVersion).set({ access_version: sql`${UserAccessVersion.access_version} + 1` }).where(eq(UserAccessVersion.user_id, userId));
  return res.insertId as number;
}

const as = (userId: number) => ({ Authorization: `Bearer ${signToken(userId)}` });

let owner: number;
let ownerGrant: number;
let head: number;
let dos: number;
let dosOther: number;
let teacher: number;
let progA: { programId: number; gradeId: number; classGroupId: number };
let progB: { programId: number; gradeId: number; classGroupId: number };

beforeAll(async () => {
  await ensureAccessRegistry();
  progA = await createProgramGradeClassGroupDetailed();
  progB = await createProgramGradeClassGroupDetailed();
  const [sa] = await db.select().from(Role).where(eq(Role.name, "SUPER_ADMIN")).limit(1);
  owner = await createUser({ userType: "ADMIN" });
  ownerGrant = await grant(owner, sa ? sa.role_id : await presetRole("platform_owner"), "PLATFORM");
  head = await createUser();
  await grant(head, await presetRole("head_teacher"), "SCHOOL");
  dos = await createUser();
  await grant(dos, await presetRole("director_of_studies"), "PROGRAM", progA.programId);
  dosOther = await createUser();
  await grant(dosOther, await presetRole("director_of_studies"), "PROGRAM", progB.programId, { justification: "secret note B" });
  teacher = await createUser();
});

describe("escalation attempts", () => {
  it("a school-wide manager cannot end or suspend the platform owner", async () => {
    const end = await request(app).post(`/access/grants/${ownerGrant}/end`).set(as(head)).send({ reason: "coup" });
    expect(end.status).toBe(403);
    const sus = await request(app).post(`/access/grants/${ownerGrant}/suspend`).set(as(head)).send({ reason: "coup" });
    expect(sus.status).toBe(403);
    const [g] = await db.select().from(AccessGrant).where(eq(AccessGrant.grant_id, ownerGrant));
    expect(g.status).toBe("ACTIVE");
  });

  it("nobody below the platform grants at PLATFORM or appoints themselves", async () => {
    const plat = await request(app).post("/access/grants").set(as(head))
      .send({ user_id: teacher, role_id: await presetRole("head_teacher"), scope_type: "PLATFORM" });
    expect(plat.status).toBe(403);
    const self = await request(app).post("/access/grants").set(as(head))
      .send({ user_id: head, role_id: await presetRole("deputy_head_academics"), scope_type: "SCHOOL" });
    expect(self.status).toBe(403);
  });

  it("a programme DOS cannot reach outside their programme or up to the school", async () => {
    const other = await request(app).post("/access/grants").set(as(dos))
      .send({ user_id: teacher, role_id: await presetRole("grade_coordinator"), scope_type: "GRADE", scope_id: progB.gradeId });
    expect(other.status).toBe(403);
    const up = await request(app).post("/access/grants").set(as(dos))
      .send({ user_id: teacher, role_id: await presetRole("director_of_studies"), scope_type: "SCHOOL" });
    expect(up.status).toBe(403);
  });

  it("a DOS cannot edit roles or rules (school-level powers)", async () => {
    const role = await request(app).patch(`/access/roles/${await presetRole("teaching_staff")}`).set(as(dos)).send({ description: "x" });
    expect(role.status).toBe(403);
    const [rule] = await db.select().from(AccessRule).where(eq(AccessRule.rule_key, "class_teacher"));
    const r = await request(app).patch(`/access/rules/${rule.rule_id}`).set(as(dos)).send({ status: "PAUSED" });
    expect(r.status).toBe(403);
  });

  it("rules can never hand out platform-only roles, even for the head", async () => {
    const [rule] = await db.select().from(AccessRule).where(eq(AccessRule.rule_key, "class_teacher"));
    const res = await request(app).patch(`/access/rules/${rule.rule_id}`).set(as(head)).send({ role_id: await presetRole("it_support") });
    expect(res.status).toBe(400);
    const [after] = await db.select().from(AccessRule).where(eq(AccessRule.rule_id, rule.rule_id));
    expect(after.role_id).toBe(rule.role_id);
  });

  it("the head cannot edit platform-only roles or smuggle platform powers into a role", async () => {
    const it = await request(app).patch(`/access/roles/${await presetRole("it_support")}`).set(as(head)).send({ description: "mine now" });
    expect(it.status).toBe(403);
    const smuggle = await request(app).post("/access/roles").set(as(head))
      .send({ name: `Helper ${Date.now()}`, allowed_scope_types: ["SCHOOL"], capabilities: [{ name: "MANAGE_SSO_CLIENTS" }] });
    expect(smuggle.status).toBe(400);
  });

  it("malformed input is refused, not guessed", async () => {
    const bad = [
      { user_id: "x", role_id: 1, scope_type: "SCHOOL" },
      { user_id: teacher, role_id: await presetRole("counsellor"), scope_type: "NOWHERE" },
      { user_id: teacher, role_id: await presetRole("director_of_studies"), scope_type: "PROGRAM" },
      { user_id: teacher, role_id: await presetRole("counsellor"), scope_type: "SCHOOL", valid_until: "tomorrow" },
      { user_id: teacher, role_id: await presetRole("counsellor"), scope_type: "SCHOOL", valid_from: "2027-01-02", valid_until: "2027-01-01" },
    ];
    for (const body of bad) {
      const res = await request(app).post("/access/grants").set(as(head)).send(body);
      expect([400, 403], JSON.stringify(body)).toContain(res.status);
    }
  });
});

describe("information leaks", () => {
  it("a DOS lists only grants in their own programme, without others' justifications", async () => {
    const res = await request(app).get("/access/grants").set(as(dos));
    expect(res.status).toBe(200);
    const nodes = res.body.data.map((g: any) => `${g.scope_type}:${g.scope_id}`);
    expect(nodes).toContain(`PROGRAM:${progA.programId}`);
    expect(nodes).not.toContain(`PROGRAM:${progB.programId}`);
    expect(res.body.data.every((g: any) => g.scope_type !== "SELF")).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("secret note B");

    const headView = await request(app).get("/access/grants").set(as(head));
    expect(headView.body.data.map((g: any) => `${g.scope_type}:${g.scope_id}`)).toContain(`PROGRAM:${progB.programId}`);
  });

  it("explaining someone else's access needs the (audited) preview permission", async () => {
    const dosTry = await request(app).get(`/access/explain?userId=${head}&cap=VIEW_RESULTS`).set(as(dos));
    expect(dosTry.status).toBe(403);
    const own = await request(app).get(`/access/explain?cap=VIEW_RESULTS&programId=${progA.programId}`).set(as(dos));
    expect(own.status).toBe(200);
    expect(own.body.data.allowed).toBe(true);
    const ownerTry = await request(app).get(`/access/explain?userId=${dos}&cap=VIEW_RESULTS`).set(as(owner));
    expect(ownerTry.status).toBe(200);
  });

  it("people without Studio access get nothing from it", async () => {
    for (const path of ["/access/roles", "/access/grants", "/access/catalog", "/access/rules", `/access/users/${head}`, "/access/audit", "/access/shadow-diffs"]) {
      const res = await request(app).get(path).set(as(teacher));
      expect(res.status, path).toBe(403);
    }
    const anon = await request(app).get("/access/me");
    expect(anon.status).toBe(401);
  });

  it("app-to-MIS endpoints refuse user tokens", async () => {
    const holders = await request(app).get("/access/holders?app=mis&cap=VIEW_RESULTS").set(as(owner));
    expect(holders.status).toBe(401);
    const audit = await request(app).post("/access/audit").set(as(owner)).send({ action: "x.y" });
    expect(audit.status).toBe(401);
  });
});

describe("decision core (randomized cross-check)", () => {
  // Independent reference: enumerate the concrete (programme, grade, class,
  // subject) cells a scope covers, then ask whether the target's cell is
  // among them. Written without looking at entryCovers' branching.
  const world = { programs: [1, 2], gradesOf: { 1: [11, 12], 2: [21] } as Record<number, number[]>, classesOf: { 11: [111, 112], 12: [121], 21: [211] } as Record<number, number[]>, subjects: [7, 8, 9] };
  const cells: Array<{ p: number; g: number; c: number; s: number }> = [];
  for (const p of world.programs) for (const g of world.gradesOf[p]) for (const c of world.classesOf[g]) for (const s of world.subjects) cells.push({ p, g, c, s });

  const rand = (n: number) => Math.floor(Math.random() * n);
  const pick = <T,>(xs: T[]) => xs[rand(xs.length)];
  const allClasses = Object.values(world.classesOf).flat();
  const allGrades = Object.values(world.gradesOf).flat();

  function randomScope(): ScopeEntry {
    switch (rand(5)) {
      case 0: { const p = pick(world.programs); const gs = world.gradesOf[p]; return { programs: [p], grades: gs, class_groups: gs.flatMap((g) => world.classesOf[g]), subjects: world.subjects }; }
      case 1: { const g = pick(allGrades); return { grades: [g], class_groups: world.classesOf[g], subjects: world.subjects }; }
      case 2: return { class_groups: [pick(allClasses)] };
      case 3: return { pairs: [[pick(world.subjects), pick(allClasses)]] };
      default: return { departments: [1], subjects: [7], pairs: allClasses.map((c) => [7, c] as [number, number]) };
    }
  }
  const coveredCells = (s: ScopeEntry) =>
    cells.filter(
      (x) =>
        (s.class_groups ?? []).includes(x.c) ||
        (s.pairs ?? []).some(([sub, c]) => sub === x.s && c === x.c),
    );

  it("agrees with the reference on 3000 random (scope, target) pairs", () => {
    for (let i = 0; i < 3000; i++) {
      const scope = randomScope();
      const cov = coveredCells(scope);
      const kind = rand(3);
      const cell = pick(cells);
      let target: Target;
      let expected: boolean;
      if (kind === 0) {
        target = { classGroupId: cell.c, subjectId: cell.s };
        expected = cov.some((x) => x.c === cell.c && x.s === cell.s);
      } else if (kind === 1) {
        // Whole class: every subject of the class must be covered, i.e. a class-level scope.
        target = { classGroupId: cell.c };
        expected = (scope.class_groups ?? []).includes(cell.c);
      } else {
        // A student of the class, any subject: some covered cell in that class.
        target = { classGroupId: cell.c, studentId: 9999, anySubject: true };
        expected = cov.some((x) => x.c === cell.c);
      }
      expect(entryCovers(scope, target), `${JSON.stringify(scope)} ${JSON.stringify(target)}`).toBe(expected);
    }
  });
});

describe("performance", () => {
  it("compiles a leadership snapshot quickly", async () => {
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) await compileSnapshot(head, "*");
    const perCompile = (Date.now() - t0) / 10;
    expect(perCompile).toBeLessThan(250);
  });
});

