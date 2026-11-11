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
  api.slugAvailable.mockImplementation(async (slug: string) => ({ slug, available: true, suggestion: null }));
});

// ---------------------------------------------------------------------------

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
    expect(within(screen.getByRole("button", { name: /To confirm/ })).getByText("5")).toBeInTheDocument();
    expect(screen.getByText("1,500,000 RWF")).toBeInTheDocument();
    for (const t of ["Overview", "Applications", "Billing", "Schools", "Packages", "Settings", "Audit", "Support"]) expect(screen.getByRole("tab", { name: new RegExp(t) })).toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: /To confirm/ })).toBeNull();
    // schools tiles stay actionable with PLATFORM_TENANTS_VIEW
    expect(screen.getByRole("button", { name: /Grace/ })).toBeInTheDocument();
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
    expect(screen.queryByRole("tab", { name: /To confirm/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Waive" })).toBeNull();
    expect(screen.getByRole("button", { name: "Void" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

const tenantDetail = (over: Partial<{ isPrimary: boolean; allowed: string[] }> = {}) => ({
  tenant: {
    tid: 5,
    slug: "ghacademy",
    name: "Green Hills Academy",
    status: "ARCHIVED",
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
    expect(within(bar).getByRole("button", { name: /Grace/ })).toBeInTheDocument();
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
    const save = screen.getByRole("button", { name: "Save Gold" });
    expect(save).toBeDisabled();
    await user.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("dirty-gold")).toHaveTextContent("1");
    expect(screen.queryByTestId("dirty-starter")).toBeNull();
    await user.click(save);
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

  it("an ∞ limit saves as null", async () => {
    api.savePackageEntitlements.mockResolvedValue(PACKAGES[0]);
    const user = userEvent.setup();
    inProvider(<PackagesPage />, "/platform/packages", "/platform/packages");
    await user.click(await screen.findByRole("button", { name: "Starter: Students: unlimited" }));
    await user.click(screen.getByRole("button", { name: "Save Starter" }));
    await waitFor(() => expect(api.savePackageEntitlements).toHaveBeenCalledWith("starter", [{ key: "app.mis", value: null }, { key: "limit.students", value: null }]));
  });
});

