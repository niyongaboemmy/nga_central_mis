/**
 * MIS-ISO-3: the GitHub App setup redirect (GET /integrations/github/setup) must not
 * trust `installation_id` -- it is a query parameter anyone can change. Ownership is
 * proven with the OAuth code GitHub sends during installation (the user must reach
 * the installation), or else the installation must be brand new (created after our
 * signed state, within 10 minutes) and not routed to any school yet.
 * GitHub itself is faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { controlPool } from "../db/platform";
import { githubIntegrationRouter } from "../routes/githubIntegration";
import { setGitHubFetch } from "../services/sideProjects/git/github";
import { signState } from "../services/sideProjects/git/store";
import { ensurePlatform } from "../test/tenantMgmtFixtures";

const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const ENV_KEYS = ["GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_API_URL", "GITHUB_WEB_URL"];
const saved: Record<string, string | undefined> = {};

const base = 950000 + Math.floor(Math.random() * 40000);
const FRESH = base + 1; // created just now, nobody's yet
const OLD = base + 2; // created an hour ago (someone else's, long installed)
const MINE_BY_CODE = base + 3; // listed by /user/installations for the OAuth code
const ELSEWHERE = base + 4; // already routed to another school
const ALL = [FRESH, OLD, MINE_BY_CODE, ELSEWHERE];
const created: Record<number, string> = {};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const app = express();
app.use("/integrations/github", githubIntegrationRouter());
const install = (q: Record<string, unknown>) => request(app).get("/integrations/github/setup").query(q);
const state = () => signState({ k: "install", u: 7, t: 1, p: 0 }, 15 * 60);

beforeAll(async () => {
  await ensurePlatform();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  Object.assign(process.env, {
    GITHUB_APP_ID: "12345",
    GITHUB_APP_SLUG: "nga-projects-test",
    GITHUB_APP_PRIVATE_KEY: (privateKey as string).replace(/\n/g, "\\n"),
    GITHUB_WEBHOOK_SECRET: "s",
    GITHUB_CLIENT_ID: "client",
    GITHUB_CLIENT_SECRET: "client-secret",
    GITHUB_API_URL: "https://gh.test",
    GITHUB_WEB_URL: "https://ghweb.test",
  });
  const now = Date.now();
  created[FRESH] = new Date(now - 20_000).toISOString();
  created[OLD] = new Date(now - 60 * 60_000).toISOString();
  created[MINE_BY_CODE] = new Date(now - 60 * 60_000).toISOString();
  created[ELSEWHERE] = new Date(now - 20_000).toISOString();
  setGitHubFetch((async (input: any) => {
    const url = String(input);
    const m = /\/app\/installations\/(\d+)$/.exec(url);
    if (m) {
      const id = Number(m[1]);
      return created[id] ? json({ id, account: { id: 1, login: `acct${id}`, type: "Organization" }, created_at: created[id] }) : json({ message: "Not Found" }, 404);
    }
    if (url.endsWith("/login/oauth/access_token")) return json({ access_token: "user-token" });
    if (url.includes("/user/installations")) return json({ total_count: 1, installations: [{ id: MINE_BY_CODE }] });
    return json({ message: "not found" }, 404);
  }) as any);
  await controlPool().query("INSERT INTO GitHubInstallationRoute (installation_id, tenant_id, account_login, created_at, updated_at) VALUES (?, 999, 'x', UTC_TIMESTAMP(), UTC_TIMESTAMP())", [ELSEWHERE]);
}, 60_000);

afterAll(async () => {
  setGitHubFetch(null);
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  for (const id of ALL) {
    await controlPool().query("DELETE FROM GitHubInstallationRoute WHERE installation_id = ?", [id]).catch(() => undefined);
    await db.execute(sql`DELETE FROM GitInstallation WHERE installation_id = ${id}`).catch(() => undefined);
  }
});

const routedTo = async (id: number) => ((await controlPool().query<any[]>("SELECT tenant_id FROM GitHubInstallationRoute WHERE installation_id = ?", [id]))[0] as any[])[0]?.tenant_id ?? null;

describe("MIS-ISO-3: GitHub setup proves installation ownership", () => {
  it("refuses someone else's long-standing installation without an OAuth code", async () => {
    const r = await install({ state: state(), installation_id: OLD, setup_action: "install" });
    expect(r.status).toBe(403);
    expect(await routedTo(OLD)).toBeNull();
  });

  it("refuses an installation the OAuth user cannot reach", async () => {
    const r = await install({ state: state(), installation_id: OLD, code: "abc" });
    expect(r.status).toBe(403);
    expect(await routedTo(OLD)).toBeNull();
  });

  it("refuses an installation already routed to another school", async () => {
    const r = await install({ state: state(), installation_id: ELSEWHERE, code: "abc" });
    expect(r.status).toBe(409);
    expect(Number(await routedTo(ELSEWHERE))).toBe(999);
  });

  it("refuses a fresh installation when the state was issued after it (state replay / reuse)", async () => {
    const before = created[FRESH];
    created[FRESH] = new Date(Date.now() - 5 * 60_000).toISOString(); // 5 min old, state brand new
    try {
      const r = await install({ state: state(), installation_id: FRESH });
      expect(r.status).toBe(403);
    } finally {
      created[FRESH] = before;
    }
  });

  it("accepts the installation listed for the OAuth user", async () => {
    const r = await install({ state: state(), installation_id: MINE_BY_CODE, code: "abc" });
    expect(r.status, r.text).toBe(302);
    expect(Number(await routedTo(MINE_BY_CODE))).toBe(1);
  });

  it("accepts a brand-new, unrouted installation created after the state", async () => {
    const st = state();
    // Created after the state was issued.
    created[FRESH] = new Date(Date.now() + 1_000).toISOString();
    const r = await install({ state: st, installation_id: FRESH });
    expect(r.status, r.text).toBe(302);
    expect(Number(await routedTo(FRESH))).toBe(1);
    // Coming back for the same school is a no-op redirect.
    expect((await install({ state: state(), installation_id: FRESH })).status).toBe(302);
  });
});
