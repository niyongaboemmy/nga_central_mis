/**
 * State, persistence and small pure helpers of the /register-school wizard
 * (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.1). The password and the logo File
 * are never persisted: sessionStorage only keeps what a refresh must not lose.
 */
import type { BillingCycle, PackageCode, PackageInfo, SchoolDetails, SchoolType } from "../../../api/tenantMgmt";

export interface SchoolForm {
  schoolName: string;
  schoolType: SchoolType | null;
  country: string;
  province: string;
  district: string;
  sector: string;
  address: string;
  schoolPhone: string;
  schoolEmail: string;
  website: string;
  estStudents: number | null;
  estStaff: number | null;
  desiredSlug: string;
  /** false while the slug follows the name */
  slugTouched: boolean;
}

export interface AdminForm {
  fullName: string;
  email: string;
  phone: string;
}

export interface WizardState {
  step: number;
  school: SchoolForm;
  requestedPackage: PackageCode | null;
  billingCycle: BillingCycle;
  admin: AdminForm;
  /** e-mail whose code was verified (the onboarding token exists) */
  verifiedEmail: string | null;
  applicationId: number | null;
  logoUploaded: boolean;
}

export const emptySchool = (): SchoolForm => ({
  schoolName: "",
  schoolType: null,
  country: "Rwanda",
  province: "",
  district: "",
  sector: "",
  address: "",
  schoolPhone: "",
  schoolEmail: "",
  website: "",
  estStudents: 300,
  estStaff: 30,
  desiredSlug: "",
  slugTouched: false,
});

export const initialWizard = (): WizardState => ({
  step: 0,
  school: emptySchool(),
  requestedPackage: null,
  billingCycle: "TERM",
  admin: { fullName: "", email: "", phone: "" },
  verifiedEmail: null,
  applicationId: null,
  logoUploaded: false,
});

export const WIZARD_STORAGE_KEY = "nga.register.wizard";

export const loadWizard = (): WizardState => {
  try {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return initialWizard();
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    const base = initialWizard();
    return {
      ...base,
      ...parsed,
      school: { ...base.school, ...(parsed.school ?? {}) },
      admin: { ...base.admin, ...(parsed.admin ?? {}) },
      step: Math.min(3, Math.max(0, Number(parsed.step) || 0)),
    };
  } catch {
    return initialWizard();
  }
};

export const saveWizard = (s: WizardState) => {
  try {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota */
  }
};

export const clearWizard = () => {
  try {
    sessionStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

/** "Ecole Sainte-Marie de Kigali" -> "ecole-sainte-marie-de-kigali" (max 30). */
export const slugify = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Smallest public package whose student limit fits the estimate. */
export const bestFitPackage = (packages: PackageInfo[], estStudents: number | null): PackageCode | null => {
  if (!estStudents || !packages.length) return null;
  const sorted = [...packages].sort((a, b) => a.tier - b.tier);
  const fit = sorted.find((p) => {
    const lim = p.entitlements.find((e) => e.key === "limit.students");
    return !lim || lim.value === null || lim.value >= estStudents;
  });
  return (fit ?? sorted[sorted.length - 1]).code;
};

const nul = (v: string) => (v.trim() ? v.trim() : null);

/** The wizard form -> the API's SchoolDetails body. */
export const toSchoolDetails = (s: WizardState): Partial<SchoolDetails> & { schoolName: string } => ({
  schoolName: s.school.schoolName.trim(),
  schoolType: s.school.schoolType,
  country: nul(s.school.country),
  province: nul(s.school.province),
  district: nul(s.school.district),
  sector: nul(s.school.sector),
  address: nul(s.school.address),
  schoolPhone: nul(s.school.schoolPhone),
  schoolEmail: nul(s.school.schoolEmail),
  website: nul(s.school.website),
  estStudents: s.school.estStudents,
  estStaff: s.school.estStaff,
  desiredSlug: nul(s.school.desiredSlug),
  requestedPackage: s.requestedPackage,
  billingCycle: s.billingCycle,
});

/** An Application (from the API) -> the editable school form (tracker "Fix changes"). */
export const schoolFormFrom = (a: Partial<SchoolDetails>): SchoolForm => ({
  ...emptySchool(),
  schoolName: a.schoolName ?? "",
  schoolType: a.schoolType ?? null,
  country: a.country ?? "Rwanda",
  province: a.province ?? "",
  district: a.district ?? "",
  sector: a.sector ?? "",
  address: a.address ?? "",
  schoolPhone: a.schoolPhone ?? "",
  schoolEmail: a.schoolEmail ?? "",
  website: a.website ?? "",
  estStudents: a.estStudents ?? null,
  estStaff: a.estStaff ?? null,
  desiredSlug: a.desiredSlug ?? "",
  slugTouched: true,
});

export type SchoolErrors = Partial<Record<keyof SchoolForm, string>>;

/** Step 1 checks (client side; the server checks again). */
export const validateSchool = (s: SchoolForm, slugOk: boolean | null): SchoolErrors => {
  const e: SchoolErrors = {};
  if (s.schoolName.trim().length < 3) e.schoolName = "Name required";
  if (!s.schoolType) e.schoolType = "Pick a type";
  if (!s.province.trim()) e.province = "Required";
  if (!s.district.trim()) e.district = "Required";
  if (s.schoolEmail.trim() && !EMAIL_RE.test(s.schoolEmail.trim())) e.schoolEmail = "Invalid e-mail";
  if (s.schoolPhone.trim() && s.schoolPhone.replace(/\D/g, "").length < 9) e.schoolPhone = "Invalid phone";
  if (!SLUG_RE.test(s.desiredSlug)) e.desiredSlug = "3–30: a-z, 0-9, -";
  else if (slugOk === false) e.desiredSlug = "Taken";
  return e;
};

export const passwordOk = (p: string) => p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p);

// ---------------------------------------------------------------------------
// API error -> what the screen shows
// ---------------------------------------------------------------------------

export interface ApiErr {
  status: number;
  code?: string;
  message: string;
  fields: Record<string, string>;
  /** seconds, for 429 */
  retryAfter?: number;
}

export const apiErr = (e: any, fallback = "Something went wrong"): ApiErr => {
  const res = e?.response;
  const data = res?.data ?? {};
  const fields: Record<string, string> = {};
  if (typeof data.field === "string") fields[data.field] = data.message ?? "Invalid";
  if (Array.isArray(data.errors)) {
    for (const it of data.errors) {
      const k = it?.field ?? it?.path ?? it?.param;
      if (typeof k === "string") fields[k] = it?.message ?? it?.msg ?? "Invalid";
    }
  } else if (data.errors && typeof data.errors === "object") {
    for (const [k, v] of Object.entries(data.errors)) fields[k] = String(v);
  }
  let retryAfter: number | undefined;
  if (res?.status === 429) {
    const h = Number(res?.headers?.["retry-after"]);
    retryAfter = Number(data.retryAfterSec) || (Number.isFinite(h) && h > 0 ? h : 60);
  }
  return {
    status: res?.status ?? 0,
    code: data.code,
    message: data.message || (res ? fallback : "No connection"),
    fields,
    retryAfter,
  };
};
