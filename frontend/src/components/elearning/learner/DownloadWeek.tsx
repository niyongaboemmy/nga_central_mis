import React, { useEffect, useState } from "react";
import { CheckCircle2, CloudDownload, Loader2 } from "lucide-react";
import { apiService } from "../../../services/api";
import { formatBytes } from "../../../lib/files/fileKinds";

/**
 * "Save this week for offline" (Lesson Studio §11). Fetches every URL the week needs once,
 * flagged X-Prefetch so the server doesn't count it as opening anything; the e-learning
 * service worker keeps the responses, so the lessons, checks and file previews open later
 * with no signal. The size is shown first — data costs money.
 */

const KEY = (sectionId: number) => `elearning.offlineWeek.${sectionId}`;
const savedAt = (sectionId: number): number | null => {
  try {
    const v = localStorage.getItem(KEY(sectionId));
    return v ? Number(v) : null;
  } catch {
    return null;
  }
};

interface Manifest {
  course: { url: string; bytes: number };
  items: { item_id: number; title: string; urls: { url: string; bytes: number }[]; skipped?: string }[];
  total_bytes: number;
}

const DownloadWeek: React.FC<{ sectionId: number }> = ({ sectionId }) => {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(() => savedAt(sectionId));
  const [error, setError] = useState<string | null>(null);
  const supported = typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;

  useEffect(() => {
    setSaved(savedAt(sectionId));
    setManifest(null);
    if (!supported) return;
    apiService.get<any>(`/elearning/my/sections/${sectionId}/offline-manifest`).then((r) => setManifest(r.data.data), () => setManifest(null));
  }, [sectionId, supported]);

  if (!supported || !manifest || manifest.items.length === 0) return null;

  const download = async () => {
    setError(null);
    const urls = [manifest.course, ...manifest.items.flatMap((i) => i.urls)];
    const total = urls.reduce((n, u) => n + u.bytes, 0) || 1;
    let done = 0;
    setPct(0);
    try {
      for (const u of urls) {
        await apiService.get(u.url, { headers: { "X-Prefetch": "1" }, responseType: u.url.includes("/file") || u.url.includes("/pdf/raw") ? "blob" : "json", timeout: 120_000 });
        done += u.bytes;
        setPct(Math.min(99, Math.round((done / total) * 100)));
      }
      const now = Date.now();
      try {
        localStorage.setItem(KEY(sectionId), String(now));
      } catch {
        /* the files are cached anyway */
      }
      setSaved(now);
    } catch {
      setError("The download stopped — check your connection and try again.");
    } finally {
      setPct(null);
    }
  };

  const skipped = manifest.items.filter((i) => i.skipped).length;
  return (
    <div className="mt-4 el-card p-3 flex flex-wrap items-center gap-3" aria-live="polite">
      {saved && pct === null ? (
        <CheckCircle2 className="w-5 h-5 text-success-700 dark:text-success-500 flex-shrink-0" />
      ) : (
        <CloudDownload className="w-5 h-5 text-brand-600 dark:text-brand-200 flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {pct !== null ? `Saving… ${pct}%` : saved ? "Saved for offline" : "Save this week for offline"}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {saved && pct === null ? `Saved ${new Date(saved).toLocaleDateString()} · ` : ""}
          About {formatBytes(manifest.total_bytes)}
          {skipped ? ` · ${skipped} big file${skipped > 1 ? "s" : ""} stay online-only` : ""}
        </p>
        {error && <p className="text-xs text-danger-700 dark:text-danger-500">{error}</p>}
      </div>
      <button onClick={download} disabled={pct !== null} className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-pill el-chip text-sm font-semibold disabled:opacity-50">
        {pct !== null ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {saved ? "Update" : "Save"}
      </button>
    </div>
  );
};

export default DownloadWeek;
