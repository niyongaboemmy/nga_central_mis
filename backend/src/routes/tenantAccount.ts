import express from "express";
import multer from "multer";
import { RowDataPacket } from "mysql2/promise";
import { authenticate } from "../middleware/auth";
import { requireCapability } from "../services/access/policy";
import { controlPool } from "../db/platform";
import { NotFoundError, ValidationError } from "../errors/CustomError";
import { TENANT_CAPS } from "../services/tenantMgmt/catalog";
import { resolveEntitlements } from "../services/tenantMgmt/entitlements";
import { checkUpload, PLATFORM_UPLOAD_MAX_BYTES } from "../services/tenantMgmt/files";
import {
  Cycle,
  currentSubscriptionRow,
  daysUntil,
  dateOnly,
  loadPackages,
  packageRow,
  priceOf,
  proRata,
  serializeSubscription,
} from "../services/tenantMgmt/subscription";
import { nearLimit, tenantUsage, usageMeters } from "../services/tenantMgmt/usage";
import { TenantActionError } from "../services/tenantMgmt/lifecycle";
import { grantSession, listTenantSessions, revokeSession } from "../services/tenantMgmt/support";
import { dismissSetup, isSetupDismissed, setupItems } from "../services/tenantMgmt/setup";
import { platformAudit } from "../tenancy/audit";

/**
 * The school's own account (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.6, §6.7,
 * §6.9, §7) -- contract: `tenantApi` in frontend/src/api/tenantMgmt.ts. Mounted at
 * /tenant after the public branding router. Everything speaks for the session's
 * own school (req.tenant); nothing here takes a tenant id from the client.
 */
const router = express.Router();

const iso = (d: any): string | null => (d ? new Date(d).toISOString() : null);
const ok = (res: any, data: unknown) => res.json({ success: true, data });
type H = (req: any, res: any) => Promise<unknown>;
const wrap = (fn: H) => (req: any, res: any, next: any) => fn(req, res).catch(next);
const idParam = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ValidationError("Invalid id");
  return n;
};

const BILLING = [authenticate, requireCapability(TENANT_CAPS.billing)];
const SETTINGS = [authenticate, requireCapability(TENANT_CAPS.settings)];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PLATFORM_UPLOAD_MAX_BYTES } });

const tidOf = (req: any): number => Number(req.tenant?.tid ?? req.user?.tid ?? 1);

async function tenantRowOf(tid: number): Promise<RowDataPacket | null> {
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM Tenant WHERE tenant_id = ?", [tid]);
    return rows[0] ?? null;
  } catch {
    return null; // no control plane: a single-school install
  }
}

const entView = (e: Awaited<ReturnType<typeof resolveEntitlements>>) => ({
  pkg: e.pkg,
  unrestricted: e.unrestricted,
  apps: e.apps,
  features: e.features,
  limits: e.limits,
});

async function billing() {
  return import("../services/tenantMgmt/billing");
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function pendingChange(tid: number) {
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>(
      "SELECT * FROM SubscriptionChange WHERE tenant_id = ? AND status IN ('PENDING','SCHEDULED') ORDER BY change_id DESC LIMIT 1",
      [tid],
    );
    const c = rows[0];
    return c ? { invoiceId: Number(c.invoice_id), packageCode: String(c.to_package), effective: c.effective as "NOW" | "NEXT_PERIOD" } : null;
  } catch {
    return null;
  }
}

// --- banner state (any signed-in user) ---------------------------------------

router.get(
  "/status",
  authenticate,
  wrap(async (req, res) => {
    const tid = tidOf(req);
    const t = await tenantRowOf(tid);
    const ent = await resolveEntitlements(tid);
    const status = (t?.status ?? req.tenant?.status ?? "ACTIVE") as string;
    let daysLeft: number | null = null;
    if (t?.grace_until && status === "GRACE") daysLeft = Math.max(0, daysUntil(dateOnly(new Date(t.grace_until)), new Date()));
    else if (status === "ACTIVE" && t && Number(t.is_primary) !== 1) {
      const sub = await safe(() => currentSubscriptionRow(tid), null);
      daysLeft = sub && sub.status === "ACTIVE" ? Math.max(0, daysUntil(dateOnly(sub.period_end))) : null;
    }
    const warnings = nearLimit(await usageMeters(tid, ent));
    ok(res, { status, graceUntil: iso(t?.grace_until), daysLeft, warnings, entitlements: entView(ent) });
  }),
);

// --- subscription -------------------------------------------------------------

router.get(
  "/subscription",
  ...BILLING,
  wrap(async (req, res) => {
    const tid = tidOf(req);
    const t = await tenantRowOf(tid);
    const ent = await resolveEntitlements(tid);
    const subRow = await safe(() => currentSubscriptionRow(tid), null);
    const pkgCode = String(t?.package_code ?? ent.pkg);
    const [pkg] = await safe(() => loadPackages({ code: pkgCode }), []);
    const options = await safe(() => loadPackages({ publicOnly: true }), []);
    const invoices = await safe(async () => (await billing()).invoicesForTenant(tid, "tenant"), [] as any[]);
    ok(res, {
      tenant: {
        tid,
        slug: String(t?.slug ?? req.tenant?.slug ?? ""),
        name: String(t?.display_name ?? req.tenant?.name ?? ""),
        status: (t?.status ?? "ACTIVE") as string,
        isPrimary: tid === 1 || Number(t?.is_primary) === 1,
        graceUntil: iso(t?.grace_until),
      },
      package: pkg ?? { code: pkgCode, name: pkgCode, tier: 0, tagline: null, description: null, accent: null, isPublic: false, isActive: true, priceTerm: null, priceYear: null, currency: "RWF", entitlements: [] },
      entitlements: entView(ent),
      subscription: serializeSubscription(subRow),
      usage: await tenantUsage(tid, ent),
      options,
      openInvoices: invoices.filter((i: any) => ["ISSUED", "OVERDUE"].includes(i.status)),
      paymentInstructions: await safe(async () => (await billing()).activePaymentInstructions(), [] as any[]),
      pendingChange: await pendingChange(tid),
    });
  }),
);

router.get(
  "/usage",
  ...BILLING,
  wrap(async (req, res) => ok(res, await tenantUsage(tidOf(req)))),
);

/**
 * Upgrade / downgrade request -> a CHANGE invoice.
 *   upgrade, NOW (default): the price difference for the rest of the period (pro-rata),
 *     applied once the invoice is paid;
 *   NEXT_PERIOD (default for a downgrade, the only option for one): 0 now, the next
 *     renewal is drafted on the new package.
 */
router.post(
  "/subscription/change-request",
  ...BILLING,
  wrap(async (req, res) => {
    const tid = tidOf(req);
    const t = await tenantRowOf(tid);
    if (!t) throw new TenantActionError(409, "NO_CONTROL_PLANE", "This installation has no subscriptions.");
    if (tid === 1 || Number(t.is_primary) === 1) throw new TenantActionError(409, "PRIMARY_TENANT", "The primary school has no subscription to change.");
    const code = typeof req.body?.packageCode === "string" ? req.body.packageCode.trim().toLowerCase() : "";
    const to = code ? await packageRow(code) : null;
    if (!to || Number(to.is_active) !== 1) throw new ValidationError("Choose an available package.");
    const fromCode = String(t.package_code);
    if (fromCode === code) throw new ValidationError("This is already your package.");
    const from = await packageRow(fromCode);
    if (await pendingChange(tid)) throw new TenantActionError(409, "CHANGE_PENDING", "A package change is already waiting. Pay or cancel it first.");

    const sub = await currentSubscriptionRow(tid);
    const cycle = ((req.body?.billingCycle === "YEAR" || req.body?.billingCycle === "TERM" ? req.body.billingCycle : sub?.billing_cycle) ?? "TERM") as Cycle;
    const upgrade = Number(to.tier) > Number(from?.tier ?? 0);
    const effective: "NOW" | "NEXT_PERIOD" = upgrade && req.body?.effective !== "NEXT_PERIOD" ? "NOW" : "NEXT_PERIOD";
    const today = new Date().toISOString().slice(0, 10);
    const periodStart = sub ? dateOnly(sub.period_start) : today;
    const periodEnd = sub ? dateOnly(sub.period_end) : today;
    const amount = effective === "NOW" ? proRata(priceOf(from, cycle), priceOf(to, cycle), periodStart, periodEnd) : 0;

    const b = await billing();
    const invoiceId = await b.createInvoice({
      kind: "CHANGE",
      tenantId: tid,
      packageCode: code,
      billingCycle: cycle,
      periodStart: effective === "NOW" ? today : periodEnd,
      periodEnd: effective === "NOW" ? periodEnd : null,
      amount,
      lines: [{ label: `${from?.name ?? fromCode} → ${to.name}${effective === "NOW" ? " (rest of the current period)" : " (from the next period)"}`, amount }],
      notes: effective === "NOW" ? "Upgrade, effective once paid" : "Change at the next renewal",
      issue: effective === "NOW" && amount > 0,
      createdBy: Number(req.user.userId),
    });
    await controlPool().query(
      "INSERT INTO SubscriptionChange (tenant_id, invoice_id, from_package, to_package, billing_cycle, effective, status, amount, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [tid, invoiceId, fromCode, code, cycle, effective, effective === "NEXT_PERIOD" ? "SCHEDULED" : "PENDING", amount, Number(req.user.userId)],
    );
    await platformAudit({ action: "subscription.change_request", targetTid: tid, payload: { invoiceId, from: fromCode, to: code, effective, amount, by: Number(req.user.userId) } });
    ok(res, { invoice: await b.getInvoice(invoiceId, "tenant"), effective });
  }),
);

// --- invoices -----------------------------------------------------------------

async function ownInvoice(req: any) {
  const id = idParam(req.params.id);
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT tenant_id FROM Invoice WHERE invoice_id = ?", [id]);
  if (!rows[0] || Number(rows[0].tenant_id) !== tidOf(req)) throw new NotFoundError("Invoice not found");
  return id;
}

router.get(
  "/invoices",
  ...BILLING,
  wrap(async (req, res) => ok(res, await (await billing()).invoicesForTenant(tidOf(req), "tenant"))),
);

router.get(
  "/invoices/:id/pdf",
  ...BILLING,
  wrap(async (req, res) => {
    const id = await ownInvoice(req);
    await (await billing()).sendInvoicePdf(res, id);
  }),
);

router.post(
  "/invoices/:id/payments",
  ...BILLING,
  upload.single("proof"),
  wrap(async (req, res) => {
    const id = await ownInvoice(req);
    const bad = checkUpload(req.file, false);
    if (bad) throw new ValidationError(bad);
    const body = {
      method: String(req.body?.method ?? "") as any,
      reference: String(req.body?.reference ?? "").trim(),
      amount: Number(req.body?.amount),
      paidAt: String(req.body?.paidAt ?? ""),
    };
    const payment = await (await billing()).submitPayment(id, body, req.file, { kind: "TENANT", id: Number(req.user.userId) });
    ok(res, payment);
  }),
);

// --- support sessions (§6.9) --------------------------------------------------

router.get(
  "/support-sessions",
  ...BILLING,
  wrap(async (req, res) => ok(res, await listTenantSessions(tidOf(req)))),
);

router.post(
  "/support-sessions",
  ...BILLING,
  wrap(async (req, res) => {
    if (req.user?.support) return res.status(403).json({ success: false, code: "SUPPORT_SESSION", message: "A support session can't grant support access." });
    ok(res, await grantSession(tidOf(req), Number(req.user.userId), req.body ?? {}));
  }),
);

router.delete(
  "/support-sessions/:id",
  ...BILLING,
  wrap(async (req, res) => ok(res, await revokeSession(tidOf(req), Number(req.user.userId), idParam(req.params.id)))),
);

// --- first-run setup (§6.6) ---------------------------------------------------

router.get(
  "/setup",
  ...SETTINGS,
  wrap(async (req, res) => {
    const tid = tidOf(req);
    ok(res, { items: await setupItems(tid), dismissed: await isSetupDismissed(tid) });
  }),
);

router.post(
  "/setup/dismiss",
  ...SETTINGS,
  wrap(async (req, res) => {
    await dismissSetup(tidOf(req), Number(req.user.userId));
    ok(res, { ok: true });
  }),
);

export default router;
