import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, Loader2, Presentation, RefreshCw, File as FileIcon, FileCode } from "lucide-react";
import { detectFileKind, FileKind, formatBytes, KIND_LABEL } from "../../lib/files/fileKinds";
import { networkHints, planPreview, PreviewManifest } from "../../lib/files/previewPlan";
import { SheetTable } from "./renderers/SheetRenderer";

const PdfPagesViewer = lazy(() => import("../lessonNotes/pdf/PdfPagesViewer"));
const DocxRenderer = lazy(() => import("./renderers/DocxRenderer"));
const SheetRenderer = lazy(() => import("./renderers/SheetRenderer"));

export type { PreviewManifest };

const KIND_ICON: Record<FileKind, React.ElementType> = {
  pdf: FileText,
  word: FileText,
  slides: Presentation,
  sheet: FileSpreadsheet,
  csv: FileSpreadsheet,
  image: FileImage,
  audio: FileAudio,
  text: FileText,
  markdown: FileText,
  code: FileCode,
  archive: FileArchive,
  other: FileIcon,
};

export interface FilePreviewProps {
  manifest: PreviewManifest;
  /** Fetches a stored variant as a Blob (an authenticated request). */
  loadVariant: (variant: "original" | "pdf" | "text") => Promise<Blob>;
  /** A streaming URL for audio (Range-aware; the session rides as ?token=). */
  mediaUrl?: string;
  /** Re-reads the manifest while the server is still preparing the preview. */
  refreshManifest?: () => Promise<PreviewManifest>;
  onDownload: () => void;
  /** Called once the preview is on screen (e.g. to record the item as viewed). */
  onShown?: () => void;
  compact?: boolean;
}

const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
};

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < 500; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
};

/**
 * Shows any supported file inside the page (§10.6): PDFs and the server's PDF of office files
 * via pdf.js, .docx and spreadsheets in the browser while that PDF is prepared, slide text as
 * an outline, images, streamed audio, text/code and CSV as a table — and a download card for
 * the rest. Every renderer is lazy-loaded so the course page stays light on a phone.
 */
const FilePreview: React.FC<FilePreviewProps> = ({ manifest: initial, loadVariant, mediaUrl, refreshManifest, onDownload, onShown, compact }) => {
  const [manifest, setManifest] = useState(initial);
  useEffect(() => setManifest(initial), [initial]);
  const plan = useMemo(() => planPreview(manifest, networkHints()), [manifest]);
  const [confirmed, setConfirmed] = useState(!plan.needsConfirm);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [hostRef, width] = useWidth();
  const kind = detectFileKind({ name: manifest.name });
  const Icon = KIND_ICON[kind];
  const onErr = useCallback((m: string) => setError(m), []);

  // While the server prepares a better preview, check back every few seconds (≤ 2 min).
  useEffect(() => {
    if (!plan.upgrading || !refreshManifest) return;
    let tries = 0;
    const t = setInterval(async () => {
      tries += 1;
      try {
        const next = await refreshManifest();
        if (next.preview_status !== manifest.preview_status || next.variants.pdf !== manifest.variants.pdf) setManifest(next);
      } catch {
        /* keep the current view */
      }
      if (tries >= 40) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [plan.upgrading, refreshManifest, manifest.preview_status, manifest.variants.pdf]);

  // Fetch what the chosen strategy needs.
  useEffect(() => {
    if (!confirmed || plan.strategy === "download-only" || plan.strategy === "audio") return;
    let off = false;
    setError(null);
    setBlob(null);
    setText(null);
    loadVariant(plan.variant)
      .then(async (b) => {
        if (off) return;
        if (plan.strategy === "text" || plan.strategy === "csv" || plan.strategy === "slides-outline") setText(await b.text());
        else setBlob(b);
      })
      .catch(() => !off && setError("This file couldn't be loaded. Try the download button."));
    return () => {
      off = true;
    };
  }, [confirmed, plan.strategy, plan.variant, loadVariant]);

  const shownOnce = useRef(false);
  useEffect(() => {
    if (shownOnce.current) return;
    if (blob || text || plan.strategy === "audio") {
      shownOnce.current = true;
      onShown?.();
    }
  }, [blob, text, plan.strategy, onShown]);

  const imageUrl = useMemo(() => (plan.strategy === "image" && blob ? URL.createObjectURL(blob) : null), [plan.strategy, blob]);
  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const meta = [KIND_LABEL[kind], formatBytes(manifest.size), (pages ?? manifest.page_count) ? `${pages ?? manifest.page_count} ${kind === "slides" ? "slide" : "page"}${(pages ?? manifest.page_count) === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
  const loading = <div className="flex items-center justify-center h-[40vh] text-slate-600 dark:text-slate-300" aria-busy="true"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  let body: React.ReactNode = null;
  if (!confirmed) {
    body = (
      <div className="p-6 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">Your connection looks slow. This preview is {formatBytes(manifest.size)}.</p>
        <button onClick={() => setConfirmed(true)} className="mt-3 min-h-[44px] px-4 rounded-pill bg-brand-600 text-white text-sm font-semibold">Load the preview</button>
      </div>
    );
  } else if (error) {
    body = <p className="p-6 text-sm text-slate-600 dark:text-slate-300">{error}</p>;
  } else if (plan.strategy === "pdf" || plan.strategy === "pdf-derivative") {
    body = blob ? (
      <Suspense fallback={loading}>
        <div tabIndex={0} role="region" aria-label={`${manifest.name} preview`} className="max-h-[75vh] overflow-y-auto bg-gray-100 dark:bg-gray-950 p-2 sm:p-4 focus:outline-none focus-visible:shadow-glow">
          <PdfPagesViewer file={blob} pageWidth={Math.max(240, Math.min(900, width - 32))} onLoaded={setPages} textLayer={false} onError={onErr} />
        </div>
      </Suspense>
    ) : loading;
  } else if (plan.strategy === "docx-client") {
    body = blob ? <Suspense fallback={loading}><DocxRenderer blob={blob} onError={onErr} /></Suspense> : loading;
  } else if (plan.strategy === "sheet-client") {
    body = blob ? <div className="p-3"><Suspense fallback={loading}><SheetRenderer blob={blob} onError={onErr} /></Suspense></div> : loading;
  } else if (plan.strategy === "image") {
    body = imageUrl ? (
      <div className="bg-gray-50 dark:bg-gray-950 flex justify-center p-2">
        <img src={imageUrl} alt={manifest.name} className="max-h-[75vh] max-w-full object-contain" />
      </div>
    ) : loading;
  } else if (plan.strategy === "audio") {
    body = mediaUrl ? (
      <div className="p-4">
        <audio controls preload="none" src={mediaUrl} className="w-full" aria-label={manifest.name} />
      </div>
    ) : null;
  } else if (plan.strategy === "text") {
    body = text !== null ? (
      <pre tabIndex={0} aria-label={`${manifest.name} contents`} className="max-h-[70vh] overflow-auto focus:outline-none focus-visible:shadow-glow p-4 text-xs leading-relaxed whitespace-pre-wrap break-words font-mono text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-white/[0.03]">{text.slice(0, 200_000)}</pre>
    ) : loading;
  } else if (plan.strategy === "csv") {
    body = text !== null ? <div className="p-3"><SheetTable rows={parseCsv(text)} /></div> : loading;
  } else if (plan.strategy === "slides-outline") {
    body = text !== null ? (
      <ol tabIndex={0} aria-label="Slides" className="max-h-[70vh] overflow-auto p-4 space-y-3 focus:outline-none focus-visible:shadow-glow">
        {text.split(/\n\n(?=Slide \d+\n)/).map((block, i) => {
          const [, ...lines] = block.split("\n");
          return (
            <li key={i} className="el-subtle rounded-xl p-3">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300">Slide {i + 1}</p>
              {lines.map((l, j) => (
                <p key={j} className={l.startsWith("Speaker notes:") ? "mt-1 text-xs italic text-slate-600 dark:text-slate-300" : "text-sm text-gray-800 dark:text-gray-100"}>{l}</p>
              ))}
            </li>
          );
        })}
      </ol>
    ) : loading;
  } else {
    body = (
      <div className="p-6 flex items-center gap-3">
        <Icon className="w-8 h-8 text-slate-600 dark:text-slate-300" />
        <p className="text-sm text-slate-600 dark:text-slate-300">{plan.note || "This file can't be shown here — download it to open it."}</p>
      </div>
    );
  }

  return (
    <div className="el-card overflow-hidden" ref={hostRef}>
      <div className={`flex items-center gap-3 ${compact ? "p-3" : "p-4"} border-b border-gray-100 dark:border-white/[0.06]`}>
        <span className="w-10 h-10 rounded-xl el-subtle flex items-center justify-center flex-shrink-0"><Icon className="w-5 h-5 text-brand-600 dark:text-brand-200" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{manifest.name}</p>
          <p className="text-[11px] text-slate-600 dark:text-slate-300">{meta}</p>
        </div>
        <button onClick={onDownload} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 sm:px-4 rounded-pill el-chip text-sm font-medium" aria-label={`Download ${manifest.name}`}>
          <Download className="w-4 h-4" /> <span className="hidden sm:inline">Download</span>
        </button>
      </div>
      {body}
      {(plan.note || plan.upgrading) && plan.strategy !== "download-only" && (
        <p className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300 border-t border-gray-100 dark:border-white/[0.06] flex items-center gap-1.5">
          {plan.upgrading && <RefreshCw className="w-3 h-3 animate-spin motion-reduce:animate-none" aria-hidden />}
          {plan.upgrading && !plan.note ? "A sharper preview is being prepared…" : plan.note}
        </p>
      )}
    </div>
  );
};

export default FilePreview;
