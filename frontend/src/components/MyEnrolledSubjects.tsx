import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  FolderOpen,
  GraduationCap,
  LayoutGrid,
  Library,
  List,
  Search,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { myEnrolledSubjectsApi, MyEnrolledSubject } from "../api/curriculum";
import { lessonNotesApi, SharedNoteSummary } from "../api/lessonNotes";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import { useMotion } from "../design/motion";
import { EmptyState, Skeleton } from "./elearning/ui/primitives";
import SubjectIcon from "./elearning/ui/subjectIcons";
import { isRecent } from "./lessonNotes/library/noteVisuals";

type ViewMode = "grid" | "list";

/** Remembered per browser: a display preference, not shared state. */
const VIEW_KEY = "nga.subjects.view";
const loadView = (): ViewMode => {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
};

/** What the student's library holds for one subject — the number that makes a
 *  subject card worth looking at, since competencies and documents are often 0. */
interface NoteStat {
  total: number;
  fresh: number;
}

const SubjectTile: React.FC<{ subject: string; size?: "sm" | "md" | "lg" }> = ({
  subject,
  size = "md",
}) => {
  const box = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const glyph = size === "lg" ? "h-6 w-6" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span
      className={`${box} flex flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-200`}
      aria-hidden
    >
      <SubjectIcon subjectName={subject} className={glyph} />
    </span>
  );
};

/** One fact with its icon. Reads as data rather than as decoration. */
const Metric: React.FC<{ icon: React.ReactNode; value: number; label: string }> = ({
  icon,
  value,
  label,
}) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
    <span className="text-gray-400 dark:text-gray-500">{icon}</span>
    <strong className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{value}</strong>
    {label}
  </span>
);

const MyEnrolledSubjects: React.FC = () => {
  const navigate = useNavigate();
  const m = useMotion();
  const { selectedYearId } = useAcademicPeriod();

  const [subjects, setSubjects] = useState<MyEnrolledSubject[] | null>(null);
  const [notes, setNotes] = useState<SharedNoteSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
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
    let cancelled = false;
    setSubjects(null);
    myEnrolledSubjectsApi
      .getAll(selectedYearId ?? undefined)
      .then((res) => !cancelled && setSubjects(res.data.data || []))
      .catch(() => !cancelled && setSubjects([]));
    return () => {
      cancelled = true;
    };
  }, [selectedYearId]);

  // The library the student already has, bucketed by subject. A subject with
  // "0 competencies, 0 documents" still has notes, and that is what they open.
  useEffect(() => {
    lessonNotesApi
      .sharedWithMe()
      .then((res) => setNotes(res.data.data))
      .catch(() => setNotes([])); // a missing count is not worth an error
  }, []);

  const noteStats = useMemo(() => {
    const byName = new Map<string, NoteStat>();
    for (const n of notes) {
      const stat = byName.get(n.subject_name) || { total: 0, fresh: 0 };
      stat.total += 1;
      if (isRecent(n.updated_at)) stat.fresh += 1;
      byName.set(n.subject_name, stat);
    }
    return byName;
  }, [notes]);

  const all = subjects ?? [];
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.code || "").toLowerCase().includes(q) ||
        (s.category_name || "").toLowerCase().includes(q),
    );
  }, [all, searchQuery]);

  const totalNotes = useMemo(
    () => all.reduce((sum, s) => sum + (noteStats.get(s.name)?.total || 0), 0),
    [all, noteStats],
  );
  const freshNotes = useMemo(
    () => all.reduce((sum, s) => sum + (noteStats.get(s.name)?.fresh || 0), 0),
    [all, noteStats],
  );

  const open = useCallback((id: number) => navigate(`/subjects/${id}`), [navigate]);

  /* ------------------------------------------------------------------ card */

  const Card: React.FC<{ s: MyEnrolledSubject }> = ({ s }) => {
    const stat = noteStats.get(s.name);
    return (
      <motion.button
        type="button"
        layout
        {...m("reveal")}
        onClick={() => open(s.subject_id)}
        aria-label={`Open ${s.name}`}
        className="el-card el-card-hover group flex h-full flex-col p-5 text-left focus:outline-none focus-visible:shadow-glow"
      >
        <div className="mb-3.5 flex items-start gap-3">
          <SubjectTile subject={s.name} />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-base font-semibold leading-snug text-gray-900 dark:text-white">
              {s.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {s.code && (
                <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-500 dark:bg-white/[0.08] dark:text-gray-400">
                  {s.code}
                </span>
              )}
              {s.category_name && (
                <span className="el-chip rounded-pill px-2 py-0.5 text-[10px] font-semibold">
                  {s.category_name}
                </span>
              )}
            </div>
          </div>
          {!!stat?.fresh && (
            <span className="flex-shrink-0 rounded-pill bg-brand-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              {stat.fresh} new
            </span>
          )}
        </div>

        {s.description && (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
            {s.description}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-3.5 dark:border-white/[0.06]">
          <Metric
            icon={<Library className="h-3.5 w-3.5" />}
            value={stat?.total || 0}
            label={stat?.total === 1 ? "note" : "notes"}
          />
          <Metric
            icon={<Target className="h-3.5 w-3.5" />}
            value={s.competency_count}
            label={s.competency_count === 1 ? "outcome" : "outcomes"}
          />
          <Metric
            icon={<FolderOpen className="h-3.5 w-3.5" />}
            value={s.document_count}
            label={s.document_count === 1 ? "file" : "files"}
          />
          <ArrowRight className="ml-auto h-4 w-4 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
        </div>
      </motion.button>
    );
  };

  const Row: React.FC<{ s: MyEnrolledSubject }> = ({ s }) => {
    const stat = noteStats.get(s.name);
    return (
      <button
        type="button"
        onClick={() => open(s.subject_id)}
        aria-label={`Open ${s.name}`}
        className="group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 dark:hover:bg-white/[0.04] dark:focus-visible:bg-white/[0.04]"
      >
        <SubjectTile subject={s.name} size="sm" />
        <span className="min-w-0 flex-1 md:flex-[0_0_40%]">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {s.name}
            </span>
            {!!stat?.fresh && (
              <span className="flex-shrink-0 rounded-pill bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                {stat.fresh} new
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            {s.code && <span className="font-mono">{s.code}</span>}
            {s.code && s.category_name && <span aria-hidden>·</span>}
            {s.category_name && <span className="truncate">{s.category_name}</span>}
          </span>
        </span>
        <span className="hidden min-w-0 flex-1 truncate text-[13px] text-gray-500 dark:text-gray-400 lg:block">
          {s.description}
        </span>
        <span className="hidden flex-shrink-0 items-center gap-4 sm:flex">
          <Metric
            icon={<Library className="h-3.5 w-3.5" />}
            value={stat?.total || 0}
            label="notes"
          />
          <Metric
            icon={<Target className="h-3.5 w-3.5" />}
            value={s.competency_count}
            label="outcomes"
          />
          <Metric
            icon={<FolderOpen className="h-3.5 w-3.5" />}
            value={s.document_count}
            label="files"
          />
        </span>
        <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
      </button>
    );
  };

  /* ----------------------------------------------------------------- render */

  return (
    <div className="pt-6 pb-16">
      {/* Same header shape as My Library — these are the two pages a student
          lives in, and they should read as one product. */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display text-gray-900 dark:text-white">My Subjects</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            {subjects === null ? (
              <span className="inline-block h-4 w-56 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
            ) : all.length === 0 ? (
              "Subjects appear here once you are enrolled."
            ) : (
              <>
                <span>
                  <strong className="font-semibold text-gray-700 dark:text-gray-200">
                    {all.length}
                  </strong>{" "}
                  {all.length === 1 ? "subject" : "subjects"} this year
                </span>
                {totalNotes > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      <strong className="font-semibold text-gray-700 dark:text-gray-200">
                        {totalNotes}
                      </strong>{" "}
                      lesson {totalNotes === 1 ? "note" : "notes"}
                    </span>
                  </>
                )}
                {freshNotes > 0 && (
                  <span className="el-chip-brand ml-1 inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold">
                    <Sparkles className="h-3 w-3" />
                    {freshNotes} new
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate("/shared-lesson-notes")}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-pill px-3 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            <Library className="h-4 w-4" /> My Library
          </button>
          <button
            onClick={() => navigate("/my-learning")}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-pill px-3 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            <GraduationCap className="h-4 w-4" /> My Learning
          </button>
        </div>
      </header>

      {subjects === null ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          pose="sleepy"
          title="No subjects yet"
          body="Once you are enrolled for the year, your subjects will appear here with their lesson notes, learning outcomes and materials."
        />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  type="search"
                  aria-label="Search subjects"
                  placeholder="Search subjects by name or code..."
                  className="el-input rounded-pill pl-10 pr-10"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      searchRef.current?.focus();
                    }}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-pill p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.08]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
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
                    aria-label={label}
                    title={label}
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
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              pose="thinking"
              title={`Nothing matches “${searchQuery.trim()}”`}
              body="Search looks at the subject name, its code and its category."
              action={{ label: "Clear search", onClick: () => setSearchQuery("") }}
            />
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((s) => (
                <Card key={s.subject_id} s={s} />
              ))}
            </div>
          ) : (
            <div className="el-card divide-y divide-gray-100 overflow-hidden dark:divide-white/[0.06]">
              {filtered.map((s) => (
                <Row key={s.subject_id} s={s} />
              ))}
            </div>
          )}

          <p className="mt-10 flex items-center justify-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
            <BookOpen className="h-3 w-3" />
            Open a subject to see its learning outcomes, materials and lesson notes.
          </p>
        </>
      )}
    </div>
  );
};

export default MyEnrolledSubjects;
