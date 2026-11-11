/**
 * The applicant's side of a TenantApplication (plan §6.1 step 4, §6.2): draft,
 * edit, submit / resubmit, withdraw, documents, the message thread, the
 * OnboardingMe tracker payload, and the two housekeeping jobs package D runs
 * (expireStaleDrafts, purgeStaleApplications).
 *
 * Every status change goes through applicationStore.transitionApplication.
 * Files live under platform/applications/<id>/ and are served by
 * routes/onboarding.ts after an ownership check; the `url` fields built here
 * carry the caller's onboarding token (?token=) so <a>/<img> can open them.
 */
import { RowDataPacket } from "mysql2/promise";
import { controlPool, isControlPlaneMissing } from "../../db/platform";
import { publicApiBase } from "../avatar/urls";
import logger from "../../utils/logger";
import {
  Actor,
  applicationOfAccount,
  listEvents,
  loadApplicationRow,
  recordEvent,
  serializeApplication,
  SerializedApplication,
  transitionApplication,
} from "./applicationStore";
import { APPLICANT_EDITABLE, ApplicationStatus, OPEN_APPLICATION } from "./stateMachine";
import { getPlatformSetting, nextRef } from "./settings";
import { checkSlug, normalizeSlug } from "./slug";
import { APP_KEYS, PLATFORM_CAPS } from "./catalog";
import { deletePlatformFile, storePlatformFile } from "./files";
import { emailApplicant, notifyPlatformStaff } from "./notify";
import * as billing from "./billing";
import * as provisioning from "./provisioning";
import { AccountRow, accountById, fail, failField, serializeAccount } from "./applicants";

export const SCHOOL_TYPES = ["primary", "secondary", "tvet", "university", "other"] as const;
export const DOCUMENT_KINDS = ["REGISTRATION_CERT", "AUTHORISATION_LETTER", "LOGO", "OTHER"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Fields a submit needs (camelCase = the contract's SchoolDetails). */
export const REQUIRED_FOR_SUBMIT = ["schoolName", "schoolType", "province", "district", "schoolPhone", "desiredSlug", "requestedPackage"] as const;

/** Statuses in which documents may still change (no decision yet). */
const DOCUMENTS_OPEN: ApplicationStatus[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"];

const applicantActor = (accountId: number, ip?: string | null): Actor => ({ kind: "APPLICANT", id: accountId, ip: ip ?? null });
const iso = (d: any): string | null => (d ? new Date(d).toISOString() : null);

/** A seam another package has not landed yet ("… not implemented") or no control plane. */
const isUnavailable = (err: any) => /not implemented/i.test(String(err?.message ?? "")) || isControlPlaneMissing(err);
async function soft<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isUnavailable(err)) logger.error("[onboarding] dependent call failed", { err });
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// School details: body (camelCase) -> columns, validated
// ---------------------------------------------------------------------------

const str = (max: number) => (v: unknown) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const int = (field: string) => (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) failField(field, "Enter a number, zero or more.");
  return Math.round(n);
};

const FIELDS: Record<string, { col: string; parse: (v: unknown) => unknown }> = {
  schoolName: { col: "school_name", parse: str(150) },
  schoolType: {
    col: "school_type",
    parse: (v) => {
      const s = str(20)(v);
      if (s && !(SCHOOL_TYPES as readonly string[]).includes(s.toLowerCase())) failField("schoolType", "Unknown school type.");
      return s ? s.toLowerCase() : null;
    },
  },
  country: {
    col: "country",
    parse: (v) => {
      const s = str(2)(v);
      if (s && !/^[A-Za-z]{2}$/.test(s)) failField("country", "Country must be a 2-letter code.");
      return s ? s.toUpperCase() : null;
    },
  },
  province: { col: "province", parse: str(60) },
  district: { col: "district", parse: str(60) },
  sector: { col: "sector", parse: str(60) },
  address: { col: "address", parse: str(255) },
  schoolPhone: { col: "school_phone", parse: str(40) },
  schoolEmail: { col: "school_email", parse: str(191) },
  website: { col: "website", parse: str(191) },
  estStudents: { col: "est_students", parse: int("estStudents") },
  estStaff: { col: "est_staff", parse: int("estStaff") },
  desiredSlug: { col: "desired_slug", parse: (v) => (v === null || v === undefined || v === "" ? null : normalizeSlug(String(v)) || null) },
  requestedPackage: { col: "requested_package", parse: str(30) },
  billingCycle: {
    col: "billing_cycle",
    parse: (v) => {
      const s = String(v ?? "TERM").toUpperCase();
      if (s !== "TERM" && s !== "YEAR") failField("billingCycle", "Billing cycle must be TERM or YEAR.");
      return s;
    },
  },
  requestedApps: {
    col: "requested_apps",
    parse: (v) => {
      if (v === null || v === undefined) return JSON.stringify([]);
      if (!Array.isArray(v)) failField("requestedApps", "requestedApps must be a list.");
      const apps = Array.from(new Set((v as unknown[]).map(String)));
      const bad = apps.find((a) => !(a in APP_KEYS));
      if (bad) failField("requestedApps", `Unknown app ${bad}.`);
      return JSON.stringify(apps);
    },
  },
  notes: { col: "notes", parse: str(5000) },
};

async function columnsFrom(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(FIELDS)) {
    if (!(k in (body ?? {}))) continue;
    out[f.col] = f.parse(body[k]);
  }
  if ("school_name" in out && !out.school_name) failField("schoolName", "The school name is required.");
  if (out.requested_package) {
    const [rows] = await controlPool().query<RowDataPacket[]>("SELECT 1 FROM Package WHERE code = ? AND is_public = 1 AND is_active = 1", [
      out.requested_package,
    ]);
    if (!rows.length) failField("requestedPackage", "Unknown package.");
  }
  return out;
}

export function missingFields(app: SerializedApplication): string[] {
  return REQUIRED_FOR_SUBMIT.filter((k) => {
    const v = (app as any)[k];
    return v === null || v === undefined || v === "";
  });
}

// ---------------------------------------------------------------------------
// Own application
// ---------------------------------------------------------------------------

/** The application if it belongs to the account; 404 otherwise (never 403: no probing). */
export async function ownApplicationRow(accountId: number, id: number): Promise<RowDataPacket> {
  if (!Number.isSafeInteger(id) || id <= 0) fail(404, "NOT_FOUND", "Application not found");
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM TenantApplication WHERE application_id = ? AND account_id = ?", [id, accountId]);
  if (!rows[0]) fail(404, "NOT_FOUND", "Application not found");
  return rows[0];
}

async function requireVerified(accountId: number): Promise<AccountRow> {
  const acc = await accountById(accountId);
  if (!acc) fail(401, "ONBOARDING_AUTH", "Please sign in again.");
  if (!acc!.email_verified_at) fail(403, "EMAIL_NOT_VERIFIED", "Verify your e-mail first.");
  return acc!;
}

export async function createApplication(accountId: number, body: Record<string, unknown>, ip?: string | null): Promise<SerializedApplication> {
  await requireVerified(accountId);
  if (!String(body?.schoolName ?? "").trim()) failField("schoolName", "The school name is required.");
  const cols = await columnsFrom(body);
  const [open] = await controlPool().query<RowDataPacket[]>(
    "SELECT application_id FROM TenantApplication WHERE account_id = ? AND status IN (?) LIMIT 1",
    [accountId, OPEN_APPLICATION],
  );
  if (open.length) fail(409, "APPLICATION_OPEN", "You already have an application in progress.");
  if (!("requested_apps" in cols)) cols.requested_apps = JSON.stringify([]);
  const keys = Object.keys(cols);
  const [res]: any = await controlPool().query(
    `INSERT INTO TenantApplication (account_id, status, ${keys.map((k) => `\`${k}\``).join(", ")}) VALUES (?, 'DRAFT', ${keys.map(() => "?").join(", ")})`,
    [accountId, ...keys.map((k) => cols[k])],
  );
  const id = Number(res.insertId);
  await recordEvent(id, { from: null, to: "DRAFT", kind: "CREATED", actor: applicantActor(accountId, ip), message: null });
  return serializeApplication(await loadApplicationRow(id));
}

export async function updateApplication(accountId: number, id: number, body: Record<string, unknown>): Promise<SerializedApplication> {
  const row = await ownApplicationRow(accountId, id);
  if (!APPLICANT_EDITABLE.includes(row.status)) fail(409, "INVALID_TRANSITION", "This application can't be changed now.");
  const cols = await columnsFrom(body);
  cols.last_activity_at = new Date();
  const keys = Object.keys(cols);
  // status guard in the WHERE: a reviewer may have moved it meanwhile
  const [res]: any = await controlPool().query(
    `UPDATE TenantApplication SET ${keys.map((k) => `\`${k}\` = ?`).join(", ")} WHERE application_id = ? AND status IN (?)`,
    [...keys.map((k) => cols[k]), id, APPLICANT_EDITABLE],
  );
  if (!res.affectedRows) fail(409, "INVALID_TRANSITION", "This application can't be changed now.");
  return serializeApplication(await loadApplicationRow(id));
}

export async function submitApplication(accountId: number, id: number, body: { acceptTerms?: unknown }, ip?: string | null): Promise<SerializedApplication> {
  const row = await ownApplicationRow(accountId, id);
  const acc = await requireVerified(accountId);
  if (body?.acceptTerms !== true && body?.acceptTerms !== "true") failField("acceptTerms", "Please accept the terms first.", "TERMS_REQUIRED");
  const from = String(row.status) as ApplicationStatus;
  if (from !== "DRAFT" && from !== "CHANGES_REQUESTED") fail(409, "INVALID_TRANSITION", `Cannot submit an application that is ${from}.`);
  const current = serializeApplication(row);
  const missing = missingFields(current);
  if (missing.length) {
    fail(400, "INCOMPLETE", `Please complete: ${missing.join(", ")}.`, missing.map((field) => ({ field, message: "This field is required." })));
  }
  const slug = await checkSlug(current.desiredSlug!, { excludeApplicationId: id });
  if (!slug.available) {
    failField("desiredSlug", slug.suggestion ? `That short name is not available. Try ${slug.suggestion}.` : "That short name is not available.", "SLUG_UNAVAILABLE");
  }

  const resubmit = from === "CHANGES_REQUESTED";
  const ref = row.ref ?? (await nextRef("APP"));
  const now = new Date();
  const app = await transitionApplication(id, resubmit ? "UNDER_REVIEW" : "SUBMITTED", applicantActor(accountId, ip), {
    expectFrom: [from],
    message: resubmit ? "Changes sent back for review" : "Application submitted",
    set: { ref, terms_accepted_at: now, desired_slug: slug.slug, ...(resubmit ? {} : { submitted_at: now }) },
  });

  void (async () => {
    const name = current.schoolName;
    if (resubmit) {
      await notifyPlatformStaff({
        event: "application.resubmitted",
        ...(row.assigned_to ? { userIds: [Number(row.assigned_to)] } : { caps: [PLATFORM_CAPS.review] }),
        title: `${ref} resubmitted`,
        body: `${name} sent its changes back for review.`,
        link: `/platform/applications/${id}`,
        subjectType: "platform_application",
        subjectId: id,
      });
    } else {
      await emailApplicant(
        accountId,
        `Application ${ref} received`,
        `Hello ${acc.full_name},\n\nWe received the application for ${name}. Your reference is ${ref}.\nA reviewer will look at it shortly; you can follow every step from your tracker.`,
      );
      await notifyPlatformStaff({
        event: "application.submitted",
        caps: [PLATFORM_CAPS.review],
        title: `New school application ${ref}`,
        body: `${name}${current.district ? ` (${current.district})` : ""}`,
        link: `/platform/applications/${id}`,
        subjectType: "platform_application",
        subjectId: id,
        email: true,
      });
    }
  })().catch((err) => logger.error("[onboarding] submit notices failed", { err, id }));
  return app;
}

export async function withdrawApplication(accountId: number, id: number, reason: unknown, ip?: string | null): Promise<SerializedApplication> {
  await ownApplicationRow(accountId, id);
  const r = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 1000) : null;
  return transitionApplication(id, "WITHDRAWN", applicantActor(accountId, ip), { message: r ?? "Withdrawn by the applicant" });
}

// ---------------------------------------------------------------------------
// Files: URLs carry the onboarding token; routes/onboarding.ts serves them
// ---------------------------------------------------------------------------

export type UrlToken = string | null;
const withToken = (path: string, token: UrlToken) => `${publicApiBase()}${path}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
export const documentUrl = (appId: number, docId: number, token: UrlToken) => withToken(`/onboarding/applications/${appId}/documents/${docId}/file`, token);
export const attachmentUrl = (appId: number, msgId: number, token: UrlToken) =>
  withToken(`/onboarding/applications/${appId}/messages/${msgId}/attachment`, token);
export const paymentProofUrl = (paymentId: number, token: UrlToken) => withToken(`/onboarding/payments/${paymentId}/proof`, token);
export const invoicePdfUrl = (invoiceId: number, token: UrlToken) => withToken(`/onboarding/invoices/${invoiceId}/pdf`, token);

/** ApplicationDocument row -> contract `ApplicationDocument`; `url` built by `urlFor`. */
export function serializeDocument(r: RowDataPacket, urlFor: (appId: number, docId: number) => string) {
  return {
    id: Number(r.doc_id),
    kind: String(r.kind) as DocumentKind,
    name: r.original_name ?? null,
    url: urlFor(Number(r.application_id), Number(r.doc_id)),
    status: String(r.status) as "PENDING" | "ACCEPTED" | "REJECTED",
    note: r.reviewer_note ?? null,
    at: iso(r.created_at)!,
  };
}

/** ApplicationMessage row -> contract `ThreadMessage`. */
export function serializeMessage(r: RowDataPacket, urlFor: (appId: number, msgId: number) => string) {
  return {
    id: Number(r.message_id),
    at: iso(r.created_at)!,
    author: String(r.author_kind) as "APPLICANT" | "PLATFORM" | "SYSTEM",
    authorName: r.author_name ?? null,
    body: String(r.body),
    attachmentUrl: r.attachment_file ? urlFor(Number(r.application_id), Number(r.message_id)) : null,
    internal: Number(r.is_internal) === 1,
    readAt: iso(r.read_at),
  };
}

export async function listDocuments(appId: number, token: UrlToken) {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM ApplicationDocument WHERE application_id = ? ORDER BY doc_id", [appId]);
  return rows.map((r) => serializeDocument(r, (a, d) => documentUrl(a, d, token)));
}

export async function addDocument(
  accountId: number,
  id: number,
  kindRaw: unknown,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  token: UrlToken,
  ip?: string | null,
) {
  const row = await ownApplicationRow(accountId, id);
  if (!DOCUMENTS_OPEN.includes(row.status)) fail(409, "INVALID_TRANSITION", "Documents can't change after a decision.");
  const kind = String(kindRaw ?? "").toUpperCase();
  if (!(DOCUMENT_KINDS as readonly string[]).includes(kind)) failField("kind", "Unknown document kind.");
  const path = await storePlatformFile(`applications/${id}`, file.buffer, file.originalname);
  const [res]: any = await controlPool().query(
    "INSERT INTO ApplicationDocument (application_id, kind, file_path, original_name, mime, size_bytes) VALUES (?, ?, ?, ?, ?, ?)",
    [id, kind, path, String(file.originalname ?? "").slice(0, 255) || null, file.mimetype, file.size],
  );
  await controlPool().query("UPDATE TenantApplication SET last_activity_at = ? WHERE application_id = ?", [new Date(), id]);
  await recordEvent(id, { kind: "DOCUMENT_ADDED", actor: applicantActor(accountId, ip), message: kind, visible: true });
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM ApplicationDocument WHERE doc_id = ?", [res.insertId]);
  return serializeDocument(rows[0], (a, d) => documentUrl(a, d, token));
}

export async function removeDocument(accountId: number, id: number, docId: number): Promise<void> {
  const row = await ownApplicationRow(accountId, id);
  if (!DOCUMENTS_OPEN.includes(row.status)) fail(409, "INVALID_TRANSITION", "Documents can't change after a decision.");
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM ApplicationDocument WHERE doc_id = ? AND application_id = ?", [docId, id]);
  const doc = rows[0];
  if (!doc) fail(404, "NOT_FOUND", "Document not found");
  if (doc.status === "ACCEPTED") fail(409, "INVALID_TRANSITION", "An accepted document can't be removed.");
  await controlPool().query("DELETE FROM ApplicationDocument WHERE doc_id = ?", [docId]);
  await deletePlatformFile(String(doc.file_path));
}

/** The stored path of an own document (route streams it). */
export async function ownDocumentFile(accountId: number, id: number, docId: number) {
  await ownApplicationRow(accountId, id);
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM ApplicationDocument WHERE doc_id = ? AND application_id = ?", [docId, id]);
  if (!rows[0]) fail(404, "NOT_FOUND", "Document not found");
  return { path: String(rows[0].file_path), name: rows[0].original_name ?? undefined, mime: rows[0].mime ?? undefined };
}

// ---------------------------------------------------------------------------
// Messages (never the internal notes)
// ---------------------------------------------------------------------------

export async function listMessages(accountId: number, id: number, token: UrlToken) {
  await ownApplicationRow(accountId, id);
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT * FROM ApplicationMessage WHERE application_id = ? AND is_internal = 0 ORDER BY created_at, message_id",
    [id],
  );
  await controlPool().query(
    "UPDATE ApplicationMessage SET read_at = ? WHERE application_id = ? AND is_internal = 0 AND author_kind <> 'APPLICANT' AND read_at IS NULL",
    [new Date(), id],
  );
  return rows.map((r) => serializeMessage(r, (a, m) => attachmentUrl(a, m, token)));
}

export async function sendMessage(
  accountId: number,
  id: number,
  bodyRaw: unknown,
  file: { buffer: Buffer; originalname: string } | undefined,
  token: UrlToken,
) {
  const row = await ownApplicationRow(accountId, id);
  if (!OPEN_APPLICATION.includes(row.status)) fail(409, "INVALID_TRANSITION", "This application is closed.");
  const body = String(bodyRaw ?? "").trim().slice(0, 5000);
  if (!body && !file) failField("body", "Write a message.");
  const acc = await accountById(accountId);
  const attachment = file ? await storePlatformFile(`applications/${id}/messages`, file.buffer, file.originalname) : null;
  const [res]: any = await controlPool().query(
    "INSERT INTO ApplicationMessage (application_id, author_kind, author_id, author_name, body, attachment_file, is_internal) VALUES (?, 'APPLICANT', ?, ?, ?, ?, 0)",
    [id, accountId, acc?.full_name ?? null, body || "(attachment)", attachment],
  );
  await controlPool().query("UPDATE TenantApplication SET last_activity_at = ? WHERE application_id = ?", [new Date(), id]);
  void notifyPlatformStaff({
    event: "application.message",
    ...(row.assigned_to ? { userIds: [Number(row.assigned_to)] } : { caps: [PLATFORM_CAPS.review] }),
    title: `New message on ${row.ref ?? `application #${id}`}`,
    body: body.slice(0, 200),
    link: `/platform/applications/${id}`,
    subjectType: "platform_application",
    subjectId: id,
  }).catch(() => undefined);
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM ApplicationMessage WHERE message_id = ?", [res.insertId]);
  return serializeMessage(rows[0], (a, m) => attachmentUrl(a, m, token));
}

export async function ownAttachmentFile(accountId: number, id: number, msgId: number) {
  await ownApplicationRow(accountId, id);
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT attachment_file FROM ApplicationMessage WHERE message_id = ? AND application_id = ? AND is_internal = 0",
    [msgId, id],
  );
  if (!rows[0]?.attachment_file) fail(404, "NOT_FOUND", "Attachment not found");
  const path = String(rows[0].attachment_file);
  return { path, name: path.split("/").pop()?.replace(/^[0-9a-f]{12}-/, "") };
}

// ---------------------------------------------------------------------------
// Invoices and payments of the own application
// ---------------------------------------------------------------------------

/** 404 unless the invoice belongs to one of the account's applications. */
export async function assertOwnInvoice(accountId: number, invoiceId: number): Promise<number> {
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) fail(404, "NOT_FOUND", "Invoice not found");
  const [rows] = await controlPool().query<RowDataPacket[]>(
    `SELECT i.application_id FROM Invoice i JOIN TenantApplication a ON a.application_id = i.application_id
      WHERE i.invoice_id = ? AND a.account_id = ? AND i.status <> 'DRAFT'`,
    [invoiceId, accountId],
  );
  if (!rows[0]) fail(404, "NOT_FOUND", "Invoice not found");
  return Number(rows[0].application_id);
}

export async function ownPaymentProof(accountId: number, paymentId: number) {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    `SELECT p.proof_file FROM Payment p JOIN Invoice i ON i.invoice_id = p.invoice_id
       JOIN TenantApplication a ON a.application_id = i.application_id
      WHERE p.payment_id = ? AND a.account_id = ?`,
    [paymentId, accountId],
  );
  if (!rows[0]?.proof_file) fail(404, "NOT_FOUND", "Proof not found");
  const path = String(rows[0].proof_file);
  return { path, name: path.split("/").pop()?.replace(/^[0-9a-f]{12}-/, "") };
}

// ---------------------------------------------------------------------------
// GET /onboarding/me
// ---------------------------------------------------------------------------

const SETUP_STATUSES: ApplicationStatus[] = ["PAYMENT_CONFIRMED", "PROVISIONING", "PROVISIONING_FAILED", "ACTIVE"];
const INVOICE_STATUSES: ApplicationStatus[] = ["APPROVED_AWAITING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_REJECTED", "PAYMENT_CONFIRMED", "PROVISIONING", "PROVISIONING_FAILED", "ACTIVE", "EXPIRED"];

export async function buildMe(accountId: number, token: UrlToken) {
  const acc = await accountById(accountId);
  if (!acc) fail(401, "ONBOARDING_AUTH", "Please sign in again.");
  const account = serializeAccount(acc!);
  const required = ((await getPlatformSetting("documents.required")) ?? []).filter((k: string) =>
    (DOCUMENT_KINDS as readonly string[]).includes(k),
  ) as DocumentKind[];
  const row = await applicationOfAccount(accountId);
  const empty = {
    account,
    application: null,
    timeline: [],
    documents: [],
    requiredDocuments: required,
    invoice: null,
    paymentInstructions: [],
    provisioning: null,
    unreadMessages: 0,
    nextActions: (account.emailVerified ? ["COMPLETE_DRAFT"] : ["VERIFY_EMAIL"]) as string[],
    school: null,
  };
  if (!row) return empty;

  const application = serializeApplication(row);
  const id = application.id;
  const status = application.status;
  const [timeline, documents, unreadRows] = await Promise.all([
    listEvents(id, { applicantView: true }),
    listDocuments(id, token),
    controlPool().query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM ApplicationMessage WHERE application_id = ? AND is_internal = 0 AND author_kind <> 'APPLICANT' AND read_at IS NULL",
      [id],
    ),
  ]);
  const invoice: any = INVOICE_STATUSES.includes(status) ? await soft(() => billing.invoiceForApplication(id, "applicant"), null) : null;
  if (invoice && token) {
    // the PDF is opened by the browser directly: make sure the link authenticates
    if (!invoice.pdfUrl || !String(invoice.pdfUrl).includes("token=")) invoice.pdfUrl = invoicePdfUrl(Number(invoice.id), token);
  }
  const paymentInstructions = invoice ? await soft(() => billing.activePaymentInstructions(), [] as any[]) : [];
  const prov = SETUP_STATUSES.includes(status) ? await soft(() => provisioning.runForApplication(id, "applicant"), null) : null;

  let school: { tid: number; slug: string; name: string; loginUrl: string } | null = null;
  if (status === "ACTIVE" && application.tenantId) {
    const [t] = await controlPool().query<RowDataPacket[]>("SELECT tenant_id, slug, display_name FROM Tenant WHERE tenant_id = ?", [application.tenantId]);
    if (t[0]) {
      school = { tid: Number(t[0].tenant_id), slug: String(t[0].slug), name: String(t[0].display_name), loginUrl: `/login?tenant=${encodeURIComponent(String(t[0].slug))}` };
    }
  }

  const missingDocs = required.filter((k) => !documents.some((d) => d.kind === k && d.status !== "REJECTED"));
  const actions: string[] = [];
  if (!account.emailVerified) actions.push("VERIFY_EMAIL");
  const docsOpen = DOCUMENTS_OPEN.includes(status);
  const hasSubmittedPayment = !!invoice?.payments?.some((p: any) => p.status === "SUBMITTED");
  switch (status) {
    case "DRAFT":
      actions.push(missingFields(application).length ? "COMPLETE_DRAFT" : "SUBMIT");
      break;
    case "CHANGES_REQUESTED":
      actions.push("FIX_CHANGES");
      break;
    case "APPROVED_AWAITING_PAYMENT":
      if (invoice && ["ISSUED", "OVERDUE"].includes(invoice.status) && !hasSubmittedPayment) actions.push("PAY_INVOICE");
      break;
    case "PAYMENT_REJECTED":
      actions.push("REUPLOAD_PAYMENT");
      break;
    case "ACTIVE":
      actions.push("GO_TO_SCHOOL");
      break;
    case "WITHDRAWN":
    case "EXPIRED":
      actions.push("COMPLETE_DRAFT"); // may start a new application
      break;
    default:
      break;
  }
  if (docsOpen && missingDocs.length) actions.push("UPLOAD_DOCUMENTS");
  const terminal = ["REJECTED", "WITHDRAWN", "EXPIRED", "ACTIVE"].includes(status);
  if (!terminal && !actions.some((a) => a !== "UPLOAD_DOCUMENTS" && a !== "VERIFY_EMAIL")) actions.push("WAIT");

  return {
    account,
    application,
    timeline,
    documents,
    requiredDocuments: required,
    invoice,
    paymentInstructions,
    provisioning: prov,
    unreadMessages: Number((unreadRows[0] as RowDataPacket[])[0]?.n ?? 0),
    nextActions: actions,
    school,
  };
}

// ---------------------------------------------------------------------------
// Public helpers: near-duplicate names
// ---------------------------------------------------------------------------

const STOP = new Set([
  "school", "schools", "ecole", "college", "groupe", "scolaire", "gs", "es", "eps", "ep", "the", "of", "de", "du", "des", "la", "le",
  "primary", "secondary", "high", "academy", "institute", "and", "et", "st", "saint", "sainte", "ltd",
]);

export function normalizeSchoolName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const tokens = (n: string) => normalizeSchoolName(n).split(" ").filter((t) => t && !STOP.has(t));

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function namesSimilar(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  const ca = ta.join("");
  const cb = tb.join("");
  if (!ca || !cb) return normalizeSchoolName(a) === normalizeSchoolName(b) && !!normalizeSchoolName(a);
  if (ca === cb) return true;
  if (Math.min(ca.length, cb.length) >= 5 && (ca.includes(cb) || cb.includes(ca))) return true;
  if (levenshtein(ca, cb) / Math.max(ca.length, cb.length) <= 0.2) return true;
  const sa = new Set(ta);
  const inter = tb.filter((t) => sa.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 && inter / union >= 0.6;
}

/** Near-duplicate names among tenants and open applications: name + kind only. */
export async function similarSchools(nameRaw: unknown): Promise<Array<{ name: string; kind: "TENANT" | "APPLICATION" }>> {
  const name = String(nameRaw ?? "").trim().slice(0, 150);
  if (normalizeSchoolName(name).length < 3) return [];
  const out: Array<{ name: string; kind: "TENANT" | "APPLICATION" }> = [];
  try {
    const [tenants] = await controlPool().query<RowDataPacket[]>("SELECT display_name FROM Tenant WHERE status <> 'ARCHIVED'");
    for (const t of tenants) if (namesSimilar(name, String(t.display_name))) out.push({ name: String(t.display_name), kind: "TENANT" });
    const [apps] = await controlPool().query<RowDataPacket[]>("SELECT DISTINCT school_name FROM TenantApplication WHERE status IN (?) AND status <> 'DRAFT'", [
      OPEN_APPLICATION,
    ]);
    for (const a of apps) if (namesSimilar(name, String(a.school_name))) out.push({ name: String(a.school_name), kind: "APPLICATION" });
  } catch (err) {
    if (!isControlPlaneMissing(err)) throw err;
  }
  const seen = new Set<string>();
  return out.filter((h) => (seen.has(h.kind + normalizeSchoolName(h.name)) ? false : (seen.add(h.kind + normalizeSchoolName(h.name)), true))).slice(0, 5);
}

// ---------------------------------------------------------------------------
// Jobs (package D's runner calls these)
// ---------------------------------------------------------------------------

/** DRAFT idle longer than application.draft_expiry_days -> EXPIRED (SYSTEM). */
export async function expireStaleDrafts(): Promise<{ expired: number }> {
  const days = Number(await getPlatformSetting("application.draft_expiry_days")) || 14;
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT application_id FROM TenantApplication WHERE status = 'DRAFT' AND last_activity_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
    [days],
  );
  let expired = 0;
  for (const r of rows) {
    try {
      await transitionApplication(Number(r.application_id), "EXPIRED", { kind: "SYSTEM", id: null }, {
        expectFrom: ["DRAFT"],
        message: `Draft expired after ${days} days without activity`,
      });
      expired++;
    } catch (err) {
      logger.warn("[onboarding] draft expiry skipped", { err, id: r.application_id });
    }
  }
  return { expired };
}

/**
 * REJECTED / WITHDRAWN / EXPIRED applications older than
 * application.purge_after_months: their documents, files and messages are
 * deleted, the contact fields cleared, and the account anonymised when it has
 * nothing else going on. Idempotent.
 */
export async function purgeStaleApplications(): Promise<{ applications: number; accounts: number }> {
  const months = Number(await getPlatformSetting("application.purge_after_months")) || 12;
  const [rows] = await controlPool().query<RowDataPacket[]>(
    `SELECT application_id, account_id FROM TenantApplication
      WHERE status IN ('REJECTED','WITHDRAWN','EXPIRED')
        AND COALESCE(decided_at, last_activity_at) < DATE_SUB(NOW(), INTERVAL ? MONTH)
        AND (school_email IS NOT NULL OR school_phone IS NOT NULL OR address IS NOT NULL OR notes IS NOT NULL
             OR EXISTS (SELECT 1 FROM ApplicationDocument d WHERE d.application_id = TenantApplication.application_id)
             OR EXISTS (SELECT 1 FROM ApplicationMessage m WHERE m.application_id = TenantApplication.application_id)
             OR EXISTS (SELECT 1 FROM ApplicantAccount ac WHERE ac.account_id = TenantApplication.account_id
                         AND ac.status <> 'CONVERTED' AND ac.email_norm NOT LIKE 'purged-%'))`,
    [months],
  );
  const accounts = new Set<number>();
  for (const r of rows) {
    const id = Number(r.application_id);
    const [docs] = await controlPool().query<RowDataPacket[]>("SELECT file_path FROM ApplicationDocument WHERE application_id = ?", [id]);
    const [msgs] = await controlPool().query<RowDataPacket[]>("SELECT attachment_file FROM ApplicationMessage WHERE application_id = ? AND attachment_file IS NOT NULL", [id]);
    for (const d of docs) await deletePlatformFile(String(d.file_path));
    for (const m of msgs) await deletePlatformFile(String(m.attachment_file));
    await controlPool().query("DELETE FROM ApplicationDocument WHERE application_id = ?", [id]);
    await controlPool().query("DELETE FROM ApplicationMessage WHERE application_id = ?", [id]);
    await controlPool().query("UPDATE TenantApplication SET school_email = NULL, school_phone = NULL, address = NULL, notes = NULL WHERE application_id = ?", [id]);
    await recordEvent(id, { kind: "PURGED", actor: { kind: "SYSTEM", id: null }, message: "Personal data removed", visible: false });
    accounts.add(Number(r.account_id));
  }
  let anonymised = 0;
  for (const accountId of accounts) {
    const [other] = await controlPool().query<RowDataPacket[]>(
      "SELECT 1 FROM TenantApplication WHERE account_id = ? AND status NOT IN ('REJECTED','WITHDRAWN','EXPIRED') LIMIT 1",
      [accountId],
    );
    if (other.length) continue;
    const [res]: any = await controlPool().query(
      `UPDATE ApplicantAccount SET email_norm = CONCAT('purged-', account_id, '@invalid'), full_name = 'Removed', phone = NULL,
              password_hash = '!', otp_hash = NULL, otp_expires_at = NULL, status = 'LOCKED', token_version = token_version + 1
        WHERE account_id = ? AND status <> 'CONVERTED' AND email_norm NOT LIKE 'purged-%'`,
      [accountId],
    );
    anonymised += Number(res.affectedRows ?? 0);
  }
  return { applications: rows.length, accounts: anonymised };
}
