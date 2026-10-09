import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import api from "../../services/api";
import { useUser } from "../../contexts/UserContext";

/**
 * Transparency notice (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §13.3).
 *  - Public visitors: a slim, non-blocking bar on every page until dismissed (cookie on
 *    .amashuri.com, so dismissing it in one NGA app dismisses it in all of them).
 *  - Signed-in users: shown once per account; the acknowledgement is recorded.
 */
const COOKIE = "nga_notice_seen";
const VERSION = "2026-10-01";

const hasCookie = () => {
  try {
    return document.cookie.split("; ").some((c) => c === `${COOKIE}=${VERSION}`);
  } catch {
    return false;
  }
};
const setCookie = () => {
  try {
    const d = /(^|\.)amashuri\.com$/.test(location.hostname) ? "; Domain=.amashuri.com" : "";
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE}=${VERSION}; Path=/; Max-Age=31536000; SameSite=Lax${d}${secure}`;
  } catch {
    /* ignore */
  }
};
const ackKey = (id: number) => `nga.activityNotice.${VERSION}.${id}`;

/** Fired when a signed-in user dismisses the notice, so other bottom prompts can follow it. */
export const ACTIVITY_NOTICE_ACK_EVENT = "nga:activity-notice-ack";

/** Has this account already acknowledged the current notice on this device? */
export const activityNoticeAcknowledged = (userId: number): boolean => {
  try {
    return localStorage.getItem(ackKey(userId)) === "1";
  } catch {
    return true; // storage blocked: the notice can't track it either, so don't hold anyone up
  }
};

export default function ActivityNotice() {
  const { user, isAuthenticated, isLoading } = useUser();
  const userId: number | null = user?.user?.user_id ?? null;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && userId) {
      let seen = false;
      try {
        seen = localStorage.getItem(ackKey(userId)) === "1";
      } catch {
        /* ignore */
      }
      setShow(!seen);
    } else setShow(!hasCookie());
  }, [isAuthenticated, isLoading, userId]);

  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    setCookie();
    if (isAuthenticated && userId) {
      try {
        localStorage.setItem(ackKey(userId), "1");
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event(ACTIVITY_NOTICE_ACK_EVENT));
      void api.post("/monitor/me/notice-ack", { version: VERSION }).catch(() => undefined);
    }
  };
  return (
    <div role="region" aria-label="How this site records activity" className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-border-light dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-lg backdrop-blur px-4 py-3 flex items-start gap-3 text-sm text-text-primary-light dark:text-text-primary-dark">
        <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
        <p className="flex-1">
          {isAuthenticated
            ? "NGA records how its apps are used (pages, time, device, IP address and approximate place) for security and to improve them. You can see your own record, and whether anyone is monitoring you, under "
            : "This site records visits, including your IP address and approximate location, for security and service quality. "}
          {isAuthenticated && <a href="/me/activity" className="underline">My activity</a>}
          {isAuthenticated ? ". " : ""}
          <a href="/privacy/#activity" className="underline">Privacy notice</a>
        </p>
        <button onClick={dismiss} className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium border border-border-light dark:border-slate-700 hover:bg-surface-light dark:hover:bg-slate-800 inline-flex items-center gap-1">
          <X className="w-3.5 h-3.5" aria-hidden /> Got it
        </button>
      </div>
    </div>
  );
}
