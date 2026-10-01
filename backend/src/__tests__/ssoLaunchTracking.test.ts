import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import app from "../app";
import { db } from "../db";
import { System } from "../db/schema";
import { createUser, signToken } from "../test/fixtures";
import { q } from "../services/activity/db";
import { isServerToServer } from "../controllers/ssoController";

/**
 * "Opened Task Mentor / Tendo / Tupo" counts a person's browser asking for an SSO code,
 * not a server pre-generating codes for them (production 2026-10-01: an axios caller on
 * the server itself was recorded as four launches from the server's own IP).
 */
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
let user: number;
let clientId: string;

beforeAll(async () => {
  user = await createUser({ userType: "TEACHER" });
  clientId = `client_${crypto.randomBytes(6).toString("hex")}`;
  await db.insert(System).values({ name: `Test ${clientId}`, client_id: clientId, client_secret: "s", allowed_redirect_uris: "http://localhost/cb", icon_url: "x", home_url: "http://localhost", status: "ACTIVE" } as any);
}, 60_000);

const authorize = (ua: string | null) => {
  let r = request(app).get(`/sso/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent("http://localhost/cb")}`).set("Authorization", `Bearer ${signToken(user)}`);
  if (ua !== null) r = r.set("User-Agent", ua);
  return r;
};
const launches = async () => {
  await new Promise((r) => setTimeout(r, 300)); // recorded asynchronously
  return (await q<{ n: number }>("SELECT COUNT(*) AS n FROM AuthEvent WHERE kind = 'app_launch' AND user_id = ? AND method = ?", [user, clientId.slice(0, 20)]))[0].n;
};

describe("SSO app launches", () => {
  it("are counted when a browser opens the app", async () => {
    const before = Number(await launches());
    expect((await authorize(BROWSER)).status).toBe(200);
    expect(Number(await launches())).toBe(before + 1);
  });

  it("are not counted when a server asks for a code (it still gets one)", async () => {
    const before = Number(await launches());
    const r = await authorize("axios/1.17.0");
    expect(r.status).toBe(200);
    expect(r.body.data?.code ?? r.body.code).toBeTruthy();
    expect(Number(await launches())).toBe(before);
  });

  it("tells programs from browsers", () => {
    const req = (ua?: string) => ({ headers: ua === undefined ? {} : { "user-agent": ua } });
    for (const ua of ["axios/1.17.0", "node-fetch/1.0", "undici", "curl/8.4.0", "python-requests/2.31", "Go-http-client/1.1", "okhttp/4.12", ""]) expect(isServerToServer(req(ua))).toBe(true);
    expect(isServerToServer(req())).toBe(true);
    expect(isServerToServer(req(BROWSER))).toBe(false);
    expect(isServerToServer(req("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"))).toBe(false);
  });
});
