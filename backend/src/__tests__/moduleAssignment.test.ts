/**
 * Modules and the schools they are switched on for.
 *
 * A module added on the Modules screen used to be reachable by the primary school
 * only: the console listed just the modules a school already had a row for, so a
 * new one could never be switched on elsewhere, and no package could include it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { primaryDb } from "../db";
import { sql } from "drizzle-orm";
import { controlPool } from "../db/platform";
import { assignedSystemIds, isSystemAssigned } from "../tenancy/systems";
import { getTenant, invalidateTenants } from "../tenancy";
import { invalidateEntitlements } from "../services/tenantMgmt/entitlements";
import { invalidateModules, schoolModules } from "../services/tenantMgmt/modules";
import { moduleKey } from "../services/tenantMgmt/catalog";
import { deriveTenantSystems } from "../services/tenantMgmt/tenantSystems";
import { ensurePlatform, platformUser, provisionSchool, removeSchool } from "../test/tenantMgmtFixtures";

let school: Awaited<ReturnType<typeof provisionSchool>>;
let owner: { id: number; token: string };
let moduleId: number;
let goldBefore: Array<{ key: string; value: number | null }>;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const NAME = `Assets ${tag}`;

const rowOf = async (tid: number) =>
  ((await controlPool().query<any[]>("SELECT status, source FROM TenantSystem WHERE tenant_id = ? AND system_id = ?", [tid, moduleId]))[0] as any[])[0] ?? null;
const assigned = async (tid: number) => {
  invalidateTenants();
  return isSystemAssigned(moduleId, (await getTenant(tid))!);
};
const putGold = (entitlements: Array<{ key: string; value: number | null }>) =>
  request(app).put("/platform/packages/gold/entitlements").set(auth(owner.token)).send({ entitlements });

beforeAll(async () => {
  await ensurePlatform();
  delete process.env.TENANCY_PROVISION_SECRET;
  school = await provisionSchool({ pkg: "gold" });
  owner = await platformUser(["PLATFORM_TENANTS_VIEW", "PLATFORM_TENANTS_LIFECYCLE", "PLATFORM_TENANTS_ENTITLEMENTS", "PLATFORM_PACKAGES_MANAGE"]);
  // A module as the Modules screen makes it: a System row, assigned to nobody yet.
  const res: any = await primaryDb().execute(
    sql`INSERT INTO \`System\` (name, description, client_id, icon_url, home_url, status) VALUES (${NAME}, 'Asset register', ${`assets_${tag}`}, 'https://assets.example/icon.png', 'https://assets.example', 'ACTIVE')`,
  );
  moduleId = Number(res[0].insertId);
  invalidateModules();
  const [ents] = await controlPool().query<any[]>("SELECT ent_key, value_int FROM PackageEntitlement WHERE package_code = 'gold'");
  goldBefore = ents.map((e) => ({ key: String(e.ent_key), value: e.value_int === null ? null : Number(e.value_int) }));
}, 240_000);

afterAll(async () => {
  if (goldBefore) await putGold(goldBefore).catch(() => undefined);
  await controlPool().query("DELETE FROM TenantSystem WHERE system_id = ?", [moduleId]).catch(() => undefined);
  await controlPool().query("DELETE FROM PackageEntitlement WHERE ent_key = ?", [moduleKey(moduleId)]).catch(() => undefined);
  await primaryDb().execute(sql`DELETE FROM \`System\` WHERE system_id = ${moduleId}`).catch(() => undefined);
  invalidateModules();
  await removeSchool(school?.tid, school?.applicationId);
});

describe("a module nobody was given yet", () => {
  it("is listed for a school, switched off, so it can be switched on", async () => {
    const d = await request(app).get(`/platform/tenants/${school.tid}`).set(auth(owner.token));
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    const mod = d.body.data.apps.find((a: any) => a.systemId === moduleId);
    expect(mod).toMatchObject({ name: NAME, status: "DISABLED", source: "NONE", key: null, entitlementKey: moduleKey(moduleId), needsPackage: false });
    expect(await assigned(school.tid)).toBe(false);
    // Built-in apps keep their key.
    expect(d.body.data.apps.every((a: any) => "key" in a)).toBe(true);
  });

  it("is switched on and off for one school from the console", async () => {
    const on = await request(app).put(`/platform/tenants/${school.tid}/apps/${moduleId}`).set(auth(owner.token)).send({ status: "ACTIVE" });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect(on.body.data.apps.find((a: any) => a.systemId === moduleId)).toMatchObject({ status: "ACTIVE", source: "OVERRIDE" });
    expect(await assigned(school.tid)).toBe(true);

    const off = await request(app).put(`/platform/tenants/${school.tid}/apps/${moduleId}`).set(auth(owner.token)).send({ status: "DISABLED" });
    expect(off.body.data.apps.find((a: any) => a.systemId === moduleId)).toMatchObject({ status: "DISABLED", source: "OVERRIDE" });
    expect(await assigned(school.tid)).toBe(false);
  });

  it("can be switched for the primary school too", async () => {
    const on = await request(app).put(`/platform/tenants/1/apps/${moduleId}`).set(auth(owner.token)).send({ status: "ACTIVE" });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect(await assigned(1)).toBe(true);
    const off = await request(app).put(`/platform/tenants/1/apps/${moduleId}`).set(auth(owner.token)).send({ status: "DISABLED" });
    expect(off.status).toBe(200);
    expect(await assigned(1)).toBe(false);
  });

  it("refuses a module that does not exist", async () => {
    const r = await request(app).put(`/platform/tenants/${school.tid}/apps/999999999`).set(auth(owner.token)).send({ status: "ACTIVE" });
    expect(r.status).toBe(404);
  });
});

describe("a module's schools", () => {
  it("lists every school with the module's state there", async () => {
    const r = await request(app).get(`/platform/modules/${moduleId}/schools`).set(auth(owner.token));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.module).toMatchObject({ systemId: moduleId, name: NAME, entitlementKey: moduleKey(moduleId) });
    const tids = r.body.data.schools.map((s: any) => s.tid);
    expect(tids).toContain(1);
    expect(tids).toContain(school.tid);
    expect(r.body.data.schools.find((s: any) => s.tid === school.tid)).toMatchObject({ status: "DISABLED", pkg: "gold" });
  });

  it("switches the chosen schools, or all of them, at once", async () => {
    const some = await request(app).put(`/platform/modules/${moduleId}/schools`).set(auth(owner.token)).send({ tids: [school.tid], status: "ACTIVE" });
    expect(some.status, JSON.stringify(some.body)).toBe(200);
    expect(some.body.data.schools.find((s: any) => s.tid === school.tid).status).toBe("ACTIVE");
    expect(some.body.data.schools.find((s: any) => s.tid === 1).status).toBe("DISABLED");

    const all = await request(app).put(`/platform/modules/${moduleId}/schools`).set(auth(owner.token)).send({ tids: "all", status: "ACTIVE" });
    expect(all.body.data.schools.every((s: any) => s.status === "ACTIVE")).toBe(true);

    const none = await request(app).put(`/platform/modules/${moduleId}/schools`).set(auth(owner.token)).send({ tids: "all", status: "DISABLED" });
    expect(none.body.data.schools.every((s: any) => s.status === "DISABLED")).toBe(true);

    const bad = await request(app).put(`/platform/modules/${moduleId}/schools`).set(auth(owner.token)).send({ tids: "everyone", status: "ACTIVE" });
    expect(bad.status).toBe(400);
  });
});

describe("a module in a package", () => {
  it("is offered by the package editor, by name", async () => {
    const r = await request(app).get("/platform/entitlement-catalog").set(auth(owner.token));
    expect(r.status).toBe(200);
    expect(r.body.data.find((e: any) => e.key === moduleKey(moduleId))).toMatchObject({ kind: "APP", label: NAME, module: true });
    // The built-in apps are still there, once each.
    expect(r.body.data.filter((e: any) => e.key === "app.taskmentor")).toHaveLength(1);
  });

  it("switches the module on for the schools on that package, and off when it leaves the package", async () => {
    // Start from "never set by hand": a hand-set switch always wins over the package.
    await controlPool().query("DELETE FROM TenantSystem WHERE system_id = ?", [moduleId]);

    const add = await putGold([...goldBefore, { key: moduleKey(moduleId), value: null }]);
    expect(add.status, JSON.stringify(add.body)).toBe(200);
    expect(add.body.data.entitlements.find((e: any) => e.key === moduleKey(moduleId))).toMatchObject({ kind: "APP", label: NAME });
    expect(await rowOf(school.tid)).toMatchObject({ status: "ACTIVE", source: "PACKAGE" });
    expect(await assigned(school.tid)).toBe(true);
    const mine = (await schoolModules(school.tid)).find((m) => m.systemId === moduleId)!;
    expect(mine).toMatchObject({ status: "ACTIVE", source: "PACKAGE", inPackage: true });

    const remove = await putGold(goldBefore);
    expect(remove.status).toBe(200);
    expect(await rowOf(school.tid)).toMatchObject({ status: "DISABLED", source: "PACKAGE" });
    expect(await assigned(school.tid)).toBe(false);
  });

  it("leaves a switch the platform set by hand alone", async () => {
    await request(app).put(`/platform/tenants/${school.tid}/apps/${moduleId}`).set(auth(owner.token)).send({ status: "ACTIVE" });
    // The package does not include the module: a derivation must not turn it off.
    invalidateEntitlements(school.tid);
    await deriveTenantSystems(school.tid);
    expect(await rowOf(school.tid)).toMatchObject({ status: "ACTIVE", source: "OVERRIDE" });
    expect((await assignedSystemIds((await getTenant(school.tid))!) as Set<number>).has(moduleId)).toBe(true);
  });

  it("refuses a package entitlement for a module that does not exist", async () => {
    const r = await putGold([...goldBefore, { key: "module.999999999", value: null }]);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.code).toBe("UNKNOWN_ENTITLEMENT");
  });
});
