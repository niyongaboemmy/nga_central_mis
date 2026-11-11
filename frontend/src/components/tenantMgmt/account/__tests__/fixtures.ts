import type { Entitlement, PackageInfo, TenantAccount, UsageMeter } from "../../../../api/tenantMgmt";
import { iso, makeInvoice } from "../../shared/__tests__/fixtures";

const app = (key: string, label: string): Entitlement => ({ key, kind: "APP", value: null, label });
const feat = (key: string, label: string): Entitlement => ({ key, kind: "FEATURE", value: null, label });
const lim = (key: string, value: number | null, label: string): Entitlement => ({ key, kind: "LIMIT", value, label });

export const pkg = (code: string, tier: number, accent: string, ents: Entitlement[], priceTerm: number): PackageInfo => ({
  code,
  name: code.charAt(0).toUpperCase() + code.slice(1),
  tier,
  tagline: null,
  description: null,
  accent,
  isPublic: true,
  isActive: true,
  priceTerm,
  priceYear: priceTerm * 3,
  currency: "RWF",
  entitlements: ents,
});

export const STARTER = pkg("starter", 1, "sky", [app("app.mis", "MIS"), feat("feature.elearning", "E-learning"), lim("limit.students", 300, "Students")], 100000);
export const GOLD = pkg(
  "gold",
  2,
  "amber",
  [app("app.mis", "MIS"), app("app.tendo", "Tendo"), feat("feature.elearning", "E-learning"), feat("feature.office_hours", "Office hours"), lim("limit.students", 800, "Students")],
  250000,
);
export const PREMIUM = pkg(
  "premium",
  3,
  "violet",
  [
    app("app.mis", "MIS"),
    app("app.tendo", "Tendo"),
    app("app.taskmentor", "Task Mentor"),
    feat("feature.elearning", "E-learning"),
    feat("feature.office_hours", "Office hours"),
    feat("feature.safeguarding", "Safeguarding"),
    lim("limit.students", 2000, "Students"),
  ],
  500000,
);

export const METERS: UsageMeter[] = [
  { key: "limit.students", label: "Students", unit: "", used: 120, limit: 800, ratio: 0.15 },
  { key: "limit.staff", label: "Staff", unit: "", used: 30, limit: 80, ratio: 0.375 },
  { key: "limit.storage_gb", label: "Storage", unit: "GB", used: 4, limit: 20, ratio: 0.2 },
  { key: "limit.ai_requests_day", label: "AI today", unit: "", used: 50, limit: 200, ratio: 0.25 },
  { key: "limit.code_runs_day", label: "Code runs today", unit: "", used: 10, limit: null, ratio: null },
  { key: "limit.tupo_meeting_minutes_month", label: "Meeting minutes", unit: "min", used: 950, limit: 1000, ratio: 0.95 },
];

export const makeAccount = (over: Partial<TenantAccount> = {}): TenantAccount => ({
  tenant: { tid: 7, slug: "hill", name: "Hill School", status: "ACTIVE", isPrimary: false, graceUntil: null },
  package: GOLD,
  entitlements: { pkg: "gold", unrestricted: false, apps: ["app.mis", "app.tendo"], features: ["feature.elearning", "feature.office_hours"], limits: { "limit.students": 800 } },
  subscription: { id: 3, packageCode: "gold", billingCycle: "TERM", periodStart: iso(-30), periodEnd: iso(60), status: "ACTIVE", daysLeft: 60 },
  usage: { meters: METERS, daily: [] },
  options: [STARTER, GOLD, PREMIUM],
  openInvoices: [],
  paymentInstructions: [{ id: 1, method: "MOMO", label: "MoMo", details: "*182#", sortOrder: 1, isActive: true }],
  pendingChange: null,
  ...over,
});

export { makeInvoice, iso };
