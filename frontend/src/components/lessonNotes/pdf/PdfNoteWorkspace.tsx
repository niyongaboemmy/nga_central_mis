import React, { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Lock, RefreshCw, ScanText, ZoomIn, ZoomOut } from "lucide-react";
import { lessonNotesApi, LessonNoteDetail } from "../../../api/lessonNotes";
import { useToast } from "../../../contexts/ToastContext";
import PdfPagesViewer from "./PdfPagesViewer";

interface Props {
  note: LessonNoteDetail;
  /** Called after a successful "Replace PDF" so the page header can refresh page count etc. */
  onReplaced: (patch: Partial<LessonNoteDetail>) => void;
}

export const formatFileSize = (bytes: number | null | undefined): string => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const ZOOM_STEPS = [0.6, 0.8, 1, 1.25, 1.5];
const BASE_PAGE_WIDTH = 794; // A4 at 96dpi — the same sheet width the student reader uses

// The teacher-side stand-in for the rich editor when a note is PDF-backed. It deliberately
// looks like a document preview, not an editor: no toolbar, no caret, a lock badge — the
// only way to change the content is to replace the file.
const PdfNoteWorkspace: React.FC<Props> = ({ note, onReplaced }) => {
  const { showToast } = useToast();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState(2);
  const [numPages, setNumPages] = useState(note.page_count || 0);
  const [visiblePage, setVisiblePage] = useState(1);
  const [replacing, setReplacing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setBlob(null);
    setLoadError(null);
    lessonNotesApi
      // Versioned so the teacher sees a just-replaced file, not the cached previous one.
      .getPdfBlob(note.note_id, note.updated_at)
      .then((res) => {
        if (!cancelled) setBlob(res.data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("The PDF could not be loaded. Try refreshing the page.");
      });
    return () => {
      cancelled = true;
    };
  }, [note.note_id, reloadKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleReplace = async (file: File) => {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      showToast("Only a PDF file can replace this note's PDF", "error");
      return;
    }
    setReplacing(true);
    setProgress(0);
    try {
      const res = await lessonNotesApi.replacePdf(note.note_id, file, setProgress);
      onReplaced({
        file_name: file.name,
        file_size: file.size,
        page_count: res.data.data.page_count,
        updated_at: new Date().toISOString(),
      });
      setReloadKey((k) => k + 1);
      showToast(
        res.data.data.is_textless
          ? "PDF replaced. Note: no text could be read from it, so students' Ask AI won't work on this note."
          : "PDF replaced — students will see the new version.",
        res.data.data.is_textless ? "warning" : "success",
      );
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to replace the PDF", "error");
    } finally {
      setReplacing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isTextless = !note.content_html || note.content_html.replace(/<[^>]*>/g, "").trim().length === 0;
  const zoom = ZOOM_STEPS[zoomIndex];
  // Fit-to-width on narrow screens, otherwise the chosen zoom of an A4 sheet.
  const pageWidth = Math.max(280, Math.min(BASE_PAGE_WIDTH * zoom, containerWidth - 32));

  return (
    <div className="h-full flex flex-col bg-gray-100 dark:bg-gray-900/60">
      {/* Document strip: what this file is, and the one thing you can do to it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 bg-white dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700/50">
        <div className="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
          <FileText className="w-[18px] h-[18px] text-rose-600 dark:text-rose-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{note.file_name || "Lesson note.pdf"}</p>
          <p className="text-[11px] text-gray-400 flex items-center gap-1.5 flex-wrap">
            {numPages > 0 && <span>{numPages} page{numPages === 1 ? "" : "s"}</span>}
            {note.file_size ? <span>· {formatFileSize(note.file_size)}</span> : null}
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              · <Lock className="w-3 h-3" /> Read-only
            </span>
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-full bg-gray-100 dark:bg-gray-700/60">
          <button
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
            title="Zoom out"
            className="p-1.5 rounded-full text-gray-500 hover:bg-white dark:hover:bg-gray-600 disabled:opacity-30"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] tabular-nums text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            title="Zoom in"
            className="p-1.5 rounded-full text-gray-500 hover:bg-white dark:hover:bg-gray-600 disabled:opacity-30"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {numPages > 1 && (
          <span className="text-[11px] tabular-nums text-gray-400 hidden md:inline">
            Page {visiblePage} / {numPages}
          </span>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleReplace(f);
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={replacing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 disabled:opacity-50"
        >
          {replacing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {replacing ? `Uploading ${Math.round(progress * 100)}%` : "Replace PDF"}
        </button>
      </div>

      {isTextless && (
        <div className="flex items-start gap-2 px-4 py-2 text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-b border-amber-100 dark:border-amber-900/40">
          <ScanText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            No text could be read from this PDF (it looks like a scanned document). Students can still read it, but
            "Ask AI" won't be able to answer questions about it. Replace it with a text-based PDF to enable AI help.
          </span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        {loadError ? (
          <div className="text-center text-sm text-gray-500 py-16">{loadError}</div>
        ) : (
          <PdfPagesViewer
            key={reloadKey}
            file={blob}
            pageWidth={pageWidth}
            textLayer={false}
            containerRef={scrollRef}
            onLoaded={setNumPages}
            onVisiblePageChange={setVisiblePage}
          />
        )}
      </div>
    </div>
  );
};

export default PdfNoteWorkspace;
