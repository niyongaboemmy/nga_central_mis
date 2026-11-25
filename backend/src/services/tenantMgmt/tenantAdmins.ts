/**
 * A school's administrators, seen and managed from the primary console
 * (Schools → a school → Admins).
 *
 * The console otherwise shows aggregates only (§6.9 / §10). Administrators are the
 * one exception: platform staff must know who runs a school and be able to give it
 * a new administrator when the only one left, lost their access, or changed. Only
 * administrators are listed -- never teachers, students or parents.
 *
 * Two kinds, the same as provisioning:
 *   OWNER   legacy SUPER_ADMIN role + the `school_owner` preset grant (max 2 holders)
 *   ADMIN   legacy ADMIN role + the `school_administrator` preset grant
 *
 * A new person gets a one-time password with force_password_change = 1, e-mailed
 * to them and shown once to the operator. An existing user with that e-mail is
 * promoted, and keeps their password.
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { RowDataPacket } from "mysql2/promise";
import { controlPool } from "../../db/platform";
import { poolFor } from "../../db/pools";
import { ConflictError, NotFoundError, ValidationError } from "../../errors/CustomError";
import { PRIMARY_TENANT_ID, TenantCtx, runWithTenant } from "../../vendor/nga-tenancy";
import { getTenant } from "../../tenancy/registry";
import { syncDirectoryUser } from "../../tenancy/directory";
import { platformAudit } from "../../tenancy/audit";
import { sendMail } from "./notify";

export type AdminKind = "OWNER" | "ADMIN";

export interface TenantAdmin {
  userId: number;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  status: string;
  kind: AdminKind;
  /** Role labels this person holds (School Owner, SUPER_ADMIN ...). */
  roles: string[];
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
}

const KIND: Record<AdminKind, { legacy: string; preset: string; title: string; userType: string }> = {
  OWNER: { legacy: "SUPER_ADMIN", preset: "school_owner", title: "School Owner", userType: "ADMIN" },
  ADMIN: { legacy: "ADMIN", preset: "school_administrator", title: "School Administrator", userType: "ADMIN" },
};
/** platform_owner = the legacy SUPER_ADMIN role in a catalog copied from the primary. */
const ADMIN_PRESETS = ["school_owner", "school_administrator", "platform_owner"];
const LEGACY = ["SUPER_ADMIN", "ADMIN"];

const iso = (d: any): string | null => (d ? new Date(d).toISOString() : null);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Actor = { userId: number | null; ip: string | null };

async function usableTenant(tid: number, write: boolean): Promise<TenantCtx> {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT status FROM Tenant WHERE tenant_id = ?", [tid]);
  if (!rows[0]) throw new NotFoundError("School not found");
  const status = String(rows[0].status);
  if (status === "ARCHIVED") throw new ConflictError("This school is archived");
  if (status === "PENDING") throw new ConflictError("This school is still being set up");
  if (write && tid === PRIMARY_TENANT_ID) {
    // The primary's SUPER_ADMIN is the platform owner: never granted from here.
    throw new ConflictError("The primary school's administrators are managed in its own Access settings");
  }
  const tenant = await getTenant(tid);
  if (!tenant) throw new NotFoundError("School not found");
  return tenant;
}

const one = async (tid: number, q: string, p: unknown[] = []) => ((await poolFor(tid).query<RowDataPacket[]>(q, p))[0][0] ?? null) as RowDataPacket | null;

async function hasColumn(tid: number, table: string, column: string): Promise<boolean> {
  return !!(await one(tid, "SELECT 1 AS x FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column]));
}

/** Every administrator of the school, owners first. */
export async function listTenantAdmins(tid: number): Promise<TenantAdmin[]> {
  await usableTenant(tid, false);
  const pool = poolFor(tid);
  const grantsOk = await hasColumn(tid, "Role", "preset_key");
  const [legacy] = await pool.query<RowDataPacket[]>(
    "SELECT ur.user_id, r.name FROM UserRole ur JOIN `Role` r ON r.role_id = ur.role_id WHERE r.name IN (?)",
    [LEGACY],
  );
  let grants: RowDataPacket[] = [];
  if (grantsOk) {
    [grants] = await pool.query<RowDataPacket[]>(
      `SELECT g.user_id, r.name, r.preset_key FROM AccessGrant g JOIN \`Role\` r ON r.role_id = g.role_id
        WHERE g.status = 'ACTIVE' AND r.preset_key IN (?)`,
      [ADMIN_PRESETS],
    );
  }
  const byUser = new Map<number, { roles: Set<string>; owner: boolean }>();
  const add = (uid: number, label: string, owner: boolean) => {
    const e = byUser.get(uid) ?? { roles: new Set<string>(), owner: false };
    e.roles.add(label);
    e.owner = e.owner || owner;
    byUser.set(uid, e);
  };
  for (const r of legacy) add(Number(r.user_id), String(r.name), r.name === "SUPER_ADMIN");
  for (const g of grants) {
    if (g.preset_key === "platform_owner" && tid !== PRIMARY_TENANT_ID) continue; // the SUPER_ADMIN row already says it
    add(Number(g.user_id), g.preset_key === "school_owner" ? "School Owner" : g.preset_key === "platform_owner" ? "Platform Owner" : "School Administrator", g.preset_key !== "school_administrator");
  }
  if (!byUser.size) return [];

  const ids = Array.from(byUser.keys());
  const lastLogin = (await hasColumn(tid, "AnalyticsUserState", "last_login_at"))
    ? "(SELECT st.last_login_at FROM AnalyticsUserState st WHERE st.user_id = u.user_id LIMIT 1)"
    : "NULL";
  const [users] = await pool.query<RowDataPacket[]>(
    `SELECT u.user_id, u.username, u.email, u.phone_number, u.status, u.created_at,
            p.first_name, p.last_name, a.force_password_change, a.locked_until, ${lastLogin} AS last_login_at
       FROM \`User\` u
       LEFT JOIN UserProfile p ON p.user_id = u.user_id
       LEFT JOIN AuthCredential a ON a.user_id = u.user_id
      WHERE u.user_id IN (?)`,
    [ids],
  );
  return users
    .map((u) => {
      const e = byUser.get(Number(u.user_id))!;
      const locked = u.locked_until && new Date(u.locked_until).getTime() > Date.now() ? iso(u.locked_until) : null;
      return {
        userId: Number(u.user_id),
        name: [u.first_name, u.last_name].filter(Boolean).join(" ") || String(u.username),
        username: String(u.username),
        email: u.email ?? null,
        phone: u.phone_number ?? null,
        status: String(u.status ?? "ACTIVE"),
        kind: (e.owner ? "OWNER" : "ADMIN") as AdminKind,
        roles: Array.from(e.roles),
        mustChangePassword: Number(u.force_password_change) === 1,
        lockedUntil: locked,
        lastLoginAt: iso(u.last_login_at),
        createdAt: iso(u.created_at),
      };
    })
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "OWNER" ? -1 : 1));
}

export const tempPassword = (): string => {
  // 12 characters, no look-alikes, always a digit and a letter of each case.
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digit = "23456789";
  const chars = [pick(lower), pick(upper), pick(digit)];
  while (chars.length < 12) chars.push(pick(lower + upper + digit));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

async function setTempPassword(tid: number, uid: number): Promise<string> {
  const pw = tempPassword();
  const hash = await bcrypt.hash(pw, 12);
  const pool = poolFor(tid);
  if (await one(tid, "SELECT auth_id FROM AuthCredential WHERE user_id = ? LIMIT 1", [uid])) {
    await pool.query("UPDATE AuthCredential SET password_hash = ?, force_password_change = 1, failed_attempts = 0, locked_until = NULL WHERE user_id = ?", [hash, uid]);
  } else {
    await pool.query("INSERT INTO AuthCredential (user_id, password_hash, force_password_change) VALUES (?, ?, 1)", [uid, hash]);
  }
  return pw;
}

async function mailCredentials(tenant: TenantCtx, to: string | null, name: string, username: string, pw: string, intro: string): Promise<boolean> {
  if (!to) return false;
  return sendMail(
    to,
    `Your ${tenant.name} administrator account`,
    `Hello ${name},\n\n${intro}\n\nSchool address: ${tenant.slug}\nUsername: ${username} (or this e-mail)\nTemporary password: ${pw}\n\nYou will choose your own password when you sign in.`,
    `/login?tenant=${encodeURIComponent(tenant.slug)}`,
    "Sign in",
  );
}

export interface CreateAdminInput {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  kind?: unknown;
  reason?: unknown;
}

/** Add an administrator: a new user, or an existing one (same e-mail) promoted. */
export async function createTenantAdmin(
  tid: number,
  input: CreateAdminInput,
  actor: Actor,
): Promise<{ admin: TenantAdmin; created: boolean; tempPassword: string | null; emailed: boolean }> {
  const tenant = await usableTenant(tid, true);
  const firstName = String(input.firstName ?? "").trim().slice(0, 100);
  const lastName = String(input.lastName ?? "").trim().slice(0, 100);
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 150);
  const phone = String(input.phone ?? "").trim().slice(0, 20) || null;
  const kind = String(input.kind ?? "ADMIN").toUpperCase() as AdminKind;
  const reason = String(input.reason ?? "").trim().slice(0, 255);
  const errors: string[] = [];
  if (!firstName) errors.push("First name is required");
  if (!EMAIL_RE.test(email)) errors.push("A valid e-mail is required");
  if (!KIND[kind]) errors.push("Kind must be OWNER or ADMIN");
  if (reason.length < 3) errors.push("A reason is required");
  if (errors.length) throw new ValidationError(errors.join(". "));
  const k = KIND[kind];

  const result = await runWithTenant(tenant, async () => {
    const pool = poolFor(tid);
    const registry = await import("../access/registry");
    if (await registry.accessTablesPresent()) await registry.runAccessBootstrap();

    const preset = await one(tid, "SELECT role_id, name, max_holders FROM `Role` WHERE preset_key = ? LIMIT 1", [k.preset]);
    if (!preset) throw new ConflictError(`The ${k.title} role is missing from this school's catalog`);
    let legacy = await one(tid, "SELECT role_id FROM `Role` WHERE name = ? LIMIT 1", [k.legacy]);
    if (!legacy && kind === "OWNER") {
      const id = await registry.insertRoleWithNextId({
        name: "SUPER_ADMIN",
        description: "Runs this school: every permission inside the school, nothing platform-wide.",
        category: "School",
        allowed_scope_types: "SCHOOL",
      });
      legacy = { role_id: id } as any;
    }

    let user = await one(tid, "SELECT user_id, username, status FROM `User` WHERE LOWER(email) = ? LIMIT 1", [email]);
    if (user && String(user.status) !== "ACTIVE") throw new ConflictError(`${email} belongs to a deactivated account; reactivate it in the school first`);
    const uid0 = user ? Number(user.user_id) : 0;

    if (preset.max_holders) {
      const held = await one(
        tid,
        "SELECT COUNT(DISTINCT user_id) AS n FROM AccessGrant WHERE role_id = ? AND status = 'ACTIVE' AND user_id <> ?",
        [preset.role_id, uid0],
      );
      if (Number(held?.n ?? 0) >= Number(preset.max_holders)) {
        throw new ConflictError(`${preset.name} already has its maximum of ${preset.max_holders} holders. Remove one first, or add this person as an administrator.`);
      }
    }
    if (uid0 && (await one(tid, "SELECT grant_id FROM AccessGrant WHERE user_id = ? AND role_id = ? AND status = 'ACTIVE' LIMIT 1", [uid0, preset.role_id]))) {
      throw new ConflictError(`${email} is already ${k.title === "School Owner" ? "an owner" : "an administrator"} of this school`);
    }

    let created = false;
    let pw: string | null = null;
    if (!user) {
      const { checkPeopleLimit, PackageLimitError } = await import("./featureGate");
      const limit = await checkPeopleLimit(k.userType);
      if (!limit.ok) throw new PackageLimitError(limit);
      const base = (email.split("@")[0] || "admin").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40) || "admin";
      let username = base;
      for (let i = 2; await one(tid, "SELECT user_id FROM `User` WHERE username = ? LIMIT 1", [username]); i++) username = `${base}${i}`;
      const [res]: any = await pool.query("INSERT INTO `User` (username, email, phone_number, status) VALUES (?, ?, ?, 'ACTIVE')", [username, email, phone]);
      user = { user_id: res.insertId, username } as any;
      await pool.query("INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (?, ?, ?, ?)", [res.insertId, firstName, lastName, k.userType]);
      pw = await setTempPassword(tid, Number(res.insertId));
      created = true;
    }
    const uid = Number(user!.user_id);
    if (!created && !(await one(tid, "SELECT auth_id FROM AuthCredential WHERE user_id = ? LIMIT 1", [uid]))) {
      pw = await setTempPassword(tid, uid); // an account that never had a password
    }

    if (legacy && !(await one(tid, "SELECT user_id FROM UserRole WHERE user_id = ? AND role_id = ? LIMIT 1", [uid, legacy.role_id]))) {
      await pool.query("INSERT INTO UserRole (user_id, role_id) VALUES (?, ?)", [uid, legacy.role_id]);
    }
    await pool.query(
      `INSERT INTO AccessGrant (user_id, role_id, school_id, scope_type, source, status, title, justification)
       VALUES (?, ?, ?, 'SCHOOL', 'MANUAL', 'ACTIVE', ?, ?)`,
      [uid, preset.role_id, tid, k.title, `Added by platform staff: ${reason}`.slice(0, 500)],
    );
    await pool.query("UPDATE `User` SET access_version = access_version + 1 WHERE user_id = ?", [uid]).catch(() => undefined);
    await pool
      .query("INSERT INTO AccessAudit (actor_id, subject_user_id, action, target, reason) VALUES (NULL, ?, 'grant.create', ?, ?)", [
        uid,
        JSON.stringify({ role: k.preset, scope: "SCHOOL", by: "platform", platformUserId: actor.userId }),
        `Platform staff: ${reason}`.slice(0, 255),
      ])
      .catch(() => undefined);
    return { uid, username: String(user!.username), created, pw };
  });

  await syncDirectoryUser(result.uid, tid).catch(() => undefined);
  const emailed = result.pw
    ? await mailCredentials(
        tenant,
        email,
        firstName || email,
        result.username,
        result.pw,
        `You are now ${kind === "OWNER" ? "an owner" : "an administrator"} of ${tenant.name}.`,
      )
    : await sendMail(email, `You are now ${kind === "OWNER" ? "an owner" : "an administrator"} of ${tenant.name}`, `Sign in with your usual password.`, `/login?tenant=${encodeURIComponent(tenant.slug)}`, "Sign in");
  await platformAudit({
    action: "platform.tenant.admin_add",
    targetTid: tid,
    actorUserId: actor.userId,
    ip: actor.ip,
    payload: { userId: result.uid, email, kind, created: result.created, reason },
  });
  const admin = (await listTenantAdmins(tid)).find((a) => a.userId === result.uid)!;
  return { admin, created: result.created, tempPassword: result.pw, emailed };
}

async function adminOf(tid: number, uid: number): Promise<TenantAdmin> {
  const admin = (await listTenantAdmins(tid)).find((a) => a.userId === uid);
  if (!admin) throw new NotFoundError("This person is not an administrator of the school");
  return admin;
}

/** A new one-time password (and unlock) for an administrator who can't sign in. */
export async function resetTenantAdminPassword(tid: number, uid: number, reason: unknown, actor: Actor): Promise<{ admin: TenantAdmin; tempPassword: string; emailed: boolean }> {
  const tenant = await usableTenant(tid, true);
  const why = String(reason ?? "").trim().slice(0, 255);
  if (why.length < 3) throw new ValidationError("A reason is required");
  const admin = await adminOf(tid, uid);
  if (admin.status !== "ACTIVE") throw new ConflictError("This account is deactivated");
  const pw = await setTempPassword(tid, uid);
  // Every session of the old password ends.
  await poolFor(tid).query("UPDATE `User` SET token_version = token_version + 1 WHERE user_id = ?", [uid]).catch(() => undefined);
  const emailed = await mailCredentials(tenant, admin.email, admin.name, admin.username, pw, `Platform support reset your password for ${tenant.name}.`);
  await platformAudit({ action: "platform.tenant.admin_reset_password", targetTid: tid, actorUserId: actor.userId, ip: actor.ip, payload: { userId: uid, reason: why } });
  return { admin: await adminOf(tid, uid), tempPassword: pw, emailed };
}

/** End someone's administrator access (the account itself stays). Never the last owner. */
export async function removeTenantAdmin(tid: number, uid: number, reason: unknown, actor: Actor): Promise<{ ok: true }> {
  const tenant = await usableTenant(tid, true);
  const why = String(reason ?? "").trim().slice(0, 255);
  if (why.length < 3) throw new ValidationError("A reason is required");
  const all = await listTenantAdmins(tid);
  const admin = all.find((a) => a.userId === uid);
  if (!admin) throw new NotFoundError("This person is not an administrator of the school");
  if (admin.kind === "OWNER" && all.filter((a) => a.kind === "OWNER" && a.status === "ACTIVE" && a.userId !== uid).length === 0) {
    throw new ConflictError("A school always keeps at least one active owner. Add another owner first.");
  }
  await runWithTenant(tenant, async () => {
    const pool = poolFor(tid);
    await pool.query(
      `UPDATE AccessGrant g JOIN \`Role\` r ON r.role_id = g.role_id
          SET g.status = 'ENDED', g.ended_at = NOW(), g.end_reason = ?
        WHERE g.user_id = ? AND g.status = 'ACTIVE' AND r.preset_key IN (?)`,
      [`Platform staff: ${why}`.slice(0, 255), uid, ADMIN_PRESETS],
    );
    await pool.query("DELETE ur FROM UserRole ur JOIN `Role` r ON r.role_id = ur.role_id WHERE ur.user_id = ? AND r.name IN (?)", [uid, LEGACY]);
    await pool.query("UPDATE `User` SET access_version = access_version + 1 WHERE user_id = ?", [uid]).catch(() => undefined);
    await pool
      .query("INSERT INTO AccessAudit (actor_id, subject_user_id, action, target, reason) VALUES (NULL, ?, 'grant.end', ?, ?)", [
        uid,
        JSON.stringify({ roles: admin.roles, by: "platform", platformUserId: actor.userId }),
        `Platform staff: ${why}`.slice(0, 255),
      ])
      .catch(() => undefined);
  });
  await platformAudit({ action: "platform.tenant.admin_remove", targetTid: tid, actorUserId: actor.userId, ip: actor.ip, payload: { userId: uid, roles: admin.roles, reason: why } });
  return { ok: true };
}
