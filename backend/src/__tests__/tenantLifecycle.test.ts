/**
 * Tenant management M6-M7: renewals, GRACE -> SUSPENDED, the suspended sign-in,
 * reactivation on payment, primary-tenant protections, package changes and
 * overrides, change requests (pro-rata), archive and delete
 * (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §2.2, §6.7, §6.8).
 *
 * One provisioned school for the whole file; the last test archives and deletes it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import os from "os";
import path from "path";
import request from "supertest";
import app from "../app";
import { controlPool } from "../db/platform";
import { poolFor } from "../db/pools";
import { invalidateTenants } from "../tenancy";
import { createInvoice } from "../services/tenantMgmt/billing";
import { onTenantInvoicePaid } from "../services/tenantMgmt/subscription";
import { runGraceJob, runRenewalJob, runSuspendJob } from "../services/tenantMgmt/jobs";
import { PASSWORD, ensurePlatform, platformUser, provisionSchool, removeSchool, sessionToken } from "../test/tenantMgmtFixtures";

let school: Awaited<ReturnType<typeof provisionSchool>>;
let owner: { id: number; token: string };
let teacherId: number;
const TEACHER_PW = "Teach3r-pw!!";
const day = (offset: number, from = new Date()) => new Date(from.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function setPeriod(start: string, end: string) {
  await controlPool().query("UPDATE Subscription SET period_start = ?, period_end = ?, status = 'ACTIVE' WHERE tenant_id = ?", [start, end, school.tid]);
}
const tenantStatus = async () => ((await controlPool().query<any[]>("SELECT * FROM Tenant WHERE tenant_id = ?", [school.tid]))[0] as any[])[0];

beforeAll(async () => {
  await ensurePlatform();
  delete process.env.TENANCY_PROVISION_SECRET;
  school = await provisionSchool({ pkg: "gold" });
  owner = await platformUser([
    "PLATFORM_TENANTS_VIEW",
    "PLATFORM_TENANTS_LIFECYCLE",
    "PLATFORM_TENANTS_ENTITLEMENTS",
    "PLATFORM_PACKAGES_MANAGE",
  ]);
  // A teacher of the school: no SCHOOL_BILLING_MANAGE.
  const pool = poolFor(school.tid);
  const [u]: any = await pool.query("INSERT INTO `User` (username, email, status) VALUES (?, ?, 'ACTIVE')", [`t-${school.slug}`, `teacher-${school.slug}@school.test`]);
  teacherId = Number(u.insertId);
  await pool.query("INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (?, 'Tea', 'Cher', 'TEACHER')", [teacherId]);
  await pool.query("INSERT INTO AuthCredential (user_id, password_hash) VALUES (?, ?)", [teacherId, await bcrypt.hash(TEACHER_PW, 4)]);
}, 240_000);

afterAll(async () => {
  await controlPool().query("UPDATE Package SET price_term_rwf = NULL WHERE code IN ('gold','premium')").catch(() => undefined);
  await removeSchool(school?.tid, school?.applicationId);
});

describe("renewals and the expiry path", () => {
  it("drafts the renewal 30 days ahead, reminds once per reminder day", async () => {
    const now = new Date();
    await setPeriod(day(-90, now), day(30, now));
    const first = await runRenewalJob(now);
    expect(first).toMatchObject({ drafted: 1, reminded: 1 });
    const [invs] = await controlPool().query<any[]>("SELECT * FROM Invoice WHERE tenant_id = ? AND kind = 'RENEWAL'", [school.tid]);
    expect(invs).toHaveLength(1);
    expect(invs[0]).toMatchObject({ status: "DRAFT", package_code: "gold" });
    expect(new Date(invs[0].period_start).toISOString().slice(0, 10) <= day(30, now)).toBe(true);
    expect(await runRenewalJob(now)).toMatchObject({ drafted: 0, reminded: 0 });
    // 20 days out is not a reminder day.
    expect((await runRenewalJob(new Date(now.getTime() + 10 * 86_400_000))).reminded).toBe(0);
  });

  it("moves ACTIVE -> GRACE after period_end, then GRACE -> SUSPENDED after the grace window", async () => {
    const now = new Date();
    await setPeriod(day(-120, now), day(-1, now));
    expect(await runGraceJob(now)).toBe(1);
    let t = await tenantStatus();
    expect(t.status).toBe("GRACE");
    expect(new Date(t.grace_until).getTime()).toBeGreaterThan(now.getTime() + 12 * 86_400_000);
    // /tenant/status shows the banner state.
    invalidateTenants();
    const st = await request(app).get("/tenant/status").set(auth(await sessionToken(school.ownerId, school.tid)));
    expect(st.status, JSON.stringify(st.body)).toBe(200);
    expect(st.body.data).toMatchObject({ status: "GRACE" });
    expect(st.body.data.daysLeft).toBeGreaterThanOrEqual(12);

    expect(await runSuspendJob(now)).toBe(0); // still in grace
    const versionBefore = ((await poolFor(school.tid).query<any[]>("SELECT token_version FROM `User` WHERE user_id = ?", [school.ownerId]))[0] as any[])[0].token_version;
    expect(await runSuspendJob(new Date(now.getTime() + 20 * 86_400_000))).toBe(1);
    t = await tenantStatus();
    expect(t.status).toBe("SUSPENDED");
    const versionAfter = ((await poolFor(school.tid).query<any[]>("SELECT token_version FROM `User` WHERE user_id = ?", [school.ownerId]))[0] as any[])[0].token_version;
    expect(versionAfter).toBe(versionBefore + 1); // every session revoked
  });

  it("lets only billing owners into a SUSPENDED school, and only on the billing paths", async () => {
    invalidateTenants();
    const ownerLogin = await request(app).post("/auth/login").send({ username: school.email, password: PASSWORD, tenant: school.slug });
    expect(ownerLogin.status, JSON.stringify(ownerLogin.body)).toBe(200);
    const teacherLogin = await request(app).post("/auth/login").send({ username: `teacher-${school.slug}@school.test`, password: TEACHER_PW, tenant: school.slug });
    expect(teacherLogin.status).toBe(403);
    expect(teacherLogin.body.code).toBe("TENANT_SUSPENDED");

    const ownerToken = await sessionToken(school.ownerId, school.tid);
    expect((await request(app).get("/tenant/status").set(auth(ownerToken))).status).toBe(200);
    expect((await request(app).get("/tenant/subscription").set(auth(ownerToken))).status).toBe(200);
    const blocked = await request(app).get("/users").set(auth(ownerToken));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("TENANT_SUSPENDED");

    const teacherToken = await sessionToken(teacherId, school.tid);
    const t = await request(app).get("/tenant/status").set(auth(teacherToken));
    expect(t.status).toBe(403);
    expect(t.body.code).toBe("TENANT_SUSPENDED");
  });

  it("reactivates on a paid renewal and extends the period", async () => {
    const [[inv]] = await controlPool().query<any[]>("SELECT invoice_id FROM Invoice WHERE tenant_id = ? AND kind = 'RENEWAL' LIMIT 1", [school.tid]);
    await controlPool().query("UPDATE Invoice SET status = 'PAID', paid_at = NOW(), period_start = NULL, period_end = NULL WHERE invoice_id = ?", [inv.invoice_id]);
    await onTenantInvoicePaid(Number(inv.invoice_id), owner.id);
    const t = await tenantStatus();
    expect(t).toMatchObject({ status: "ACTIVE", grace_until: null, suspended_at: null });
    const [[sub]] = await controlPool().query<any[]>("SELECT * FROM Subscription WHERE tenant_id = ? AND status = 'ACTIVE'", [school.tid]);
    expect(new Date(sub.period_end).getTime()).toBeGreaterThan(Date.now() + 100 * 86_400_000);
    invalidateTenants();
    const teacherToken = await sessionToken(teacherId, school.tid);
    expect((await request(app).get("/tenant/status").set(auth(teacherToken))).status).toBe(200);
  });
});

describe("console actions", () => {
  it("protects the primary tenant", async () => {
    for (const [method, url, body] of [
      ["post", "/platform/tenants/1/suspend", { reason: "test test" }],
      ["post", "/platform/tenants/1/archive", { reason: "test test" }],
      ["post", "/platform/tenants/1/delete", { confirmName: "x" }],
      ["put", "/platform/tenants/1/package", { packageCode: "gold", reason: "test test" }],
    ] as const) {
      const r = await (request(app) as any)[method](url).set(auth(owner.token)).send(body);
      expect(r.status, `${url} ${JSON.stringify(r.body)}`).toBe(409);
      expect(r.body.code).toBe("PRIMARY_TENANT");
    }
    // A school user never reaches the console.
    const r = await request(app).get("/platform/tenants").set(auth(await sessionToken(school.ownerId, school.tid)));
    expect(r.status).toBe(404);
  });

  it("changes the package and applies overrides to /tenant/status", async () => {
    const tok = await sessionToken(school.ownerId, school.tid);
    const ch = await request(app).put(`/platform/tenants/${school.tid}/package`).set(auth(owner.token)).send({ packageCode: "starter", reason: "downgrade test" });
    expect(ch.status, JSON.stringify(ch.body)).toBe(200);
    expect(ch.body.data.tenant.pkg).toBe("starter");
    let st = await request(app).get("/tenant/status").set(auth(tok));
    expect(st.body.data.entitlements.pkg).toBe("starter");
    expect(st.body.data.entitlements.apps).not.toContain("app.taskmentor");

    const add = await request(app)
      .post(`/platform/tenants/${school.tid}/overrides`)
      .set(auth(owner.token))
      .send({ key: "app.taskmentor", value: null, enabled: true, reason: "pilot of Task Mentor" });
    expect(add.status, JSON.stringify(add.body)).toBe(200);
    const ovr = add.body.data.overrides.find((o: any) => o.key === "app.taskmentor");
    expect(ovr).toBeTruthy();
    st = await request(app).get("/tenant/status").set(auth(await sessionToken(school.ownerId, school.tid)));
    expect(st.body.data.entitlements.apps).toContain("app.taskmentor");
    expect(Array.isArray(st.body.data.warnings)).toBe(true);

    const rm = await request(app).delete(`/platform/tenants/${school.tid}/overrides/${ovr.id}`).set(auth(owner.token));
    expect(rm.status).toBe(200);
    expect(rm.body.data.entitlements.apps).not.toContain("app.taskmentor");
    expect(rm.body.data.apps.every((a: any) => "key" in a)).toBe(true);

    await request(app).put(`/platform/tenants/${school.tid}/package`).set(auth(owner.token)).send({ packageCode: "gold", reason: "back to gold" });
  });

  it("prices an upgrade pro-rata and schedules a downgrade for the next period", async () => {
    await controlPool().query("UPDATE Package SET price_term_rwf = 100000 WHERE code = 'gold'");
    await controlPool().query("UPDATE Package SET price_term_rwf = 200000 WHERE code = 'premium'");
    await setPeriod(day(-30), day(90));
    const tok = await sessionToken(school.ownerId, school.tid);
    const up = await request(app).post("/tenant/subscription/change-request").set(auth(tok)).send({ packageCode: "premium" });
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    expect(up.body.data.effective).toBe("NOW");
    expect(up.body.data.invoice.amount).toBe(75000); // 100 000 x 90 / 120 days
    expect(up.body.data.invoice.kind).toBe("CHANGE");
    const again = await request(app).post("/tenant/subscription/change-request").set(auth(tok)).send({ packageCode: "starter" });
    expect(again.status).toBe(409);

    // Paying the upgrade switches the package now.
    await controlPool().query("UPDATE Invoice SET status = 'PAID' WHERE invoice_id = ?", [up.body.data.invoice.id]);
    await onTenantInvoicePaid(up.body.data.invoice.id, owner.id);
    expect((await tenantStatus()).package_code).toBe("premium");

    const down = await request(app).post("/tenant/subscription/change-request").set(auth(tok)).send({ packageCode: "gold", effective: "NOW" });
    expect(down.status, JSON.stringify(down.body)).toBe(200);
    expect(down.body.data).toMatchObject({ effective: "NEXT_PERIOD" });
    expect(down.body.data.invoice.amount).toBe(0);
    const acct = await request(app).get("/tenant/subscription").set(auth(tok));
    expect(acct.status).toBe(200);
    expect(acct.body.data.pendingChange).toMatchObject({ packageCode: "gold", effective: "NEXT_PERIOD" });
    expect((await tenantStatus()).package_code).toBe("premium");
  });

  it("suspends, archives (with an export when mysqldump exists) and deletes a school", async () => {
    process.env.TENANCY_EXPORT_DIR = path.join(os.tmpdir(), `tenant-exports-${process.pid}`);
    const tid = school.tid;
    const noReason = await request(app).post(`/platform/tenants/${tid}/suspend`).set(auth(owner.token)).send({});
    expect(noReason.status).toBe(400);
    const s = await request(app).post(`/platform/tenants/${tid}/suspend`).set(auth(owner.token)).send({ reason: "unpaid for months" });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.body.data.tenant.status).toBe("SUSPENDED");
    expect(s.body.data.allowedActions).toEqual(expect.arrayContaining(["reactivate", "archive"]));
    const del0 = await request(app).post(`/platform/tenants/${tid}/delete`).set(auth(owner.token)).send({ confirmName: school.name });
    expect(del0.status).toBe(409); // only after archive
    const a = await request(app).post(`/platform/tenants/${tid}/archive`).set(auth(owner.token)).send({ reason: "retention" });
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(a.body.data.tenant.status).toBe("ARCHIVED");
    const [[audit]] = await controlPool().query<any[]>("SELECT payload FROM PlatformAudit WHERE action = 'tenant.archive' AND target_tid = ? ORDER BY audit_id DESC LIMIT 1", [tid]);
    const payload = typeof audit.payload === "string" ? JSON.parse(audit.payload) : audit.payload;
    expect(payload.export?.path || payload.exportSkipped).toBeTruthy();

    const wrong = await request(app).post(`/platform/tenants/${tid}/delete`).set(auth(owner.token)).send({ confirmName: "Another school" });
    expect(wrong.status).toBe(400);
    const del = await request(app).post(`/platform/tenants/${tid}/delete`).set(auth(owner.token)).send({ confirmName: school.name.toUpperCase() });
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    const [rows] = await controlPool().query<any[]>("SELECT tenant_id FROM Tenant WHERE tenant_id = ?", [tid]);
    expect(rows).toHaveLength(0);
    delete process.env.TENANCY_EXPORT_DIR;
  }, 120_000);
});
