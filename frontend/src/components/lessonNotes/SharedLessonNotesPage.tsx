import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  FileStack,
  FileText,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { lessonNotesApi, SharedNoteSummary } from "../../api/lessonNotes";
import { useToast } from "../../contexts/ToastContext";

type SortKey = "recent" | "title" | "length";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recently updated" },
  { key: "title", label: "Title (A–Z)" },
  { key: "length", label: "Longest read" },
];

/** Scores a note against the query so the most relevant hit floats to the top instead of
 *  the list simply being filtered in its original order. A title match beats a subject or
 *  teacher match, which beats a body-text match. Every token must hit something, so typing
 *  "algebra emmanuel" narrows across fields rather than widening. */
const scoreNote = (note: SharedNoteSummary, tokens: string[]): number => {
  if (tokens.length === 0) return 0;
  const title = note.title.toLowerCase();
  const subject = note.subject_name.toLowerCase();
  const teacher = note.teacher_name.toLowerCase();
  const excerpt = (note.excerpt || "").toLowerCase();

  let total = 0;
  for (const token of tokens) {
    let best = 0;
    if (title.startsWith(token)) best = 100;
    else if (title.includes(token)) best = 70;
    else if (subject.includes(token)) best = 45;
    else if (teacher.includes(token)) best = 40;
    else if (excerpt.includes(token)) best = 15;
    if (best === 0) return 0; // an unmatched token disqualifies the note entirely
    total += best;
  }
  return total;
};

/** Splits text into matched/unmatched runs so search hits can be visibly highlighted. */
const Highlight: React.FC<{ text: string; tokens: string[] }> = ({ text, tokens }) => {
  if (tokens.length === 0 || !text) return <>{text}</>;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
  if (escaped.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  const lowered = tokens.map((t) => t.toLowerCase());
  return (
    <>
      {parts.map((part, i) =>
        lowered.includes(part.toLowerCase()) ? (
          <mark
            key={i}
            className="rounded bg-amber-100 dark:bg-amber-400/20 text-inherit px-0.5 py-px"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
};

const SkeletonRow: React.FC = () => (
  <div className="px-4 py-3.5 animate-pulse">
    <div className="h-4 w-2/5 rounded bg-gray-200 dark:bg-gray-700 mb-2" />
    <div className="h-3 w-3/5 rounded bg-gray-100 dark:bg-gray-700/60" />
  </div>
);

const SharedLessonNotesPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [notes, setNotes] = useState<SharedNoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lessonNotesApi
      .sharedWithMe()
      .then((res) => setNotes(res.data.data))
      .catch(() => showToast("Failed to load shared notes", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "/" jumps to search and Escape clears it — the shortcut pair readers expect from
  // every modern library UI. Ignored while the caret is already in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!sortOpen) return;
    const onClick = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [sortOpen]);

  const tokens = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const searching = tokens.length > 0;

  const subjects = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes) counts.set(n.subject_name, (counts.get(n.subject_name) || 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes]);

  const results = useMemo(() => {
    const filtered = notes
      .filter((n) => !subjectFilter || n.subject_name === subjectFilter)
      .map((n) => ({ note: n, score: scoreNote(n, tokens) }))
      .filter((r) => !searching || r.score > 0);

    filtered.sort((a, b) => {
      // While searching, relevance always wins — the chosen sort only breaks ties.
      if (searching && b.score !== a.score) return b.score - a.score;
      switch (sort) {
        case "title":
          return a.note.title.localeCompare(b.note.title);
        case "length":
          return (b.note.word_count || 0) - (a.note.word_count || 0);
        default:
          return new Date(b.note.updated_at).getTime() - new Date(a.note.updated_at).getTime();
      }
    });
    return filtered.map((r) => r.note);
  }, [notes, tokens, searching, subjectFilter, sort]);

  /** Notes are grouped under their subject — the way a student thinks about them. While
   *  searching that grouping would fight the relevance order, so results become one list. */
  const groups = useMemo((): [string, SharedNoteSummary[]][] => {
    if (searching) return [["", results]];
    const map = new Map<string, SharedNoteSummary[]>();
    for (const n of results) {
      if (!map.has(n.subject_name)) map.set(n.subject_name, []);
      map.get(n.subject_name)!.push(n);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [results, searching]);

  const totalMinutes = useMemo(
    () => notes.reduce((sum, n) => sum + (n.reading_minutes || 0), 0),
    [notes],
  );

  const openNote = useCallback((id: number) => navigate(`/shared-lesson-notes/${id}`), [navigate]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter from the search box opens the top hit — search then read, no mouse needed.
    if (e.key === "Enter" && results.length > 0) openNote(results[0].note_id);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50 flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm">
              <BookOpen className="w-5 h-5" />
            </span>
            My Library
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
            {loading
              ? "Loading the notes your teachers have shared with you..."
              : notes.length === 0
                ? "Lesson notes your teachers publish will appear here."
                : `${notes.length} note${notes.length === 1 ? "" : "s"} · ${subjects.length} subject${
                    subjects.length === 1 ? "" : "s"
                  } · about ${totalMinutes} min of reading`}
          </p>
        </div>
        {notes.length > 0 && (
          <button
            onClick={() => navigate("/shared-lesson-notes/combined")}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-full border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 shadow-sm flex-shrink-0"
          >
            <FileStack className="w-4 h-4" /> Read all in one
          </button>
        )}
      </div>

      {/* Search + controls. Sticky so the search box stays reachable down a long library. */}
      {notes.length > 0 && (
        <div className="sticky top-16 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-gray-50/85 dark:bg-gray-900/85 backdrop-blur-md border-b border-gray-200/70 dark:border-gray-700/40 mb-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search notes, subjects or teachers..."
                className="w-full pl-10 pr-20 py-2.5 text-sm rounded-full border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/60 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 shadow-sm"
              />
              {query ? (
                <button
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:block px-1.5 py-0.5 text-[10px] font-sans font-medium rounded border border-gray-200 dark:border-gray-600 text-gray-400">
                  /
                </kbd>
              )}
            </div>

            <div className="relative" ref={sortMenuRef}>
              <button
                onClick={() => setSortOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 text-sm rounded-full border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 shadow-sm"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">{SORTS.find((s) => s.key === sort)!.label}</span>
              </button>
              <AnimatePresence>
                {sortOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 mt-2 w-52 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-1 z-30"
                  >
                    {SORTS.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => {
                          setSort(s.key);
                          setSortOpen(false);
                        }}
                        className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-lg text-sm ${
                          sort === s.key
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium"
                            : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        }`}
                      >
                        {s.label}
                        {sort === s.key && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Subject filter */}
          {subjects.length > 1 && (
            <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-0.5 -mb-0.5">
              <button
                onClick={() => setSubjectFilter(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                  subjectFilter === null
                    ? "bg-blue-600 text-white border-transparent shadow-sm"
                    : "border-gray-200 dark:border-gray-700/60 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                All subjects
              </button>
              {subjects.map(([subject, count]) => {
                const active = subjectFilter === subject;
                return (
                  <button
                    key={subject}
                    onClick={() => setSubjectFilter(active ? null : subject)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                      active
                        ? "bg-blue-600 text-white border-transparent shadow-sm"
                        : "border-gray-200 dark:border-gray-700/60 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    {subject}
                    <span className="opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/30 divide-y divide-gray-100 dark:divide-gray-700/40">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-dashed border-gray-200 dark:border-gray-700/50">
          <BookOpen className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No notes have been shared with you yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            They'll show up here as soon as a teacher publishes one for your class.
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-gray-200 dark:border-gray-700/50">
          <Search className="w-9 h-9 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-600 dark:text-gray-300 font-medium">No notes match "{query}"</p>
          <p className="text-xs text-gray-400 mt-1">Try a different word, or clear your filters.</p>
          <button
            onClick={() => {
              setQuery("");
              setSubjectFilter(null);
            }}
            className="mt-4 px-4 py-2 text-xs font-medium rounded-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {searching && (
            <p className="text-xs text-gray-400 mb-2.5">
              {results.length} of {notes.length} notes
              {subjectFilter ? ` in ${subjectFilter}` : ""}
            </p>
          )}

          <div className="flex flex-col gap-6">
            {groups.map(([subject, items]) => (
              <section key={subject || "results"}>
                {subject && (
                  <div className="flex items-baseline justify-between gap-3 px-1 mb-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">
                      {subject}
                    </h2>
                    <span className="text-[11px] text-gray-400 flex-shrink-0 tabular-nums">
                      {items.length} note{items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                )}
                <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/30 divide-y divide-gray-100 dark:divide-gray-700/40 overflow-hidden">
                  {items.map((n) => (
                    <button
                      key={n.note_id}
                      onClick={() => openNote(n.note_id)}
                      className="group w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          <Highlight text={n.title} tokens={tokens} />
                        </p>
                        {n.excerpt && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                            <Highlight text={n.excerpt} tokens={tokens} />
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-1.5">
                          {/* Only worth naming the subject on a row when the group header
                              isn't already doing it — i.e. in search results. */}
                          {searching && (
                            <>
                              <span className="truncate">
                                <Highlight text={n.subject_name} tokens={tokens} />
                              </span>
                              <span aria-hidden>·</span>
                            </>
                          )}
                          <span className="truncate">
                            <Highlight text={n.teacher_name} tokens={tokens} />
                          </span>
                          <span aria-hidden>·</span>
                          {n.source === "PDF_UPLOAD" ? (
                            <span className="inline-flex items-center gap-1 flex-shrink-0 text-rose-600 dark:text-rose-400">
                              <FileText className="w-3 h-3" /> PDF
                              {n.page_count ? ` · ${n.page_count} page${n.page_count === 1 ? "" : "s"}` : ""}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 flex-shrink-0">
                              <Clock className="w-3 h-3" /> {n.reading_minutes || 1} min
                            </span>
                          )}
                          <span aria-hidden className="hidden sm:inline">
                            ·
                          </span>
                          <span className="hidden sm:inline flex-shrink-0">
                            {formatDistanceToNow(new Date(n.updated_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400 mt-8">
            <Sparkles className="w-3 h-3" /> Open any note to read it as a book and ask the AI tutor about it.
          </p>
        </>
      )}
    </div>
  );
};

export default SharedLessonNotesPage;
