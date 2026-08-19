import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Users as UsersIcon,
  Layers,
  SearchX,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { getScopedSubjects, ScopedSubject, SubjectFacets } from "../api/users";
import { useScopedGrades } from "../hooks/useScopedGrades";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import { useToast } from "../contexts/ToastContext";
import SubjectDetailsPanel from "./SubjectDetailsPanel";
import SubjectFilterBar, {
  EMPTY_FILTERS,
  SubjectFilterState,
} from "./subjects/SubjectFilterBar";

const PAGE_SIZE = 24;
const VIEW_STORAGE_KEY = "class_subjects_view";

const EMPTY_FACETS: SubjectFacets = {
  categories: [],
  classGroups: [],
  grades: [],
  teachers: [],
  statuses: [],
  unassigned: 0,
};

const teacherLabel = (t: {
  first_name?: string | null;
  last_name?: string | null;
  username: string | null;
}) =>
  t.first_name && t.last_name
    ? `${t.first_name} ${t.last_name}`
    : t.username ?? "Unknown";

const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("")
    .toUpperCase();

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

const StatusPill = ({ status }: { status: string }) => (
  <span
    className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide flex-shrink-0 ${
      status === "ACTIVE"
        ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
        : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
    }`}
  >
    {status}
  </span>
);

const TeacherChips = ({ subject }: { subject: ScopedSubject }) =>
  subject.teachers.length > 0 ? (
    <div className="flex flex-wrap gap-1">
      {subject.teachers.map((teacher) => (
        <span
          key={teacher.user_id}
          className="inline-flex items-center gap-1 pl-1 pr-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs border border-blue-100 dark:border-blue-900/50"
        >
          <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[8px] font-bold flex items-center justify-center">
            {initialsOf(teacherLabel(teacher))}
          </span>
          {teacherLabel(teacher)}
        </span>
      ))}
    </div>
  ) : (
    // Worth calling out rather than leaving blank — an unstaffed subject is
    // something a class teacher needs to chase.
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40">
      No teacher yet
    </span>
  );

const SubjectCard = ({
  subject,
  index,
  showGroups,
  onOpen,
}: {
  subject: ScopedSubject;
  index: number;
  showGroups: boolean;
  onOpen: () => void;
}) => (
  <motion.button
    type="button"
    onClick={onOpen}
    aria-label={`Open details for ${subject.name}`}
    layout
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.97 }}
    whileHover={{ y: -3 }}
    transition={{ delay: Math.min(index, 10) * 0.02 }}
    className="group h-full w-full text-left flex flex-col bg-white dark:bg-slate-800/60 rounded-2xl p-4 border border-blue-100/80 dark:border-slate-700/40 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/10 transition-all"
  >
    <div className="flex items-start gap-3">
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ring-1 ring-black/5"
        style={{ backgroundColor: subject.color || "#2563eb" }}
      >
        <BookOpen className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-slate-900 dark:text-white text-sm leading-snug break-words">
          {subject.name}
        </h3>
        <p className="text-xs text-blue-900/50 dark:text-blue-100/40 mt-0.5 truncate">
          {subject.code}
          {subject.category_name ? ` · ${subject.category_name}` : ""}
        </p>
      </div>
      <StatusPill status={subject.status} />
    </div>

    {subject.description && (
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">
        {subject.description}
      </p>
    )}

    {showGroups && subject.class_groups.length > 0 && (
      <div className="flex flex-wrap items-center gap-1 mt-2.5">
        <Layers className="w-3 h-3 text-blue-400" />
        {subject.class_groups.map((cg) => (
          <span
            key={cg.class_group_id}
            className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 rounded-full text-[11px]"
          >
            {cg.name}
          </span>
        ))}
      </div>
    )}

    <div className="mt-2.5">
      <p className="text-[11px] text-blue-900/45 dark:text-blue-100/35 mb-1 flex items-center gap-1">
        <UsersIcon className="w-3 h-3" />
        Teachers
      </p>
      <TeacherChips subject={subject} />
    </div>

    <div className="flex items-center gap-1 mt-auto pt-3 text-xs font-semibold text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
      View details
      <ChevronRight className="w-3.5 h-3.5" />
    </div>
  </motion.button>
);

/** Denser alternative for scanning many subjects at once. */
const SubjectRow = ({
  subject,
  index,
  onOpen,
}: {
  subject: ScopedSubject;
  index: number;
  onOpen: () => void;
}) => (
  <motion.button
    type="button"
    onClick={onOpen}
    aria-label={`Open details for ${subject.name}`}
    layout
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ delay: Math.min(index, 12) * 0.015 }}
    className="w-full text-left flex items-center gap-3 bg-white dark:bg-slate-800/60 rounded-2xl p-3 border border-blue-100/80 dark:border-slate-700/40 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
  >
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: subject.color || "#2563eb" }}
    >
      <BookOpen className="w-4 h-4 text-white" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
        {subject.name}
      </p>
      <p className="text-xs text-blue-900/50 dark:text-blue-100/40 truncate">
        {subject.code}
        {subject.class_groups.length > 0 &&
          ` · ${subject.class_groups.map((c) => c.name).join(", ")}`}
      </p>
    </div>
    <div className="hidden md:block max-w-[16rem]">
      <TeacherChips subject={subject} />
    </div>
    <StatusPill status={subject.status} />
    <ChevronRight className="w-4 h-4 text-blue-300 flex-shrink-0" />
  </motion.button>
);

const CardSkeleton = () => (
  <div className="h-44 rounded-2xl bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-slate-800 dark:via-slate-800/50 dark:to-slate-800 border border-blue-100/70 dark:border-slate-700/40 animate-pulse" />
);

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen relative">
    <div className="relative z-10 pb-10 pt-4 px-4 md:px-6">
      <div className="max-w-7xl mx-auto">{children}</div>
    </div>
  </div>
);

const Notice = ({ title, message }: { title: string; message: string }) => (
  <PageShell>
    <div className="text-center py-16">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center mx-auto mb-3">
        <BookOpen className="w-7 h-7 text-blue-400" />
      </div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
        {title}
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  </PageShell>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ClassTeacherSubjectsPage: React.FC = () => {
  const { user } = useUser();
  const { showToast } = useToast();
  const scope = useScopedGrades();
  // Year/term come from the global selector in the top nav — the timetable and
  // scheme of work shown in the details panel are both per-term.
  const { selectedYearId, selectedTermId, selectedYear, selectedTerm } =
    useAcademicPeriod();

  const [subjects, setSubjects] = useState<ScopedSubject[]>([]);
  const [facets, setFacets] = useState<SubjectFacets>(EMPTY_FACETS);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SubjectFilterState>(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedSubject, setSelectedSubject] = useState<ScopedSubject | null>(
    null,
  );
  const [view, setView] = useState<"grid" | "list">(
    () => (localStorage.getItem(VIEW_STORAGE_KEY) as "grid" | "list") ?? "grid",
  );

  const canView = user?.permissions?.includes(
    "VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE",
  );
  const academicYearId =
    selectedYearId ?? user?.currentAcademicYear?.academic_year_id ?? null;
  const periodLabel =
    [selectedYear?.name, selectedTerm?.name].filter(Boolean).join(" · ") || null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  // Only the text box is debounced; every other filter applies immediately.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 400);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const gradeIds = useMemo(
    () => (filters.gradeId === "all" ? scope.gradeIds : [filters.gradeId]),
    [filters.gradeId, scope.gradeIds],
  );

  // One key for every filter, so the fetch effect has a single stable dependency
  // instead of eight that each re-trigger it.
  const filterKey = JSON.stringify({
    gradeIds,
    classGroupIds: filters.classGroupIds,
    teacherIds: filters.teacherIds,
    categoryIds: filters.categoryIds,
    status: filters.status,
    assignment: filters.assignment,
    sort: filters.sort,
    debouncedSearch,
  });

  // Any filter change goes back to page 1 — staying on page 3 of a result set
  // that just shrank to one page shows nothing at all.
  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    getScopedSubjects({
      gradeIds,
      academicYearId,
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      classGroupIds: filters.classGroupIds,
      teacherIds: filters.teacherIds,
      categoryIds: filters.categoryIds,
      status: filters.status || undefined,
      assignment: filters.assignment || undefined,
      sort: filters.sort,
    })
      .then((result) => {
        if (cancelled) return;
        setSubjects(result.items);
        setFacets(result.facets);
        setTotal(result.total);
      })
      .catch((error: any) => {
        if (cancelled) return;
        console.error("Failed to load subjects:", error);
        showToast(error?.message || "Failed to load subjects", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, academicYearId, page, filterKey]);

  if (!canView) {
    return (
      <Notice
        title="Access Denied"
        message="No permission to view class subjects."
      />
    );
  }

  if (scope.isScoped && scope.gradeIds.length === 0) {
    return (
      <Notice
        title="No Grades Assigned"
        message={
          scope.source === "programs"
            ? "Your programs have no grades yet."
            : "You are not assigned to any grades."
        }
      />
    );
  }

  const hasFilters =
    Boolean(debouncedSearch) ||
    filters.classGroupIds.length > 0 ||
    filters.teacherIds.length > 0 ||
    filters.categoryIds.length > 0 ||
    Boolean(filters.status) ||
    Boolean(filters.assignment) ||
    filters.gradeId !== "all";

  return (
    <PageShell>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5"
      >
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Class Subjects
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {scope.isScoped
            ? `Subjects in ${scope.grades.map((g) => g.name).join(", ")}`
            : "Subjects across all grades"}
          {periodLabel ? ` · ${periodLabel}` : ""}
        </p>
      </motion.div>

      {/* Sticky so the filters stay reachable while scrolling a long list. */}
      <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-md border-b border-blue-100/70 dark:border-slate-800 mb-4">
        <SubjectFilterBar
          filters={filters}
          onChange={(next) => setFilters((prev) => ({ ...prev, ...next }))}
          onReset={() => setFilters(EMPTY_FILTERS)}
          facets={facets}
          grades={scope.grades}
          total={total}
          view={view}
          onViewChange={setView}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center mx-auto mb-3">
            <SearchX className="w-7 h-7 text-blue-400" />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {hasFilters
              ? "No subject matches these filters."
              : "No subjects in your grades yet."}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="mt-3 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : view === "grid" ? (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch"
        >
          <AnimatePresence mode="popLayout">
            {subjects.map((subject, index) => (
              <SubjectCard
                key={subject.subject_id}
                subject={subject}
                index={index}
                showGroups={scope.grades.length > 1 || !scope.isScoped}
                onOpen={() => setSelectedSubject(subject)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <motion.div layout className="space-y-2">
          <AnimatePresence mode="popLayout">
            {subjects.map((subject, index) => (
              <SubjectRow
                key={subject.subject_id}
                subject={subject}
                index={index}
                onOpen={() => setSelectedSubject(subject)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {!loading && total > 0 && totalPages > 1 && (
        <div className="mt-6 pt-4 border-t border-blue-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-sm text-slate-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} of {total}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Previous page"
              className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:border-blue-400 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-500 tabular-nums">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              aria-label="Next page"
              className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:border-blue-400 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <SubjectDetailsPanel
        isOpen={selectedSubject !== null}
        onClose={() => setSelectedSubject(null)}
        summary={selectedSubject}
        gradeIds={gradeIds}
        academicYearId={academicYearId}
        academicTermId={selectedTermId}
        periodLabel={periodLabel}
      />
    </PageShell>
  );
};

export default ClassTeacherSubjectsPage;
