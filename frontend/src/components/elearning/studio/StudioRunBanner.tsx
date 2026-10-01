import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Hourglass, Loader2, Play, RotateCcw, Server } from "lucide-react";
import { studioApi, studioRoutes } from "../../../api/studio";
import { useToast } from "../../../contexts/ToastContext";
import { ProgressBar } from "../ui/primitives";
import { BannerTone, runBanner, RunBanner } from "./studioModel";

/**
 * AI drafting status on the course page. Runs live on the server, so a teacher who started
 * one and left sees here how far it got, when a quota pause or a failing part carries on by
 * itself, and can resume or re-run failed parts without opening the Studio. Polls while a
 * run is active (every 20 s, and when the tab comes back into view).
 */

const TONE: Record<BannerTone, { icon: React.ElementType; cls: string; spin?: boolean }> = {
  working: { icon: Loader2, cls: "text-brand-600 dark:text-brand-200", spin: true },
  waiting: { icon: Hourglass, cls: "text-warning-700 dark:text-warning-500" },
  attention: { icon: AlertTriangle, cls: "text-danger-700 dark:text-danger-500" },
  review: { icon: CheckCircle2, cls: "text-success-700 dark:text-success-500" },
};

const ACTION_LABEL: Record<RunBanner["action"], string> = { open: "Open", resume: "Resume", "retry-failed": "Re-run failed", review: "Review" };

const StudioRunBanner: React.FC<{ courseId: number; refreshKey?: unknown; className?: string }> = ({ courseId, refreshKey, className = "" }) => {
  const navigate = useNavigate();
  const [banner, setBanner] = useState<RunBanner | null>(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    try {
      const r = await studioApi.runs(courseId);
      setBanner(runBanner(r.data.data));
    } catch {
      setBanner(null); // no access to the Studio, or the server is busy: say nothing
    }
  }, [courseId]);

  // refreshKey: the course page bumps it after edits (an approval changes "N drafts to review").
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const live = banner?.tone === "working" || banner?.tone === "waiting";
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 20_000);
    const onShow = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [live, load]);

  if (!banner) return null;
  const T = TONE[banner.tone];
  const open = () => navigate(studioRoutes.studio(courseId, banner.run_id ? { run: banner.run_id } : {}));

  const act = async () => {
    if (banner.action === "open" || banner.action === "review" || !banner.run_id) return open();
    setBusy(true);
    try {
      await studioApi.control(banner.run_id, banner.action);
      showToast(banner.action === "resume" ? "Resumed — it carries on on the server" : "Re-running the failed parts on the server", "success");
      await load();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Could not update the run", "error");
    } finally {
      setBusy(false);
    }
  };
  const ActIcon = banner.action === "resume" ? Play : banner.action === "retry-failed" ? RotateCcw : ArrowRight;

  return (
    <section aria-label="AI drafting status" aria-live="polite" className={`el-card p-3 sm:p-4 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <T.icon className={`w-5 h-5 flex-shrink-0 ${T.cls} ${T.spin ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{banner.title}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
            {(banner.tone === "working" || banner.tone === "waiting") && <Server className="w-3 h-3 flex-shrink-0" aria-hidden />}
            <span>{banner.detail}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {banner.action !== "open" && banner.run_id && (
            <button onClick={open} className="min-h-[40px] px-3 rounded-pill el-chip text-sm font-medium">
              Details
            </button>
          )}
          <button disabled={busy} onClick={act} className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-pill bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ActIcon className="w-4 h-4" />}
            {ACTION_LABEL[banner.action]}
          </button>
        </div>
      </div>
      {banner.progress !== null && <ProgressBar value={banner.progress} className="mt-3" ariaLabel="AI drafting progress" />}
    </section>
  );
};

export default StudioRunBanner;
