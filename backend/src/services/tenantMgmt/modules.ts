/**
 * Modules (System rows) and the schools they are switched on for.
 *
 * A module is global: one System row, in the primary tenant's database. Whether a
 * school has it is a TenantSystem row in the control plane:
 *
 *   source PACKAGE   the school's package (or an entitlement override) includes it;
 *                    written by deriveTenantSystems() and re-derived on every change
 *   source OVERRIDE  the platform switched it on or off for that school by hand;
 *                    it stays as set until the platform changes it
 *   no row           never switched on: the module is off for that school
 *
 * Built-in apps (Task Mentor, Tendo, Tupo) also need the APP entitlement: a
 * TenantSystem row alone does not open an app the package does not include
 * (tenancy/systems.ts systemRefusal).
 *
 * This file is the one place that answers "which modules does this school have"
 * and "which schools have this module" for the screens that manage them: the
 * platform console (school -> Plan & apps), Modules -> a module's schools, and
 * the school's own System Assignments.
 */
import { RowDataPacket } from "mysql2/promise";
import { sql } from "drizzle-orm";
import { primaryDb } from "../../db";
import { controlPool, isControlPlaneMissing } from "../../db/platform";
import { NotFoundError, ValidationError } from "../../errors/CustomError";
import { APP_KEYS, isModuleKey, moduleIdOfKey, moduleKey } from "./catalog";
import { Entitlements, resolveEntitlements } from "./entitlements";

export interface ModuleRow {
  systemId: number;
  name: string;
  description: string | null;
  clientId: string | null;
  iconUrl: string | null;
  /** System.status: a DISABLED module is off for everyone, whatever a school's switch says. */
  moduleStatus: "ACTIVE" | "DISABLED";
}

const TTL_MS = 15_000;
let cached: { at: number; rows: ModuleRow[] } | null = null;

/** Drop the module list cache (a module was created, renamed or deleted). */
export function invalidateModules(): void {
  cached = null;
}

/** Every module, built-in apps included, in the order they were added. */
export async function listModules(): Promise<ModuleRow[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rows;
  let rows: ModuleRow[] = [];
  try {
    const res = (await primaryDb().execute(
      sql`SELECT system_id, name, description, client_id, icon_url, status FROM \`System\` ORDER BY system_id`,
    )) as any;
    rows = (res[0] as RowDataPacket[]).map((r) => ({
      systemId: Number(r.system_id),
      name: String(r.name),
      description: r.description ?? null,
      clientId: r.client_id ?? null,
      iconUrl: r.icon_url ?? null,
      moduleStatus: String(r.status) === "ACTIVE" ? "ACTIVE" : "DISABLED",
    }));
  } catch {
    rows = []; // no System table (a bare test database)
  }
  cached = { at: Date.now(), rows };
  return rows;
}

/** The built-in app's entitlement key ("app.taskmentor") of a module, by its SSO client id; else null. */
export const builtInKeyOf = (clientId: string | null): string | null =>
  clientId ? Object.entries(APP_KEYS).find(([, v]) => v.client === clientId)?.[0] ?? null : null;

/** The APP entitlement key a package uses for this module: the built-in key, or "module.<id>". */
export const entitlementKeyOf = (m: Pick<ModuleRow, "systemId" | "clientId">): string => builtInKeyOf(m.clientId) ?? moduleKey(m.systemId);

/**
 * Labels for module entitlement keys ("module.7" -> "Ganzaa"), for every screen
 * that names a package's contents. A key whose module was deleted keeps its key
 * as the label; the package editor no longer offers it.
 */
export async function moduleLabels(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const m of await listModules()) if (!builtInKeyOf(m.clientId)) out.set(moduleKey(m.systemId), m.name);
  return out;
}

/** Package editor rows for the modules that are not built-in apps. */
export async function moduleCatalogRows(): Promise<Array<{ key: string; kind: "APP"; value: null; label: string; module: true }>> {
  return (await listModules())
    .filter((m) => !builtInKeyOf(m.clientId))
    .map((m) => ({ key: moduleKey(m.systemId), kind: "APP" as const, value: null, label: m.name, module: true as const }));
}

/** The module ids the entitlements name ("module.<id>" keys). */
export const entitledModuleIds = (ent: Entitlements): Set<number> =>
  new Set(ent.apps.filter(isModuleKey).map((k) => moduleIdOfKey(k)!).filter((n) => Number.isInteger(n)));

export interface SchoolModule {
  systemId: number;
  name: string;
  description: string | null;
  clientId: string | null;
  iconUrl: string | null;
  /** The built-in app key, or null for a module the platform added. */
  key: string | null;
  /** The key a package uses to include it. */
  entitlementKey: string;
  status: "ACTIVE" | "DISABLED";
  /** NONE: never switched on for this school. */
  source: "PACKAGE" | "OVERRIDE" | "NONE";
  /** The school's package (or an override) includes it. */
  inPackage: boolean;
  /** A built-in app the package does not include: switching it on would still not open it. */
  needsPackage: boolean;
  moduleStatus: "ACTIVE" | "DISABLED";
}

async function tenantSystemRows(where: string, params: unknown[]): Promise<RowDataPacket[]> {
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>(`SELECT tenant_id, system_id, status, source FROM TenantSystem ${where}`, params);
    return rows;
  } catch (err) {
    if (isControlPlaneMissing(err)) return [];
    throw err;
  }
}

/** Every module, with its state for school `tid` (off when the school has no row for it). */
export async function schoolModules(tid: number, ent?: Entitlements): Promise<SchoolModule[]> {
  const e = ent ?? (await resolveEntitlements(tid));
  const rows = new Map((await tenantSystemRows("WHERE tenant_id = ?", [tid])).map((r) => [Number(r.system_id), r]));
  return (await listModules()).map((m) => {
    const row = rows.get(m.systemId);
    const key = builtInKeyOf(m.clientId);
    const entitlementKey = key ?? moduleKey(m.systemId);
    const inPackage = e.unrestricted || e.apps.includes(entitlementKey);
    return {
      systemId: m.systemId,
      name: m.name,
      description: m.description,
      clientId: m.clientId,
      iconUrl: m.iconUrl,
      key,
      entitlementKey,
      status: row && String(row.status) === "ACTIVE" ? "ACTIVE" : "DISABLED",
      source: row ? (String(row.source) === "PACKAGE" ? "PACKAGE" : "OVERRIDE") : "NONE",
      inPackage,
      needsPackage: key !== null && !inPackage,
      moduleStatus: m.moduleStatus,
    };
  });
}

export interface ModuleSchool {
  tid: number;
  name: string;
  slug: string;
  isPrimary: boolean;
  lifecycle: string;
  pkg: string;
  status: "ACTIVE" | "DISABLED";
  source: "PACKAGE" | "OVERRIDE" | "NONE";
  inPackage: boolean;
  needsPackage: boolean;
}

export async function moduleById(systemId: number): Promise<ModuleRow> {
  const m = (await listModules()).find((x) => x.systemId === systemId);
  if (!m) {
    invalidateModules();
    const again = (await listModules()).find((x) => x.systemId === systemId);
    if (!again) throw new NotFoundError("Module not found");
    return again;
  }
  return m;
}

/** Every school (archived ones left out), with this module's state there. */
export async function moduleSchools(systemId: number): Promise<{ module: ModuleRow & { key: string | null; entitlementKey: string }; schools: ModuleSchool[] }> {
  const m = await moduleById(systemId);
  const key = builtInKeyOf(m.clientId);
  const entitlementKey = key ?? moduleKey(m.systemId);
  let tenants: RowDataPacket[] = [];
  try {
    [tenants] = await controlPool().query<RowDataPacket[]>(
      "SELECT tenant_id, slug, display_name, status, is_primary, package_code FROM Tenant WHERE status <> 'ARCHIVED' ORDER BY is_primary DESC, display_name",
    );
  } catch (err) {
    if (!isControlPlaneMissing(err)) throw err;
  }
  const rows = new Map((await tenantSystemRows("WHERE system_id = ?", [systemId])).map((r) => [Number(r.tenant_id), r]));
  const schools: ModuleSchool[] = [];
  for (const t of tenants) {
    const tid = Number(t.tenant_id);
    const ent = await resolveEntitlements(tid);
    const row = rows.get(tid);
    const inPackage = ent.unrestricted || ent.apps.includes(entitlementKey);
    schools.push({
      tid,
      name: String(t.display_name),
      slug: String(t.slug),
      isPrimary: Number(t.is_primary) === 1,
      lifecycle: String(t.status),
      pkg: String(t.package_code),
      status: row && String(row.status) === "ACTIVE" ? "ACTIVE" : "DISABLED",
      source: row ? (String(row.source) === "PACKAGE" ? "PACKAGE" : "OVERRIDE") : "NONE",
      inPackage,
      needsPackage: key !== null && !inPackage,
    });
  }
  return { module: { ...m, key, entitlementKey }, schools };
}

/** The tenant ids a "switch on for ..." request names: a list of ids, or "all" (every school that is not archived). */
export async function resolveSchoolIds(value: unknown): Promise<number[]> {
  if (value === "all") {
    const [rows] = await controlPool().query<RowDataPacket[]>("SELECT tenant_id FROM Tenant WHERE status <> 'ARCHIVED'");
    return rows.map((r) => Number(r.tenant_id));
  }
  if (!Array.isArray(value)) throw new ValidationError("Choose the schools.");
  const ids = [...new Set(value.map((v) => Number(v)))];
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) throw new ValidationError("Choose the schools.");
  return ids;
}
