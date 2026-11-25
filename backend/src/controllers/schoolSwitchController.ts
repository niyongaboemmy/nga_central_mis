/**
 * One person, several schools: list my schools and switch this session to
 * another one (TENANT_SWITCHING_PLAN.md §4.3).
 *
 *   GET  /auth/my-schools
 *   POST /auth/switch-school { tenant, password? }
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
 * Which schools are listed (MIS-ISO-5): accounts linked to this one (a cross-school
 * copy or an earlier switch -- tenancy/personLinks.ts), plus e-mail matches where
 * both accounts already chose their own password. Another school's roles are
 * never shown; switching still needs the proof above.
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

const ownPassword = (acc: RowDataPacket | null) => !!acc && acc.force_password_change !== null && acc.force_password_change !== undefined && Number(acc.force_password_change) === 0;

/** The schools this person can switch to (the current one first). Never throws for one bad school. */
export async function mySchools(current: TenantCtx, userId: number): Promise<MySchool[]> {
  const email = await emailOf(current.tid, userId);
  const me = await accountById(current.tid, userId);
  // tid -> how the other account is known: by a link (trusted) or by e-mail only.
  const candidates = new Map<number, { uid: number | null }>();
  for (const l of await linkedAccounts({ tid: current.tid, uid: userId })) if (!candidates.has(l.tid)) candidates.set(l.tid, { uid: l.uid });
  if (email) {
    for (const h of (await lookupDirectory(email)) ?? []) {
      if (String(h.status) === "ACTIVE" && h.tid !== current.tid && !candidates.has(h.tid)) candidates.set(h.tid, { uid: null });
    }
  }
  const out: MySchool[] = [];
  const brand = async (t: TenantCtx) => brandingFor(t).catch(() => null);
  {
    const b = await brand(current);
    out.push({ tid: current.tid, slug: current.slug, name: b?.school_name || current.name, logoUrl: b?.logoUrl ?? null, status: current.status, current: true, roles: await rolesOf(current.tid, userId).catch(() => []) });
  }
  for (const [tid, c] of candidates) {
    try {
      const t = await getTenant(tid);
      if (!t) continue;
      if (!isTenantUsable(t.status) && t.status !== "SUSPENDED") continue;
      let acc: RowDataPacket | null;
      if (c.uid) {
        acc = await accountById(tid, c.uid);
      } else {
        // E-mail only: any school can type any e-mail on its accounts, so list it only
        // when both accounts already chose their own password (no admin-set or one-time one).
        acc = email ? await accountIn(tid, email) : null;
        if (!ownPassword(acc) || !ownPassword(me)) continue;
      }
      if (!acc || String(acc.status) !== "ACTIVE") continue;
      const b = await brand(t);
      out.push({ tid, slug: t.slug, name: b?.school_name || t.name, logoUrl: b?.logoUrl ?? null, status: t.status, current: false });
    } catch (err) {
      logger.warn("[schoolSwitch] school skipped", { tid, error: (err as Error)?.message });
    }
  }
  return out.sort((a, b) => (a.current === b.current ? a.name.localeCompare(b.name) : a.current ? -1 : 1));
}

export const getMySchools = asyncHandler(async (req: any, res: any) => {
  const schools = await mySchools(req.tenant, Number(req.user.userId));
  successResponse(res, "Your schools", { schools });
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
