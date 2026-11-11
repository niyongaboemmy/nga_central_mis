/**
 * Package enforcement at the edges (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §3.1, §3.3):
 *
 *   - requireFeature(key): router-mount middleware for MIS features whose routes
 *     are not fully capability-gated (e-learning, office hours, ...). Capability-
 *     gated features need nothing here -- the snapshot compiler already drops
 *     their capabilities (services/access/compile.ts).
 *   - the limit points: people (students / staff), storage, and the consumable
 *     daily allowances (AI requests, code runs), all answering 403
 *     limitRefusal(...) -- creation is refused, existing things keep working.
 *
 * Fail-open on purpose: without a control plane (R7), or while it cannot be
 * read, a school is unrestricted -- a control-plane hiccup must never lock a
 * school out of its own MIS. Primary-tenant behaviour (Max = everything) is
 * therefore unchanged.
 */
import { sql } from "drizzle-orm";
import { RowDataPacket } from "mysql2/promise";
import { db } from "../../db";
import { controlPool, isControlPlaneMissing } from "../../db/platform";
import { CustomError } from "../../errors/CustomError";
import { responseTenant } from "../../tenancy/claims";
import logger from "../../utils/logger";
import { LIMITS } from "./catalog";
import {
  Entitlements,
  LimitCheck,
  checkLimit,
  consume,
  featureRefusal,
  hasFeature,
  limitRefusal,
  resolveEntitlements,
  unrestrictedEntitlements,
} from "./entitlements";

// ---------------------------------------------------------------------------
// Entitlements, never throwing
// ---------------------------------------------------------------------------

const FALLBACK_MS = 30_000;
/** tid -> when the control plane last failed (an unrestricted answer is reused meanwhile). */
const failedAt = new Map<number, number>();

/**
 * The tenant's entitlements for an enforcement point: unrestricted when the
 * control plane cannot be read (logged; retried after 30 s, so one outage does
 * not cost every request a connect timeout).
 */
export async function safeEntitlements(tid: number): Promise<Entitlements> {
  const failed = failedAt.get(tid);
  if (failed && Date.now() - failed < FALLBACK_MS) return unrestrictedEntitlements(tid);
  try {
    return await resolveEntitlements(tid);
  } catch (err) {
    failedAt.set(tid, Date.now());
    logger.warn("[tenantMgmt] entitlements unavailable -- unrestricted for now", { tid, error: (err as any)?.message ?? err });
    return unrestrictedEntitlements(tid);
  }
}

/** The response tenant's entitlements (the primary in shadow mode). */
export const responseEntitlements = () => safeEntitlements(responseTenant().tid);

/** Forget remembered control-plane failures (onEntitlementsChanged, tests). */
export function resetEntitlementFallback(tid?: number): void {
  if (tid === undefined) failedAt.clear();
  else failedAt.delete(tid);
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

/**
 * 403 PACKAGE_FEATURE when the current tenant's package lacks `feature`.
 * Mounted ahead of a router (app.ts); passes straight through otherwise.
 */
export function requireFeature(feature: string) {
  return async (_req: any, res: any, next: any) => {
    try {
      const ent = await responseEntitlements();
      if (hasFeature(ent, feature)) return next();
      return res.status(403).json(featureRefusal(feature));
    } catch (err) {
      next(err);
    }
  };
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** A refused limit, for code paths that throw (AI providers): the error handler sends limitRefusal(...). */
export class PackageLimitError extends CustomError {
  readonly code = "PACKAGE_LIMIT";
  readonly details: ReturnType<typeof limitRefusal>;
  constructor(readonly check: LimitCheck) {
    super(check.message ?? "Your package limit is reached.", 403);
    this.details = limitRefusal(check);
  }
}

export type PeopleKind = "students" | "staff";

/** Which head-count limit a user type counts against (parents count against none). */
export function peopleKindOf(userType: string | null | undefined): PeopleKind | null {
  const t = String(userType ?? "STAFF").toUpperCase();
  if (t === "STUDENT") return "students";
  if (t === "PARENT") return null;
  return "staff";
}

/** ACTIVE students / staff (everyone but students and parents) in the current tenant's database. */
export async function countActivePeople(kind: PeopleKind): Promise<number> {
  const rows = (await db.execute(
    kind === "students"
      ? sql`SELECT COUNT(*) AS n FROM \`User\` u JOIN UserProfile p ON p.user_id = u.user_id
             WHERE u.status = 'ACTIVE' AND p.user_type = 'STUDENT'`
      : sql`SELECT COUNT(*) AS n FROM \`User\` u JOIN UserProfile p ON p.user_id = u.user_id
             WHERE u.status = 'ACTIVE' AND p.user_type NOT IN ('STUDENT', 'PARENT')`,
  )) as any;
  return Number(rows[0]?.[0]?.n ?? 0);
}

/**
 * May `delta` more people of `userType` be created in the current tenant?
 * `alreadyAdded` counts people this request created but the count may not see
 * yet (bulk import). Unlimited packages skip the count query.
 */
export async function checkPeopleLimit(userType: string | null | undefined, delta = 1, alreadyAdded = 0): Promise<LimitCheck> {
  const kind = peopleKindOf(userType);
  const key = kind === "students" ? "limit.students" : "limit.staff";
  const ent = await responseEntitlements();
  const limit = ent.unrestricted ? null : ent.limits[key] ?? null;
  if (kind === null || limit === null) return { ok: true, key, limit: null, used: 0, warn: false };
  const used = (await countActivePeople(kind)) + alreadyAdded;
  return checkLimit(ent, key, used, delta);
}

/**
 * Storage (limit.storage_gb) from the latest TenantUsageDaily.storage_mb. Unknown
 * usage (no row yet, no control plane) is never a refusal. `addMb` is the size of
 * what is being uploaded, when known.
 */
export async function checkStorageLimit(addMb = 0): Promise<LimitCheck> {
  const key = "limit.storage_gb";
  const tid = responseTenant().tid;
  const ent = await safeEntitlements(tid);
  const limitGb = ent.unrestricted ? null : ent.limits[key] ?? null;
  if (limitGb === null) return { ok: true, key, limit: null, used: 0, warn: false };
  let usedMb: number | null = null;
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>(
      "SELECT storage_mb FROM TenantUsageDaily WHERE tenant_id = ? ORDER BY day DESC LIMIT 1",
      [tid],
    );
    usedMb = rows.length ? Number(rows[0].storage_mb) : null;
  } catch (err) {
    if (!isControlPlaneMissing(err)) logger.warn("[tenantMgmt] storage usage unreadable", { tid, error: (err as any)?.message });
    usedMb = null;
  }
  if (usedMb === null) return { ok: true, key, limit: limitGb, used: 0, warn: false };
  // Compared in GB, as the package states it (rounded up to 0.01 GB).
  const usedGb = Math.ceil((usedMb / 1024) * 100) / 100;
  const addGb = Math.max(0, addMb) / 1024;
  const check = checkLimit(ent, key, usedGb, addGb);
  // A full store refuses even a tiny upload; within the limit, one upload never refuses on rounding.
  return { ...check, ok: usedGb < limitGb && check.ok };
}

/**
 * Router middleware: refuse an upload (a multipart POST / PUT / PATCH) once the
 * school's storage is used up (403 PACKAGE_LIMIT). Everything else passes, and
 * it never refuses when usage is unknown.
 */
export function requireStorage() {
  return async (req: any, res: any, next: any) => {
    const method = String(req.method ?? "").toUpperCase();
    const multipart = String(req.headers?.["content-type"] ?? "").toLowerCase().startsWith("multipart/form-data");
    if (!multipart || !["POST", "PUT", "PATCH"].includes(method)) return next();
    try {
      const declared = Number(req.headers?.["content-length"] ?? 0);
      const check = await checkStorageLimit(Number.isFinite(declared) ? declared / (1024 * 1024) : 0);
      if (check.ok) return next();
      return res.status(403).json(limitRefusal(check));
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Consume `n` units of a consumable limit for the current tenant. On the first
 * warning (>= 90 %) of a period the school owners are told once
 * (TenantUsageCounter.warned_at). Never throws for a control-plane problem.
 */
export async function consumeTenantLimit(key: string, n = 1): Promise<LimitCheck> {
  const tid = responseTenant().tid;
  let check: LimitCheck;
  try {
    // Unlimited packages still record usage (consume() counts them) for the usage pages.
    check = await consume(tid, key, n);
  } catch (err) {
    logger.warn("[tenantMgmt] usage counter unavailable -- allowed", { tid, key, error: (err as any)?.message ?? err });
    return { ok: true, key, limit: null, used: 0, warn: false };
  }
  if (check.warn) void warnOwnersOnce(tid, key, check);
  return check;
}

/** consumeTenantLimit, throwing PackageLimitError when refused. */
export async function consumeOrThrow(key: string, n = 1): Promise<LimitCheck> {
  const check = await consumeTenantLimit(key, n);
  if (!check.ok) throw new PackageLimitError(check);
  return check;
}

function periodKey(key: string, now = new Date()): string {
  const iso = now.toISOString();
  return LIMITS[key]?.consumable === "month" ? iso.slice(0, 7) : iso.slice(0, 10);
}

/** Notify the school owners the first time `key` crosses 90 % in a period. */
export async function warnOwnersOnce(tid: number, key: string, check: LimitCheck): Promise<boolean> {
  try {
    const [r] = await controlPool().query<any>(
      "UPDATE TenantUsageCounter SET warned_at = UTC_TIMESTAMP() WHERE tenant_id = ? AND ent_key = ? AND period = ? AND warned_at IS NULL",
      [tid, key, periodKey(key)],
    );
    if (Number(r?.affectedRows ?? 0) === 0) return false;
    const label = LIMITS[key]?.label ?? key;
    const { notifySchoolOwners } = await import("./notify");
    await notifySchoolOwners(tid, {
      title: `${label}: ${check.used} of ${check.limit} used`,
      body: check.ok
        ? `Your school has used 90 % of today's ${label.toLowerCase()} allowance. Upgrade your package to raise it.`
        : `Your school has used all of today's ${label.toLowerCase()} allowance. It resets tomorrow, or upgrade your package.`,
      link: "/settings/subscription",
    });
    return true;
  } catch (err) {
    logger.warn("[tenantMgmt] limit warning not sent", { tid, key, error: (err as any)?.message ?? err });
    return false;
  }
}
