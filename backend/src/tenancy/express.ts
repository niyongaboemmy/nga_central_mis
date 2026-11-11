/**
 * Request-level tenant context for Express.
 *
 *  - installExpressTenantBinding(): Express middlewares that resume from a
 *    stream/event callback (multer/busboy, gunzip, on-finished) call next() from
 *    a foreign async context, which drops the AsyncLocalStorage store. The
 *    request remembers its tenant (req.tenant) and every layer re-enters it when
 *    the store went missing, so handlers after multer still see their tenant.
 *  - tenantMiddleware: the request-level default. A request carrying a valid
 *    MIS JWT (Bearer, cookie, or ?token= on GET) runs in that token's tenant;
 *    anything else runs in the primary tenant in shadow mode only (enforce: no
 *    context, so tenant data access throws until something enters one).
 *  - enterTenant(req, tenant, next): what authenticate/serviceAuth/login use.
 */
import jwt from "jsonwebtoken";
import {
  PRIMARY_TENANT_ID,
  TenantCtx,
  currentTenantOrNull,
  isTenantUsable,
  primaryTenantCtx,
  runWithTenant,
  tidFromClaims,
} from "../vendor/nga-tenancy";
import { legacyDefaultTid, tenancyMode } from "./context";
import { getTenant } from "./registry";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The tenant this request runs for (set by tenantMiddleware / authenticate / service auth). */
      tenant?: TenantCtx;
    }
  }
}

let installed = false;

export function installExpressTenantBinding(): void {
  if (installed) return;
  installed = true;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Layer = require("express/lib/router/layer");
  const handleRequest = Layer.prototype.handle_request;
  const handleError = Layer.prototype.handle_error;
  Layer.prototype.handle_request = function (req: any, res: any, next: any) {
    const t: TenantCtx | undefined = req?.tenant;
    if (t && currentTenantOrNull() !== t) return runWithTenant(t, () => handleRequest.call(this, req, res, next));
    return handleRequest.call(this, req, res, next);
  };
  Layer.prototype.handle_error = function (err: any, req: any, res: any, next: any) {
    const t: TenantCtx | undefined = req?.tenant;
    if (t && currentTenantOrNull() !== t) return runWithTenant(t, () => handleError.call(this, err, req, res, next));
    return handleError.call(this, err, req, res, next);
  };
}

/** Run the rest of the request (next) inside `tenant`. */
export function enterTenant<T>(req: any, tenant: TenantCtx, next: () => T): T {
  req.tenant = tenant;
  return runWithTenant(tenant, next);
}

// ---------------------------------------------------------------------------
// Status gates (contract §6.1)
// ---------------------------------------------------------------------------

export interface TenantRefusal {
  status: number;
  code: "TENANT_UNKNOWN" | "TENANT_PENDING" | "TENANT_SUSPENDED" | "TENANT_REQUIRED" | "TENANT_MISMATCH";
  message: string;
}

export function tenantRefusal(tenant: TenantCtx | null): TenantRefusal | null {
  if (!tenant) return { status: 401, code: "TENANT_UNKNOWN", message: "This school is not known." };
  if (tenant.status === "PENDING") return { status: 403, code: "TENANT_PENDING", message: "This school is not active yet." };
  if (!isTenantUsable(tenant.status)) return { status: 403, code: "TENANT_SUSPENDED", message: "This school's access is suspended." };
  return null;
}

export const TENANT_REQUIRED: TenantRefusal = {
  status: 401,
  code: "TENANT_REQUIRED",
  message: "This sign-in does not say which school it belongs to. Please sign in again.",
};

export function sendRefusal(res: any, r: TenantRefusal) {
  return res.status(r.status).json({ success: false, code: r.code, message: r.message });
}

/**
 * The tenant a verified MIS token speaks for: tidFromClaims with the
 * TENANCY_LEGACY_DEFAULT_TID rule, then the registry. Returns the refusal to
 * send when the token cannot be used.
 */
export async function tenantFromClaims(
  claims: any,
): Promise<{ tenant: TenantCtx; refusal: null } | { tenant: TenantCtx | null; refusal: TenantRefusal }> {
  const tid = tidFromClaims(claims, legacyDefaultTid());
  if (!tid) return { tenant: null, refusal: TENANT_REQUIRED };
  const tenant = await getTenant(tid);
  const refusal = tenantRefusal(tenant);
  if (refusal) return { tenant, refusal };
  return { tenant: tenant!, refusal: null };
}

/**
 * The registry's tenant `tid` when users may use it (ACTIVE / GRACE), else null.
 * For public endpoints whose credential names its school (a signed OAuth state,
 * a feed token, an action signature): they enter that school, never the cookie's.
 */
export async function usableTenant(tid: number | null | undefined): Promise<TenantCtx | null> {
  if (!tid || !Number.isSafeInteger(tid) || tid <= 0) return null;
  const tenant = await getTenant(tid).catch(() => null);
  return tenant && !tenantRefusal(tenant) ? tenant : null;
}

/** The primary tenant as the registry knows it (falls back to the core default). */
export async function primaryTenant(): Promise<TenantCtx> {
  return (await getTenant(PRIMARY_TENANT_ID).catch(() => null)) ?? primaryTenantCtx();
}

// ---------------------------------------------------------------------------
// The request-level default
// ---------------------------------------------------------------------------

function cookieToken(req: any): string | undefined {
  if (req.cookies?.nga_auth_token) return req.cookies.nga_auth_token;
  const raw: string | undefined = req.headers?.cookie;
  if (!raw) return undefined;
  const m = /(?:^|;\s*)nga_auth_token=([^;]+)/.exec(raw);
  return m ? decodeURIComponent(m[1]) : undefined;
}

/** A JWT the request carries (not an opaque integration token / Basic). */
export function requestJwt(req: any): string | undefined {
  const h: string | undefined = req.headers?.authorization;
  let token = typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7).trim() : undefined;
  if (!token || token.split(".").length !== 3) token = cookieToken(req);
  if (!token && req.method === "GET" && typeof req.query?.token === "string") token = req.query.token;
  return token && token.split(".").length === 3 ? token : undefined;
}

export const tenantMiddleware = async (req: any, _res: any, next: any) => {
  try {
    const token = requestJwt(req);
    if (token && process.env.JWT_SECRET) {
      let claims: any = null;
      try {
        claims = jwt.verify(token, process.env.JWT_SECRET);
      } catch {
        claims = null;
      }
      if (claims) {
        const tid = tidFromClaims(claims, legacyDefaultTid());
        const tenant = tid ? await getTenant(tid) : null;
        // A known tenant -- whatever its status: authenticate() applies the
        // gates; public routes reading data must still read *that* school.
        if (tenant) return enterTenant(req, tenant, next);
        // Unknown / missing tid: no school to run in. Shadow falls back below.
      }
    }
  } catch {
    /* registry trouble: fall through to the default */
  }
  if (tenancyMode() === "shadow") return enterTenant(req, await primaryTenant(), next);
  return next();
};
