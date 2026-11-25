/**
 * A school's own administrator: full control of its school's roles and permissions, inside
 * its package, and no reach into another school.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { poolFor } from "../db/pools";
import { resolveEntitlements, allowsCapability, invalidateEntitlements } from "../services/tenantMgmt/entitlements";
import { setTenantPackage } from "../services/tenantMgmt/subscription";
import { ensurePlatform, provisionSchool, removeSchool, sessionToken } from "../test/tenantMgmtFixtures";

let school: Awaited<ReturnType<typeof provisionSchool>>;
let token: string;
const auth = () => ({ Authorization: `Bearer ${token}` });

/** The permissions a role holds in a school's database, by name. */
async function roleHolds(tid: number, where: string): Promise<Array<{ name: string; app: string; cap_key: string | null }>> {
  const [rows] = await poolFor(tid).query<any[]>(
    `SELECT p.name, p.app, p.cap_key FROM RolePermission rp JOIN Permission p ON p.perm_id = rp.perm_id JOIN \`Role\` r ON r.role_id = rp.role_id WHERE ${where}`,
  );
  return rows;
}

beforeAll(async () => {
  await ensurePlatform();
  delete process.env.TENANCY_PROVISION_SECRET;
  school = await provisionSchool({ pkg: "starter" }); // MIS + Tendo only: no safeguarding, no Task Mentor
  token = await sessionToken(school.ownerId, school.tid);
}, 300_000);

afterAll(async () => {
  await removeSchool(school?.tid, school?.applicationId);
});

describe("the school's administrator after provisioning", () => {
  it("holds every permission the package allows, and nothing outside it", async () => {
    invalidateEntitlements(school.tid);
    const ent = await resolveEntitlements(school.tid);
    const [all] = await poolFor(school.tid).query<any[]>("SELECT name, app, cap_key FROM Permission WHERE status = 'ACTIVE' AND deprecated_at IS NULL");
    const allowed = all.filter((p: any) => allowsCapability(ent, p.app || "mis", p.cap_key || p.name, false));
    for (const where of ["r.preset_key = 'school_owner'", "r.name = 'SUPER_ADMIN'"]) {
      const held = await roleHolds(school.tid, where);
      const names = new Set(held.map((h) => h.name));
      expect(allowed.every((p: any) => names.has(p.name))).toBe(true);
      expect(held.some((h) => h.name.startsWith("PLATFORM_"))).toBe(false);
      expect(names.has("SAFEGUARDING_MANAGE")).toBe(false); // feature.safeguarding is not in Starter
    }
  });

  it("gains what a bigger package adds", async () => {
    await setTenantPackage(school.tid, "max");
    const held = new Set((await roleHolds(school.tid, "r.preset_key = 'school_owner'")).map((h) => h.name));
    expect(held.has("SAFEGUARDING_MANAGE")).toBe(true);
    await setTenantPackage(school.tid, "starter");
  });
});

describe("managing the school's permissions", () => {
  it("lists only what the package allows", async () => {
    const res = await request(app).get("/permissions/permissions").set(auth());
    expect(res.status).toBe(200);
    const names: string[] = res.body.data.map((p: any) => p.name);
    expect(names.length).toBeGreaterThan(20);
    expect(names.some((n) => n.startsWith("PLATFORM_"))).toBe(false);
    expect(names).not.toContain("SAFEGUARDING_MANAGE");
    expect(names).toContain("MANAGE_ROLES");
  });

  it("refuses to give a role a permission outside the package", async () => {
    const pool = poolFor(school.tid);
    const [[teacher]] = await pool.query<any[]>("SELECT role_id FROM `Role` WHERE name = 'TEACHER'");
    const [[platform]] = await pool.query<any[]>("SELECT perm_id FROM Permission WHERE name LIKE 'PLATFORM\\_%' LIMIT 1");
    const [[safeguarding]] = await pool.query<any[]>("SELECT perm_id FROM Permission WHERE name = 'SAFEGUARDING_MANAGE'");
    for (const pid of [platform.perm_id, safeguarding.perm_id]) {
      const res = await request(app).post(`/permissions/roles/${teacher.role_id}/permissions`).set(auth()).send({ permissionIds: [pid] });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Not in this school's package/);
    }
  });

  it("saving a role keeps links the package hides", async () => {
    const pool = poolFor(school.tid);
    const [[teacher]] = await pool.query<any[]>("SELECT role_id FROM `Role` WHERE name = 'TEACHER'");
    const [[hidden]] = await pool.query<any[]>("SELECT perm_id FROM Permission WHERE name = 'SAFEGUARDING_MANAGE'");
    await pool.query("INSERT IGNORE INTO RolePermission (role_id, perm_id) VALUES (?, ?)", [teacher.role_id, hidden.perm_id]);
    const visible = (await request(app).get(`/permissions/roles/${teacher.role_id}/permissions`).set(auth())).body.data.map((p: any) => p.perm_id);
    const listed = new Set((await request(app).get("/permissions/permissions").set(auth())).body.data.map((p: any) => p.perm_id));
    const keep = visible.filter((id: number) => listed.has(id));
    const res = await request(app).post(`/permissions/roles/${teacher.role_id}/permissions`).set(auth()).send({ permissionIds: keep });
    expect(res.status).toBe(200);
    const [[still]] = await pool.query<any[]>("SELECT COUNT(*) n FROM RolePermission WHERE role_id = ? AND perm_id = ?", [teacher.role_id, hidden.perm_id]);
    expect(Number(still.n)).toBe(1);
  });

  it("can't create a PLATFORM_ permission", async () => {
    const res = await request(app).post("/permissions/permissions").set(auth()).send({ name: "PLATFORM_ROGUE", description: "x" });
    expect(res.status).toBe(400);
  });

  it("Access Studio refuses a capability outside the package", async () => {
    const [[role]] = await poolFor(school.tid).query<any[]>("SELECT role_id FROM `Role` WHERE name = 'TEACHER'");
    const res = await request(app)
      .patch(`/access/roles/${role.role_id}`)
      .set(auth())
      .send({ capabilities: [{ name: "SAFEGUARDING_MANAGE" }] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/not in this school's package/);
  });

  it("changes stay in the school: the primary school's role is untouched", async () => {
    const primaryBefore = (await roleHolds(1, "r.name = 'TEACHER'")).length;
    const pool = poolFor(school.tid);
    const [[teacher]] = await pool.query<any[]>("SELECT role_id FROM `Role` WHERE name = 'TEACHER'");
    const [[perm]] = await pool.query<any[]>("SELECT perm_id FROM Permission WHERE name = 'MANAGE_ROLES'");
    const current = (await request(app).get(`/permissions/roles/${teacher.role_id}/permissions`).set(auth())).body.data.map((p: any) => p.perm_id);
    const res = await request(app).post(`/permissions/roles/${teacher.role_id}/permissions`).set(auth()).send({ permissionIds: [...current, perm.perm_id] });
    expect(res.status).toBe(200);
    expect((await roleHolds(1, "r.name = 'TEACHER'")).length).toBe(primaryBefore);
  });
});
