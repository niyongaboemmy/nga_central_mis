/**
 * Service scopes of a System's Basic client credentials ([MIS-A11]).
 *
 * Before migration 127 a System's client id + secret was granted every scope
 * it asked for. System.scopes now lists what it may do: NULL keeps that legacy
 * behaviour (and is what a server without 127 reads), a list is enforced.
 * Migration 127 backfills every existing System to KNOWN_SERVICE_SCOPES, so
 * nothing changes until an operator narrows a list.
 *
 * Read with raw SQL on purpose: adding the column to the shared `System`
 * Drizzle object would break `select().from(System)` on un-migrated servers.
 */
import { sql } from "drizzle-orm";
import { primaryDb } from "../db";

/** Every scope requireServiceToken() is asked for today (+ tenants:read, contract §4). */
export const KNOWN_SERVICE_SCOPES = [
  "access:publish",
  "access:read",
  "activity:write",
  "ai-gateway:invoke",
  "ai-policy:read",
  "competency:write",
  "early-warning:write",
  "learning-events:write",
  "mentorship:read",
  "profiles:read",
  "reminders:write",
  "sync:read",
  "tenants:read",
] as const;

export function parseScopes(value: unknown): string[] | null {
  if (value === null) return null;
  const list = Array.isArray(value) ? value : String(value ?? "").split(/[,\s]+/);
  return Array.from(new Set(list.map((s) => String(s).trim()).filter(Boolean))).sort();
}

const missingColumn = (err: any) => err?.code === "ER_BAD_FIELD_ERROR" || err?.cause?.code === "ER_BAD_FIELD_ERROR";

/** null = legacy (every scope); otherwise the System's scope list. */
export async function readSystemScopes(systemId: number): Promise<string[] | null> {
  try {
    const result: any = await primaryDb().execute(sql`SELECT scopes FROM System WHERE system_id = ${systemId} LIMIT 1`);
    const rows = Array.isArray(result) ? result[0] : result;
    const raw = rows?.[0]?.scopes;
    return raw === null || raw === undefined ? null : parseScopes(raw);
  } catch (err) {
    if (missingColumn(err)) return null;
    throw err;
  }
}

export async function writeSystemScopes(systemId: number, scopes: string[] | null): Promise<void> {
  try {
    await primaryDb().execute(sql`UPDATE System SET scopes = ${scopes ? scopes.join(",") : null} WHERE system_id = ${systemId}`);
  } catch (err) {
    if (!missingColumn(err)) throw err;
  }
}
