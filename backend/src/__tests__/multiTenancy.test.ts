/**
 * Multi-tenancy, MIS backend (MULTI_TENANCY_GAP_FIX_PLAN.md Phases 0-2,
 * packages/tenancy/CONTRACT.md).
 *
 * Builds a real second tenant next to the test database: the control plane
 * (`${DB_NAME}_platform`, or TEST_PLATFORM_DB_NAME) and tenant 2 = `${DB_NAME}_t2`,
 * re-provisioned from nothing on every run.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import zlib from "zlib";
import { newDeviceId, ulid } from "../services/activity/tokens";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { controlPool } from "../db/platform";
import { activityPool } from "../services/activity/db";
import { AuthCredential, Document, IntegrationToken, Program, System, User, UserProfile } from "../db/schema";
import { primaryDb } from "../db";
import {
  TenantContextMissing,
  TenantCtx,
  currentTenantOrNull,
  runWithTenant,
} from "../vendor/nga-tenancy";
import {
  assignSystem,
  bootstrapPlatform,
  createTenantRow,
  dropMisTenantDatabase,
  getTenant,
  getTenantBySlug,
  invalidateTenants,
  misDbNameFor,
  provisionMisTenant,
  runAsPlatform,
  runTenantMigrations,
  setTenancyMode,
  syncDirectoryUser,
  unassignSystem,
} from "../tenancy";
import { writeSystemScopes } from "../tenancy/systemScopes";
import { assignRole, createRoleWithPermissions } from "../test/fixtures";

const SLUG2 = "mt-two";
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
let t1: TenantCtx;
let t2: TenantCtx;
let fresh2: Awaited<ReturnType<typeof provisionMisTenant>>;

const dbName = async (): Promise<string> => ((await db.execute(sql`SELECT DATABASE() AS d`)) as any)[0][0].d;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureTenant(slug: string, name: string, tid: number): Promise<TenantCtx> {
  invalidateTenants();
  let t = await getTenantBySlug(slug);
  if (!t) {
    await createTenantRow({ slug, name, tid, status: "ACTIVE" });
    invalidateTenants();
    t = await getTenant(tid);
  }
  return t!;
}

/** A user with a password in the current tenant, indexed in the Account Directory. */
async function createAccount(email: string, password: string, username = `mt_${crypto.randomBytes(4).toString("hex")}`) {
  const [res] = (await db.insert(User).values({ username, email, status: "ACTIVE" })) as any;
  const userId = res.insertId as number;
  await db.insert(UserProfile).values({ user_id: userId, first_name: "MT", last_name: username, user_type: "TEACHER" });
  await db.insert(AuthCredential).values({ user_id: userId, password_hash: await bcrypt.hash(password, 4) });
  return { userId, username };
}

const tokenFor = (userId: number, tid?: number) =>
  jwt.sign({ userId, tokenVersion: 0, ...(tid ? { tid } : {}) }, process.env.JWT_SECRET!, { expiresIn: "1h" });

async function nextProgramId(): Promise<number> {
  const rows: any = await db.execute(sql`SELECT COALESCE(MAX(program_id), 0) + 1 AS n FROM Program`);
  return Number(rows[0][0].n) + Math.floor(Math.random() * 1000);
}

beforeAll(async () => {
  await bootstrapPlatform();
  await ensureTenant(SLUG2, "MT Two", 2);
  // Tenant 2 is rebuilt from nothing on every run (one fresh tenant only: the local
  // MAMP MySQL drops new connections once ~1024 InnoDB files are open, FD_SETSIZE).
  await dropMisTenantDatabase(2);
  await controlPool().query("DELETE FROM TenantMigration WHERE tenant_id = 2");
  fresh2 = await provisionMisTenant(2);
  // System.scopes (migration 127) on both tenants, through the runner itself.
  await runTenantMigrations({ file: "127_system_scopes.sql", tids: [1, 2] });
  invalidateTenants();
  t1 = (await getTenant(1))!;
  t2 = (await getTenant(2))!;
}, 180_000);

afterEach(() => {
  setTenancyMode(null);
  delete process.env.TENANCY_REQUIRE_TENANT_HEADER;
});

// ---------------------------------------------------------------------------
describe("(a) vendored tenancy core", () => {
  it("is an exact copy of packages/tenancy/src/index.ts", () => {
    const vendored = fs.readFileSync(path.resolve(__dirname, "../vendor/nga-tenancy/index.ts"), "utf8");
    const m = /^\/\/ sha256:([0-9a-f]{64})\n/m.exec(vendored);
    expect(m).not.toBeNull();
    const body = vendored.slice(vendored.indexOf(m![0]) + m![0].length);
    expect(crypto.createHash("sha256").update(body).digest("hex")).toBe(m![1]);
    const source = path.resolve(__dirname, "../../../packages/tenancy/src/index.ts");
    if (fs.existsSync(source)) expect(body).toBe(fs.readFileSync(source, "utf8"));
  });
});

// ---------------------------------------------------------------------------
describe("(b) tenant-routed db", () => {
  it("routes each tenant to its own database, also when interleaved", async () => {
    expect(await runWithTenant(t1, dbName)).toBe(process.env.DB_NAME);
    expect(await runWithTenant(t2, dbName)).toBe(misDbNameFor(2));
    const [a, b, c] = await Promise.all([
      runWithTenant(t1, async () => {
        await sleep(15);
        return dbName();
      }),
      runWithTenant(t2, dbName),
      runWithTenant(t2, async () => {
        await sleep(5);
        return (await db.query.Program.findMany({ limit: 1 })) && dbName();
      }),
    ]);
    expect([a, b, c]).toEqual([process.env.DB_NAME, misDbNameFor(2), misDbNameFor(2)]);
  });

  it("enforce mode throws TenantContextMissing without a context; shadow uses tenant 1", async () => {
    expect(await dbName()).toBe(process.env.DB_NAME); // shadow default
    setTenancyMode("enforce");
    expect(() => db.select()).toThrow(TenantContextMissing);
    expect(() => db.execute(sql`SELECT 1`)).toThrow(TenantContextMissing);
    expect(() => activityPool()).toThrow(TenantContextMissing);
    expect(await runWithTenant(t2, dbName)).toBe(misDbNameFor(2));
  });

  it("refuses tenant data inside runAsPlatform, in every mode", () => {
    expect(() => runAsPlatform(() => db.select())).toThrow(TenantContextMissing);
  });

  it("keeps a transaction (commit and rollback) inside its tenant", async () => {
    const name = `MT-TX-${stamp}`;
    const id = await runWithTenant(t2, nextProgramId);
    await runWithTenant(t2, () =>
      db.transaction(async (tx) => {
        await tx.insert(Program).values({ program_id: id, name });
        const inTx: any = await tx.execute(sql`SELECT DATABASE() AS d`);
        expect(inTx[0][0].d).toBe(misDbNameFor(2));
      }),
    );
    await expect(
      runWithTenant(t2, () =>
        db.transaction(async (tx) => {
          await tx.insert(Program).values({ program_id: id + 1, name: `${name}-rolled-back` });
          throw new Error("rollback");
        }),
      ),
    ).rejects.toThrow("rollback");
    const inT2 = await runWithTenant(t2, () => db.select().from(Program).where(eq(Program.program_id, id)));
    const inT1 = await runWithTenant(t1, () => db.select().from(Program).where(eq(Program.name, name)));
    const rolled = await runWithTenant(t2, () => db.select().from(Program).where(eq(Program.name, `${name}-rolled-back`)));
    expect(inT2).toHaveLength(1);
    expect(inT1).toHaveLength(0);
    expect(rolled).toHaveLength(0);
    // the analytics pool is routed the same way
    const [rows]: any = await runWithTenant(t2, () => activityPool().query("SELECT DATABASE() AS d"));
    expect(rows[0].d).toBe(misDbNameFor(2));
  });
});

// ---------------------------------------------------------------------------
describe("(c)(d) sign-in resolver and token contract v2", () => {
  const shared = `mt.shared.${stamp}@example.com`;
  const same = `mt.same.${stamp}@example.com`;
  const only2 = `mt.only2.${stamp}@example.com`;
  let c2: { userId: number; username: string };

  beforeAll(async () => {
    const a1 = await runWithTenant(t1, () => createAccount(shared, "pw-one-111"));
    const a2 = await runWithTenant(t2, () => createAccount(shared, "pw-two-222"));
    const s1 = await runWithTenant(t1, () => createAccount(same, "pw-same-333"));
    const s2 = await runWithTenant(t2, () => createAccount(same, "pw-same-333"));
    c2 = await runWithTenant(t2, () => createAccount(only2, "pw-c-444"));
    await syncDirectoryUser(a1.userId, 1);
    await syncDirectoryUser(a2.userId, 2);
    await syncDirectoryUser(s1.userId, 1);
    await syncDirectoryUser(s2.userId, 2);
    await syncDirectoryUser(c2.userId, 2);
  });

  const login = (body: Record<string, unknown>) => request(app).post("/auth/login").send(body);
  const tidOf = (token: string) => (jwt.decode(token) as any)?.tid;

  it("routes an identifier known to one school there", async () => {
    const res = await login({ username: only2, password: "pw-c-444" });
    expect(res.status).toBe(200);
    expect(tidOf(res.body.data.tempToken)).toBe(2);
    expect(res.body.data.tenant).toMatchObject({ tid: 2, slug: SLUG2 });
  });

  it("narrows several schools by password, and asks to choose when still ambiguous", async () => {
    expect(tidOf((await login({ username: shared, password: "pw-two-222" })).body.data.tempToken)).toBe(2);
    expect(tidOf((await login({ username: shared, password: "pw-one-111" })).body.data.tempToken)).toBe(1);
    const wrong = await login({ username: shared, password: "nope-nope" });
    expect(wrong.status).toBe(401);

    const res = await login({ username: same, password: "pw-same-333" });
    expect(res.status).toBe(200);
    expect(res.body.data.tempToken).toBeUndefined();
    expect(res.body.choose.map((c: any) => c.tid)).toEqual([1, 2]);
    expect(res.body.data.choose[1]).toEqual({ tid: 2, name: t2.name, slug: SLUG2 });
  });

  it("accepts an explicit tenant (slug or tid)", async () => {
    expect(tidOf((await login({ username: same, password: "pw-same-333", tenant: SLUG2 })).body.data.tempToken)).toBe(2);
    expect(tidOf((await login({ username: same, password: "pw-same-333", tenant: "1" })).body.data.tempToken)).toBe(1);
    const unknown = await login({ username: same, password: "pw-same-333", tenant: "no-such-school" });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("TENANT_UNKNOWN");
  });

  it("falls back to tenant 1 for identifiers the directory does not know", async () => {
    const email = `mt.unindexed.${stamp}@example.com`;
    await runWithTenant(t1, () => createAccount(email, "pw-legacy-555"));
    const res = await login({ username: email, password: "pw-legacy-555" });
    expect(tidOf(res.body.data.tempToken)).toBe(1);
  });

  it("forgot-password answers the same for 0, 1 or 2 schools and sends one code per school", async () => {
    const shape = (b: any) => ({ ...b, timestamp: undefined, data: { ...b.data, tempToken: typeof b.data?.tempToken } });
    const none = await request(app).post("/auth/forgot-password").send({ email: `mt.nobody.${stamp}@example.com` });
    const one = await request(app).post("/auth/forgot-password").send({ email: only2 });
    const two = await request(app).post("/auth/forgot-password").send({ email: same });
    for (const r of [none, one, two]) expect(r.status).toBe(200);
    expect(shape(one.body)).toEqual(shape(none.body));
    expect(shape(two.body)).toEqual(shape(none.body));
    expect(two.body.choose).toBeUndefined();
    // Opaque and fixed-length: nothing about the user or the school can be read off it.
    expect(jwt.decode(two.body.data.tempToken)).toBeNull();
    expect(new Set([none, one, two].map((r) => r.body.data.tempToken.length)).size).toBe(1);

    // One code per school that knows the address, each only valid in its own school.
    const codeIn = async (t: TenantCtx, email: string) => {
      for (let i = 0; i < 50; i++) {
        const rows: any = await runWithTenant(t, () =>
          db.execute(sql`SELECT o.otp_code FROM OTP o JOIN User u ON u.user_id = o.user_id WHERE u.email = ${email} AND o.otp_type = 'PASSWORD_RESET' AND o.is_used = 0 ORDER BY o.otp_id DESC LIMIT 1`),
        );
        if (rows[0][0]) return String(rows[0][0].otp_code);
        await sleep(20);
      }
      return null;
    };
    const code1 = await codeIn(t1, same);
    const code2 = await codeIn(t2, same);
    expect(code1).toBeTruthy();
    expect(code2).toBeTruthy();
    const verify = (ticket: string, otp: string) =>
      request(app).post("/auth/verify-reset-otp").set("Authorization", `Bearer ${ticket}`).send({ otp });
    const ok2 = await verify(two.body.data.tempToken, code2!);
    expect(ok2.status).toBe(200);
    expect(tidOf(ok2.body.data.resetToken)).toBe(2);
    // The unknown address's ticket opens nothing.
    expect((await verify(none.body.data.tempToken, code1!)).status).toBe(401);
    const ok1 = await verify(two.body.data.tempToken, code1!);
    expect(tidOf(ok1.body.data.resetToken)).toBe(1);
  });

  it("puts tid/tslug/tstatus/pkg in the session token and tenant in verify, users/me and access/me", async () => {
    const first = await login({ username: only2, password: "pw-c-444" });
    const otp = first.body.data.devOtp;
    expect(otp).toBeTruthy();
    const done = await request(app)
      .post("/auth/verify-otp")
      .set("Authorization", `Bearer ${first.body.data.tempToken}`)
      .send({ otp });
    expect(done.status).toBe(200);
    const token = done.body.data.token;
    expect(jwt.decode(token)).toMatchObject({ userId: c2.userId, tid: 2, tslug: SLUG2, tstatus: "ACTIVE", pkg: t2.pkg });
    expect(done.body.data.tenant).toMatchObject({ tid: 2, slug: SLUG2, isPrimary: false });

    const verify = await request(app).get("/auth/verify").set("Authorization", `Bearer ${token}`);
    expect(verify.status).toBe(200);
    expect(verify.body.data.tenant).toEqual({ tid: 2, slug: SLUG2, name: t2.name, status: "ACTIVE", isPrimary: false, timezone: t2.timezone, pkg: t2.pkg });

    const me = await request(app).get("/users/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.user_id).toBe(c2.userId);
    expect(me.body.data.tenant.tid).toBe(2);

    const access = await request(app).get("/access/me?app=mis").set("Authorization", `Bearer ${token}`);
    expect(access.status).toBe(200);
    expect(access.body.data.user.school_id).toBe(2);
    expect(access.body.data.tenant.tid).toBe(2);
  });

  it("treats a legacy token (no tid) as tenant 1, and rejects it when TENANCY_LEGACY_DEFAULT_TID=none", async () => {
    const u = await runWithTenant(t1, () => createAccount(`mt.legacy.${stamp}@example.com`, "pw-legacy-666"));
    const legacy = tokenFor(u.userId);
    const ok = await request(app).get("/auth/verify").set("Authorization", `Bearer ${legacy}`);
    expect(ok.body.data.tenant.tid).toBe(1);
    expect((await request(app).get("/access/me").set("Authorization", `Bearer ${legacy}`)).body.data.user.school_id).toBe(1);
    process.env.TENANCY_LEGACY_DEFAULT_TID = "none";
    try {
      const refused = await request(app).get("/auth/verify").set("Authorization", `Bearer ${legacy}`);
      expect(refused.status).toBe(401);
      expect(refused.body.code).toBe("TENANT_REQUIRED");
    } finally {
      delete process.env.TENANCY_LEGACY_DEFAULT_TID;
    }
  });

  it("gates on tenant status and on X-NGA-Tenant mismatch", async () => {
    const token = tokenFor(c2.userId, 2);
    const mismatch = await request(app).get("/auth/verify").set("Authorization", `Bearer ${token}`).set("X-NGA-Tenant", "1");
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.code).toBe("TENANT_MISMATCH");
    const unknown = await request(app).get("/auth/verify").set("Authorization", `Bearer ${tokenFor(c2.userId, 987654)}`);
    expect(unknown.status).toBe(401);
    expect(unknown.body.code).toBe("TENANT_UNKNOWN");
    await controlPool().query("UPDATE Tenant SET status = 'SUSPENDED' WHERE tenant_id = 2");
    invalidateTenants();
    try {
      const suspended = await request(app).get("/auth/verify").set("Authorization", `Bearer ${token}`);
      expect(suspended.status).toBe(403);
      expect(suspended.body.code).toBe("TENANT_SUSPENDED");
      await controlPool().query("UPDATE Tenant SET status = 'PENDING' WHERE tenant_id = 2");
      invalidateTenants();
      expect((await request(app).get("/auth/verify").set("Authorization", `Bearer ${token}`)).body.code).toBe("TENANT_PENDING");
    } finally {
      await controlPool().query("UPDATE Tenant SET status = 'ACTIVE' WHERE tenant_id = 2");
      invalidateTenants();
    }
  });

  it("logout tokens carry tid", async () => {
    const { buildLogoutToken } = await import("../services/sso/backchannelLogout");
    const tok = runWithTenant(t2, () => buildLogoutToken(c2.userId, "client-x"));
    if (tok) expect(jwt.decode(tok)).toMatchObject({ sub: String(c2.userId), tid: 2 });
  });
});

// ---------------------------------------------------------------------------
describe("(e)(f) SSO apps and service auth per tenant", () => {
  const clientId = `mt-client-${stamp}`;
  const secret = "mt-s3cret-value";
  let systemId: number;
  let user2: number;
  let user1: number;

  beforeAll(async () => {
    const [res] = (await primaryDb().insert(System).values({
      name: `MT App ${stamp}`,
      client_id: clientId,
      client_secret: secret,
      allowed_redirect_uris: "http://localhost/cb",
      icon_url: "x",
      home_url: "http://localhost",
      status: "ACTIVE",
    } as any)) as any;
    systemId = res.insertId;
    await writeSystemScopes(systemId, null);
    user2 = (await runWithTenant(t2, () => createAccount(`mt.sso2.${stamp}@example.com`, "pw-sso-2"))).userId;
    user1 = (await runWithTenant(t1, () => createAccount(`mt.sso1.${stamp}@example.com`, "pw-sso-1"))).userId;
  });

  afterAll(async () => {
    await unassignSystem(2, systemId).catch(() => undefined);
    await unassignSystem(1, systemId).catch(() => undefined);
  });

  const authorize = (token: string) =>
    request(app)
      .get(`/sso/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent("http://localhost/cb")}&response_type=code`)
      .set("Authorization", `Bearer ${token}`)
      .set("User-Agent", "Mozilla/5.0");
  const basic = `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;

  it("refuses /sso/authorize for an app the tenant does not have, then works once assigned", async () => {
    const refused = await authorize(tokenFor(user2, 2));
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("SYSTEM_NOT_ASSIGNED");

    // No implicit "the primary has every System": tenant 1 needs its own row too.
    const notYet = await authorize(tokenFor(user1, 1));
    expect(notYet.status).toBe(403);
    expect(notYet.body.code).toBe("SYSTEM_NOT_ASSIGNED");
    await assignSystem(1, systemId);
    // Tenant 1's codes keep the legacy shape.
    const primary = await authorize(tokenFor(user1, 1));
    expect(primary.status).toBe(200);
    expect(primary.body.data.code).toMatch(/^[0-9a-f]{64}$/);

    await assignSystem(2, systemId);
    const ok = await authorize(tokenFor(user2, 2));
    expect(ok.status).toBe(200);
    expect(ok.body.data.code.startsWith("2.")).toBe(true);

    const exchanged = await request(app).post("/sso/token").send({ code: ok.body.data.code, client_id: clientId, client_secret: secret });
    expect(exchanged.status).toBe(200);
    expect(jwt.decode(exchanged.body.data.token)).toMatchObject({ userId: user2, tid: 2, tslug: SLUG2, tstatus: "ACTIVE", aud: clientId });
    expect(exchanged.body.data.tenant).toMatchObject({ tid: 2, slug: SLUG2 });
    const again = await request(app).post("/sso/token").send({ code: ok.body.data.code, client_id: clientId, client_secret: secret });
    expect(again.status).toBe(401);
  });

  it("filters the public systems list per tenant", async () => {
    const { getPublicSystems } = await import("../utils/publicSystems");
    await unassignSystem(2, systemId);
    expect((await runWithTenant(t2, () => getPublicSystems())).some((s) => s.system_id === systemId)).toBe(false);
    expect((await runWithTenant(t1, () => getPublicSystems())).some((s) => s.system_id === systemId)).toBe(true);
    await assignSystem(2, systemId);
    expect((await runWithTenant(t2, () => getPublicSystems())).some((s) => s.system_id === systemId)).toBe(true);
  });

  it("GET /platform/tenants/active lists every tenant (contract §4); missing header = tenant 1", async () => {
    const res = await request(app).get("/platform/tenants/active").set("Authorization", basic);
    expect(res.status).toBe(200);
    const two = res.body.tenants.find((t: any) => t.tid === 2);
    expect(two).toEqual({ tid: 2, slug: SLUG2, name: t2.name, status: "ACTIVE", isPrimary: false, timezone: t2.timezone, pkg: t2.pkg });
    expect(res.body.tenants.find((t: any) => t.tid === 1)).toMatchObject({ tid: 1, isPrimary: true });
  });

  it("applies the X-NGA-Tenant rules to Basic client credentials", async () => {
    await unassignSystem(2, systemId);
    const notAssigned = await request(app).get("/platform/tenants/active").set("Authorization", basic).set("X-NGA-Tenant", "2");
    expect(notAssigned.status).toBe(403);
    expect(notAssigned.body.code).toBe("SYSTEM_NOT_ASSIGNED");
    await assignSystem(2, systemId);
    expect((await request(app).get("/platform/tenants/active").set("Authorization", basic).set("X-NGA-Tenant", "2")).status).toBe(200);

    const bad = await request(app).get("/platform/tenants/active").set("Authorization", basic).set("X-NGA-Tenant", "abc");
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("TENANT_REQUIRED");
    const unknown = await request(app).get("/platform/tenants/active").set("Authorization", basic).set("X-NGA-Tenant", "987654");
    expect(unknown.status).toBe(401);
    expect(unknown.body.code).toBe("TENANT_UNKNOWN");

    process.env.TENANCY_REQUIRE_TENANT_HEADER = "true";
    const missing = await request(app).get("/platform/tenants/active").set("Authorization", basic);
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("TENANT_REQUIRED");
  });

  it("enforces System.scopes when set (legacy NULL = every scope)", async () => {
    await writeSystemScopes(systemId, ["sync:read"]);
    try {
      const refused = await request(app).get("/platform/tenants/active").set("Authorization", basic);
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe("FORBIDDEN");
      expect((await request(app).get("/integrations/ping").set("Authorization", basic)).status).toBe(200);
    } finally {
      await writeSystemScopes(systemId, null);
    }
  });

  it("binds an integration token to its school (403 TENANT_MISMATCH)", async () => {
    const raw = `mt_${crypto.randomBytes(16).toString("hex")}`;
    await primaryDb().insert(IntegrationToken).values({
      name: `MT ${stamp}`,
      token_hash: crypto.createHash("sha256").update(raw, "utf8").digest("hex"),
      token_prefix: raw.slice(0, 8),
      scopes: "tenants:read,sync:read",
      school_id: null,
    } as any);
    const auth = `Bearer ${raw}`;
    expect((await request(app).get("/platform/tenants/active").set("Authorization", auth)).status).toBe(200);
    const other = await request(app).get("/platform/tenants/active").set("Authorization", auth).set("X-NGA-Tenant", "2");
    expect(other.status).toBe(403);
    expect(other.body.code).toBe("TENANT_MISMATCH");
  });

  it("runs the service handler inside the header's tenant", async () => {
    const name = `MT-SVC-${stamp}`;
    const id = await runWithTenant(t2, nextProgramId);
    await runWithTenant(t2, () => db.insert(Program).values({ program_id: id, name }));
    const two = await request(app).get("/integrations/sync/reference").set("Authorization", basic).set("X-NGA-Tenant", "2");
    expect(two.status).toBe(200);
    expect(JSON.stringify(two.body)).toContain(name);
    const one = await request(app).get("/integrations/sync/reference").set("Authorization", basic);
    expect(one.status).toBe(200);
    expect(JSON.stringify(one.body)).not.toContain(name);
  });

  it("hashes SSO client secrets at rest when a System is created", async () => {
    const admin = await runWithTenant(t1, () => createAccount(`mt.sysadmin.${stamp}@example.com`, "pw-admin-1"));
    await runWithTenant(t1, async () => assignRole(admin.userId, await createRoleWithPermissions("MT_SYS", ["MANAGE_SYSTEMS"])));
    const res = await request(app)
      .post("/systems")
      .set("Authorization", `Bearer ${tokenFor(admin.userId, 1)}`)
      .send({ name: `MT Hashed ${stamp}`, client_id: `mt-hashed-${stamp}`, icon_url: "x", home_url: "http://localhost" });
    expect(res.status).toBe(201);
    const plain = res.body.data.client_secret;
    const [row] = await primaryDb().select().from(System).where(eq(System.client_id, `mt-hashed-${stamp}`));
    expect(row.client_secret).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(plain, row.client_secret!)).toBe(true);

    // A school other than the primary can't manage Systems.
    const other = await runWithTenant(t2, () => createAccount(`mt.sysadmin2.${stamp}@example.com`, "pw-admin-2"));
    await runWithTenant(t2, async () => assignRole(other.userId, await createRoleWithPermissions("MT_SYS2", ["MANAGE_SYSTEMS"])));
    const refused = await request(app)
      .post("/systems")
      .set("Authorization", `Bearer ${tokenFor(other.userId, 2)}`)
      .send({ name: `MT Nope ${stamp}`, client_id: `mt-nope-${stamp}`, icon_url: "x", home_url: "http://localhost" });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("PLATFORM_ONLY");
  });
});

// ---------------------------------------------------------------------------
describe("(g) provisioning and the per-tenant migration runner", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-migrations-"));

  afterAll(async () => {
    await controlPool().query("DELETE FROM TenantMigration WHERE app = 'mis-test'");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates an isolated database with catalogs and none of tenant 1's people", async () => {
    expect(fresh2).toMatchObject({ ok: true, tid: 2, created: true, database: misDbNameFor(2) });
    expect(fresh2.tablesCreated).toBeGreaterThan(100);
    expect(fresh2.catalogRows.Permission).toBeGreaterThan(0);
    expect(fresh2.baselined).toBeGreaterThan(0);

    // Counted right after provisioning, before the tests above added tenant 2 rows.
    const [t1Users] = await runWithTenant(t1, () => db.execute(sql`SELECT COUNT(*) AS n FROM User`)) as any;
    const [perms] = await runWithTenant(t2, () => db.execute(sql`SELECT COUNT(*) AS n FROM Permission`)) as any;
    const [roles] = await runWithTenant(t2, () => db.execute(sql`SELECT name, platform_only FROM Role WHERE is_preset = 1`)) as any;
    const settingRows = async (table: string) => {
      const [has]: any = await controlPool().query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", [misDbNameFor(2), table]);
      if (!Number(has[0].n)) return 0;
      const [rows]: any = await runWithTenant(t2, () => db.execute(sql.raw(`SELECT COUNT(*) AS n FROM \`${table}\``)));
      return Number(rows[0].n);
    };
    const [schools] = await runWithTenant(t2, () => db.execute(sql`SELECT school_id, name FROM School`)) as any;
    const [leaked] = await runWithTenant(t2, () =>
      db.execute(sql`SELECT COUNT(*) AS n FROM User WHERE email NOT LIKE 'mt.%' AND username NOT LIKE 'mt_%'`),
    ) as any;
    expect(Number(t1Users[0].n)).toBeGreaterThan(0);
    expect(Number(leaked[0].n)).toBe(0); // only accounts these tests created in tenant 2
    expect(Number(perms[0].n)).toBeGreaterThan(0);
    // The shared presets, but never the platform owner's (platform_only) ones.
    expect(roles.length).toBeGreaterThan(0);
    expect(roles.filter((r: any) => Number(r.platform_only) === 1)).toEqual([]);
    expect(fresh2.catalogRows.Role ?? 0).toBeGreaterThan(0);
    // The school still gets its own SUPER_ADMIN: a plain school role, never the platform preset.
    const [superAdmin] = await runWithTenant(t2, () =>
      db.execute(sql`SELECT preset_key, platform_only, allowed_scope_types FROM Role WHERE name = 'SUPER_ADMIN'`),
    ) as any;
    expect(superAdmin).toEqual([{ preset_key: null, platform_only: 0, allowed_scope_types: "SCHOOL" }]);
    // NGA's own analytics / office-hour settings are not copied: code defaults apply.
    expect([await settingRows("AnalyticsSetting"), await settingRows("OfficeHourSetting")]).toEqual([0, 0]);
    expect(schools).toEqual([{ school_id: 2, name: t2.name }]);

    const [defaults]: any = await controlPool().query(
      "SELECT COLUMN_DEFAULT AS d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'school_id' AND TABLE_NAME IN ('AccessGrant','AccessRule','Department')",
      [misDbNameFor(2)],
    );
    expect(defaults.map((r: any) => String(r.d))).toEqual(["2", "2", "2"]);
    const [fks]: any = await controlPool().query(
      "SELECT COUNT(*) AS n FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND REFERENCED_TABLE_NAME = 'System'",
      [misDbNameFor(2)],
    );
    expect(Number(fks[0].n)).toBe(0);

    const again = await provisionMisTenant(2);
    expect(again).toMatchObject({ created: false, tablesCreated: 0, baselined: 0 });
    expect(again.catalogRows.Permission).toBeUndefined(); // never re-seeded
    await expect(provisionMisTenant(1)).rejects.toThrow(/primary/);
  }, 120_000);

  it("applies generic files to every tenant and primary-only files to tenant 1 only", async () => {
    const g = `_mt_probe_generic_${stamp}`;
    const p = `_mt_probe_primary_${stamp}`;
    fs.writeFileSync(path.join(tmpDir, "900_generic.sql"), `-- @tenant: generic\nCREATE TABLE IF NOT EXISTS \`${g}\` (id INT);\n`);
    fs.writeFileSync(path.join(tmpDir, "901_fix.sql"), `-- NGA data fix\n-- @tenant: primary-only\nCREATE TABLE IF NOT EXISTS \`${p}\` (id INT);\n`);
    const opts = { dir: tmpDir, app: "mis-test", tids: [1, 2] };
    const dry = await runTenantMigrations({ ...opts, dryRun: true });
    expect(dry.find((r) => r.tid === 2)!.applied).toEqual(["900_generic.sql"]);

    const reports = await runTenantMigrations(opts);
    expect(reports.find((r) => r.tid === 1)).toMatchObject({ applied: ["900_generic.sql", "901_fix.sql"], skipped: [] });
    expect(reports.find((r) => r.tid === 2)).toMatchObject({ applied: ["900_generic.sql"], skipped: ["901_fix.sql"] });
    const second = await runTenantMigrations(opts);
    expect(second.every((r) => r.applied.length === 0 && r.skipped.length === 0)).toBe(true);

    const has = async (schema: string, table: string) =>
      Number(((await controlPool().query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", [schema, table])) as any)[0][0].n);
    expect(await has(process.env.DB_NAME!, g)).toBe(1);
    expect(await has(process.env.DB_NAME!, p)).toBe(1);
    expect(await has(misDbNameFor(2), g)).toBe(1);
    expect(await has(misDbNameFor(2), p)).toBe(0);
    await runWithTenant(t1, () => db.execute(sql.raw(`DROP TABLE IF EXISTS \`${g}\`, \`${p}\``)));
    await runWithTenant(t2, () => db.execute(sql.raw(`DROP TABLE IF EXISTS \`${g}\``)));
  }, 60_000);
});

// ---------------------------------------------------------------------------
describe("(h) canary: tenant 1 data never reaches a tenant 2 user", () => {
  const canary = `CANARY-A-${stamp}`;
  let admin2: number;
  let admin1: number;

  beforeAll(async () => {
    // Tenant 2's admin; tenant 1 gets canary rows -- including a document owned
    // by tenant 1's account with the SAME user id, the collision DB-per-tenant prevents.
    admin2 = (await runWithTenant(t2, () => createAccount(`mt.admin2.${stamp}@example.com`, "pw-admin-22"))).userId;
    await runWithTenant(t2, async () =>
      assignRole(admin2, await createRoleWithPermissions("MT_ADMIN2", ["MANAGE_USERS", "VIEW_USERS", "MANAGE_ACADEMICS"])),
    );
    admin1 = (await runWithTenant(t1, () => createAccount(`mt.admin1.${stamp}@example.com`, "pw-admin-11"))).userId;
    await runWithTenant(t1, async () =>
      assignRole(admin1, await createRoleWithPermissions("MT_ADMIN1", ["MANAGE_USERS", "VIEW_USERS", "MANAGE_ACADEMICS"])),
    );
    await runWithTenant(t1, async () => {
      const [owner] = await db.select({ id: User.user_id }).from(User).where(eq(User.user_id, admin2));
      if (!owner) await db.insert(User).values({ user_id: admin2, username: `${canary}-owner`.toLowerCase(), email: `${stamp}.owner@canary.test`, status: "ACTIVE" } as any);
      await db.insert(User).values({ username: canary.toLowerCase(), email: `${stamp}@canary.test`, status: "ACTIVE" });
      await db.insert(Program).values({ program_id: await nextProgramId(), name: canary });
      await db.insert(Document).values({
        user_id: admin2,
        file_name: `${canary}.pdf`,
        original_name: `${canary}.pdf`,
        file_path: `canary/${canary}.pdf`,
        file_size: 1,
        mime_type: "application/pdf",
        file_extension: "pdf",
      });
    });
  });

  const ROUTES = ["/users?limit=500", "/academics/programs", "/documents", "/users/me", "/access/me?app=mis", "/auth/session"];

  it("is visible to tenant 1 (control)", async () => {
    const programs = await request(app).get("/academics/programs").set("Authorization", `Bearer ${tokenFor(admin1, 1)}`);
    expect(JSON.stringify(programs.body)).toContain(canary);
  });

  it.each(ROUTES)("is absent from %s for a tenant 2 user", async (route) => {
    const res = await request(app).get(route).set("Authorization", `Bearer ${tokenFor(admin2, 2)}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body).toUpperCase()).not.toContain(canary.toUpperCase());
  });

  it("is absent even in enforce mode, where nothing can fall back to tenant 1", async () => {
    setTenancyMode("enforce");
    for (const route of ["/academics/programs", "/documents", "/users/me"]) {
      const res = await request(app).get(route).set("Authorization", `Bearer ${tokenFor(admin2, 2)}`);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(canary);
    }
  });
});

// ===========================================================================
// Phase 3: jobs, activity, files, settings, branding, config (MIS-A14..A16, S1..S10, A18)
// ===========================================================================
describe("(i) background jobs run once per tenant", () => {
  it("runs the body in each tenant's context and isolates a failing tenant", async () => {
    const { runForEachTenant } = await import("../tenancy/jobs");
    const seen: Array<{ tid: number; ctx: number; db: string }> = [];
    const r = await runForEachTenant(
      "mt-test-job",
      async (t) => {
        seen.push({ tid: t.tid, ctx: (await import("../vendor/nga-tenancy")).currentTid(), db: await dbName() });
        if (t.tid === 1) throw new Error("tenant 1 is broken today");
      },
      { jitterMs: 0, onError: () => undefined },
    );
    expect(r.failed).toEqual([1]);
    expect(r.ran).toContain(2);
    const two = seen.find((s) => s.tid === 2)!;
    expect(two).toEqual({ tid: 2, ctx: 2, db: misDbNameFor(2) });
    expect(seen.find((s) => s.tid === 1)!.db).toBe(process.env.DB_NAME);
    expect(seen.filter((s) => s.tid === 2)).toHaveLength(1);
  });

  it("locks per (job, tid): an overlapping tick skips that tenant only", async () => {
    const { runForEachTenant, isJobRunning } = await import("../tenancy/jobs");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = runForEachTenant("mt-lock-job", async (t) => {
      if (t.tid === 1) await gate;
    }, { jitterMs: 0 });
    await sleep(10);
    expect(isJobRunning("mt-lock-job", 1)).toBe(true);
    const second = await runForEachTenant("mt-lock-job", () => undefined, { jitterMs: 0 });
    expect(second.skipped).toEqual([1]);
    release();
    const done = await first;
    expect(done.ran).toEqual(expect.arrayContaining([1, 2]));
  });

  it("skips tenants that are not schedulable", async () => {
    const { runForEachTenant } = await import("../tenancy/jobs");
    await controlPool().query("UPDATE Tenant SET status = 'SUSPENDED' WHERE tenant_id = 2");
    invalidateTenants();
    try {
      const r = await runForEachTenant("mt-suspended-job", () => undefined, { jitterMs: 0 });
      expect(r.ran).not.toContain(2);
    } finally {
      await controlPool().query("UPDATE Tenant SET status = 'ACTIVE' WHERE tenant_id = 2");
      invalidateTenants();
    }
  });

  it("keeps in-process state per tenant (TenantScopedMap, tenantLocal)", async () => {
    const { TenantScopedMap, tenantLocal } = await import("../tenancy/scoped");
    const m = new TenantScopedMap<number, string>();
    runWithTenant(t1, () => m.set(7, "one"));
    runWithTenant(t2, () => m.set(7, "two"));
    expect(runWithTenant(t1, () => m.get(7))).toBe("one");
    expect(runWithTenant(t2, () => m.get(7))).toBe("two");
    expect(runWithTenant(t2, () => [...m.keys()])).toEqual([7]);
    const counter = tenantLocal(() => ({ n: 0 }));
    runWithTenant(t2, () => (counter().n += 5));
    expect(runWithTenant(t1, () => counter().n)).toBe(0);
    setTenancyMode("enforce");
    expect(() => m.get(7)).toThrow(TenantContextMissing);
  });
});

// ---------------------------------------------------------------------------
describe("(j) activity ingest groups multi-tenant relay batches by tid", () => {
  const clientId = `mt_relay_${stamp}`;
  const secret = "mt-relay-secret";
  let systemId: number;
  const basic = `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;

  beforeAll(async () => {
    process.env.ACTIVITY_SOURCE_CLIENTS = `${clientId}=tupo`;
    const [res] = (await primaryDb().insert(System).values({
      name: `MT Relay ${stamp}`, client_id: clientId, client_secret: secret, allowed_redirect_uris: "http://localhost",
      icon_url: "x", home_url: "http://localhost", status: "ACTIVE",
    } as any)) as any;
    systemId = res.insertId;
    await writeSystemScopes(systemId, null);
    // Batches without tid speak for tenant 1: the System must be assigned there explicitly.
    await assignSystem(1, systemId);
  });
  afterAll(async () => {
    delete process.env.ACTIVITY_SOURCE_CLIENTS;
    await unassignSystem(2, systemId).catch(() => undefined);
    await unassignSystem(1, systemId).catch(() => undefined);
  });

  const se = (did: string, tid?: number) => ({ ...(tid ? { tid } : {}), id: ulid(), n: "tupo.message.send", t: Date.now(), did });
  const post = (body: unknown) =>
    request(app).post("/activity/ingest").set("Authorization", basic).set("Content-Type", "application/json").send(JSON.stringify(body));
  const eventsIn = async (t: TenantCtx, did: string) =>
    runWithTenant(t, async () => {
      const [rows]: any = await activityPool().query("SELECT name FROM AnalyticsEvent WHERE device_id = ?", [did]);
      return rows.length as number;
    });

  it("refuses the events of a school the System is not enabled for, and keeps the rest", async () => {
    const d1 = newDeviceId();
    const d2 = newDeviceId();
    const r = await post({ batches: [], server_events: [se(d1), se(d2, 2), se(d2, 987654)] });
    expect(r.status).toBe(202);
    expect(r.body.accepted).toBe(1);
    expect(r.body.rejected).toBe(2);
    expect(r.body.refused).toEqual(expect.arrayContaining([{ tid: 2, code: "SYSTEM_NOT_ASSIGNED" }, { tid: 987654, code: "TENANT_UNKNOWN" }]));
    const { flushActivity } = await import("../services/activity/writer");
    await flushActivity();
    expect(await eventsIn(t1, d1)).toBe(1);
    expect(await eventsIn(t2, d2)).toBe(0);
    expect(await eventsIn(t1, d2)).toBe(0);
  });

  it("writes each group into its own school's database once assigned", async () => {
    await assignSystem(2, systemId);
    const d1 = newDeviceId();
    const d2 = newDeviceId();
    const r = await post({ batches: [], server_events: [se(d1), se(d2, 2), se(d2, 2), se(d1, 1)] });
    expect(r.body).toMatchObject({ accepted: 4, rejected: 0 });
    const { flushActivity } = await import("../services/activity/writer");
    await flushActivity();
    expect(await eventsIn(t1, d1)).toBe(2);
    expect(await eventsIn(t2, d2)).toBe(2);
    expect(await eventsIn(t1, d2)).toBe(0);
    expect(await eventsIn(t2, d1)).toBe(0);
  });

  it("the vendored relay stamps tid from the current tenant", async () => {
    const { createActivityRelay } = await import("../vendor/nga-activity-relay/relay");
    const sent: any[] = [];
    const relay = createActivityRelay({
      app: "tupo", misBaseUrl: "http://mis.test", clientId, clientSecret: secret, origins: [], getUserId: () => 5,
      currentTenant: currentTenantOrNull,
      flushMs: 3_600_000,
      fetchImpl: (async (_url: string, init: any) => {
        sent.push({ headers: init.headers, body: JSON.parse(zlib.gunzipSync(init.body).toString()) });
        return new Response(JSON.stringify({ accepted: 1 }), { status: 202 });
      }) as any,
    });
    runWithTenant(t2, () => relay.track(5, null, "tupo.message.send"));
    runWithTenant(t1, () => relay.track(5, null, "tupo.message.send"));
    await relay.flush();
    await relay.stop();
    expect(sent[0].body.server_events.map((e: any) => e.tid)).toEqual([2, 1]);
    expect(sent[0].headers["X-NGA-Tenant"]).toBeUndefined(); // mixed batch: per-event tid only
  });
});

// ---------------------------------------------------------------------------
describe("(k) file storage is namespaced per tenant", () => {
  const calls: string[] = [];
  let spy: any;
  beforeAll(() => {
    spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) => {
      const u = new URL(String(url));
      const p = u.searchParams.get("path") ?? (init?.body instanceof FormData ? String(init.body.get("path")) : "");
      calls.push(`${init?.method ?? "GET"} ${p}`);
      if (p === "nga_central_mis/legacy-only.txt") return new Response("old bytes", { status: 200 });
      if (init?.method === "POST") return new Response("{}", { status: 201 });
      return new Response("nope", { status: 404 });
    });
  });
  afterAll(() => spy?.mockRestore());

  it("writes new files under nga_central_mis/t/<tid>/", async () => {
    const storage = (await import("../utils/fileServer")).default;
    calls.length = 0;
    await runWithTenant(t2, () => storage.uploadFile(Buffer.from("x"), "x/new.txt"));
    await runWithTenant(t1, () => storage.uploadFile(Buffer.from("x"), "x/new.txt"));
    expect(calls).toEqual(["POST nga_central_mis/t/2/x/new.txt", "POST nga_central_mis/t/1/x/new.txt"]);
  });

  it("reads tenant 1's pre-tenancy paths as a fallback, never another tenant's", async () => {
    const storage = (await import("../utils/fileServer")).default;
    calls.length = 0;
    const old = await runWithTenant(t1, () => storage.downloadToBuffer("legacy-only.txt"));
    expect(old.toString()).toBe("old bytes");
    expect(calls).toEqual(["GET nga_central_mis/t/1/legacy-only.txt", "GET nga_central_mis/legacy-only.txt"]);
    calls.length = 0;
    await expect(runWithTenant(t2, () => storage.downloadToBuffer("legacy-only.txt"))).rejects.toThrow(/404/);
    expect(calls).toEqual(["GET nga_central_mis/t/2/legacy-only.txt"]);
  });

  it("keys derivative dedup by (tid, sha): another school's derivative is invisible", async () => {
    const { FileDerivative } = await import("../db/schema");
    const { derivativesOf } = await import("../services/files/assets");
    const sha = crypto.createHash("sha256").update(`mt-${stamp}`).digest("hex");
    await runWithTenant(t1, () =>
      db.insert(FileDerivative).values({ sha256: sha, variant: "PDF", storage_path: `elearning/derivatives/${sha}/pdf.pdf`, size_bytes: 1 } as any),
    );
    expect(Object.keys(await runWithTenant(t1, () => derivativesOf(sha)))).toEqual(["PDF"]);
    expect(await runWithTenant(t2, () => derivativesOf(sha))).toEqual({});
    const { namespaced } = await import("../utils/fileServer");
    expect(namespaced(`elearning/derivatives/${sha}/pdf.pdf`, 2)).toBe(`nga_central_mis/t/2/elearning/derivatives/${sha}/pdf.pdf`);
  });

  it("puts the tid in new avatar URLs; tenant 1 URLs keep their shape and their school", async () => {
    const { avatarUrls } = await import("../services/avatar/urls");
    const u1 = runWithTenant(t1, () => avatarUrls(42, 1000))!;
    const u2 = runWithTenant(t2, () => avatarUrls(42, 1000))!;
    expect(u1.md).toMatch(/\/avatars\/42\/1000\/md\.webp\?s=/);
    expect(u2.md).toMatch(/\/avatars\/t\/2\/42\/1000\/md\.webp\?s=/);
    const path1 = new URL(u1.md).pathname + new URL(u1.md).search;
    const path2 = new URL(u2.md).pathname + new URL(u2.md).search;
    calls.length = 0;
    // A tenant-2 session cookie must not re-point a tenant-1 URL at tenant 2's storage.
    await request(app).get(path1).set("Cookie", `nga_auth_token=${tokenFor(1, 2)}`);
    expect(calls[0]).toBe("GET nga_central_mis/t/1/avatars/42/1000-md.webp");
    calls.length = 0;
    await request(app).get(path2);
    expect(calls).toEqual(["GET nga_central_mis/t/2/avatars/42/1000-md.webp"]);
    // The signature covers the tid: the same signature for tenant 3 is refused.
    const forged = path2.replace("/t/2/", "/t/3/");
    expect((await request(app).get(forged)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe("(l) per-tenant settings: AI quota, timezone, sender, branding", () => {
  it("counts AI quota per tenant", async () => {
    const limiter = await import("../services/aiProviders/limiter");
    process.env.AI_DAILY_REQUESTS_MTPROV = "2";
    try {
      limiter.resetLimiterState();
      await runWithTenant(t1, async () => {
        expect(await limiter.checkAvailability("mtprov", false)).toBeNull();
        limiter.noteAttempt("mtprov");
        limiter.noteAttempt("mtprov");
        expect(await limiter.checkAvailability("mtprov", false)).toBe("DAILY");
      });
      expect(await runWithTenant(t2, () => limiter.checkAvailability("mtprov", false))).toBeNull();
      const [snap] = await runWithTenant(t2, () => limiter.quotaSnapshot(["mtprov"]));
      expect(snap.used_today).toBe(0);
    } finally {
      delete process.env.AI_DAILY_REQUESTS_MTPROV;
      limiter.resetLimiterState();
    }
  });

  it("reads the school day in the tenant's timezone", async () => {
    const { kigaliParts, kigaliInstant } = await import("../services/reminders/time");
    const { tenantTimezone } = await import("../tenancy/timezone");
    const { kigaliDay } = await import("../services/activity/runtime");
    const ny: TenantCtx = { ...t2, timezone: "America/New_York" };
    const at = new Date("2026-11-11T03:30:00Z"); // Kigali 05:30 on the 11th; New York 22:30 on the 10th
    expect(runWithTenant(t1, () => kigaliParts(at))).toMatchObject({ ymd: "2026-11-11", minutes: 5 * 60 + 30 });
    expect(runWithTenant(ny, () => kigaliParts(at))).toMatchObject({ ymd: "2026-11-10", minutes: 22 * 60 + 30 });
    expect(runWithTenant(ny, () => kigaliInstant("2026-11-10", 22 * 60 + 30)).toISOString()).toBe(at.toISOString());
    // Summer time is real for a DST zone (EDT = UTC-4).
    expect(runWithTenant(ny, () => kigaliInstant("2026-07-01", 8 * 60)).toISOString()).toBe("2026-07-01T12:00:00.000Z");
    expect(runWithTenant(ny, () => kigaliDay(at.getTime()))).toBe("2026-11-10");
    expect(runWithTenant(ny, tenantTimezone)).toBe("America/New_York");
    expect(runWithTenant({ ...t2, timezone: "Not/AZone" }, tenantTimezone)).toBe(process.env.SCHOOL_TIMEZONE || "Africa/Kigali");
    expect(tenantTimezone()).toBe("Africa/Kigali");
  });

  it("names the school as the e-mail sender (NGA keeps its own name)", async () => {
    const { senderName } = await import("../utils/email");
    const config = (await import("../config")).default;
    expect(runWithTenant(t1, senderName)).toBe(config.email.fromName);
    expect(runWithTenant(t2, senderName)).toBe(t2.name);
  });

  it("GET /tenant/branding answers per slug, with logos routed to that school", async () => {
    const { School } = await import("../db/schema");
    const schoolName = `MT School ${stamp}`;
    // The school row branding reads is the tenant's first ACTIVE School (create one if none).
    const first = await request(app).get(`/tenant/branding?slug=${SLUG2}`);
    let schoolId = first.body.data.school_id as number | null;
    if (!schoolId) {
      const [ins]: any = await runWithTenant(t2, () => db.insert(School).values({ name: schoolName, status: "ACTIVE" } as any));
      schoolId = ins.insertId;
    }
    await runWithTenant(t2, () =>
      db.update(School).set({ name: schoolName, logo: "https://example.com/mt-logo.png" }).where(eq(School.school_id, schoolId!)),
    );
    const res = await request(app).get(`/tenant/branding?slug=${SLUG2}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tid: 2, slug: SLUG2, name: t2.name, isPrimary: false });
    expect(res.body.data.logos.primary).toContain(`/schools/${res.body.data.school_id}/logo/primary?tenant=${SLUG2}`);
    const logo = await request(app).get(new URL(res.body.data.logos.primary).pathname + new URL(res.body.data.logos.primary).search);
    expect(logo.status).toBe(302);
    expect(logo.headers.location).toBe("https://example.com/mt-logo.png");
    expect(res.body.data.school_name).toBe(schoolName);

    const nga = await request(app).get("/tenant/branding");
    expect(nga.body.data).toMatchObject({ tid: 1, isPrimary: true });
    const unknown = await request(app).get("/tenant/branding?slug=no-such-school-xyz");
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("TENANT_UNKNOWN");
  });
});

// ---------------------------------------------------------------------------
// Security review fixes: every key, credential and public endpoint names its school.
// ---------------------------------------------------------------------------
describe("(n) security review: per-tenant keys, signed tenants, explicit Systems", () => {
  /** An account in tenant 2 and a DIFFERENT tenant-1 account holding the same user id. */
  async function twinAccounts(tag: string) {
    const two = await runWithTenant(t2, () => createAccount(`mt.twin2.${tag}.${stamp}@example.com`, "pw-twin-2"));
    await runWithTenant(t1, async () => {
      const [u] = await db.select({ id: User.user_id }).from(User).where(eq(User.user_id, two.userId));
      if (!u) {
        await db.insert(User).values({ user_id: two.userId, username: `mt_twin1_${tag}_${stamp}`.slice(0, 50), email: `mt.twin1.${tag}.${stamp}@example.com`, status: "ACTIVE" } as any);
        await db.insert(UserProfile).values({ user_id: two.userId, first_name: "Twin", last_name: "One", user_type: "TEACHER" });
      }
    });
    return two.userId;
  }

  it("keeps the Home overview cache per tenant (user ids repeat)", async () => {
    const { buildHomeOverview } = await import("../services/home/buildHomeOverview");
    const id = await twinAccounts("home");
    const one = await runWithTenant(t1, () => buildHomeOverview(id));
    const oneAgain = await runWithTenant(t1, () => buildHomeOverview(id));
    expect(oneAgain).toBe(one); // the cache works ...
    const two = await runWithTenant(t2, () => buildHomeOverview(id));
    expect(two).not.toBe(one); // ... but never hands school A's overview to school B
  });

  it("keys the activity command queue by tenant", async () => {
    const { queueCommand, hasPendingUserCommand } = await import("../services/activity/ingest");
    runWithTenant(t2, () => queueCommand({ userId: 424242 }));
    expect(runWithTenant(t2, () => hasPendingUserCommand(424242))).toBe(true);
    expect(runWithTenant(t1, () => hasPendingUserCommand(424242))).toBe(false);
  });

  it("refuses an activity token of another school (resolveActivityUser)", async () => {
    const { resolveActivityUser } = await import("../middleware/activityAuth");
    const id = await twinAccounts("act");
    const req = (tid?: number) => ({ get: (h: string) => (h === "Authorization" ? `Bearer ${tokenFor(id, tid)}` : undefined), cookies: {} });
    expect(await runWithTenant(t2, () => resolveActivityUser(req(2)))).toBe(id);
    expect(await runWithTenant(t1, () => resolveActivityUser(req(2)))).toBeNull();
    expect(await runWithTenant(t2, () => resolveActivityUser(req()))).toBeNull(); // legacy = tenant 1
    expect(await runWithTenant(t1, () => resolveActivityUser(req()))).toBe(id);
  });

  it("binds live-stream and beacon tickets to their school", async () => {
    const tk = await import("../services/activity/tokens");
    const ticket = runWithTenant(t2, () => tk.issueStreamTicket(77));
    expect(tk.streamTicketTid(ticket)).toBe(2);
    expect(runWithTenant(t1, () => tk.consumeStreamTicket(ticket))).toBeNull();
    expect(runWithTenant(t2, () => tk.consumeStreamTicket(ticket))).toBe(77);
    const did = newDeviceId();
    const beacon = runWithTenant(t2, () => tk.issueBeaconTicket(77, did));
    expect(runWithTenant(t1, () => tk.verifyBeaconTicket(beacon, did))).toBeNull();
    expect(runWithTenant(t2, () => tk.verifyBeaconTicket(beacon, did))).toBe(77);
  });

  describe("reminders", () => {
    const env = { GOOGLE_CLIENT_ID: "mt-gid", GOOGLE_CLIENT_SECRET: "mt-gsecret", TELEGRAM_BOT_TOKEN: "1:mt", TELEGRAM_BOT_USERNAME: "mt_bot", TELEGRAM_WEBHOOK_SECRET: "mt-hook" };
    const saved: Record<string, string | undefined> = {};
    const calls: Array<{ method: string; url: string }> = [];
    beforeAll(async () => {
      for (const [k, v] of Object.entries(env)) {
        saved[k] = process.env[k];
        process.env[k] = v;
      }
      const { setGoogleTransport } = await import("../services/reminders/googleCalendar");
      let n = 0;
      setGoogleTransport(async (url, init) => {
        calls.push({ method: init.method ?? "GET", url });
        if (url.includes("oauth2.googleapis.com/token")) return { status: 200, json: { access_token: "at", refresh_token: "rt", expires_in: 3600 } };
        if (url.endsWith("/calendars") && init.method === "POST") return { status: 200, json: { id: "cal-mt" } };
        if (init.method === "POST") return { status: 200, json: { id: `ev-${++n}` } };
        if (init.method === "DELETE") return { status: 204, json: null };
        return { status: 200, json: {} };
      });
      const { setTelegramTransport } = await import("../services/reminders/telegram");
      setTelegramTransport(async () => ({ ok: true }));
    });
    afterAll(async () => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      (await import("../services/reminders/googleCalendar")).setGoogleTransport(null);
      (await import("../services/reminders/telegram")).setTelegramTransport(null);
    });

    it("Google connect: the signed state names the school, the callback ignores the cookie's", async () => {
      const { GoogleCalendarLink } = await import("../db/reminderSchema");
      const { buildAuthUrl, connectStateTid } = await import("../services/reminders/googleCalendar");
      const id = await twinAccounts("gcal");
      const state = new URL(runWithTenant(t2, () => buildAuthUrl(id))!).searchParams.get("state")!;
      expect(connectStateTid(state)).toBe(2);
      // A tenant-1 session cookie on the redirect must not pull the link into tenant 1.
      const res = await request(app)
        .get(`/reminders/google/callback?code=abc&state=${encodeURIComponent(state)}`)
        .set("Cookie", `nga_auth_token=${tokenFor(id, 1)}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("google=connected");
      const linked = async (t: TenantCtx) => runWithTenant(t, () => db.select().from(GoogleCalendarLink).where(eq(GoogleCalendarLink.user_id, id)));
      expect(await linked(t2)).toHaveLength(1);
      expect(await linked(t1)).toHaveLength(0);
      // A state of tenant 2 is refused inside tenant 1.
      const { completeConnect } = await import("../services/reminders/googleCalendar");
      await expect(runWithTenant(t1, () => completeConnect("abc", state))).rejects.toThrow(/another school/);
    });

    it("syncGoogleSoon keeps a pending set and timer per school, the timer runs in its school", async () => {
      const { GoogleCalendarLink } = await import("../db/reminderSchema");
      const { seal } = await import("../services/reminders/secretBox");
      const { syncGoogleSoon, pendingGoogleSync } = await import("../services/reminders/channels");
      const id = await twinAccounts("gsoon");
      await runWithTenant(t2, () =>
        db.insert(GoogleCalendarLink).values({ user_id: id, refresh_token_enc: seal("rt"), status: "active" }).onDuplicateKeyUpdate({ set: { status: "active" } }),
      );
      calls.length = 0;
      runWithTenant(t1, () => syncGoogleSoon([id], { force: true, delayMs: 20 }));
      await sleep(300);
      expect(calls).toHaveLength(0); // tenant 1's user N has no calendar link
      runWithTenant(t2, () => syncGoogleSoon([id], { force: true, delayMs: 20 }));
      expect(runWithTenant(t2, pendingGoogleSync)).toEqual([id]);
      expect(runWithTenant(t1, pendingGoogleSync)).toEqual([]);
      for (let i = 0; i < 50 && !calls.length; i++) await sleep(50);
      expect(calls.some((c) => c.url.includes("oauth2.googleapis.com/token"))).toBe(true);
      // The sync writes last_sync_at after its Google calls; wait for it rather than racing it.
      const lastSync = async () =>
        (await runWithTenant(t2, () => db.select().from(GoogleCalendarLink).where(eq(GoogleCalendarLink.user_id, id))))[0]?.last_sync_at ?? null;
      let synced = await lastSync();
      for (let i = 0; i < 60 && !synced; i++) {
        await sleep(50);
        synced = await lastSync();
      }
      expect(synced).not.toBeNull();
    });

    it("feed tokens name their school; a tampered prefix finds nothing; old tokens stay tenant 1", async () => {
      const { CalendarFeedToken } = await import("../db/reminderSchema");
      const { issueFeedToken } = await import("../services/reminders/calendarFeed");
      const id = await twinAccounts("feed");
      const token = await runWithTenant(t2, () => issueFeedToken(id));
      expect(token.startsWith("t2.")).toBe(true);
      const ok = await request(app).get(`/reminders/feed/${token}.ics`).set("Cookie", `nga_auth_token=${tokenFor(id, 1)}`);
      expect(ok.status).toBe(200);
      expect(ok.text).toContain("BEGIN:VCALENDAR");
      expect((await request(app).get(`/reminders/feed/t1.${token.slice(3)}.ics`)).status).toBe(404);
      const legacy = crypto.randomBytes(32).toString("base64url");
      await runWithTenant(t1, () =>
        db.insert(CalendarFeedToken).values({ user_id: id, token: legacy }).onDuplicateKeyUpdate({ set: { token: legacy } }),
      );
      expect((await request(app).get(`/reminders/feed/${legacy}.ics`)).status).toBe(200);
    });

    it("notification action links carry a signed tid (old unsigned links = tenant 1)", async () => {
      const { ReminderJob } = await import("../db/reminderSchema");
      const { signAction } = await import("../services/reminders/webPush");
      const id = await twinAccounts("act2");
      const job = async (t: TenantCtx) =>
        runWithTenant(t, async () => {
          const [ins] = (await db.insert(ReminderJob).values({
            user_id: id, dedupe_key: `mt-act:${crypto.randomUUID()}`, source_type: "quiz_close", title: "MT", link: null,
            event_start: new Date(Date.now() + 3_600_000), fire_at: new Date(), status: "sent",
          } as any)) as any;
          return Number(ins.insertId);
        });
      const j2 = await job(t2);
      const sig2 = signAction(j2, id, 2);
      // The tid is inside the signature: pointing the same link at tenant 1 fails.
      expect((await request(app).post(`/reminders/actions/${j2}/ack?sig=${sig2}&t=1`)).status).toBe(403);
      expect((await request(app).post(`/reminders/actions/${j2}/ack?sig=${sig2}`)).status).toBe(403);
      const ok = await request(app).post(`/reminders/actions/${j2}/ack?sig=${sig2}&t=2`);
      expect(ok.status).toBe(200);
      const [row] = await runWithTenant(t2, () => db.select().from(ReminderJob).where(eq(ReminderJob.job_id, j2)));
      expect(row.acked_at).not.toBeNull();
      const j1 = await job(t1);
      expect((await request(app).post(`/reminders/actions/${j1}/ack?sig=${signAction(j1, id)}`)).status).toBe(200);
    });

    it("Telegram link codes and buttons carry the school", async () => {
      const { TelegramLink } = await import("../db/reminderSchema");
      const { createLinkCode, handleTelegramUpdate, linkCodeTid } = await import("../services/reminders/telegram");
      const id = await twinAccounts("tg");
      const link = await runWithTenant(t2, () => createLinkCode(id));
      expect(link!.code.startsWith("t2_")).toBe(true);
      expect(linkCodeTid(link!.code)).toBe(2);
      const chatId = 880000 + Math.floor(Math.random() * 1000);
      const acts = { ack: async () => true, snooze: async () => ({ ok: true }) };
      // The webhook runs with no tenant context (shadow = tenant 1); the code decides.
      expect(await handleTelegramUpdate({ message: { chat: { id: chatId }, text: `/start ${link!.code}` } }, acts)).toBe("linked");
      expect(await runWithTenant(t2, () => db.select().from(TelegramLink).where(eq(TelegramLink.chat_id, chatId)))).toHaveLength(1);
      expect(await runWithTenant(t1, () => db.select().from(TelegramLink).where(eq(TelegramLink.chat_id, chatId)))).toHaveLength(0);
      expect(await handleTelegramUpdate({ message: { chat: { id: chatId }, text: "/stop" } }, acts)).toBe("stopped");
      expect(await runWithTenant(t2, () => db.select().from(TelegramLink).where(eq(TelegramLink.chat_id, chatId)))).toHaveLength(0);
    });
  });

  it("a System assigned only to school B can't read NGA; bootstrap assigns tenant 1 once", async () => {
    const { assignPrimarySystemsOnce } = await import("../tenancy/bootstrap");
    const { getPublicSystems } = await import("../utils/publicSystems");
    const { isSystemAssigned } = await import("../tenancy/systems");
    // Bootstrap step 6 is idempotent and runs once: replay it from scratch.
    const preId = `mt-pre-${stamp}`;
    const [pre] = (await primaryDb().insert(System).values({ name: `MT Pre ${stamp}`, client_id: preId, client_secret: "x", icon_url: "x", home_url: "x", status: "ACTIVE" } as any)) as any;
    await controlPool().query("DELETE FROM PlatformMigration WHERE file = 'bootstrap:tenant1-systems'");
    expect(await assignPrimarySystemsOnce()).toBeGreaterThanOrEqual(1);
    expect(await isSystemAssigned(pre.insertId, t1)).toBe(true);
    expect(await assignPrimarySystemsOnce()).toBe(0);

    const clientId = `mt-bonly-${stamp}`;
    const secret = "mt-bonly-secret";
    const [res] = (await primaryDb().insert(System).values({
      name: `MT B only ${stamp}`, client_id: clientId, client_secret: secret, allowed_redirect_uris: "http://localhost/cb", icon_url: "x", home_url: "http://localhost", status: "ACTIVE",
    } as any)) as any;
    const id = res.insertId as number;
    await writeSystemScopes(id, null);
    await assignSystem(2, id);
    expect(await assignPrimarySystemsOnce()).toBe(0); // a later bootstrap never hands it to NGA
    try {
      const basic = `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
      const missing = await request(app).get("/integrations/sync/reference").set("Authorization", basic);
      expect(missing.status).toBe(400);
      expect(missing.body.code).toBe("TENANT_REQUIRED");
      const nga = await request(app).get("/integrations/sync/reference").set("Authorization", basic).set("X-NGA-Tenant", "1");
      expect(nga.status).toBe(403);
      expect(nga.body.code).toBe("SYSTEM_NOT_ASSIGNED");
      expect((await request(app).get("/integrations/sync/reference").set("Authorization", basic).set("X-NGA-Tenant", "2")).status).toBe(200);
      expect((await runWithTenant(t1, () => getPublicSystems())).some((s) => s.system_id === id)).toBe(false);
      expect((await runWithTenant(t2, () => getPublicSystems())).some((s) => s.system_id === id)).toBe(true);
      const u1 = (await runWithTenant(t1, () => createAccount(`mt.bonly.${stamp}@example.com`, "pw-bonly"))).userId;
      const auth = await request(app)
        .get(`/sso/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent("http://localhost/cb")}&response_type=code`)
        .set("Authorization", `Bearer ${tokenFor(u1, 1)}`)
        .set("User-Agent", "Mozilla/5.0");
      expect(auth.status).toBe(403);
      expect(auth.body.code).toBe("SYSTEM_NOT_ASSIGNED");
    } finally {
      await unassignSystem(2, id).catch(() => undefined);
      await primaryDb().update(System).set({ status: "DISABLED" }).where(eq(System.system_id, id));
      await primaryDb().update(System).set({ status: "DISABLED" }).where(eq(System.system_id, pre.insertId));
    }
  });

  it("an integration token speaks only for the database it lives in (school_id never selects another)", async () => {
    const { School } = await import("../db/schema");
    // A second School row in NGA's own database (school_id 2) -- not tenant 2.
    const [hasTwo] = await primaryDb().select({ id: School.school_id }).from(School).where(eq(School.school_id, 2));
    if (!hasTwo) await primaryDb().insert(School).values({ school_id: 2, name: `MT NGA campus ${stamp}`, status: "INACTIVE" } as any);
    const raw = `mt_${crypto.randomBytes(16).toString("hex")}`;
    await primaryDb().insert(IntegrationToken).values({
      name: `MT school2 ${stamp}`,
      token_hash: crypto.createHash("sha256").update(raw, "utf8").digest("hex"),
      token_prefix: raw.slice(0, 8),
      scopes: "tenants:read,sync:read",
      school_id: 2,
    } as any);
    const other = await request(app).get("/platform/tenants/active").set("Authorization", `Bearer ${raw}`).set("X-NGA-Tenant", "2");
    expect(other.status).toBe(403);
    expect(other.body.code).toBe("TENANT_MISMATCH");
    expect((await request(app).get("/platform/tenants/active").set("Authorization", `Bearer ${raw}`)).status).toBe(403);
    if (!hasTwo) await primaryDb().delete(School).where(eq(School.school_id, 2)).catch(() => undefined);
  });

  it("sign-in never skips tenant 1 for an account the directory missed", async () => {
    const { resolveLoginTenants } = await import("../tenancy/loginResolver");
    const email = `mt.missed.${stamp}@example.com`;
    await runWithTenant(t1, () => createAccount(email, "pw-missed-1")); // no directory row
    const two = await runWithTenant(t2, () => createAccount(email, "pw-missed-2"));
    await syncDirectoryUser(two.userId, 2);
    await controlPool().query("DELETE FROM AccountDirectory WHERE tenant_id = 1 AND email_norm = ?", [email]);
    const r = await resolveLoginTenants(email);
    expect(r.kind).toBe("many");
    expect((r as any).tenants.map((t: TenantCtx) => t.tid)).toEqual([1, 2]);
  });

  it("public branding and logos only for usable schools", async () => {
    await controlPool().query("UPDATE Tenant SET status = 'SUSPENDED' WHERE tenant_id = 2");
    invalidateTenants();
    try {
      const b = await request(app).get(`/tenant/branding?slug=${SLUG2}`);
      expect(b.status).toBe(404);
      expect(JSON.stringify(b.body)).not.toContain(t2.name);
      expect((await request(app).get(`/tenant/branding?tid=2`)).status).toBe(404);
      expect((await request(app).get(`/schools/2/logo/primary?tenant=${SLUG2}`)).status).toBe(404);
    } finally {
      await controlPool().query("UPDATE Tenant SET status = 'ACTIVE' WHERE tenant_id = 2");
      invalidateTenants();
    }
  });
});

// ---------------------------------------------------------------------------
describe("(m) config: no built-in secrets", () => {
  it("requires DB and SMTP passwords in production, placeholders only in development", async () => {
    const { missingRequiredSecrets, assertRequiredSecrets } = await import("../config");
    expect(missingRequiredSecrets({ ENV_TYPE: "production", JWT_SECRET: "x" })).toEqual(["DB_PASSWORD", "SMTP_PASS"]);
    expect(() => assertRequiredSecrets({ NODE_ENV: "production", JWT_SECRET: "x", DB_PASSWORD: "p" })).toThrow(/SMTP_PASS/);
    expect(() => assertRequiredSecrets({ ENV_TYPE: "production", JWT_SECRET: "x", DB_PASSWORD: "p", SMTP_PASS: "s" })).not.toThrow();
    expect(missingRequiredSecrets({ ENV_TYPE: "development", JWT_SECRET: "x" })).toEqual([]);
    expect(missingRequiredSecrets({ ENV_TYPE: "development" })).toEqual(["JWT_SECRET"]);
  });

  it("stops a production process at startup when a secret is missing", async () => {
    const { spawnSync } = await import("child_process");
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "mt-config-")); // no .env here
    const configPath = path.resolve(__dirname, "../config/index.ts");
    const env: Record<string, string> = { PATH: process.env.PATH!, ENV_TYPE: "production", JWT_SECRET: "x", TS_NODE_TRANSPILE_ONLY: "1", TS_NODE_PROJECT: path.resolve(__dirname, "../../tsconfig.json") };
    const run = (extra: Record<string, string>) =>
      spawnSync(process.execPath, ["-r", path.resolve(__dirname, "../../node_modules/ts-node/register"), "-e", `require(${JSON.stringify(configPath)})`], {
        cwd, env: { ...env, ...extra }, encoding: "utf8", timeout: 60_000,
      });
    const bad = run({});
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toMatch(/Missing required environment variables: DB_PASSWORD, SMTP_PASS/);
    const ok = run({ DB_PASSWORD: "p", SMTP_PASS: "s" });
    expect(ok.status).toBe(0);
    fs.rmSync(cwd, { recursive: true, force: true });
  }, 90_000);
});

afterAll(async () => {
  // Leave no tenant database behind (the local MAMP server's open-file budget is small).
  await dropMisTenantDatabase(2).catch(() => undefined);
  await controlPool().query("DELETE FROM TenantMigration WHERE tenant_id = 2").catch(() => undefined);
});
