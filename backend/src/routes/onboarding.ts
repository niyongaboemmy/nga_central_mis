import express from "express";
import multer from "multer";
import { RowDataPacket } from "mysql2/promise";
import { controlPool, isControlPlaneMissing } from "../db/platform";
import { TokenBucket } from "../middleware/rateLimit";
import { requireApplicant, signOnboardingToken } from "../services/tenantMgmt/guards";
import { APP_KEYS, FEATURES, LIMITS, kindOfKey } from "../services/tenantMgmt/catalog";
import { checkSlug } from "../services/tenantMgmt/slug";
import { checkUpload, PLATFORM_UPLOAD_MAX_BYTES, streamPlatformFile } from "../services/tenantMgmt/files";
import { RWANDA_ADMIN_DIVISIONS } from "../services/tenantMgmt/adminDivisions";
import * as billing from "../services/tenantMgmt/billing";
import * as provisioning from "../services/tenantMgmt/provisioning";
import * as applicants from "../services/tenantMgmt/applicants";
import * as applications from "../services/tenantMgmt/applications";
import { failField, normEmail } from "../services/tenantMgmt/applicants";

/**
 * Self-registration and the applicant tracker (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.1-6.2, §7).
 * Contract: frontend/src/api/tenantMgmt.ts (`publicApi`, `applicantApi`).
 *
 * Public routes are rate-limited by IP and by e-mail (429 RATE_LIMITED). The
 * applicant routes need the onboarding token (guards.requireApplicant, Bearer);
 * the file routes (documents, attachments, payment proofs, invoice PDF) also take
 * it as ?token= because the browser opens them directly.
 */
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PLATFORM_UPLOAD_MAX_BYTES, files: 1 } });

type H = (req: any, res: any, next: any) => Promise<unknown>;
const wrap = (fn: H) => (req: any, res: any, next: any) => fn(req, res, next).catch(next);
const ok = (res: any, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const idParam = (v: unknown) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : -1;
};

// ---------------------------------------------------------------------------
// Rate limits (by IP and by e-mail), in memory like middleware/rateLimit.ts
// ---------------------------------------------------------------------------

const LIMITS_PER_MIN: Record<string, { ip: number; email: number }> = {
  start: { ip: 10, email: 3 },
  resend: { ip: 5, email: 3 },
  verify: { ip: 15, email: 10 },
  login: { ip: 10, email: 5 },
  similar: { ip: 30, email: 0 },
  slug: { ip: 60, email: 0 },
};
const buckets = new Map<string, TokenBucket>();
const bucket = (name: string, n: number) => {
  let b = buckets.get(name);
  if (!b) {
    const override = Number(process.env.ONBOARDING_RATE_LIMIT_PER_MIN);
    const cap = Number.isFinite(override) && override > 0 ? Math.min(override, n) : n;
    b = new TokenBucket(cap, cap / 60_000);
    buckets.set(name, b);
  }
  return b;
};
/** Tests: forget every bucket (and re-read ONBOARDING_RATE_LIMIT_PER_MIN). */
export const resetOnboardingRateLimits = () => buckets.clear();

const limited = (name: keyof typeof LIMITS_PER_MIN) => (req: any, res: any, next: any) => {
  // Same convention as rateLimitByIp: off under test unless the request opts in.
  if (process.env.NODE_ENV === "test" && !req.get("X-Test-Rate-Limit")) return next();
  const lim = LIMITS_PER_MIN[name];
  const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
  const email = normEmail(req.body?.email);
  const okIp = bucket(`${name}:ip`, lim.ip).take(ip);
  const okEmail = !lim.email || !email || bucket(`${name}:email`, lim.email).take(email);
  if (!okIp || !okEmail) {
    res.set("Retry-After", "60");
    return res.status(429).json({ success: false, code: "RATE_LIMITED", retryAfterSec: 60, message: "Too many attempts. Please wait a minute." });
  }
  next();
};

// ---------------------------------------------------------------------------
// GET /packages/public -- the catalogue for the register page (no auth)
// ---------------------------------------------------------------------------

export const publicPackagesRouter = express.Router();

const entLabel = (key: string) => APP_KEYS[key]?.label ?? FEATURES[key] ?? LIMITS[key]?.label ?? key;

export async function publicPackages() {
  try {
    const [pkgs] = await controlPool().query<RowDataPacket[]>(
      "SELECT * FROM Package WHERE is_public = 1 AND is_active = 1 ORDER BY tier, code",
    );
    if (!pkgs.length) return [];
    const [ents] = await controlPool().query<RowDataPacket[]>(
      "SELECT package_code, ent_key, kind, value_int FROM PackageEntitlement WHERE package_code IN (?) ORDER BY ent_key",
      [pkgs.map((p) => p.code)],
    );
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
      entitlements: ents
        .filter((e) => e.package_code === p.code)
        .map((e) => ({
          key: String(e.ent_key),
          kind: (kindOfKey(String(e.ent_key)) ?? e.kind) as string,
          value: e.value_int === null ? null : Number(e.value_int),
          label: entLabel(String(e.ent_key)),
        })),
    }));
  } catch (err) {
    if (isControlPlaneMissing(err)) return [];
    throw err;
  }
}

publicPackagesRouter.get(
  "/public",
  wrap(async (_req, res) => {
    res.set("Cache-Control", "public, max-age=60");
    ok(res, await publicPackages());
  }),
);

// ---------------------------------------------------------------------------
// Public: checks and reference data
// ---------------------------------------------------------------------------

router.get(
  "/slug-available",
  limited("slug"),
  wrap(async (req, res) => {
    const r = await checkSlug(String(req.query.slug ?? ""));
    ok(res, { slug: r.slug, available: r.available, suggestion: r.suggestion, ...(r.reason ? { reason: r.reason } : {}) });
  }),
);

router.get(
  "/similar",
  limited("similar"),
  wrap(async (req, res) => ok(res, await applications.similarSchools(req.query.name))),
);

router.get("/captcha", (_req, res) => ok(res, applicants.captchaConfig()));

router.get("/admin-divisions", (_req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  ok(res, RWANDA_ADMIN_DIVISIONS);
});

// ---------------------------------------------------------------------------
// Public: the applicant account
// ---------------------------------------------------------------------------

router.post(
  "/accounts",
  limited("start"),
  wrap(async (req, res) => {
    await applicants.assertCaptcha(req.body?.captchaToken, req.ip);
    ok(res, await applicants.startAccount(req.body ?? {}), 201);
  }),
);

router.post(
  "/accounts/resend",
  limited("resend"),
  wrap(async (req, res) => ok(res, await applicants.resendCode(req.body?.email))),
);

router.post(
  "/accounts/verify",
  limited("verify"),
  wrap(async (req, res) => {
    const acc = await applicants.verifyCode(req.body?.email, req.body?.code);
    const token = signOnboardingToken(acc);
    ok(res, { token, me: await applications.buildMe(Number(acc.account_id), token) });
  }),
);

router.post(
  "/login",
  limited("login"),
  wrap(async (req, res) => {
    const acc = await applicants.passwordLogin(req.body?.email, req.body?.password);
    const token = signOnboardingToken(acc);
    ok(res, { token, me: await applications.buildMe(Number(acc.account_id), token) });
  }),
);

// ---------------------------------------------------------------------------
// Applicant (onboarding token)
// ---------------------------------------------------------------------------

/** The onboarding token of this request (for the ?token= links in the payload). */
const tokenOf = (req: any): string | null => {
  const h: string | undefined = req.headers?.authorization;
  if (typeof h === "string" && h.startsWith("Bearer ")) return h.slice(7).trim();
  return typeof req.query?.token === "string" ? req.query.token : null;
};

/** GET file routes: the token may come as ?token= (an <a>/<img> can't send headers). */
const applicantViaQuery = (req: any, res: any, next: any) => {
  if (!req.headers.authorization && typeof req.query?.token === "string") req.headers.authorization = `Bearer ${req.query.token}`;
  return requireApplicant(req, res, next);
};

const aid = (req: any) => Number(req.applicant.account_id);

router.post(
  "/logout",
  requireApplicant,
  wrap(async (req, res) => {
    await applicants.logoutAccount(aid(req));
    ok(res, { ok: true });
  }),
);

router.post(
  "/account/password",
  requireApplicant,
  wrap(async (req, res) => {
    await applicants.changePassword(aid(req), req.body?.currentPassword, req.body?.newPassword);
    ok(res, { ok: true });
  }),
);

router.get(
  "/me",
  requireApplicant,
  wrap(async (req, res) => ok(res, await applications.buildMe(aid(req), tokenOf(req)))),
);

router.post(
  "/applications",
  requireApplicant,
  wrap(async (req, res) => ok(res, await applications.createApplication(aid(req), req.body ?? {}, req.ip), 201)),
);

router.patch(
  "/applications/:id",
  requireApplicant,
  wrap(async (req, res) => ok(res, await applications.updateApplication(aid(req), idParam(req.params.id), req.body ?? {}))),
);

router.post(
  "/applications/:id/submit",
  requireApplicant,
  wrap(async (req, res) => {
    // fail fast on ownership before the (remote) captcha check
    await applications.ownApplicationRow(aid(req), idParam(req.params.id));
    await applicants.assertCaptcha(req.body?.captchaToken, req.ip);
    ok(res, await applications.submitApplication(aid(req), idParam(req.params.id), req.body ?? {}, req.ip));
  }),
);

router.post(
  "/applications/:id/withdraw",
  requireApplicant,
  wrap(async (req, res) => ok(res, await applications.withdrawApplication(aid(req), idParam(req.params.id), req.body?.reason, req.ip))),
);

router.get(
  "/applications/:id/messages",
  requireApplicant,
  wrap(async (req, res) => ok(res, await applications.listMessages(aid(req), idParam(req.params.id), tokenOf(req)))),
);

router.post(
  "/applications/:id/messages",
  requireApplicant,
  upload.single("file"),
  wrap(async (req, res) => {
    const bad = checkUpload(req.file, false);
    if (bad) failField("file", bad, "INVALID_FILE");
    ok(res, await applications.sendMessage(aid(req), idParam(req.params.id), req.body?.body, req.file, tokenOf(req)), 201);
  }),
);

router.get(
  "/applications/:id/messages/:msgId/attachment",
  applicantViaQuery,
  wrap(async (req, res) => {
    const f = await applications.ownAttachmentFile(aid(req), idParam(req.params.id), idParam(req.params.msgId));
    await streamPlatformFile(res, f.path, { filename: f.name });
  }),
);

router.post(
  "/applications/:id/documents",
  requireApplicant,
  upload.single("file"),
  wrap(async (req, res) => {
    const bad = checkUpload(req.file, true);
    if (bad) failField("file", bad, "INVALID_FILE");
    ok(res, await applications.addDocument(aid(req), idParam(req.params.id), req.body?.kind, req.file, tokenOf(req), req.ip), 201);
  }),
);

router.delete(
  "/applications/:id/documents/:docId",
  requireApplicant,
  wrap(async (req, res) => {
    await applications.removeDocument(aid(req), idParam(req.params.id), idParam(req.params.docId));
    ok(res, { ok: true });
  }),
);

router.get(
  "/applications/:id/documents/:docId/file",
  applicantViaQuery,
  wrap(async (req, res) => {
    const f = await applications.ownDocumentFile(aid(req), idParam(req.params.id), idParam(req.params.docId));
    await streamPlatformFile(res, f.path, { filename: f.name, contentType: f.mime });
  }),
);

router.get(
  "/applications/:id/provisioning",
  requireApplicant,
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    await applications.ownApplicationRow(aid(req), id);
    let run: unknown = null;
    try {
      run = await provisioning.runForApplication(id, "applicant");
    } catch (err: any) {
      if (!/not implemented/i.test(String(err?.message))) throw err;
    }
    ok(res, run ?? null);
  }),
);

/** Make the invoice's links open in a browser tab for this applicant. */
function withApplicantLinks(inv: any, token: string | null) {
  if (!inv || !token) return inv;
  inv.pdfUrl = applications.invoicePdfUrl(Number(inv.id), token);
  if (Array.isArray(inv.payments)) {
    for (const p of inv.payments) if (p?.proofUrl) p.proofUrl = applications.paymentProofUrl(Number(p.id), token);
  }
  return inv;
}

router.get(
  "/invoices/:id",
  requireApplicant,
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    await applications.assertOwnInvoice(aid(req), id);
    ok(res, withApplicantLinks(await billing.getInvoice(id, "applicant"), tokenOf(req)));
  }),
);

router.get(
  "/invoices/:id/pdf",
  applicantViaQuery,
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    await applications.assertOwnInvoice(aid(req), id);
    await billing.sendInvoicePdf(res, id);
  }),
);

router.post(
  "/invoices/:id/payments",
  requireApplicant,
  upload.single("proof"),
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    await applications.assertOwnInvoice(aid(req), id);
    const bad = checkUpload(req.file, false);
    if (bad) failField("proof", bad, "INVALID_FILE");
    const body = {
      method: String(req.body?.method ?? "") as billing.PaymentMethod,
      reference: String(req.body?.reference ?? ""),
      amount: Number(req.body?.amount),
      paidAt: String(req.body?.paidAt ?? ""),
    };
    const payment = await billing.submitPayment(id, body, req.file, { kind: "APPLICANT", id: aid(req) });
    if (payment?.proofUrl) payment.proofUrl = applications.paymentProofUrl(Number(payment.id), tokenOf(req));
    ok(res, payment, 201);
  }),
);

router.get(
  "/payments/:id/proof",
  applicantViaQuery,
  wrap(async (req, res) => {
    const f = await applications.ownPaymentProof(aid(req), idParam(req.params.id));
    await streamPlatformFile(res, f.path, { filename: f.name });
  }),
);

// ---------------------------------------------------------------------------
// Errors: the contract's { success:false, code?, message }
// ---------------------------------------------------------------------------

const onboardingErrors = (err: any, _req: any, res: any, next: any) => {
  if (res.headersSent) return next(err);
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ success: false, code: "FILE_TOO_LARGE", field: err.field ?? "file", message: "Files must be 10 MB or smaller." });
  }
  if (/not implemented/i.test(String(err?.message ?? ""))) {
    return res.status(503).json({ success: false, code: "NOT_AVAILABLE", message: "This step is not available yet." });
  }
  if (isControlPlaneMissing(err)) {
    return res.status(503).json({ success: false, code: "NOT_AVAILABLE", message: "School registration is not open here." });
  }
  if (err?.statusCode) {
    const code = typeof err.code === "string" ? err.code : (err.errors?.[0]?.code ?? undefined);
    if (err.statusCode === 429) res.set("Retry-After", "60");
    return res.status(err.statusCode).json({
      success: false,
      ...(code ? { code } : {}),
      ...(typeof err.field === "string" ? { field: err.field } : {}),
      ...(typeof err.reason === "string" ? { reason: err.reason } : {}),
      ...(typeof err.attemptsLeft === "number" ? { attemptsLeft: err.attemptsLeft } : {}),
      ...(err.statusCode === 429 ? { retryAfterSec: 60 } : {}),
      message: err.message,
      ...(Array.isArray(err.errors) && err.errors.length ? { errors: err.errors } : {}),
    });
  }
  next(err);
};
router.use(onboardingErrors);
publicPackagesRouter.use(onboardingErrors);

export default router;
