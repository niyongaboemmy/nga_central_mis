/**
 * One person, several schools (TENANT_SWITCHING_PLAN.md §4.3–4.4, Appendix A).
 *
 *  - mySchools() / switchSchool(): the MIS endpoints.
 *  - The selected school is the MIS session's; the readable `nga_school` cookie
 *    ("<tid>.<sid>") tells every NGA app which one it is.
 *  - After a switch: store the new token, tell the other MIS tabs
 *    (BroadcastChannel "nga-school"), then reload -- UserContext.noteIdentity drops
 *    the old school's cached data before the new school's pages load.
 *  - The sign-in picker can remember a person's school on this device.
 */
import api from "../services/api";
import { setToken } from "../utils/auth";
import { SCHOOL_CHOICE_KEY } from "./tenant";

export interface MySchool {
  tid: number;
  slug: string;
  name: string;
  logoUrl: string | null;
  status: string;
  current: boolean;
  /** Only for the current school: the server never reveals another school's roles (MIS-ISO-5). */
  roles?: string[];
}

export type SwitchErrorCode =
  | "PASSWORD_REQUIRED"
  | "WRONG_PASSWORD"
  | "TOO_MANY_ATTEMPTS"
  | "NOT_IN_SCHOOL"
  | "SAME_SCHOOL"
  | "TENANT_UNKNOWN"
  | "TENANT_SUSPENDED"
  | "TENANT_PENDING"
  | "BLOCKED";

export class SwitchError extends Error {
  constructor(
    readonly code: SwitchErrorCode | "UNKNOWN",
    message: string,
  ) {
    super(message);
  }
}

let cache: { at: number; schools: MySchool[] } | null = null;
const TTL = 60_000;

export async function mySchools(force = false): Promise<MySchool[]> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.schools;
  const res = await api.get("/auth/my-schools");
  const schools: MySchool[] = res.data?.data?.schools ?? [];
  cache = { at: Date.now(), schools };
  return schools;
}

export const forgetMySchools = () => {
  cache = null;
};

/** Switch this session; on success the new token is stored (the caller reloads). */
export async function switchSchool(tenant: string | number, password?: string): Promise<{ tid: number; name: string }> {
  try {
    const res = await api.post("/auth/switch-school", password ? { tenant, password } : { tenant });
    const data = res.data?.data;
    if (!data?.token) throw new SwitchError("UNKNOWN", "The switch did not complete. Please try again.");
    setToken(data.token);
    forgetMySchools();
    announceSchoolChange(data.tenant?.tid);
    return { tid: data.tenant?.tid, name: data.tenant?.name };
  } catch (err: any) {
    if (err instanceof SwitchError) throw err;
    const code = err?.response?.data?.code;
    throw new SwitchError(code ?? "UNKNOWN", err?.response?.data?.message ?? "Could not switch school. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// The cross-app signal
// ---------------------------------------------------------------------------

export const SCHOOL_COOKIE = "nga_school";

export function readSchoolCookie(cookie: string = typeof document === "undefined" ? "" : document.cookie): { tid: number; sid: string } | null {
  const m = new RegExp(`(?:^|;\\s*)${SCHOOL_COOKIE}=([^;]+)`).exec(cookie);
  if (!m) return null;
  const v = /^(\d{1,9})\.([A-Za-z0-9_-]{8,32})$/.exec(decodeURIComponent(m[1]));
  return v ? { tid: Number(v[1]), sid: v[2] } : null;
}

const CHANNEL = "nga-school";

export function announceSchoolChange(tid: number | undefined): void {
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ type: "school-changed", tid });
    bc.close();
  } catch {
    /* old browsers: the storage event on "token" still reaches other tabs */
  }
}

/**
 * Another tab, app or the desktop switched school: reload into it. Watches the
 * BroadcastChannel, the token in localStorage, and the nga_school cookie on focus.
 * Returns the cleanup.
 */
export function watchSchoolChanges(currentTid: () => number | null, onChange: () => void = () => window.location.reload()): () => void {
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    onChange();
  };
  const check = () => {
    const tid = currentTid();
    const cookie = readSchoolCookie();
    if (tid && cookie && cookie.tid !== tid) fire();
  };
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (e) => {
      if (e.data?.type === "school-changed" && e.data.tid && e.data.tid !== currentTid()) fire();
    };
  } catch {
    bc = null;
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === "token" && e.newValue && e.oldValue && e.newValue !== e.oldValue) {
      try {
        const tid = JSON.parse(atob(e.newValue.split(".")[1]))?.tid;
        if (tid && tid !== currentTid()) fire();
      } catch {
        /* not a JWT */
      }
    }
  };
  const onVisible = () => document.visibilityState === "visible" && check();
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    done = true;
    bc?.close();
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

// ---------------------------------------------------------------------------
// The sign-in picker's memory ("Remember on this device")
// ---------------------------------------------------------------------------

const REMEMBER_KEY = SCHOOL_CHOICE_KEY;
/**
 * The identifier is stored hashed (WEB-ISO-9): a shared device must not list the
 * e-mails that signed in on it. Synchronous (the sign-in form reads it while typing),
 * so a 53-bit cyrb53 hash -- not a secret, just not the e-mail itself. Cleared on
 * sign-out (forgetIdentity).
 */
export function hashIdentifier(identifier: string): string {
  const str = `nga.schoolChoice:${identifier.trim().toLowerCase()}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `h:${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}
const idKey = hashIdentifier;

export function rememberedSchool(identifier: string): string | null {
  try {
    const map = JSON.parse(localStorage.getItem(REMEMBER_KEY) || "{}");
    return typeof map[idKey(identifier)] === "string" ? map[idKey(identifier)] : null;
  } catch {
    return null;
  }
}

export function rememberSchool(identifier: string, slug: string | null): void {
  try {
    const map = JSON.parse(localStorage.getItem(REMEMBER_KEY) || "{}");
    // Entries written before hashing held the e-mail itself: drop them.
    for (const k of Object.keys(map)) if (!k.startsWith("h:")) delete map[k];
    if (slug) map[idKey(identifier)] = slug;
    else delete map[idKey(identifier)];
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(map));
  } catch {
    /* private mode: nothing remembered */
  }
}

/** A `return` URL the switch page may send the browser to (A.4). */
export function safeReturnUrl(raw: string | null, here: Location = window.location): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, here.origin);
    if (u.origin === here.origin) return u.toString();
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if ((u.protocol === "https:" && (u.hostname === "amashuri.com" || u.hostname.endsWith(".amashuri.com"))) || (local && /^(localhost|127\.0\.0\.1)$/.test(here.hostname))) {
      return u.toString();
    }
  } catch {
    /* not a URL */
  }
  return null;
}
