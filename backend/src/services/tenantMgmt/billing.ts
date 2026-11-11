/**
 * Invoices and manual payments (plan §6.4) -- work package C.
 *
 * No payment gateway: an applicant or a school uploads proof (Payment SUBMITTED),
 * platform finance matches it against the MoMo / bank statement and confirms or
 * rejects it. Confirming an application's invoice moves the application to
 * PAYMENT_CONFIRMED and starts provisioning; confirming a tenant's RENEWAL /
 * CHANGE invoice hands over to subscription.onTenantInvoicePaid.
 *
 * Serialised shapes = frontend/src/api/tenantMgmt.ts `Invoice` / `Payment` /
 * `PaymentInstruction`. All queries go to the control plane (controlPool), never
 * the tenant `db`, so these functions work from any request context.
 */
import type { Response } from "express";
import { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { controlPool } from "../../db/platform";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "../../errors/CustomError";
import { platformAudit } from "../../tenancy/audit";
import logger from "../../utils/logger";
import { Actor, inControlTx, loadApplicationRow, transitionApplication } from "./applicationStore";
import { assertTransition } from "./stateMachine";
import { getPlatformSettings, nextRef } from "./settings";
import { checkUpload, storePlatformFile } from "./files";
import { emailApplicant, notifyPlatformStaff, notifySchoolOwners } from "./notify";
import { PLATFORM_CAPS } from "./catalog";
import * as provisioning from "./provisioning";
import * as subscription from "./subscription";

export type InvoiceKind = "NEW" | "RENEWAL" | "CHANGE";
export type PaymentMethod = "MOMO" | "AIRTEL_MONEY" | "BANK_TRANSFER" | "CASH" | "OTHER";
export type Audience = "applicant" | "tenant" | "platform";

export const PAYMENT_METHODS: PaymentMethod[] = ["MOMO", "AIRTEL_MONEY", "BANK_TRANSFER", "CASH", "OTHER"];
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreateInvoiceInput {
  kind: InvoiceKind;
  applicationId?: number | null;
  tenantId?: number | null;
  packageCode: string;
  billingCycle: "TERM" | "YEAR";
  periodStart?: string | null;
  periodEnd?: string | null;
  /** default: the package price for the cycle (0 when the price is not set) */
  amount?: number;
  lines?: Array<{ label: string; amount: number }>;
  notes?: string | null;
  /** issue straight away (number + due date + e-mail) */
  issue?: boolean;
  createdBy?: number | null;
}

/** An HTTP error with a machine-readable `code` (errorHandler sends it next to `message`). */
export function coded<E extends Error>(err: E, code: string): E {
  (err as any).code = code;
  return err;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

const iso = (d: any): string | null => (d ? new Date(d).toISOString() : null);
const dateOnly = (d: any): string | null => {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  const x = new Date(d);
  // DATE columns come back as local midnight: read the local calendar day.
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const parseJson = (v: any) => (v === null || v === undefined ? null : typeof v === "string" ? JSON.parse(v) : v);

export function pdfUrlFor(invoiceId: number, audience: Audience): string {
  if (audience === "applicant") return `/onboarding/invoices/${invoiceId}/pdf`;
  if (audience === "tenant") return `/tenant/invoices/${invoiceId}/pdf`;
  return `/platform/invoices/${invoiceId}/pdf`;
}

export function serializePayment(r: RowDataPacket, audience: Audience) {
  const id = Number(r.payment_id);
  return {
    id,
    invoiceId: Number(r.invoice_id),
    method: r.method as PaymentMethod,
    reference: r.payer_reference ?? null,
    amount: Number(r.amount),
    paidAt: dateOnly(r.paid_at),
    // Proofs are readable by platform finance only (plan §10); the payer already has the file.
    proofUrl: r.proof_file && audience === "platform" ? `/platform/payments/${id}/proof` : null,
    status: r.status as "SUBMITTED" | "CONFIRMED" | "REJECTED",
    isWaiver: Number(r.is_waiver) === 1,
    reviewNote: r.review_note ?? null,
    submittedAt: iso(r.created_at)!,
    reviewedAt: iso(r.reviewed_at),
  };
}
export type SerializedPayment = ReturnType<typeof serializePayment>;

export function serializeInvoice(r: RowDataPacket, payments: RowDataPacket[], audience: Audience) {
  const id = Number(r.invoice_id);
  return {
    id,
    number: r.number ?? null,
    kind: r.kind as InvoiceKind,
    applicationId: r.application_id === null ? null : Number(r.application_id),
    tenantId: r.tenant_id === null ? null : Number(r.tenant_id),
    packageCode: String(r.package_code),
    billingCycle: (r.billing_cycle ?? "TERM") as "TERM" | "YEAR",
    periodStart: dateOnly(r.period_start),
    periodEnd: dateOnly(r.period_end),
    amount: Number(r.amount),
    currency: String(r.currency ?? "RWF"),
    status: r.status as "DRAFT" | "ISSUED" | "PAID" | "VOID" | "OVERDUE",
    issuedAt: iso(r.issued_at),
    dueAt: iso(r.due_at),
    paidAt: iso(r.paid_at),
    lines: (parseJson(r.lines) as Array<{ label: string; amount: number }> | null) ?? [],
    notes: r.notes ?? null,
    pdfUrl: pdfUrlFor(id, audience),
    payments: payments.filter((p) => Number(p.invoice_id) === id).map((p) => serializePayment(p, audience)),
  };
}
export type SerializedInvoice = ReturnType<typeof serializeInvoice>;

async function paymentsOf(invoiceIds: number[]): Promise<RowDataPacket[]> {
  if (!invoiceIds.length) return [];
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT * FROM Payment WHERE invoice_id IN (?) ORDER BY created_at DESC, payment_id DESC",
    [invoiceIds],
  );
  return rows;
}

async function serializeRows(rows: RowDataPacket[], audience: Audience): Promise<SerializedInvoice[]> {
  const payments = await paymentsOf(rows.map((r) => Number(r.invoice_id)));
  return rows.map((r) => serializeInvoice(r, payments, audience));
}

export async function loadInvoiceRow(id: number, conn?: PoolConnection, forUpdate = false): Promise<RowDataPacket> {
  const [rows] = await (conn ?? controlPool()).query<RowDataPacket[]>(
    `SELECT * FROM Invoice WHERE invoice_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError("Invoice not found");
  return rows[0];
}

async function loadPaymentRow(id: number, conn?: PoolConnection, forUpdate = false): Promise<RowDataPacket> {
  const [rows] = await (conn ?? controlPool()).query<RowDataPacket[]>(
    `SELECT * FROM Payment WHERE payment_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError("Payment not found");
  return rows[0];
}

/** The serialised invoice (with payments and pdfUrl for the given audience). */
export async function getInvoice(id: number, audience: Audience): Promise<SerializedInvoice> {
  const row = await loadInvoiceRow(id);
  return (await serializeRows([row], audience))[0];
}

/** Latest non-void invoice of an application, serialised (or null). Applicants never see drafts. */
export async function invoiceForApplication(applicationId: number, audience: "applicant" | "platform"): Promise<SerializedInvoice | null> {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    `SELECT * FROM Invoice WHERE application_id = ? AND status <> 'VOID'${audience === "applicant" ? " AND status <> 'DRAFT'" : ""}
      ORDER BY invoice_id DESC LIMIT 1`,
    [applicationId],
  );
  if (!rows[0]) return null;
  return (await serializeRows(rows, audience))[0];
}

/** Serialised invoices of a tenant, newest first (a school never sees drafts). */
export async function invoicesForTenant(tenantId: number, audience: "tenant" | "platform"): Promise<SerializedInvoice[]> {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    `SELECT * FROM Invoice WHERE tenant_id = ?${audience === "tenant" ? " AND status <> 'DRAFT'" : ""} ORDER BY invoice_id DESC`,
    [tenantId],
  );
  return serializeRows(rows, audience);
}

/** Platform list with filters. */
export async function listInvoices(filters: { status?: string; tenantId?: number; applicationId?: number } = {}): Promise<SerializedInvoice[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filters.status) {
    where.push("status IN (?)");
    args.push(String(filters.status).split(",").map((s) => s.trim().toUpperCase()));
  }
  if (filters.tenantId) {
    where.push("tenant_id = ?");
    args.push(filters.tenantId);
  }
  if (filters.applicationId) {
    where.push("application_id = ?");
    args.push(filters.applicationId);
  }
  const [rows] = await controlPool().query<RowDataPacket[]>(
    `SELECT * FROM Invoice${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY invoice_id DESC LIMIT 500`,
    args,
  );
  return serializeRows(rows, "platform");
}

/** Who the invoice is for: the application's school or the tenant's name. */
export async function billToOf(inv: RowDataPacket): Promise<{ name: string; lines: string[]; email: string | null; accountId: number | null }> {
  if (inv.application_id) {
    const [rows] = await controlPool().query<RowDataPacket[]>(
      `SELECT a.school_name, a.address, a.sector, a.district, a.province, a.school_email, a.account_id, acc.full_name, acc.email_norm
         FROM TenantApplication a LEFT JOIN ApplicantAccount acc ON acc.account_id = a.account_id
        WHERE a.application_id = ?`,
      [inv.application_id],
    );
    const r = rows[0];
    if (r) {
      const place = [r.address, r.sector, r.district, r.province].filter(Boolean).join(", ");
      return {
        name: String(r.school_name),
        lines: [place, r.full_name ? `Attn: ${r.full_name}` : "", r.email_norm ?? r.school_email ?? ""].filter(Boolean),
        email: r.email_norm ?? null,
        accountId: r.account_id === null ? null : Number(r.account_id),
      };
    }
  }
  if (inv.tenant_id) {
    const [rows] = await controlPool().query<RowDataPacket[]>("SELECT display_name, legal_name, slug FROM Tenant WHERE tenant_id = ?", [inv.tenant_id]);
    const r = rows[0];
    if (r) return { name: String(r.legal_name || r.display_name), lines: [String(r.slug)], email: null, accountId: null };
  }
  return { name: "—", lines: [], email: null, accountId: null };
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function packagePrice(code: string, cycle: "TERM" | "YEAR"): Promise<{ name: string; price: number | null; currency: string }> {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT name, price_term_rwf, price_year_rwf, currency FROM Package WHERE code = ?", [code]);
  const r = rows[0];
  if (!r) throw coded(new ValidationError("Unknown package."), "UNKNOWN_PACKAGE");
  const raw = cycle === "YEAR" ? r.price_year_rwf : r.price_term_rwf;
  return { name: String(r.name), price: raw === null || raw === undefined ? null : Number(raw), currency: String(r.currency ?? "RWF") };
}

function cleanLines(lines: unknown): Array<{ label: string; amount: number }> {
  if (!Array.isArray(lines)) throw coded(new ValidationError("Invoice lines must be a list."), "INVALID_LINES");
  return lines.map((l: any) => {
    const label = String(l?.label ?? "").trim().slice(0, 200);
    const amount = Number(l?.amount);
    if (!label || !Number.isInteger(amount) || amount < 0) throw coded(new ValidationError("Each line needs a label and a whole amount ≥ 0."), "INVALID_LINES");
    return { label, amount };
  });
}

const cycleLabel = (c: "TERM" | "YEAR") => (c === "YEAR" ? "one year" : "one term");

/** Create a DRAFT (or ISSUED) invoice; returns its id. */
export async function createInvoice(input: CreateInvoiceInput): Promise<number> {
  if (!input.applicationId === !input.tenantId) {
    throw coded(new ValidationError("An invoice is for one application or one school."), "INVALID_INVOICE_TARGET");
  }
  const cycle = input.billingCycle === "YEAR" ? "YEAR" : "TERM";
  const pkg = await packagePrice(input.packageCode, cycle);
  let lines = input.lines !== undefined ? cleanLines(input.lines) : null;
  let amount: number;
  if (input.amount !== undefined && input.amount !== null) {
    amount = Number(input.amount);
    if (!Number.isInteger(amount) || amount < 0) throw coded(new ValidationError("The amount must be a whole number ≥ 0."), "INVALID_AMOUNT");
  } else if (lines && lines.length) {
    amount = lines.reduce((s, l) => s + l.amount, 0);
  } else {
    amount = pkg.price ?? 0;
  }
  if (!lines) lines = [{ label: `${pkg.name} package — ${cycleLabel(cycle)}`, amount }];
  const [res] = await controlPool().query<ResultSetHeader>(
    `INSERT INTO Invoice (kind, application_id, tenant_id, package_code, billing_cycle, period_start, period_end, amount, currency, status, \`lines\`, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
    [
      input.kind,
      input.applicationId ?? null,
      input.tenantId ?? null,
      input.packageCode,
      cycle,
      input.periodStart ?? null,
      input.periodEnd ?? null,
      amount,
      pkg.currency,
      JSON.stringify(lines),
      input.notes ?? null,
      input.createdBy ?? null,
    ],
  );
  const id = Number(res.insertId);
  void platformAudit({
    action: "invoice.create",
    actorUserId: input.createdBy ?? null,
    targetTid: input.tenantId ?? null,
    payload: { invoiceId: id, applicationId: input.applicationId ?? null, packageCode: input.packageCode, amount, kind: input.kind },
  });
  if (input.issue) await issueInvoice(id, input.createdBy ?? null);
  return id;
}

/** Edit a DRAFT invoice. */
export async function updateInvoice(
  id: number,
  patch: { amount?: number; lines?: unknown; notes?: string | null; dueAt?: string | null; periodStart?: string | null; periodEnd?: string | null },
  actorId: number | null,
): Promise<SerializedInvoice> {
  const row = await loadInvoiceRow(id);
  if (row.status !== "DRAFT") throw coded(new ConflictError("Only a draft invoice can be edited."), "INVOICE_NOT_DRAFT");
  const set: Record<string, unknown> = {};
  if (patch.lines !== undefined) {
    const lines = cleanLines(patch.lines);
    set.lines = JSON.stringify(lines);
    if (patch.amount === undefined) set.amount = lines.reduce((s, l) => s + l.amount, 0);
  }
  if (patch.amount !== undefined) {
    const amount = Number(patch.amount);
    if (!Number.isInteger(amount) || amount < 0) throw coded(new ValidationError("The amount must be a whole number ≥ 0."), "INVALID_AMOUNT");
    set.amount = amount;
  }
  if (patch.notes !== undefined) set.notes = patch.notes === null ? null : String(patch.notes).slice(0, 2000);
  const dateField = (v: string | null | undefined, name: string) => {
    if (v === null) return null;
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) throw coded(new ValidationError(`${name} is not a date.`), "INVALID_DATE");
    return d;
  };
  if (patch.dueAt !== undefined) set.due_at = dateField(patch.dueAt, "dueAt");
  if (patch.periodStart !== undefined) set.period_start = patch.periodStart === null ? null : String(patch.periodStart).slice(0, 10);
  if (patch.periodEnd !== undefined) set.period_end = patch.periodEnd === null ? null : String(patch.periodEnd).slice(0, 10);
  const keys = Object.keys(set);
  if (keys.length) {
    await controlPool().query(`UPDATE Invoice SET ${keys.map((k) => `\`${k}\` = ?`).join(", ")} WHERE invoice_id = ? AND status = 'DRAFT'`, [
      ...keys.map((k) => set[k]),
      id,
    ]);
    void platformAudit({ action: "invoice.update", actorUserId: actorId, targetTid: row.tenant_id ?? null, payload: { invoiceId: id, fields: keys } });
  }
  return getInvoice(id, "platform");
}

/** DRAFT -> ISSUED: number, due date, e-mail to the applicant or the school's owners. */
export async function issueInvoice(id: number, actorId: number | null): Promise<SerializedInvoice> {
  const row = await loadInvoiceRow(id);
  assertTransition("invoice", String(row.status), "ISSUED");
  const settings = await getPlatformSettings();
  const number = await nextRef("INV");
  const now = new Date();
  const keepDue = row.due_at && new Date(row.due_at).getTime() > now.getTime();
  const due = keepDue ? new Date(row.due_at) : new Date(now.getTime() + Number(settings["invoice.due_days"]) * DAY_MS);
  const [res] = await controlPool().query<ResultSetHeader>(
    "UPDATE Invoice SET status = 'ISSUED', number = ?, issued_at = ?, due_at = ? WHERE invoice_id = ? AND status = 'DRAFT'",
    [number, now, due, id],
  );
  if (!res.affectedRows) assertTransition("invoice", "ISSUED", "ISSUED"); // raced: someone else issued it
  void platformAudit({ action: "invoice.issue", actorUserId: actorId, targetTid: row.tenant_id ?? null, payload: { invoiceId: id, number } });

  const amount = `${new Intl.NumberFormat("en-RW").format(Number(row.amount))} ${row.currency ?? "RWF"}`;
  const dueText = due.toISOString().slice(0, 10);
  const subject = `Invoice ${number}`;
  const body = `Your invoice ${number} for ${amount} is ready. Please pay by ${dueText}, then upload the proof of payment. The PDF and the payment details are on your page.`;
  try {
    if (row.application_id) {
      const app = await loadApplicationRow(Number(row.application_id));
      await emailApplicant(Number(app.account_id), subject, body, "/onboarding", "View invoice");
    } else if (row.tenant_id) {
      await notifySchoolOwners(Number(row.tenant_id), { title: subject, body, link: "/settings/subscription", subjectId: id });
    }
  } catch (err) {
    logger.error("[billing] invoice notice failed", { err, id });
  }
  return getInvoice(id, "platform");
}

/** Void an unpaid invoice (reason required). */
export async function voidInvoice(id: number, reason: string, actorId: number | null): Promise<SerializedInvoice> {
  if (!String(reason ?? "").trim()) throw coded(new ValidationError("A reason is required."), "REASON_REQUIRED");
  const row = await loadInvoiceRow(id);
  assertTransition("invoice", String(row.status), "VOID");
  const note = [row.notes, `Void: ${String(reason).trim()}`].filter(Boolean).join("\n");
  await controlPool().query("UPDATE Invoice SET status = 'VOID', notes = ? WHERE invoice_id = ? AND status = ?", [note, id, row.status]);
  void platformAudit({ action: "invoice.void", actorUserId: actorId, targetTid: row.tenant_id ?? null, payload: { invoiceId: id, reason } });
  return getInvoice(id, "platform");
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/**
 * Payment proof from an applicant or a school (Payment SUBMITTED). For an
 * application invoice, moves the application to PAYMENT_SUBMITTED and notifies
 * finance. Returns the serialised payment.
 */
export async function submitPayment(
  invoiceId: number,
  body: { method: PaymentMethod; reference: string; amount: number; paidAt: string },
  proof: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
  by: { kind: "APPLICANT" | "TENANT"; id: number },
): Promise<SerializedPayment> {
  const method = String(body?.method ?? "").toUpperCase() as PaymentMethod;
  if (!PAYMENT_METHODS.includes(method)) throw coded(new ValidationError("Choose how you paid."), "INVALID_METHOD");
  const reference = String(body?.reference ?? "").trim().slice(0, 120);
  if (!reference) throw coded(new ValidationError("The transaction reference is required."), "REFERENCE_REQUIRED");
  const amount = Number(body?.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw coded(new ValidationError("The amount must be a whole number."), "INVALID_AMOUNT");
  const paidAt = String(body?.paidAt ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || Number.isNaN(new Date(paidAt).getTime())) {
    throw coded(new ValidationError("The payment date is not valid."), "INVALID_DATE");
  }
  const fileErr = checkUpload(proof, false);
  if (fileErr) throw coded(new ValidationError(fileErr), "INVALID_FILE");

  const inv = await loadInvoiceRow(invoiceId);
  if (!["ISSUED", "OVERDUE"].includes(String(inv.status))) {
    throw coded(new ConflictError("This invoice is not open for payment."), "INVOICE_NOT_PAYABLE");
  }
  const proofPath = proof ? await storePlatformFile(`payments/${invoiceId}`, proof.buffer, proof.originalname) : null;

  const paymentId = await inControlTx(async (conn) => {
    await loadInvoiceRow(invoiceId, conn, true);
    const [pending] = await conn.query<RowDataPacket[]>("SELECT 1 FROM Payment WHERE invoice_id = ? AND status = 'SUBMITTED' LIMIT 1", [invoiceId]);
    if (pending.length) throw coded(new ConflictError("A payment is already waiting for confirmation."), "PAYMENT_PENDING");
    if (inv.application_id) {
      await transitionApplication(Number(inv.application_id), "PAYMENT_SUBMITTED", { kind: by.kind === "APPLICANT" ? "APPLICANT" : "PLATFORM", id: by.id }, {
        expectFrom: ["APPROVED_AWAITING_PAYMENT", "PAYMENT_REJECTED"],
        message: `Payment proof sent (${method}, ${reference}).`,
        conn,
      });
    }
    const [res] = await conn.query<ResultSetHeader>(
      `INSERT INTO Payment (invoice_id, method, payer_reference, amount, paid_at, proof_file, submitted_by_kind, submitted_by_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED')`,
      [invoiceId, method, reference, amount, paidAt, proofPath, by.kind, by.id],
    );
    return Number(res.insertId);
  });

  const who = (await billToOf(inv)).name;
  await notifyPlatformStaff({
    event: "payment.submitted",
    caps: [PLATFORM_CAPS.confirm],
    title: `Payment to confirm: ${who}`,
    body: `${inv.number ?? `Invoice #${invoiceId}`} — ${amount} ${inv.currency ?? "RWF"} by ${method} (${reference}).`,
    link: "/platform/billing",
    subjectType: "platform_payment",
    subjectId: paymentId,
    email: true,
  }).catch(() => 0);
  return serializePayment(await loadPaymentRow(paymentId), by.kind === "APPLICANT" ? "applicant" : "tenant");
}

/** What happens after an invoice is paid (confirmation or waiver), outside the transaction. */
async function afterPaid(inv: RowDataPacket, actorId: number | null): Promise<void> {
  if (inv.application_id) {
    const appId = Number(inv.application_id);
    try {
      await provisioning.startProvisioning(appId, actorId);
    } catch (err: any) {
      // The payment stays confirmed: provisioning can be retried from the console.
      logger.error(`[billing] provisioning did not start for application ${appId}: ${err?.message ?? err}`);
    }
  } else if (inv.tenant_id) {
    try {
      await subscription.onTenantInvoicePaid(Number(inv.invoice_id), actorId);
    } catch (err: any) {
      logger.error(`[billing] subscription update failed for invoice ${inv.invoice_id}: ${err?.message ?? err}`);
    }
  }
}

/** Inside a transaction: invoice -> PAID, application -> PAYMENT_CONFIRMED. */
async function markPaid(conn: PoolConnection, inv: RowDataPacket, actor: Actor, message: string): Promise<void> {
  assertTransition("invoice", String(inv.status), "PAID");
  await conn.query("UPDATE Invoice SET status = 'PAID', paid_at = ? WHERE invoice_id = ?", [new Date(), inv.invoice_id]);
  if (inv.application_id) {
    await transitionApplication(Number(inv.application_id), "PAYMENT_CONFIRMED", actor, { message, conn });
  }
}

async function paidNotice(inv: RowDataPacket): Promise<void> {
  try {
    const subject = `Payment received — ${inv.number ?? `invoice #${inv.invoice_id}`}`;
    if (inv.application_id) {
      const app = await loadApplicationRow(Number(inv.application_id));
      await emailApplicant(Number(app.account_id), subject, "Thank you. Your payment is confirmed and we are setting up your school now.");
    } else if (inv.tenant_id) {
      await notifySchoolOwners(Number(inv.tenant_id), { title: subject, body: "Thank you. Your payment is confirmed.", link: "/settings/subscription", subjectId: Number(inv.invoice_id) });
    }
  } catch (err) {
    logger.error("[billing] paid notice failed", { err });
  }
}

/** Finance confirms a SUBMITTED payment (separation of duties when the setting is on). */
export async function confirmPayment(paymentId: number, actorId: number, note?: string | null, ip?: string | null): Promise<SerializedPayment> {
  const settings = await getPlatformSettings();
  const pay = await loadPaymentRow(paymentId);
  assertTransition("payment", String(pay.status), "CONFIRMED");
  const inv0 = await loadInvoiceRow(Number(pay.invoice_id));
  if (settings["billing.separation_of_duties"] && inv0.application_id) {
    const app = await loadApplicationRow(Number(inv0.application_id));
    if (app.decided_by !== null && Number(app.decided_by) === Number(actorId)) {
      throw coded(new AuthorizationError("You approved this school, so someone else must confirm its payment."), "SEPARATION_OF_DUTIES");
    }
  }
  const inv = await inControlTx(async (conn) => {
    const p = await loadPaymentRow(paymentId, conn, true);
    assertTransition("payment", String(p.status), "CONFIRMED");
    const i = await loadInvoiceRow(Number(p.invoice_id), conn, true);
    await conn.query("UPDATE Payment SET status = 'CONFIRMED', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE payment_id = ?", [
      actorId,
      new Date(),
      note ? String(note).slice(0, 255) : null,
      paymentId,
    ]);
    await markPaid(conn, i, { kind: "PLATFORM", id: actorId, ip }, "Payment confirmed.");
    return i;
  });
  void platformAudit({ action: "payment.confirm", actorUserId: actorId, ip, targetTid: inv.tenant_id ?? null, payload: { paymentId, invoiceId: Number(inv.invoice_id), amount: Number(pay.amount), note: note ?? null } });
  await paidNotice(inv);
  await afterPaid(inv, actorId);
  return serializePayment(await loadPaymentRow(paymentId), "platform");
}

/** Finance rejects a SUBMITTED payment (note required, shown to the payer). */
export async function rejectPayment(paymentId: number, actorId: number, note: string, ip?: string | null): Promise<SerializedPayment> {
  const text = String(note ?? "").trim();
  if (!text) throw coded(new ValidationError("Say why the payment is rejected."), "REASON_REQUIRED");
  const inv = await inControlTx(async (conn) => {
    const p = await loadPaymentRow(paymentId, conn, true);
    assertTransition("payment", String(p.status), "REJECTED");
    const i = await loadInvoiceRow(Number(p.invoice_id), conn, true);
    await conn.query("UPDATE Payment SET status = 'REJECTED', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE payment_id = ?", [
      actorId,
      new Date(),
      text.slice(0, 255),
      paymentId,
    ]);
    if (i.application_id) {
      const app = await loadApplicationRow(Number(i.application_id), conn, true);
      if (app.status === "PAYMENT_SUBMITTED") {
        await transitionApplication(Number(i.application_id), "PAYMENT_REJECTED", { kind: "PLATFORM", id: actorId, ip }, { message: `Payment not accepted: ${text}`, conn });
      }
    }
    return i;
  });
  void platformAudit({ action: "payment.reject", actorUserId: actorId, ip, targetTid: inv.tenant_id ?? null, payload: { paymentId, invoiceId: Number(inv.invoice_id), note: text } });
  try {
    const subject = `Payment not accepted — ${inv.number ?? `invoice #${inv.invoice_id}`}`;
    const body = `We could not match your payment: ${text}\nPlease check the details and upload the proof again.`;
    if (inv.application_id) {
      const app = await loadApplicationRow(Number(inv.application_id));
      await emailApplicant(Number(app.account_id), subject, body, "/onboarding", "Upload again");
    } else if (inv.tenant_id) {
      await notifySchoolOwners(Number(inv.tenant_id), { title: subject, body, link: "/settings/subscription", subjectId: Number(inv.invoice_id) });
    }
  } catch (err) {
    logger.error("[billing] reject notice failed", { err });
  }
  return serializePayment(await loadPaymentRow(paymentId), "platform");
}

/** Waive an invoice (PLATFORM_BILLING_WAIVE, reason required): a confirmed zero OTHER payment, then the paid path. */
export async function waiveInvoice(id: number, reason: string, actorId: number, ip?: string | null): Promise<SerializedInvoice> {
  const text = String(reason ?? "").trim();
  if (!text) throw coded(new ValidationError("A reason is required."), "REASON_REQUIRED");
  const inv = await inControlTx(async (conn) => {
    const i = await loadInvoiceRow(id, conn, true);
    assertTransition("invoice", String(i.status), "PAID");
    // A proof waiting for review is superseded by the waiver.
    await conn.query(
      "UPDATE Payment SET status = 'REJECTED', reviewed_by = ?, reviewed_at = ?, review_note = 'Superseded by a waiver' WHERE invoice_id = ? AND status = 'SUBMITTED'",
      [actorId, new Date(), id],
    );
    await conn.query(
      `INSERT INTO Payment (invoice_id, method, payer_reference, amount, paid_at, submitted_by_kind, submitted_by_id, status, is_waiver, reviewed_by, reviewed_at, review_note)
       VALUES (?, 'OTHER', 'WAIVER', 0, ?, 'PLATFORM', ?, 'CONFIRMED', 1, ?, ?, ?)`,
      [id, new Date().toISOString().slice(0, 10), actorId, actorId, new Date(), text.slice(0, 255)],
    );
    await markPaid(conn, i, { kind: "PLATFORM", id: actorId, ip }, "Payment waived.");
    return i;
  });
  void platformAudit({ action: "invoice.waive", actorUserId: actorId, ip, targetTid: inv.tenant_id ?? null, payload: { invoiceId: id, amount: Number(inv.amount), reason: text } });
  await paidNotice(inv);
  await afterPaid(inv, actorId);
  return getInvoice(id, "platform");
}

/** Payments for the finance queue: each with its invoice and the school's name. */
export async function listPayments(status?: string) {
  const statuses = status ? String(status).split(",").map((s) => s.trim().toUpperCase()) : null;
  const [rows] = await controlPool().query<RowDataPacket[]>(
    `SELECT * FROM Payment${statuses ? " WHERE status IN (?)" : ""} ORDER BY created_at ASC, payment_id ASC LIMIT 500`,
    statuses ? [statuses] : [],
  );
  const invIds = [...new Set(rows.map((r) => Number(r.invoice_id)))];
  const [invRows] = invIds.length
    ? await controlPool().query<RowDataPacket[]>("SELECT * FROM Invoice WHERE invoice_id IN (?)", [invIds])
    : [[] as RowDataPacket[]];
  const invoices = await serializeRows(invRows, "platform");
  const names = new Map<number, string>();
  for (const r of invRows) names.set(Number(r.invoice_id), (await billToOf(r)).name);
  return rows.map((p) => ({
    ...serializePayment(p, "platform"),
    invoice: invoices.find((i) => i.id === Number(p.invoice_id))!,
    schoolName: names.get(Number(p.invoice_id)) ?? "—",
  }));
}

export async function paymentProofPath(paymentId: number): Promise<string | null> {
  const p = await loadPaymentRow(paymentId);
  return p.proof_file ?? null;
}

// ---------------------------------------------------------------------------
// Payment instructions
// ---------------------------------------------------------------------------

export function serializeInstruction(r: RowDataPacket) {
  return {
    id: Number(r.id),
    method: r.method as PaymentMethod,
    label: String(r.label),
    details: String(r.details),
    sortOrder: Number(r.sort_order),
    isActive: Number(r.is_active) === 1,
  };
}

/** Active payment instructions (serialised), for invoices and the tracker. */
export async function activePaymentInstructions() {
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM PaymentInstruction WHERE is_active = 1 ORDER BY sort_order, id");
    return rows.map(serializeInstruction);
  } catch (err: any) {
    if (err?.code === "ER_NO_SUCH_TABLE" || err?.code === "ER_BAD_DB_ERROR") return [];
    throw err;
  }
}

export async function allPaymentInstructions() {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM PaymentInstruction ORDER BY sort_order, id");
  return rows.map(serializeInstruction);
}

/** Full replace: rows with an id are updated, without one inserted, missing ones deleted. */
export async function savePaymentInstructions(items: unknown, actorId: number | null) {
  if (!Array.isArray(items)) throw coded(new ValidationError("items must be a list."), "INVALID_ITEMS");
  const clean = items.map((it: any, i: number) => {
    const method = String(it?.method ?? "").toUpperCase() as PaymentMethod;
    const label = String(it?.label ?? "").trim().slice(0, 100);
    const details = String(it?.details ?? "").trim().slice(0, 500);
    if (!PAYMENT_METHODS.includes(method) || !label || !details) {
      throw coded(new ValidationError("Each instruction needs a method, a label and details."), "INVALID_ITEMS");
    }
    return {
      id: it?.id ? Number(it.id) : null,
      method,
      label,
      details,
      sortOrder: Number.isFinite(Number(it?.sortOrder)) ? Number(it.sortOrder) : i,
      isActive: it?.isActive === false ? 0 : 1,
    };
  });
  await inControlTx(async (conn) => {
    const keep = clean.filter((c) => c.id).map((c) => c.id);
    await conn.query(`DELETE FROM PaymentInstruction${keep.length ? " WHERE id NOT IN (?)" : ""}`, keep.length ? [keep] : []);
    for (const c of clean) {
      if (c.id) {
        await conn.query("UPDATE PaymentInstruction SET method = ?, label = ?, details = ?, sort_order = ?, is_active = ? WHERE id = ?", [
          c.method, c.label, c.details, c.sortOrder, c.isActive, c.id,
        ]);
      } else {
        await conn.query("INSERT INTO PaymentInstruction (method, label, details, sort_order, is_active) VALUES (?, ?, ?, ?, ?)", [
          c.method, c.label, c.details, c.sortOrder, c.isActive,
        ]);
      }
    }
  });
  void platformAudit({ action: "payment_instructions.save", actorUserId: actorId, payload: { count: clean.length } });
  return allPaymentInstructions();
}

// ---------------------------------------------------------------------------
// PDF and the daily job
// ---------------------------------------------------------------------------

/** Stream the invoice PDF (rendered on demand, primary-tenant branding). */
export async function sendInvoicePdf(res: Response, invoiceId: number): Promise<void> {
  const row = await loadInvoiceRow(invoiceId);
  const { renderInvoicePdf } = await import("./invoicePdf");
  const pdf = await renderInvoicePdf({
    invoice: (await serializeRows([row], "platform"))[0],
    billTo: await billToOf(row),
    instructions: await activePaymentInstructions(),
  });
  const name = `${row.number ?? `invoice-${invoiceId}`}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${name}"`);
  res.setHeader("Cache-Control", "no-store");
  res.end(pdf);
}

/** Mark overdue invoices and expire unpaid applications (daily job). */
export async function runBillingExpiry(actor: Actor = { kind: "SYSTEM", id: null }): Promise<{ overdue: number; expired: number }> {
  const now = new Date();
  const [o] = await controlPool().query<ResultSetHeader>("UPDATE Invoice SET status = 'OVERDUE' WHERE status = 'ISSUED' AND due_at IS NOT NULL AND due_at < ?", [now]);
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT application_id, account_id FROM TenantApplication WHERE status IN ('APPROVED_AWAITING_PAYMENT','PAYMENT_REJECTED') AND expires_at IS NOT NULL AND expires_at < ?",
    [now],
  );
  let expired = 0;
  for (const r of rows) {
    try {
      await transitionApplication(Number(r.application_id), "EXPIRED", actor, {
        expectFrom: ["APPROVED_AWAITING_PAYMENT", "PAYMENT_REJECTED"],
        message: "No payment arrived before the deadline.",
      });
      expired++;
      await emailApplicant(Number(r.account_id), "Your application expired", "We did not receive a payment before the deadline. Reply to us if you still want to join.");
    } catch (err: any) {
      if (err?.statusCode !== 409) logger.error(`[billing] expiry failed for application ${r.application_id}: ${err?.message ?? err}`);
    }
  }
  return { overdue: Number(o.affectedRows ?? 0), expired };
}
