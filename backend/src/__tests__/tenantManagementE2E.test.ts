/**
 * Tenant management end to end (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §12): one
 * school's whole journey through the real endpoints of every work package, with
 * no seam stubbed -- register → verify → submit → changes requested → resubmit →
 * approve → invoice → proof → confirm → provisioning → the owner signs in to
 * the new school with the password chosen at registration → setup + subscription.
 *
 * The spokes (Task Mentor, Tendo, Tupo) are not running: outside production their
 * provisioning steps are SKIPPED, which is what this asserts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { RowDataPacket } from "mysql2/promise";
import app from "../app";
import { controlPool } from "../db/platform";
import { PLATFORM_CAP_LIST } from "../services/tenantMgmt/catalog";
import { peekOtpForTests } from "../services/tenantMgmt/applicants";
import { waitForProvisioning } from "../services/tenantMgmt/provisioning";
import { setPlatformSetting } from "../services/tenantMgmt/settings";
import { invalidateEntitlements } from "../services/tenantMgmt/entitlements";
import { invalidateTenants } from "../tenancy";
import { poolFor } from "../db/pools";
import { installFakeFileServer } from "../test/fakeFileServer";
import { ensurePlatform, platformUser, removeSchool, sessionToken } from "../test/tenantMgmtFixtures";

const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const email = `e2e.head.${stamp}@example.com`;
const password = "E2e-School-pw!42";
const slug = `e2e-${stamp}`.slice(0, 40);
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

// The Express route table, flattened (same walk as tenantOnboarding.test.ts's crawl).
type Route = { method: string; path: string };
function mountOf(layer: any): string {
  if (layer.regexp?.fast_slash) return "";
  let src: string = layer.regexp?.source ?? "";
  src = src.replace(/^\^/, "").replace(/\\\/\?\(\?=\\\/\|\$\)$/i, "").replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, "1");
  return src.replace(/\\\//g, "/").replace(/\\\./g, ".");
}
function collect(stack: any[], prefix: string, out: Route[]) {
  for (const layer of stack) {
    if (layer.route && typeof layer.route.path === "string") {
      for (const m of Object.keys(layer.route.methods)) if (m !== "_all") out.push({ method: m, path: prefix + layer.route.path });
    } else if (layer.name === "router" && layer.handle?.stack) {
      collect(layer.handle.stack, prefix + mountOf(layer), out);
    }
  }
}
const fill = (p: string) => p.replace(/:[A-Za-z_]+\??(\([^)]*\))?/g, "1").replace(/\*/g, "x") || "/";

let owner: { id: number; token: string };
let goldPrice: number | null = null;
let applicationId = 0;
let tid = 0;

beforeAll(async () => {
  await ensurePlatform();
  installFakeFileServer();
  await setPlatformSetting("billing.auto_issue_on_approval", false);
  await setPlatformSetting("billing.separation_of_duties", false);
  owner = await platformUser(PLATFORM_CAP_LIST);
  const [[gold]] = (await controlPool().query<RowDataPacket[]>("SELECT price_term_rwf FROM Package WHERE code = 'gold'")) as any;
  goldPrice = gold?.price_term_rwf ?? null;
}, 120_000);

afterAll(async () => {
  await controlPool().query("UPDATE Package SET price_term_rwf = ? WHERE code = 'gold'", [goldPrice]);
  invalidateEntitlements();
  await removeSchool(tid, applicationId);
});

describe("a school's whole journey", () => {
  let token = "";

  it("registers, verifies and submits", async () => {
    // The owner sets the Gold price first: an invoice needs an amount to be paid.
    const price = await request(app).put("/platform/packages/gold").set(bearer(owner.token)).send({ priceTerm: 150000 });
    expect(price.status, JSON.stringify(price.body)).toBe(200);

    const pkgs = await request(app).get("/packages/public");
    expect(pkgs.body.data.find((p: any) => p.code === "gold")).toMatchObject({ priceTerm: 150000 });
    expect((await request(app).get("/onboarding/slug-available").query({ slug })).body.data.available).toBe(true);

    const start = await request(app).post("/onboarding/accounts").send({ fullName: "E2E Head", email, phone: "0788000111", password });
    expect(start.status, JSON.stringify(start.body)).toBeLessThan(300);
    const code = peekOtpForTests(email);
    expect(code).toMatch(/^\d{6}$/);
    const verified = await request(app).post("/onboarding/accounts/verify").send({ email, code });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    token = verified.body.data.token;

    const draft = await request(app)
      .post("/onboarding/applications")
      .set(bearer(token))
      .send({
        schoolName: `E2E Academy ${stamp}`,
        schoolType: "secondary",
        country: "RW",
        province: "Kigali City",
        district: "Gasabo",
        schoolPhone: "0788222333",
        schoolEmail: `office.${stamp}@example.com`,
        estStudents: 400,
        estStaff: 25,
        desiredSlug: slug,
        requestedPackage: "gold",
        billingCycle: "TERM",
      });
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    applicationId = draft.body.data.id;

    const doc = await request(app)
      .post(`/onboarding/applications/${applicationId}/documents`)
      .set(bearer(token))
      .field("kind", "REGISTRATION_CERT")
      .attach("file", Buffer.from("%PDF-1.4 e2e"), { filename: "cert.pdf", contentType: "application/pdf" });
    expect(doc.status, JSON.stringify(doc.body)).toBeLessThan(300);

    const submitted = await request(app).post(`/onboarding/applications/${applicationId}/submit`).set(bearer(token)).send({ acceptTerms: true });
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    expect(submitted.body.data).toMatchObject({ status: "SUBMITTED", step: "submitted" });
    expect(submitted.body.data.ref).toMatch(/^APP-\d{4}-\d{4}$/);
  });

  it("is reviewed: changes requested, resubmitted, approved", async () => {
    const queue = await request(app).get("/platform/applications").set(bearer(owner.token));
    expect(queue.body.data.some((a: any) => a.id === applicationId)).toBe(true);

    expect((await request(app).post(`/platform/applications/${applicationId}/start-review`).set(bearer(owner.token))).status).toBe(200);
    const ask = await request(app)
      .post(`/platform/applications/${applicationId}/request-changes`)
      .set(bearer(owner.token))
      .send({ message: "Please add the school's address." });
    expect(ask.status, JSON.stringify(ask.body)).toBe(200);

    let me = await request(app).get("/onboarding/me").set(bearer(token));
    expect(me.body.data.application.status).toBe("CHANGES_REQUESTED");
    expect(me.body.data.nextActions).toContain("FIX_CHANGES");

    expect((await request(app).patch(`/onboarding/applications/${applicationId}`).set(bearer(token)).send({ address: "KG 7 Ave" })).status).toBe(200);
    const again = await request(app).post(`/onboarding/applications/${applicationId}/submit`).set(bearer(token)).send({ acceptTerms: true });
    expect(again.body.data.status).toBe("UNDER_REVIEW");

    const approve = await request(app)
      .post(`/platform/applications/${applicationId}/approve`)
      .set(bearer(owner.token))
      .send({ packageCode: "gold", billingCycle: "TERM", slug });
    expect(approve.status, JSON.stringify(approve.body)).toBe(200);
    expect(approve.body.data.application.status).toBe("APPROVED_AWAITING_PAYMENT");

    me = await request(app).get("/onboarding/me").set(bearer(token));
    expect(me.body.data.application.step).toBe("approved");
    // The drafted invoice is not the applicant's until finance issues it.
    expect(me.body.data.invoice).toBeNull();
  });

  it("is invoiced, pays, and finance confirms", async () => {
    const drafts = await request(app).get("/platform/invoices").query({ applicationId }).set(bearer(owner.token));
    const invoice = drafts.body.data[0];
    expect(invoice).toMatchObject({ status: "DRAFT", amount: 150000, packageCode: "gold" });
    const issued = await request(app).post(`/platform/invoices/${invoice.id}/issue`).set(bearer(owner.token));
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    expect(issued.body.data.number).toMatch(/^INV-\d{4}-\d{4}$/);

    const me = await request(app).get("/onboarding/me").set(bearer(token));
    expect(me.body.data.nextActions).toContain("PAY_INVOICE");
    expect(me.body.data.invoice.id).toBe(invoice.id);

    const paid = await request(app)
      .post(`/onboarding/invoices/${invoice.id}/payments`)
      .set(bearer(token))
      .field("method", "MOMO")
      .field("reference", `MP${stamp}`)
      .field("amount", "150000")
      .field("paidAt", new Date().toISOString().slice(0, 10))
      .attach("proof", Buffer.from("PNGDATA"), { filename: "receipt.png", contentType: "image/png" });
    expect(paid.status, JSON.stringify(paid.body)).toBeLessThan(300);

    const queue = await request(app).get("/platform/payments").query({ status: "SUBMITTED" }).set(bearer(owner.token));
    const payment = queue.body.data.find((p: any) => p.invoiceId === invoice.id);
    expect(payment).toBeTruthy();
    const confirmed = await request(app).post(`/platform/payments/${payment.id}/confirm`).set(bearer(owner.token)).send({ note: "Matched MoMo statement" });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
  });

  it("is provisioned and goes live", async () => {
    await waitForProvisioning(applicationId);
    invalidateTenants();
    const me = await request(app).get("/onboarding/me").set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.data.application.status, JSON.stringify(me.body.data.provisioning)).toBe("ACTIVE");
    expect(me.body.data.nextActions).toContain("GO_TO_SCHOOL");
    expect(me.body.data.school).toMatchObject({ slug });
    tid = me.body.data.school.tid;
    expect(tid).toBeGreaterThan(1);

    const steps: any[] = me.body.data.provisioning.steps;
    expect(steps.filter((s) => s.status === "FAILED")).toEqual([]);
    // No spokes run in tests: their steps are skipped outside production.
    for (const k of ["APP_TASKMENTOR", "APP_TUPO"]) expect(steps.find((s) => s.key === k)?.status ?? "SKIPPED").toBe("SKIPPED");

    const [[t]] = (await controlPool().query<RowDataPacket[]>("SELECT status, package_code FROM Tenant WHERE tenant_id = ?", [tid])) as any;
    expect(t).toMatchObject({ status: "ACTIVE", package_code: "gold" });
  });

  it("lets the owner into the new school, and only there", async () => {
    // The password chosen at registration works on the new school (no new password).
    const login = await request(app).post("/auth/login").send({ username: email, password, tenant: slug });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    expect(login.body.data.tenant.tid).toBe(tid);

    const [[u]] = await poolFor(tid).query<any[]>("SELECT user_id FROM `User` WHERE email = ?", [email]);
    const session = await sessionToken(Number(u.user_id), tid);

    const setup = await request(app).get("/tenant/setup").set(bearer(session));
    expect(setup.status, JSON.stringify(setup.body)).toBe(200);
    expect(setup.body.data.items.length).toBe(8);

    const account = await request(app).get("/tenant/subscription").set(bearer(session));
    expect(account.status, JSON.stringify(account.body)).toBe(200);
    expect(account.body.data.package.code).toBe("gold");
    expect(account.body.data.subscription).toMatchObject({ status: "ACTIVE", packageCode: "gold" });

    // The owner holds the platform-owner preset (SUPER_ADMIN) inside their school, yet no
    // PLATFORM_* capability survives outside the primary tenant.
    const me = await request(app).get("/access/me").set(bearer(session));
    if (me.status === 200) {
      expect(JSON.stringify(me.body)).not.toMatch(/PLATFORM_(TENANTS|APPLICATIONS|BILLING|PACKAGES|SUPPORT|AUDIT)_/);
    }

    // The crawl (plan §12): every console route refuses this school's super admin.
    const routes: Route[] = [];
    collect((app as any)._router.stack, "", routes);
    const platform = [...new Map(
      routes.filter((r) => r.path.startsWith("/platform/") && r.path !== "/platform/tenants/active").map((r) => [`${r.method} ${fill(r.path)}`, r]),
    ).values()];
    expect(platform.length).toBeGreaterThan(40);
    const opened: string[] = [];
    for (const r of platform) {
      let q = (request(app) as any)[r.method](fill(r.path)).set(bearer(session));
      if (r.method !== "get") q = q.send({});
      const status = (await q).status;
      if (status !== 403 && status !== 404) opened.push(`${r.method.toUpperCase()} ${r.path} -> ${status}`);
    }
    expect(opened).toEqual([]);

    // A school's super admin is not platform staff: the console does not exist for them.
    expect((await request(app).get("/platform/applications").set(bearer(session))).status).toBe(404);
    expect((await request(app).get("/platform/overview").set(bearer(session))).status).toBe(404);

    // The onboarding token turned read-only at conversion: the tracker still shows "live",
    // every change is refused, and signing out ends it.
    expect((await request(app).get("/onboarding/me").set(bearer(token))).status).toBe(200);
    const write = await request(app).post(`/onboarding/applications/${applicationId}/withdraw`).set(bearer(token)).send({});
    expect(write.status).toBe(403);
    expect(write.body.code).toBe("USE_SCHOOL_LOGIN");
    expect((await request(app).post("/onboarding/logout").set(bearer(token))).status).toBe(200);
    expect((await request(app).get("/onboarding/me").set(bearer(token))).status).toBe(401);
  });
});
