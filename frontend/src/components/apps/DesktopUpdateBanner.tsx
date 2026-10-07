import React, { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { API_BASE_URL } from "../../services/api";
import { isNewer } from "./desktopDownload";

/**
 * Inside an outdated NGA Desktop, on every MIS page: "Version X is ready, Update now".
 *
 * Desktop apps before 0.16 install updates only when someone clicks the
 * title-bar pill, which nobody does on shared lab PCs (seven stayed on 0.8.0).
 * Every desktop since 0.2.3 lets MIS pages ask it to install its own signed
 * update (bridge.js `ngaDesktop.installUpdate()`), so this reaches them all.
 * "Later" hides it for a day. Not on /apps, which has its own update card.
 */
interface Bridge {
  version: string;
  installUpdate: () => Promise<void>;
}
const bridge = (): Bridge | null => {
  const b = (window as unknown as { ngaDesktop?: Bridge }).ngaDesktop;
  return b && typeof b.installUpdate === "function" && typeof b.version === "string" ? b : null;
};

export const SNOOZE_KEY = "nga.desktopUpdate.snoozedUntil";
const DAY_MS = 24 * 60 * 60_000;

const snoozed = () => {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
};

const DesktopUpdateBanner: React.FC = () => {
  const [latest, setLatest] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "updating" | "failed" | "hidden">("idle");
  const [error, setError] = useState("");
  const b = bridge();

  useEffect(() => {
    if (!b || snoozed()) return;
    let off = false;
    fetch(`${API_BASE_URL.replace(/\/+$/, "")}/desktop/release`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const v = j?.data?.version;
        if (!off && typeof v === "string" && isNewer(v, b.version)) setLatest(v);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!b || !latest || state === "hidden" || window.location.pathname.startsWith("/apps")) return null;

  const later = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + DAY_MS));
    } catch {
      /* private mode: hide for this page only */
    }
    setState("hidden");
  };
  const update = async () => {
    setState("updating");
    try {
      await b.installUpdate(); // NGA restarts by itself when done
    } catch (e) {
      const msg = String(e);
      setState("failed");
      setError(msg.includes("busy") ? msg.replace(/^.*busy:\s*/, "") + "." : "It didn't install. Try again, or use the Update button at the top of NGA.");
    }
  };

  return (
    <div
      role="status"
      data-testid="desktop-update-banner"
      className="fixed inset-x-4 top-3 z-[1100] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-brand-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-brand-500/30 dark:bg-slate-800"
    >
      <RefreshCw className={`h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-500${state === "updating" ? " animate-spin" : ""}`} aria-hidden />
      <p className="flex-1 text-slate-800 dark:text-slate-100">
        {state === "updating" ? (
          "Updating NGA… it restarts by itself."
        ) : state === "failed" ? (
          <span className="text-red-700 dark:text-red-300">{error}</span>
        ) : (
          <>
            NGA Desktop <strong>{latest}</strong> is ready (you have {b.version}).
          </>
        )}
      </p>
      {state !== "updating" && (
        <>
          <button
            type="button"
            onClick={update}
            className="rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            {state === "failed" ? "Try again" : "Update now"}
          </button>
          <button
            type="button"
            onClick={later}
            aria-label="Later"
            title="Remind me tomorrow"
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
};

export default DesktopUpdateBanner;
