/**
 * Tenant management, platform console -- review and decisions
 * (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.3, M3; work package C).
 *
 * Applications are seeded straight into the control plane (the applicant side is
 * package B); platform staff are primary-tenant users with a PLATFORM-scope grant.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import emailService from "../utils/email";
import jwt from "jsonwebtoken";
import request from "supertest";
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
import { transitionApplication } from "../services/tenantMgmt/applicationStore";
import { similarNames } from "../services/tenantMgmt/review";

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const tokenFor = (userId: number, tid = 1) => jwt.sign({ userId, tokenVersion: 0, tid }, process.env.JWT_SECRET!, { expiresIn: "1h" });

async function platformUser(caps: string[]): Promise<{ id: number; token: string }> {
  const id = await createUser({ userType: "ADMIN" });
  const roleId = await createRoleWithPermissions("PLATFORM_TEST", caps);
  await db.insert(AccessGrant).values({ user_id: id, role_id: roleId, scope_type: "PLATFORM" as any, scope_id: null, source: "MANUAL", status: "ACTIVE" });
  clearSnapshotCache();
  return { id, token: tokenFor(id) };
}

let seq = 0;
async function seedApplication(opts: { status?: string; name?: string; email?: string; phone?: string; slug?: string; schoolEmail?: string } = {}) {
  const n = `${stamp}${seq++}`;
  const email = opts.email ?? `head${n}@school${n}.rw`;
  const [acc]: any = await controlPool().query(
    "INSERT INTO ApplicantAccount (email_norm, full_name, phone, password_hash, email_verified_at) VALUES (?, ?, ?, 'x', NOW())",
    [email, `Head ${n}`, opts.phone ?? null],
  );
  const [res]: any = await controlPool().query(
    `INSERT INTO TenantApplication (ref, account_id, status, school_name, district, school_email, requested_package, billing_cycle, desired_slug, submitted_at)
     VALUES (?, ?, ?, ?, 'Kicukiro', ?, 'gold', 'TERM', ?, ?)`,
    [
      `TST-${n.slice(-12)}`,
      acc.insertId,
      opts.status ?? "SUBMITTED",
      opts.name ?? `Console School ${n}`,
      opts.schoolEmail ?? null,
      opts.slug ?? `cs-${n}`,
      new Date(Date.now() - 5 * 24 * 3600 * 1000),
    ],
  );
  return { id: Number(res.insertId), accountId: Number(acc.insertId) };
}

let owner: { id: number; token: string };
let reviewer: { id: number; token: string };
let schoolToken: string;

beforeAll(async () => {
  // The test env really reaches SMTP: never send (applicant / staff notices).
  vi.spyOn(emailService, "sendEmail").mockResolvedValue(true);
  await bootstrapPlatform();
  await ensureAccessRegistry();
  installFakeFileServer();
  invalidateTenants();
  if (!(await getTenant(2))) {
    await createTenantRow({ slug: "mt-two", name: "MT Two", tid: 2, status: "ACTIVE" });
    invalidateTenants();
  }
  owner = await platformUser(PLATFORM_CAP_LIST);
  reviewer = await platformUser(["PLATFORM_TENANTS_VIEW", "PLATFORM_APPLICATIONS_REVIEW"]);
  schoolToken = tokenFor(owner.id, 2);
}, 120_000);

afterAll(() => {
  vi.restoreAllMocks();
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe("platform console: review loop", () => {
  it("request changes -> resubmit -> approve, with timeline, messages and a drafted invoice", async () => {
    const { id } = await seedApplication();

    const list = await request(app).get("/platform/applications").query({ status: "SUBMITTED" }).set(auth(reviewer.token));
    expect(list.status).toBe(200);
    const item = list.body.data.find((a: any) => a.id === id);
    expect(item).toBeTruthy();
    expect(item.ageDays).toBeGreaterThanOrEqual(4);
    expect(item.slaBreached).toBe(true); // 5 days > review.sla_days (3)

    const d0 = await request(app).get(`/platform/applications/${id}`).set(auth(reviewer.token));
    expect(d0.status).toBe(200);
    expect(d0.body.data.allowedActions).toEqual(expect.arrayContaining(["assign", "start_review", "request_changes"]));
    expect(d0.body.data.allowedActions).not.toContain("approve"); // reviewer cannot decide
    expect(d0.body.data.checklist.map((c: any) => c.key)).toEqual(["school_exists", "contact_verified", "documents_ok", "slug_ok", "package_fits"]);

    const s = await request(app).post(`/platform/applications/${id}/start-review`).set(auth(reviewer.token));
    expect(s.status).toBe(200);
    expect(s.body.data.application.status).toBe("UNDER_REVIEW");
    expect(s.body.data.assignedTo?.id).toBe(reviewer.id);

    const noMsg = await request(app).post(`/platform/applications/${id}/request-changes`).set(auth(reviewer.token)).send({ message: " " });
    expect(noMsg.status).toBe(400);

    const rc = await request(app)
      .post(`/platform/applications/${id}/request-changes`)
      .set(auth(reviewer.token))
      .send({ message: "Please upload the registration certificate." });
    expect(rc.status).toBe(200);
    expect(rc.body.data.application.status).toBe("CHANGES_REQUESTED");
    expect(rc.body.data.messages.some((m: any) => m.body.includes("registration certificate") && !m.internal)).toBe(true);

    const note = await request(app).post(`/platform/applications/${id}/messages`).set(auth(reviewer.token)).send({ body: "Called the head.", internal: true });
    expect(note.status).toBe(201);
    expect(note.body.data.internal).toBe(true);

    // The applicant resubmits (package B's endpoint; here through the store).
    await transitionApplication(id, "UNDER_REVIEW", { kind: "APPLICANT", id: null }, { message: "Resubmitted" });

    const denied = await request(app)
      .post(`/platform/applications/${id}/approve`)
      .set(auth(reviewer.token))
      .send({ packageCode: "gold", billingCycle: "TERM", slug: `ok-${stamp}` });
    expect(denied.status).toBe(403);

    const badSlug = await request(app)
      .post(`/platform/applications/${id}/approve`)
      .set(auth(owner.token))
      .send({ packageCode: "gold", billingCycle: "TERM", slug: "admin" });
    expect(badSlug.status).toBe(400);
    expect(badSlug.body.code).toBe("SLUG_UNAVAILABLE");

    const ap = await request(app)
      .post(`/platform/applications/${id}/approve`)
      .set(auth(owner.token))
      .send({ packageCode: "premium", billingCycle: "YEAR", slug: `ok-${stamp}`, note: "Welcome" });
    expect(ap.status).toBe(200);
    const detail = ap.body.data;
    expect(detail.application.status).toBe("APPROVED_AWAITING_PAYMENT");
    expect(detail.application.approvedPackage).toBe("premium");
    expect(detail.application.billingCycle).toBe("YEAR");
    expect(detail.application.desiredSlug).toBe(`ok-${stamp}`);
    expect(detail.application.requestedApps).toEqual(expect.arrayContaining(["app.mis", "app.tmcode"]));
    expect(detail.application.expiresAt).toBeTruthy();
    expect(detail.invoice).toMatchObject({ status: "DRAFT", kind: "NEW", packageCode: "premium", billingCycle: "YEAR", applicationId: id });
    const statuses = detail.timeline.map((e: any) => e.to).filter(Boolean);
    expect(statuses).toEqual(expect.arrayContaining(["UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED_AWAITING_PAYMENT"]));
    expect(detail.timeline.find((e: any) => e.to === "CHANGES_REQUESTED").actorName).toBeTruthy();
    expect(detail.allowedActions).toEqual([]);
  });

  it("an invalid transition is a 409 with code INVALID_TRANSITION", async () => {
    const { id } = await seedApplication({ status: "REJECTED" });
    const r = await request(app).post(`/platform/applications/${id}/start-review`).set(auth(owner.token));
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ success: false, code: "INVALID_TRANSITION" });
  });

  it("reject needs a reason and is final; reopen works from EXPIRED", async () => {
    const { id } = await seedApplication();
    expect((await request(app).post(`/platform/applications/${id}/reject`).set(auth(owner.token)).send({})).status).toBe(400);
    const r = await request(app).post(`/platform/applications/${id}/reject`).set(auth(owner.token)).send({ reason: "Not a school" });
    expect(r.status).toBe(200);
    expect(r.body.data.application).toMatchObject({ status: "REJECTED", decisionReason: "Not a school" });
    expect((await request(app).post(`/platform/applications/${id}/reject`).set(auth(owner.token)).send({ reason: "again" })).status).toBe(409);

    const ex = await seedApplication({ status: "EXPIRED" });
    const ro = await request(app).post(`/platform/applications/${ex.id}/reopen`).set(auth(reviewer.token)).send({ reason: "They called" });
    expect(ro.status).toBe(200);
    expect(ro.body.data.application.status).toBe("UNDER_REVIEW");
  });

  it("assigns only platform staff", async () => {
    const { id } = await seedApplication();
    const outsider = await createUser();
    const bad = await request(app).post(`/platform/applications/${id}/assign`).set(auth(owner.token)).send({ userId: outsider });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("NOT_PLATFORM_STAFF");
    const good = await request(app).post(`/platform/applications/${id}/assign`).set(auth(owner.token)).send({ userId: reviewer.id });
    expect(good.status).toBe(200);
    expect(good.body.data.assignedTo.id).toBe(reviewer.id);
    const mine = await request(app).get("/platform/applications").query({ mine: "true" }).set(auth(reviewer.token));
    expect(mine.body.data.some((a: any) => a.id === id)).toBe(true);
  });
});

describe("platform console: checklist, documents, duplicates", () => {
  it("ticks checklist items and reviews documents", async () => {
    const { id } = await seedApplication();
    const c = await request(app).post(`/platform/applications/${id}/checklist`).set(auth(reviewer.token)).send({ key: "school_exists", checked: true, note: "Seen on MINEDUC list" });
    expect(c.status).toBe(200);
    const item = c.body.data.find((i: any) => i.key === "school_exists");
    expect(item).toMatchObject({ checked: true, note: "Seen on MINEDUC list" });
    expect(item.checkedBy).toBeTruthy();
    const un = await request(app).post(`/platform/applications/${id}/checklist`).set(auth(reviewer.token)).send({ key: "school_exists", checked: false });
    expect(un.body.data.find((i: any) => i.key === "school_exists").checked).toBe(false);
    expect((await request(app).post(`/platform/applications/${id}/checklist`).set(auth(reviewer.token)).send({ key: "nope", checked: true })).status).toBe(400);

    const storage = (await import("../utils/fileServer")).default;
    const path = `platform/applications/${id}/abc-cert.pdf`;
    await storage.uploadFile(Buffer.from("%PDF-1.4 test"), path);
    const [doc]: any = await controlPool().query(
      "INSERT INTO ApplicationDocument (application_id, kind, file_path, original_name, mime, size_bytes) VALUES (?, 'REGISTRATION_CERT', ?, 'cert.pdf', 'application/pdf', 13)",
      [id, path],
    );
    const docId = doc.insertId;
    const noNote = await request(app).post(`/platform/applications/${id}/documents/${docId}/review`).set(auth(reviewer.token)).send({ status: "REJECTED" });
    expect(noNote.status).toBe(400);
    const rv = await request(app).post(`/platform/applications/${id}/documents/${docId}/review`).set(auth(reviewer.token)).send({ status: "REJECTED", note: "Blurry" });
    expect(rv.status).toBe(200);
    expect(rv.body.data).toMatchObject({ id: docId, status: "REJECTED", note: "Blurry", url: `/platform/applications/${id}/documents/${docId}/file` });
    const file = await request(app).get(`/platform/applications/${id}/documents/${docId}/file`).set(auth(reviewer.token));
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("application/pdf");

    const d = await request(app).get(`/platform/applications/${id}`).set(auth(reviewer.token));
    expect(d.body.data.timeline.some((e: any) => e.kind === "DOCUMENT_REVIEW" && e.visibleToApplicant)).toBe(true);
  });

  it("flags similar names, shared e-mail domains, phones and slug clashes", async () => {
    expect(similarNames("GS Saint Joseph Kabgayi", "Saint Joseph Kabgayi")).toBe(true);
    expect(similarNames("Lycée de Kigali", "Lycee de Kigali")).toBe(true);
    expect(similarNames("Kigali Parents School", "Rubavu Hills Academy")).toBe(false);

    const dom = `dup${stamp}.ac.rw`;
    const a = await seedApplication({ name: `Riverside Academy ${stamp}`, email: `a${stamp}@${dom}`, phone: "+250 788 123 456", slug: `river-${stamp}` });
    const b = await seedApplication({ name: `Riverside ${stamp}`, email: `b${stamp}@${dom}`, phone: "0788123456", slug: `river-${stamp}` });
    const gm1 = await seedApplication({ email: `x${stamp}@gmail.com` });
    await seedApplication({ email: `y${stamp}@gmail.com` });

    const d = await request(app).get(`/platform/applications/${b.id}`).set(auth(reviewer.token));
    const reasons = d.body.data.duplicates.filter((h: any) => h.kind === "APPLICATION" && h.id === a.id).map((h: any) => h.reason).sort();
    expect(reasons).toEqual(["EMAIL_DOMAIN", "NAME", "PHONE", "SLUG"]);

    const g = await request(app).get(`/platform/applications/${gm1.id}`).set(auth(reviewer.token));
    expect(g.body.data.duplicates.some((h: any) => h.reason === "EMAIL_DOMAIN")).toBe(false);
  });
});

describe("platform console: overview, staff, settings, audit", () => {
  it("counts applications by status and lists the caller's caps", async () => {
    const before = await request(app).get("/platform/overview").set(auth(owner.token));
    expect(before.status).toBe(200);
    await seedApplication({ status: "PROVISIONING_FAILED" });
    await seedApplication({ status: "SUBMITTED" });
    const after = await request(app).get("/platform/overview").set(auth(owner.token));
    const o = after.body.data;
    expect(o.applications.SUBMITTED).toBe(before.body.data.applications.SUBMITTED + 1);
    expect(o.provisioningFailures).toBe(before.body.data.provisioningFailures + 1);
    expect(o.tenants.ACTIVE).toBeGreaterThanOrEqual(1);
    expect(o.trend).toHaveLength(12);
    expect(o.trend[11].submitted).toBeGreaterThanOrEqual(0);
    expect(o.caps.sort()).toEqual([...PLATFORM_CAP_LIST].sort());
    const r = await request(app).get("/platform/overview").set(auth(reviewer.token));
    expect(r.body.data.caps.sort()).toEqual(["PLATFORM_APPLICATIONS_REVIEW", "PLATFORM_TENANTS_VIEW"]);
  });

  it("lists platform staff with their caps", async () => {
    const r = await request(app).get("/platform/staff").set(auth(reviewer.token));
    expect(r.status).toBe(200);
    const me = r.body.data.find((s: any) => s.id === reviewer.id);
    expect(me.caps).toEqual(["PLATFORM_APPLICATIONS_REVIEW", "PLATFORM_TENANTS_VIEW"]);
    expect(r.body.data.some((s: any) => s.id === owner.id)).toBe(true);
  });

  it("reads and writes settings (known keys, right types, PACKAGES_MANAGE)", async () => {
    const g = await request(app).get("/platform/settings").set(auth(reviewer.token));
    expect(g.body.data["review.sla_days"]).toBeTypeOf("number");
    expect((await request(app).put("/platform/settings").set(auth(reviewer.token)).send({ "review.sla_days": 4 })).status).toBe(403);
    expect((await request(app).put("/platform/settings").set(auth(owner.token)).send({ "nope.key": 1 })).status).toBe(400);
    expect((await request(app).put("/platform/settings").set(auth(owner.token)).send({ "billing.separation_of_duties": "yes" })).status).toBe(400);
    const p = await request(app).put("/platform/settings").set(auth(owner.token)).send({ "review.sla_days": 5 });
    expect(p.status).toBe(200);
    expect(p.body.data["review.sla_days"]).toBe(5);
    await request(app).put("/platform/settings").set(auth(owner.token)).send({ "review.sla_days": 3 });
  });

  it("shows the audit log (AUDIT_VIEW), newest first, filtered and paged", async () => {
    expect((await request(app).get("/platform/audit").set(auth(reviewer.token))).status).toBe(403);
    const r = await request(app).get("/platform/audit").query({ action: "settings." }).set(auth(owner.token));
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThan(0);
    expect(r.body.data.every((e: any) => e.action.startsWith("settings."))).toBe(true);
    const page = await request(app).get("/platform/audit").query({ before: r.body.data[0].id }).set(auth(owner.token));
    expect(page.body.data.every((e: any) => e.id < r.body.data[0].id)).toBe(true);
  });
});

describe("platform console: isolation", () => {
  const ROUTES: Array<[string, string]> = [
    ["get", "/platform/overview"],
    ["get", "/platform/staff"],
    ["get", "/platform/applications"],
    ["get", "/platform/applications/1"],
    ["post", "/platform/applications/1/assign"],
    ["post", "/platform/applications/1/start-review"],
    ["post", "/platform/applications/1/request-changes"],
    ["post", "/platform/applications/1/reject"],
    ["post", "/platform/applications/1/approve"],
    ["post", "/platform/applications/1/reopen"],
    ["post", "/platform/applications/1/checklist"],
    ["post", "/platform/applications/1/documents/1/review"],
    ["get", "/platform/applications/1/documents/1/file"],
    ["get", "/platform/applications/1/messages"],
    ["post", "/platform/applications/1/messages"],
    ["get", "/platform/invoices"],
    ["post", "/platform/invoices"],
    ["get", "/platform/invoices/1"],
    ["patch", "/platform/invoices/1"],
    ["post", "/platform/invoices/1/issue"],
    ["post", "/platform/invoices/1/void"],
    ["post", "/platform/invoices/1/waive"],
    ["get", "/platform/invoices/1/pdf"],
    ["get", "/platform/payments"],
    ["post", "/platform/payments/1/confirm"],
    ["post", "/platform/payments/1/reject"],
    ["get", "/platform/payments/1/proof"],
    ["get", "/platform/payment-instructions"],
    ["put", "/platform/payment-instructions"],
    ["get", "/platform/packages"],
    ["put", "/platform/packages/gold"],
    ["put", "/platform/packages/gold/entitlements"],
    ["get", "/platform/entitlement-catalog"],
    ["get", "/platform/settings"],
    ["put", "/platform/settings"],
    ["get", "/platform/audit"],
  ];

  it("a school (non-primary tenant) session gets 404 on every console route", async () => {
    for (const [method, path] of ROUTES) {
      const r = await (request(app) as any)[method](path).set(auth(schoolToken)).send({});
      expect([path, r.status]).toEqual([path, 404]);
    }
  });

  it("a primary-tenant user without platform caps gets 403", async () => {
    const plain = await createUser();
    const t = tokenFor(plain);
    for (const [method, path] of ROUTES.slice(0, 6)) {
      const r = await (request(app) as any)[method](path).set(auth(t)).send({});
      expect([path, r.status]).toEqual([path, 403]);
    }
    expect((await request(app).get("/platform/overview")).status).toBe(401);
  });
});
