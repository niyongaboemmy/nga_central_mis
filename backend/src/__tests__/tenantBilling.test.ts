/**
 * Tenant management, invoicing and manual payments
 * (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.4, M4; work package C), plus the
 * package catalogue admin.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import emailService from "../utils/email";
import jwt from "jsonwebtoken";
import request from "supertest";
import { RowDataPacket } from "mysql2/promise";
import app from "../app";
import { db } from "../db";
import { controlPool } from "../db/platform";
import { AccessGrant } from "../db/accessSchema";
import { bootstrapPlatform, createTenantRow, getTenant, invalidateTenants } from "../tenancy";
import { ensureAccessRegistry } from "../services/access/registry";
import { clearSnapshotCache } from "../services/access/snapshotCache";
import { createRoleWithPermissions, createUser } from "../test/fixtures";
import { installFakeFileServer } from "../test/fakeFileServer";
import { PLATFORM_CAP_LIST } from "../services/tenantMgmt/catalog";
import * as provisioning from "../services/tenantMgmt/provisioning";
import * as subscription from "../services/tenantMgmt/subscription";
import * as billing from "../services/tenantMgmt/billing";
import { invalidateEntitlements, resolveEntitlements } from "../services/tenantMgmt/entitlements";
import { setPlatformSetting } from "../services/tenantMgmt/settings";

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const year = new Date().getUTCFullYear();
const tokenFor = (userId: number, tid = 1) => jwt.sign({ userId, tokenVersion: 0, tid }, process.env.JWT_SECRET!, { expiresIn: "1h" });
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const DAY = 24 * 3600 * 1000;

async function platformUser(caps: string[]): Promise<{ id: number; token: string }> {
  const id = await createUser({ userType: "ADMIN" });
  const roleId = await createRoleWithPermissions("PLATFORM_BILL_TEST", caps);
  await db.insert(AccessGrant).values({ user_id: id, role_id: roleId, scope_type: "PLATFORM" as any, scope_id: null, source: "MANUAL", status: "ACTIVE" });
  clearSnapshotCache();
  return { id, token: tokenFor(id) };
}

let seq = 0;
async function seedApplication(status = "UNDER_REVIEW") {
  const n = `${stamp}${seq++}`;
  const [acc]: any = await controlPool().query(
    "INSERT INTO ApplicantAccount (email_norm, full_name, password_hash, email_verified_at) VALUES (?, ?, 'x', NOW())",
    [`bill${n}@school${n}.rw`, `Bursar ${n}`],
  );
  const [res]: any = await controlPool().query(
    `INSERT INTO TenantApplication (ref, account_id, status, school_name, district, requested_package, billing_cycle, desired_slug, submitted_at)
     VALUES (?, ?, ?, ?, 'Gasabo', 'gold', 'TERM', ?, NOW())`,
    [`TSB-${n.slice(-12)}`, acc.insertId, status, `Billing School ${n}`, `bs-${n}`],
  );
  return { id: Number(res.insertId), accountId: Number(acc.insertId), slug: `bs-${n}` };
}

const appStatus = async (id: number) =>
  String(((await controlPool().query<RowDataPacket[]>("SELECT status FROM TenantApplication WHERE application_id = ?", [id])) as any)[0][0].status);

let owner: { id: number; token: string };
let finance: { id: number; token: string };
let decider: { id: number; token: string };
let startSpy: ReturnType<typeof vi.spyOn>;
let paidSpy: ReturnType<typeof vi.spyOn>;
let goldBefore: { price_term_rwf: number | null };

async function approve(by: { token: string }, slug: string, id: number) {
  const r = await request(app).post(`/platform/applications/${id}/approve`).set(auth(by.token)).send({ packageCode: "gold", billingCycle: "TERM", slug });
  expect(r.status).toBe(200);
  return r.body.data;
}

/** Approve + issue: an application waiting for payment with an ISSUED invoice. */
async function awaitingPayment(by = owner) {
  const a = await seedApplication();
  const d = await approve(by, a.slug, a.id);
  const issued = await request(app).post(`/platform/invoices/${d.invoice.id}/issue`).set(auth(finance.token));
  expect(issued.status).toBe(200);
  return { ...a, invoiceId: d.invoice.id as number };
}

const proof = { buffer: Buffer.from("%PDF-1.4 proof"), originalname: "momo.pdf", mimetype: "application/pdf", size: 14 };
const pay = (invoiceId: number, accountId: number) =>
  billing.submitPayment(invoiceId, { method: "MOMO", reference: `MP${stamp}${seq++}`, amount: 150000, paidAt: new Date().toISOString().slice(0, 10) }, proof, {
    kind: "APPLICANT",
    id: accountId,
  });

beforeAll(async () => {
  await bootstrapPlatform();
  await ensureAccessRegistry();
  installFakeFileServer();
  invalidateTenants();
  if (!(await getTenant(2))) {
    await createTenantRow({ slug: "mt-two", name: "MT Two", tid: 2, status: "ACTIVE" });
    invalidateTenants();
  }
  // Invoice numbers are a yearly series: start this run's from 0001.
  await controlPool().query("DELETE FROM Payment");
  await controlPool().query("DELETE FROM Invoice");
  await controlPool().query("DELETE FROM PlatformSequence WHERE seq_key LIKE 'INV-%'");
  await setPlatformSetting("billing.separation_of_duties", false);
  await setPlatformSetting("billing.auto_issue_on_approval", false);
  goldBefore = ((await controlPool().query<RowDataPacket[]>("SELECT price_term_rwf FROM Package WHERE code = 'gold'")) as any)[0][0];

  owner = await platformUser(PLATFORM_CAP_LIST);
  finance = await platformUser(["PLATFORM_TENANTS_VIEW", "PLATFORM_BILLING_INVOICE", "PLATFORM_BILLING_CONFIRM"]);
  decider = await platformUser(["PLATFORM_APPLICATIONS_REVIEW", "PLATFORM_APPLICATIONS_DECIDE", "PLATFORM_BILLING_CONFIRM"]);
  // The test env really reaches SMTP: never send (finance / applicant notices).
  vi.spyOn(emailService, "sendEmail").mockResolvedValue(true);
  startSpy = vi.spyOn(provisioning, "startProvisioning").mockResolvedValue({ runId: 1 });
  paidSpy = vi.spyOn(subscription, "onTenantInvoicePaid").mockResolvedValue(undefined);
}, 120_000);

afterAll(async () => {
  startSpy?.mockRestore();
  paidSpy?.mockRestore();
  await controlPool().query("UPDATE Package SET price_term_rwf = ? WHERE code = 'gold'", [goldBefore?.price_term_rwf ?? null]);
  await setPlatformSetting("billing.separation_of_duties", false);
});

describe("invoices", () => {
  it("approval drafts the NEW invoice from the package price", async () => {
    const put = await request(app).put("/platform/packages/gold").set(auth(owner.token)).send({ priceTerm: 150000 });
    expect(put.status).toBe(200);
    expect(put.body.data.priceTerm).toBe(150000);
    const a = await seedApplication();
    const d = await approve(owner, a.slug, a.id);
    expect(d.invoice).toMatchObject({ status: "DRAFT", kind: "NEW", amount: 150000, currency: "RWF", number: null, applicationId: a.id });
    expect(d.invoice.lines).toEqual([{ label: "Gold package — one term", amount: 150000 }]);
    expect(d.invoice.pdfUrl).toBe(`/platform/invoices/${d.invoice.id}/pdf`);
    // Applicants never see a draft.
    expect(await billing.invoiceForApplication(a.id, "applicant")).toBeNull();
  });

  it("issues with yearly numbering INV-YYYY-0001, -0002 and a due date", async () => {
    const a = await seedApplication();
    const b = await seedApplication();
    const da = await approve(owner, a.slug, a.id);
    const db2 = await approve(owner, b.slug, b.id);
    const i1 = await request(app).post(`/platform/invoices/${da.invoice.id}/issue`).set(auth(finance.token));
    const i2 = await request(app).post(`/platform/invoices/${db2.invoice.id}/issue`).set(auth(finance.token));
    expect(i1.body.data.number).toBe(`INV-${year}-0001`);
    expect(i2.body.data.number).toBe(`INV-${year}-0002`);
    expect(i1.body.data.status).toBe("ISSUED");
    const due = new Date(i1.body.data.dueAt).getTime() - new Date(i1.body.data.issuedAt).getTime();
    expect(Math.round(due / DAY)).toBe(14);
    const again = await request(app).post(`/platform/invoices/${da.invoice.id}/issue`).set(auth(finance.token));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("INVALID_TRANSITION");
    const applicantView = await billing.invoiceForApplication(a.id, "applicant");
    expect(applicantView?.pdfUrl).toBe(`/onboarding/invoices/${da.invoice.id}/pdf`);
  });

  it("creates, edits (draft only), issues and voids a tenant invoice", async () => {
    const c = await request(app).post("/platform/invoices").set(auth(finance.token)).send({ tenantId: 2, packageCode: "gold", billingCycle: "TERM" });
    expect(c.status).toBe(201);
    expect(c.body.data).toMatchObject({ kind: "RENEWAL", tenantId: 2, status: "DRAFT", amount: 150000 });
    const id = c.body.data.id;
    const p = await request(app)
      .patch(`/platform/invoices/${id}`)
      .set(auth(finance.token))
      .send({ lines: [{ label: "Gold — term 2", amount: 120000 }, { label: "Setup", amount: 10000 }], notes: "Discounted" });
    expect(p.body.data.amount).toBe(130000);
    expect(p.body.data.notes).toBe("Discounted");
    expect((await request(app).patch(`/platform/invoices/${id}`).set(auth(finance.token)).send({ amount: -1 })).status).toBe(400);
    await request(app).post(`/platform/invoices/${id}/issue`).set(auth(finance.token));
    const late = await request(app).patch(`/platform/invoices/${id}`).set(auth(finance.token)).send({ amount: 1 });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("INVOICE_NOT_DRAFT");
    expect((await request(app).post(`/platform/invoices/${id}/void`).set(auth(finance.token)).send({})).status).toBe(400);
    const v = await request(app).post(`/platform/invoices/${id}/void`).set(auth(finance.token)).send({ reason: "Duplicate" });
    expect(v.body.data.status).toBe("VOID");
    const list = await request(app).get("/platform/invoices").query({ tenantId: 2 }).set(auth(finance.token));
    expect(list.body.data.some((i: any) => i.id === id && i.status === "VOID")).toBe(true);
    expect((await billing.invoicesForTenant(2, "tenant")).every((i) => i.pdfUrl.startsWith("/tenant/invoices/"))).toBe(true);
  });

  it("renders the PDF", async () => {
    const [[inv]]: any = await controlPool().query("SELECT invoice_id FROM Invoice WHERE number IS NOT NULL ORDER BY invoice_id LIMIT 1");
    const r = await request(app)
      .get(`/platform/invoices/${inv.invoice_id}/pdf`)
      .set(auth(finance.token))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("application/pdf");
    expect((r.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
  }, 90_000);
});

describe("payments", () => {
  it("proof -> PAYMENT_SUBMITTED; confirm -> PAID + PAYMENT_CONFIRMED + provisioning started", async () => {
    const a = await awaitingPayment();
    const p = await pay(a.invoiceId, a.accountId);
    expect(p).toMatchObject({ status: "SUBMITTED", method: "MOMO", amount: 150000, proofUrl: null });
    expect(await appStatus(a.id)).toBe("PAYMENT_SUBMITTED");
    await expect(pay(a.invoiceId, a.accountId)).rejects.toMatchObject({ statusCode: 409, code: "PAYMENT_PENDING" });

    const queue = await request(app).get("/platform/payments").query({ status: "SUBMITTED" }).set(auth(finance.token));
    const row = queue.body.data.find((x: any) => x.id === p.id);
    expect(row.schoolName).toMatch(/^Billing School/);
    expect(row.invoice.id).toBe(a.invoiceId);
    expect(row.proofUrl).toBe(`/platform/payments/${p.id}/proof`);
    const file = await request(app).get(row.proofUrl).set(auth(finance.token));
    expect(file.status).toBe(200);

    startSpy.mockClear();
    const c = await request(app).post(`/platform/payments/${p.id}/confirm`).set(auth(finance.token)).send({ note: "Matched" });
    expect(c.status).toBe(200);
    expect(c.body.data.status).toBe("CONFIRMED");
    const inv = await billing.getInvoice(a.invoiceId, "platform");
    expect(inv.status).toBe("PAID");
    expect(inv.paidAt).toBeTruthy();
    expect(await appStatus(a.id)).toBe("PAYMENT_CONFIRMED");
    expect(startSpy).toHaveBeenCalledWith(a.id, finance.id);
    expect((await request(app).post(`/platform/payments/${p.id}/confirm`).set(auth(finance.token))).status).toBe(409);
  });

  it("keeps the confirmation when provisioning cannot start", async () => {
    const a = await awaitingPayment();
    const p = await pay(a.invoiceId, a.accountId);
    startSpy.mockRejectedValueOnce(new Error("provisioning.startProvisioning not implemented"));
    const c = await request(app).post(`/platform/payments/${p.id}/confirm`).set(auth(finance.token));
    expect(c.status).toBe(200);
    expect(await appStatus(a.id)).toBe("PAYMENT_CONFIRMED");
  });

  it("rejects a payment (note required) and lets the applicant send it again", async () => {
    const a = await awaitingPayment();
    const p = await pay(a.invoiceId, a.accountId);
    expect((await request(app).post(`/platform/payments/${p.id}/reject`).set(auth(finance.token)).send({})).status).toBe(400);
    const r = await request(app).post(`/platform/payments/${p.id}/reject`).set(auth(finance.token)).send({ note: "Reference not found" });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: "REJECTED", reviewNote: "Reference not found" });
    expect(await appStatus(a.id)).toBe("PAYMENT_REJECTED");
    await pay(a.invoiceId, a.accountId);
    expect(await appStatus(a.id)).toBe("PAYMENT_SUBMITTED");
  });

  it("waives an invoice (WAIVE + reason) through the paid path", async () => {
    const a = await awaitingPayment();
    expect((await request(app).post(`/platform/invoices/${a.invoiceId}/waive`).set(auth(finance.token)).send({ reason: "Pilot" })).status).toBe(403);
    expect((await request(app).post(`/platform/invoices/${a.invoiceId}/waive`).set(auth(owner.token)).send({})).status).toBe(400);
    startSpy.mockClear();
    const w = await request(app).post(`/platform/invoices/${a.invoiceId}/waive`).set(auth(owner.token)).send({ reason: "Pilot school" });
    expect(w.status).toBe(200);
    expect(w.body.data.status).toBe("PAID");
    expect(w.body.data.payments[0]).toMatchObject({ isWaiver: true, amount: 0, method: "OTHER", status: "CONFIRMED", reviewNote: "Pilot school" });
    expect(await appStatus(a.id)).toBe("PAYMENT_CONFIRMED");
    expect(startSpy).toHaveBeenCalledWith(a.id, owner.id);
    const audit = await request(app).get("/platform/audit").query({ action: "invoice.waive" }).set(auth(owner.token));
    expect(audit.body.data.some((e: any) => e.payload?.invoiceId === a.invoiceId)).toBe(true);
  });

  it("separation of duties: the approver may not confirm the payment", async () => {
    await setPlatformSetting("billing.separation_of_duties", true);
    try {
      const a = await awaitingPayment(decider);
      const p = await pay(a.invoiceId, a.accountId);
      const self = await request(app).post(`/platform/payments/${p.id}/confirm`).set(auth(decider.token));
      expect(self.status).toBe(403);
      expect(self.body.code).toBe("SEPARATION_OF_DUTIES");
      expect((await request(app).post(`/platform/payments/${p.id}/confirm`).set(auth(finance.token))).status).toBe(200);
    } finally {
      await setPlatformSetting("billing.separation_of_duties", false);
    }
  });

  it("a paid tenant invoice hands over to the subscription", async () => {
    const c = await request(app).post("/platform/invoices").set(auth(finance.token)).send({ tenantId: 2, packageCode: "gold", kind: "CHANGE" });
    await request(app).post(`/platform/invoices/${c.body.data.id}/issue`).set(auth(finance.token));
    const p = await billing.submitPayment(c.body.data.id, { method: "BANK_TRANSFER", reference: `BK${stamp}`, amount: 150000, paidAt: "2026-11-10" }, undefined, {
      kind: "TENANT",
      id: 5,
    });
    paidSpy.mockClear();
    expect((await request(app).post(`/platform/payments/${p.id}/confirm`).set(auth(finance.token))).status).toBe(200);
    expect(paidSpy).toHaveBeenCalledWith(c.body.data.id, finance.id);
  });

  it("the daily job marks overdue invoices and expires unpaid applications", async () => {
    const a = await awaitingPayment();
    const past = new Date(Date.now() - 2 * DAY);
    await controlPool().query("UPDATE Invoice SET due_at = ? WHERE invoice_id = ?", [past, a.invoiceId]);
    await controlPool().query("UPDATE TenantApplication SET expires_at = ? WHERE application_id = ?", [past, a.id]);
    const out = await billing.runBillingExpiry();
    expect(out.overdue).toBeGreaterThanOrEqual(1);
    expect(out.expired).toBeGreaterThanOrEqual(1);
    expect((await billing.getInvoice(a.invoiceId, "platform")).status).toBe("OVERDUE");
    expect(await appStatus(a.id)).toBe("EXPIRED");
    // Reopen puts it back on the payment step.
    const ro = await request(app).post(`/platform/applications/${a.id}/reopen`).set(auth(owner.token)).send({ reason: "Paid late" });
    expect(ro.body.data.application.status).toBe("APPROVED_AWAITING_PAYMENT");
  });

  it("saves payment instructions (full replace) and shows the active ones", async () => {
    const put = await request(app)
      .put("/platform/payment-instructions")
      .set(auth(finance.token))
      .send({ items: [{ method: "MOMO", label: "MTN MoMo", details: "078 000 0000 (NGA)", sortOrder: 0, isActive: true }, { method: "BANK_TRANSFER", label: "Bank", details: "BK 000-111", sortOrder: 1, isActive: false }] });
    expect(put.status).toBe(200);
    expect(put.body.data.map((i: any) => i.label)).toEqual(["MTN MoMo", "Bank"]);
    expect((await billing.activePaymentInstructions()).map((i) => i.label)).toEqual(["MTN MoMo"]);
    const keep = put.body.data[0];
    const again = await request(app).put("/platform/payment-instructions").set(auth(finance.token)).send({ items: [{ ...keep, details: "078 111 1111" }] });
    expect(again.body.data).toEqual([{ ...keep, details: "078 111 1111" }]);
    expect((await request(app).put("/platform/payment-instructions").set(auth(decider.token)).send({ items: [] })).status).toBe(403);
  });
});

describe("packages admin", () => {
  it("lists packages with entitlements and the entitlement catalogue", async () => {
    const r = await request(app).get("/platform/packages").set(auth(finance.token));
    expect(r.status).toBe(200);
    expect(r.body.data.map((p: any) => p.code)).toEqual(expect.arrayContaining(["starter", "gold", "premium", "max"]));
    const gold = r.body.data.find((p: any) => p.code === "gold");
    expect(gold.entitlements.find((e: any) => e.key === "limit.students")).toMatchObject({ kind: "LIMIT", value: 1000, label: "Students" });
    const cat = await request(app).get("/platform/entitlement-catalog").set(auth(finance.token));
    expect(cat.body.data.some((e: any) => e.key === "app.tupo" && e.kind === "APP")).toBe(true);
    expect(cat.body.data.some((e: any) => e.key === "limit.ai_requests_day" && e.kind === "LIMIT")).toBe(true);
    expect((await request(app).put("/platform/packages/gold").set(auth(finance.token)).send({ name: "Gold" })).status).toBe(403);
  });

  it("validates entitlement edits and invalidates cached entitlements", async () => {
    const [[t2]]: any = await controlPool().query("SELECT package_code FROM Tenant WHERE tenant_id = 2");
    await controlPool().query("UPDATE Tenant SET package_code = 'gold' WHERE tenant_id = 2");
    invalidateEntitlements(2); // another suite may have cached tenant 2's old package
    const before = (await request(app).get("/platform/packages").set(auth(owner.token))).body.data.find((p: any) => p.code === "gold").entitlements;
    try {
      expect((await request(app).put("/platform/packages/gold/entitlements").set(auth(owner.token)).send({ entitlements: [{ key: "feature.nope", value: null }] })).status).toBe(400);
      expect((await request(app).put("/platform/packages/gold/entitlements").set(auth(owner.token)).send({ entitlements: [{ key: "limit.staff", value: -1 }] })).status).toBe(400);
      expect((await resolveEntitlements(2)).features).toContain("feature.elearning");
      const next = before.filter((e: any) => e.key !== "feature.elearning").map((e: any) => (e.key === "limit.staff" ? { key: e.key, value: 99 } : { key: e.key, value: e.value }));
      const put = await request(app).put("/platform/packages/gold/entitlements").set(auth(owner.token)).send({ entitlements: next });
      expect(put.status).toBe(200);
      expect(put.body.data.entitlements.some((e: any) => e.key === "feature.elearning")).toBe(false);
      const ent = await resolveEntitlements(2); // cached a moment ago: must be fresh now
      expect(ent.features).not.toContain("feature.elearning");
      expect(ent.limits["limit.staff"]).toBe(99);
    } finally {
      await request(app)
        .put("/platform/packages/gold/entitlements")
        .set(auth(owner.token))
        .send({ entitlements: before.map((e: any) => ({ key: e.key, value: e.value })) });
      await controlPool().query("UPDATE Tenant SET package_code = ? WHERE tenant_id = 2", [t2.package_code]);
    }
  });
});
