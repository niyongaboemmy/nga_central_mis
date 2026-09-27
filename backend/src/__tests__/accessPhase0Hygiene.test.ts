import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import {
  Permission,
  Role,
  SSOCode,
  System,
  User,
} from "../db/schema";
import {
  assignRole,
  createRoleWithPermissions,
  createUser,
  signToken,
} from "../test/fixtures";
import { getEffectivePermissions } from "../utils/auth";
import { ALL_PERMISSIONS } from "../utils/permissions";
import {
  hashClientSecret,
  isHashedClientSecret,
  verifyClientSecret,
} from "../utils/ssoClientSecret";

/**
 * Access control v2 -- Phase 0 (ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md §11):
 * one permission resolver for middleware, /users/me and the SSO token, and a
 * hardened SSO token exchange.
 */

async function ensurePermission(name: string): Promise<number> {
  const rows = await db
    .select({ perm_id: Permission.perm_id })
    .from(Permission)
    .where(eq(Permission.name, name))
    .limit(1);
  if (rows.length > 0) return rows[0].perm_id;
  const [res] = (await db
    .insert(Permission)
    .values({ name, status: "ACTIVE" })) as any;
  return res.insertId as number;
}

/** The real SUPER_ADMIN role (exact name -- behaviour keys off it). */
async function superAdminRoleId(): Promise<number> {
  const rows = await db
    .select({ role_id: Role.role_id })
    .from(Role)
    .where(eq(Role.name, "SUPER_ADMIN"))
    .limit(1);
  if (rows.length > 0) return rows[0].role_id;
  const next = (await db.execute(
    sql.raw("SELECT COALESCE(MAX(role_id), 0) + 1 AS id FROM `Role`"),
  )) as any;
  const roleId = next[0][0].id as number;
  await db
    .insert(Role)
    .values({ role_id: roleId, name: "SUPER_ADMIN", status: "ACTIVE" });
  return roleId;
}

async function createSystem(secret: string, status: "ACTIVE" | "DISABLED" = "ACTIVE") {
  const clientId = `client_${crypto.randomBytes(6).toString("hex")}`;
  const [res] = (await db.insert(System).values({
    name: `Test ${clientId}`,
    client_id: clientId,
    client_secret: secret,
    allowed_redirect_uris: "http://localhost/cb",
    icon_url: "x",
    home_url: "http://localhost",
    status,
  })) as any;
  return { systemId: res.insertId as number, clientId };
}

async function issueCode(userId: number, systemId: number) {
  const code = crypto.randomBytes(16).toString("hex");
  await db.insert(SSOCode).values({
    code,
    user_id: userId,
    system_id: systemId,
    expires_at: new Date(Date.now() + 5 * 60 * 1000),
  });
  return code;
}

describe("Phase 0 -- one permission resolver", () => {
  let superAdminId: number;
  const DB_ONLY = "SUPER_ADMIN_DASHBOARD"; // seeded in DB, absent from the code catalog

  beforeAll(async () => {
    const roleId = await superAdminRoleId();
    const permId = await ensurePermission(DB_ONLY);
    await db.execute(
      sql`INSERT IGNORE INTO RolePermission (role_id, perm_id) VALUES (${roleId}, ${permId})`,
    );
    superAdminId = await createUser({ userType: "ADMIN" });
    await assignRole(superAdminId, roleId);
  });

  it("gives SUPER_ADMIN the code catalog AND its DB-only grants", async () => {
    const perms = await getEffectivePermissions(superAdminId);
    for (const p of ALL_PERMISSIONS) expect(perms).toContain(p);
    expect(perms).toContain(DB_ONLY);
    expect(new Set(perms).size).toBe(perms.length); // no duplicates
  });

  it("gives everyone else exactly their DB grants", async () => {
    const userId = await createUser();
    const roleId = await createRoleWithPermissions("P0_TEACHER", [
      "VIEW_MY_ASSIGNED_SUBJECTS",
      "TEACHER_DASHBOARD",
    ]);
    await assignRole(userId, roleId);
    const perms = await getEffectivePermissions(userId);
    expect(perms.sort()).toEqual(["TEACHER_DASHBOARD", "VIEW_MY_ASSIGNED_SUBJECTS"]);
  });

  it("ignores permissions of a DISABLED role", async () => {
    const userId = await createUser();
    const roleId = await createRoleWithPermissions("P0_DISABLED", ["MANAGE_USERS"]);
    await db.update(Role).set({ status: "DISABLED" }).where(eq(Role.role_id, roleId));
    await assignRole(userId, roleId);
    expect(await getEffectivePermissions(userId)).toEqual([]);
  });

  it("/users/me reports the same set the middleware enforces", async () => {
    const res = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${signToken(superAdminId)}`);
    expect(res.status).toBe(200);
    const me = res.body.data.permissions as string[];
    expect(me.sort()).toEqual((await getEffectivePermissions(superAdminId)).sort());
  });

  it("lets SUPER_ADMIN through a guard that checks a DB-only permission", async () => {
    // VIEW_USERS is in the code catalog; before Phase 0 it existed nowhere in
    // the DB. The route must work through the resolver either way.
    const res = await request(app)
      .get("/users/stats")
      .set("Authorization", `Bearer ${signToken(superAdminId)}`);
    expect(res.status).toBe(200);
  });
});

describe("Phase 0 -- SSO client secrets", () => {
  it("recognises bcrypt hashes and rejects wrong secrets in both formats", async () => {
    const hashed = await hashClientSecret("s3cret");
    expect(isHashedClientSecret(hashed)).toBe(true);
    expect(isHashedClientSecret("s3cret")).toBe(false);
    expect(await verifyClientSecret("s3cret", hashed)).toBe(true);
    expect(await verifyClientSecret("wrong", hashed)).toBe(false);
    expect(await verifyClientSecret("s3cret", "s3cret")).toBe(true);
    expect(await verifyClientSecret("s3cre", "s3cret")).toBe(false);
    expect(await verifyClientSecret("", "s3cret")).toBe(false);
    expect(await verifyClientSecret("s3cret", null)).toBe(false);
  });
});

describe("Phase 0 -- SSO token exchange", () => {
  let userId: number;

  beforeAll(async () => {
    userId = await createUser();
    const roleId = await createRoleWithPermissions("P0_SSO", ["VIEW_MY_CALENDAR"]);
    await assignRole(userId, roleId);
  });

  it("issues a token with issuer, audience and the resolver's permissions (legacy plaintext secret)", async () => {
    const { systemId, clientId } = await createSystem("plain-secret");
    const code = await issueCode(userId, systemId);

    const res = await request(app)
      .post("/sso/token")
      .send({ code, client_id: clientId, client_secret: "plain-secret" });

    expect(res.status).toBe(200);
    const { token, permissions } = res.body.data;
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
    expect(decoded.iss).toBe("nga-mis");
    expect(decoded.aud).toBe(clientId);
    expect(permissions).toEqual(await getEffectivePermissions(userId));
    expect(typeof res.body.data.access_version).toBe("number");
    expect(decoded.permissions).toEqual(permissions);

    // Spoke apps call MIS APIs with this token -- the audience must not lock
    // it out. Run the real middleware directly: this token embeds every grade
    // and year, which on a fixture-bloated test DB exceeds Node's header limit.
    const { authenticate } = await import("../middleware/auth");
    const req: any = { header: (h: string) => (h === "Authorization" ? `Bearer ${token}` : undefined), method: "GET", query: {} };
    let status = 200;
    const reply: any = { status: (c: number) => ((status = c), reply), json: () => reply };
    let passed = false;
    await authenticate(req, reply, () => {
      passed = true;
    });
    expect(status).toBe(200);
    expect(passed).toBe(true);
    expect(req.user.userId).toBe(userId);
  });

  it("accepts a bcrypt-hashed client secret", async () => {
    const { systemId, clientId } = await createSystem(await hashClientSecret("hashed-secret"));
    const code = await issueCode(userId, systemId);
    const res = await request(app)
      .post("/sso/token")
      .send({ code, client_id: clientId, client_secret: "hashed-secret" });
    expect(res.status).toBe(200);
  });

  it("rejects a wrong secret without consuming the code", async () => {
    const { systemId, clientId } = await createSystem("right");
    const code = await issueCode(userId, systemId);
    const bad = await request(app)
      .post("/sso/token")
      .send({ code, client_id: clientId, client_secret: "wrong" });
    expect(bad.status).toBe(401);

    const good = await request(app)
      .post("/sso/token")
      .send({ code, client_id: clientId, client_secret: "right" });
    expect(good.status).toBe(200);
  });

  it("rejects a DISABLED system even with the right secret", async () => {
    const { systemId, clientId } = await createSystem("right", "DISABLED");
    const code = await issueCode(userId, systemId);
    const res = await request(app)
      .post("/sso/token")
      .send({ code, client_id: clientId, client_secret: "right" });
    expect(res.status).toBe(401);
  });

  it("refuses to mint a token for a user suspended after /sso/authorize", async () => {
    const suspended = await createUser();
    const { systemId, clientId } = await createSystem("right");
    const code = await issueCode(suspended, systemId);
    await db.update(User).set({ status: "SUSPENDED" }).where(eq(User.user_id, suspended));

    const res = await request(app)
      .post("/sso/token")
      .send({ code, client_id: clientId, client_secret: "right" });
    expect(res.status).toBe(401);
  });
});

describe("Phase 0 -- SSO client secrets never reach users", () => {
  it("leaves client_secret out of /users/me and of the SSO token payload", async () => {
    const secret = `leak-check-${crypto.randomBytes(6).toString("hex")}`;
    const { systemId, clientId } = await createSystem(secret);
    const userId = await createUser();

    const me = await request(app).get("/users/me").set("Authorization", `Bearer ${signToken(userId)}`);
    expect(me.status).toBe(200);
    expect(JSON.stringify(me.body)).not.toContain(secret);
    expect(me.body.data.systems.find((s: any) => s.client_id === clientId)).toMatchObject({ client_id: clientId });
    expect(me.body.data.systems.every((s: any) => !("client_secret" in s))).toBe(true);

    const code = await issueCode(userId, systemId);
    const tok = await request(app).post("/sso/token").send({ code, client_id: clientId, client_secret: secret });
    expect(tok.status).toBe(200);
    const payload = JSON.stringify(jwt.decode(tok.body.data.token));
    expect(payload).not.toContain(secret);
    expect(payload).not.toContain("client_secret");
  });
});

