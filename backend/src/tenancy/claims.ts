/**
 * Token contract v2 (CONTRACT.md §2): the claims and the `tenant` block MIS
 * adds to every token and identity response.
 */
import { TENANT_HEADER, TenantCtx, primaryTenantCtx } from "../vendor/nga-tenancy";
import { currentRealTenantOrNull } from "./context";

/** The tenant identity responses speak for: the context's, else (shadow) the primary. */
export function responseTenant(): TenantCtx {
  return currentRealTenantOrNull() ?? primaryTenantCtx();
}

/** `{tid, tslug, tstatus, pkg}` for a session / SSO / temp token. */
export function tenantClaims(t: TenantCtx = responseTenant()) {
  return { tid: t.tid, tslug: t.slug, tstatus: t.status, pkg: t.pkg };
}

/** The `tenant: TenantCtx` block of /auth/verify, /users/me, /sso/token, /access/me. */
export function tenantBlock(t: TenantCtx = responseTenant()): TenantCtx {
  return {
    tid: t.tid,
    slug: t.slug,
    name: t.name,
    status: t.status,
    isPrimary: t.isPrimary,
    timezone: t.timezone,
    pkg: t.pkg,
  };
}

/** Headers for an MIS -> spoke call made inside a tenant context (contract §3). */
export function tenantHeaders(): Record<string, string> {
  const t = currentRealTenantOrNull();
  return t ? { [TENANT_HEADER]: String(t.tid) } : {};
}
