import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
// @ts-expect-error — katex ships no type declarations for this subpath
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FileStack,
  Highlighter,
  Lightbulb,
  List,
  Loader2,
  Maximize2,
  Minimize2,
  Printer,
  ScrollText,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { lessonNotesApi, CombinedNoteSection } from "../../api/lessonNotes";
import { useToast } from "../../contexts/ToastContext";
import { attachImageTokenToHtml } from "../../utils/lessonNoteImages";
import { useReaderPrefs } from "./reader/useReaderPrefs";
import { useNoteFind } from "./reader/useNoteFind";
import ReaderSettingsMenu from "./reader/ReaderSettingsMenu";
import FindBar from "./reader/FindBar";
import {
  A4_WIDTH,
  A4_HEIGHT,
  bookFlowStyle,
  countPages,
  pageOfElement,
  sheetScale,
} from "./reader/pagination";
import NoteAIPanel, { AskMode, AskRequest } from "./reader/NoteAIPanel";

interface Props {
  mode: "mine" | "shared";
}

const SELECTION_ACTIONS: { mode: AskMode; label: string; question: string }[] = [
  { mode: "explain", label: "Explain", question: "Explain this passage to me." },
  { mode: "simplify", label: "Simplify", question: "Say this in the simplest words possible." },
  { mode: "example", label: "Example", question: "Give me an example of this." },
  { mode: "define", label: "Define", question: "Define the key terms in this passage." },
];

const sectionDomId = (noteId: number) => `combined-note-${noteId}`;

const CombinedLessonNotesPage: React.FC<Props> = ({ mode }) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { prefs, update } = useReaderPrefs();

  const [notes, setNotes] = useState<CombinedNoteSection[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const [tocOpen, setTocOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");

  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScale] = useState(1);
  const [progress, setProgress] = useState(0);

  const [selectionText, setSelectionText] = useState("");
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [askRequest, setAskRequest] = useState<AskRequest | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const askCounter = useRef(0);
  /** Which page each note starts on, rebuilt on every re-measure of the paginated flow. */
  const sectionPages = useRef<Map<number, number>>(new Map());

  const bookMode = prefs.mode === "book";
  const backPath = mode === "mine" ? "/lesson-notes" : "/shared-lesson-notes";
  // The study assistant answers from a note a student is allowed to read, so it only makes
  // sense on the student's combined view — a teacher already has "Ask AI to revise" in the editor.
  const aiAvailable = mode === "shared";

  const activeNote = useMemo(
    () => notes?.find((n) => n.note_id === activeId) || null,
    [notes, activeId],
  );

  // ---------------------------------------------------------------- load

  useEffect(() => {
    const load = mode === "mine" ? lessonNotesApi.getCombined() : lessonNotesApi.getSharedCombined();
    load
      .then((res) => {
        setNotes(res.data.data);
        if (res.data.data.length > 0) setActiveId(res.data.data[0].note_id);
      })
      .catch(() => showToast("Failed to load combined notes", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Live-render any $...$ math in the raw saved HTML — same reasoning as the single shared
  // note view: this is dangerouslySetInnerHTML, not a Tiptap instance, so nothing renders
  // the formulas unless we run KaTeX's auto-render pass over the mounted DOM ourselves.
  useLayoutEffect(() => {
    if (!notes || !contentRef.current) return;
    renderMathInElement(contentRef.current, {
      delimiters: [{ left: "$", right: "$", display: false }],
      throwOnError: false,
    });
  }, [notes, prefs.mode]);

  // ---------------------------------------------------------------- A4 scaling + pagination

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setScale(bookMode ? sheetScale(stage.clientWidth) : 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [bookMode, aiOpen]);

  const measurePages = useCallback(() => {
    if (!bookMode) return;
    const pages = countPages(flowRef.current);
    setTotalPages(pages);
    setPage((p) => Math.min(p, pages - 1));

    // Cache where each note begins so the contents rail can jump to it and the active
    // entry can be derived from the current page without touching the DOM again.
    const map = new Map<number, number>();
    (notes || []).forEach((n) => {
      const el = document.getElementById(sectionDomId(n.note_id));
      if (el) map.set(n.note_id, pageOfElement(el, flowRef.current));
    });
    sectionPages.current = map;
  }, [bookMode, notes]);

  useEffect(() => {
    if (!notes || !bookMode) return;
    measurePages();
    // Images and KaTeX settle after first paint and change the column count, so re-measure
    // once everything that can shift the flow has actually loaded.
    const timer = setTimeout(measurePages, 300);
    const images = Array.from(contentRef.current?.querySelectorAll("img") || []);
    images.forEach((img) => img.addEventListener("load", measurePages));
    window.addEventListener("resize", measurePages);
    return () => {
      clearTimeout(timer);
      images.forEach((img) => img.removeEventListener("load", measurePages));
      window.removeEventListener("resize", measurePages);
    };
  }, [notes, bookMode, prefs.fontScale, prefs.lineHeight, prefs.font, measurePages]);

  // In book mode the active note is whichever one started on or before the current page.
  useEffect(() => {
    if (!bookMode || sectionPages.current.size === 0) return;
    let current: number | null = null;
    for (const [noteId, startPage] of sectionPages.current) {
      if (startPage <= page) current = noteId;
    }
    if (current !== null) setActiveId(current);
  }, [bookMode, page, totalPages]);

  // ---------------------------------------------------------------- progress

  useEffect(() => {
    if (bookMode) {
      setProgress(totalPages > 1 ? page / (totalPages - 1) : 1);
      return;
    }
    const onScroll = () => {
      const content = contentRef.current;
      if (!content) return;
      const rect = content.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      if (scrollable <= 0) {
        setProgress(1);
        return;
      }
      setProgress(Math.min(1, Math.max(0, -rect.top / scrollable)));
    };
    onScroll();
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [bookMode, page, totalPages, notes]);

  // Scrollspy: highlight whichever note section is currently most visible, so the contents
  // rail always reflects where the reader actually is.
  useEffect(() => {
    if (!notes || bookMode) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const id = Number((visible[0].target as HTMLElement).dataset.noteId);
          if (!Number.isNaN(id)) setActiveId(id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    notes.forEach((n) => {
      const el = document.getElementById(sectionDomId(n.note_id));
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [notes, bookMode]);

  const scrollToNote = useCallback(
    (noteId: number) => {
      setActiveId(noteId);
      if (bookMode) {
        setPage(sectionPages.current.get(noteId) ?? 0);
      } else {
        document.getElementById(sectionDomId(noteId))?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [bookMode],
  );

  // ---------------------------------------------------------------- find

  const revealHit = useCallback(
    (hit: HTMLElement) => {
      if (bookMode) setPage(pageOfElement(hit, flowRef.current));
      else hit.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [bookMode],
  );

  const find = useNoteFind({
    containerRef: contentRef,
    enabled: findOpen,
    query: findQuery,
    onReveal: revealHit,
    onMarksChanged: measurePages,
    contentKey: `${notes?.length ?? 0}-${prefs.mode}`,
  });

  // ---------------------------------------------------------------- selection -> AI

  useEffect(() => {
    if (!aiAvailable) return;
    const onSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || "";
      if (!text || text.length < 3 || !selection || selection.rangeCount === 0) {
        setSelectionText("");
        setSelectionRect(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!contentRef.current?.contains(range.commonAncestorContainer)) {
        setSelectionText("");
        setSelectionRect(null);
        return;
      }
      // Attribute the selection to the note it came from, so the question is answered
      // against the right note rather than whichever one the rail last highlighted.
      const section = (
        range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? (range.commonAncestorContainer as HTMLElement)
          : range.commonAncestorContainer.parentElement
      )?.closest("[data-note-id]") as HTMLElement | null;
      const sectionNoteId = Number(section?.dataset.noteId);
      if (!Number.isNaN(sectionNoteId)) setActiveId(sectionNoteId);

      setSelectionText(text.slice(0, 4000));
      setSelectionRect(range.getBoundingClientRect());
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [aiAvailable]);

  const ask = useCallback((question: string, selection?: string, askMode?: AskMode) => {
    askCounter.current += 1;
    setAskRequest({ id: askCounter.current, question, selection, mode: askMode });
    setAiOpen(true);
    setSelectionText("");
    setSelectionRect(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  // ---------------------------------------------------------------- keyboard

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
        setTimeout(() => findInputRef.current?.focus(), 40);
        return;
      }
      if (e.key === "Escape") {
        if (findOpen) setFindOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (focusMode) setFocusMode(false);
        return;
      }
      if (typing) return;
      if (bookMode && (e.key === "ArrowRight" || e.key === "PageDown")) {
        e.preventDefault();
        setPage((p) => Math.min(p + 1, totalPages - 1));
      } else if (bookMode && (e.key === "ArrowLeft" || e.key === "PageUp")) {
        e.preventDefault();
        setPage((p) => Math.max(p - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bookMode, totalPages, findOpen, settingsOpen, focusMode]);

  // ---------------------------------------------------------------- export

  const handleExport = async () => {
    setExporting(true);
    try {
      const res =
        mode === "mine"
          ? await lessonNotesApi.exportCombinedPdf()
          : await lessonNotesApi.exportSharedCombinedPdf();
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "combined-lesson-notes.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      let message = "Failed to export combined PDF";
      const errData = err?.response?.data;
      if (errData instanceof Blob) {
        try {
          message = JSON.parse(await errData.text())?.message || message;
        } catch {
          // keep fallback
        }
      } else if (errData?.message) {
        message = errData.message;
      }
      showToast(message, "error");
    } finally {
      setExporting(false);
    }
  };

  const groupedBySubject = useMemo(() => {
    if (!notes) return [];
    const groups = new Map<string, CombinedNoteSection[]>();
    for (const n of notes) {
      if (!groups.has(n.subject_name)) groups.set(n.subject_name, []);
      groups.get(n.subject_name)!.push(n);
    }
    return [...groups.entries()];
  }, [notes]);

  // ---------------------------------------------------------------- render helpers

  const renderSectionHeader = (n: CombinedNoteSection, index: number) => {
    return (
      <header className="note-reader-titleblock">
        <span className="note-reader-eyebrow">
          {n.subject_name}
          {n.class_group_name ? ` · ${n.class_group_name}` : ""}
        </span>
        <h1>{n.title}</h1>
        <p>
          {n.teacher_name ? `Prepared by ${n.teacher_name} · ` : ""}
          {String(index + 1).padStart(2, "0")} of {String(notes?.length || 0).padStart(2, "0")}
        </p>
      </header>
    );
  };

  const renderBody = (n: CombinedNoteSection) => (
    <div
      className={`lesson-note-preview note-reader-body ${
        prefs.font === "serif" ? "note-reader-body--serif" : "note-reader-body--sans"
      }`}
      style={
        {
          "--reader-font-scale": prefs.fontScale,
          "--reader-line-height": prefs.lineHeight,
        } as React.CSSProperties
      }
      dangerouslySetInnerHTML={{ __html: attachImageTokenToHtml(n.content_html) }}
    />
  );

  return (
    <div
      className={`note-reader note-reader--${prefs.paper} ${aiOpen ? "lg:pr-[420px]" : ""} transition-[padding] duration-300`}
    >
      <div className="fixed top-16 left-0 right-0 h-0.5 z-30 print:hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-violet-500 transition-[width] duration-150"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* Toolbar */}
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
                onClick={() => navigate(backPath)}
                className="flex items-center gap-1 px-2 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{mode === "mine" ? "Notes" : "Library"}</span>
              </button>

              <div className="min-w-0 flex-1 hidden md:block">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate leading-tight flex items-center gap-1.5">
                  <FileStack className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  Combined Lesson Notes
                </p>
                <p className="text-[11px] text-gray-400 truncate">
                  {notes ? `${notes.length} note${notes.length === 1 ? "" : "s"}` : "Loading"}
                  {activeNote ? ` · ${activeNote.title}` : ""}
                  {bookMode ? ` · page ${page + 1} of ${totalPages}` : ` · ${Math.round(progress * 100)}% read`}
                </p>
              </div>

              <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                {notes && notes.length > 1 && (
                  <button
                    onClick={() => setTocOpen((o) => !o)}
                    title="Contents"
                    className={`p-2 rounded-lg transition-colors ${
                      tocOpen
                        ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                        : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => {
                    setFindOpen(true);
                    setTimeout(() => findInputRef.current?.focus(), 40);
                  }}
                  title="Find across all notes (Ctrl+F)"
                  className="p-2 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <Search className="w-4 h-4" />
                </button>

                <div className="flex items-center p-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                  {([
                    { key: "scroll" as const, Icon: ScrollText, label: "Scroll" },
                    { key: "book" as const, Icon: BookOpen, label: "Book" },
                  ]).map(({ key, Icon, label }) => (
                    <button
                      key={key}
                      onClick={() => update("mode", key)}
                      title={`${label} view`}
                      className={`p-1.5 rounded-full transition-colors ${
                        prefs.mode === key
                          ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                          : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>

                <ReaderSettingsMenu
                  prefs={prefs}
                  update={update}
                  open={settingsOpen}
                  setOpen={setSettingsOpen}
                />

                <button
                  onClick={() => window.print()}
                  title="Print / save as A4 PDF"
                  className="hidden sm:block p-2 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setFocusMode(true)}
                  title="Focus mode"
                  className="hidden sm:block p-2 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>

                <button
                  onClick={handleExport}
                  disabled={exporting || !notes || notes.length === 0}
                  title="Download the whole set as one PDF"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800/60 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span className="hidden lg:inline">{exporting ? "Preparing..." : "PDF"}</span>
                </button>

                {aiAvailable && (
                  <button
                    onClick={() => setAiOpen((o) => !o)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium shadow-sm transition-opacity ${
                      aiOpen
                        ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                        : "bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:opacity-90"
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="hidden sm:inline">Ask AI</span>
                  </button>
                )}
              </div>
            </div>

            <AnimatePresence>
              {findOpen && (
                <FindBar
                  inputRef={findInputRef}
                  query={findQuery}
                  setQuery={setFindQuery}
                  count={find.count}
                  index={find.index}
                  tooShort={find.tooShort}
                  step={find.step}
                  onClose={() => setFindOpen(false)}
                  placeholder="Find across all your notes..."
                  onAskAI={
                    aiAvailable
                      ? () => ask(`What does this note say about "${findQuery.trim()}"?`)
                      : undefined
                  }
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {focusMode && (
        <button
          onClick={() => setFocusMode(false)}
          title="Exit focus mode (Esc)"
          className="fixed top-20 right-4 z-30 p-2.5 rounded-full bg-gray-900/80 dark:bg-gray-100/80 text-white dark:text-gray-900 backdrop-blur shadow-lg print:hidden"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      )}

      {notes === null ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-xs">Gathering your notes...</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="max-w-3xl mx-auto px-4 py-16">
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-gray-200 dark:border-gray-700/50">
            <FileStack className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              {mode === "mine" ? "You have no published notes yet." : "No notes have been shared with you yet."}
            </p>
          </div>
        </div>
      ) : (
        <div className="max-w-[1400px] mx-auto px-3 sm:px-5 py-6 flex gap-6 items-start">
          {/* Contents rail */}
          <AnimatePresence>
            {tocOpen && notes.length > 1 && (
              <motion.nav
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                className="hidden lg:block sticky top-32 w-60 flex-shrink-0 max-h-[calc(100vh-10rem)] overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/40 p-3 print:hidden"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-2 mb-2">
                  {notes.length} note{notes.length === 1 ? "" : "s"}
                </p>
                {groupedBySubject.map(([subject, subjectNotes]) => {
                  return (
                    <div key={subject} className="mb-3 last:mb-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 px-2 mb-1 truncate">
                        {subject}
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {subjectNotes.map((n) => (
                          <button
                            key={n.note_id}
                            onClick={() => scrollToNote(n.note_id)}
                            className={`group flex items-center gap-1.5 text-left px-2 py-1.5 rounded-lg text-[13px] transition-colors ${
                              activeId === n.note_id
                                ? "bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 font-medium"
                                : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                            }`}
                          >
                            <ChevronRight
                              className={`w-3 h-3 flex-shrink-0 transition-transform ${
                                activeId === n.note_id ? "rotate-90 text-gray-500" : "text-gray-300"
                              }`}
                            />
                            <span className="truncate">{n.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </motion.nav>
            )}
          </AnimatePresence>

          <div ref={stageRef} className="flex-1 min-w-0 flex flex-col items-center">
            {bookMode ? (
              /* One continuous paginated flow; each note starts on a fresh page. */
              <div
                className="note-reader-sheet note-reader-sheet--book"
                style={{
                  width: A4_WIDTH,
                  height: A4_HEIGHT,
                  transform: `scale(${scale})`,
                  transformOrigin: "top center",
                  marginBottom: (scale - 1) * A4_HEIGHT,
                }}
              >
                <div className="note-reader-window">
                  <div ref={flowRef} className="note-reader-flow" style={bookFlowStyle(page)}>
                    <div ref={contentRef}>
                      {notes.map((n, i) => (
                        <section
                          key={n.note_id}
                          id={sectionDomId(n.note_id)}
                          data-note-id={n.note_id}
                          className={i > 0 ? "note-reader-section-break" : ""}
                        >
                          {renderSectionHeader(n, i)}
                          {renderBody(n)}
                        </section>
                      ))}
                    </div>
                  </div>
                </div>
                <footer className="note-reader-pagefoot">
                  <span className="truncate">{activeNote?.subject_name || "Combined notes"}</span>
                  <span className="tabular-nums flex-shrink-0">
                    {page + 1} / {totalPages}
                  </span>
                </footer>
              </div>
            ) : (
              /* One A4 sheet per note, stacked. */
              <div ref={contentRef} className="w-full flex flex-col items-center gap-8">
                {notes.map((n, i) => (
                  <section
                    key={n.note_id}
                    id={sectionDomId(n.note_id)}
                    data-note-id={n.note_id}
                    className="note-reader-sheet note-reader-sheet--scroll scroll-mt-32"
                    style={{ width: "100%", maxWidth: A4_WIDTH }}
                  >
                    {renderSectionHeader(n, i)}
                    {renderBody(n)}
                  </section>
                ))}
              </div>
            )}

            {bookMode && (
              <div className="flex items-center gap-3 mt-5 print:hidden">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 px-4 py-2.5 rounded-full border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/60 text-sm text-gray-600 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, totalPages - 1)}
                  value={page}
                  onChange={(e) => setPage(Number(e.target.value))}
                  aria-label="Jump to page"
                  className="note-reader-scrubber w-32 sm:w-56"
                />
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="flex items-center gap-1 px-4 py-2.5 rounded-full border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/60 text-sm text-gray-600 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <p className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-5 text-center print:hidden">
              <Highlighter className="w-3 h-3" />
              {aiAvailable ? "Highlight any sentence to explain it with AI" : "Every published note, in one place"}
              {bookMode && <span className="hidden sm:inline">· use ← → to turn pages</span>}
            </p>
          </div>
        </div>
      )}

      {/* Selection toolbar */}
      <AnimatePresence>
        {aiAvailable && selectionText && selectionRect && !aiOpen && (
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
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-blue-600 to-violet-600 text-white"
            >
              <Lightbulb className="w-3 h-3" /> Ask
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {focusMode && aiAvailable && (
        <button
          onClick={() => setAiOpen(true)}
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-xl print:hidden"
        >
          <Sparkles className="w-4 h-4" /> Ask AI
        </button>
      )}

      {aiAvailable && activeNote && (
        /* Keyed on the note so switching sections starts a conversation about that note
           rather than carrying another note's context into it. */
        <NoteAIPanel
          key={activeNote.note_id}
          noteId={activeNote.note_id}
          noteTitle={activeNote.title}
          subjectName={activeNote.subject_name}
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          request={askRequest}
        />
      )}

      {/* The contents rail is desktop-only; on small screens the drawer takes over. */}
      <AnimatePresence>
        {tocOpen && notes && notes.length > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setTocOpen(false)}
            className="fixed inset-0 bg-black/30 z-40 lg:hidden print:hidden"
          >
            <motion.nav
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-16 left-0 bottom-0 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700/60 shadow-2xl overflow-y-auto p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Contents</p>
                <button onClick={() => setTocOpen(false)} className="p-1.5 rounded-lg text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {notes.map((n) => (
                <button
                  key={n.note_id}
                  onClick={() => {
                    scrollToNote(n.note_id);
                    setTocOpen(false);
                  }}
                  className={`block w-full text-left px-2 py-2 rounded-lg text-[13px] leading-snug ${
                    activeId === n.note_id
                      ? "bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {n.title}
                  <span className="block text-[11px] text-gray-400">{n.subject_name}</span>
                </button>
              ))}
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CombinedLessonNotesPage;
