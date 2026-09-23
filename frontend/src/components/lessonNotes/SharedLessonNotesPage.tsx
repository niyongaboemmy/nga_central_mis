import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GraduationCap, LayoutGrid, List, Search, Sparkles, X } from "lucide-react";
import { lessonNotesApi, SharedNoteSummary } from "../../api/lessonNotes";
import { useToast } from "../../contexts/ToastContext";
import { EmptyState, Skeleton } from "../elearning/ui/primitives";
import SubjectIcon from "../elearning/ui/subjectIcons";
import NoteCard, { HeroNoteCard, NoteListRow } from "./library/NoteCard";
import { isRecent } from "./library/noteVisuals";

type SortKey = "recent" | "title" | "length";
type ViewMode = "grid" | "list";

/** Remembered per browser: a reading preference, not shared state. */
const VIEW_KEY = "nga.library.view";
const loadView = (): ViewMode => {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
};

const SORTS: { key: SortKey; label: string; short: string }[] = [
  { key: "recent", label: "Recently updated", short: "Recent" },
  { key: "title", label: "Title, A to Z", short: "A–Z" },
  { key: "length", label: "Longest read first", short: "Longest" },
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

const SharedLessonNotesPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [notes, setNotes] = useState<SharedNoteSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<ViewMode>(loadView);
  const searchRef = useRef<HTMLInputElement>(null);

  const chooseView = (next: ViewMode) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* private mode: the choice just does not persist */
    }
  };

  useEffect(() => {
    lessonNotesApi
      .sharedWithMe()
      .then((res) => setNotes(res.data.data))
      .catch(() => {
        setFailed(true);
        setNotes([]);
        showToast("Failed to load shared notes", "error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "/" jumps to search and Escape clears it — the shortcut pair readers expect from
  // every modern library UI. Ignored while the caret is already in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
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

  const all = notes ?? [];
  const tokens = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const searching = tokens.length > 0;
  const filtering = searching || !!subjectFilter;

  const subjects = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of all) counts.set(n.subject_name, (counts.get(n.subject_name) || 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);

  /** One flat, sorted grid. Grouping by subject sounded tidy but produced rows of two
   *  cards with a hole beside them; the subject is on every card and in the filter bar,
   *  which is where a student looks for it anyway. */
  const results = useMemo(() => {
    const scored = all
      .filter((n) => !subjectFilter || n.subject_name === subjectFilter)
      .map((n) => ({ note: n, score: scoreNote(n, tokens) }))
      .filter((r) => !searching || r.score > 0);

    scored.sort((a, b) => {
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
    return scored.map((r) => r.note);
  }, [all, tokens, searching, subjectFilter, sort]);

  const byNewest = useMemo(
    () => [...all].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [all],
  );
  const hero = byNewest[0];
  /** The hero already shows the newest note in full, so repeating it as the first
   *  card was duplicate content — and dropping it is what makes the grid land on
   *  whole rows instead of stranding one card on a line of its own. */
  const showHero = !filtering && !!hero;
  const gridNotes = showHero ? results.filter((n) => n.note_id !== hero.note_id) : results;
  const totalMinutes = useMemo(
    () => all.reduce((sum, n) => sum + (n.reading_minutes || 0), 0),
    [all],
  );
  const newCount = useMemo(() => all.filter((n) => isRecent(n.updated_at)).length, [all]);

  const openNote = useCallback((id: number) => navigate(`/shared-lesson-notes/${id}`), [navigate]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter from the search box opens the top hit — search then read, no mouse needed.
    if (e.key === "Enter" && results.length > 0) openNote(results[0].note_id);
  };

  const clearFilters = () => {
    setQuery("");
    setSubjectFilter(null);
  };

  if (failed && all.length === 0) {
    return (
      <EmptyState
        pose="thinking"
        title="We couldn't load your library"
        body="Something went wrong on the way to the server. Your notes are safe."
        action={{ label: "Try again", onClick: () => window.location.reload() }}
      />
    );
  }

  return (
    <div className="pt-6 pb-16">
      {/* ------------------------------------------------------------- header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display text-gray-900 dark:text-white">My Library</h1>
          {/* One quiet meta line rather than a wide bar of three floating numbers. */}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            {notes === null ? (
              <span className="inline-block h-4 w-64 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
            ) : all.length === 0 ? (
              "Lesson notes your teachers publish will appear here."
            ) : (
              <>
                <span>
                  <strong className="font-semibold text-gray-700 dark:text-gray-200">
                    {all.length}
                  </strong>{" "}
                  {all.length === 1 ? "note" : "notes"}
                </span>
                <span aria-hidden>·</span>
                <span>
                  <strong className="font-semibold text-gray-700 dark:text-gray-200">
                    {subjects.length}
                  </strong>{" "}
                  {subjects.length === 1 ? "subject" : "subjects"}
                </span>
                <span aria-hidden>·</span>
                <span>
                  <strong className="font-semibold text-gray-700 dark:text-gray-200">
                    {totalMinutes}
                  </strong>{" "}
                  min of reading
                </span>
                {newCount > 0 && (
                  <span className="el-chip-brand ml-1 inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold">
                    <Sparkles className="h-3 w-3" />
                    {newCount} new
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <Link
          to="/my-learning"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-pill px-3 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
        >
          <GraduationCap className="h-4 w-4" /> My Learning
        </Link>
      </header>

      {notes === null ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Skeleton className="h-60 lg:col-span-2" />
          <Skeleton className="h-60" />
          <Skeleton className="h-12 lg:col-span-3" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          pose="sleepy"
          title="Nothing here yet"
          body="As soon as a teacher publishes a lesson note for your class, it will show up here — ready to read, search and ask the AI tutor about."
        />
      ) : (
        <>
          {/* Hidden while filtering: "what's newest" is a different question from
              the one the student is asking mid-search. */}
          {showHero && (
            <div className="mb-7">
              <HeroNoteCard
                note={hero}
                eyebrow={isRecent(hero.updated_at) ? "Newest note" : "Start here"}
                onOpen={openNote}
              />
            </div>
          )}

          {/* --------------------------------------------------------- toolbar */}
          <div className="sticky top-16 z-20 -mx-4 mb-5 bg-gray-100/90 px-4 py-3 backdrop-blur-md dark:bg-black/85 md:-mx-6 md:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                  type="search"
                  aria-label="Search your library"
                  placeholder="Search notes, subjects or teachers..."
                  className="el-input rounded-pill pl-10 pr-16"
                />
                {query ? (
                  <button
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-pill p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.08]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-gray-200 px-1.5 py-0.5 font-sans text-[10px] font-medium text-gray-400 dark:border-white/10 sm:block">
                    /
                  </kbd>
                )}
              </div>

              <div className="el-segment" role="group" aria-label="View as">
                {([
                  { key: "grid" as const, Icon: LayoutGrid, label: "Grid view" },
                  { key: "list" as const, Icon: List, label: "List view" },
                ]).map(({ key, Icon, label }) => (
                  <button
                    key={key}
                    onClick={() => chooseView(key)}
                    aria-pressed={view === key}
                    title={label}
                    aria-label={label}
                    className={`grid h-[38px] w-[38px] place-items-center rounded-pill transition-colors ${
                      view === key
                        ? "el-segment-on"
                        : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>

              {/* Three visible options rather than a dropdown: keyboard-native, and
                  there is no menu to trap focus. */}
              <div className="el-segment" role="group" aria-label="Sort notes">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSort(s.key)}
                    aria-pressed={sort === s.key}
                    title={s.label}
                    className={`min-h-[38px] rounded-pill px-3.5 text-xs font-semibold transition-colors ${
                      sort === s.key
                        ? "el-segment-on"
                        : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                    }`}
                  >
                    {s.short}
                  </button>
                ))}
              </div>
            </div>

            {subjects.length > 1 && (
              <div className="no-scrollbar mt-2.5 flex items-center gap-1.5 overflow-x-auto">
                <button
                  onClick={() => setSubjectFilter(null)}
                  aria-pressed={subjectFilter === null}
                  className={`min-h-[34px] whitespace-nowrap rounded-pill px-3.5 text-xs font-semibold transition-colors ${
                    subjectFilter === null
                      ? "bg-brand-500 text-white shadow-soft"
                      : "el-chip hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  All {all.length}
                </button>
                {subjects.map(([subject, count]) => {
                  const active = subjectFilter === subject;
                  return (
                    <button
                      key={subject}
                      onClick={() => setSubjectFilter(active ? null : subject)}
                      aria-pressed={active}
                      className={`inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 text-xs font-semibold transition-colors ${
                        active
                          ? "bg-brand-500 text-white shadow-soft"
                          : "el-chip hover:text-gray-900 dark:hover:text-white"
                      }`}
                    >
                      <SubjectIcon subjectName={subject} className="h-3.5 w-3.5" />
                      {subject}
                      <span className="opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* --------------------------------------------------------- results */}
          {results.length === 0 ? (
            <EmptyState
              pose="thinking"
              // Name what actually emptied the list. "No notes match" with an empty
              // query just reads as a broken screen.
              title={searching ? `Nothing matches “${query.trim()}”` : `Nothing in ${subjectFilter}`}
              body={
                searching && subjectFilter
                  ? `Try another word, or look across all subjects instead of just ${subjectFilter}.`
                  : searching
                    ? "Search looks at titles, subjects, teachers and the text inside each note."
                    : "This subject has no notes shared with you yet."
              }
              action={{ label: "Clear filters", onClick: clearFilters }}
            />
          ) : (
            <>
              {filtering && (
                <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                  <strong className="font-semibold text-gray-700 dark:text-gray-200">
                    {results.length}
                  </strong>{" "}
                  of {all.length} notes
                  {subjectFilter ? ` in ${subjectFilter}` : ""}
                  <button
                    onClick={clearFilters}
                    className="ml-2 font-semibold text-brand-600 hover:underline dark:text-brand-200"
                  >
                    Clear
                  </button>
                </p>
              )}

              {view === "grid" ? (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {gridNotes.map((n) => (
                    <NoteCard key={n.note_id} note={n} tokens={tokens} onOpen={openNote} />
                  ))}
                </div>
              ) : (
                <div className="el-card divide-y divide-gray-100 overflow-hidden dark:divide-white/[0.06]">
                  {gridNotes.map((n) => (
                    <NoteListRow key={n.note_id} note={n} tokens={tokens} onOpen={openNote} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default SharedLessonNotesPage;
