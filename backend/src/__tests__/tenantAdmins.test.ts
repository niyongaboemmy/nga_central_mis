/**
 * Platform console: a school's administrators (routes/platformTenants.ts → tenantAdmins.ts).
 * List, add (new person / promote an existing one), owner cap, reset password,
 * remove (never the last owner), primary tenant read-only, capability checks.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import app from "../app";
import { poolFor } from "../db/pools";
import { controlPool } from "../db/platform";
import emailService from "../utils/email";
import { ensurePlatform, platformUser, provisionSchool, removeSchool } from "../test/tenantMgmtFixtures";

let school: Awaited<ReturnType<typeof provisionSchool>>;
let operator: { id: number; token: string };
let viewer: { id: number; token: string };
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  await ensurePlatform();
  delete process.env.TENANCY_PROVISION_SECRET;
  school = await provisionSchool({ pkg: "gold" });
  operator = await platformUser(["PLATFORM_TENANTS_VIEW", "PLATFORM_TENANTS_LIFECYCLE"]);
  viewer = await platformUser(["PLATFORM_TENANTS_VIEW"]);
  vi.spyOn(emailService, "sendEmail").mockResolvedValue(true as any);
  vi.spyOn(emailService, "isAvailable").mockReturnValue(true);
}, 240_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await removeSchool(school?.tid, school?.applicationId);
});

describe("school administrators", () => {
  it("lists the provisioned owner", async () => {
    const r = await request(app).get(`/platform/tenants/${school.tid}/admins`).set(auth(viewer.token));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0]).toMatchObject({ userId: school.ownerId, kind: "OWNER", email: school.email, status: "ACTIVE" });
  });

  it("refuses writes without the lifecycle capability", async () => {
    const r = await request(app)
      .post(`/platform/tenants/${school.tid}/admins`)
      .set(auth(viewer.token))
      .send({ firstName: "No", email: `no-${school.slug}@school.test`, kind: "ADMIN", reason: "test" });
    expect(r.status).toBe(403);
  });

  let adminId = 0;
  it("creates a new administrator with a one-time password", async () => {
    const email = `Admin-${school.slug}@School.test`;
    const r = await request(app)
      .post(`/platform/tenants/${school.tid}/admins`)
      .set(auth(operator.token))
      .send({ firstName: "Ada", lastName: "Mukamana", email, kind: "ADMIN", reason: "School asked for a second admin" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ created: true, emailed: true });
    expect(r.body.data.tempPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(r.body.data.admin).toMatchObject({ kind: "ADMIN", name: "Ada Mukamana", mustChangePassword: true, email: email.toLowerCase() });
    adminId = r.body.data.admin.userId;
    const [[cred]] = await poolFor(school.tid).query<any[]>("SELECT password_hash, force_password_change FROM AuthCredential WHERE user_id = ?", [adminId]);
    expect(await bcrypt.compare(r.body.data.tempPassword, cred.password_hash)).toBe(true);
    expect(Number(cred.force_password_change)).toBe(1);
    const [[g]] = await poolFor(school.tid).query<any[]>(
      "SELECT r.preset_key FROM AccessGrant g JOIN `Role` r ON r.role_id = g.role_id WHERE g.user_id = ? AND g.status = 'ACTIVE'",
      [adminId],
    );
    expect(g.preset_key).toBe("school_administrator");
    const [audit] = await controlPool().query<any[]>("SELECT action FROM PlatformAudit WHERE target_tid = ? AND action = 'platform.tenant.admin_add'", [school.tid]);
    expect(audit.length).toBe(1);
  });

  it("refuses the same person twice", async () => {
    const r = await request(app)
      .post(`/platform/tenants/${school.tid}/admins`)
      .set(auth(operator.token))
      .send({ firstName: "Ada", email: `admin-${school.slug}@school.test`, kind: "ADMIN", reason: "again" });
    expect(r.status).toBe(409);
  });

  it("promotes an existing user to owner without touching their password, then caps owners at 2", async () => {
    const r = await request(app)
      .post(`/platform/tenants/${school.tid}/admins`)
      .set(auth(operator.token))
      .send({ firstName: "Ada", email: `admin-${school.slug}@school.test`, kind: "OWNER", reason: "Second owner" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ created: false, tempPassword: null });
    expect(r.body.data.admin.kind).toBe("OWNER");
    const third = await request(app)
      .post(`/platform/tenants/${school.tid}/admins`)
      .set(auth(operator.token))
      .send({ firstName: "Third", email: `third-${school.slug}@school.test`, kind: "OWNER", reason: "Third owner" });
    expect(third.status).toBe(409);
    expect(third.body.message).toMatch(/maximum of 2/);
  });

  it("resets an administrator's password and ends their sessions", async () => {
    const before = ((await poolFor(school.tid).query<any[]>("SELECT token_version FROM `User` WHERE user_id = ?", [adminId]))[0] as any[])[0].token_version;
    const r = await request(app)
      .post(`/platform/tenants/${school.tid}/admins/${adminId}/reset-password`)
      .set(auth(operator.token))
      .send({ reason: "Locked out" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.tempPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    const after = ((await poolFor(school.tid).query<any[]>("SELECT token_version FROM `User` WHERE user_id = ?", [adminId]))[0] as any[])[0].token_version;
    expect(after).toBe(before + 1);
  });

  it("removes an owner but never the last one", async () => {
    const r = await request(app).delete(`/platform/tenants/${school.tid}/admins/${adminId}`).set(auth(operator.token)).send({ reason: "Left the school" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const list = await request(app).get(`/platform/tenants/${school.tid}/admins`).set(auth(viewer.token));
    expect(list.body.data.map((a: any) => a.userId)).toEqual([school.ownerId]);
    const last = await request(app).delete(`/platform/tenants/${school.tid}/admins/${school.ownerId}`).set(auth(operator.token)).send({ reason: "nope" });
    expect(last.status).toBe(409);
  });

  it("keeps the primary school's administrators read-only", async () => {
    const list = await request(app).get(`/platform/tenants/1/admins`).set(auth(viewer.token));
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    const r = await request(app)
      .post(`/platform/tenants/1/admins`)
      .set(auth(operator.token))
      .send({ firstName: "X", email: "x@primary.test", kind: "OWNER", reason: "nope" });
    expect(r.status).toBe(409);
  });
});
