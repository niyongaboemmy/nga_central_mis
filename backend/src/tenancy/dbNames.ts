/**
 * tid -> MIS database name, kept in sync by the registry each time it loads
 * the control plane. Synchronous on purpose: the `db` proxy resolves a pool on
 * every property access and can't await.
 */
import { PRIMARY_TENANT_ID } from "../vendor/nga-tenancy";
import { defaultTenantDbName, primaryDbName } from "./context";

const names = new Map<number, string>();

export function setTenantDbNames(entries: Array<[number, string | null | undefined]>): void {
  names.clear();
  for (const [tid, name] of entries) if (name) names.set(tid, name);
}

export function setTenantDbName(tid: number, name: string): void {
  names.set(tid, name);
}

/** Tenant 1 always uses env DB_NAME (in place); others Tenant.mis_db_name or `${DB_NAME}_t<tid>`. */
export function misDbNameFor(tid: number): string {
  if (tid === PRIMARY_TENANT_ID) return primaryDbName();
  return names.get(tid) ?? defaultTenantDbName(tid);
}

/** Database identifiers we create or USE are restricted to a safe alphabet. */
export function assertSafeDbName(name: string): string {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) throw new Error(`Unsafe database name: ${name}`);
  return name;
}
