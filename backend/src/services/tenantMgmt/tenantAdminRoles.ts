/**
 * A school's own administrator (its tenant admin) and the package ceiling.
 *
 * Every school runs in its own database, so its roles and permissions are its own and
 * editing them can never reach another school. What a school may use is bounded by its
 * package: no PLATFORM_* capability (platform only) and nothing from an app or feature the
 * package lacks. This module is the one place that says which permissions a school's
 * package allows, and it keeps the school's administrator roles (SUPER_ADMIN and the
 * school_owner preset, "School Owner") holding all of them, so the person who runs the
 * school can manage everything the school paid for and nothing more.
 */
import { RowDataPacket } from "mysql2/promise";
import { poolFor } from "../../db/pools";
import logger from "../../utils/logger";
import { PRIMARY_TENANT_ID } from "../../vendor/nga-tenancy";
import { allowsCapability, invalidateEntitlements, resolveEntitlements, type Entitlements } from "./entitlements";

export interface PermissionLike {
  name: string;
  app?: string | null;
  cap_key?: string | null;
}

/** Does this school's package allow `p`? The primary school (the platform) allows everything. */
export function packageAllows(ent: Entitlements, p: PermissionLike, isPrimary: boolean): boolean {
  if (isPrimary) return true;
  return allowsCapability(ent, p.app || "mis", p.cap_key || p.name, false);
}

/** A predicate for the current school: `(permission) => allowed by its package`. */
export async function packageFilter(tid: number, isPrimary: boolean): Promise<(p: PermissionLike) => boolean> {
  if (isPrimary) return () => true;
  const ent = await resolveEntitlements(tid);
  return (p) => packageAllows(ent, p, false);
}

/** Deepest depth a READ permission offers ("summary,detail,sensitive" -> "sensitive"); null for WRITE. */
const deepest = (depths: unknown): string | null => {
  if (!depths) return null;
  const list = String(depths)
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  return list.length ? list[list.length - 1] : null;
};

/**
 * Give the school's administrator roles every permission its package allows, at the
 * deepest depth, and refresh their holders' access. Insert/upgrade only: a permission the
 * package no longer allows is simply not effective (the runtime package filter drops it),
 * so a later upgrade brings it straight back. Never touches the primary school.
 */
export async function equipTenantAdminRoles(tid: number): Promise<{ roles: number; permissions: number }> {
  if (tid === PRIMARY_TENANT_ID) return { roles: 0, permissions: 0 };
  invalidateEntitlements(tid);
  const ent = await resolveEntitlements(tid);
  const pool = poolFor(tid);
  const [perms] = await pool.query<RowDataPacket[]>(
    "SELECT perm_id, name, app, cap_key, depths FROM Permission WHERE status = 'ACTIVE' AND deprecated_at IS NULL",
  );
  const allowed = perms.filter((p) => packageAllows(ent, p as PermissionLike, false));
  const [roles] = await pool.query<RowDataPacket[]>("SELECT role_id FROM `Role` WHERE name = 'SUPER_ADMIN' OR preset_key = 'school_owner'");
  if (!roles.length || !allowed.length) return { roles: roles.length, permissions: allowed.length };
  const roleIds = roles.map((r) => Number(r.role_id));
  const rows = roleIds.flatMap((rid) => allowed.map((p) => [rid, Number(p.perm_id), deepest(p.depths)]));
  await pool.query("INSERT INTO RolePermission (role_id, perm_id, depth) VALUES ? ON DUPLICATE KEY UPDATE depth = VALUES(depth)", [rows]);
  // Holders see the change on their next request instead of after the snapshot cache expires.
  await pool
    .query(
      `UPDATE \`User\` SET access_version = access_version + 1
        WHERE user_id IN (SELECT user_id FROM (SELECT user_id FROM AccessGrant WHERE role_id IN (?) AND status = 'ACTIVE'
                                               UNION SELECT user_id FROM UserRole WHERE role_id IN (?)) holders)`,
      [roleIds, roleIds],
    )
    .catch((err) => logger.warn(`[tenantMgmt] access_version bump for t${tid} failed: ${(err as Error)?.message ?? err}`));
  return { roles: roleIds.length, permissions: allowed.length };
}
