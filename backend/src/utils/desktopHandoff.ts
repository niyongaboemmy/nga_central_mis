/**
 * Browser sign-in for the NGA desktop app (repo nga-desktop), the same way
 * Postman's desktop app does it: the person signs in to MIS in their normal
 * browser (any method: Google, password + OTP, or an existing session), MIS
 * issues a short-lived one-time CODE for the app, and the app redeems it.
 *
 * PKCE (RFC 7636, S256): the app keeps a random `verifier` and sends only
 * `challenge = base64url(sha256(verifier))` through the browser. The code is
 * bound to that challenge, so a code seen in a browser, a log or by another
 * local program is useless without the verifier, which only the app has.
 *
 * Codes are signed JWTs (stateless, 2 minutes), plus an in-process
 * "already used" list so a code redeems once.
 */
import crypto from "crypto";
import jwt from "jsonwebtoken";

export const HANDOFF_TTL_SECONDS = 120;
const AUDIENCE = "nga-desktop-handoff";

/** base64url of a SHA-256 is always 43 characters. */
export const validChallenge = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

/** RFC 7636: 43–128 unreserved characters. */
export const validVerifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(value);

export const challengeOf = (verifier: string) => crypto.createHash("sha256").update(verifier).digest("base64url");

export const issueHandoffCode = (userId: number, challenge: string, secret: string): string =>
  jwt.sign({ sub: String(userId), ch: challenge }, secret, {
    audience: AUDIENCE,
    expiresIn: HANDOFF_TTL_SECONDS,
    jwtid: crypto.randomBytes(12).toString("base64url"),
  });

const used = new Map<string, number>(); // jti -> expiry (ms)

export type RedeemResult = { ok: true; userId: number } | { ok: false; reason: "invalid" | "expired" | "used" | "mismatch" };

export const redeemHandoffCode = (code: unknown, verifier: unknown, secret: string, now = Date.now()): RedeemResult => {
  if (typeof code !== "string" || !validVerifier(verifier)) return { ok: false, reason: "invalid" };
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(code, secret, { audience: AUDIENCE, clockTimestamp: Math.floor(now / 1000) }) as jwt.JwtPayload;
  } catch (e: any) {
    return { ok: false, reason: e?.name === "TokenExpiredError" ? "expired" : "invalid" };
  }
  for (const [jti, exp] of used) if (exp < now) used.delete(jti);
  if (!payload.jti || used.has(payload.jti)) return { ok: false, reason: "used" };
  used.set(payload.jti, (payload.exp ?? 0) * 1000);
  const expected = Buffer.from(String(payload.ch ?? ""));
  const actual = Buffer.from(challengeOf(verifier));
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return { ok: false, reason: "mismatch" };
  const userId = Number(payload.sub);
  return Number.isInteger(userId) && userId > 0 ? { ok: true, userId } : { ok: false, reason: "invalid" };
};
