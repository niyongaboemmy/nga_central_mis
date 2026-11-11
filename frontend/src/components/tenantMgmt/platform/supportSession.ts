import { useEffect, useState } from "react";
import { getToken, removeToken, setToken } from "../../../utils/auth";

/**
 * A support session (§6.9) in this browser: the school-scoped token is stored
 * as the MIS session token (localStorage "token", like a normal sign-in), and
 * this record remembers when it ends and the platform token it replaced, so
 * "End" can put the platform session back.
 */
export const SUPPORT_SESSION_KEY = "nga.support.session";
const CHANGED = "nga:support-session";

export interface SupportSessionInfo {
  tid: number;
  expiresAt: string;
  mode: "READ" | "WRITE" | null;
  schoolName: string | null;
  /** the support token, to tell whether it is still the active session */
  token: string;
  prevToken: string | null;
}

export function readSupportSession(): SupportSessionInfo | null {
  try {
    const raw = localStorage.getItem(SUPPORT_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SupportSessionInfo;
    // signed in some other way since: no longer a support session
    if (getToken() !== s.token) return null;
    return s;
  } catch {
    return null;
  }
}

export function beginSupportSession(token: string, tid: number, expiresAt: string, extra: { mode?: string | null; schoolName?: string | null } = {}) {
  const current = getToken();
  const previous = readSupportSession();
  const info: SupportSessionInfo = {
    tid,
    expiresAt,
    mode: extra.mode === "READ" || extra.mode === "WRITE" ? extra.mode : null,
    schoolName: extra.schoolName ?? null,
    token,
    // opening a second support session keeps the original platform token
    prevToken: previous ? previous.prevToken : current,
  };
  setToken(token);
  try {
    localStorage.setItem(SUPPORT_SESSION_KEY, JSON.stringify(info));
  } catch {
    /* private mode: the session still works, the chip just cannot show */
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Ends the support session here; returns where to go next. */
export function endSupportSession(): string {
  const s = readSupportSession();
  try {
    localStorage.removeItem(SUPPORT_SESSION_KEY);
  } catch {
    /* ignore */
  }
  if (s?.prevToken) setToken(s.prevToken);
  else removeToken();
  window.dispatchEvent(new Event(CHANGED));
  return s?.prevToken ? "/platform/support" : "/login";
}

/** Parses `#token=…&tid=…&exp=…` (plus optional mode / school). */
export function parseSupportHash(hash: string): { token: string; tid: number; expiresAt: string; mode: string | null; schoolName: string | null } | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const token = p.get("token");
  const tid = Number(p.get("tid"));
  const exp = p.get("exp");
  if (!token || !Number.isFinite(tid) || tid <= 0 || !exp || Number.isNaN(new Date(exp).getTime())) return null;
  return { token, tid, expiresAt: exp, mode: p.get("mode"), schoolName: p.get("school") };
}

export const supportSessionUrl = (s: { token: string; tid: number; expiresAt: string }, extra: { mode?: string; schoolName?: string } = {}) => {
  const base = `/support-session#token=${encodeURIComponent(s.token)}&tid=${s.tid}&exp=${encodeURIComponent(s.expiresAt)}`;
  return base + (extra.mode ? `&mode=${extra.mode}` : "") + (extra.schoolName ? `&school=${encodeURIComponent(extra.schoolName)}` : "");
};

/** The active support session, re-read on changes (any tab) and every second for the countdown. */
export function useSupportSession(): { session: SupportSessionInfo | null; secondsLeft: number } {
  const [session, setSession] = useState<SupportSessionInfo | null>(() => readSupportSession());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const sync = () => setSession(readSupportSession());
    window.addEventListener(CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, [session]);
  const secondsLeft = session ? Math.max(0, Math.round((new Date(session.expiresAt).getTime() - now) / 1000)) : 0;
  return { session, secondsLeft };
}

export const fmtLeft = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(s).padStart(2, "0")}`;
};
