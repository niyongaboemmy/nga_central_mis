/**
 * The Scheme of Work verification link printed as a QR code (MIS-ISO-4).
 *
 * The verify endpoint is public (a scanner has no session), so the link itself must
 * name the school: `/verify/<schemeId>?t=<tid>&s=<sig>`, sig = HMAC(tid:schemeId).
 * The endpoint checks the signature and reads that school's database only.
 *
 * Old printed QR codes carry no `t`. Before multi-tenancy every document was NGA's,
 * so a request without `t` is read from tenant 1 (the primary school), never from
 * the scanner's session school. A `t` without a valid `s` is refused.
 */
import crypto from "crypto";
import { PRIMARY_TENANT_ID } from "../vendor/nga-tenancy";

const key = () => crypto.createHash("sha256").update(`scheme-verify:${process.env.JWT_SECRET ?? "dev"}`).digest();

export function schemeVerifySig(tid: number, schemeId: number): string {
  return crypto.createHmac("sha256", key()).update(`${tid}:${schemeId}`).digest("base64url").slice(0, 22);
}

/** The path + query the QR code encodes. */
export function schemeVerifyPath(tid: number, schemeId: number): string {
  return `/verify/${schemeId}?t=${tid}&s=${schemeVerifySig(tid, schemeId)}`;
}

/**
 * Which school a verify request reads: the signed `t`, tenant 1 for a legacy link
 * without `t`, or null when the link was tampered with.
 */
export function schemeVerifyTid(schemeId: number, t: unknown, s: unknown): number | null {
  if (t === undefined || t === null || t === "") return PRIMARY_TENANT_ID;
  const tid = Number(t);
  if (!Number.isSafeInteger(tid) || tid <= 0 || typeof s !== "string") return null;
  const want = schemeVerifySig(tid, schemeId);
  if (want.length !== s.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(s))) return null;
  return tid;
}
