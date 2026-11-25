/**
 * Platform console: edit a school's details (name, legal name, timezone, country).
 * PUT /platform/tenants/:id/details — PLATFORM_TENANTS_LIFECYCLE, reason required, slug fixed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { controlPool } from "../db/platform";
import { poolFor } from "../db/pools";
import { getTenant } from "../tenancy/registry";
import { ensurePlatform, platformUser, provisionSchool, removeSchool } from "../test/tenantMgmtFixtures";

let school: Awaited<ReturnType<typeof provisionSchool>>;
let other: Awaited<ReturnType<typeof provisionSchool>>;
let owner: { id: number; token: string };
let viewer: { id: number; token: string };
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const put = (tid: number, token: string, body: Record<string, unknown>) => request(app).put(`/platform/tenants/${tid}/details`).set(auth(token)).send(body);
const row = async (tid: number) => ((await controlPool().query<any[]>("SELECT * FROM Tenant WHERE tenant_id = ?", [tid]))[0] as any[])[0];

beforeAll(async () => {
  await ensurePlatform();
  delete process.env.TENANCY_PROVISION_SECRET;
  school = await provisionSchool({ pkg: "gold" });
  other = await provisionSchool({ pkg: "starter" });
  owner = await platformUser(["PLATFORM_TENANTS_VIEW", "PLATFORM_TENANTS_LIFECYCLE"]);
  viewer = await platformUser(["PLATFORM_TENANTS_VIEW"]);
}, 300_000);

afterAll(async () => {
  await removeSchool(school?.tid, school?.applicationId);
  await removeSchool(other?.tid, other?.applicationId);
});

describe("edit school details", () => {
  it("offers edit_details only to lifecycle holders", async () => {
    const asOwner = await request(app).get(`/platform/tenants/${school.tid}`).set(auth(owner.token));
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.data.allowedActions).toContain("edit_details");
    expect(asOwner.body.data.tenant).toHaveProperty("legalName");
    const asViewer = await request(app).get(`/platform/tenants/${school.tid}`).set(auth(viewer.token));
    expect(asViewer.body.data.allowedActions).not.toContain("edit_details");
    expect((await put(school.tid, viewer.token, { name: "Nope School", reason: "test" })).status).toBe(403);
  });

  it("renames the school, keeps its School row and the registry in step, and audits it", async () => {
    const before = await row(school.tid);
    const pool = poolFor(school.tid);
    await pool.query("UPDATE School SET name = ? WHERE school_id = ?", [before.display_name, school.tid]);
    const res = await put(school.tid, owner.token, {
      name: "  Riverside   Hills Academy ",
      legalName: "Riverside Hills Academy Ltd",
      timezone: "Africa/Nairobi",
      country: "ke",
      reason: "The school changed its name",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.tenant).toMatchObject({ name: "Riverside Hills Academy", legalName: "Riverside Hills Academy Ltd", timezone: "Africa/Nairobi", country: "KE" });
    const after = await row(school.tid);
    expect(after).toMatchObject({ display_name: "Riverside Hills Academy", legal_name: "Riverside Hills Academy Ltd", timezone: "Africa/Nairobi", country: "KE", slug: before.slug });
    const [[s]]: any = await pool.query("SELECT name FROM School WHERE school_id = ?", [school.tid]);
    expect(s.name).toBe("Riverside Hills Academy");
    expect((await getTenant(school.tid))?.name).toBe("Riverside Hills Academy");
    const [audit] = await controlPool().query<any[]>("SELECT * FROM PlatformAudit WHERE action = 'tenant.details' AND target_tid = ? ORDER BY audit_id DESC LIMIT 1", [school.tid]);
    expect(audit).toHaveLength(1);
    const payload = typeof audit[0].payload === "string" ? JSON.parse(audit[0].payload) : audit[0].payload;
    expect(payload).toMatchObject({ reason: "The school changed its name", after: { display_name: "Riverside Hills Academy" }, schoolRowSynced: true });
  });

  it("leaves a name the school set itself alone", async () => {
    const pool = poolFor(school.tid);
    await pool.query("UPDATE School SET name = 'Riverside Campus (own name)' WHERE school_id = ?", [school.tid]);
    const res = await put(school.tid, owner.token, { name: "Riverside Hills International", reason: "Rebrand" });
    expect(res.status).toBe(200);
    const [[s]]: any = await pool.query("SELECT name FROM School WHERE school_id = ?", [school.tid]);
    expect(s.name).toBe("Riverside Campus (own name)");
  });

  it("refuses bad input, no change, a taken name, and a missing reason", async () => {
    expect((await put(school.tid, owner.token, { name: "Ok Name School" })).status).toBe(400);
    expect((await put(school.tid, owner.token, { name: "ab", reason: "short" })).status).toBe(400);
    expect((await put(school.tid, owner.token, { timezone: "Mars/Olympus", reason: "tz" })).status).toBe(400);
    expect((await put(school.tid, owner.token, { country: "Rwanda", reason: "country" })).status).toBe(400);
    expect((await put(school.tid, owner.token, { name: "Riverside Hills International", reason: "same" })).status).toBe(400);
    const otherName = (await row(other.tid)).display_name;
    const taken = await put(school.tid, owner.token, { name: ` ${String(otherName).toUpperCase()} `, reason: "dupe" });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("NAME_TAKEN");
  });

  it("never changes the slug, even when one is sent", async () => {
    const slug = (await row(school.tid)).slug;
    await put(school.tid, owner.token, { name: "Riverside Hills Intl", slug: "hijack", reason: "slug probe" });
    expect((await row(school.tid)).slug).toBe(slug);
  });
});
