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
 *
 * GAP-C: a link without `t` is only trusted for a tenant-1 scheme created BEFORE the
 * signed links shipped (LEGACY_QR_CUTOFF, the PR #169 deploy). A later scheme with the
 * same id may be another school's document printed in the old format, or a forgery:
 * the page then asks for a re-printed copy instead of vouching for NGA's scheme.
 */
import crypto from "crypto";
import { PRIMARY_TENANT_ID } from "../vendor/nga-tenancy";

const key = () => crypto.createHash("sha256").update(`scheme-verify:${process.env.JWT_SECRET ?? "dev"}`).digest();

/** PR #169 deploy time: from here on every printed QR carries `?t=<tid>&s=<sig>`. */
export const LEGACY_QR_CUTOFF = new Date("2026-11-25T13:40:00Z");

/** Is this request an old-format link (no `t`)? */
export const isLegacyVerifyRequest = (t: unknown): boolean => t === undefined || t === null || t === "";

export const LEGACY_QR_REPRINT_MESSAGE = "This QR code is from an older format; ask the school for a re-printed copy.";

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
  if (isLegacyVerifyRequest(t)) return PRIMARY_TENANT_ID;
  const tid = Number(t);
  if (!Number.isSafeInteger(tid) || tid <= 0 || typeof s !== "string") return null;
  const want = schemeVerifySig(tid, schemeId);
  if (want.length !== s.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(s))) return null;
  return tid;
}
