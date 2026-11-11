/**
 * Subscriptions (plan §6.7, §6.8) -- WORK PACKAGE D.
 *
 *  - onTenantInvoicePaid (the seam billing.confirmPayment calls): a RENEWAL
 *    extends the period, a CHANGE switches the package now or schedules it for
 *    the next period, and a GRACE / SUSPENDED school is reactivated.
 *  - publishTenantChanged: the one "tenant.changed" (registry + entitlements +
 *    access snapshots + TenantSystem derivation when the package moved).
 *  - Serialisers for `Subscription`, `PackageInfo`, and pricing helpers used by
 *    the tenant account routes (change requests, pro-rata).
 *
 * One ACTIVE Subscription per tenant: renewals extend that row's period_end.
 */
import { RowDataPacket } from "mysql2/promise";
import { controlPool } from "../../db/platform";
import { invalidateTenants } from "../../tenancy/registry";
import { platformAudit } from "../../tenancy/audit";
import logger from "../../utils/logger";
import { NotFoundError } from "../../errors/CustomError";
import { invalidateEntitlements } from "./entitlements";
import { assertTransition } from "./stateMachine";
import { APP_KEYS, FEATURES, LIMITS } from "./catalog";

export type Cycle = "TERM" | "YEAR";
export const CYCLE_MONTHS: Record<Cycle, number> = { TERM: 4, YEAR: 12 };

const iso = (d: any): string | null => (d ? new Date(d).toISOString() : null);
/**
 * YYYY-MM-DD of a DATE column value. mysql2 turns DATE into a Date at LOCAL
 * midnight, so the local calendar fields are the stored day (toISOString would
 * slip a day east of UTC).
 */
export const dateOnly = (d: any): string => {
  if (!(d instanceof Date)) return String(d).slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** `start` + the cycle's months, as YYYY-MM-DD (UTC). */
export function addCycle(start: string, cycle: Cycle): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + CYCLE_MONTHS[cycle]);
  return d.toISOString().slice(0, 10);
}

export const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Whole days from `now` to the end of `periodEnd` (0 on the last day, negative after). */
export function daysUntil(periodEnd: string, now = new Date()): number {
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((Date.parse(`${dateOnly(periodEnd)}T00:00:00Z`) - today) / 86_400_000);
}

export function serializeSubscription(r: RowDataPacket | null | undefined, now = new Date()) {
  if (!r) return null;
  const periodEnd = dateOnly(r.period_end);
  return {
    id: Number(r.subscription_id),
    packageCode: String(r.package_code),
    billingCycle: r.billing_cycle as Cycle,
    periodStart: dateOnly(r.period_start),
    periodEnd,
    status: r.status as "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED",
    daysLeft: Math.max(0, daysUntil(periodEnd, now)),
  };
}

/** The tenant's current subscription: the ACTIVE one, else the latest. */
export async function currentSubscriptionRow(tid: number): Promise<RowDataPacket | null> {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT * FROM Subscription WHERE tenant_id = ? ORDER BY (status = 'ACTIVE') DESC, period_end DESC, subscription_id DESC LIMIT 1",
    [tid],
  );
  return rows[0] ?? null;
}

const entLabel = (key: string) => APP_KEYS[key]?.label ?? FEATURES[key] ?? LIMITS[key]?.label ?? key;

/** `PackageInfo` rows (with entitlements). */
export async function loadPackages(filter: { publicOnly?: boolean; code?: string } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.publicOnly) where.push("is_public = 1 AND is_active = 1");
  if (filter.code) {
    where.push("code = ?");
    params.push(filter.code);
  }
  const [pkgs] = await controlPool().query<RowDataPacket[]>(
    `SELECT * FROM Package${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY tier, code`,
    params,
  );
  const codes = pkgs.map((p) => String(p.code));
  const [ents] = codes.length
    ? await controlPool().query<RowDataPacket[]>("SELECT * FROM PackageEntitlement WHERE package_code IN (?) ORDER BY kind, ent_key", [codes])
    : [[] as RowDataPacket[]];
  return pkgs.map((p) => ({
    code: String(p.code),
    name: String(p.name),
    tier: Number(p.tier),
    tagline: p.tagline ?? null,
    description: p.description ?? null,
    accent: p.accent ?? null,
    isPublic: Number(p.is_public) === 1,
    isActive: Number(p.is_active) === 1,
    priceTerm: p.price_term_rwf === null ? null : Number(p.price_term_rwf),
    priceYear: p.price_year_rwf === null ? null : Number(p.price_year_rwf),
    currency: String(p.currency ?? "RWF"),
    entitlements: (ents as RowDataPacket[])
      .filter((e) => e.package_code === p.code)
      .map((e) => ({ key: String(e.ent_key), kind: e.kind, value: e.value_int === null ? null : Number(e.value_int), label: entLabel(String(e.ent_key)) })),
  }));
}
export type PackageInfo = Awaited<ReturnType<typeof loadPackages>>[number];

export async function packageRow(code: string): Promise<RowDataPacket | null> {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM Package WHERE code = ?", [code]);
  return rows[0] ?? null;
}

export const priceOf = (pkg: RowDataPacket | null, cycle: Cycle): number =>
  Number((cycle === "YEAR" ? pkg?.price_year_rwf : pkg?.price_term_rwf) ?? 0) || 0;

/**
 * Pro-rata charge of moving from `from` to `to` for the rest of the period:
 * the price difference times the remaining fraction (never negative).
 */
export function proRata(fromPrice: number, toPrice: number, periodStart: string, periodEnd: string, now = new Date()): number {
  const total = Math.max(1, Math.round((Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${periodStart}T00:00:00Z`)) / 86_400_000));
  const left = Math.min(total, Math.max(0, daysUntil(periodEnd, now)));
  return Math.max(0, Math.round(((toPrice - fromPrice) * left) / total));
}

// ---------------------------------------------------------------------------
// tenant.changed
// ---------------------------------------------------------------------------

/**
 * Publish "tenant.changed" for `tid`: registry, entitlements and every cached
 * access snapshot are dropped (spokes refresh within their own TTL), and when
 * the package moved the TenantSystem rows are re-derived (package A).
 */
export async function publishTenantChanged(tid: number, opts: { packageChanged?: boolean } = {}): Promise<void> {
  invalidateTenants();
  invalidateEntitlements(tid);
  try {
    // Package A's one call: entitlements, registry, snapshots, TenantSystem derivation,
    // access_version bump (never throws).
    const { onEntitlementsChanged } = await import("./entitlementsChanged");
    await onEntitlementsChanged(tid);
    return;
  } catch (err) {
    logger.warn(`[tenantMgmt] onEntitlementsChanged unavailable: ${(err as Error)?.message ?? err}`);
  }
  try {
    const { clearSnapshotCache } = await import("../access/snapshotCache");
    clearSnapshotCache();
  } catch {
    /* no access engine */
  }
  if (opts.packageChanged) {
    try {
      const { deriveTenantSystems } = await import("./tenantSystems");
      await deriveTenantSystems(tid);
    } catch (err) {
      logger.warn(`[tenantMgmt] TenantSystem derivation for t${tid} skipped: ${(err as Error)?.message ?? err}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Package / status moves shared with lifecycle + jobs
// ---------------------------------------------------------------------------

/** Switch the tenant (and its ACTIVE subscription) to `code`. */
export async function setTenantPackage(tid: number, code: string): Promise<void> {
  await controlPool().query("UPDATE Tenant SET package_code = ? WHERE tenant_id = ?", [code, tid]);
  await controlPool().query("UPDATE Subscription SET package_code = ? WHERE tenant_id = ? AND status = 'ACTIVE'", [code, tid]);
}

/** GRACE / SUSPENDED -> ACTIVE (state machine), clearing the grace window. No-op when ACTIVE. */
export async function reactivateTenantRow(tid: number, reason: string | null): Promise<boolean> {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT status FROM Tenant WHERE tenant_id = ?", [tid]);
  const status = String(rows[0]?.status ?? "");
  if (!rows[0]) throw new NotFoundError("School not found");
  if (status === "ACTIVE") return false;
  assertTransition("tenant", status, "ACTIVE");
  await controlPool().query(
    "UPDATE Tenant SET status = 'ACTIVE', grace_until = NULL, suspended_at = NULL, status_reason = ? WHERE tenant_id = ?",
    [reason, tid],
  );
  return true;
}

// ---------------------------------------------------------------------------
// The seam: a tenant invoice was paid
// ---------------------------------------------------------------------------

/** Scheduled (NEXT_PERIOD) change of a tenant, if any. */
export async function scheduledChange(tid: number): Promise<RowDataPacket | null> {
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>(
      "SELECT * FROM SubscriptionChange WHERE tenant_id = ? AND status = 'SCHEDULED' ORDER BY change_id DESC LIMIT 1",
      [tid],
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * A RENEWAL or CHANGE invoice of an existing tenant was paid (billing.confirmPayment
 * calls this): extend / switch the subscription, change the package, reactivate a
 * GRACE or SUSPENDED tenant, publish tenant.changed.
 */
export async function onTenantInvoicePaid(invoiceId: number, actorId?: number | null): Promise<void> {
  const [invRows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM Invoice WHERE invoice_id = ?", [invoiceId]);
  const inv = invRows[0];
  if (!inv) throw new NotFoundError("Invoice not found");
  const tid = inv.tenant_id === null ? null : Number(inv.tenant_id);
  if (!tid) return; // an application's NEW invoice: provisioning handles it
  const kind = String(inv.kind);
  const cycle = (inv.billing_cycle ?? "TERM") as Cycle;
  const today = new Date().toISOString().slice(0, 10);
  const sub = await currentSubscriptionRow(tid);
  let packageChanged = false;

  if (kind === "RENEWAL") {
    const scheduled = await scheduledChange(tid);
    const pkg = scheduled ? String(scheduled.to_package) : String(inv.package_code);
    const subActive = sub && sub.status === "ACTIVE";
    // Paid early: the new period follows the current one; paid late: it starts today.
    const start = inv.period_start ? dateOnly(inv.period_start) : subActive && dateOnly(sub!.period_end) >= today ? dateOnly(sub!.period_end) : today;
    const end = inv.period_end ? dateOnly(inv.period_end) : addCycle(start, cycle);
    if (sub && (subActive || sub.status === "EXPIRED")) {
      await controlPool().query(
        // MySQL applies SET left to right: period_start reads the old status.
        "UPDATE Subscription SET period_start = IF(status = 'EXPIRED', ?, period_start), period_end = GREATEST(period_end, ?), status = 'ACTIVE', package_code = ?, billing_cycle = ?, invoice_id = ? WHERE subscription_id = ?",
        [start, end, pkg, cycle, invoiceId, sub.subscription_id],
      );
    } else {
      await controlPool().query(
        "INSERT INTO Subscription (tenant_id, package_code, billing_cycle, period_start, period_end, status, invoice_id) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)",
        [tid, pkg, cycle, start, end, invoiceId],
      );
    }
    const [[t]] = await controlPool().query<RowDataPacket[]>("SELECT package_code FROM Tenant WHERE tenant_id = ?", [tid]);
    if (t && String(t.package_code) !== pkg) {
      await setTenantPackage(tid, pkg);
      packageChanged = true;
    }
    if (scheduled) {
      await controlPool().query("UPDATE SubscriptionChange SET status = 'APPLIED', applied_at = NOW() WHERE change_id = ?", [scheduled.change_id]);
    }
  } else if (kind === "CHANGE") {
    let change: RowDataPacket | undefined;
    try {
      [[change]] = await controlPool().query<RowDataPacket[]>("SELECT * FROM SubscriptionChange WHERE invoice_id = ? ORDER BY change_id DESC LIMIT 1", [invoiceId]);
    } catch {
      change = undefined;
    }
    const effective = change ? String(change.effective) : "NOW";
    const to = change ? String(change.to_package) : String(inv.package_code);
    if (effective === "NOW") {
      await setTenantPackage(tid, to);
      if (cycle && sub?.status === "ACTIVE" && sub.billing_cycle !== cycle) {
        await controlPool().query("UPDATE Subscription SET billing_cycle = ? WHERE subscription_id = ?", [cycle, sub.subscription_id]);
      }
      packageChanged = true;
      if (change) await controlPool().query("UPDATE SubscriptionChange SET status = 'APPLIED', applied_at = NOW() WHERE change_id = ?", [change.change_id]);
    } else if (change && change.status === "PENDING") {
      await controlPool().query("UPDATE SubscriptionChange SET status = 'SCHEDULED' WHERE change_id = ?", [change.change_id]);
    }
  } else {
    return;
  }

  // A paid invoice brings a GRACE / SUSPENDED school back (only a RENEWAL or a
  // change that pays for the current period counts; both do here).
  const reactivated = await reactivateTenantRow(tid, null).catch((err) => {
    // ARCHIVED (or PENDING) schools are not reactivated by a payment.
    logger.warn(`[tenantMgmt] t${tid} not reactivated after invoice ${invoiceId}: ${(err as Error)?.message ?? err}`);
    return false;
  });
  await publishTenantChanged(tid, { packageChanged });
  await platformAudit({
    action: "subscription.invoice_paid",
    actorUserId: actorId ?? null,
    targetTid: tid,
    payload: { invoiceId, kind, packageChanged, reactivated },
  });
}

export { iso as isoOrNull };
