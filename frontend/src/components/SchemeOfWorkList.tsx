import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  LayoutGrid,
  MessageSquare,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { academicTermsApi } from "../api/academics";
import {
  schemeOfWorkApi,
  type SchemeProgressResponse,
  type SchemeProgressRow,
} from "../api/schemeOfWork";
import { useToast } from "../contexts/ToastContext";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import { coverageRows } from "./teacher/analytics";
import { CoverageChart } from "./teacher/TeacherCharts";
import { weekOfTerm } from "./teacher/urgency";
import SchemeProgressCard from "./schemeOfWork/SchemeProgressCard";
import {
  applyFilter,
  applySort,
  buildCards,
  FILTER_LABEL,
  searchCards,
  SORT_LABEL,
  summarise,
  type SchemeFilter,
  type SchemeSort,
} from "./schemeOfWork/schemeProgress";
import SelectField from "./ui/SelectField";

// ─── Scheme of Work ─────────────────────────────────────────────────────────
//
// The list answered "has someone reviewed this?" and nothing else — every row
// looked identical whether it held fifteen planned weeks or none. It now leads
// with coverage: how many weeks each scheme has planned against how many the
// term has actually run, which is the question a teacher opens the page with.
//
// Two views over the same data: cards for picking one up, and Compare for
// seeing them side by side against the calendar. The comparison chart is the
// dashboard's own CoverageChart, fed from the same service, so the two screens
// cannot tell different stories about the same scheme.
// ─────────────────────────────────────────────────────────────────────────────

const Segmented = <T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
  label: string;
}) => (
  <div
    role="group"
    aria-label={label}
    className="inline-flex rounded-full bg-surface-light p-0.5 dark:bg-slate-800/70"
  >
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          aria-pressed={active}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            active
              ? "bg-card-light text-text-primary-light shadow-sm dark:bg-slate-700 dark:text-text-primary-dark"
              : "text-text-secondary-light hover:text-text-primary-light dark:text-text-secondary-dark dark:hover:text-text-primary-dark"
          }`}
        >
          {option.icon}
          {option.label}
        </button>
      );
    })}
  </div>
);

const SummaryTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "neutral" | "danger";
}> = ({ icon, label, value, hint, tone = "neutral" }) => (
  <div className="rounded-2xl border border-border-light bg-card-light p-4 shadow-sm dark:border-border-dark/50 dark:bg-card-dark/30">
    <div className="flex items-center gap-2 text-text-secondary-light dark:text-text-secondary-dark">
      {icon}
      <span className="truncate text-[11px] font-medium uppercase tracking-wide">
        {label}
      </span>
    </div>
    <p
      className={`mt-1 text-2xl font-bold leading-tight ${
        tone === "danger"
          ? "text-red-600 dark:text-red-400"
          : "text-text-primary-light dark:text-text-primary-dark"
      }`}
    >
      {value}
    </p>
    {hint && (
      <p className="truncate text-[11px] text-text-secondary-light dark:text-text-secondary-dark">
        {hint}
      </p>
    )}
  </div>
);

const SchemeOfWorkList: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { selectedYearId, selectedTermId, selectedYear, selectedTerm } =
    useAcademicPeriod();

  const [data, setData] = useState<SchemeProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"cards" | "compare">("cards");
  const [filter, setFilter] = useState<SchemeFilter>("all");
  const [sort, setSort] = useState<SchemeSort>("attention");
  const [navigatingKey, setNavigatingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SchemeProgressRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    schemeOfWorkApi
      .myProgress({
        academic_year_id: selectedYearId ?? undefined,
        academic_term_id: selectedTermId ?? undefined,
      })
      .then((res) => {
        if (!cancelled) setData(res.data.data);
      })
      .catch((error) => {
        console.error("Failed to load scheme progress:", error);
        if (!cancelled)
          showToast("Could not load your schemes of work.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYearId, selectedTermId]);

  const week = useMemo(
    () => weekOfTerm(data?.period.term_start_date ?? null),
    [data?.period.term_start_date],
  );

  const cards = useMemo(
    () => buildCards(data?.rows ?? [], week),
    [data?.rows, week],
  );
  const summary = useMemo(() => summarise(cards), [cards]);

  const visible = useMemo(
    () => applySort(applyFilter(searchCards(cards, searchQuery), filter), sort),
    [cards, searchQuery, filter, sort],
  );

  const chartRows = useMemo(
    () => coverageRows(data?.rows ?? [], week),
    [data?.rows, week],
  );

  const openScheme = async (card: (typeof cards)[number]) => {
    setNavigatingKey(card.key);
    try {
      let termId = data?.period.academic_term_id ?? selectedTermId ?? undefined;
      if (!termId && selectedYearId) {
        const resp = await academicTermsApi.getAll(selectedYearId);
        const raw = resp.data as any;
        const terms = Array.isArray(raw) ? raw : raw?.data || [];
        termId = (terms.find((t: any) => t.is_current === 1) || terms[0])
          ?.academic_term_id;
      }
      if (!termId) {
        showToast(
          "No academic term is configured for this academic year yet.",
          "error",
        );
        return;
      }
      navigate(
        `/scheme-of-work/calendar?subject_id=${card.subject_id}&class_group_id=${card.class_group_id}&academic_term_id=${termId}`,
      );
    } catch (error) {
      console.error("Failed to resolve academic term:", error);
      showToast("Could not load the academic term for this subject.", "error");
    } finally {
      setNavigatingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <div className="h-20 w-80 animate-pulse rounded-2xl bg-surface-light dark:bg-surface-dark" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-surface-light dark:bg-surface-dark"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-2xl bg-surface-light dark:bg-surface-dark"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <TrendingUp className="h-3 w-3" />
              Curriculum Management
            </span>
            {(selectedYear || selectedTerm) && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-light px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-text-secondary-light dark:bg-slate-800 dark:text-text-secondary-dark">
                <Calendar className="h-3 w-3" />
                {selectedYear?.name}
                {selectedTerm ? ` · ${selectedTerm.name}` : ""}
                {week ? ` · Week ${week}` : ""}
              </span>
            )}
          </div>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-blue-600">
              <FileText className="h-6 w-6 text-white" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-text-primary-light dark:text-text-primary-dark">
                Scheme of Work
              </h1>
              <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
                Plan and compare your coverage across every assigned class.
              </p>
            </div>
          </div>
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary-light dark:text-text-secondary-dark" />
          <input
            type="search"
            placeholder="Search subjects or classes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-border-light bg-card-light py-2.5 pl-11 pr-4 text-sm text-text-primary-light placeholder-text-secondary-light transition-colors focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-border-dark/50 dark:bg-card-dark/30 dark:text-text-primary-dark dark:placeholder-text-secondary-dark"
          />
        </div>
      </motion.div>

      {/* ── Summary ────────────────────────────────────────────────────── */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile
            icon={<BarChart3 className="h-3.5 w-3.5" />}
            label="Overall coverage"
            value={
              summary.coveragePercent === null
                ? `${summary.totalPlanned} wks`
                : `${summary.coveragePercent}%`
            }
            hint={
              summary.coveragePercent === null
                ? "no term dates set"
                : `${summary.totalPlanned} of ${summary.totalTarget} weeks planned`
            }
          />
          <SummaryTile
            icon={<BookOpen className="h-3.5 w-3.5" />}
            label="Submitted"
            value={`${summary.submitted}/${summary.total}`}
            hint={`${summary.total - summary.submitted} not started`}
          />
          <SummaryTile
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Approved"
            value={summary.approved}
            hint={`${summary.awaiting} awaiting review`}
          />
          <SummaryTile
            icon={<AlertCircle className="h-3.5 w-3.5" />}
            label="Needs work"
            value={summary.needsAttention}
            tone={summary.needsAttention > 0 ? "danger" : "neutral"}
            hint={
              summary.rejected > 0
                ? `${summary.rejected} sent back`
                : "nothing sent back"
            }
          />
        </div>
      )}

      {/* ── Controls ───────────────────────────────────────────────────── */}
      {cards.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              {
                value: "cards",
                label: "Cards",
                icon: <LayoutGrid className="h-3.5 w-3.5" />,
              },
              {
                value: "compare",
                label: "Compare",
                icon: <BarChart3 className="h-3.5 w-3.5" />,
              },
            ]}
          />

          {view === "cards" && (
            <>
              <Segmented
                label="Filter"
                value={filter}
                onChange={setFilter}
                options={(
                  ["all", "attention", "awaiting", "approved"] as SchemeFilter[]
                ).map((value) => ({ value, label: FILTER_LABEL[value] }))}
              />
              <label className="ml-auto flex items-center gap-2 text-xs text-text-secondary-light dark:text-text-secondary-dark">
                Sort
                <SelectField
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SchemeSort)}
                  className="rounded-xl border border-border-light bg-card-light px-2.5 py-1.5 text-xs text-text-primary-light focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-border-dark/50 dark:bg-card-dark/30 dark:text-text-primary-dark"
                >
                  {(["attention", "coverage", "name"] as SchemeSort[]).map(
                    (value) => (
                      <option key={value} value={value}>
                        {SORT_LABEL[value]}
                      </option>
                    ),
                  )}
                </SelectField>
              </label>
            </>
          )}
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────────────────── */}
      {cards.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border-light py-20 text-center dark:border-border-dark/50">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-surface-light dark:bg-slate-800">
            <BookOpen className="h-9 w-9 text-text-secondary-light dark:text-text-secondary-dark" />
          </span>
          <h3 className="mt-4 text-lg font-semibold text-text-primary-light dark:text-text-primary-dark">
            No subjects assigned
          </h3>
          <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark">
            You have no subject assignments for this academic year.
          </p>
        </div>
      ) : view === "compare" ? (
        <div className="rounded-3xl border border-border-light bg-card-light p-5 shadow-sm dark:border-border-dark/50 dark:bg-card-dark/30">
          <div className="mb-3">
            <h2 className="font-semibold text-text-primary-light dark:text-text-primary-dark">
              Coverage against the calendar
            </h2>
            <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark">
              {week
                ? `Each bar is weeks planned; the line is week ${week} of the term.`
                : "Weeks planned per class. Set the term's dates to compare against the calendar."}
            </p>
          </div>
          <CoverageChart rows={chartRows} week={week} />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border-light py-16 text-center dark:border-border-dark/50">
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
            Nothing matches that search or filter.
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setFilter("all");
            }}
            className="mt-3 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
          }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {visible.map((card) => (
            <motion.div
              key={card.key}
              variants={{
                hidden: { y: 12, opacity: 0 },
                visible: { y: 0, opacity: 1 },
              }}
            >
              <SchemeProgressCard
                card={card}
                isNavigating={navigatingKey === card.key}
                onOpen={() => openScheme(card)}
                onViewFeedback={
                  card.validation_comment ? () => setFeedback(card) : undefined
                }
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ── Reviewer feedback ──────────────────────────────────────────── */}
      {feedback && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setFeedback(null)}
        >
          <div
            role="dialog"
            aria-label="Reviewer feedback"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-3xl border border-border-light bg-card-light shadow-2xl dark:border-border-dark/50 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border-light p-5 dark:border-border-dark/50">
              <div className="flex items-center gap-3">
                <span
                  className={`grid h-10 w-10 place-items-center rounded-2xl ${
                    feedback.validation_status === "APPROVED"
                      ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                  }`}
                >
                  {feedback.validation_status === "APPROVED" ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <AlertCircle className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-text-primary-light dark:text-text-primary-dark">
                    {feedback.validation_status === "APPROVED"
                      ? "Approved"
                      : "Sent back for revision"}
                  </h3>
                  <p className="truncate text-xs text-text-secondary-light dark:text-text-secondary-dark">
                    {feedback.subject_name} · {feedback.class_group_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setFeedback(null)}
                aria-label="Close"
                className="rounded-full p-1.5 text-text-secondary-light transition-colors hover:bg-surface-light dark:text-text-secondary-dark dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary-light dark:text-text-secondary-dark">
                <MessageSquare className="h-3.5 w-3.5" />
                Reviewer's comment
              </div>
              <p className="rounded-2xl bg-surface-light p-4 text-sm leading-relaxed text-text-primary-light dark:bg-slate-800 dark:text-text-primary-dark">
                {feedback.validation_comment}
              </p>
              {feedback.updated_at && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-text-secondary-light dark:text-text-secondary-dark">
                  <Clock className="h-3 w-3" />
                  Last updated{" "}
                  {new Date(feedback.updated_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchemeOfWorkList;
