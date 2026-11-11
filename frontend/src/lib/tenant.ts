/**
 * The school (tenant) this browser is signed in to -- MULTI_TENANCY_GAP_FIX_PLAN.md
 * Phase 3 §8 (MIS-A16, S10).
 *
 *  - Browser storage that holds a person's data is keyed by school AND person
 *    (`<base>.t<tid>.u<userId>`): ids repeat across school databases, so an
 *    unkeyed cache could show school A's data to the same device signed in to B.
 *  - When the signed-in identity (tid:userId) changes, everything cached for the
 *    previous one is dropped -- per-person localStorage, sessionStorage and the
 *    service-worker data caches -- before the new person's pages load.
 *  - Sign-in refusals for a school that isn't usable get a plain message.
 */

export type TenantStatus = "PENDING" | "ACTIVE" | "GRACE" | "SUSPENDED" | "ARCHIVED";

export interface TenantInfo {
  tid: number;
  slug: string;
  name: string;
  status: TenantStatus;
  isPrimary: boolean;
  timezone?: string;
  pkg?: string;
}

/** A school offered by the sign-in "choose your school" step. */
export interface SchoolChoice {
  tid: number;
  name: string;
  slug: string;
}

export const PRIMARY_TID = 1;

const IDENTITY_KEY = "nga.identity";

/** `<base>.t<tid>.u<userId>` -- the key for a person's data in one school. */
export function tenantStorageKey(base: string, tid: number, userId: number): string {
  return `${base}.t${tid}.u${userId}`;
}

export const identityOf = (tid: number | null | undefined, userId: number | null | undefined): string | null =>
  tid && userId ? `${tid}:${userId}` : null;

export function readIdentity(): { tid: number; userId: number } | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    const m = raw ? /^(\d+):(\d+)$/.exec(raw) : null;
    return m ? { tid: Number(m[1]), userId: Number(m[2]) } : null;
  } catch {
    return null;
  }
}

/**
 * localStorage keys holding a person's or a school's data (never UI preferences such
 * as the theme, nor the session token, nor the device id). Dropped on a switch.
 */
const PERSONAL_PREFIXES = [
  "nga.user.offlineCache",
  "academic_period_",
  "nga.oh.registerQueue",
  "mentorship_draft_",
  "studio:blueprint:",
  "elearning.offlineWeek.",
  "nga_activity_q_",
  "home.lens",
];

/** Service-worker caches that hold data (the app-shell cache is shared and safe). */
const DATA_CACHE = /(api|data|elearning|offline|user|tenant)/i;

/** Drop everything cached for whoever used this browser before. */
export async function clearIdentityCaches(): Promise<void> {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && PERSONAL_PREFIXES.some((p) => k.startsWith(p))) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* storage unavailable */
  }
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => DATA_CACHE.test(n)).map((n) => caches.delete(n)));
    }
  } catch {
    /* no Cache Storage here */
  }
}

/**
 * Record who is signed in now. When it differs from the last identity this browser
 * saw (another school, or another person), the old one's caches are cleared first.
 * Returns true when a switch happened.
 */
export async function noteIdentity(tid: number | null | undefined, userId: number | null | undefined): Promise<boolean> {
  const next = identityOf(tid, userId);
  if (!next) return false;
  let prev: string | null = null;
  try {
    prev = localStorage.getItem(IDENTITY_KEY);
  } catch {
    prev = null;
  }
  if (prev === next) return false;
  if (prev) await clearIdentityCaches();
  try {
    localStorage.setItem(IDENTITY_KEY, next);
  } catch {
    /* storage unavailable */
  }
  return !!prev;
}

/** Sign-out: forget the identity (the next sign-in starts clean). */
export async function forgetIdentity(): Promise<void> {
  await clearIdentityCaches();
  try {
    localStorage.removeItem(IDENTITY_KEY);
  } catch {
    /* storage unavailable */
  }
}

export type TenantRefusalCode = "TENANT_PENDING" | "TENANT_SUSPENDED" | "TENANT_UNKNOWN" | "TENANT_REQUIRED" | "TENANT_MISMATCH";

export const TENANT_MESSAGES: Record<TenantRefusalCode, string> = {
  TENANT_PENDING: "Your school's application is under review. You can sign in once it has been approved.",
  TENANT_SUSPENDED: "Your school's access is suspended. Please contact your school's administration.",
  TENANT_UNKNOWN: "We couldn't find that school. Check the school and try again.",
  TENANT_REQUIRED: "Please sign in again and choose your school.",
  TENANT_MISMATCH: "This sign-in belongs to another school. Please sign in again.",
};

export const isTenantRefusal = (code: unknown): code is TenantRefusalCode =>
  typeof code === "string" && code in TENANT_MESSAGES;

/** The school the signed-in user belongs to (from /users/me), or NGA. */
export const tenantOf = (user: { tenant?: TenantInfo | null } | null | undefined): TenantInfo | null => user?.tenant ?? null;

/** Where the offline copy of the signed-in person's profile lives (per school + person). */
export const USER_CACHE_BASE = "nga.user.offlineCache";
export function currentUserCacheKey(): string | null {
  const id = readIdentity();
  return id ? tenantStorageKey(USER_CACHE_BASE, id.tid, id.userId) : null;
}
