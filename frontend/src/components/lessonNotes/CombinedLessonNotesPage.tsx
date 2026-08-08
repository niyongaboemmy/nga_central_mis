import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Loader2, FileStack, ChevronRight } from "lucide-react";
// @ts-expect-error — katex ships no type declarations for this subpath
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import { lessonNotesApi, CombinedNoteSection } from "../../api/lessonNotes";
import { useToast } from "../../contexts/ToastContext";
import { attachImageTokenToHtml } from "../../utils/lessonNoteImages";

interface Props {
  mode: "mine" | "shared";
}

const CombinedLessonNotesPage: React.FC<Props> = ({ mode }) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [notes, setNotes] = useState<CombinedNoteSection[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<number, HTMLElement>>(new Map());

  const backPath = mode === "mine" ? "/lesson-notes" : "/shared-lesson-notes";

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
  useEffect(() => {
    if (!notes || !contentRef.current) return;
    renderMathInElement(contentRef.current, {
      delimiters: [{ left: "$", right: "$", display: false }],
      throwOnError: false,
    });
  }, [notes]);

  // Scrollspy: highlight whichever note section is currently most visible in the
  // scroll container, so the sidebar TOC always reflects where the reader actually is.
  useEffect(() => {
    if (!notes || notes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const id = Number((visible[0].target as HTMLElement).dataset.noteId);
          if (!Number.isNaN(id)) setActiveId(id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [notes]);

  const scrollToNote = (noteId: number) => {
    const el = sectionRefs.current.get(noteId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(noteId);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = mode === "mine" ? await lessonNotesApi.exportCombinedPdf() : await lessonNotesApi.exportSharedCombinedPdf();
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
      const key = n.subject_name;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    }
    return [...groups.entries()];
  }, [notes]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <button
            onClick={() => navigate(backPath)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> {mode === "mine" ? "Notes" : "Shared notes"}
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 flex items-center gap-2">
            <span className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm">
              <FileStack className="w-5 h-5" />
            </span>
            Combined Lesson Notes
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {mode === "mine"
              ? "All your published notes in one consolidated view."
              : "Everything your teachers have shared with you, in one place."}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || !notes || notes.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-full bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? "Preparing PDF..." : "Download Combined PDF"}
        </button>
      </div>

      {notes === null ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-dashed border-gray-200 dark:border-gray-700/50">
          <FileStack className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            {mode === "mine" ? "You have no published notes yet." : "No notes have been shared with you yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
          {/* top-20 (5rem) clears the app's fixed navbar (h-16 = 4rem) plus a little
              breathing room — top-6 alone left the sidebar sticking partway under the
              navbar once scrolled, hiding its top rows behind it. */}
          <nav className="lg:sticky lg:top-20 rounded-2xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/30 p-3 max-h-[calc(100vh-6.5rem)] overflow-y-auto">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 px-2 mb-2">
              {notes.length} note{notes.length === 1 ? "" : "s"}
            </p>
            {groupedBySubject.map(([subject, subjectNotes]) => (
              <div key={subject} className="mb-3 last:mb-0">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 mb-1 truncate">{subject}</p>
                <div className="flex flex-col gap-0.5">
                  {subjectNotes.map((n) => (
                    <button
                      key={n.note_id}
                      onClick={() => scrollToNote(n.note_id)}
                      className={`group flex items-center gap-1.5 text-left px-2 py-1.5 rounded-lg text-sm transition-colors ${
                        activeId === n.note_id
                          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                          : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                      }`}
                    >
                      <ChevronRight
                        className={`w-3 h-3 flex-shrink-0 transition-transform ${activeId === n.note_id ? "rotate-90 text-blue-500" : "text-gray-300"}`}
                      />
                      <span className="truncate">{n.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div ref={contentRef} className="flex flex-col gap-6">
            {notes.map((n, i) => (
              <section
                key={n.note_id}
                data-note-id={n.note_id}
                ref={(el) => {
                  if (el) sectionRefs.current.set(n.note_id, el);
                }}
                className="rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 bg-white dark:bg-gray-900/40 overflow-hidden scroll-mt-6"
              >
                <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                      {n.subject_name}
                      {n.class_group_name ? ` · ${n.class_group_name}` : ""}
                    </span>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50 mt-0.5">{n.title}</h2>
                    {n.teacher_name && (
                      <p className="text-xs text-gray-400 mt-1">Prepared by {n.teacher_name}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
                    {String(i + 1).padStart(2, "0")} / {String(notes.length).padStart(2, "0")}
                  </span>
                </div>
                <div
                  className="lesson-note-preview prose prose-sm dark:prose-invert max-w-none px-6 sm:px-8 py-6"
                  dangerouslySetInnerHTML={{ __html: attachImageTokenToHtml(n.content_html) }}
                />
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CombinedLessonNotesPage;
