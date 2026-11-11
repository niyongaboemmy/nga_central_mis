import { and, eq, inArray } from "drizzle-orm";
import { db, primaryDb } from "../db";
import { RoleSystemFragment, System, UserRole } from "../db/schema";
import { AccessGrant } from "../db/accessSchema";
import { TenantCtx } from "../vendor/nga-tenancy";
import { filterAssignedSystems } from "../tenancy/systems";

/**
 * Active systems for the app switcher, as sent to every signed-in user
 * (GET /users/me, login responses) and embedded in the SSO token.
 *
 * Never select System.client_secret here: these payloads reach every user's
 * browser and every spoke app, and the SSO token is only signed, not
 * encrypted -- anyone can read its payload.
 *
 * Multi-tenancy: System is global (primary tenant's DB); the list is filtered
 * to the systems explicitly assigned to the tenant (TenantSystem, the primary
 * included) and in its package -- the current context's tenant unless one is
 * passed.
 *
 * For a user (plan §4): a System the school has assigned to roles
 * (RoleSystemFragment, Systems -> "Assign system to role") is listed only for
 * holders of one of those roles; a System with no fragment rows is listed for
 * everyone (the behaviour before fragments were enforced).
 */
export const getPublicSystems = async (tenant?: TenantCtx, userId?: number) => {
  const systems = await primaryDb()
    .select({
      system_id: System.system_id,
      name: System.name,
      description: System.description,
      client_id: System.client_id,
      allowed_redirect_uris: System.allowed_redirect_uris,
      icon_url: System.icon_url,
      home_url: System.home_url,
      status: System.status,
      created_at: System.created_at,
    })
    .from(System)
    .where(eq(System.status, "ACTIVE"));
  const assigned = await filterAssignedSystems(systems, tenant);
  if (userId === undefined || assigned.length === 0) return assigned;
  return filterByRoleFragments(assigned, userId);
};

/** Roles the user holds: legacy UserRole rows and ACTIVE access grants. */
async function userRoleIds(userId: number): Promise<Set<number>> {
  const legacy = await db.select({ id: UserRole.role_id }).from(UserRole).where(eq(UserRole.user_id, userId));
  let granted: Array<{ id: number }> = [];
  try {
    granted = await db
      .select({ id: AccessGrant.role_id })
      .from(AccessGrant)
      .where(and(eq(AccessGrant.user_id, userId), eq(AccessGrant.status, "ACTIVE")));
  } catch {
    granted = []; // before migration 090
  }
  return new Set([...legacy, ...granted].map((r) => Number(r.id)));
}

async function filterByRoleFragments<T extends { system_id: number }>(systems: T[], userId: number): Promise<T[]> {
  const fragments = await db
    .select({ system_id: RoleSystemFragment.system_id, role_id: RoleSystemFragment.role_id })
    .from(RoleSystemFragment)
    .where(inArray(RoleSystemFragment.system_id, systems.map((s) => s.system_id)));
  if (fragments.length === 0) return systems;
  const roles = await userRoleIds(userId);
  const restricted = new Map<number, boolean>(); // system -> user holds one of its roles
  for (const f of fragments) {
    const sid = Number(f.system_id);
    restricted.set(sid, (restricted.get(sid) ?? false) || roles.has(Number(f.role_id)));
  }
  return systems.filter((s) => !restricted.has(s.system_id) || restricted.get(s.system_id));
}
