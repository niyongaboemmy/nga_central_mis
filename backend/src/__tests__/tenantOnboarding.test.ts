/**
 * Tenant management M2: self-registration and the applicant tracker
 * (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.1-6.2, §7, §10; contract
 * frontend/src/api/tenantMgmt.ts publicApi / applicantApi).
 *
 * The e-mailed code is read with applicants.peekOtpForTests (NODE_ENV=test only).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { RowDataPacket } from "mysql2/promise";
import app from "../app";
import { controlPool } from "../db/platform";
import { bootstrapPlatform } from "../tenancy";
import { installFakeFileServer } from "../test/fakeFileServer";
import { peekOtpForTests } from "../services/tenantMgmt/applicants";
import { expireStaleDrafts, purgeStaleApplications, namesSimilar } from "../services/tenantMgmt/applications";
import { transitionApplication } from "../services/tenantMgmt/applicationStore";
import { resetOnboardingRateLimits } from "../routes/onboarding";

const stamp = `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const PASSWORD = "Applic4ntPass";
const emailFor = (tag: string) => `ob.${tag}.${stamp}@example.com`;
const slugFor = (tag: string) => `ob-${tag}-${stamp}`.slice(0, 40);

let files: ReturnType<typeof installFakeFileServer>;

const pathOf = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

/** register + verify -> onboarding token */
async function registerVerified(tag: string): Promise<{ token: string; email: string; accountId: number }> {
  const email = emailFor(tag);
  const start = await request(app).post("/onboarding/accounts").send({ fullName: `Ob ${tag}`, email, phone: "0788000000", password: PASSWORD });
  expect(start.status).toBe(201);
  const code = peekOtpForTests(email)!;
  const v = await request(app).post("/onboarding/accounts/verify").send({ email, code });
  expect(v.status).toBe(200);
  return { token: v.body.data.token, email, accountId: start.body.data.accountId };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const fullDraft = (tag: string) => ({
  schoolName: `Groupe Scolaire Ob ${tag} ${stamp}`,
  schoolType: "secondary",
  country: "RW",
  province: "Kigali City",
  district: "Gasabo",
  sector: "Remera",
  schoolPhone: "0788111222",
  schoolEmail: `school.${tag}.${stamp}@example.com`,
  estStudents: 450,
  estStaff: 30,
  desiredSlug: slugFor(tag),
  requestedPackage: "gold",
  billingCycle: "TERM",
  requestedApps: ["app.mis", "app.taskmentor"],
});

beforeAll(async () => {
  await bootstrapPlatform();
  files = installFakeFileServer();
}, 120_000);

afterAll(() => {
  delete process.env.ONBOARDING_RATE_LIMIT_PER_MIN;
  resetOnboardingRateLimits();
});

// ---------------------------------------------------------------------------
describe("public endpoints", () => {
  it("lists public packages with labelled entitlements", async () => {
    const res = await request(app).get("/packages/public");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const codes = res.body.data.map((p: any) => p.code);
    expect(codes).toEqual(expect.arrayContaining(["starter", "gold", "premium", "max"]));
    const gold = res.body.data.find((p: any) => p.code === "gold");
    expect(gold).toMatchObject({ name: "Gold", isPublic: true, isActive: true, currency: "RWF" });
    expect(typeof gold.tier).toBe("number");
    expect(Array.isArray(gold.entitlements)).toBe(true);
    for (const e of gold.entitlements) expect(e).toEqual({ key: expect.any(String), kind: expect.any(String), value: e.value, label: expect.any(String) });
  });

  it("checks slugs (format, reserved, available) with suggestions", async () => {
    const free = await request(app).get(`/onboarding/slug-available?slug=${slugFor("free")}`);
    expect(free.body.data).toMatchObject({ slug: slugFor("free"), available: true, suggestion: null });
    const reserved = await request(app).get("/onboarding/slug-available?slug=admin");
    expect(reserved.body.data).toMatchObject({ available: false, reason: "RESERVED" });
    expect(reserved.body.data.suggestion).toMatch(/^admin-\d+$/);
    const bad = await request(app).get("/onboarding/slug-available?slug=x");
    expect(bad.body.data).toMatchObject({ available: false, reason: "FORMAT" });
    const norm = await request(app).get("/onboarding/slug-available?slug=" + encodeURIComponent("École Ob " + stamp));
    expect(norm.body.data.slug).toBe(`ecole-ob-${stamp}`);
  });

  it("serves captcha config (off), admin divisions, and branding by slug", async () => {
    const cap = await request(app).get("/onboarding/captcha");
    expect(cap.body.data).toEqual({ provider: null, siteKey: null });
    const div = await request(app).get("/onboarding/admin-divisions");
    expect(Object.keys(div.body.data)).toHaveLength(5);
    const districts = Object.values(div.body.data).flatMap((d: any) => Object.keys(d));
    expect(districts).toHaveLength(30);
    expect(div.body.data["Kigali City"].Gasabo).toContain("Remera");
    const t = await controlPool().query<RowDataPacket[]>("SELECT slug FROM Tenant WHERE tenant_id = 1");
    const brand = await request(app).get(`/tenant/branding?slug=${t[0][0].slug}`);
    expect(brand.status).toBe(200);
    expect(brand.body.data).toHaveProperty("name");
    expect(brand.body.data).toHaveProperty("logoUrl");
    expect(brand.body.data).toHaveProperty("primaryColor");
  });

  it("matches near-duplicate school names and returns name + kind only", () => {
    expect(namesSimilar("G.S. Kicukiro", "Groupe Scolaire Kicukiro")).toBe(true);
    expect(namesSimilar("Ecole Primaire Remera", "EP Remera")).toBe(true);
    expect(namesSimilar("Kicukiro Academy", "Musanze Secondary")).toBe(false);
  });

  it("refuses disposable e-mail and weak passwords", async () => {
    const d = await request(app).post("/onboarding/accounts").send({ fullName: "X", email: `x.${stamp}@mailinator.com`, password: PASSWORD });
    expect(d.status).toBe(400);
    expect(d.body.code).toBe("DISPOSABLE_EMAIL");
    const w = await request(app).post("/onboarding/accounts").send({ fullName: "X", email: emailFor("weak"), password: "short" });
    expect(w.status).toBe(400);
    expect(w.body).toMatchObject({ code: "WEAK_PASSWORD", field: "password", errors: [{ field: "password", message: expect.any(String) }] });
  });

  it("rate-limits by IP with 429 RATE_LIMITED", async () => {
    process.env.ONBOARDING_RATE_LIMIT_PER_MIN = "2";
    resetOnboardingRateLimits();
    const call = () => request(app).get(`/onboarding/slug-available?slug=${slugFor("rl")}`).set("X-Test-Rate-Limit", "1");
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const third = await call();
    expect(third.status).toBe(429);
    expect(third.body).toMatchObject({ success: false, code: "RATE_LIMITED", retryAfterSec: 60 });
    expect(third.headers["retry-after"]).toBe("60");
    // by e-mail: a different e-mail still gets through once the IP has room
    resetOnboardingRateLimits();
    const resend = (email: string) => request(app).post("/onboarding/accounts/resend").set("X-Test-Rate-Limit", "1").send({ email });
    expect((await resend(emailFor("rl1"))).status).toBe(200);
    expect((await resend(emailFor("rl1"))).status).toBe(200);
    expect((await resend(emailFor("rl1"))).status).toBe(429);
    delete process.env.ONBOARDING_RATE_LIMIT_PER_MIN;
    resetOnboardingRateLimits();
  });
});

// ---------------------------------------------------------------------------
describe("account verification", () => {
  it("counts wrong codes, locks after 5, expires after 10 minutes, and resends", async () => {
    const email = emailFor("otp");
    const start = await request(app).post("/onboarding/accounts").send({ fullName: "Ob Otp", email, password: PASSWORD });
    expect(start.status).toBe(201);
    expect(start.body.data).toMatchObject({ accountId: expect.any(Number), expiresInSec: 600 });
    expect(start.body.data.otpSentTo).not.toBe(email);
    const [[row]] = await controlPool().query<RowDataPacket[]>("SELECT otp_hash FROM ApplicantAccount WHERE email_norm = ?", [email]);
    const code = peekOtpForTests(email)!;
    expect(code).toMatch(/^\d{6}$/);
    expect(row.otp_hash).toBe(crypto.createHash("sha256").update(code).digest("hex"));

    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 1; i <= 4; i++) {
      const r = await request(app).post("/onboarding/accounts/verify").send({ email, code: wrong });
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ code: "INVALID_CODE", reason: "INVALID", field: "code", attemptsLeft: 5 - i });
    }
    const fifth = await request(app).post("/onboarding/accounts/verify").send({ email, code: wrong });
    expect(fifth.status).toBe(400);
    expect(fifth.body).toMatchObject({ code: "INVALID_CODE", reason: "LOCKED" });
    // the right code no longer works: a new one is needed
    expect((await request(app).post("/onboarding/accounts/verify").send({ email, code })).status).toBe(400);

    // re-starting an unverified account re-sends (no 409)
    expect((await request(app).post("/onboarding/accounts").send({ fullName: "Ob Otp", email, password: PASSWORD })).status).toBe(201);
    await controlPool().query("UPDATE ApplicantAccount SET otp_expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE email_norm = ?", [email]);
    const expired = await request(app).post("/onboarding/accounts/verify").send({ email, code: peekOtpForTests(email) });
    expect(expired.status).toBe(400);
    expect(expired.body).toMatchObject({ code: "INVALID_CODE", reason: "EXPIRED" });

    const re = await request(app).post("/onboarding/accounts/resend").send({ email });
    expect(re.status).toBe(200);
    const v = await request(app).post("/onboarding/accounts/verify").send({ email, code: peekOtpForTests(email) });
    expect(v.status).toBe(200);
    const claims = jwt.decode(v.body.data.token) as any;
    expect(claims).toMatchObject({ aud: "nga-onboarding", tstatus: "PENDING" });
    expect(claims.tid).toBeUndefined();
    expect(v.body.data.me.account).toMatchObject({ email, emailVerified: true });
    expect(v.body.data.me.nextActions).toEqual(["COMPLETE_DRAFT"]);

    // verified: start again is a 409, resend answers the same as for a stranger
    expect((await request(app).post("/onboarding/accounts").send({ fullName: "Ob Otp", email, password: PASSWORD })).body.code).toBe("ACCOUNT_EXISTS");
    const r2 = await request(app).post("/onboarding/accounts/resend").send({ email });
    const r3 = await request(app).post("/onboarding/accounts/resend").send({ email: emailFor("nobody") });
    expect(Object.keys(r2.body.data)).toEqual(Object.keys(r3.body.data));
  });

  it("signs in, changes the password and logs out (token revoked)", async () => {
    const { token, email } = await registerVerified("login");
    const bad = await request(app).post("/onboarding/login").send({ email, password: "Wrong1Password" });
    expect(bad.status).toBe(401);
    const login = await request(app).post("/onboarding/login").send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.me.account.email).toBe(email);
    const pw = await request(app).post("/onboarding/account/password").set(auth(token)).send({ currentPassword: PASSWORD, newPassword: "N3wPassword" });
    expect(pw.body).toEqual({ success: true, data: { ok: true } });
    expect((await request(app).post("/onboarding/login").send({ email, password: "N3wPassword" })).status).toBe(200);
    expect((await request(app).post("/onboarding/logout").set(auth(token))).status).toBe(200);
    const after = await request(app).get("/onboarding/me").set(auth(token));
    expect(after.status).toBe(401);
  });

  it("tells a converted applicant to use the school login", async () => {
    const { email, accountId } = await registerVerified("conv");
    await controlPool().query("UPDATE ApplicantAccount SET status = 'CONVERTED' WHERE account_id = ?", [accountId]);
    const res = await request(app).post("/onboarding/login").send({ email, password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("USE_SCHOOL_LOGIN");
  });
});

// ---------------------------------------------------------------------------
describe("the application flow", () => {
  let token: string;
  let accountId: number;
  let appId: number;

  beforeAll(async () => {
    ({ token, accountId } = await registerVerified("flow"));
  });

  it("drafts, updates, uploads, submits (APP-YYYY-NNNN) and tracks", async () => {
    const draft = await request(app).post("/onboarding/applications").set(auth(token)).send({ schoolName: `Ob Flow ${stamp}` });
    expect(draft.status).toBe(201);
    expect(draft.body.data).toMatchObject({ status: "DRAFT", step: "submitted", ref: null, billingCycle: "TERM", requestedApps: [] });
    appId = draft.body.data.id;

    // one open application per account
    const second = await request(app).post("/onboarding/applications").set(auth(token)).send({ schoolName: "Another" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("APPLICATION_OPEN");

    let me = await request(app).get("/onboarding/me").set(auth(token));
    expect(me.body.data.nextActions).toEqual(["COMPLETE_DRAFT", "UPLOAD_DOCUMENTS"]);

    // incomplete submit
    const early = await request(app).post(`/onboarding/applications/${appId}/submit`).set(auth(token)).send({ acceptTerms: true });
    expect(early.status).toBe(400);
    expect(early.body.code).toBe("INCOMPLETE");
    expect(early.body.errors.map((e: any) => e.field)).toEqual(expect.arrayContaining(["schoolType", "district", "desiredSlug"]));

    const upd = await request(app).patch(`/onboarding/applications/${appId}`).set(auth(token)).send(fullDraft("flow"));
    expect(upd.status).toBe(200);
    expect(upd.body.data).toMatchObject({ district: "Gasabo", estStudents: 450, desiredSlug: slugFor("flow"), requestedApps: ["app.mis", "app.taskmentor"] });
    const badPkg = await request(app).patch(`/onboarding/applications/${appId}`).set(auth(token)).send({ requestedPackage: "platinum" });
    expect(badPkg.status).toBe(400);
    expect(badPkg.body.field).toBe("requestedPackage");

    me = await request(app).get("/onboarding/me").set(auth(token));
    expect(me.body.data.nextActions).toEqual(["SUBMIT", "UPLOAD_DOCUMENTS"]);

    const bad = await request(app)
      .post(`/onboarding/applications/${appId}/documents`)
      .set(auth(token))
      .field("kind", "REGISTRATION_CERT")
      .attach("file", Buffer.from("not allowed"), { filename: "x.exe", contentType: "application/x-msdownload" });
    expect(bad.status).toBe(400);
    const doc = await request(app)
      .post(`/onboarding/applications/${appId}/documents`)
      .set(auth(token))
      .field("kind", "REGISTRATION_CERT")
      .attach("file", Buffer.from("%PDF-1.4 cert"), { filename: "cert.pdf", contentType: "application/pdf" });
    expect(doc.status).toBe(201);
    expect(doc.body.data).toMatchObject({ kind: "REGISTRATION_CERT", name: "cert.pdf", status: "PENDING", note: null });
    expect([...files.store.keys()].some((k) => k.startsWith(`platform/applications/${appId}/`))).toBe(true);
    const file = await request(app).get(pathOf(doc.body.data.url));
    expect(file.status).toBe(200);
    expect(Buffer.from(file.body).toString()).toBe("%PDF-1.4 cert");

    // terms are required
    const noTerms = await request(app).post(`/onboarding/applications/${appId}/submit`).set(auth(token)).send({});
    expect(noTerms.status).toBe(400);
    expect(noTerms.body.code).toBe("TERMS_REQUIRED");

    const sub = await request(app).post(`/onboarding/applications/${appId}/submit`).set(auth(token)).send({ acceptTerms: true });
    expect(sub.status).toBe(200);
    expect(sub.body.data.status).toBe("SUBMITTED");
    expect(sub.body.data.ref).toMatch(new RegExp(`^APP-${new Date().getUTCFullYear()}-\\d{4}$`));
    expect(sub.body.data.submittedAt).not.toBeNull();
    const [[r]] = await controlPool().query<RowDataPacket[]>("SELECT terms_accepted_at FROM TenantApplication WHERE application_id = ?", [appId]);
    expect(r.terms_accepted_at).not.toBeNull();

    // read-only now
    const locked = await request(app).patch(`/onboarding/applications/${appId}`).set(auth(token)).send({ notes: "late" });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe("INVALID_TRANSITION");
    // submitting twice is an invalid transition
    const again = await request(app).post(`/onboarding/applications/${appId}/submit`).set(auth(token)).send({ acceptTerms: true });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("INVALID_TRANSITION");

    me = await request(app).get("/onboarding/me").set(auth(token));
    const d = me.body.data;
    expect(Object.keys(d).sort()).toEqual(
      ["account", "application", "timeline", "documents", "requiredDocuments", "invoice", "paymentInstructions", "provisioning", "unreadMessages", "nextActions", "school"].sort(),
    );
    expect(d.application).toMatchObject({ id: appId, status: "SUBMITTED", step: "submitted" });
    expect(d.requiredDocuments).toEqual(["REGISTRATION_CERT"]);
    expect(d.documents).toHaveLength(1);
    expect(d.nextActions).toEqual(["WAIT"]);
    expect(d.school).toBeNull();
    expect(d.invoice).toBeNull();
    expect(d.timeline.map((e: any) => e.to)).toContain("SUBMITTED");
    for (const e of d.timeline) expect(e).not.toHaveProperty("visibleToApplicant");
  });

  it("keeps the message thread (no internal notes) and counts unread", async () => {
    await controlPool().query(
      "INSERT INTO ApplicationMessage (application_id, author_kind, author_id, author_name, body, is_internal) VALUES (?, 'PLATFORM', 1, 'Reviewer', 'Please send the licence', 0), (?, 'PLATFORM', 1, 'Reviewer', 'internal: looks fine', 1)",
      [appId, appId],
    );
    let me = await request(app).get("/onboarding/me").set(auth(token));
    expect(me.body.data.unreadMessages).toBe(1);
    const list = await request(app).get(`/onboarding/applications/${appId}/messages`).set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.data.map((m: any) => m.body)).toEqual(["Please send the licence"]);
    expect(list.body.data[0]).toMatchObject({ author: "PLATFORM", authorName: "Reviewer", internal: false, attachmentUrl: null });
    me = await request(app).get("/onboarding/me").set(auth(token));
    expect(me.body.data.unreadMessages).toBe(0);

    const sent = await request(app)
      .post(`/onboarding/applications/${appId}/messages`)
      .set(auth(token))
      .field("body", "Here it is")
      .attach("file", Buffer.from("PNGDATA"), { filename: "licence.png", contentType: "image/png" });
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({ author: "APPLICANT", body: "Here it is", internal: false });
    const att = await request(app).get(pathOf(sent.body.data.attachmentUrl));
    expect(att.status).toBe(200);
  });

  it("resubmits after changes requested (UNDER_REVIEW, same ref) and withdraws", async () => {
    await transitionApplication(appId, "UNDER_REVIEW", { kind: "PLATFORM", id: 1 });
    await transitionApplication(appId, "CHANGES_REQUESTED", { kind: "PLATFORM", id: 1 }, { message: "Fix the phone" });
    const before = await request(app).get("/onboarding/me").set(auth(token));
    expect(before.body.data.nextActions).toEqual(["FIX_CHANGES"]);
    const ref = before.body.data.application.ref;
    expect((await request(app).patch(`/onboarding/applications/${appId}`).set(auth(token)).send({ schoolPhone: "0788999999" })).status).toBe(200);
    const re = await request(app).post(`/onboarding/applications/${appId}/submit`).set(auth(token)).send({ acceptTerms: true });
    expect(re.status).toBe(200);
    expect(re.body.data).toMatchObject({ status: "UNDER_REVIEW", ref });

    const w = await request(app).post(`/onboarding/applications/${appId}/withdraw`).set(auth(token)).send({ reason: "Changed our mind" });
    expect(w.status).toBe(200);
    expect(w.body.data.status).toBe("WITHDRAWN");
    const w2 = await request(app).post(`/onboarding/applications/${appId}/withdraw`).set(auth(token)).send({});
    expect(w2.status).toBe(409);
    expect(w2.body.code).toBe("INVALID_TRANSITION");
    // documents are frozen after the decision
    const doc = await request(app)
      .post(`/onboarding/applications/${appId}/documents`)
      .set(auth(token))
      .field("kind", "OTHER")
      .attach("file", Buffer.from("%PDF"), { filename: "o.pdf", contentType: "application/pdf" });
    expect(doc.status).toBe(409);
    // a new application may start now
    expect((await request(app).post("/onboarding/applications").set(auth(token)).send({ schoolName: `Ob Flow 2 ${stamp}` })).status).toBe(201);
  });

  it("hides other applicants' applications, documents and invoices (404)", async () => {
    const other = await registerVerified("other");
    const docs = await request(app).get("/onboarding/me").set(auth(token));
    const mine = docs.body.data;
    expect((await request(app).patch(`/onboarding/applications/${appId}`).set(auth(other.token)).send({ notes: "x" })).status).toBe(404);
    expect((await request(app).get(`/onboarding/applications/${appId}/messages`).set(auth(other.token))).status).toBe(404);
    const [[d]] = await controlPool().query<RowDataPacket[]>("SELECT doc_id FROM ApplicationDocument WHERE application_id = ?", [appId]);
    expect((await request(app).get(`/onboarding/applications/${appId}/documents/${d.doc_id}/file?token=${other.token}`)).status).toBe(404);
    expect((await request(app).get(`/onboarding/applications/${appId}/documents/${d.doc_id}/file`)).status).toBe(401);
    const [ins]: any = await controlPool().query("INSERT INTO Invoice (application_id, package_code, amount, status) VALUES (?, 'gold', 1000, 'ISSUED')", [appId]);
    expect((await request(app).get(`/onboarding/invoices/${ins.insertId}`).set(auth(other.token))).status).toBe(404);
    expect((await request(app).get(`/onboarding/invoices/${ins.insertId}/pdf?token=${other.token}`)).status).toBe(404);
    const own = await request(app).get(`/onboarding/invoices/${ins.insertId}`).set(auth(token));
    expect([200, 503]).toContain(own.status); // 503 until package C's billing lands
    expect(mine.account.id).toBe(accountId);
  });

  it("MIS /auth/login hands an applicant the onboarding token, which no session route accepts", async () => {
    const { email } = await registerVerified("mislogin");
    const res = await request(app).post("/auth/login").send({ username: email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.onboarding).toEqual({ token: expect.any(String), status: "NONE" });
    expect(res.body.data.onboarding).toEqual(res.body.onboarding);
    expect(res.body.data.tempToken).toBeUndefined();
    expect((jwt.decode(res.body.onboarding.token) as any).aud).toBe("nga-onboarding");
    const users = await request(app).get("/users/me").set(auth(res.body.onboarding.token));
    expect(users.status).toBe(403);
    expect(users.body.code).toBe("TENANT_PENDING");
    // wrong password: the usual 401
    expect((await request(app).post("/auth/login").send({ username: email, password: "Wrong1Password" })).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe("housekeeping jobs", () => {
  it("expires idle drafts and purges old closed applications", async () => {
    const { token, accountId } = await registerVerified("jobs");
    const draft = await request(app).post("/onboarding/applications").set(auth(token)).send(fullDraft("jobs"));
    const id = draft.body.data.id;
    await request(app)
      .post(`/onboarding/applications/${id}/documents`)
      .set(auth(token))
      .field("kind", "LOGO")
      .attach("file", Buffer.from("PNG"), { filename: "logo.png", contentType: "image/png" });
    await controlPool().query("UPDATE TenantApplication SET last_activity_at = DATE_SUB(NOW(), INTERVAL 30 DAY) WHERE application_id = ?", [id]);
    const ex = await expireStaleDrafts();
    expect(ex.expired).toBeGreaterThanOrEqual(1);
    const [[a]] = await controlPool().query<RowDataPacket[]>("SELECT status FROM TenantApplication WHERE application_id = ?", [id]);
    expect(a.status).toBe("EXPIRED");

    await controlPool().query("UPDATE TenantApplication SET last_activity_at = DATE_SUB(NOW(), INTERVAL 13 MONTH) WHERE application_id = ?", [id]);
    const p = await purgeStaleApplications();
    expect(p.applications).toBeGreaterThanOrEqual(1);
    const [docs] = await controlPool().query<RowDataPacket[]>("SELECT 1 FROM ApplicationDocument WHERE application_id = ?", [id]);
    expect(docs).toHaveLength(0);
    expect([...files.store.keys()].some((k) => k.startsWith(`platform/applications/${id}/`))).toBe(false);
    const [[acc]] = await controlPool().query<RowDataPacket[]>("SELECT email_norm, phone, status FROM ApplicantAccount WHERE account_id = ?", [accountId]);
    expect(acc).toMatchObject({ email_norm: `purged-${accountId}@invalid`, phone: null, status: "LOCKED" });
    expect((await request(app).get("/onboarding/me").set(auth(token))).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// THE CRAWL: an onboarding token opens nothing a stranger can't.
// ---------------------------------------------------------------------------

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
      if (layer.route.methods._all) out.push({ method: "get", path: prefix + layer.route.path });
    } else if (layer.name === "router" && layer.handle?.stack) {
      collect(layer.handle.stack, prefix + mountOf(layer), out);
    }
  }
}

const fill = (p: string) => p.replace(/:[A-Za-z_]+\??(\([^)]*\))?/g, "1").replace(/\*/g, "x") || "/";
const OWN = [/^\/onboarding(\/|$)/, /^\/packages(\/|$)/, /^\/tenant\/branding$/];

describe("applicant-token crawl", () => {
  it(
    "every route outside onboarding answers the token like a stranger (no 2xx it would not give anyone)",
    async () => {
      const { token } = await registerVerified("crawl");
      const routes: Route[] = [];
      collect((app as any)._router.stack, "", routes);
      const seen = new Set<string>();
      const list = routes.filter((r) => {
        const k = `${r.method} ${fill(r.path)}`;
        if (seen.has(k) || OWN.some((re) => re.test(fill(r.path)))) return false;
        seen.add(k);
        return true;
      });
      expect(list.length).toBeGreaterThan(200);

      const call = async (r: Route, withToken: boolean): Promise<number> => {
        let q = (request(app) as any)[r.method](fill(r.path)).timeout({ response: 5000, deadline: 8000 });
        if (withToken) q = q.set("Authorization", `Bearer ${token}`);
        if (["post", "put", "patch", "delete"].includes(r.method)) q = q.send({});
        try {
          return (await q).status;
        } catch {
          return 0; // timeout / stream: not a 2xx JSON answer
        }
      };

      const leaks: string[] = [];
      const publicOk: string[] = [];
      const BATCH = 8;
      for (let i = 0; i < list.length; i += BATCH) {
        await Promise.all(
          list.slice(i, i + BATCH).map(async (r) => {
            const s = await call(r, true);
            if (s < 200 || s >= 300) return;
            const anon = await call(r, false);
            if (anon >= 200 && anon < 300) publicOk.push(`${r.method.toUpperCase()} ${r.path}`);
            else leaks.push(`${r.method.toUpperCase()} ${r.path} -> ${s} (anonymous ${anon})`);
          }),
        );
      }
      expect(leaks).toEqual([]);
      // the 2xx ones are the app's public endpoints (health, SSO discovery, desktop downloads, ...)
      for (const p of publicOk) expect(p).not.toMatch(/^(GET|POST|PUT|PATCH|DELETE) \/(users|academics|documents|platform\/(applications|invoices|tenants|overview))/);
    },
    600_000,
  );
});
