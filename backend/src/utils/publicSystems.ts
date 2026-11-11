import { eq } from "drizzle-orm";
import { primaryDb } from "../db";
import { System } from "../db/schema";
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
 * included) -- the current context's tenant unless one is passed.
 */
export const getPublicSystems = async (tenant?: TenantCtx) => {
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
  return filterAssignedSystems(systems, tenant);
};
