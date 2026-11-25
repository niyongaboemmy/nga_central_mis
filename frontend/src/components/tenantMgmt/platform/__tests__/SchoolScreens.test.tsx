import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/** Platform console redesign: the school dashboard, logo editing, Plan & apps, the schools list. */

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  tenant: vi.fn(),
  tenants: vi.fn(),
  packages: vi.fn(),
  entitlementCatalog: vi.fn(),
  admins: vi.fn(),
  setLogo: vi.fn(),
  removeLogo: vi.fn(),
}));

vi.mock("../../../../api/tenantMgmt", async (orig) => {
  const m: any = await orig();
  return { ...m, platformApi: new Proxy({}, { get: (_t, k: string) => (api as any)[k] ?? (() => Promise.resolve([])) }) };
});
vi.mock("../../../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("../../../../hooks/useTenantBranding", () => ({ loadBranding: vi.fn(async () => ({ logo_url: null })) }));
vi.mock("framer-motion", async (orig) => {
  const m: any = await orig();
  return { ...m, useReducedMotion: () => true };
});
vi.mock("recharts", async (orig) => {
  const m: any = await orig();
  return { ...m, ResponsiveContainer: ({ children }: any) => <div style={{ width: 600, height: 200 }}>{children}</div> };
});

import SchoolDetailPage from "../SchoolDetailPage";
import SchoolsPage from "../SchoolsPage";
import { PlatformProvider } from "../platformShared";

const CAPS = ["PLATFORM_TENANTS_VIEW", "PLATFORM_TENANTS_LIFECYCLE", "PLATFORM_TENANTS_ENTITLEMENTS"];
const ENT = (key: string, kind: string, label: string, value: number | null = null) => ({ key, kind, label, value });
const PACKAGES = [
  { code: "gold", name: "Gold", tier: 2, accent: "sky", isPublic: true, isActive: true, priceTerm: 1, priceYear: 2, currency: "RWF", tagline: null, description: null, entitlements: [ENT("app.mis", "APP", "MIS"), ENT("limit.students", "LIMIT", "Students", 500), ENT("limit.staff", "LIMIT", "Staff", 50), ENT("limit.storage_gb", "LIMIT", "Storage", 10)] },
];
const detail = (over: Record<string, unknown> = {}) => ({
  tenant: { tid: 5, slug: "ghacademy", name: "Green Hills Academy", status: "ACTIVE", isPrimary: false, pkg: "gold", students: 400, staff: 30, storageMb: 1200, activeUsers7d: 120, periodEnd: null, graceUntil: null, lastActivityAt: null, createdAt: "2026-01-01T00:00:00Z", legalName: null, logoUrl: null, timezone: "Africa/Kigali", country: "RW", activatedAt: null, suspendedAt: null, statusReason: null },
  entitlements: { pkg: "gold", unrestricted: false, apps: [], features: [], limits: {} },
  overrides: [],
  apps: [
    { systemId: 1, name: "Central MIS", clientId: "mis", status: "ACTIVE", source: "PACKAGE" },
    { systemId: 2, name: "Tupo", clientId: "tupo", status: "DISABLED", source: "PACKAGE" },
  ],
  usage: {
    meters: [
      { key: "limit.students", label: "Students", unit: "", used: 450, limit: 500, ratio: 0.9 },
      { key: "limit.staff", label: "Staff", unit: "", used: 30, limit: null, ratio: null },
    ],
    daily: [
      { day: "2026-11-23", activeUsers: 10, aiRequests: 3, codeRuns: 1, storageMb: 1 },
      { day: "2026-11-24", activeUsers: 14, aiRequests: 4, codeRuns: 2, storageMb: 1 },
    ],
  },
  subscription: null,
  invoices: [{ id: 9, number: "INV-9", status: "OVERDUE", amount: 250000, currency: "RWF", dueAt: "2026-11-01", paidAt: null }],
  provisioning: null,
  audit: [{ id: 1, at: new Date().toISOString(), action: "tenant.details", actor: "Ops", targetTid: 5, payload: {} }],
  allowedActions: ["edit_details", "change_package", "override"],
  ...over,
});
const overview = { applications: {}, awaitingPayment: 0, paymentsToConfirm: 0, provisioningFailures: 0, tenants: {}, expiringIn30Days: 0, revenueThisTerm: 0, currency: "RWF", trend: [], caps: CAPS };

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
  api.overview.mockResolvedValue(overview);
  api.packages.mockResolvedValue(PACKAGES);
  api.entitlementCatalog.mockResolvedValue([]);
  api.admins.mockResolvedValue([
    { userId: 7, name: "Jane Owner", username: "jane", email: null, phone: null, status: "ACTIVE", kind: "OWNER", roles: [], mustChangePassword: false, lockedUntil: null, lastLoginAt: null, createdAt: null },
    { userId: 8, name: "Sam Admin", username: "sam", email: null, phone: null, status: "ACTIVE", kind: "ADMIN", roles: [], mustChangePassword: true, lockedUntil: null, lastLoginAt: null, createdAt: null },
  ]);
});

describe("school dashboard", () => {
  it("opens on the dashboard: usage against limits, activity, apps, money, people and history", async () => {
    api.tenant.mockResolvedValue(detail());
    inProvider(<SchoolDetailPage />, "/platform/schools/:tid", "/platform/schools/5");
    expect(await screen.findByRole("heading", { level: 1, name: "Green Hills Academy" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Dashboard/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("meter", { name: "450 of 500" })).toBeInTheDocument();
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(screen.getByText("Active this week")).toBeInTheDocument();
    const apps = screen.getByRole("list", { name: "Apps" });
    expect(within(apps).getByText("Central MIS")).toBeInTheDocument();
    expect(within(apps).getByText("off")).toBeInTheDocument();
    expect(screen.getByText(/1 overdue/)).toBeInTheDocument();
    expect(await screen.findByText(/without a password/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Recent activity" })).toBeInTheDocument();
  });

  it("jumps from a dashboard panel to its tab", async () => {
    api.tenant.mockResolvedValue(detail());
    const user = userEvent.setup();
    inProvider(<SchoolDetailPage />, "/platform/schools/:tid", "/platform/schools/5");
    await user.click(await screen.findByRole("button", { name: /Plan & apps/ }));
    expect(screen.getByRole("tab", { name: /Plan & apps/ })).toHaveAttribute("aria-selected", "true");
    // the merged tab holds the plan and the app switches
    expect(await screen.findByRole("switch", { name: "Tupo" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Package" })).toBeInTheDocument();
  });

  it("changes the logo from the header and shows the new one", async () => {
    api.tenant.mockResolvedValue(detail());
    api.setLogo.mockResolvedValue(detail({ tenant: { ...detail().tenant, logoUrl: "https://api.test/schools/5/logo/primary?v=2" } }));
    const user = userEvent.setup();
    const { container } = inProvider(<SchoolDetailPage />, "/platform/schools/:tid", "/platform/schools/5");
    await screen.findByRole("button", { name: "Add a logo" });
    const file = new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file);
    await waitFor(() => expect(api.setLogo).toHaveBeenCalledWith(5, file));
    expect(await screen.findByRole("button", { name: "Change the logo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove the logo" })).toBeInTheDocument();
  });

  it("refuses a file that isn't an image without calling the API", async () => {
    api.tenant.mockResolvedValue(detail());
    const user = userEvent.setup({ applyAccept: false });
    const { container } = inProvider(<SchoolDetailPage />, "/platform/schools/:tid", "/platform/schools/5");
    await screen.findByRole("button", { name: "Add a logo" });
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(api.setLogo).not.toHaveBeenCalled();
  });

  it("shows the logo read-only without the edit right", async () => {
    api.tenant.mockResolvedValue(detail({ allowedActions: [] }));
    inProvider(<SchoolDetailPage />, "/platform/schools/:tid", "/platform/schools/5");
    await screen.findByRole("heading", { level: 1, name: "Green Hills Academy" });
    expect(screen.queryByRole("button", { name: /logo/i })).toBeNull();
  });
});

describe("schools list", () => {
  const row = (tid: number, name: string, activeUsers7d: number, students: number) => ({ tid, slug: `s${tid}`, name, status: "ACTIVE", isPrimary: false, pkg: "gold", students, staff: 1, storageMb: 10, activeUsers7d, periodEnd: null, graceUntil: null, lastActivityAt: null, createdAt: "2026-01-01T00:00:00Z" });

  it("sorts by activity or usage and switches to a table", async () => {
    api.tenants.mockResolvedValue([row(2, "Alpha School", 5, 100), row(3, "Beta School", 50, 20), row(4, "Gamma School", 20, 490)]);
    const user = userEvent.setup();
    inProvider(<SchoolsPage />, "/platform/schools", "/platform/schools");
    const names = () => screen.getAllByRole("link").map((l) => l.getAttribute("aria-label")?.split(",")[0]);
    await screen.findByRole("link", { name: /Alpha School/ });
    expect(names()).toEqual(["Alpha School", "Beta School", "Gamma School"]);
    await user.click(screen.getByRole("radio", { name: /Activity/ }));
    expect(names()).toEqual(["Beta School", "Gamma School", "Alpha School"]);
    await user.click(screen.getByRole("radio", { name: /Usage/ }));
    expect(names()[0]).toBe("Gamma School");
    await user.click(screen.getByRole("radio", { name: /Table/ }));
    const table = screen.getByRole("table", { name: "Schools" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
  });
});
