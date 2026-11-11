/**
 * `authenticate` accepts a person's SESSION only (security review, finding 14).
 *
 * Every MIS JWT shares JWT_SECRET, so a valid signature proved nothing about what
 * a token was for: the half-finished login token (requiresOTP) opened every API
 * -- a 2FA bypass -- and so did reset-confirm, step-up and MCP relay tokens. Each
 * narrow token now works only on its own endpoint (authenticateFor), and the OTP
 * step locks after repeated wrong codes (finding 11).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AuthCredential, User } from "../db/schema";
import { createUser } from "../test/fixtures";
import { isOtpLocked, resetOtpAttempts } from "../utils/otp";
import { mintRelayToken } from "../services/mcp/relay";
import { isSessionClaims, nonSessionReason } from "../middleware/auth";

const PASSWORD = "Purpose-pw-123";
let userId: number;
let username: string;

const sign = (claims: Record<string, unknown>, opts: jwt.SignOptions = {}) =>
  jwt.sign({ userId, tokenVersion: 0, ...claims }, process.env.JWT_SECRET!, { expiresIn: "10m", ...opts });
const me = (token: string) => request(app).get("/users/me").set("Authorization", `Bearer ${token}`);
const login = () => request(app).post("/auth/login").send({ username, password: PASSWORD });
const latestOtp = async (type: string) => {
  const rows: any = await db.execute(
    sql`SELECT otp_code FROM OTP WHERE user_id = ${userId} AND otp_type = ${type} AND is_used = 0 ORDER BY otp_id DESC LIMIT 1`,
  );
  return rows[0][0]?.otp_code as string | undefined;
};

beforeAll(async () => {
  userId = await createUser({ userType: "TEACHER" });
  const [u] = await db.select({ username: User.username }).from(User).where(eq(User.user_id, userId));
  username = u.username!;
  await db.insert(AuthCredential).values({ user_id: userId, password_hash: await bcrypt.hash(PASSWORD, 4) });
});

afterAll(() => resetOtpAttempts());

describe("what counts as a session", () => {
  it("classifies the MIS's own token kinds", () => {
    expect(isSessionClaims({ userId: 1 })).toBe(true);
    expect(isSessionClaims({ userId: 1, aud: "taskmentor_app", iss: "nga-mis" })).toBe(true); // SSO token
    expect(nonSessionReason({ userId: 1, requiresOTP: true })).toBe("requires_otp");
    expect(nonSessionReason({ userId: 1, dbAccess: true })).toBe("step_up");
    expect(nonSessionReason({ userId: 1, purpose: "PASSWORD_RESET_CONFIRM" })).toBe("purpose");
    expect(nonSessionReason({ userId: 1, aud: "nga-mcp-relay" })).not.toBeNull();
    expect(nonSessionReason({ userId: 1, aud: ["x", "nga-mcp-consent"] })).toBe("audience");
  });
});

describe("authenticate refuses non-session tokens; their own endpoints still take them", () => {
  it("the login temp token (requiresOTP) is not a session: no 2FA bypass", async () => {
    const res = await login();
    expect(res.status).toBe(200);
    const temp = res.body.data.tempToken as string;
    expect((jwt.decode(temp) as any).requiresOTP).toBe(true);
    expect((await me(temp)).status).toBe(401);
    expect((await request(app).get("/auth/session").set("Authorization", `Bearer ${temp}`)).status).toBe(401);

    // ... but it is exactly what /auth/verify-otp takes (a wrong code reaches the OTP
    // check -- not "Invalid token" -- and the right one is consumed there).
    const wrong = await request(app).post("/auth/verify-otp").set("Authorization", `Bearer ${temp}`).send({ otp: "999999x" });
    expect(wrong.status).toBe(401);
    expect(JSON.stringify(wrong.body)).toMatch(/OTP/i);
    const code = res.body.data.devOtp ?? (await latestOtp("LOGIN_2FA"));
    // The success response carries the full session cookie (larger than the test
    // client's header limit with this test database's many Systems): check the effect.
    await request(app).post("/auth/verify-otp").set("Authorization", `Bearer ${temp}`).send({ otp: code }).catch(() => undefined);
    expect(await latestOtp("LOGIN_2FA")).toBeUndefined();
    // A session can't stand in for the temp token on the OTP step.
    const session = sign({});
    const asSession = await request(app).post("/auth/verify-otp").set("Authorization", `Bearer ${session}`).send({ otp: "000000" });
    expect(asSession.status).toBe(401);
    expect(asSession.body.message).toBe("Invalid token");
  });

  it("PASSWORD_RESET_CONFIRM opens /auth/reset-password only; a session can't reset a password", async () => {
    const confirm = sign({ purpose: "PASSWORD_RESET_CONFIRM" });
    expect((await me(confirm)).status).toBe(401);
    const session = sign({});
    expect((await request(app).post("/auth/reset-password").set("Authorization", `Bearer ${session}`).send({ newPassword: "Another-pw-456" })).status).toBe(401);
    const ok = await request(app).post("/auth/reset-password").set("Authorization", `Bearer ${confirm}`).send({ newPassword: PASSWORD });
    expect(ok.status).toBe(200);
  });

  it("the legacy forgot-password token works on verify-reset-otp only", async () => {
    const legacy = sign({ purpose: "PASSWORD_RESET" });
    expect((await me(legacy)).status).toBe(401);
    const wrong = await request(app).post("/auth/verify-reset-otp").set("Authorization", `Bearer ${legacy}`).send({ otp: "000000" });
    expect(wrong.status).toBe(401); // reached verifyResetOTP (bad code), not "Invalid token"
    expect(wrong.body.message ?? wrong.body.error?.message).toMatch(/OTP/i);
    resetOtpAttempts(userId);
  });

  it("step-up and MCP relay tokens are not sessions", async () => {
    expect((await me(sign({ dbAccess: true }))).status).toBe(401);
    expect((await me(sign({}))).status).toBe(200); // control
    // The relay token: the identity reads a spoke verifies it with, and nothing else.
    const relay = await mintRelayToken(userId, username);
    const bearer = (r: request.Test) => r.set("Authorization", `Bearer ${relay}`);
    expect((await bearer(request(app).get("/auth/verify"))).status).toBe(200);
    expect((await me(relay)).status).toBe(200);
    expect((await bearer(request(app).get("/access/me?app=mis"))).status).toBe(200);
    expect((await bearer(request(app).get("/auth/session"))).status).toBe(401);
    expect((await bearer(request(app).get("/reminders/me"))).status).toBe(401);
    expect((await bearer(request(app).patch("/users/me/theme")).send({ theme: "dark" })).status).toBe(401);
  });
});

describe("OTP brute force", () => {
  it("locks after repeated wrong codes and burns the outstanding code", async () => {
    resetOtpAttempts(userId);
    const res = await login();
    const temp = res.body.data.tempToken as string;
    const code = String(res.body.data.devOtp ?? (await latestOtp("LOGIN_2FA")));
    const wrongCode = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post("/auth/verify-otp").set("Authorization", `Bearer ${temp}`).send({ otp: wrongCode });
      expect(r.status).toBe(401);
    }
    expect(isOtpLocked(userId, "LOGIN_2FA")).toBe(true);
    // The right code no longer works: locked, and every outstanding code was burnt.
    expect((await request(app).post("/auth/verify-otp").set("Authorization", `Bearer ${temp}`).send({ otp: code })).status).toBe(401);
    expect(await latestOtp("LOGIN_2FA")).toBeUndefined();
    resetOtpAttempts(userId);
  });

  it("counts reset-code guesses through the forgot-password ticket too", async () => {
    resetOtpAttempts(userId);
    const [u] = await db.select({ email: User.email }).from(User).where(eq(User.user_id, userId));
    const forgot = await request(app).post("/auth/forgot-password").send({ email: u.email });
    const ticket = forgot.body.data.tempToken as string;
    let code: string | undefined;
    for (let i = 0; i < 50 && !code; i++) {
      code = await latestOtp("PASSWORD_RESET");
      if (!code) await new Promise((r) => setTimeout(r, 20));
    }
    expect(code).toBeTruthy();
    const wrongCode = code === "000000" ? "111111" : "000000";
    const verify = (otp: string) => request(app).post("/auth/verify-reset-otp").set("Authorization", `Bearer ${ticket}`).send({ otp });
    for (let i = 0; i < 5; i++) expect((await verify(wrongCode)).status).toBe(401);
    expect(isOtpLocked(userId, "PASSWORD_RESET")).toBe(true);
    expect((await verify(code!)).status).toBe(401);
    resetOtpAttempts(userId);
  });
});
