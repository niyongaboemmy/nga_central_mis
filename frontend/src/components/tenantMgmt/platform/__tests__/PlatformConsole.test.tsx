import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/** Platform console (package F): caps gating, decisions, billing, lifecycle, package matrix. */

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  applications: vi.fn(),
  application: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  packages: vi.fn(),
  entitlementCatalog: vi.fn(),
  paymentsToReview: vi.fn(),
  confirmPayment: vi.fn(),
  rejectPayment: vi.fn(),
  invoices: vi.fn(),
  tenant: vi.fn(),
  deleteTenant: vi.fn(),
  savePackage: vi.fn(),
  savePackageEntitlements: vi.fn(),
  slugAvailable: vi.fn(),
  admins: vi.fn(),
  createAdmin: vi.fn(),
  resetAdminPassword: vi.fn(),
  removeAdmin: vi.fn(),
  people: vi.fn(),
  tenantRoles: vi.fn(),
  assignPerson: vi.fn(),
  updateDetails: vi.fn(),
  settings: vi.fn(),
  saveSettings: vi.fn(),
  paymentInstructions: vi.fn(),
  savePaymentInstructions: vi.fn(),
  tenants: vi.fn(),
}));

vi.mock("../../../../api/tenantMgmt", async (orig) => {
  const m: any = await orig();
  return {
    ...m,
    platformApi: new Proxy(
      {},
      {
        get: (_t, k: string) => (api as any)[k] ?? (() => Promise.resolve([])),
      },
    ),
    publicApi: { ...m.publicApi, slugAvailable: (s: string) => api.slugAvailable(s) },
  };
});
vi.mock("../../../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light" }) }));
// numbers and motion settle at once
vi.mock("framer-motion", async (orig) => {
  const m: any = await orig();
  return { ...m, useReducedMotion: () => true };
});
vi.mock("recharts", async (orig) => {
  const m: any = await orig();
  return { ...m, ResponsiveContainer: ({ children }: any) => <div style={{ width: 600, height: 200 }}>{children}</div> };
});

import PlatformConsole from "../PlatformConsole";
import ApplicationDetailPage from "../ApplicationDetailPage";
import BillingPage from "../BillingPage";
import SchoolDetailPage from "../SchoolDetailPage";
import PackagesPage from "../PackagesPage";
import SettingsPage from "../SettingsPage";
import { PlatformProvider } from "../platformShared";

const ALL_CAPS = [
  "PLATFORM_TENANTS_VIEW",
  "PLATFORM_APPLICATIONS_REVIEW",
  "PLATFORM_APPLICATIONS_DECIDE",
  "PLATFORM_BILLING_INVOICE",
  "PLATFORM_BILLING_CONFIRM",
  "PLATFORM_BILLING_WAIVE",
  "PLATFORM_TENANTS_LIFECYCLE",
  "PLATFORM_TENANTS_ENTITLEMENTS",
  "PLATFORM_PACKAGES_MANAGE",
  "PLATFORM_SUPPORT_ACCESS",
  "PLATFORM_AUDIT_VIEW",
];

const overview = (caps: string[]) => ({
  applications: { SUBMITTED: 4, UNDER_REVIEW: 3, ACTIVE: 9 },
  awaitingPayment: 2,
  paymentsToConfirm: 5,
  provisioningFailures: 1,
  tenants: { ACTIVE: 12, GRACE: 2, SUSPENDED: 1, ARCHIVED: 0, PENDING: 0 },
  expiringIn30Days: 3,
  revenueThisTerm: 1500000,
  currency: "RWF",
  trend: [{ week: "W1", submitted: 2, activated: 1 }],
  caps,
});

const ENT = (key: string, kind: "APP" | "FEATURE" | "LIMIT", label: string, value: number | null = null) => ({ key, kind, label, value });
const CATALOG = [ENT("app.mis", "APP", "MIS"), ENT("app.tupo", "APP", "Tupo"), ENT("feature.ai_lesson_studio", "FEATURE", "AI Lesson Studio"), ENT("limit.students", "LIMIT", "Students", 0)];
const PKG = (code: string, name: string, tier: number, ents: any[]) => ({
  code,
  name,
  tier,
  tagline: null,
  description: null,
  accent: "sky",
  isPublic: true,
  isActive: true,
  priceTerm: 100000,
  priceYear: 280000,
  currency: "RWF",
  entitlements: ents,
});
const PACKAGES = [
  PKG("starter", "Starter", 1, [ENT("app.mis", "APP", "MIS"), ENT("limit.students", "LIMIT", "Students", 300)]),
  PKG("gold", "Gold", 2, [ENT("app.mis", "APP", "MIS"), ENT("app.tupo", "APP", "Tupo"), ENT("limit.students", "LIMIT", "Students", 800)]),
];

const inProvider = (ui: React.ReactNode, path: string, url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <PlatformProvider>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </PlatformProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.overview.mockResolvedValue(overview(ALL_CAPS));
  api.packages.mockResolvedValue(PACKAGES);
  api.entitlementCatalog.mockResolvedValue(CATALOG);
  api.applications.mockResolvedValue([]);
  api.invoices.mockResolvedValue([]);
  api.tenants.mockResolvedValue([]);
  api.slugAvailable.mockImplementation(async (slug: string) => ({ slug, available: true, suggestion: null }));
});

// ---------------------------------------------------------------------------

describe("dashboard", () => {
  const school = (tid: number, name: string, pkg: string, students: number, status = "ACTIVE", activeUsers7d = 10) => ({
    tid, slug: `s${tid}`, name, status, isPrimary: false, pkg, students, staff: 5, storageMb: 100, activeUsers7d,
    periodEnd: null, graceUntil: null, lastActivityAt: null, createdAt: "2026-01-01T00:00:00Z",
  });

  it("totals live schools, flags the ones near a limit and counts schools per plan", async () => {
    api.tenants.mockResolvedValue([
      school(2, "Full House Academy", "starter", 290, "ACTIVE", 50),
      school(3, "Roomy School", "gold", 100, "ACTIVE", 80),
      school(4, "Gone School", "starter", 10, "SUSPENDED"),
    ]);
    render(
      <MemoryRouter initialEntries={["/platform/dashboard"]}>
        <Routes>
          <Route path="/platform/*" element={<PlatformConsole />} />
        </Routes>
      </MemoryRouter>,
    );
    const near = await screen.findByRole("list", { name: "Schools near their limits" });
    expect(within(near).getByText("Full House Academy")).toBeInTheDocument();
    expect(within(near).queryByText("Roomy School")).toBeNull();
    const plans = screen.getByRole("list", { name: "Live schools per plan" });
    expect(within(plans).getByRole("button", { name: /Starter/ })).toHaveTextContent("1");
    expect(within(plans).getByRole("button", { name: /Gold/ })).toHaveTextContent("1");
    // students across live schools only (the suspended one is left out)
    expect(within(screen.getByRole("button", { name: /across live schools/ })).getByText("390")).toBeInTheDocument();
    const busiest = screen.getByRole("list", { name: "Most active schools this week" });
    expect(within(busiest).getAllByRole("button")[0]).toHaveTextContent("Roomy School");
  });

  it("the old /platform/overview address opens the dashboard", async () => {
    api.tenants.mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={["/platform/overview"]}>
        <Routes>
          <Route path="/platform/*" element={<PlatformConsole />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("tab", { name: /Dashboard/, selected: true })).toBeInTheDocument();
  });
});

describe("overview", () => {
  it("renders counts and every tab with all caps", async () => {
    render(
      <MemoryRouter initialEntries={["/platform/overview"]}>
        <Routes>
          <Route path="/platform/*" element={<PlatformConsole />} />
        </Routes>
      </MemoryRouter>,
    );
    const toReview = await screen.findByRole("button", { name: /To review/ });
    expect(within(toReview).getByText("7")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /to confirm/i })).getByText("5")).toBeInTheDocument();
    expect(screen.getByText("1,500,000 RWF")).toBeInTheDocument();
    for (const t of ["Dashboard", "Schools", "Applications", "Billing", "Packages", "Support", "Audit", "Settings"]) expect(screen.getByRole("tab", { name: new RegExp(t) })).toBeInTheDocument();
  });

  it("lists what needs the team now with the next action, and counts approved applications as awaiting pay", async () => {
    api.overview.mockResolvedValue({
      ...overview(ALL_CAPS),
      awaitingPayment: 1,
      draftInvoices: 1,
      attention: [
        { applicationId: 1, ref: "APP-2026-0001", schoolName: "Hill Academy", status: "APPROVED_AWAITING_PAYMENT", pkg: "max", invoiceStatus: "DRAFT", invoiceAmount: 0, since: new Date().toISOString(), ageDays: 1 },
        { applicationId: 2, ref: "APP-2026-0002", schoolName: "Lake School", status: "PROVISIONING_FAILED", pkg: "gold", invoiceStatus: "PAID", invoiceAmount: 0, since: new Date().toISOString(), ageDays: 0 },
      ],
    });
    render(
      <MemoryRouter initialEntries={["/platform/overview"]}>
        <Routes>
          <Route path="/platform/*" element={<PlatformConsole />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "Hill Academy: Issue the invoice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lake School: Retry setup" })).toBeInTheDocument();
    expect(screen.getByText(/invoice not issued/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 draft invoice to issue/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Awaiting pay/ })).toHaveTextContent("1");
  });

  it("hides tabs and tile actions the caller lacks", async () => {
    api.overview.mockResolvedValue(overview(["PLATFORM_TENANTS_VIEW"]));
    render(
      <MemoryRouter initialEntries={["/platform"]}>
        <Routes>
          <Route path="/platform/*" element={<PlatformConsole />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("To review")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    // counts shown, but not clickable without review / billing caps
    expect(screen.queryByRole("button", { name: /To review/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /to confirm/i })).toBeNull();
    // schools tiles stay actionable with PLATFORM_TENANTS_VIEW
    expect(screen.getByRole("button", { name: /grace/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Applications/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Billing/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Packages/ })).toBeNull();
    expect(screen.getByRole("tab", { name: /Schools/ })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

const detail = (allowedActions: string[]) => ({
  application: {
    id: 42,
    ref: "APP-2026-0042",
    status: "UNDER_REVIEW",
    step: "review",
    schoolName: "Green Hills Academy",
    schoolType: "secondary",
    country: "RW",
    province: null,
    district: "Gasabo",
    sector: null,
    address: null,
    schoolPhone: null,
    schoolEmail: null,
    website: null,
    estStudents: 500,
    estStaff: 40,
    desiredSlug: "green-hills",
    requestedPackage: "gold",
    billingCycle: "TERM",
    requestedApps: ["app.mis", "app.tupo"],
    notes: null,
    approvedPackage: null,
    submittedAt: "2026-11-01T08:00:00Z",
    decidedAt: null,
    decisionReason: null,
    expiresAt: null,
    tenantId: null,
    createdAt: "2026-11-01T08:00:00Z",
    updatedAt: null,
  },
  applicant: { id: 1, fullName: "Jane Doe", email: "jane@ghA.rw", phone: null, emailVerified: true },
  timeline: [],
  messages: [],
  documents: [],
  requiredDocuments: [],
  checklist: [],
  duplicates: [],
  invoice: null,
  provisioning: null,
  assignedTo: null,
  allowedActions,
});

describe("application detail", () => {
  it("shows only the allowed actions", async () => {
    api.application.mockResolvedValue(detail(["approve", "reject"]));
    inProvider(<ApplicationDetailPage />, "/platform/applications/:id", "/platform/applications/42");
    const bar = await screen.findByRole("toolbar", { name: "Decision" });
    expect(within(bar).getByRole("button", { name: /Approve/ })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: /Reject/ })).toBeInTheDocument();
    for (const n of [/Assign/, /Review/, /Changes/, /Reopen/]) expect(within(bar).queryByRole("button", { name: n })).toBeNull();
  });

  it("approve sends the chosen package, cycle and slug", async () => {
    api.application.mockResolvedValue(detail(["approve"]));
    api.approve.mockImplementation(async () => ({ ...detail([]), application: { ...detail([]).application, status: "APPROVED_AWAITING_PAYMENT", step: "approved" } }));
    const user = userEvent.setup();
    inProvider(<ApplicationDetailPage />, "/platform/applications/:id", "/platform/applications/42");
    await user.click(within(await screen.findByRole("toolbar", { name: "Decision" })).getByRole("button", { name: /Approve/ }));
    const dialog = await screen.findByRole("dialog");
    // requested package pre-selected
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /Gold/, pressed: true })).toBeInTheDocument());
    await user.click(within(dialog).getByRole("radio", { name: "Year" }));
    const slug = within(dialog).getByLabelText("Address");
    await user.clear(slug);
    await user.type(slug, "ghacademy");
    await waitFor(() => expect(api.slugAvailable).toHaveBeenLastCalledWith("ghacademy"));
    const submit = within(dialog).getAllByRole("button", { name: /Approve/ }).slice(-1)[0];
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await waitFor(() =>
      expect(api.approve).toHaveBeenCalledWith(42, { packageCode: "gold", billingCycle: "YEAR", slug: "ghacademy", apps: ["app.mis", "app.tupo"], note: undefined }),
    );
  });

  it("blocks approval when the slug is taken", async () => {
    api.application.mockResolvedValue(detail(["approve"]));
    api.slugAvailable.mockResolvedValue({ slug: "green-hills", available: false, suggestion: "green-hills-2" });
    const user = userEvent.setup();
    inProvider(<ApplicationDetailPage />, "/platform/applications/:id", "/platform/applications/42");
    await user.click(within(await screen.findByRole("toolbar", { name: "Decision" })).getByRole("button", { name: /Approve/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("button", { name: "green-hills-2" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("button", { name: /Approve/ }).slice(-1)[0]).toBeDisabled();
  });

  it("reject requires a reason", async () => {
    api.application.mockResolvedValue(detail(["reject"]));
    api.reject.mockResolvedValue(detail([]));
    const user = userEvent.setup();
    inProvider(<ApplicationDetailPage />, "/platform/applications/:id", "/platform/applications/42");
    await user.click(within(await screen.findByRole("toolbar", { name: "Decision" })).getByRole("button", { name: /Reject/ }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Reject" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Not a registered school");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(api.reject).toHaveBeenCalledWith(42, "Not a registered school"));
  });
});

// ---------------------------------------------------------------------------

const INVOICE = {
  id: 7,
  number: "INV-2026-0007",
  kind: "NEW",
  applicationId: 42,
  tenantId: null,
  packageCode: "gold",
  billingCycle: "TERM",
  periodStart: null,
  periodEnd: null,
  amount: 250000,
  currency: "RWF",
  status: "ISSUED",
  issuedAt: "2026-11-02T00:00:00Z",
  dueAt: "2026-11-16T00:00:00Z",
  paidAt: null,
  lines: [],
  notes: null,
  pdfUrl: null,
  payments: [],
};
const PAYMENT = (id: number, amount: number) => ({
  id,
  invoiceId: 7,
  method: "MOMO",
  reference: `MP${id}`,
  amount,
  paidAt: "2026-11-03T00:00:00Z",
  proofUrl: null,
  status: "SUBMITTED",
  isWaiver: false,
  reviewNote: null,
  submittedAt: "2026-11-03T00:00:00Z",
  reviewedAt: null,
  invoice: INVOICE,
  schoolName: `School ${id}`,
});

describe("billing", () => {
  it("confirms a payment and drops it from the queue", async () => {
    api.paymentsToReview.mockResolvedValue([PAYMENT(1, 250000)]);
    api.confirmPayment.mockResolvedValue({ ...PAYMENT(1, 250000), status: "CONFIRMED" });
    const user = userEvent.setup();
    inProvider(<BillingPage />, "/platform/billing", "/platform/billing");
    expect(await screen.findByLabelText("Matches invoice")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.confirmPayment).toHaveBeenCalledWith(1, undefined));
    await waitFor(() => expect(screen.queryByText("School 1")).toBeNull());
  });

  it("rejecting a payment needs a note; a mismatch is flagged", async () => {
    api.paymentsToReview.mockResolvedValue([PAYMENT(2, 200000)]);
    api.rejectPayment.mockResolvedValue({ ...PAYMENT(2, 200000), status: "REJECTED" });
    const user = userEvent.setup();
    inProvider(<BillingPage />, "/platform/billing", "/platform/billing");
    expect(await screen.findByText("Invoice amount")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Reject" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), "Amount short");
    await user.click(confirm);
    await waitFor(() => expect(api.rejectPayment).toHaveBeenCalledWith(2, "Amount short"));
  });

  it("hides confirm / reject without PLATFORM_BILLING_CONFIRM", async () => {
    api.overview.mockResolvedValue(overview(["PLATFORM_BILLING_INVOICE"]));
    api.invoices.mockResolvedValue([INVOICE]);
    inProvider(<BillingPage />, "/platform/billing", "/platform/billing");
    expect(await screen.findByText("INV-2026-0007")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /to confirm/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Waive" })).toBeNull();
    expect(screen.getByRole("button", { name: "Void" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

const tenantDetail = (over: Partial<{ isPrimary: boolean; allowed: string[]; status: string }> = {}) => ({
  tenant: {
    tid: 5,
    slug: "ghacademy",
    name: "Green Hills Academy",
    status: over.status ?? "ARCHIVED",
    isPrimary: over.isPrimary ?? false,
    pkg: "gold",
    students: 400,
    staff: 30,
    storageMb: 1200,
    activeUsers7d: 120,
    periodEnd: null,
    graceUntil: null,
    lastActivityAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    timezone: "Africa/Kigali",
    country: "RW",
    activatedAt: null,
    suspendedAt: null,
    statusReason: null,
  },
  entitlements: { pkg: "gold", unrestricted: false, apps: [], features: [], limits: {} },
  overrides: [],
  apps: [],
  usage: { meters: [], daily: [] },
  subscription: null,
  invoices: [],
  provisioning: null,
  audit: [],
  allowedActions: over.allowed ?? ["delete", "reactivate"],
});

describe("school details", () => {
  it("edits the name and timezone with a reason, sending only what changed", async () => {
    api.tenant.mockResolvedValue(tenantDetail({ status: "ACTIVE", allowed: ["suspend", "edit_details"] }));
    api.updateDetails.mockImplementation(async (_tid: number, body: any) => {
      const d = tenantDetail({ status: "ACTIVE", allowed: ["suspend", "edit_details"] });
      return { ...d, tenant: { ...d.tenant, name: body.name ?? d.tenant.name } };
    });
    const user = userEvent.setup();
    inProvider(<SchoolDetailPage />, "/platform/schools/:tid", "/platform/schools/5");
    await user.click(await screen.findByRole("button", { name: /Edit details/ }));
    const dialog = await screen.findByRole("dialog");
    const save = within(dialog).getByRole("button", { name: /Save details/ });
    expect(save).toBeDisabled();
    const name = within(dialog).getByLabelText("School name");
    await user.clear(name);
    await user.type(name, "Green Hills International");
    expect(save).toBeDisabled(); // no reason yet
    await user.type(within(dialog).getByLabelText("Reason"), "New registered name");
    await user.click(save);
    await waitFor(() => expect(api.updateDetails).toHaveBeenCalledWith(5, { name: "Green Hills International", reason: "New registered name" }));
    expect(await screen.findByRole("heading", { name: /Green Hills International/ })).toBeInTheDocument();
  });

  it("hides the edit button without the lifecycle capability", async () => {
    api.tenant.mockResolvedValue(tenantDetail({ status: "ACTIVE", allowed: [] }));
    inProvider(<SchoolDetailPage />, "/platform/schools/:tid", "/platform/schools/5");
    await screen.findByRole("heading", { name: /Green Hills Academy/ });
    expect(screen.queryByRole("button", { name: /Edit details/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Change the logo|Add a logo/ })).toBeNull();
  });
});

describe("school lifecycle", () => {
  it("delete requires the typed school name", async () => {
    api.tenant.mockResolvedValue(tenantDetail());
    api.deleteTenant.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    inProvider(<SchoolDetailPage />, "/platform/schools/:tid", "/platform/schools/5");
    await user.click(await screen.findByRole("tab", { name: /Lifecycle/ }));
    await user.click(within(screen.getByRole("toolbar", { name: "Lifecycle actions" })).getByRole("button", { name: /Delete/ }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "Delete" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), "Green Hills");
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), " Academy");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(api.deleteTenant).toHaveBeenCalledWith(5, "Green Hills Academy"));
  });

  it("the primary school shows no destructive actions", async () => {
    api.tenant.mockResolvedValue(tenantDetail({ isPrimary: true, allowed: ["delete", "suspend", "archive", "extend_grace"] }));
    const user = userEvent.setup();
    inProvider(<SchoolDetailPage />, "/platform/schools/:tid", "/platform/schools/5");
    await user.click(await screen.findByRole("tab", { name: /Lifecycle/ }));
    const bar = screen.getByRole("toolbar", { name: "Lifecycle actions" });
    expect(within(bar).queryByRole("button", { name: /Delete/ })).toBeNull();
    expect(within(bar).queryByRole("button", { name: /Suspend/ })).toBeNull();
    expect(within(bar).queryByRole("button", { name: /Archive/ })).toBeNull();
    expect(within(bar).getByRole("button", { name: /grace/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

const ADMIN = (over: Record<string, unknown> = {}) => ({
  userId: 7,
  name: "Jane Owner",
  username: "jane",
  email: "jane@school.test",
  phone: null,
  status: "ACTIVE",
  kind: "OWNER",
  roles: ["SUPER_ADMIN", "School Owner"],
  mustChangePassword: false,
  lockedUntil: null,
  lastLoginAt: null,
  createdAt: "2026-11-20T00:00:00Z",
  ...over,
});

describe("school administrators", () => {
  it("lists the admins; the last owner can't be removed", async () => {
    api.tenant.mockResolvedValue(tenantDetail({ status: "ACTIVE" }));
    api.admins.mockResolvedValue([ADMIN()]);
    const user = userEvent.setup();
    inProvider(<SchoolDetailPage />, "/platform/schools/:tid", "/platform/schools/5");
    await user.click(await screen.findByRole("tab", { name: /Admins/ }));
    const list = await screen.findByRole("list", { name: "Administrators" });
    expect(within(list).getByText("Jane Owner")).toBeInTheDocument();
    expect(within(list).getByText("Owner")).toBeInTheDocument();
    expect(within(list).getByText("Never signed in")).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "The last owner can't be removed" })).toBeDisabled();
    expect(api.admins).toHaveBeenCalledWith(5);
  });

  it("adds an administrator and shows the one-time password once", async () => {
    api.tenant.mockResolvedValue(tenantDetail({ status: "ACTIVE" }));
    api.admins.mockResolvedValue([ADMIN()]);
    api.createAdmin.mockResolvedValue({
      admin: ADMIN({ userId: 9, name: "Ada Admin", username: "ada", email: "ada@school.test", kind: "ADMIN", mustChangePassword: true }),
      created: true,
      tempPassword: "Abc234defGhj",
      emailed: false,
    });
    const user = userEvent.setup();
    inProvider(<SchoolDetailPage />, "/platform/schools/:tid", "/platform/schools/5");
    await user.click(await screen.findByRole("tab", { name: /Admins/ }));
    await user.click(await screen.findByRole("button", { name: /Add administrator/ }));
    const dialog = await screen.findByRole("dialog");
    const add = within(dialog).getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();
    await user.type(within(dialog).getByLabelText("First name"), "Ada");
    await user.type(within(dialog).getByLabelText("Last name"), "Admin");
    await user.type(within(dialog).getByLabelText("E-mail"), "ada@school.test");
    await user.type(within(dialog).getByLabelText("Reason"), "Second admin requested");
    await user.click(add);
    await waitFor(() =>
      expect(api.createAdmin).toHaveBeenCalledWith(5, expect.objectContaining({ firstName: "Ada", lastName: "Admin", email: "ada@school.test", kind: "ADMIN" })),
    );
    expect(await screen.findByText("Abc234defGhj")).toBeInTheDocument();
    expect(screen.getByText(/could not be sent/)).toBeInTheDocument();
  });

  it("adds someone from another school with a role of this school", async () => {
    api.tenant.mockResolvedValue(tenantDetail({ status: "ACTIVE" }));
    api.admins.mockResolvedValue([ADMIN()]);
    api.tenantRoles.mockResolvedValue([
      { roleId: 3, name: "TEACHER", description: null },
      { roleId: 5, name: "ADMIN", description: null },
    ]);
    api.people.mockResolvedValue([
      { tid: 1, schoolName: "NGA", userId: 41, name: "Grace Mutoni", email: "grace@two.test", username: "grace", phone: null, userType: "TEACHER", roles: ["TEACHER"], alreadyInTarget: false },
    ]);
    api.assignPerson.mockResolvedValue({ userId: 90, username: "grace", roles: ["TEACHER"] });
    const user = userEvent.setup();
    inProvider(<SchoolDetailPage />, "/platform/schools/:tid", "/platform/schools/5");
    await user.click(await screen.findByRole("tab", { name: /Admins/ }));
    await user.click(await screen.findByRole("button", { name: /Add existing person/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Search people in every school"), "grace");
    await user.click(await within(dialog).findByRole("button", { name: /Grace Mutoni/ }, { timeout: 2000 }));
    expect(api.people).toHaveBeenCalledWith("grace", 5);
    await user.click(within(dialog).getByRole("button", { name: "TEACHER" }));
    await user.type(within(dialog).getByLabelText("Reason"), "Teaches in both");
    await user.click(within(dialog).getByRole("button", { name: /Add to Green Hills Academy/ }));
    await waitFor(() => expect(api.assignPerson).toHaveBeenCalledWith(5, { sourceTid: 1, sourceUserId: 41, roleIds: [3], reason: "Teaches in both" }));
  });

  it("is read-only without the lifecycle capability", async () => {
    api.overview.mockResolvedValue(overview(["PLATFORM_TENANTS_VIEW"]));
    api.tenant.mockResolvedValue(tenantDetail({ status: "ACTIVE" }));
    api.admins.mockResolvedValue([ADMIN()]);
    const user = userEvent.setup();
    inProvider(<SchoolDetailPage />, "/platform/schools/:tid", "/platform/schools/5");
    await user.click(await screen.findByRole("tab", { name: /Admins/ }));
    await screen.findByText("Jane Owner");
    expect(screen.queryByRole("button", { name: /Add administrator/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Reset/ })).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("package matrix", () => {
  it("toggling a feature marks the package dirty and saves only its entitlements", async () => {
    api.savePackageEntitlements.mockImplementation(async (_code: string, ents: any[]) => ({ ...PACKAGES[1], entitlements: ents.map((e) => ({ ...CATALOG.find((c) => c.key === e.key)!, value: e.value })) }));
    const user = userEvent.setup();
    inProvider(<PackagesPage />, "/platform/packages", "/platform/packages");
    const sw = await screen.findByRole("switch", { name: "Gold: AI Lesson Studio" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    // nothing changed: no save bar
    expect(screen.queryByRole("button", { name: /Save changes/ })).toBeNull();
    await user.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("dirty-gold")).toHaveTextContent("1");
    expect(screen.queryByTestId("dirty-starter")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Save changes/ }));
    await waitFor(() =>
      expect(api.savePackageEntitlements).toHaveBeenCalledWith("gold", [
        { key: "app.mis", value: null },
        { key: "app.tupo", value: null },
        { key: "feature.ai_lesson_studio", value: null },
        { key: "limit.students", value: 800 },
      ]),
    );
    expect(api.savePackage).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("dirty-gold")).toBeNull());
  });

  it("plan cards: toggling Public goes into the save bar; Discard restores it", async () => {
    const user = userEvent.setup();
    inProvider(<PackagesPage />, "/platform/packages", "/platform/packages");
    const chip = await screen.findByRole("switch", { name: "Gold public" });
    expect(chip).toHaveAttribute("aria-checked", "true");
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("dirty-gold")).toHaveTextContent("1");
    await user.click(screen.getByRole("button", { name: /Discard/ }));
    expect(screen.getByRole("switch", { name: "Gold public" })).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(screen.queryByTestId("dirty-gold")).toBeNull());
    expect(api.savePackage).not.toHaveBeenCalled();
  });

  it("the edit dialog changes the price, then Save sends only the changed details", async () => {
    api.savePackage.mockImplementation(async (_code: string, body: any) => ({ ...PACKAGES[1], ...body }));
    const user = userEvent.setup();
    inProvider(<PackagesPage />, "/platform/packages", "/platform/packages");
    await user.click(await screen.findByRole("button", { name: "Edit Gold" }));
    const dialog = await screen.findByRole("dialog");
    const term = within(dialog).getByLabelText("Per term");
    await user.clear(term);
    await user.type(term, "150000");
    await user.click(within(dialog).getByRole("button", { name: /Apply/ }));
    await user.click(screen.getByRole("button", { name: /Save changes/ }));
    await waitFor(() => expect(api.savePackage).toHaveBeenCalledWith("gold", { priceTerm: 150000 }));
    expect(api.savePackageEntitlements).not.toHaveBeenCalled();
  });

  it("an ∞ limit saves as null", async () => {
    api.savePackageEntitlements.mockResolvedValue(PACKAGES[0]);
    const user = userEvent.setup();
    inProvider(<PackagesPage />, "/platform/packages", "/platform/packages");
    await user.click(await screen.findByRole("button", { name: "Starter: Students: unlimited" }));
    await user.click(screen.getByRole("button", { name: /Save changes/ }));
    await waitFor(() => expect(api.savePackageEntitlements).toHaveBeenCalledWith("starter", [{ key: "app.mis", value: null }, { key: "limit.students", value: null }]));
  });
});

describe("settings", () => {
  const SETTINGS = {
    "application.draft_expiry_days": 14,
    "review.sla_days": 3,
    "application.payment_expiry_days": 30,
    "invoice.due_days": 14,
    "grace.days": 14,
    "archive.retention_days": 180,
    "billing.auto_issue_on_approval": false,
    "billing.separation_of_duties": false,
    "documents.required": ["REGISTRATION_CERT"],
  };
  beforeEach(() => {
    api.settings.mockResolvedValue({ ...SETTINGS });
    api.paymentInstructions.mockResolvedValue([{ id: 1, method: "MOMO", label: "MoMo Pay", details: "*182#", sortOrder: 0, isActive: true }]);
  });

  it("a timeline change shows the save bar and saves only that window", async () => {
    api.saveSettings.mockImplementation(async (patch: any) => ({ ...SETTINGS, ...patch }));
    const user = userEvent.setup();
    inProvider(<SettingsPage />, "/platform/settings", "/platform/settings");
    await user.click(await screen.findByRole("button", { name: "Grace: more" }));
    expect(screen.getByTestId("settings-dirty")).toHaveTextContent("1");
    await user.click(screen.getByRole("button", { name: /Save changes/ }));
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ "grace.days": 15 }));
    expect(api.savePaymentInstructions).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("settings-dirty")).toBeNull());
  });

  it("required documents toggle, and Discard puts everything back", async () => {
    const user = userEvent.setup();
    inProvider(<SettingsPage />, "/platform/settings", "/platform/settings");
    const logo = await screen.findByRole("button", { name: /Logo/ });
    expect(logo).toHaveAttribute("aria-pressed", "false");
    await user.click(logo);
    expect(logo).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Discard/ }));
    expect(screen.getByRole("button", { name: /Logo/ })).toHaveAttribute("aria-pressed", "false");
    expect(api.saveSettings).not.toHaveBeenCalled();
  });
});
