/**
 * One person, several schools.
 *
 * Every school has its own database, so a person who works in (or studies at)
 * two schools has one account in each. This module finds a person's account in
 * another school and copies it into a target school with a role of that school:
 * same e-mail, username (when free), names, phone and *password hash*, so the
 * person signs in with the password they already know (the sign-in asks which
 * school when one e-mail belongs to several -- tenancy/loginResolver.ts).
 *
 * Two doors:
 *   school side    MANAGE_USERS in the target school; finds by EXACT e-mail or
 *                  username only (no browsing other schools' people), and the copy
 *                  re-checks that identifier server-side.
 *   platform side  PLATFORM_* staff; searches every school by name / e-mail /
 *                  username / phone, and assigns to any school.
 */
import { RowDataPacket } from "mysql2/promise";
import { poolFor } from "../../db/pools";
import { ConflictError, NotFoundError, ValidationError } from "../../errors/CustomError";
import { TenantCtx, isTenantUsable, runWithTenant } from "../../vendor/nga-tenancy";
import { getTenant, listTenants } from "../../tenancy/registry";
import { lookupDirectory, normIdentifier, syncDirectoryUser } from "../../tenancy/directory";
import { platformAudit } from "../../tenancy/audit";
import logger from "../../utils/logger";

export interface PersonElsewhere {
  tid: number;
  schoolName: string;
  userId: number;
  name: string;
  email: string | null;
  username: string;
  phone: string | null;
  userType: string | null;
  roles: string[];
  /** This e-mail already has an account in the target school. */
  alreadyInTarget: boolean;
}

const one = async (tid: number, q: string, p: unknown[] = []) => ((await poolFor(tid).query<RowDataPacket[]>(q, p))[0][0] ?? null) as RowDataPacket | null;
const VALID_TYPES = ["STUDENT", "TEACHER", "ADMIN", "PARENT", "STAFF"];

/** Phone shown to another school: last 3 digits only. */
const maskPhone = (p: unknown): string | null => {
  const s = typeof p === "string" ? p.trim() : "";
  if (!s) return null;
  return s.length <= 3 ? "•••" : `${"•".repeat(Math.min(6, s.length - 3))}${s.slice(-3)}`;
};

async function usable(tid: number): Promise<TenantCtx> {
  const t = await getTenant(tid);
  if (!t || !isTenantUsable(t.status)) throw new NotFoundError("School not found");
  return t;
}

async function rolesOf(tid: number, uid: number): Promise<string[]> {
  const [rows] = await poolFor(tid).query<RowDataPacket[]>(
    "SELECT r.name FROM UserRole ur JOIN `Role` r ON r.role_id = ur.role_id WHERE ur.user_id = ? ORDER BY r.name",
    [uid],
  );
  return rows.map((r) => String(r.name));
}

async function emailInTarget(targetTid: number, email: string | null): Promise<boolean> {
  if (!email) return false;
  return !!(await one(targetTid, "SELECT user_id FROM `User` WHERE LOWER(email) = ? LIMIT 1", [email.toLowerCase()]));
}

async function personRow(tid: number, uid: number): Promise<RowDataPacket | null> {
  return one(
    tid,
    `SELECT u.user_id, u.username, u.email, u.phone_number, u.status, p.first_name, p.last_name, p.gender, p.date_of_birth, p.address, p.user_type
       FROM \`User\` u LEFT JOIN UserProfile p ON p.user_id = u.user_id WHERE u.user_id = ?`,
    [uid],
  );
}

async function describe(t: TenantCtx, r: RowDataPacket, targetTid: number, maskContact: boolean): Promise<PersonElsewhere> {
  return {
    tid: t.tid,
    schoolName: t.name,
    userId: Number(r.user_id),
    name: [r.first_name, r.last_name].filter(Boolean).join(" ") || String(r.username),
    email: r.email ?? null,
    username: String(r.username),
    phone: maskContact ? maskPhone(r.phone_number) : (r.phone_number ?? null),
    userType: r.user_type ?? null,
    roles: await rolesOf(t.tid, Number(r.user_id)),
    alreadyInTarget: await emailInTarget(targetTid, r.email ?? null),
  };
}

/**
 * School side: the ACTIVE accounts other schools hold for this exact e-mail or
 * username. Never the target school's own account.
 */
export async function findByIdentifier(identifier: unknown, targetTid: number): Promise<PersonElsewhere[]> {
  const key = normIdentifier(identifier);
  if (!key || key.length < 3) throw new ValidationError("Enter an e-mail or username");
  const hits = (await lookupDirectory(key)) ?? [];
  const out: PersonElsewhere[] = [];
  for (const h of hits) {
    if (h.tid === targetTid || String(h.status) !== "ACTIVE") continue;
    const t = await getTenant(h.tid).catch(() => null);
    if (!t || !isTenantUsable(t.status)) continue;
    try {
      const r = await personRow(t.tid, h.userId);
      if (!r || String(r.status) !== "ACTIVE") continue;
      // The directory may be stale: the identifier must still match.
      if (normIdentifier(r.email) !== key && normIdentifier(r.username) !== key) continue;
      out.push(await describe(t, r, targetTid, true));
    } catch (err) {
      logger.warn("[crossSchool] lookup in a school failed", { tid: h.tid, error: (err as Error)?.message });
    }
  }
  return out;
}

/** Platform side: search every usable school by name, e-mail, username or phone. */
export async function searchEverySchool(q: unknown, targetTid: number | null): Promise<PersonElsewhere[]> {
  const term = typeof q === "string" ? q.trim() : "";
  if (term.length < 2) return [];
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const tenants = (await listTenants()).filter((t) => isTenantUsable(t.status) && t.tid !== targetTid);
  const results = await Promise.all(
    tenants.map(async (t) => {
      try {
        const [rows] = await poolFor(t.tid).query<RowDataPacket[]>(
          `SELECT u.user_id, u.username, u.email, u.phone_number, u.status, p.first_name, p.last_name, p.user_type
             FROM \`User\` u LEFT JOIN UserProfile p ON p.user_id = u.user_id
            WHERE u.status = 'ACTIVE'
              AND (u.email LIKE ? OR u.username LIKE ? OR u.phone_number LIKE ?
                   OR CONCAT_WS(' ', p.first_name, p.last_name) LIKE ? OR CONCAT_WS(' ', p.last_name, p.first_name) LIKE ?)
            ORDER BY p.first_name, p.last_name LIMIT 10`,
          [like, like, like, like, like],
        );
        return Promise.all(rows.map((r) => describe(t, r, targetTid ?? 0, false)));
      } catch (err) {
        logger.warn("[crossSchool] search in a school failed", { tid: t.tid, error: (err as Error)?.message });
        return [];
      }
    }),
  );
  return results.flat().slice(0, 50);
}

/** Roles a person can be given in `tid` (never platform roles). */
export async function assignableRoles(tid: number, opts: { includeSuperAdmin?: boolean } = {}): Promise<Array<{ roleId: number; name: string; description: string | null }>> {
  await usable(tid);
  const hasPreset = !!(await one(tid, "SELECT 1 AS x FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND COLUMN_NAME = 'preset_key'"));
  const [rows] = await poolFor(tid).query<RowDataPacket[]>(
    `SELECT role_id, name, description FROM \`Role\`
      WHERE (status = 'ACTIVE' OR status IS NULL) ${hasPreset ? "AND (preset_key IS NULL OR preset_key NOT LIKE 'platform\\_%' OR name = 'SUPER_ADMIN')" : ""}
      ORDER BY name`,
  );
  return rows
    .filter((r) => opts.includeSuperAdmin || String(r.name) !== "SUPER_ADMIN")
    .map((r) => ({ roleId: Number(r.role_id), name: String(r.name), description: r.description ?? null }));
}

export interface CopyInput {
  sourceTid: number;
  sourceUserId: number;
  targetTid: number;
  roleIds: number[];
  actorUserId: number | null;
  /** school = MANAGE_USERS in the target; platform = console staff. */
  via: "school" | "platform";
  reason?: string | null;
  ip?: string | null;
}

/** Copy a person's account from one school into another, with roles of the target. */
export async function copyPersonInto(input: CopyInput): Promise<{ userId: number; username: string; roles: string[] }> {
  const { sourceTid, sourceUserId, targetTid, via } = input;
  if (sourceTid === targetTid) throw new ValidationError("This person is already in this school");
  const roleIds = Array.from(new Set((input.roleIds ?? []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0)));
  if (!roleIds.length) throw new ValidationError("Choose at least one role");
  const source = await usable(sourceTid);
  const target = await usable(targetTid);

  const src = await personRow(source.tid, sourceUserId);
  if (!src || String(src.status) !== "ACTIVE") throw new NotFoundError("Person not found");
  const email = src.email ? String(src.email).toLowerCase() : null;
  if (!email) throw new ConflictError("This person has no e-mail, so they can't sign in to a second school");
  if (await emailInTarget(target.tid, email)) throw new ConflictError(`${email} already has an account in ${target.name}`);
  const cred = await one(source.tid, "SELECT password_hash, force_password_change, google_id FROM AuthCredential WHERE user_id = ? LIMIT 1", [sourceUserId]);

  // Roles: of the target, active, never platform-only; SUPER_ADMIN only from a school's own admins.
  const allowed = await assignableRoles(target.tid, { includeSuperAdmin: via === "school" });
  const allowedById = new Map(allowed.map((r) => [r.roleId, r.name]));
  const bad = roleIds.filter((id) => !allowedById.has(id));
  if (bad.length) throw new ValidationError(via === "platform" ? "Unknown role (owners are added from the Admins tab)" : "Unknown role");
  const roleNames = roleIds.map((id) => allowedById.get(id)!);
  const firstType = roleNames[0].toUpperCase();
  const userType = VALID_TYPES.includes(firstType) ? firstType : src.user_type && VALID_TYPES.includes(String(src.user_type)) && src.user_type !== "STUDENT" ? String(src.user_type) : "STAFF";

  const created = await runWithTenant(target, async () => {
    const { checkPeopleLimit, PackageLimitError } = await import("./featureGate");
    const limit = await checkPeopleLimit(userType);
    if (!limit.ok) throw new PackageLimitError(limit);

    const pool = poolFor(target.tid);
    const base = String(src.username || email.split("@")[0]).slice(0, 45);
    let username = base;
    for (let i = 2; await one(target.tid, "SELECT user_id FROM `User` WHERE username = ? LIMIT 1", [username]); i++) username = `${base}${i}`;
    const [res]: any = await pool.query("INSERT INTO `User` (username, email, phone_number, status) VALUES (?, ?, ?, 'ACTIVE')", [username, email, src.phone_number ?? null]);
    const uid = Number(res.insertId);
    const { generateStudentRegistrationNumber } = await import("../../utils/registrationNumber");
    const regNo = userType === "STUDENT" ? await generateStudentRegistrationNumber() : null;
    await pool.query(
      "INSERT INTO UserProfile (user_id, first_name, last_name, gender, date_of_birth, address, user_type, registration_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [uid, src.first_name ?? null, src.last_name ?? null, src.gender ?? null, src.date_of_birth ?? null, src.address ?? null, userType, regNo],
    );
    if (cred?.password_hash) {
      // Same password in both schools. google_id is unique per school database only.
      await pool.query("INSERT INTO AuthCredential (user_id, password_hash, force_password_change, google_id) VALUES (?, ?, ?, ?)", [
        uid,
        cred.password_hash,
        Number(cred.force_password_change) === 1 ? 1 : 0,
        cred.google_id ?? null,
      ]);
    }
    for (const rid of roleIds) await pool.query("INSERT INTO UserRole (user_id, role_id) VALUES (?, ?)", [uid, rid]);
    const { applyPlacementChange } = await import("../access/ruleEngine");
    await applyPlacementChange([uid], via === "school" ? input.actorUserId : null);
    if (via === "school" && input.actorUserId) {
      const { recordActivity } = await import("../../utils/activityLogger");
      await recordActivity(uid, "USER_CREATE", `Added ${username} from ${source.name}`, "User", uid, { fromSchool: source.tid, roles: roleNames }, input.actorUserId);
    }
    return { uid, username };
  });

  await syncDirectoryUser(created.uid, target.tid).catch(() => undefined);
  await platformAudit({
    action: via === "platform" ? "platform.tenant.person_assign" : "tenant.person_import",
    targetTid: target.tid,
    actorUserId: input.actorUserId,
    ip: input.ip ?? null,
    payload: { fromTid: source.tid, fromUserId: sourceUserId, userId: created.uid, email, roles: roleNames, reason: input.reason ?? null },
  });
  return { userId: created.uid, username: created.username, roles: roleNames };
}

/** School side: copy by the exact identifier the admin looked up (re-checked here). */
export async function importByIdentifier(
  identifier: unknown,
  sourceTid: unknown,
  roleIds: unknown,
  targetTid: number,
  actorUserId: number | null,
  ip: string | null,
) {
  const matches = await findByIdentifier(identifier, targetTid);
  const hit = matches.find((m) => m.tid === Number(sourceTid));
  if (!hit) throw new NotFoundError("No account in that school matches this e-mail or username");
  return copyPersonInto({
    sourceTid: hit.tid,
    sourceUserId: hit.userId,
    targetTid,
    roleIds: Array.isArray(roleIds) ? (roleIds as number[]) : [],
    actorUserId,
    via: "school",
    ip,
  });
}

