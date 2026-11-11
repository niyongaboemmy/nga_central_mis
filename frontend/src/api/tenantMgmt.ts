/**
 * Tenant management API (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §7) -- the one
 * contract between the MIS backend (routes/onboarding.ts, platformConsole.ts,
 * platformTenants.ts, tenantAccount.ts) and the frontend.
 *
 * Every endpoint answers `{ success: true, data: T }`; failures answer
 * `{ success: false, code?, message }` (409 INVALID_TRANSITION, 403
 * PACKAGE_FEATURE / PACKAGE_LIMIT, 429 RATE_LIMITED, ...).
 *
 * Applicants are not users of any school: their calls go through `onboardingApi`
 * with the onboarding token (localStorage ONBOARDING_TOKEN_KEY), never the session.
 */
import axios from "axios";
import api, { API_BASE_URL } from "../services/api";

// ---------------------------------------------------------------------------
// Shared vocabulary
// ---------------------------------------------------------------------------

export type PackageCode = "starter" | "gold" | "premium" | "max" | string;
export type BillingCycle = "TERM" | "YEAR";
export type EntKind = "APP" | "FEATURE" | "LIMIT";

export type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "WITHDRAWN"
  | "APPROVED_AWAITING_PAYMENT"
  | "PAYMENT_SUBMITTED"
  | "PAYMENT_REJECTED"
  | "PAYMENT_CONFIRMED"
  | "EXPIRED"
  | "PROVISIONING"
  | "PROVISIONING_FAILED"
  | "ACTIVE";

export const TRACKER_STEPS = ["submitted", "review", "approved", "payment", "setup", "live"] as const;
export type TrackerStep = (typeof TRACKER_STEPS)[number];

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PAID" | "VOID" | "OVERDUE";
export type PaymentStatus = "SUBMITTED" | "CONFIRMED" | "REJECTED";
export type PaymentMethod = "MOMO" | "AIRTEL_MONEY" | "BANK_TRANSFER" | "CASH" | "OTHER";
export type TenantLifecycle = "PENDING" | "ACTIVE" | "GRACE" | "SUSPENDED" | "ARCHIVED";
export type DocumentKind = "REGISTRATION_CERT" | "AUTHORISATION_LETTER" | "LOGO" | "OTHER";
export type StepStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
export type SchoolType = "primary" | "secondary" | "tvet" | "university" | "other";

export interface Entitlement {
  key: string;
  kind: EntKind;
  /** LIMIT value; null = unlimited (or "enabled" for APP / FEATURE) */
  value: number | null;
  label: string;
}

export interface PackageInfo {
  code: PackageCode;
  name: string;
  tier: number;
  tagline: string | null;
  description: string | null;
  /** tailwind colour family: sky | amber | violet | emerald */
  accent: string | null;
  isPublic: boolean;
  isActive: boolean;
  priceTerm: number | null;
  priceYear: number | null;
  currency: string;
  entitlements: Entitlement[];
}

/** Effective entitlements of a school (package + overrides). */
export interface EffectiveEntitlements {
  pkg: PackageCode;
  unrestricted: boolean;
  apps: string[];
  features: string[];
  limits: Record<string, number | null>;
}

export interface TimelineEvent {
  id: number;
  at: string;
  from: ApplicationStatus | null;
  to: ApplicationStatus | null;
  kind: string;
  actor: "APPLICANT" | "PLATFORM" | "SYSTEM";
  actorName?: string | null;
  message: string | null;
  /** platform views only */
  visibleToApplicant?: boolean;
}

export interface ThreadMessage {
  id: number;
  at: string;
  author: "APPLICANT" | "PLATFORM" | "SYSTEM";
  authorName: string | null;
  body: string;
  attachmentUrl: string | null;
  internal: boolean;
  readAt: string | null;
}

export interface ApplicationDocument {
  id: number;
  kind: DocumentKind;
  name: string | null;
  url: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  note: string | null;
  at: string;
}

export interface SchoolDetails {
  schoolName: string;
  schoolType: SchoolType | null;
  country: string | null;
  province: string | null;
  district: string | null;
  sector: string | null;
  address: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  website: string | null;
  estStudents: number | null;
  estStaff: number | null;
  desiredSlug: string | null;
  requestedPackage: PackageCode | null;
  billingCycle: BillingCycle;
  requestedApps: string[];
  notes: string | null;
}

export interface Application extends SchoolDetails {
  id: number;
  ref: string | null;
  status: ApplicationStatus;
  step: TrackerStep;
  approvedPackage: PackageCode | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  expiresAt: string | null;
  tenantId: number | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface InvoiceLine {
  label: string;
  amount: number;
}

export interface Invoice {
  id: number;
  number: string | null;
  kind: "NEW" | "RENEWAL" | "CHANGE";
  applicationId: number | null;
  tenantId: number | null;
  packageCode: PackageCode;
  billingCycle: BillingCycle;
  periodStart: string | null;
  periodEnd: string | null;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  lines: InvoiceLine[];
  notes: string | null;
  /** GET-able PDF (auth: same token as the list it came from) */
  pdfUrl: string | null;
  payments: Payment[];
}

export interface Payment {
  id: number;
  invoiceId: number;
  method: PaymentMethod;
  reference: string | null;
  amount: number;
  paidAt: string | null;
  proofUrl: string | null;
  status: PaymentStatus;
  isWaiver: boolean;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface PaymentInstruction {
  id: number;
  method: PaymentMethod;
  label: string;
  details: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ProvisioningStep {
  key: string;
  /** short label safe to show an applicant ("Creating your MIS") */
  label: string;
  status: StepStatus;
  startedAt: string | null;
  finishedAt: string | null;
  /** platform views only */
  log?: string | null;
}

export interface ProvisioningRun {
  id: number;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  attempt: number;
  startedAt: string | null;
  finishedAt: string | null;
  steps: ProvisioningStep[];
}

/** What the applicant can do right now (drives the tracker's action cards). */
export type NextAction =
  | "VERIFY_EMAIL"
  | "COMPLETE_DRAFT"
  | "SUBMIT"
  | "FIX_CHANGES"
  | "UPLOAD_DOCUMENTS"
  | "PAY_INVOICE"
  | "REUPLOAD_PAYMENT"
  | "WAIT"
  | "GO_TO_SCHOOL";

export interface OnboardingMe {
  account: { id: number; email: string; fullName: string; phone: string | null; emailVerified: boolean; status: string };
  application: Application | null;
  timeline: TimelineEvent[];
  documents: ApplicationDocument[];
  requiredDocuments: DocumentKind[];
  invoice: Invoice | null;
  paymentInstructions: PaymentInstruction[];
  provisioning: ProvisioningRun | null;
  unreadMessages: number;
  nextActions: NextAction[];
  /** set once ACTIVE: where "Go to your school" leads */
  school: { tid: number; slug: string; name: string; loginUrl: string } | null;
}

// ---------------------------------------------------------------------------
// Onboarding token (applicant) -- a separate axios instance, never the session
// ---------------------------------------------------------------------------

export const ONBOARDING_TOKEN_KEY = "nga.onboarding.token";

export const getOnboardingToken = (): string | null => {
  try {
    return localStorage.getItem(ONBOARDING_TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setOnboardingToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(ONBOARDING_TOKEN_KEY, token);
    else localStorage.removeItem(ONBOARDING_TOKEN_KEY);
  } catch {
    /* private mode */
  }
};

export const onboardingApi = axios.create({ baseURL: API_BASE_URL, timeout: 30000 });
onboardingApi.interceptors.request.use((config) => {
  const t = getOnboardingToken();
  if (t && config.headers) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

const unwrap = <T>(p: Promise<{ data: { data: T } }>): Promise<T> => p.then((r) => r.data.data);

// ---------------------------------------------------------------------------
// Public (no auth, rate-limited)
// ---------------------------------------------------------------------------

export const publicApi = {
  packages: () => unwrap<PackageInfo[]>(onboardingApi.get("/packages/public")),
  slugAvailable: (slug: string) =>
    unwrap<{ slug: string; available: boolean; suggestion: string | null; reason?: string }>(
      onboardingApi.get("/onboarding/slug-available", { params: { slug } }),
    ),
  /** near-duplicate school names among tenants and open applications */
  similarSchools: (name: string) =>
    unwrap<Array<{ name: string; kind: "TENANT" | "APPLICATION" }>>(onboardingApi.get("/onboarding/similar", { params: { name } })),
  /** step 3: create the account (or resend the code to an unverified one) -> OTP e-mailed */
  startAccount: (body: { fullName: string; email: string; phone?: string; password: string; captchaToken?: string }) =>
    unwrap<{ accountId: number; otpSentTo: string; expiresInSec: number }>(onboardingApi.post("/onboarding/accounts", body)),
  resendCode: (email: string) => unwrap<{ otpSentTo: string; expiresInSec: number }>(onboardingApi.post("/onboarding/accounts/resend", { email })),
  /** returns the onboarding token: store it with setOnboardingToken */
  verifyAccount: (body: { email: string; code: string }) =>
    unwrap<{ token: string; me: OnboardingMe }>(onboardingApi.post("/onboarding/accounts/verify", body)),
  /** applicant sign-in outside the MIS login form (the MIS login also returns `onboarding`) */
  login: (body: { email: string; password: string }) =>
    unwrap<{ token: string; me: OnboardingMe }>(onboardingApi.post("/onboarding/login", body)),
  branding: (slug: string) =>
    unwrap<{ name: string; logoUrl: string | null; primaryColor: string | null }>(onboardingApi.get("/tenant/branding", { params: { slug } })),
  captchaConfig: () => unwrap<{ provider: "turnstile" | "hcaptcha" | null; siteKey: string | null }>(onboardingApi.get("/onboarding/captcha")),
  adminDivisions: () =>
    unwrap<Record<string, Record<string, string[]>>>(onboardingApi.get("/onboarding/admin-divisions")),
};

// ---------------------------------------------------------------------------
// Applicant (onboarding token)
// ---------------------------------------------------------------------------

export const applicantApi = {
  me: () => unwrap<OnboardingMe>(onboardingApi.get("/onboarding/me")),
  /** create the draft (one open application per account) */
  createApplication: (body: Partial<SchoolDetails> & { schoolName: string }) =>
    unwrap<Application>(onboardingApi.post("/onboarding/applications", body)),
  updateApplication: (id: number, body: Partial<SchoolDetails>) => unwrap<Application>(onboardingApi.patch(`/onboarding/applications/${id}`, body)),
  submit: (id: number, body: { acceptTerms: true; captchaToken?: string }) =>
    unwrap<Application>(onboardingApi.post(`/onboarding/applications/${id}/submit`, body)),
  withdraw: (id: number, reason?: string) => unwrap<Application>(onboardingApi.post(`/onboarding/applications/${id}/withdraw`, { reason })),
  messages: (id: number) => unwrap<ThreadMessage[]>(onboardingApi.get(`/onboarding/applications/${id}/messages`)),
  sendMessage: (id: number, body: string, file?: File) => {
    const fd = new FormData();
    fd.append("body", body);
    if (file) fd.append("file", file);
    return unwrap<ThreadMessage>(onboardingApi.post(`/onboarding/applications/${id}/messages`, fd));
  },
  uploadDocument: (id: number, kind: DocumentKind, file: File) => {
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    return unwrap<ApplicationDocument>(onboardingApi.post(`/onboarding/applications/${id}/documents`, fd));
  },
  deleteDocument: (id: number, docId: number) => unwrap<{ ok: true }>(onboardingApi.delete(`/onboarding/applications/${id}/documents/${docId}`)),
  invoice: (invoiceId: number) => unwrap<Invoice>(onboardingApi.get(`/onboarding/invoices/${invoiceId}`)),
  invoicePdfUrl: (invoiceId: number) => `${API_BASE_URL}/onboarding/invoices/${invoiceId}/pdf?token=${encodeURIComponent(getOnboardingToken() ?? "")}`,
  submitPayment: (invoiceId: number, body: { method: PaymentMethod; reference: string; amount: number; paidAt: string }, proof?: File) => {
    const fd = new FormData();
    Object.entries(body).forEach(([k, v]) => fd.append(k, String(v)));
    if (proof) fd.append("proof", proof);
    return unwrap<Payment>(onboardingApi.post(`/onboarding/invoices/${invoiceId}/payments`, fd));
  },
  provisioning: (id: number) => unwrap<ProvisioningRun | null>(onboardingApi.get(`/onboarding/applications/${id}/provisioning`)),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    unwrap<{ ok: true }>(onboardingApi.post("/onboarding/account/password", body)),
  logout: () => unwrap<{ ok: true }>(onboardingApi.post("/onboarding/logout")),
};

// ---------------------------------------------------------------------------
// Platform console (primary tenant session + PLATFORM_* capabilities)
// ---------------------------------------------------------------------------

export interface PlatformOverview {
  applications: Record<ApplicationStatus, number>;
  awaitingPayment: number;
  paymentsToConfirm: number;
  provisioningFailures: number;
  tenants: Record<TenantLifecycle, number>;
  expiringIn30Days: number;
  revenueThisTerm: number;
  currency: string;
  /** last 12 weeks: submitted applications and activated schools */
  trend: Array<{ week: string; submitted: number; activated: number }>;
  /** the caller's platform capabilities (UI gating) */
  caps: string[];
}

export interface ApplicationListItem {
  id: number;
  ref: string | null;
  schoolName: string;
  status: ApplicationStatus;
  step: TrackerStep;
  requestedPackage: PackageCode | null;
  applicantName: string;
  applicantEmail: string;
  district: string | null;
  estStudents: number | null;
  submittedAt: string | null;
  ageDays: number;
  slaBreached: boolean;
  assignedTo: { id: number; name: string } | null;
  unread: number;
}

export interface ChecklistItem {
  key: string;
  label: string;
  checked: boolean;
  checkedBy: string | null;
  checkedAt: string | null;
  note: string | null;
}

export interface DuplicateHit {
  kind: "TENANT" | "APPLICATION";
  id: number;
  name: string;
  reason: "NAME" | "EMAIL_DOMAIN" | "PHONE" | "SLUG";
}

export interface ApplicationDetail {
  application: Application;
  applicant: { id: number; fullName: string; email: string; phone: string | null; emailVerified: boolean };
  timeline: TimelineEvent[];
  messages: ThreadMessage[];
  documents: ApplicationDocument[];
  requiredDocuments: DocumentKind[];
  checklist: ChecklistItem[];
  duplicates: DuplicateHit[];
  invoice: Invoice | null;
  provisioning: ProvisioningRun | null;
  assignedTo: { id: number; name: string } | null;
  /** transitions the caller may make now */
  allowedActions: Array<"assign" | "start_review" | "request_changes" | "reject" | "approve" | "reopen">;
}

export interface TenantListItem {
  tid: number;
  slug: string;
  name: string;
  status: TenantLifecycle;
  isPrimary: boolean;
  pkg: PackageCode;
  students: number;
  staff: number;
  storageMb: number;
  activeUsers7d: number;
  periodEnd: string | null;
  graceUntil: string | null;
  lastActivityAt: string | null;
  createdAt: string;
}

export interface TenantDetail {
  tenant: TenantListItem & { timezone: string; country: string | null; activatedAt: string | null; suspendedAt: string | null; statusReason: string | null };
  entitlements: EffectiveEntitlements;
  overrides: Array<{ id: number; key: string; value: number | null; enabled: boolean; reason: string; expiresAt: string | null; grantedBy: string | null }>;
  apps: Array<{ systemId: number; name: string; clientId: string | null; status: "ACTIVE" | "DISABLED"; source: "PACKAGE" | "OVERRIDE"; /** entitlement key ("app.tupo"), null when unmapped */ key?: string | null }>;
  usage: TenantUsage;
  subscription: Subscription | null;
  invoices: Invoice[];
  provisioning: ProvisioningRun | null;
  audit: AuditEntry[];
  allowedActions: Array<"suspend" | "reactivate" | "extend_grace" | "archive" | "delete" | "change_package" | "override">;
}

export interface Subscription {
  id: number;
  packageCode: PackageCode;
  billingCycle: BillingCycle;
  periodStart: string;
  periodEnd: string;
  status: "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED";
  daysLeft: number;
}

export interface UsageMeter {
  key: string;
  label: string;
  unit: string;
  used: number;
  limit: number | null;
  /** 0..1, null when unlimited */
  ratio: number | null;
}

export interface TenantUsage {
  meters: UsageMeter[];
  /** last 30 days of TenantUsageDaily */
  daily: Array<{ day: string; activeUsers: number; aiRequests: number; codeRuns: number; storageMb: number }>;
}

export interface AuditEntry {
  id: number;
  at: string;
  action: string;
  actor: string | null;
  targetTid: number | null;
  payload: unknown;
}

export const platformApi = {
  overview: () => unwrap<PlatformOverview>(api.get("/platform/overview")),
  // applications
  applications: (params: { status?: string; package?: string; q?: string; mine?: boolean } = {}) =>
    unwrap<ApplicationListItem[]>(api.get("/platform/applications", { params })),
  application: (id: number) => unwrap<ApplicationDetail>(api.get(`/platform/applications/${id}`)),
  assign: (id: number, userId: number | null) => unwrap<ApplicationDetail>(api.post(`/platform/applications/${id}/assign`, { userId })),
  startReview: (id: number) => unwrap<ApplicationDetail>(api.post(`/platform/applications/${id}/start-review`)),
  requestChanges: (id: number, message: string) => unwrap<ApplicationDetail>(api.post(`/platform/applications/${id}/request-changes`, { message })),
  reject: (id: number, reason: string) => unwrap<ApplicationDetail>(api.post(`/platform/applications/${id}/reject`, { reason })),
  approve: (id: number, body: { packageCode: PackageCode; billingCycle: BillingCycle; slug: string; apps?: string[]; note?: string }) =>
    unwrap<ApplicationDetail>(api.post(`/platform/applications/${id}/approve`, body)),
  reopen: (id: number, reason: string) => unwrap<ApplicationDetail>(api.post(`/platform/applications/${id}/reopen`, { reason })),
  setChecklist: (id: number, key: string, checked: boolean, note?: string) =>
    unwrap<ChecklistItem[]>(api.post(`/platform/applications/${id}/checklist`, { key, checked, note })),
  reviewDocument: (id: number, docId: number, status: "ACCEPTED" | "REJECTED", note?: string) =>
    unwrap<ApplicationDocument>(api.post(`/platform/applications/${id}/documents/${docId}/review`, { status, note })),
  sendMessage: (id: number, body: string, internal = false) =>
    unwrap<ThreadMessage>(api.post(`/platform/applications/${id}/messages`, { body, internal })),
  staff: () => unwrap<Array<{ id: number; name: string; caps: string[] }>>(api.get("/platform/staff")),
  // billing
  invoices: (params: { status?: string; tenantId?: number; applicationId?: number } = {}) =>
    unwrap<Invoice[]>(api.get("/platform/invoices", { params })),
  createInvoice: (body: Partial<Invoice> & { packageCode: PackageCode; tenantId?: number; applicationId?: number }) =>
    unwrap<Invoice>(api.post("/platform/invoices", body)),
  updateInvoice: (id: number, body: Partial<Pick<Invoice, "amount" | "lines" | "notes" | "dueAt" | "periodStart" | "periodEnd">>) =>
    unwrap<Invoice>(api.patch(`/platform/invoices/${id}`, body)),
  issueInvoice: (id: number) => unwrap<Invoice>(api.post(`/platform/invoices/${id}/issue`)),
  voidInvoice: (id: number, reason: string) => unwrap<Invoice>(api.post(`/platform/invoices/${id}/void`, { reason })),
  waiveInvoice: (id: number, reason: string) => unwrap<Invoice>(api.post(`/platform/invoices/${id}/waive`, { reason })),
  invoicePdfUrl: (id: number) => `${API_BASE_URL}/platform/invoices/${id}/pdf`,
  paymentsToReview: () => unwrap<Array<Payment & { invoice: Invoice; schoolName: string }>>(api.get("/platform/payments", { params: { status: "SUBMITTED" } })),
  confirmPayment: (id: number, note?: string) => unwrap<Payment>(api.post(`/platform/payments/${id}/confirm`, { note })),
  rejectPayment: (id: number, note: string) => unwrap<Payment>(api.post(`/platform/payments/${id}/reject`, { note })),
  paymentInstructions: () => unwrap<PaymentInstruction[]>(api.get("/platform/payment-instructions")),
  savePaymentInstructions: (items: Array<Omit<PaymentInstruction, "id"> & { id?: number }>) =>
    unwrap<PaymentInstruction[]>(api.put("/platform/payment-instructions", { items })),
  // packages
  packages: () => unwrap<PackageInfo[]>(api.get("/platform/packages")),
  savePackage: (code: PackageCode, body: Partial<Omit<PackageInfo, "code" | "entitlements">>) =>
    unwrap<PackageInfo>(api.put(`/platform/packages/${code}`, body)),
  savePackageEntitlements: (code: PackageCode, entitlements: Array<{ key: string; value: number | null }>) =>
    unwrap<PackageInfo>(api.put(`/platform/packages/${code}/entitlements`, { entitlements })),
  /** every known APP / FEATURE / LIMIT key with its label (package editor rows) */
  entitlementCatalog: () => unwrap<Entitlement[]>(api.get("/platform/entitlement-catalog")),
  // settings & audit
  settings: () => unwrap<Record<string, unknown>>(api.get("/platform/settings")),
  saveSettings: (patch: Record<string, unknown>) => unwrap<Record<string, unknown>>(api.put("/platform/settings", patch)),
  audit: (params: { tid?: number; action?: string; before?: number } = {}) => unwrap<AuditEntry[]>(api.get("/platform/audit", { params })),
  // tenants (routes/platformTenants.ts)
  tenants: (params: { status?: string; q?: string } = {}) => unwrap<TenantListItem[]>(api.get("/platform/tenants", { params })),
  tenant: (tid: number) => unwrap<TenantDetail>(api.get(`/platform/tenants/${tid}`)),
  suspend: (tid: number, reason: string) => unwrap<TenantDetail>(api.post(`/platform/tenants/${tid}/suspend`, { reason })),
  reactivate: (tid: number, reason: string) => unwrap<TenantDetail>(api.post(`/platform/tenants/${tid}/reactivate`, { reason })),
  extendGrace: (tid: number, days: number, reason: string) => unwrap<TenantDetail>(api.post(`/platform/tenants/${tid}/extend-grace`, { days, reason })),
  archive: (tid: number, reason: string) => unwrap<TenantDetail>(api.post(`/platform/tenants/${tid}/archive`, { reason })),
  deleteTenant: (tid: number, confirmName: string) => unwrap<{ ok: true }>(api.post(`/platform/tenants/${tid}/delete`, { confirmName })),
  changePackage: (tid: number, packageCode: PackageCode, reason: string) =>
    unwrap<TenantDetail>(api.put(`/platform/tenants/${tid}/package`, { packageCode, reason })),
  addOverride: (tid: number, body: { key: string; value: number | null; enabled: boolean; reason: string; expiresAt?: string | null }) =>
    unwrap<TenantDetail>(api.post(`/platform/tenants/${tid}/overrides`, body)),
  removeOverride: (tid: number, overrideId: number) => unwrap<TenantDetail>(api.delete(`/platform/tenants/${tid}/overrides/${overrideId}`)),
  setTenantApp: (tid: number, systemId: number, status: "ACTIVE" | "DISABLED") =>
    unwrap<TenantDetail>(api.put(`/platform/tenants/${tid}/apps/${systemId}`, { status })),
  provisioning: (runId: number) => unwrap<ProvisioningRun>(api.get(`/platform/provisioning/${runId}`)),
  retryProvisioning: (runId: number) => unwrap<ProvisioningRun>(api.post(`/platform/provisioning/${runId}/retry`)),
  /** support sessions this tenant granted (§6.9) */
  supportSessions: () => unwrap<Array<SupportSession & { tid: number; schoolName: string }>>(api.get("/platform/support-sessions")),
  /** -> a session token for that school (store as the MIS token in a new tab) */
  openSupportSession: (sessionId: number) => unwrap<{ token: string; tid: number; expiresAt: string }>(api.post(`/platform/support-sessions/${sessionId}/open`)),
};

// ---------------------------------------------------------------------------
// The school's own account (tenant session, SCHOOL_SETTINGS_MANAGE / SCHOOL_BILLING_MANAGE)
// ---------------------------------------------------------------------------

export interface SupportSession {
  id: number;
  mode: "READ" | "WRITE";
  reason: string | null;
  startsAt: string;
  expiresAt: string;
  revokedAt: string | null;
  openedBy: string | null;
  openedAt: string | null;
  active: boolean;
}

export interface SetupItem {
  key: "profile" | "academic_year" | "structure" | "periods" | "people" | "roles" | "apps" | "parents";
  label: string;
  done: boolean;
  /** frontend route that completes it */
  link: string;
}

export interface TenantAccount {
  tenant: { tid: number; slug: string; name: string; status: TenantLifecycle; isPrimary: boolean; graceUntil: string | null };
  package: PackageInfo;
  entitlements: EffectiveEntitlements;
  subscription: Subscription | null;
  usage: TenantUsage;
  /** packages the school may move to (public + active), with the price for its cycle */
  options: PackageInfo[];
  openInvoices: Invoice[];
  paymentInstructions: PaymentInstruction[];
  pendingChange: { invoiceId: number; packageCode: PackageCode; effective: "NOW" | "NEXT_PERIOD" } | null;
}

export const tenantApi = {
  /** banner state for every signed-in page: GRACE / limits near / package features */
  status: () =>
    unwrap<{ status: TenantLifecycle; graceUntil: string | null; daysLeft: number | null; warnings: UsageMeter[]; entitlements: EffectiveEntitlements }>(
      api.get("/tenant/status"),
    ),
  account: () => unwrap<TenantAccount>(api.get("/tenant/subscription")),
  usage: () => unwrap<TenantUsage>(api.get("/tenant/usage")),
  changeRequest: (body: { packageCode: PackageCode; billingCycle?: BillingCycle; effective?: "NOW" | "NEXT_PERIOD" }) =>
    unwrap<{ invoice: Invoice; effective: "NOW" | "NEXT_PERIOD" }>(api.post("/tenant/subscription/change-request", body)),
  invoices: () => unwrap<Invoice[]>(api.get("/tenant/invoices")),
  invoicePdfUrl: (id: number) => `${API_BASE_URL}/tenant/invoices/${id}/pdf`,
  submitPayment: (invoiceId: number, body: { method: PaymentMethod; reference: string; amount: number; paidAt: string }, proof?: File) => {
    const fd = new FormData();
    Object.entries(body).forEach(([k, v]) => fd.append(k, String(v)));
    if (proof) fd.append("proof", proof);
    return unwrap<Payment>(api.post(`/tenant/invoices/${invoiceId}/payments`, fd));
  },
  supportSessions: () => unwrap<SupportSession[]>(api.get("/tenant/support-sessions")),
  grantSupport: (body: { hours: number; mode: "READ" | "WRITE"; reason?: string }) => unwrap<SupportSession>(api.post("/tenant/support-sessions", body)),
  revokeSupport: (id: number) => unwrap<SupportSession>(api.delete(`/tenant/support-sessions/${id}`)),
  setup: () => unwrap<{ items: SetupItem[]; dismissed: boolean }>(api.get("/tenant/setup")),
  dismissSetup: () => unwrap<{ ok: true }>(api.post("/tenant/setup/dismiss")),
};

// ---------------------------------------------------------------------------
// Access Studio: capabilities the school's package does not include (lock badges)
// ---------------------------------------------------------------------------

export const accessLocksApi = {
  /** access app ("mis" | "tm" | "da" | "tupo") -> capability key -> the feature it needs */
  locks: () => unwrap<{ pkg: PackageCode; locked: Record<string, Record<string, string>>; features: Record<string, string> }>(api.get("/access/package-locks")),
};

// ---------------------------------------------------------------------------
// Display helpers shared by every screen
// ---------------------------------------------------------------------------

export const formatMoney = (amount: number | null | undefined, currency = "RWF") =>
  amount === null || amount === undefined ? "—" : `${new Intl.NumberFormat("en-RW").format(amount)} ${currency}`;

export const APP_LABELS: Record<string, string> = {
  "app.mis": "MIS",
  "app.taskmentor": "Task Mentor",
  "app.tendo": "Tendo",
  "app.tupo": "Tupo",
  "app.desktop": "Desktop",
  "app.tmcode": "TMCode",
};
