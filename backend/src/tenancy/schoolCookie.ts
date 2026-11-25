/**
 * The selected school, shared with every NGA app (TENANT_SWITCHING_PLAN.md §4.2).
 *
 *   nga_school = "<tid>.<sid>"   on COOKIE_DOMAIN (.amashuri.com), NOT httpOnly
 *
 * Set at every sign-in and school switch, cleared at sign-out. It carries no
 * credential: each app's school guard compares it with its own session's school
 * and, on a difference, signs in again through the MIS SSO -- which always lands
 * in the school of the real (httpOnly) MIS session. Forging it can only cause a
 * round trip. `sid` is the MIS browser session id (the `sid` claim).
 */
import crypto from "crypto";
import config from "../config";

export const SCHOOL_COOKIE = "nga_school";

export const newSessionId = (): string => crypto.randomBytes(9).toString("base64url");

const SID_RE = /^[A-Za-z0-9_-]{8,32}$/;
export const isSessionId = (v: unknown): v is string => typeof v === "string" && SID_RE.test(v);

export function setSchoolCookie(res: any, tid: number, sid: string): void {
  res.cookie(SCHOOL_COOKIE, `${tid}.${sid}`, {
    httpOnly: false,
    secure: config.nodeEnv === "production",
    sameSite: "lax",
    domain: config.cookieDomain,
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
  });
}

export function clearSchoolCookie(res: any): void {
  res.clearCookie(SCHOOL_COOKIE, { domain: config.cookieDomain, path: "/" });
}

export function parseSchoolCookie(raw: unknown): { tid: number; sid: string } | null {
  const m = typeof raw === "string" ? /^(\d{1,9})\.([A-Za-z0-9_-]{8,32})$/.exec(raw) : null;
  return m ? { tid: Number(m[1]), sid: m[2] } : null;
}
