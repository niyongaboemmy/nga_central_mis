/**
 * HTTP guards shared by the tenant-management routes.
 *
 *  - requirePlatform(cap): a signed-in primary-tenant session holding the
 *    platform capability, decided by access v2 in enforce mode (plan §4, §10).
 *  - Onboarding tokens (plan §6.2): an applicant has no tenant and no User row.
 *    The token is `aud: "nga-onboarding"`, 12 h, keyed by ApplicantAccount and
 *    its token_version. middleware/auth.ts never accepts it as a session (403
 *    TENANT_PENDING), so it reaches only the routes that use requireApplicant.
 */
import jwt from "jsonwebtoken";
import { RowDataPacket } from "mysql2/promise";
import { authenticate } from "../../middleware/auth";
import { requireCapability } from "../access/policy";
import { controlPool } from "../../db/platform";
import { currentTenantOrNull } from "../../vendor/nga-tenancy";
import { PlatformCap } from "./catalog";

export const ONBOARDING_AUDIENCE = "nga-onboarding";
const ONBOARDING_TTL = "12h";

export interface ApplicantClaims {
  sub: string;
  aid: number;
  email: string;
  tv: number;
  tstatus: "PENDING";
}

export function signOnboardingToken(account: { account_id: number; email_norm: string; token_version: number }): string {
  const claims: ApplicantClaims = {
    sub: `applicant:${account.account_id}`,
    aid: Number(account.account_id),
    email: account.email_norm,
    tv: Number(account.token_version ?? 0),
    tstatus: "PENDING",
  };
  return jwt.sign(claims, process.env.JWT_SECRET!, { audience: ONBOARDING_AUDIENCE, issuer: "nga-mis", expiresIn: ONBOARDING_TTL });
}

export function verifyOnboardingToken(token: string): ApplicantClaims | null {
  try {
    const c = jwt.verify(token, process.env.JWT_SECRET!, { audience: ONBOARDING_AUDIENCE, issuer: "nga-mis" }) as any;
    return c && Number.isSafeInteger(Number(c.aid)) ? (c as ApplicantClaims) : null;
  } catch {
    return null;
  }
}

export const isOnboardingClaims = (decoded: any): boolean => {
  const auds = Array.isArray(decoded?.aud) ? decoded.aud : decoded?.aud === undefined ? [] : [decoded.aud];
  return auds.includes(ONBOARDING_AUDIENCE);
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireApplicant: the signed-in applicant (ApplicantAccount row). */
      applicant?: { account_id: number; email_norm: string; full_name: string; phone: string | null; status: string; tenant_id: number | null };
    }
  }
}

/** Only an applicant (onboarding token, Bearer) may pass; the account must still be usable. */
export const requireApplicant = async (req: any, res: any, next: any) => {
  try {
    const h: string | undefined = req.headers?.authorization;
    const token = typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7).trim() : undefined;
    const claims = token ? verifyOnboardingToken(token) : null;
    if (!claims) return res.status(401).json({ success: false, code: "ONBOARDING_AUTH", message: "Please sign in again." });
    const [rows] = await controlPool().query<RowDataPacket[]>(
      "SELECT account_id, email_norm, full_name, phone, status, tenant_id, token_version FROM ApplicantAccount WHERE account_id = ?",
      [claims.aid],
    );
    const acc = rows[0];
    if (!acc || Number(acc.token_version) !== Number(claims.tv)) {
      return res.status(401).json({ success: false, code: "ONBOARDING_AUTH", message: "Please sign in again." });
    }
    if (acc.status === "LOCKED") return res.status(403).json({ success: false, code: "ACCOUNT_LOCKED", message: "This account is locked." });
    // Converted at go-live: the tracker may still show "Your school is live" and sign out,
    // nothing else -- the person now signs in to their school (plan §6.2).
    if (acc.status === "CONVERTED") {
      const path = String(req.path ?? "");
      const readOnly = (req.method === "GET" && (path === "/me" || /^\/applications\/\d+\/provisioning$/.test(path))) || (req.method === "POST" && path === "/logout");
      if (!readOnly) return res.status(403).json({ success: false, code: "USE_SCHOOL_LOGIN", message: "Your school is live. Sign in with the school login." });
    }
    req.applicant = {
      account_id: Number(acc.account_id),
      email_norm: String(acc.email_norm),
      full_name: String(acc.full_name),
      phone: acc.phone ?? null,
      status: String(acc.status),
      tenant_id: acc.tenant_id === null ? null : Number(acc.tenant_id),
    };
    next();
  } catch (err) {
    next(err);
  }
};

/** Platform routes: primary tenant only (404 elsewhere -- they do not exist for a school). */
export const requirePrimaryTenant = (req: any, res: any, next: any) => {
  const t = req.tenant ?? currentTenantOrNull();
  if (!t || !t.isPrimary) return res.status(404).json({ success: false, message: "Not found" });
  next();
};

/**
 * [authenticate, primary tenant, v2 capability]. Pass several caps for any-of.
 * Platform caps are school-wide (SCHOOL_ONLY in the manifest), so no target.
 */
export function requirePlatform(cap: PlatformCap | PlatformCap[]) {
  return [authenticate, requirePrimaryTenant, requireCapability(cap as string | string[])];
}

/** Does this request's snapshot hold `cap`? (after requirePlatform / requireCapability) */
export function holds(req: any, cap: string): boolean {
  return Boolean(req.access?.snapshot?.caps?.[cap]?.length);
}

/** The actor block for audit / events. */
export const platformActor = (req: any) => ({ userId: Number(req.user?.userId) || null, ip: req.ip ?? null });
