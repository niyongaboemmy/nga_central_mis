/**
 * Tenant management M5: automated provisioning (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.5).
 * A paid application becomes a live school; a failed step is retried and converges
 * with no duplicate rows; spokes that are not configured are SKIPPED outside production.
 * Each test drops the school database it created (the local MySQL's FD limit).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { controlPool } from "../db/platform";
import { poolFor } from "../db/pools";
import { invalidateTenants } from "../tenancy";
import {
  retryRun,
  runForApplication,
  setProvisioningStepHook,
  setSpokeTransport,
  startProvisioning,
  waitForProvisioning,
} from "../services/tenantMgmt/provisioning";
import { PASSWORD, ensurePlatform, platformUser, provisionSchool, removeSchool, seedApplication } from "../test/tenantMgmtFixtures";

const created: Array<{ tid: number | null; applicationId: number }> = [];
const savedSecret = process.env.TENANCY_PROVISION_SECRET;

beforeAll(async () => {
  await ensurePlatform();
  delete process.env.TENANCY_PROVISION_SECRET;
}, 60_000);

afterEach(async () => {
  setProvisioningStepHook(null);
  setSpokeTransport(null);
  delete process.env.TENANCY_PROVISION_SECRET;
  for (const c of created.splice(0)) await removeSchool(c.tid, c.applicationId);
});

afterAll(() => {
  if (savedSecret !== undefined) process.env.TENANCY_PROVISION_SECRET = savedSecret;
});

const tenantOfApp = async (applicationId: number): Promise<number | null> => {
  const [[r]] = await controlPool().query<any[]>("SELECT tenant_id FROM Tenant WHERE application_id = ?", [applicationId]);
  return r ? Number(r.tenant_id) : null;
};

describe("provisioning a paid application", () => {
  it("creates the school, converts the applicant and activates everything", async () => {
    const s = await provisionSchool({ pkg: "gold" });
    created.push({ tid: s.tid, applicationId: s.applicationId });

    const run = await runForApplication(s.applicationId, "platform");
    expect(run.status).toBe("DONE");
    const byKey = Object.fromEntries(run.steps.map((x: any) => [x.key, x.status]));
    expect(byKey).toMatchObject({ TENANT_ROW: "DONE", MIS_DB: "DONE", SUPER_ADMIN: "DONE", BRANDING: "SKIPPED", SUBSCRIPTION: "DONE", WELCOME: "DONE" });
    // Gold has all three spokes, none configured here: SKIPPED (non-production), with a reason.
    for (const k of ["APP_TASKMENTOR", "APP_TENDO", "APP_TUPO"]) expect(byKey[k]).toBe("SKIPPED");
    expect(run.steps.find((x: any) => x.key === "APP_TUPO").log).toMatch(/TENANCY_PROVISION_SECRET/);
    // The applicant sees labels, never logs.
    const applicantView = await runForApplication(s.applicationId, "applicant");
    expect(applicantView.steps[0]).toMatchObject({ key: "TENANT_ROW", label: "Reserving your school" });
    expect(applicantView.steps[0].log).toBeUndefined();

    // The database exists, with the school row from the application.
    const [[school]] = await poolFor(s.tid).query<any[]>("SELECT name, contact_email FROM School WHERE school_id = ?", [s.tid]);
    expect(school.name).toBe(s.name);

    // Control plane: tenant ACTIVE on gold, subscription ACTIVE for a term, application ACTIVE, applicant CONVERTED.
    const [[t]] = await controlPool().query<any[]>("SELECT * FROM Tenant WHERE tenant_id = ?", [s.tid]);
    expect(t).toMatchObject({ status: "ACTIVE", package_code: "gold", slug: s.slug });
    expect(t.activated_at).not.toBeNull();
    const [[sub]] = await controlPool().query<any[]>("SELECT * FROM Subscription WHERE tenant_id = ?", [s.tid]);
    expect(sub).toMatchObject({ status: "ACTIVE", package_code: "gold", billing_cycle: "TERM" });
    const [[a]] = await controlPool().query<any[]>("SELECT status, tenant_id FROM TenantApplication WHERE application_id = ?", [s.applicationId]);
    expect(a).toMatchObject({ status: "ACTIVE", tenant_id: s.tid });
    const [[acc]] = await controlPool().query<any[]>("SELECT status, tenant_id, token_version FROM ApplicantAccount WHERE account_id = ?", [s.accountId]);
    // token_version unchanged: the onboarding token turns read-only instead (guards.ts), so the
    // tracker can still show "Your school is live".
    expect(acc).toMatchObject({ status: "CONVERTED", tenant_id: s.tid, token_version: 0 });
    const [dir] = await controlPool().query<any[]>("SELECT * FROM AccountDirectory WHERE tenant_id = ? AND email_norm = ?", [s.tid, s.email]);
    expect(dir).toHaveLength(1);

    // The super admin signs in with the password they registered with.
    invalidateTenants();
    const login = await request(app).post("/auth/login").send({ username: s.email, password: PASSWORD, tenant: s.slug });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    expect(login.body.data.tempToken).toBeTruthy();
    expect(login.body.data.tenant.tid).toBe(s.tid);
    const wrong = await request(app).post("/auth/login").send({ username: s.email, password: "nope-nope-1", tenant: s.slug });
    expect(wrong.status).toBe(401);

    // SUPER_ADMIN + school_owner (SCHOOL scope).
    const [roles] = await poolFor(s.tid).query<any[]>(
      "SELECT r.name FROM UserRole ur JOIN `Role` r ON r.role_id = ur.role_id WHERE ur.user_id = ?",
      [s.ownerId],
    );
    expect(roles.map((r) => r.name)).toContain("SUPER_ADMIN");
    const [grants] = await poolFor(s.tid).query<any[]>(
      "SELECT g.scope_type FROM AccessGrant g JOIN `Role` r ON r.role_id = g.role_id WHERE g.user_id = ? AND r.preset_key = 'school_owner' AND g.status = 'ACTIVE'",
      [s.ownerId],
    );
    expect(grants).toEqual([expect.objectContaining({ scope_type: "SCHOOL" })]);

    // Platform view of the run and the tenant.
    const owner = await platformUser(["PLATFORM_TENANTS_VIEW", "PLATFORM_TENANTS_LIFECYCLE"]);
    const r = await request(app).get(`/platform/provisioning/${s.runId}`).set("Authorization", `Bearer ${owner.token}`);
    expect(r.status).toBe(200);
    expect(r.body.data.steps).toHaveLength(9);
    const detail = await request(app).get(`/platform/tenants/${s.tid}`).set("Authorization", `Bearer ${owner.token}`);
    expect(detail.status, JSON.stringify(detail.body)).toBe(200);
    expect(detail.body.data.tenant).toMatchObject({ tid: s.tid, status: "ACTIVE", pkg: "gold" });
    expect(detail.body.data.subscription.status).toBe("ACTIVE");
    expect(detail.body.data.provisioning.status).toBe("DONE");
    expect(detail.body.data.allowedActions).toContain("suspend");
    const list = await request(app).get("/platform/tenants").set("Authorization", `Bearer ${owner.token}`);
    expect(list.body.data.map((x: any) => x.tid)).toEqual(expect.arrayContaining([1, s.tid]));
  }, 180_000);

  it("fails a middle step, keeps the school PENDING, and a retry converges without duplicates", async () => {
    const seeded = await seedApplication({ pkg: "starter" });
    created.push({ tid: null, applicationId: seeded.applicationId });
    let failures = 0;
    // Fail AFTER the step's work, so the retry has to cope with half-done rows.
    setProvisioningStepHook((step) => {
      if (step === "SUPER_ADMIN" && failures === 0) {
        failures++;
        throw new Error("chaos: killed mid-step");
      }
    });
    const { runId } = await startProvisioning(seeded.applicationId);
    // A concurrent start is the same run (no second runner).
    expect((await startProvisioning(seeded.applicationId)).runId).toBe(runId);
    await waitForProvisioning(seeded.applicationId);
    const tid = await tenantOfApp(seeded.applicationId);
    created[created.length - 1].tid = tid;

    const failed = await runForApplication(seeded.applicationId, "platform");
    expect(failed.status).toBe("FAILED");
    expect(failed.steps.find((x: any) => x.key === "SUPER_ADMIN")).toMatchObject({ status: "FAILED" });
    expect(failed.steps.find((x: any) => x.key === "SUPER_ADMIN").log).toMatch(/chaos/);
    expect(failed.steps.find((x: any) => x.key === "SUBSCRIPTION").status).toBe("PENDING");
    const [[a1]] = await controlPool().query<any[]>("SELECT status FROM TenantApplication WHERE application_id = ?", [seeded.applicationId]);
    expect(a1.status).toBe("PROVISIONING_FAILED");
    const [[t1]] = await controlPool().query<any[]>("SELECT status FROM Tenant WHERE tenant_id = ?", [tid]);
    expect(t1.status).toBe("PENDING");

    // Retry from the console: resumes at SUPER_ADMIN, attempt 2.
    const owner = await platformUser(["PLATFORM_TENANTS_VIEW", "PLATFORM_TENANTS_LIFECYCLE"]);
    const retry = await request(app).post(`/platform/provisioning/${runId}/retry`).set("Authorization", `Bearer ${owner.token}`);
    expect(retry.status, JSON.stringify(retry.body)).toBe(200);
    await waitForProvisioning(seeded.applicationId);
    const done = await runForApplication(seeded.applicationId, "platform");
    expect(done).toMatchObject({ id: runId, status: "DONE", attempt: 2 });
    // Starter has no spokes: SKIPPED as "not in the package".
    expect(done.steps.find((x: any) => x.key === "APP_TASKMENTOR").log).toMatch(/not in the starter package/);

    const [tenants] = await controlPool().query<any[]>("SELECT tenant_id, status FROM Tenant WHERE application_id = ?", [seeded.applicationId]);
    expect(tenants).toEqual([expect.objectContaining({ tenant_id: tid, status: "ACTIVE" })]);
    const [users] = await poolFor(tid!).query<any[]>("SELECT user_id FROM `User` WHERE email = ?", [seeded.email]);
    expect(users).toHaveLength(1);
    const [[c]] = await poolFor(tid!).query<any[]>(
      "SELECT (SELECT COUNT(*) FROM UserRole WHERE user_id = ?) AS roles, (SELECT COUNT(*) FROM AccessGrant WHERE user_id = ?) AS grants, (SELECT COUNT(*) FROM AuthCredential WHERE user_id = ?) AS creds, (SELECT COUNT(*) FROM UserProfile WHERE user_id = ?) AS profiles",
      [users[0].user_id, users[0].user_id, users[0].user_id, users[0].user_id],
    );
    expect(c).toMatchObject({ roles: 1, grants: 1, creds: 1, profiles: 1 });
    const [subs] = await controlPool().query<any[]>("SELECT * FROM Subscription WHERE tenant_id = ?", [tid]);
    expect(subs).toHaveLength(1);
    // Retrying a finished run is refused.
    await expect(retryRun(runId, owner.id)).rejects.toThrow(/Only a failed run/);
  }, 180_000);

  it("provisions configured spokes and fails (not skips) them in production", async () => {
    process.env.TENANCY_PROVISION_SECRET = "test-secret";
    process.env.TENANCY_PROVISION_POLL_MS = "1";
    process.env.TENANCY_SPOKE_TASKMENTOR_URL = "http://tm.spoke.test";
    process.env.TENANCY_SPOKE_TENDO_URL = "http://tendo.spoke.test";
    process.env.TENANCY_SPOKE_TUPO_URL = "http://tupo.spoke.test/";
    const calls: string[] = [];
    let tupoBusy = 1;
    setSpokeTransport(async (url, secret, body: any) => {
      calls.push(url);
      expect(secret).toBe("test-secret");
      if (url.startsWith("http://tupo.spoke.test/api/") && tupoBusy-- > 0) return { status: 202, body: { ok: false } }; // Tupo: still working once
      return { status: 200, body: { ok: true, tid: body.tid, created: true } };
    });
    const s = await provisionSchool({ pkg: "gold" });
    created.push({ tid: s.tid, applicationId: s.applicationId });
    const run = await runForApplication(s.applicationId, "platform");
    expect(run.status).toBe("DONE");
    for (const k of ["APP_TASKMENTOR", "APP_TENDO", "APP_TUPO"]) expect(run.steps.find((x: any) => x.key === k).status).toBe("DONE");
    expect(calls.filter((u) => u.endsWith(`/api/integration/tenants/${s.tid}/provision`)).length).toBe(4);

    // Production without a secret: the spoke step FAILS -- never a silent partial activation.
    delete process.env.TENANCY_PROVISION_SECRET;
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const seeded = await seedApplication({ pkg: "gold" });
    created.push({ tid: null, applicationId: seeded.applicationId });
    try {
      await startProvisioning(seeded.applicationId);
      await waitForProvisioning(seeded.applicationId);
    } finally {
      process.env.NODE_ENV = prev;
    }
    created[created.length - 1].tid = await tenantOfApp(seeded.applicationId);
    const prod = await runForApplication(seeded.applicationId, "platform");
    expect(prod.status).toBe("FAILED");
    expect(prod.steps.find((x: any) => x.key === "APP_TASKMENTOR")).toMatchObject({ status: "FAILED" });
    const [[t]] = await controlPool().query<any[]>("SELECT status FROM Tenant WHERE application_id = ?", [seeded.applicationId]);
    expect(t.status).toBe("PENDING");
    delete process.env.TENANCY_PROVISION_POLL_MS;
  }, 240_000);

  it("refuses to provision an application that is not paid", async () => {
    const seeded = await seedApplication({ status: "APPROVED_AWAITING_PAYMENT" });
    created.push({ tid: null, applicationId: seeded.applicationId });
    await expect(startProvisioning(seeded.applicationId)).rejects.toThrow(/confirmed payment/);
  });
});
