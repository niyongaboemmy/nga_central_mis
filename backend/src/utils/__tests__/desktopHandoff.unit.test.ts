import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { challengeOf, issueHandoffCode, redeemHandoffCode, validChallenge, validVerifier } from "../desktopHandoff";

const secret = "test-secret";
const verifier = crypto.randomBytes(32).toString("base64url");

describe("desktop browser sign-in hand-off (PKCE)", () => {
  it("challenge is the base64url SHA-256 of the verifier", () => {
    expect(validVerifier(verifier)).toBe(true);
    expect(validChallenge(challengeOf(verifier))).toBe(true);
    expect(validChallenge("short")).toBe(false);
  });

  it("redeems once, for the right verifier only", () => {
    const code = issueHandoffCode(42, challengeOf(verifier), secret);
    const other = crypto.randomBytes(32).toString("base64url");
    expect(redeemHandoffCode(code, other, secret)).toEqual({ ok: false, reason: "mismatch" });
    // A failed attempt still burns the code.
    expect(redeemHandoffCode(code, verifier, secret)).toEqual({ ok: false, reason: "used" });

    const fresh = issueHandoffCode(42, challengeOf(verifier), secret);
    expect(redeemHandoffCode(fresh, verifier, secret)).toEqual({ ok: true, userId: 42 });
    expect(redeemHandoffCode(fresh, verifier, secret)).toEqual({ ok: false, reason: "used" });
  });

  it("expires after two minutes and rejects foreign tokens", () => {
    const code = issueHandoffCode(7, challengeOf(verifier), secret);
    expect(redeemHandoffCode(code, verifier, secret, Date.now() + 121_000)).toEqual({ ok: false, reason: "expired" });
    expect(redeemHandoffCode(code, verifier, "other-secret")).toEqual({ ok: false, reason: "invalid" });
    expect(redeemHandoffCode("not-a-jwt", verifier, secret)).toEqual({ ok: false, reason: "invalid" });
    expect(redeemHandoffCode(code, "bad verifier!", secret)).toEqual({ ok: false, reason: "invalid" });
  });
});
