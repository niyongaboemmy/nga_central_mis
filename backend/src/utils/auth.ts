import { db } from "../db";
import { eq, and, notLike, notInArray } from "drizzle-orm";
import { UserRole, Role, RolePermission, Permission } from "../db/schema";
import { ALL_PERMISSIONS } from "./permissions";
import { V2_ONLY_CAPABILITIES } from "../access/v2Only";

export const SUPER_ADMIN_ROLE = "SUPER_ADMIN";

/**
 * Permissions granted through the user's ACTIVE roles, straight from the DB.
 *
 * Legacy MIS permissions only: the same table also holds access control v2
 * capabilities -- the other apps' ("tm:...", "da:...", "tupo:...") and the new
 * MIS ones (access/v2Only.ts). Those must never reach req.user.permissions,
 * GET /users/me or the SSO token: the spoke apps still derive roles by
 * keyword-matching that list (e.g. anything containing "ADMIN"), and nobody's
 * current access may change until a route moves to the v2 engine. Filtering on
 * the name keeps this working whether or not migration 090 has run.
 */
export const getUserPermissions = async (userId: number): Promise<string[]> => {
  const permissions = await db
    .select({ name: Permission.name })
    .from(UserRole)
    .innerJoin(
      Role,
      and(eq(UserRole.role_id, Role.role_id), eq(Role.status, "ACTIVE"))
    )
    .innerJoin(
      RolePermission,
      and(
        eq(Role.role_id, RolePermission.role_id),
        eq(RolePermission.role_id, Role.role_id)
      )
    )
    .innerJoin(
      Permission,
      and(
        eq(RolePermission.perm_id, Permission.perm_id),
        eq(Permission.status, "ACTIVE"),
        notLike(Permission.name, "%:%"),
        notInArray(Permission.name, [...V2_ONLY_CAPABILITIES])
      )
    )
    .where(eq(UserRole.user_id, userId));

  return permissions.map((p) => p.name);
};

/** Names of the user's ACTIVE roles. */
export const getUserRoleNames = async (userId: number): Promise<string[]> => {
  const roles = await db
    .select({ name: Role.name })
    .from(UserRole)
    .innerJoin(
      Role,
      and(eq(UserRole.role_id, Role.role_id), eq(Role.status, "ACTIVE"))
    )
    .where(eq(UserRole.user_id, userId));
  return roles.map((r) => r.name);
};

/**
 * The one answer to "which permissions does this user hold" -- used by the
 * API middleware, GET /users/me, login and the SSO token so the three can
 * never disagree again.
 *
 * SUPER_ADMIN gets the union of the code catalog (ALL_PERMISSIONS, which
 * covers permissions checked in code but never seeded) and whatever the DB
 * grants the role (which covers seeded permissions the code catalog does not
 * list, e.g. SUPER_ADMIN_DASHBOARD). Before this, the middleware used only the
 * code catalog and the SSO token only the DB rows.
 */
export const getEffectivePermissions = async (
  userId: number,
): Promise<string[]> => {
  // Sequential on purpose: this runs on every authenticated request, and the
  // production pool holds a single connection.
  const roleNames = await getUserRoleNames(userId);
  const dbPermissions = await getUserPermissions(userId);
  if (!roleNames.includes(SUPER_ADMIN_ROLE)) {
    return Array.from(new Set(dbPermissions));
  }
  return Array.from(new Set([...(ALL_PERMISSIONS as string[]), ...dbPermissions]));
};
