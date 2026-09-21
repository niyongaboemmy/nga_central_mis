import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Highlighter,
  Lightbulb,
  Loader2,
  Maximize2,
  Minimize2,
  ScanText,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { lessonNotesApi, SharedNoteDetail } from "../../../api/lessonNotes";
import { useReaderPrefs, ReaderPaper } from "../reader/useReaderPrefs";
import NoteAIPanel, { AskMode, AskRequest } from "../reader/NoteAIPanel";
import PdfPagesViewer from "./PdfPagesViewer";

interface Props {
  note: SharedNoteDetail;
}

// Same four quick actions as the HTML reader's highlight toolbar, so a student who has
// learned one reader already knows the other.
const SELECTION_ACTIONS: { mode: AskMode; label: string; question: string }[] = [
  { mode: "explain", label: "Explain", question: "Explain this passage to me." },
  { mode: "simplify", label: "Simplify", question: "Say this in the simplest words possible." },
  { mode: "example", label: "Example", question: "Give me an example of this." },
  { mode: "define", label: "Define", question: "Define the key terms in this passage." },
];

const PAPERS: { key: ReaderPaper; label: string; swatch: string }[] = [
  { key: "paper", label: "Paper", swatch: "bg-white border-gray-300" },
  { key: "sepia", label: "Sepia", swatch: "bg-[#f4ecd8] border-amber-300" },
  { key: "night", label: "Night", swatch: "bg-gray-900 border-gray-600" },
];

const A4_WIDTH = 794;
const ZOOM_STEPS = [0.7, 0.85, 1, 1.2, 1.4];

/** The student reader for a PDF-backed note. Pages are rendered by pdf.js with a real
 *  text layer, which is what makes "highlight a sentence → Ask AI" work on a PDF exactly
 *  the way it does on a typed note. Everything around the pages (toolbar, progress bar,
 *  highlight toolbar, AI panel) deliberately mirrors SharedLessonNoteViewPage. */
const SharedPdfNoteReader: React.FC<Props> = ({ note }) => {
  const navigate = useNavigate();
  const { prefs, update } = useReaderPrefs();

  const [blob, setBlob] = useState<Blob | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(note.page_count || 0);
  const [visiblePage, setVisiblePage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(2);
  const [stageWidth, setStageWidth] = useState(0);
  const [focusMode, setFocusMode] = useState(false);

  const [selectionText, setSelectionText] = useState("");
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [askRequest, setAskRequest] = useState<AskRequest | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const askCounter = useRef(0);

  const isTextless = !note.content_html || note.content_html.replace(/<[^>]*>/g, "").trim().length === 0;

  // ---------------------------------------------------------------- load the file

  useEffect(() => {
    let cancelled = false;
    lessonNotesApi
      .getPdfBlob(note.note_id)
      .then((res) => {
        if (!cancelled) setBlob(res.data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("This PDF couldn't be loaded. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [note.note_id]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setStageWidth(stage.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [aiOpen]);

  // ---------------------------------------------------------------- selection -> AI

  useEffect(() => {
    const onSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection?.toString().replace(/\s+/g, " ").trim() || "";
      if (!text || text.length < 3 || !selection || selection.rangeCount === 0) {
        setSelectionText("");
        setSelectionRect(null);
        return;
      }
      const range = selection.getRangeAt(0);
      // Only text inside the pages gets the AI toolbar — not chrome, not the AI panel.
      if (!contentRef.current?.contains(range.commonAncestorContainer)) {
        setSelectionText("");
        setSelectionRect(null);
        return;
      }
      setSelectionText(text.slice(0, 4000));
      setSelectionRect(range.getBoundingClientRect());
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const ask = useCallback((question: string, selection?: string, mode?: AskMode) => {
    askCounter.current += 1;
    setAskRequest({ id: askCounter.current, question, selection, mode });
    setAiOpen(true);
    setSelectionText("");
    setSelectionRect(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  // ---------------------------------------------------------------- navigation

  const goToPage = useCallback((page: number) => {
    const el = contentRef.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "Escape" && focusMode) {
        setFocusMode(false);
        return;
      }
      if (typing) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goToPage(Math.min(numPages, visiblePage + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToPage(Math.max(1, visiblePage - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode, goToPage, numPages, visiblePage]);

  const download = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = note.file_name || `${note.title}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const zoom = ZOOM_STEPS[zoomIndex];
  const pageWidth = Math.max(300, Math.min(A4_WIDTH * zoom, stageWidth - 8));
  const progress = numPages > 1 ? (visiblePage - 1) / (numPages - 1) : blob ? 1 : 0;

  return (
    <div
      className={`note-reader note-reader--${prefs.paper} ${focusMode ? "note-reader--focus" : ""} ${
        aiOpen ? "lg:pr-[420px]" : ""
      } transition-[padding] duration-300`}
    >
      {/* Reading progress — page-based here, since a PDF has real pages. */}
      <div className="fixed top-16 left-0 right-0 h-0.5 z-30 bg-transparent print:hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-[width] duration-150"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      <AnimatePresence>
        {!focusMode && (
          <motion.div
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            className="sticky top-16 z-20 bg-gray-50/85 dark:bg-gray-900/85 backdrop-blur-md border-b border-gray-200/70 dark:border-gray-700/40 print:hidden"
          >
            <div className="max-w-[1400px] mx-auto px-3 sm:px-5 py-2 flex items-center gap-2">
              <button
                onClick={() => navigate("/shared-lesson-notes")}
                className="flex items-center gap-1 px-2 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Library</span>
              </button>

              <div className="min-w-0 flex-1 hidden md:block">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate leading-tight flex items-center gap-1.5">
                  {note.title}
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                    <FileText className="w-2.5 h-2.5" /> PDF
                  </span>
                </p>
                <p className="text-[11px] text-gray-400 truncate">
                  {note.subject_name}
                  {numPages > 0 ? ` · page ${visiblePage} of ${numPages}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                {/* Zoom */}
                <div className="hidden sm:flex items-center p-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                  <button
                    onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
                    disabled={zoomIndex === 0}
                    title="Zoom out"
                    className="p-1.5 rounded-full text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-30"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] tabular-nums text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <button
                    onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
                    disabled={zoomIndex === ZOOM_STEPS.length - 1}
                    title="Zoom in"
                    className="p-1.5 rounded-full text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-30"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>

                {/* Paper theme — the one reading preference that still applies to a PDF. */}
                <div className="hidden sm:flex items-center gap-1 px-1.5">
                  {PAPERS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => update("paper", p.key)}
                      title={`${p.label} background`}
                      aria-pressed={prefs.paper === p.key}
                      className={`w-5 h-5 rounded-full border-2 ${p.swatch} ${
                        prefs.paper === p.key ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900" : "opacity-70 hover:opacity-100"
                      }`}
                    />
                  ))}
                </div>

                <button
                  onClick={download}
                  disabled={!blob}
                  title="Download PDF"
                  className="hidden sm:block p-2 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setFocusMode(true)}
                  title="Focus mode"
                  className="hidden sm:block p-2 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setAiOpen((o) => !o)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium shadow-sm transition-opacity ${
                    aiOpen
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:opacity-90"
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden sm:inline">Ask AI</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {focusMode && (
        <button
          onClick={() => setFocusMode(false)}
          title="Exit focus mode (Esc)"
          className="fixed top-20 right-4 z-30 p-2.5 rounded-full bg-blue-600/90 text-white backdrop-blur shadow-lg print:hidden"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      )}

      <div className="max-w-[1400px] mx-auto px-3 sm:px-5 py-6">
        {isTextless && (
          <div className="max-w-[794px] mx-auto mb-4 flex items-start gap-2 px-4 py-2.5 rounded-xl text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-100 dark:border-amber-900/40 print:hidden">
            <ScanText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              This PDF is a scanned document, so its text can't be selected and the AI can't read it. You can still
              read and download it.
            </span>
          </div>
        )}

        <div ref={stageRef} className="flex flex-col items-center">
          <div ref={contentRef} className="w-full flex flex-col items-center">
            {loadError ? (
              <div className="flex flex-col items-center gap-2 py-16 text-sm text-gray-500">
                <FileText className="w-8 h-8 text-gray-300" />
                {loadError}
              </div>
            ) : !blob ? (
              <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-xs">Opening your note...</p>
              </div>
            ) : (
              <PdfPagesViewer
                file={blob}
                pageWidth={pageWidth}
                textLayer
                onLoaded={setNumPages}
                onVisiblePageChange={setVisiblePage}
              />
            )}
          </div>

          {numPages > 1 && (
            <div className="sticky bottom-4 mt-6 flex items-center gap-2 px-2 py-1.5 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur border border-gray-200 dark:border-gray-700/60 shadow-lg print:hidden">
              <button
                onClick={() => goToPage(Math.max(1, visiblePage - 1))}
                disabled={visiblePage <= 1}
                className="p-1.5 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                title="Previous page (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs tabular-nums text-gray-600 dark:text-gray-300 px-1">
                {visiblePage} / {numPages}
              </span>
              <button
                onClick={() => goToPage(Math.min(numPages, visiblePage + 1))}
                disabled={visiblePage >= numPages}
                className="p-1.5 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                title="Next page (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {!isTextless && (
            <p className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-5 text-center print:hidden">
              <Highlighter className="w-3 h-3" />
              Highlight any sentence to explain it with AI
              {numPages > 1 && <span className="hidden sm:inline">· use ← → to move between pages</span>}
            </p>
          )}
        </div>
      </div>

      {/* Highlight toolbar */}
      <AnimatePresence>
        {selectionText && selectionRect && !aiOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="fixed z-50 flex items-center gap-0.5 p-1 rounded-full bg-gray-900 dark:bg-gray-800 shadow-2xl ring-1 ring-white/10 print:hidden"
            style={{
              top: Math.max(72, selectionRect.top - 52),
              left: Math.min(
                Math.max(8, selectionRect.left + selectionRect.width / 2 - 170),
                window.innerWidth - 348,
              ),
            }}
          >
            {SELECTION_ACTIONS.map((a) => (
              <button
                key={a.mode}
                onClick={() => ask(a.question, selectionText, a.mode)}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-200 hover:bg-white/10 transition-colors"
              >
                {a.label}
              </button>
            ))}
            <span className="w-px h-4 bg-white/15 mx-0.5" />
            <button
              onClick={() => {
                askCounter.current += 1;
                setAskRequest({ id: askCounter.current, question: "", selection: selectionText });
                setAiOpen(true);
                setSelectionText("");
                setSelectionRect(null);
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-blue-500 to-blue-600 text-white"
            >
              <Lightbulb className="w-3 h-3" /> Ask
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {focusMode && (
        <button
          onClick={() => setAiOpen(true)}
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-xl print:hidden"
        >
          <Sparkles className="w-4 h-4" /> Ask AI
        </button>
      )}

      <NoteAIPanel
        noteId={note.note_id}
        noteTitle={note.title}
        subjectName={note.subject_name}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        request={askRequest}
      />
    </div>
  );
};

export default SharedPdfNoteReader;
