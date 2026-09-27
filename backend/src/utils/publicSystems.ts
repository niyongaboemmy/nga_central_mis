import { eq } from "drizzle-orm";
import { db } from "../db";
import { System } from "../db/schema";

/**
 * Active systems for the app switcher, as sent to every signed-in user
 * (GET /users/me, login responses) and embedded in the SSO token.
 *
 * Never select System.client_secret here: these payloads reach every user's
 * browser and every spoke app, and the SSO token is only signed, not
 * encrypted -- anyone can read its payload.
 */
export const getPublicSystems = () =>
  db
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
