import React, { useEffect, useRef, useState } from "react";
import { BookMarked, Check, Loader2, Upload, X } from "lucide-react";
import { studioApi } from "../../../api/studio";
import { formatBytes } from "../../../lib/files/fileKinds";

interface Ref {
  asset_id: number;
  name: string;
  status: "uploading" | "reading" | "ready" | "no-text";
  size?: number;
}

/**
 * Files the teacher hands the AI for this run — their own slides, handouts, a textbook chapter
 * (§9.2 step 2). Text is read on the server and cited like any other source; the files are
 * NOT put on the course for students.
 */
const ReferenceFiles: React.FC<{ courseId: number; assetIds: number[]; onChange: (ids: number[]) => void }> = ({ courseId, assetIds, onChange }) => {
  const [refs, setRefs] = useState<Ref[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Restore names/status for ids remembered in the recipe.
  useEffect(() => {
    const known = new Set(refs.map((r) => r.asset_id));
    assetIds.filter((id) => !known.has(id)).forEach((id) => {
      studioApi
        .fileManifest(id)
        .then((r) => setRefs((rs) => (rs.some((x) => x.asset_id === id) ? rs : [...rs, { asset_id: id, name: (r.data.data as any).name, status: r.data.data.variants.text ? "ready" : "reading" }])))
        .catch(() => onChange(assetIds.filter((x) => x !== id)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetIds]);

  // Poll until each file's text has been read.
  useEffect(() => {
    const pending = refs.filter((r) => r.status === "reading");
    if (!pending.length) return;
    const t = setInterval(() => {
      pending.forEach((p) =>
        studioApi.fileManifest(p.asset_id).then((r) => {
          const m = r.data.data;
          if (["PENDING", "PROCESSING"].includes(m.preview_status)) return;
          setRefs((rs) => rs.map((x) => (x.asset_id === p.asset_id ? { ...x, status: m.variants.text ? "ready" : "no-text" } : x)));
        }),
      );
    }, 3000);
    return () => clearInterval(t);
  }, [refs]);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    const temp = files.map((f, i) => ({ asset_id: -Date.now() - i, name: f.name, status: "uploading" as const, size: f.size }));
    setRefs((rs) => [...rs, ...temp]);
    try {
      const r = await studioApi.uploadReferenceFiles(courseId, files);
      const d = r.data.data;
      setRefs((rs) => [
        ...rs.filter((x) => x.asset_id > 0),
        ...(d?.assets ?? []).map((a) => ({ asset_id: a.asset_id, name: a.name, size: a.size, status: (a.preview_status === "NOT_NEEDED" ? "ready" : "reading") as Ref["status"] })),
      ]);
      if (d?.assets?.length) onChange([...assetIds, ...d.assets.map((a) => a.asset_id)]);
      if (d?.rejected?.length) setError(d.rejected.map((x) => `${x.name}: ${x.reason}`).join(" "));
    } catch (e: any) {
      setRefs((rs) => rs.filter((x) => x.asset_id > 0));
      setError(e?.response?.data?.message || "Couldn't upload. Try again.");
    }
  };

  return (
    <div
      className={`el-card p-3 transition-colors ${drag ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : ""}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl el-subtle flex items-center justify-center flex-shrink-0 text-gray-500"><BookMarked className="w-4 h-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Your reference files</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">Slides, handouts or a textbook chapter for the AI to follow. Students don't see them.</p>
        </div>
        <button onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-pill el-chip text-xs font-semibold">
          <Upload className="w-3.5 h-3.5" /> Add
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".pdf,.doc,.docx,.odt,.rtf,.ppt,.pptx,.odp,.xls,.xlsx,.ods,.csv,.txt,.md"
          onChange={(e) => {
            const f = [...(e.target.files ?? [])];
            e.target.value = "";
            void upload(f);
          }}
        />
      </div>
      {refs.length > 0 && (
        <ul className="mt-2 space-y-1 pl-12" aria-live="polite">
          {refs.map((r) => (
            <li key={r.asset_id} className="flex items-center gap-2 text-sm">
              {r.status === "ready" ? <Check className="w-3.5 h-3.5 text-success-700 dark:text-success-500" /> : r.status === "no-text" ? <X className="w-3.5 h-3.5 text-warning-700 dark:text-warning-500" /> : <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600 dark:text-slate-300" />}
              <span className="truncate flex-1 text-gray-800 dark:text-gray-100">{r.name}</span>
              <span className="text-[11px] text-slate-600 dark:text-slate-300">
                {r.status === "uploading" ? `uploading ${formatBytes(r.size)}` : r.status === "reading" ? "reading…" : r.status === "no-text" ? "no readable text (scan?)" : "ready"}
              </span>
              {r.asset_id > 0 && (
                <button aria-label={`Stop using ${r.name}`} onClick={() => { setRefs((rs) => rs.filter((x) => x.asset_id !== r.asset_id)); onChange(assetIds.filter((x) => x !== r.asset_id)); }} className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 pl-12 text-xs text-danger-700 dark:text-danger-500">{error}</p>}
    </div>
  );
};

export default ReferenceFiles;
