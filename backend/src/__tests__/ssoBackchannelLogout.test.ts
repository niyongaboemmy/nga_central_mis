import { describe, it, expect, beforeAll, afterEach } from "vitest";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { eq, like } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { System } from "../db/schema";
import { createUser, signToken } from "../test/fixtures";
import { buildLogoutToken, LOGOUT_EVENT, notifyLogout, setLogoutTransport, validBackchannelUri } from "../services/sso/backchannelLogout";

const tag = `slo_${Date.now()}`;

/** Verify a logout token exactly as an app would: against the published JWKS. */
const verifyWithJwks = async (token: string, audience: string) => {
  const res = await request(app).get("/.well-known/jwks.json");
  const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
  const jwk = res.body.keys.find((k: any) => k.kid === header.kid);
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  return jwt.verify(token, key, { algorithms: ["RS256"], audience }) as any;
};

describe("Single sign-out (OIDC Back-Channel Logout)", () => {
  beforeAll(async () => {
    await db.update(System).set({ status: "DISABLED" }).where(like(System.name, "slo_%"));
    await db.insert(System).values([
      { name: `${tag}_a`, client_id: `${tag}_a`, icon_url: "x", home_url: "https://a.test", backchannel_logout_uri: "https://a.test/bcl", status: "ACTIVE" },
      { name: `${tag}_b`, client_id: `${tag}_b`, icon_url: "x", home_url: "https://b.test", backchannel_logout_uri: "https://b.test/bcl", status: "ACTIVE" },
      { name: `${tag}_off`, client_id: `${tag}_off`, icon_url: "x", home_url: "https://c.test", backchannel_logout_uri: "https://c.test/bcl", status: "DISABLED" },
      { name: `${tag}_none`, client_id: `${tag}_none`, icon_url: "x", home_url: "https://d.test", status: "ACTIVE" },
    ] as any);
  });
  afterEach(() => setLogoutTransport(null));

  it("publishes an RSA signing key and OIDC discovery", async () => {
    const keys = await request(app).get("/.well-known/jwks.json");
    expect(keys.status).toBe(200);
    expect(keys.body.keys[0]).toMatchObject({ kty: "RSA", alg: "RS256", use: "sig" });
    expect(keys.body.keys[0].kid).toBeTruthy();
    expect(keys.body.keys[0].d).toBeUndefined(); // never the private part
    const disc = await request(app).get("/.well-known/openid-configuration");
    expect(disc.body.backchannel_logout_supported).toBe(true);
    expect(disc.body.jwks_uri).toMatch(/\/\.well-known\/jwks\.json$/);
  });

  it("issues spec-conformant logout tokens", async () => {
    const token = buildLogoutToken(42, "some_app")!;
    const claims = await verifyWithJwks(token, "some_app");
    expect(claims.sub).toBe("42");
    expect(claims.events).toEqual({ [LOGOUT_EVENT]: {} });
    expect(claims.nonce).toBeUndefined();
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(claims.exp - claims.iat).toBe(120);
    expect(() => jwt.verify(token, crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey, { algorithms: ["RS256"] })).toThrow();
  });

  it("notifies every active app with a back-channel URL, with a token for that app", async () => {
    const calls: Array<{ url: string; token: string }> = [];
    setLogoutTransport(async (url, body) => {
      calls.push({ url, token: new URLSearchParams(body).get("logout_token")! });
      return 200;
    });
    await notifyLogout(7, { retryDelays: [] });
    const mine = calls.filter((c) => /[ab]\.test/.test(c.url));
    expect(mine.map((c) => c.url).sort()).toEqual(["https://a.test/bcl", "https://b.test/bcl"]);
    expect(calls.some((c) => c.url.includes("c.test") || c.url.includes("d.test"))).toBe(false);
    const a = mine.find((c) => c.url.includes("a.test"))!;
    expect((await verifyWithJwks(a.token, `${tag}_a`)).sub).toBe("7");
  });

  it("retries server errors, never client errors", async () => {
    const seen: Record<string, number> = {};
    setLogoutTransport(async (url) => {
      seen[url] = (seen[url] ?? 0) + 1;
      if (url.includes("a.test")) return seen[url] < 2 ? 503 : 200;
      if (url.includes("b.test")) return 400;
      return 200;
    });
    const results = await notifyLogout(8, { retryDelays: [1, 1] });
    expect(results.find((r) => r.system === `${tag}_a`)).toMatchObject({ status: 200, attempts: 2 });
    expect(results.find((r) => r.system === `${tag}_b`)).toMatchObject({ status: 400, attempts: 1 });
  });

  it("signing out of MIS triggers it", async () => {
    const hits: string[] = [];
    setLogoutTransport(async (url) => {
      hits.push(url);
      return 200;
    });
    const userId = await createUser();
    const res = await request(app).post("/auth/logout").set("Authorization", `Bearer ${signToken(userId)}`);
    expect(res.status).toBe(200);
    for (let i = 0; i < 40 && !hits.some((h) => h.includes("a.test")); i++) await new Promise((r) => setTimeout(r, 50));
    expect(hits).toContain("https://a.test/bcl");
  });

  it("only accepts https back-channel URLs from admins", () => {
    expect(validBackchannelUri("https://x.test/bcl")).toBe("https://x.test/bcl");
    expect(validBackchannelUri("http://localhost:5002/api/auth/backchannel-logout")).toBe("http://localhost:5002/api/auth/backchannel-logout");
    expect(validBackchannelUri("")).toBeNull();
    expect(validBackchannelUri(undefined)).toBeUndefined();
    expect(() => validBackchannelUri("http://x.test/bcl")).toThrow();
    expect(() => validBackchannelUri("javascript:alert(1)")).toThrow();
  });

  it("cleans up", async () => {
    await db.update(System).set({ status: "DISABLED" }).where(like(System.name, `${tag}%`));
    const left = await db.select().from(System).where(eq(System.name, `${tag}_a`));
    expect(left[0].status).toBe("DISABLED");
  });
});
