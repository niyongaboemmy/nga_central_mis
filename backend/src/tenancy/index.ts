/**
 * MIS multi-tenancy -- the one import for application code.
 *
 * Contract: packages/tenancy/CONTRACT.md. Plan: MULTI_TENANCY_GAP_FIX_PLAN.md.
 *
 * Phase-3 integration points (job loops, file paths, caches, timezone, AI limiter):
 *   forEachActiveTenant(fn)       -- wrap each scheduler body (ACTIVE + GRACE only)
 *   currentTenant()/currentTid()  -- fail-closed accessors (throw TenantContextMissing)
 *   responseTenant()              -- current tenant, or the primary in shadow mode
 *   tenantKey(...)/tenantPath(app, ...)/tenantRoom(name) -- namespacing helpers
 *   runWithTenant(t, fn)          -- enter a tenant (queue jobs carry tid)
 *   runAsPlatform(fn)             -- control-plane-only code; tenant `db` refuses inside
 *   tenantHeaders()               -- X-NGA-Tenant for MIS -> spoke calls
 *   getTenant/listTenants/findTenant -- the registry (control plane, cached 30 s)
 */
export {
  PRIMARY_TENANT_ID,
  TENANT_HEADER,
  TENANCY_CORE_VERSION,
  TenantContextMissing,
  TenantMismatch,
  assertSameTenant,
  belongsToTenant,
  currentTenant,
  currentTenantOrNull,
  currentTid,
  isTenantSchedulable,
  isTenantUsable,
  normalizeTenant,
  parseTid,
  primaryTenantCtx,
  runWithTenant,
  tenantKey,
  tenantKeyFor,
  tenantPath,
  tenantPathFor,
  tenantRoom,
  tidFromClaims,
} from "../vendor/nga-tenancy";
export type { TenantCtx, TenantStatus, TenantClaims } from "../vendor/nga-tenancy";

export {
  PLATFORM_CTX,
  currentRealTenantOrNull,
  isPlatformContext,
  legacyDefaultTid,
  platformDbName,
  primaryDbName,
  requireTenantHeader,
  resolveDataTid,
  runAsPlatform,
  setTenancyMode,
  tenancyMode,
} from "./context";
export type { TenancyMode } from "./context";

export {
  findTenant,
  forEachActiveTenant,
  getTenant,
  getTenantBySlug,
  invalidateTenants,
  isControlPlaneProvisioned,
  listTenants,
  tenantRecord,
  tenantRegistry,
} from "./registry";
export { misDbNameFor } from "./dbNames";
export { responseTenant, tenantBlock, tenantClaims, tenantHeaders } from "./claims";
export {
  enterTenant,
  installExpressTenantBinding,
  primaryTenant,
  sendRefusal,
  tenantFromClaims,
  tenantMiddleware,
  tenantRefusal,
  usableTenant,
} from "./express";
export { assignSystem, assignedSystemIds, filterAssignedSystems, isSystemAssigned, unassignSystem } from "./systems";
export { lookupDirectory, queueDirectorySync, removeDirectoryUser, syncDirectoryUser, backfillDirectory } from "./directory";
export { resolveLoginTenants } from "./loginResolver";
export { createTenantRow, provisionMisTenant, dropMisTenantDatabase, CATALOG_TABLES } from "./provision";
export { runTenantMigrations, listMigrationFiles } from "./migrations";
export { bootstrapPlatform } from "./bootstrap";
export { platformAudit } from "./audit";
export { TenantScopedMap, TenantScopedSet, scopeCtx, scopeTid, scopedKey, tenantLocal } from "./scoped";
export type { TenantLocal } from "./scoped";
export { isJobRunning, runForEachTenant, tenantJob } from "./jobs";
export type { TenantJobOptions, TenantJobResult } from "./jobs";
export { DEFAULT_TIMEZONE, localToUtcMs, tenantTimezone, tzOffsetMs } from "./timezone";
