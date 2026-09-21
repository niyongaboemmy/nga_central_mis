import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
// @ts-expect-error — katex ships no type declarations for this subpath
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
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
import { lessonNotesApi, SharedNoteDetail, isPdfBackedNote } from "../../api/lessonNotes";
import { useToast } from "../../contexts/ToastContext";
import { attachImageTokenToHtml } from "../../utils/lessonNoteImages";
import { useReaderPrefs, readingPositionKey } from "./reader/useReaderPrefs";
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
import SharedPdfNoteReader from "./pdf/SharedPdfNoteReader";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

const SELECTION_ACTIONS: { mode: AskMode; label: string; question: string }[] = [
  { mode: "explain", label: "Explain", question: "Explain this passage to me." },
  { mode: "simplify", label: "Simplify", question: "Say this in the simplest words possible." },
  { mode: "example", label: "Example", question: "Give me an example of this." },
  { mode: "define", label: "Define", question: "Define the key terms in this passage." },
];

const SharedLessonNoteViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { prefs, update } = useReaderPrefs();

  const [note, setNote] = useState<SharedNoteDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const askCounter = useRef(0);

  const bookMode = prefs.mode === "book";

  // ---------------------------------------------------------------- load

  useEffect(() => {
    lessonNotesApi
      .getShared(Number(id))
      .then((res) => setNote(res.data.data))
      .catch(() => {
        setNotFound(true);
        showToast("This lesson note is not available", "error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // The teacher's editor renders $...$ as live KaTeX via a decoration plugin, but this page
  // renders raw saved HTML (no Tiptap instance) — without this pass, a student would just
  // see the literal "$E=mc^2$" text instead of a rendered formula. Heading ids are assigned
  // in the same pass so the table of contents can target them.
  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!note || !root) return;

    renderMathInElement(root, {
      delimiters: [{ left: "$", right: "$", display: false }],
      throwOnError: false,
    });

    const headings = Array.from(root.querySelectorAll("h1, h2, h3")) as HTMLElement[];
    const items: TocItem[] = headings.map((h, i) => {
      const slug = `note-section-${i}`;
      h.id = slug;
      return { id: slug, text: h.textContent?.trim() || `Section ${i + 1}`, level: Number(h.tagName[1]) };
    });
    setToc(items);
  }, [note]);

  // ---------------------------------------------------------------- A4 scaling

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setScale(bookMode ? sheetScale(stage.clientWidth) : 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [bookMode, aiOpen]);

  // ---------------------------------------------------------------- pagination

  const measurePages = useCallback(() => {
    if (!bookMode) return;
    const pages = countPages(flowRef.current);
    setTotalPages(pages);
    setPage((p) => Math.min(p, pages - 1));
  }, [bookMode]);

  useEffect(() => {
    if (!note || !bookMode) return;
    measurePages();
    // Images and KaTeX settle after first paint and change the column count, so re-measure
    // once everything that can shift the flow has actually loaded.
    const timer = setTimeout(measurePages, 250);
    const images = Array.from(contentRef.current?.querySelectorAll("img") || []);
    images.forEach((img) => img.addEventListener("load", measurePages));
    window.addEventListener("resize", measurePages);
    return () => {
      clearTimeout(timer);
      images.forEach((img) => img.removeEventListener("load", measurePages));
      window.removeEventListener("resize", measurePages);
    };
  }, [note, bookMode, prefs.fontScale, prefs.lineHeight, prefs.font, measurePages]);

  // ---------------------------------------------------------------- progress + resume

  useEffect(() => {
    if (bookMode) {
      setProgress(totalPages > 1 ? page / (totalPages - 1) : 1);
      return;
    }
    const onScroll = () => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      const rect = sheet.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      if (scrollable <= 0) {
        setProgress(1);
        return;
      }
      setProgress(Math.min(1, Math.max(0, -rect.top / scrollable)));
    };
    onScroll();
    // Capture phase: the app shell may scroll an inner element whose scroll events
    // wouldn't otherwise reach window.
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [bookMode, page, totalPages, note]);

  // Resume where the student left off, and remember where they are now.
  useEffect(() => {
    if (!note || !bookMode || totalPages <= 1) return;
    const saved = Number(sessionStorage.getItem(readingPositionKey(note.note_id)));
    if (saved > 0 && saved < totalPages) setPage(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, bookMode, totalPages]);

  useEffect(() => {
    if (!note || !bookMode) return;
    try {
      sessionStorage.setItem(readingPositionKey(note.note_id), String(page));
    } catch {
      // Position memory is a nicety — never break reading over it.
    }
  }, [note, bookMode, page]);

  // ---------------------------------------------------------------- scrollspy (scroll mode)

  useEffect(() => {
    if (!note || bookMode || toc.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveHeading(visible[0].target.id);
      },
      { rootMargin: "-10% 0px -75% 0px", threshold: 0 },
    );
    toc.forEach((t) => {
      const el = document.getElementById(t.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [note, bookMode, toc]);

  const jumpToHeading = useCallback(
    (headingId: string) => {
      const el = document.getElementById(headingId);
      if (!el) return;
      setActiveHeading(headingId);
      if (bookMode) {
        setPage(pageOfElement(el, flowRef.current));
      } else {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      setTocOpen(false);
    },
    [bookMode],
  );

  // ---------------------------------------------------------------- find in note

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
    contentKey: note?.note_id,
  });

  // ---------------------------------------------------------------- selection -> AI

  useEffect(() => {
    const onSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || "";
      if (!text || text.length < 3 || !selection || selection.rangeCount === 0) {
        setSelectionText("");
        setSelectionRect(null);
        return;
      }
      const range = selection.getRangeAt(0);
      // Only text inside the note body gets the AI toolbar — not chrome, not the AI panel.
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
        else if (tocOpen) setTocOpen(false);
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
  }, [bookMode, totalPages, findOpen, tocOpen, settingsOpen, focusMode]);

  // ---------------------------------------------------------------- render

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BookOpen className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400">This lesson note isn't available to you.</p>
        <button
          onClick={() => navigate("/shared-lesson-notes")}
          className="mt-4 px-4 py-2 text-sm font-medium rounded-full bg-blue-600 hover:bg-blue-700 text-white"
        >
          Back to my library
        </button>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-xs">Opening your note...</p>
      </div>
    );
  }

  // A PDF-backed note has real pages of its own — pdf.js renders them (with a selectable
  // text layer, so highlight-to-ask still works) instead of the HTML sheet below.
  if (isPdfBackedNote(note)) {
    return <SharedPdfNoteReader note={note} />;
  }

  const flowStyle: React.CSSProperties = bookMode ? bookFlowStyle(page) : {};

  return (
    <div
      className={`note-reader note-reader--${prefs.paper} ${focusMode ? "note-reader--focus" : ""} ${
        aiOpen ? "lg:pr-[420px]" : ""
      } transition-[padding] duration-300`}
    >
      {/* Reading progress — the one always-visible signal of how far in you are. */}
      <div className="fixed top-16 left-0 right-0 h-0.5 z-30 bg-transparent print:hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-[width] duration-150"
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
                onClick={() => navigate("/shared-lesson-notes")}
                className="flex items-center gap-1 px-2 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Library</span>
              </button>

              <div className="min-w-0 flex-1 hidden md:block">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate leading-tight">
                  {note.title}
                </p>
                <p className="text-[11px] text-gray-400 truncate">
                  {note.subject_name}
                  {bookMode ? ` · page ${page + 1} of ${totalPages}` : ` · ${Math.round(progress * 100)}% read`}
                </p>
              </div>

              <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                {toc.length > 1 && (
                  <button
                    onClick={() => setTocOpen((o) => !o)}
                    title="Contents"
                    className={`p-2 rounded-lg transition-colors ${
                      tocOpen
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
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
                  title="Find in note (Ctrl+F)"
                  className="p-2 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <Search className="w-4 h-4" />
                </button>

                {/* Scroll / book toggle */}
                <div className="flex items-center p-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                  {([
                    { mode: "scroll" as const, Icon: ScrollText, label: "Scroll" },
                    { mode: "book" as const, Icon: BookOpen, label: "Book" },
                  ]).map(({ mode, Icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => update("mode", mode)}
                      title={`${label} view`}
                      className={`p-1.5 rounded-full transition-colors ${
                        prefs.mode === mode
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
                  onAskAI={() =>
                    ask(`Where does this note talk about "${findQuery.trim()}", and what does it say?`)
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
          className="fixed top-20 right-4 z-30 p-2.5 rounded-full bg-blue-600/90 text-white backdrop-blur shadow-lg print:hidden"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      )}

      <div className="max-w-[1400px] mx-auto px-3 sm:px-5 py-6 flex gap-6 items-start">
        {/* Contents rail — persistent on wide screens, drawer elsewhere */}
        {toc.length > 1 && (
          <AnimatePresence>
            {tocOpen && (
              <motion.nav
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                className="hidden lg:block sticky top-32 w-60 flex-shrink-0 max-h-[calc(100vh-10rem)] overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/40 p-3 print:hidden"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-2 mb-2">
                  Contents
                </p>
                {toc.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => jumpToHeading(t.id)}
                    className={`block w-full text-left px-2 py-1.5 rounded-lg text-[13px] leading-snug transition-colors ${
                      t.level === 3 ? "pl-5 text-xs" : ""
                    } ${
                      activeHeading === t.id
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium"
                        : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                    }`}
                  >
                    {t.text}
                  </button>
                ))}
              </motion.nav>
            )}
          </AnimatePresence>
        )}

        {/* The paper */}
        <div ref={stageRef} className="flex-1 min-w-0 flex flex-col items-center">
          <div
            ref={sheetRef}
            className={`note-reader-sheet ${bookMode ? "note-reader-sheet--book" : "note-reader-sheet--scroll"}`}
            style={
              bookMode
                ? {
                    width: A4_WIDTH,
                    height: A4_HEIGHT,
                    transform: `scale(${scale})`,
                    transformOrigin: "top center",
                    marginBottom: (scale - 1) * A4_HEIGHT,
                  }
                : { width: "100%", maxWidth: A4_WIDTH }
            }
          >
            {/* Title block — printed on the first sheet like a real hand-out cover. */}
            <header className="note-reader-titleblock">
              <span className="note-reader-eyebrow">{note.subject_name}</span>
              <h1>{note.title}</h1>
              <p>
                Updated{" "}
                {new Date(note.updated_at).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </header>

            <div className={bookMode ? "note-reader-window" : ""}>
              <div ref={flowRef} className="note-reader-flow" style={flowStyle}>
                <div
                  ref={contentRef}
                  className={`lesson-note-preview note-reader-body ${
                    prefs.font === "serif" ? "note-reader-body--serif" : "note-reader-body--sans"
                  }`}
                  style={
                    {
                      "--reader-font-scale": prefs.fontScale,
                      "--reader-line-height": prefs.lineHeight,
                    } as React.CSSProperties
                  }
                  dangerouslySetInnerHTML={{ __html: attachImageTokenToHtml(note.content_html) }}
                />
              </div>
            </div>

            {bookMode && (
              <footer className="note-reader-pagefoot">
                <span>{note.subject_name}</span>
                <span className="tabular-nums">
                  {page + 1} / {totalPages}
                </span>
              </footer>
            )}
          </div>

          {/* Page turn controls */}
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
            Highlight any sentence to explain it with AI
            {bookMode && <span className="hidden sm:inline">· use ← → to turn pages</span>}
          </p>
        </div>
      </div>

      {/* Mobile contents drawer */}
      <AnimatePresence>
        {tocOpen && toc.length > 1 && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTocOpen(false)}
              className="fixed inset-0 bg-black/30 z-40 lg:hidden"
            />
            <motion.nav
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 260 }}
              className="fixed top-16 left-0 bottom-0 w-72 z-40 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700/60 shadow-2xl overflow-y-auto p-4 lg:hidden"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Contents</p>
                <button onClick={() => setTocOpen(false)} className="p-1.5 rounded-lg text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {toc.map((t) => (
                <button
                  key={t.id}
                  onClick={() => jumpToHeading(t.id)}
                  className={`block w-full text-left px-2 py-2 rounded-lg text-[13px] leading-snug ${
                    t.level === 3 ? "pl-5 text-xs" : ""
                  } ${
                    activeHeading === t.id
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium"
                      : "text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {t.text}
                </button>
              ))}
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      {/* Selection toolbar */}
      <AnimatePresence>
        {selectionText && selectionRect && !aiOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="fixed z-50 flex items-center gap-0.5 p-1 rounded-full bg-gray-900 dark:bg-gray-800 shadow-2xl ring-1 ring-white/10 print:hidden"
            style={{
              // Clamped to the viewport so a selection at the very edge can't push the
              // toolbar off-screen.
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

      {/* Floating AI button when the toolbar is hidden in focus mode */}
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

export default SharedLessonNoteViewPage;
