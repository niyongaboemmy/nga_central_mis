import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * "A new version is available" for tabs left open across a deploy.
 *
 * A single-page app keeps running the bundle it loaded, so a tab opened before
 * a release goes on showing the old screens (and old bugs) until someone
 * reloads. This compares the entry script named by the live index.html with
 * the one this page booted from -- on focus and every 5 minutes -- and offers
 * a reload when they differ. Production builds only.
 */
const ENTRY_RE = /\/assets\/index-[\w-]+\.js/;
const INTERVAL_MS = 5 * 60_000;

export const currentEntry = () =>
  Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'))
    .map((s) => s.src.match(ENTRY_RE)?.[0])
    .find(Boolean) ?? null;

export const liveEntry = async (): Promise<string | null> => {
  const res = await fetch(`/?v=${Date.now()}`, { cache: "no-store", headers: { Accept: "text/html" } });
  if (!res.ok) return null;
  return (await res.text()).match(ENTRY_RE)?.[0] ?? null;
};

const UpdateBanner: React.FC<{ enabled?: boolean }> = ({ enabled = import.meta.env.PROD }) => {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const mine = currentEntry();
    if (!enabled || !mine) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const live = await liveEntry();
        if (live && live !== mine) setStale(true);
      } catch {
        /* offline: try again later */
      } finally {
        busy = false;
      }
    };
    const t = window.setInterval(check, INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    void check();
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [enabled]);

  if (!stale) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-[1100] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-blue-500/30 dark:bg-slate-800"
    >
      <RefreshCw className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
      <p className="flex-1 text-slate-800 dark:text-slate-100">A new version of NGA MIS is available.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        Reload
      </button>
    </div>
  );
};

export default UpdateBanner;
