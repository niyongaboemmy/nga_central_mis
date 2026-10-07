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
  Clock,
  Highlighter,
  Lightbulb,
  List,
  Maximize2,
  Minimize2,
  Printer,
  ScrollText,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  lessonNotesApi,
  SharedNoteDetail,
  SharedNoteSummary,
  isPdfBackedNote,
} from "../../api/lessonNotes";
import { useToast } from "../../contexts/ToastContext";
import { attachImageTokenToHtml } from "../../utils/lessonNoteImages";
import { useReaderPrefs, readingPositionKey } from "./reader/useReaderPrefs";
import { useNoteFind } from "./reader/useNoteFind";
import ReaderSettingsMenu from "./reader/ReaderSettingsMenu";
import FindBar from "./reader/FindBar";
import ContentsRail from "./reader/ContentsRail";
import { setReaderAside } from "./reader/readerAside";
import { repairInlineTags } from "./reader/repairInlineTags";
import { enhanceCodeBlocks } from "../codeWindow/codeWindow";
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
import { EmptyState } from "../elearning/ui/primitives";
import { SubjectTile } from "./library/NoteCard";
import { fullWhen, initialsOf, shortWhen } from "./library/noteVisuals";
import { hydrateInlineChecks } from "../elearning/interactive/hydrate";
import CourseLinkBanner from "./elearning/CourseLinkBanner";

/** Rail (272) + gap (32) + side padding (48) + a page that still reads like one (~600). */
const RAIL_MIN_ROW_WIDTH = 952;
/** Matches NoteAIPanel's sm:w-[420px] and the reader's pr-[420px] when docked. */
const AI_PANEL_WIDTH = 420;
/** Side padding (48) + the narrowest page worth reading beside the panel (520). */
const MIN_DOCKED_ROW_WIDTH = 568;

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

interface Props {
  /** Render a specific note instead of the route param — used when the reader is embedded
   *  in the e-learning course page (My Learning). */
  noteId?: number;
  /** Where the back button goes when embedded. */
  onBack?: () => void;
  backLabel?: string;
}

const SharedLessonNoteViewPage: React.FC<Props> = ({ noteId, onBack, backLabel }) => {
  const { id: routeId } = useParams<{ id: string }>();
  const id = noteId ?? routeId;
  const navigate = useNavigate();
  const goBack = onBack || (() => navigate("/shared-lesson-notes"));
  const { showToast } = useToast();
  const { prefs, update } = useReaderPrefs();

  const [note, setNote] = useState<SharedNoteDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  /** The rest of the student's library, so the end of a note can offer the next
   *  one instead of a dead stop. Cheap: the same list the library page loads. */
  const [siblings, setSiblings] = useState<SharedNoteSummary[]>([]);

  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  /** The student's choice to show the contents rail beside the page. It only shows when
   *  there is room for it (railFits); otherwise the contents open as a drawer. */
  const [tocOpen, setTocOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railFits, setRailFits] = useState(false);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const readerShellRef = useRef<HTMLDivElement>(null);

  /** Focus mode used to only hide the toolbar — the app's navbar and sidebar stayed on
   *  screen, so it was never actually focused. It now covers the viewport (CSS) and asks
   *  the browser for real fullscreen where that's permitted. */
  const enterFocus = useCallback(() => {
    setFocusMode(true);
    const el = readerShellRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => undefined);
  }, []);
  const exitFocus = useCallback(() => {
    setFocusMode(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!focusMode) return;
    // F11 or the browser's own exit must drop the overlay too, or the reader gets stuck
    // in a state the student already tried to leave.
    const onFsChange = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [focusMode]);

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

  const rowRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const askCounter = useRef(0);
  /** The code windows are built once per note, before ask() exists in render order. */
  const askRef = useRef<(question: string, selection?: string, mode?: AskMode) => void>(() => undefined);

  const bookMode = prefs.mode === "book";
  /** The e-learning course page renders this component inline and brings its own
   *  chrome; the route renders it as a full-screen reader that owns the viewport. */
  const embedded = noteId !== undefined;
  /** Chrome offsets: standalone sticks to the top of the window, embedded has to
   *  clear the app navbar that is still above it. */
  // Embedded in a course: on phones the window scrolls (sticky under the 4rem app bar);
  // from lg the course page scrolls its own centre column, so sticky is relative to that.
  const topOffset = embedded ? "top-16 lg:top-0" : "top-0";
  const progressTop = embedded ? "top-16" : "top-0";
  const railTop = embedded ? "top-16" : "top-[4.5rem]";

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

  useEffect(() => {
    lessonNotesApi
      .sharedWithMe()
      .then((res) => setSiblings(res.data.data))
      .catch(() => setSiblings([])); // a missing "next note" is not worth an error
  }, []);

  // The teacher's editor renders $...$ as live KaTeX via a decoration plugin, but this page
  // renders raw saved HTML (no Tiptap instance) — without this pass, a student would just
  // see the literal "$E=mc^2$" text instead of a rendered formula. Heading ids are assigned
  // in the same pass so the table of contents can target them.
  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!note || !root) return;

    repairInlineTags(root);
    // Code shows as an editor window; "Explain" hands it to the Study Assistant.
    enhanceCodeBlocks(root, {
      onExplain: (code, language) =>
        askRef.current(`Explain this ${language === "Code" ? "" : `${language} `}code step by step: what each part does and why.`, code, "explain"),
    });
    renderMathInElement(root, {
      delimiters: [{ left: "$", right: "$", display: false }],
      throwOnError: false,
    });
    // Tap-to-reveal / inline quick-check blocks the teacher inserted from the editor.
    hydrateInlineChecks(root);
    // Each table gets its own sideways scroller (index.css) so it can't widen the page.
    root.querySelectorAll("table").forEach((table) => {
      if (table.parentElement?.classList.contains("note-reader-table-scroll")) return;
      const wrap = document.createElement("div");
      wrap.className = "note-reader-table-scroll";
      table.replaceWith(wrap);
      wrap.appendChild(table);
    });

    const headings = Array.from(root.querySelectorAll("h1, h2, h3")) as HTMLElement[];
    const items: TocItem[] = headings.map((h, i) => {
      const slug = `note-section-${i}`;
      h.id = slug;
      return { id: slug, text: h.textContent?.trim() || `Section ${i + 1}`, level: Number(h.tagName[1]) };
    });
    setToc(items);
    // Open the contents rail by default once we know the note has sections and
    // there is room for it. Closed-by-default left the whole left third of a
    // wide screen empty and hid the one control that makes a long note
    // navigable. Narrow screens keep it as a drawer, opened on demand.
    if (items.length > 1) setTocOpen(true);
  }, [note]);

  // Rail or drawer is decided by the room this reader actually has, not the window: in a
  // course the app menu, the week index and the Study Assistant all take width, and a
  // 272px rail beside a squeezed page pushed the lesson past the edge of the screen.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => setRailFits(row.clientWidth >= RAIL_MIN_ROW_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [note]);

  useEffect(() => {
    if (railFits) setDrawerOpen(false);
  }, [railFits]);

  // The drawer is a dialog: focus moves into it, and back to its button when it closes.
  useEffect(() => {
    if (!drawerOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => drawerCloseRef.current?.focus(), 60);
    return () => {
      window.clearTimeout(t);
      opener?.focus?.({ preventScroll: true });
    };
  }, [drawerOpen]);

  // The Study Assistant docks beside the page only when the page keeps a readable width
  // next to it; otherwise it floats over the page like on a phone. The decision uses the
  // reader's own width (its border box, so making room for the panel doesn't feed back).
  const [canDock, setCanDock] = useState(false);
  useEffect(() => {
    const shell = readerShellRef.current;
    if (!shell) return;
    const measure = () =>
      setCanDock(window.innerWidth >= 1024 && shell.offsetWidth - AI_PANEL_WIDTH >= MIN_DOCKED_ROW_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [note]);
  const aiDocked = aiOpen && canDock;

  // Tell floating page chrome (the course page's bottom bar and week index) where the
  // panel is, so they step out of its way.
  useEffect(() => {
    if (!aiOpen) return;
    setReaderAside({ open: true, docked: aiDocked ? AI_PANEL_WIDTH : 0, covering: !aiDocked });
  }, [aiOpen, aiDocked]);
  useEffect(() => {
    if (!aiOpen) setReaderAside(null);
    return () => setReaderAside(null);
  }, [aiOpen]);

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
      setDrawerOpen(false);
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
  askRef.current = ask;

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
        else if (drawerOpen) setDrawerOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (focusMode) exitFocus();
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
  }, [bookMode, totalPages, findOpen, drawerOpen, settingsOpen, focusMode]);

  // ---------------------------------------------------------------- render

  if (notFound) {
    return (
      <EmptyState
        pose="thinking"
        title="This note isn't available to you"
        body="It may have been unpublished, or the share that gave you access has expired. Your teacher can share it again."
        action={{
          label: backLabel ? `Back to ${backLabel.toLowerCase()}` : "Back to my library",
          onClick: goBack,
        }}
      />
    );
  }

  // A skeleton in the shape of the real page, not a lone spinner: the toolbar and the
  // sheet hold their positions, so opening a note reads as the paper arriving rather
  // than the screen being replaced.
  if (!note) {
    return (
      <div className={`note-reader ${embedded ? "" : "min-h-screen bg-gray-100 dark:bg-black"}`}>
        <div className={`sticky ${topOffset} z-20 border-b border-gray-200/70 bg-white/90 backdrop-blur-md dark:border-white/[0.07] dark:bg-[#0b0d12]/90`}>
          <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-2.5 sm:px-6">
            <div className="h-7 w-20 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
            <div className="hidden min-w-0 flex-1 md:block">
              <div className="mb-1.5 h-3.5 w-56 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-2.5 w-36 animate-pulse rounded bg-gray-100 dark:bg-gray-800/60" />
            </div>
            <div className="ml-auto flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 w-8 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
              ))}
            </div>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1600px] justify-center px-4 py-8 sm:px-6">
          <div
            className="note-reader-sheet w-full animate-pulse"
            style={{ maxWidth: A4_WIDTH }}
            aria-label="Loading note"
            role="status"
          >
            <div className="mb-6 border-b border-gray-200 pb-5 dark:border-gray-700/40">
              <div className="mb-3 h-4 w-24 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="mb-2 h-7 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-40 rounded bg-gray-100 dark:bg-gray-700/60" />
            </div>
            {[
              "w-full", "w-11/12", "w-full", "w-10/12", "w-full",
              "w-9/12", "w-full", "w-11/12", "w-7/12",
            ].map((w, i) => (
              <div key={i} className={`mb-3 h-3.5 rounded bg-gray-100 dark:bg-gray-700/50 ${w}`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // A PDF-backed note has real pages of its own — pdf.js renders them (with a selectable
  // text layer, so highlight-to-ask still works) instead of the HTML sheet below.
  if (isPdfBackedNote(note)) {
    return <SharedPdfNoteReader note={note} onBack={onBack} backLabel={backLabel} embedded={embedded} />;
  }

  /** Next up: the newest unread-ish note in this subject, else anywhere. Falls
   *  back to nothing, in which case the end of the note just offers the library. */
  const nextNote = (() => {
    const others = siblings.filter((n) => n.note_id !== note.note_id);
    const byRecency = [...others].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
    return (
      byRecency.find((n) => n.subject_name === note.subject_name) || byRecency[0] || null
    );
  })();

  const flowStyle: React.CSSProperties = bookMode ? bookFlowStyle(page) : {};

  return (
    <div
      ref={readerShellRef}
      className={`note-reader note-reader--${prefs.paper} ${focusMode ? "note-reader--focus" : ""} ${
        aiDocked ? "pr-[420px]" : ""
      } ${embedded ? "" : "min-h-screen bg-gray-100 dark:bg-black"} transition-[padding] duration-300`}
    >
      {/* Reading progress — the one always-visible signal of how far in you are. */}
      <div className={`fixed ${progressTop} left-0 right-0 h-1 z-30 bg-transparent print:hidden`}>
        <div
          className="h-full bg-brand-500 transition-[width] duration-150"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* Opened outside its course: say where reading it counts. */}
      {!embedded && <CourseLinkBanner placement={note.placement} />}

      {/* Toolbar. Painted in the page's own background, so no colour band shows
          between the toolbar and the desk the sheet rests on. */}
      <AnimatePresence>
        {!focusMode && (
          <motion.div
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            className={`sticky ${topOffset} z-20 bg-white/90 dark:bg-[#0b0d12]/90 backdrop-blur-md border-b border-gray-200/80 dark:border-white/[0.07] print:hidden`}
          >
            <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 py-2.5 sm:px-6">
              <button
                onClick={goBack}
                aria-label={`Back to ${backLabel || "Library"}`}
                className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-2.5 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 hover:bg-gray-200/70 dark:hover:bg-gray-800 flex-shrink-0 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{backLabel || "Library"}</span>
              </button>

              <span aria-hidden className="hidden md:block h-6 w-px bg-gray-300/70 dark:bg-gray-700 flex-shrink-0" />

              {/* Who wrote it and how long it takes are the two facts the card promised;
                  the reader keeps them in view rather than dropping them at the door. */}
              <div className="min-w-0 flex-1 hidden md:flex items-center gap-2.5">
                <SubjectTile subject={note.subject_name} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate leading-tight">
                    {note.title}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                    {note.subject_name}
                    {note.teacher_name ? ` · ${note.teacher_name}` : ""}
                    {note.reading_minutes ? ` · ${note.reading_minutes} min read` : ""}
                    <span className="text-slate-600 dark:text-slate-300">
                      {bookMode
                        ? ` · page ${page + 1} of ${totalPages}`
                        : ` · ${Math.round(progress * 100)}% read`}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                {/* Grouped: navigate | read | output. Seven ungrouped icons in a
                    row read as a debug bar, not a toolbar. */}
                {toc.length > 1 && (
                  <button
                    onClick={() => (railFits ? setTocOpen((o) => !o) : setDrawerOpen((o) => !o))}
                    title="Contents"
                    aria-label="Contents"
                    aria-pressed={railFits ? tocOpen : drawerOpen}
                    className={`grid h-9 w-9 place-items-center rounded-lg transition-colors ${
                      (railFits ? tocOpen : drawerOpen)
                        ? "el-chip-brand"
                        : "text-gray-500 hover:bg-gray-200/70 hover:text-gray-800 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
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
                  aria-label="Find in note"
                  className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-200/70 hover:text-gray-800 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
                >
                  <Search className="w-4 h-4" />
                </button>

                <span aria-hidden className="mx-0.5 h-5 w-px bg-gray-300/70 dark:bg-white/10" />

                {/* Scroll / book toggle */}
                <div className="el-segment" role="group" aria-label="Reading layout">
                  {([
                    { mode: "scroll" as const, Icon: ScrollText, label: "Scroll" },
                    { mode: "book" as const, Icon: BookOpen, label: "Book" },
                  ]).map(({ mode, Icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => update("mode", mode)}
                      title={`${label} view`}
                      aria-label={`${label} view`}
                      aria-pressed={prefs.mode === mode}
                      className={`grid h-8 w-8 place-items-center rounded-pill transition-colors ${
                        prefs.mode === mode
                          ? "el-segment-on"
                          : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
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

                <span aria-hidden className="mx-0.5 hidden h-5 w-px bg-gray-300/70 sm:block dark:bg-white/10" />

                <button
                  onClick={() => window.print()}
                  title="Print / save as A4 PDF"
                  aria-label="Print or save as PDF"
                  className="hidden h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-200/70 hover:text-gray-800 sm:grid dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={enterFocus}
                  title="Focus mode"
                  aria-label="Focus mode"
                  className="hidden h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-200/70 hover:text-gray-800 sm:grid dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setAiOpen((o) => !o)}
                  aria-pressed={aiOpen}
                  aria-label="Ask AI about this lesson"
                  className={`ml-1 inline-flex min-h-[38px] items-center gap-1.5 rounded-pill px-4 text-sm font-semibold transition-colors ${
                    aiOpen
                      ? "el-chip-brand"
                      : "bg-brand-600 text-white shadow-soft hover:bg-brand-700"
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
          onClick={exitFocus}
          title="Exit focus mode (Esc)"
          className="fixed top-20 right-4 z-30 p-2.5 rounded-full bg-blue-600/90 text-white backdrop-blur shadow-lg print:hidden"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      )}

      <div ref={rowRef} className="mx-auto flex max-w-[1180px] items-start gap-8 px-4 py-8 sm:px-6">
        {/* Contents rail — beside the page when there is room, a drawer otherwise */}
        {toc.length > 1 && !focusMode && (
          <AnimatePresence>
            {tocOpen && railFits && (
              <motion.nav
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                /* top-32 clears the navbar (top-16, 64px) *and* the reader toolbar
                   that sticks below it: at a smaller offset the rail's own header
                   slides under the toolbar and disappears. */
                className={`el-card flex flex-col sticky ${railTop} w-[272px] flex-shrink-0 max-h-[calc(100vh-6.5rem)] p-4 print:hidden`}
              >
                <ContentsRail
                  toc={toc}
                  activeId={activeHeading}
                  progress={progress}
                  readingMinutes={note.reading_minutes}
                  onJump={jumpToHeading}
                  onAskAI={() => setAiOpen(true)}
                  className="min-h-0 flex-1"
                />
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
            {/* Title block — printed on the first sheet like a real hand-out cover.
                In book mode it shrinks to a running head (see index.css), so the
                byline row is hidden there rather than repeating on every page. */}
            <header className="note-reader-titleblock">
              <span className="note-reader-eyebrow">{note.subject_name}</span>
              <h1>{note.title}</h1>
              {bookMode ? (
                <p>
                  Updated{" "}
                  {new Date(note.updated_at).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              ) : (
                <div className="note-reader-byline">
                  {note.teacher_name && (
                    <span className="note-reader-byline-author">
                      <span aria-hidden className="note-reader-byline-avatar">
                        {initialsOf(note.teacher_name)}
                      </span>
                      {note.teacher_name}
                    </span>
                  )}
                  {!!note.reading_minutes && (
                    <span>
                      <Clock aria-hidden className="inline h-3 w-3 -mt-px mr-1" />
                      {note.reading_minutes} min read
                    </span>
                  )}
                  <span title={fullWhen(note.updated_at)}>
                    Updated {shortWhen(note.updated_at)}
                  </span>
                </div>
              )}
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

          {/* The reader's one discoverable trick. It was a grey line of small print that
              nobody read; as a pill it looks like something you can use. */}
          <p className="mt-6 inline-flex items-center gap-2 rounded-pill border border-gray-200 bg-white/70 px-3.5 py-1.5 text-[11px] text-gray-500 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 print:hidden">
            <Highlighter className="h-3 w-3 flex-shrink-0 text-brand-500" />
            <span>
              Highlight any sentence to explain it with AI
              {bookMode && <span className="hidden sm:inline"> · use ← → to turn pages</span>}
            </span>
          </p>

          {/* End of the note. Reaching the bottom used to be a dead stop — the
              student's only move was the browser back button. */}
          {!bookMode && (
            <div className="mt-10 w-full max-w-[794px] print:hidden">
              <div className="mb-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  End of note
                </span>
                <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
              </div>

              {nextNote ? (
                <button
                  onClick={() => navigate(`/shared-lesson-notes/${nextNote.note_id}`)}
                  className="el-card el-card-hover group flex w-full items-center gap-4 p-4 text-left focus:outline-none focus-visible:shadow-glow"
                >
                  <SubjectTile subject={nextNote.subject_name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-200">
                      Next up
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {nextNote.title}
                    </span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {nextNote.subject_name}
                      {nextNote.teacher_name ? ` · ${nextNote.teacher_name}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
                </button>
              ) : null}

              <button
                onClick={goBack}
                className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-pill px-3 text-sm font-medium text-gray-600 hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-white/[0.06]"
              >
                <ArrowLeft className="h-4 w-4" /> Back to {backLabel || "my library"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contents drawer — whenever the rail doesn't fit. It slides in from the right,
          next to the toolbar button that opens it (and where the Study Assistant lives),
          on a solid surface above the app's own menu: from the left it opened underneath
          the translucent app sidebar and the two lists read through each other. */}
      <AnimatePresence>
        {drawerOpen && !railFits && toc.length > 1 && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-[60] bg-gray-900/40 backdrop-blur-[2px] print:hidden"
              aria-hidden
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="note-contents-title"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 280 }}
              className={`fixed ${embedded ? "top-16" : "top-0"} right-0 bottom-0 z-[61] flex w-[min(360px,88vw)] flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-gray-900 print:hidden`}
            >
              <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-white/[0.07]">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl el-chip-brand">
                  <List className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p id="note-contents-title" className="text-sm font-semibold leading-tight text-gray-900 dark:text-white">
                    Contents
                  </p>
                  <p className="truncate text-[11px] text-slate-600 dark:text-slate-300">{note.title}</p>
                </div>
                <button
                  ref={drawerCloseRef}
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close contents"
                  className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:shadow-glow dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ContentsRail
                toc={toc}
                activeId={activeHeading}
                progress={progress}
                readingMinutes={note.reading_minutes}
                onJump={(id) => {
                  jumpToHeading(id);
                  setDrawerOpen(false);
                }}
                onAskAI={() => {
                  setDrawerOpen(false);
                  setAiOpen(true);
                }}
                hideTitle
                className="min-h-0 flex-1 px-4 pb-4 pt-4"
              />
            </motion.div>
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
        offsetTop={embedded}
        docked={aiDocked}
      />
    </div>
  );
};

export default SharedLessonNoteViewPage;
