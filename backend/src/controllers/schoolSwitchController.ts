/**
 * One person, several schools: list my schools and switch this session to
 * another one (TENANT_SWITCHING_PLAN.md §4.3).
 *
 *   GET  /auth/my-schools
 *   POST /auth/switch-school { tenant, password? }
 *   POST /auth/link-school { password }
 *
 * A person's accounts in different schools are linked by their e-mail (the
 * Account Directory). Switching issues the target school's session through the
 * same completeLogin as every sign-in -- so the claims, cookie (nga_auth_token +
 * nga_school), activity and response are those of a login -- then tells the
 * old school's apps to end THIS browser session (back-channel logout with sid).
 * Other devices keep their sessions (owner decision 2026-11-25).
 *
 * Proof of identity (MIS-ISO-2): the target account's password typed now, or the
 * same Google account -- only when THIS session was itself opened by Google sign-in
 * (claim amr = "google") and both accounts carry the same google_id. An equal
 * password hash is never proof: independent bcrypt hashes never match, so equality
 * only ever meant "copied", and copies no longer carry credentials.
 *
 * Which schools are listed (MIS-ISO-5, GAP-A): the current school and accounts
 * linked to this one (a cross-school copy, an earlier switch or link-school --
 * tenancy/personLinks.ts). Plain e-mail matches are only COUNTED (unlinkedCount):
 * naming them would tell an admin who typed someone's e-mail into a puppet account
 * which other school that person belongs to. The person adds such a school with
 *
 *   POST /auth/link-school { password }
 *
 * which tries the password against each unlinked match and links the first that
 * opens. Another school's roles are never shown; switching still needs the proof above.
 */
import bcrypt from "bcryptjs";
import { RowDataPacket } from "mysql2/promise";
import { asyncHandler } from "../middleware/asyncHandler";
import { poolFor } from "../db/pools";
import { completeLogin } from "./authController";
import { TenantCtx, isTenantUsable, runWithTenant } from "../vendor/nga-tenancy";
import { findTenant, getTenant } from "../tenancy/registry";
import { lookupDirectory, normIdentifier } from "../tenancy/directory";
import { holdsBillingCapability } from "../tenancy/express";
import { platformAudit } from "../tenancy/audit";
import { brandingFor } from "../routes/tenantBranding";
import { notifyLogout } from "../services/sso/backchannelLogout";
import { clientIpOf, deviceIdOf, trackAuth } from "../services/activity/authEvents";
import { checkBlocked } from "../services/activity/blocklist";
import { recordActivity } from "../utils/activityLogger";
import { successResponse } from "../utils/response";
import { isSessionId } from "../tenancy/schoolCookie";
import { linkPersons, linkedAccounts } from "../tenancy/personLinks";
import logger from "../utils/logger";

export interface MySchool {
  tid: number;
  slug: string;
  name: string;
  logoUrl: string | null;
  status: string;
  current: boolean;
  /** Only for the current school: another school's roles are not shown (MIS-ISO-5). */
  roles?: string[];
}

const one = async (tid: number, q: string, p: unknown[] = []) => ((await poolFor(tid).query<RowDataPacket[]>(q, p))[0][0] ?? null) as RowDataPacket | null;

async function accountIn(tid: number, email: string): Promise<RowDataPacket | null> {
  return one(
    tid,
    `SELECT u.user_id, u.username, u.email, u.status, a.password_hash, a.google_id, a.force_password_change
       FROM \`User\` u LEFT JOIN AuthCredential a ON a.user_id = u.user_id
      WHERE LOWER(u.email) = ? LIMIT 1`,
    [email],
  );
}

async function rolesOf(tid: number, uid: number): Promise<string[]> {
  const [rows] = await poolFor(tid).query<RowDataPacket[]>(
    "SELECT r.name FROM UserRole ur JOIN `Role` r ON r.role_id = ur.role_id WHERE ur.user_id = ? ORDER BY r.name",
    [uid],
  );
  return rows.map((r) => String(r.name));
}

async function emailOf(tid: number, uid: number): Promise<string | null> {
  const r = await one(tid, "SELECT email FROM `User` WHERE user_id = ?", [uid]);
  return normIdentifier(r?.email);
}

async function accountById(tid: number, uid: number): Promise<RowDataPacket | null> {
  return one(
    tid,
    `SELECT u.user_id, u.status, a.force_password_change
       FROM \`User\` u LEFT JOIN AuthCredential a ON a.user_id = u.user_id WHERE u.user_id = ? LIMIT 1`,
    [uid],
  );
}

const brand = async (t: TenantCtx) => brandingFor(t).catch(() => null);

async function entryFor(t: TenantCtx): Promise<MySchool> {
  const b = await brand(t);
  return { tid: t.tid, slug: t.slug, name: b?.school_name || t.name, logoUrl: b?.logoUrl ?? null, status: t.status, current: false };
}

const listable = (t: TenantCtx | null | undefined): t is TenantCtx => !!t && (isTenantUsable(t.status) || t.status === "SUSPENDED");

/**
 * Accounts with this person's e-mail in other schools that are NOT linked to this
 * account (MIS-ISO-5 / GAP-A). Any school administrator can type any e-mail on an
 * account of their school, so these are never named -- only counted -- until the
 * person proves the other account is theirs (POST /auth/link-school).
 */
async function unlinkedMatches(current: TenantCtx, userId: number, email: string | null): Promise<{ tenant: TenantCtx; uid: number; hash: string | null }[]> {
  if (!email) return [];
  const linked = new Set((await linkedAccounts({ tid: current.tid, uid: userId })).map((l) => l.tid));
  const out: { tenant: TenantCtx; uid: number; hash: string | null }[] = [];
  const seen = new Set<number>();
  for (const h of (await lookupDirectory(email)) ?? []) {
    if (String(h.status) !== "ACTIVE" || h.tid === current.tid || linked.has(h.tid) || seen.has(h.tid)) continue;
    seen.add(h.tid);
    try {
      const t = await getTenant(h.tid);
      if (!t || !isTenantUsable(t.status)) continue;
      const acc = await accountIn(h.tid, email);
      if (!acc || String(acc.status) !== "ACTIVE") continue;
      out.push({ tenant: t, uid: Number(acc.user_id), hash: acc.password_hash ? String(acc.password_hash) : null });
    } catch (err) {
      logger.warn("[schoolSwitch] e-mail match skipped", { tid: h.tid, error: (err as Error)?.message });
    }
  }
  return out;
}

export interface MySchoolsResult {
  schools: MySchool[];
  /** E-mail matches in other schools that are not linked yet: a count only, never names (GAP-A). */
  unlinkedCount: number;
}

/**
 * The schools this person can switch to (the current one first): the current school
 * plus accounts linked in PersonLink. Never throws for one bad school.
 */
export async function mySchools(current: TenantCtx, userId: number): Promise<MySchoolsResult> {
  const email = await emailOf(current.tid, userId);
  const out: MySchool[] = [];
  {
    const b = await brand(current);
    out.push({ tid: current.tid, slug: current.slug, name: b?.school_name || current.name, logoUrl: b?.logoUrl ?? null, status: current.status, current: true, roles: await rolesOf(current.tid, userId).catch(() => []) });
  }
  const seen = new Set<number>([current.tid]);
  for (const l of await linkedAccounts({ tid: current.tid, uid: userId })) {
    if (seen.has(l.tid)) continue;
    seen.add(l.tid);
    try {
      const t = await getTenant(l.tid);
      if (!listable(t)) continue;
      const acc = await accountById(l.tid, l.uid);
      if (!acc || String(acc.status) !== "ACTIVE") continue;
      out.push(await entryFor(t));
    } catch (err) {
      logger.warn("[schoolSwitch] school skipped", { tid: l.tid, error: (err as Error)?.message });
    }
  }
  const unlinkedCount = (await unlinkedMatches(current, userId, email).catch(() => [])).length;
  return { schools: out.sort((a, b) => (a.current === b.current ? a.name.localeCompare(b.name) : a.current ? -1 : 1)), unlinkedCount };
}

export const getMySchools = asyncHandler(async (req: any, res: any) => {
  const result = await mySchools(req.tenant, Number(req.user.userId));
  successResponse(res, "Your schools", result);
});

// Wrong target passwords: 5 per 15 minutes per (school, person).
const failures = new Map<string, number[]>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failKey = (tid: number, uid: number) => `${tid}:${uid}`;
function recentFailures(key: string): number {
  const now = Date.now();
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, list);
  return list.length;
}
/** Tests only. */
export const resetSwitchFailures = () => failures.clear();

const refuse = (res: any, status: number, code: string, message: string) => res.status(status).json({ success: false, code, message });

export const switchSchool = asyncHandler(async (req: any, res: any) => {
  const current: TenantCtx = req.tenant;
  const userId = Number(req.user.userId);
  const target = await findTenant(String(req.body?.tenant ?? "")).catch(() => null);
  if (!target) return refuse(res, 404, "TENANT_UNKNOWN", "This school is not known.");
  if (target.tid === current.tid) return refuse(res, 400, "SAME_SCHOOL", "You are already in this school.");
  if (!isTenantUsable(target.status) && target.status !== "SUSPENDED") {
    return refuse(res, 403, target.status === "PENDING" ? "TENANT_PENDING" : "TENANT_SUSPENDED", "This school is not available.");
  }
  if (await checkBlocked(deviceIdOf(req), clientIpOf(req)).catch(() => null)) {
    return refuse(res, 403, "BLOCKED", "Sign-in from this device or network has been blocked.");
  }

  const email = await emailOf(current.tid, userId);
  const here = await one(current.tid, "SELECT google_id FROM AuthCredential WHERE user_id = ? LIMIT 1", [userId]);
  const there = email ? await accountIn(target.tid, email) : null;
  if (!there || String(there.status) !== "ACTIVE") {
    return refuse(res, 404, "NOT_IN_SCHOOL", "You don't have an active account in this school.");
  }
  const targetUid = Number(there.user_id);

  // Proof (MIS-ISO-2): the same Google account when this session came from Google
  // sign-in, else the target password now. Never an equal password hash.
  const key = failKey(target.tid, targetUid);
  const sameGoogle = req.user?.amr === "google" && !!here?.google_id && !!there.google_id && String(here.google_id) === String(there.google_id);
  if (!sameGoogle) {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!password) {
      return refuse(res, 403, "PASSWORD_REQUIRED", `Enter your password for ${target.name}.`);
    }
    if (recentFailures(key) >= MAX_FAILURES) {
      return refuse(res, 429, "TOO_MANY_ATTEMPTS", "Too many wrong passwords. Try again in 15 minutes.");
    }
    const ok = !!there.password_hash && (await bcrypt.compare(password, String(there.password_hash)));
    if (!ok) {
      failures.get(key)!.push(Date.now());
      trackAuth(req, { kind: "login", outcome: "failure", reason: "school_switch_bad_password", userId, usernameAttempted: email ?? undefined });
      return refuse(res, 403, "WRONG_PASSWORD", `That isn't your password for ${target.name}.`);
    }
  }
  failures.delete(key);

  // A SUSPENDED school lets its billing owners in only (as at sign-in).
  if (target.status === "SUSPENDED" && !(await runWithTenant(target, () => holdsBillingCapability(targetUid)))) {
    return refuse(res, 403, "TENANT_SUSPENDED", "This school's access is suspended.");
  }

  // The old school: this browser session's apps end (other devices stay), audit.
  const oldSid = isSessionId(req.user?.sid) ? req.user.sid : null;
  void runWithTenant(current, () => notifyLogout(userId, { sid: oldSid })).catch(() => undefined);
  await recordActivity(userId, "SCHOOL_SWITCH", `Switched to ${target.name}`, "User", userId, { toTid: target.tid }, userId).catch(() => undefined);
  void platformAudit({
    action: "auth.switch_school",
    targetTid: target.tid,
    actorUserId: userId,
    ip: clientIpOf(req) ?? null,
    payload: { fromTid: current.tid, fromUserId: userId, toUserId: targetUid, proof: sameGoogle ? "google" : "password" },
  });
  // Proven to be the same person: my-schools trusts this pair from now on.
  await linkPersons({ tid: current.tid, uid: userId }, { tid: target.tid, uid: targetUid }, "switch");

  // The new school's session: exactly a sign-in (cookie, claims, nga_school, response).
  req.tenant = target;
  await runWithTenant(target, () => completeLogin(targetUid, res, "SCHOOL_SWITCH", req, { amr: sameGoogle ? "google" : "pwd" }));
});

/**
 * POST /auth/link-school { password } (GAP-A): the person proves that an unlinked
 * account with their e-mail in another school is theirs by typing THAT account's
 * password. Tried against each unlinked ACTIVE match in a usable school, one after
 * the other, stopping at the first that opens; that pair is linked (PersonLink via
 * 'password') and the school is returned in the my-schools shape (no roles). A miss
 * never says which school(s) were tried. Rate-limited like switch-school: 5 wrong
 * passwords per 15 minutes per current (school, person).
 */
export const linkSchool = asyncHandler(async (req: any, res: any) => {
  const current: TenantCtx = req.tenant;
  const userId = Number(req.user.userId);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password) return refuse(res, 400, "PASSWORD_REQUIRED", "Enter the password you use at the other school.");
  if (await checkBlocked(deviceIdOf(req), clientIpOf(req)).catch(() => null)) {
    return refuse(res, 403, "BLOCKED", "Sign-in from this device or network has been blocked.");
  }
  const key = `link:${failKey(current.tid, userId)}`;
  if (recentFailures(key) >= MAX_FAILURES) {
    return refuse(res, 429, "TOO_MANY_ATTEMPTS", "Too many wrong passwords. Try again in 15 minutes.");
  }

  const email = await emailOf(current.tid, userId);
  let found: { tenant: TenantCtx; uid: number } | null = null;
  for (const m of await unlinkedMatches(current, userId, email)) {
    if (m.hash && (await bcrypt.compare(password, m.hash))) {
      found = { tenant: m.tenant, uid: m.uid };
      break;
    }
  }

  if (!found) {
    failures.get(key)!.push(Date.now());
    trackAuth(req, { kind: "login", outcome: "failure", reason: "school_link_bad_password", userId, usernameAttempted: email ?? undefined });
    void platformAudit({ action: "auth.link_school", targetTid: current.tid, actorUserId: userId, ip: clientIpOf(req) ?? null, payload: { fromTid: current.tid, fromUserId: userId, outcome: "failure" } });
    return refuse(res, 403, "WRONG_PASSWORD", "That password doesn't open another school account with your e-mail.");
  }
  failures.delete(key);

  await linkPersons({ tid: current.tid, uid: userId }, { tid: found.tenant.tid, uid: found.uid }, "password");
  await recordActivity(userId, "SCHOOL_LINK", `Added ${found.tenant.name} to my schools`, "User", userId, { toTid: found.tenant.tid }, userId).catch(() => undefined);
  void platformAudit({
    action: "auth.link_school",
    targetTid: found.tenant.tid,
    actorUserId: userId,
    ip: clientIpOf(req) ?? null,
    payload: { fromTid: current.tid, fromUserId: userId, toUserId: found.uid, outcome: "linked", proof: "password" },
  });
  successResponse(res, "School added", { school: await entryFor(found.tenant) });
});
