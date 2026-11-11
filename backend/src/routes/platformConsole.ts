import express from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { NotFoundError } from "../errors/CustomError";
import { PLATFORM_CAPS, PLATFORM_CAP_LIST, PlatformCap } from "../services/tenantMgmt/catalog";
import { holds, requirePlatform } from "../services/tenantMgmt/guards";
import { Actor } from "../services/tenantMgmt/applicationStore";
import { streamPlatformFile } from "../services/tenantMgmt/files";
import * as review from "../services/tenantMgmt/review";
import * as billing from "../services/tenantMgmt/billing";
import * as packagesAdmin from "../services/tenantMgmt/packagesAdmin";
import * as console_ from "../services/tenantMgmt/overview";

/**
 * Platform console (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.3, §6.4, §7;
 * work package C): overview, application review, invoices and payments,
 * payment instructions, packages, settings, audit. Contract:
 * frontend/src/api/tenantMgmt.ts `platformApi`.
 *
 * Every route: primary tenant only (404 for a school -- the console does not
 * exist there), signed in, and an access v2 PLATFORM_* capability.
 * Envelope { success, data }; errors { success:false, code?, message }.
 *
 * /platform/tenants*, /platform/provisioning*, /platform/support-sessions* are
 * routes/platformTenants.ts (package D).
 */
const router = express.Router();

/** A school's session never learns the console exists -- not even with a 401/403. */
const notForSchools = (req: any, res: any, next: any) => {
  if (req.tenant && !req.tenant.isPrimary) return res.status(404).json({ success: false, message: "Not found" });
  next();
};
const guard = (cap: PlatformCap | PlatformCap[]) => [notForSchools, ...requirePlatform(cap)];

const C = PLATFORM_CAPS;
const ANY = PLATFORM_CAP_LIST as PlatformCap[];
const APPLICATION_READ: PlatformCap[] = [C.review, C.decide, C.invoice, C.confirm];
const BILLING_READ: PlatformCap[] = [C.invoice, C.confirm, C.waive, C.decide];
const PROOF_READ: PlatformCap[] = [C.invoice, C.confirm, C.waive];
const CATALOG_READ: PlatformCap[] = [C.view, C.packages];

const ok = (res: any, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const actorOf = (req: any): Actor => ({ kind: "PLATFORM", id: Number(req.user?.userId) || null, ip: req.ip ?? null });
const userId = (req: any) => Number(req.user?.userId);
const idParam = (v: string) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new NotFoundError("Not found");
  return n;
};
const capsOf = (req: any) => ({ review: holds(req, C.review), decide: holds(req, C.decide) });
const detail = async (req: any, res: any) => ok(res, await review.getDetail(idParam(req.params.id), capsOf(req)));

// ---------------------------------------------------------------------------
// Overview, staff
// ---------------------------------------------------------------------------

router.get("/overview", guard(ANY), asyncHandler(async (req: any, res) => {
  ok(res, await console_.overview(PLATFORM_CAP_LIST.filter((c) => holds(req, c))));
}));

router.get("/staff", guard(ANY), asyncHandler(async (_req, res) => ok(res, await console_.platformStaff())));

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

router.get("/applications", guard(APPLICATION_READ), asyncHandler(async (req: any, res) => {
  const q = req.query;
  ok(
    res,
    await review.listQueue(
      {
        status: q.status ? String(q.status) : undefined,
        package: q.package ? String(q.package) : undefined,
        q: q.q ? String(q.q) : undefined,
        mine: q.mine === "true" || q.mine === "1",
      },
      userId(req),
    ),
  );
}));

router.get("/applications/:id", guard(APPLICATION_READ), asyncHandler(detail));

router.post("/applications/:id/assign", guard(C.review), asyncHandler(async (req: any, res) => {
  const raw = req.body?.userId;
  await review.assign(idParam(req.params.id), raw === null || raw === undefined || raw === "" ? null : Number(raw), actorOf(req));
  await detail(req, res);
}));

router.post("/applications/:id/start-review", guard(C.review), asyncHandler(async (req: any, res) => {
  await review.startReview(idParam(req.params.id), actorOf(req));
  await detail(req, res);
}));

router.post("/applications/:id/request-changes", guard(C.review), asyncHandler(async (req: any, res) => {
  await review.requestChanges(idParam(req.params.id), req.body?.message, actorOf(req));
  await detail(req, res);
}));

router.post("/applications/:id/reject", guard(C.decide), asyncHandler(async (req: any, res) => {
  await review.reject(idParam(req.params.id), req.body?.reason, actorOf(req));
  await detail(req, res);
}));

router.post("/applications/:id/approve", guard(C.decide), asyncHandler(async (req: any, res) => {
  await review.approve(idParam(req.params.id), req.body ?? {}, actorOf(req));
  await detail(req, res);
}));

router.post("/applications/:id/reopen", guard(C.review), asyncHandler(async (req: any, res) => {
  await review.reopen(idParam(req.params.id), req.body?.reason, actorOf(req));
  await detail(req, res);
}));

router.post("/applications/:id/checklist", guard(C.review), asyncHandler(async (req: any, res) => {
  const b = req.body ?? {};
  ok(res, await review.setChecklist(idParam(req.params.id), String(b.key ?? ""), Boolean(b.checked), b.note, actorOf(req)));
}));

router.post("/applications/:id/documents/:docId/review", guard(C.review), asyncHandler(async (req: any, res) => {
  ok(res, await review.reviewDocument(idParam(req.params.id), idParam(req.params.docId), String(req.body?.status ?? ""), req.body?.note, actorOf(req)));
}));

router.get("/applications/:id/documents/:docId/file", guard(APPLICATION_READ), asyncHandler(async (req: any, res) => {
  const f = await review.documentFile(idParam(req.params.id), idParam(req.params.docId));
  await streamPlatformFile(res, f.path, { filename: f.name ?? undefined, contentType: f.mime ?? undefined });
}));

router.get("/applications/:id/messages", guard(APPLICATION_READ), asyncHandler(async (req: any, res) => {
  ok(res, (await review.getDetail(idParam(req.params.id), capsOf(req))).messages);
}));

router.post("/applications/:id/messages", guard(C.review), asyncHandler(async (req: any, res) => {
  const internal = req.body?.internal === true || req.body?.internal === "true";
  ok(res, await review.sendMessage(idParam(req.params.id), req.body?.body, internal, actorOf(req)), 201);
}));

router.get("/applications/:id/messages/:messageId/attachment", guard(APPLICATION_READ), asyncHandler(async (req: any, res) => {
  const path = await review.messageAttachment(idParam(req.params.id), idParam(req.params.messageId));
  await streamPlatformFile(res, path);
}));

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

router.get("/invoices", guard(BILLING_READ), asyncHandler(async (req: any, res) => {
  const q = req.query;
  ok(
    res,
    await billing.listInvoices({
      status: q.status ? String(q.status) : undefined,
      tenantId: q.tenantId ? Number(q.tenantId) : undefined,
      applicationId: q.applicationId ? Number(q.applicationId) : undefined,
    }),
  );
}));

router.post("/invoices", guard(C.invoice), asyncHandler(async (req: any, res) => {
  const b = req.body ?? {};
  const applicationId = b.applicationId ? Number(b.applicationId) : null;
  const tenantId = b.tenantId ? Number(b.tenantId) : null;
  const id = await billing.createInvoice({
    kind: b.kind === "NEW" || b.kind === "RENEWAL" || b.kind === "CHANGE" ? b.kind : applicationId ? "NEW" : "RENEWAL",
    applicationId,
    tenantId,
    packageCode: String(b.packageCode ?? ""),
    billingCycle: b.billingCycle === "YEAR" ? "YEAR" : "TERM",
    periodStart: b.periodStart ?? null,
    periodEnd: b.periodEnd ?? null,
    amount: b.amount === undefined || b.amount === null ? undefined : Number(b.amount),
    lines: b.lines,
    notes: b.notes ?? null,
    createdBy: userId(req),
  });
  ok(res, await billing.getInvoice(id, "platform"), 201);
}));

router.get("/invoices/:id", guard(BILLING_READ), asyncHandler(async (req: any, res) => ok(res, await billing.getInvoice(idParam(req.params.id), "platform"))));

router.patch("/invoices/:id", guard(C.invoice), asyncHandler(async (req: any, res) => {
  ok(res, await billing.updateInvoice(idParam(req.params.id), req.body ?? {}, userId(req)));
}));

router.post("/invoices/:id/issue", guard(C.invoice), asyncHandler(async (req: any, res) => {
  ok(res, await billing.issueInvoice(idParam(req.params.id), userId(req)));
}));

router.post("/invoices/:id/void", guard(C.invoice), asyncHandler(async (req: any, res) => {
  ok(res, await billing.voidInvoice(idParam(req.params.id), req.body?.reason, userId(req)));
}));

router.post("/invoices/:id/waive", guard(C.waive), asyncHandler(async (req: any, res) => {
  ok(res, await billing.waiveInvoice(idParam(req.params.id), req.body?.reason, userId(req), req.ip ?? null));
}));

router.get("/invoices/:id/pdf", guard(BILLING_READ), asyncHandler(async (req: any, res) => {
  await billing.sendInvoicePdf(res, idParam(req.params.id));
}));

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

router.get("/payments", guard(PROOF_READ), asyncHandler(async (req: any, res) => {
  ok(res, await billing.listPayments(req.query.status ? String(req.query.status) : undefined));
}));

router.post("/payments/:id/confirm", guard(C.confirm), asyncHandler(async (req: any, res) => {
  ok(res, await billing.confirmPayment(idParam(req.params.id), userId(req), req.body?.note ?? null, req.ip ?? null));
}));

router.post("/payments/:id/reject", guard(C.confirm), asyncHandler(async (req: any, res) => {
  ok(res, await billing.rejectPayment(idParam(req.params.id), userId(req), req.body?.note, req.ip ?? null));
}));

router.get("/payments/:id/proof", guard(PROOF_READ), asyncHandler(async (req: any, res) => {
  const path = await billing.paymentProofPath(idParam(req.params.id));
  if (!path) throw new NotFoundError("No proof was uploaded");
  await streamPlatformFile(res, path);
}));

router.get("/payment-instructions", guard(ANY), asyncHandler(async (_req, res) => ok(res, await billing.allPaymentInstructions())));

router.put("/payment-instructions", guard(C.invoice), asyncHandler(async (req: any, res) => {
  ok(res, await billing.savePaymentInstructions(req.body?.items, userId(req)));
}));

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

router.get("/packages", guard(CATALOG_READ), asyncHandler(async (_req, res) => ok(res, await packagesAdmin.listPackages())));

router.get("/entitlement-catalog", guard(CATALOG_READ), asyncHandler(async (_req, res) => ok(res, packagesAdmin.entitlementCatalog())));

router.put("/packages/:code", guard(C.packages), asyncHandler(async (req: any, res) => {
  ok(res, await packagesAdmin.updatePackage(String(req.params.code), req.body ?? {}, userId(req)));
}));

router.put("/packages/:code/entitlements", guard(C.packages), asyncHandler(async (req: any, res) => {
  ok(res, await packagesAdmin.replaceEntitlements(String(req.params.code), req.body?.entitlements, userId(req)));
}));

// ---------------------------------------------------------------------------
// Settings, audit
// ---------------------------------------------------------------------------

router.get("/settings", guard(ANY), asyncHandler(async (_req, res) => ok(res, await console_.readSettings())));

router.put("/settings", guard(C.packages), asyncHandler(async (req: any, res) => {
  ok(res, await console_.saveSettings(req.body ?? {}, userId(req)));
}));

router.get("/audit", guard(C.audit), asyncHandler(async (req: any, res) => {
  const q = req.query;
  ok(
    res,
    await console_.auditLog({
      tid: q.tid ? Number(q.tid) : undefined,
      action: q.action ? String(q.action) : undefined,
      before: q.before ? Number(q.before) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    }),
  );
}));

export default router;
