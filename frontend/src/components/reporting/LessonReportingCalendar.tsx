import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Plus, CheckCircle2, CalendarDays } from "lucide-react";
import { createPortal } from "react-dom";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday } from "date-fns";
import { reportsApi, ReportableLesson, buildAdHocOccurrence } from "../../api/reports";
import { myAssignedSubjectsApi, MyAssignedSubject } from "../../api/academics";
import LessonReportModal from "./LessonReportModal";

interface Props {
  academicTermId: number | null;
  termStartDate?: string | null;
  termEndDate?: string | null;
}

// Color and label helpers
const statusColor = (status: ReportableLesson["reporting_status"]) => {
  if (status === "REPORTED") return "bg-green-500";
  if (status === "PENDING")  return "bg-red-500";
  return "bg-blue-400";
};

const statusLabel = (status: ReportableLesson["reporting_status"]) => {
  if (status === "REPORTED") return "Delivered";
  if (status === "PENDING")  return "Pending";
  return "Upcoming";
};

// Row background/accent tint for the session picker — same semantics as
// statusColor's dot, but as a subtle full-row tint so each session's status
// reads at a glance without needing to parse the small dot alone.
const statusRowTint = (status: ReportableLesson["reporting_status"]) => {
  if (status === "REPORTED")
    return "bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 hover:ring-emerald-300 dark:hover:ring-emerald-500/50";
  if (status === "PENDING")
    return "bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 hover:ring-red-300 dark:hover:ring-red-500/50";
  return "bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 hover:ring-blue-300 dark:hover:ring-blue-500/50";
};

const scheduleFlagBadge = (flag: string) => {
  if (flag === "AHEAD")  return <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">Ahead</span>;
  if (flag === "BEHIND") return <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">Behind</span>;
  return null;
};

const LessonReportingCalendar: React.FC<Props> = ({
  academicTermId,
  termStartDate,
  termEndDate,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [lessons, setLessons] = useState<ReportableLesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<ReportableLesson | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isAdHoc, setIsAdHoc] = useState(false);
  const [modalDayLessons, setModalDayLessons] = useState<ReportableLesson[]>([]);
  // popover: date/lessons plus the clicked cell's anchor rect (viewport-relative)
  const [popover, setPopover] = useState<{
    date: string;
    lessons: ReportableLesson[];
    anchorTop: number;
    anchorBottom: number;
    anchorLeft: number;
    anchorRight: number;
  } | null>(null);
  // Final on-screen position, computed once the popover's real size is known
  // (see the layout effect below) — kept separate from `popover` so the
  // picker can flip above the anchor / stay clear of the right edge instead
  // of always opening below-left and potentially running off-screen.
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  // Subject filter — populated from the instructor's own assignments for
  // the selected term, "" meaning "all subjects".
  const [subjects, setSubjects] = useState<MyAssignedSubject[]>([]);
  const [subjectFilter, setSubjectFilter] = useState<number | "">("");
  // Status filter — which of the three reporting statuses to show; all on
  // by default. Doubles as the legend, which is now clickable.
  const [statusFilter, setStatusFilter] = useState<Set<ReportableLesson["reporting_status"]>>(
    () => new Set(["REPORTED", "PENDING", "UPCOMING"]),
  );

  // "Jump to date" popover — lets an instructor search/pick any date
  // directly instead of stepping through months one at a time.
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerPos, setDatePickerPos] = useState<{ top: number; left: number } | null>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const dateJumpButtonRef = useRef<HTMLButtonElement>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const lastFetchKey = useRef<string | null>(null);

  const fetchLessons = useCallback(async (force = false) => {
    const key = `${format(currentDate, "yyyy-MM")}-${academicTermId ?? "none"}`;
    if (!force && lastFetchKey.current === key) return;

    setLoading(true);
    lastFetchKey.current = key;
    try {
      const from_date = format(startOfMonth(currentDate), "yyyy-MM-dd");
      const to_date   = format(endOfMonth(currentDate),   "yyyy-MM-dd");
      const res = await reportsApi.getReportableLessons({
        from_date,
        to_date,
        academic_term_id: academicTermId ?? undefined,
      });
      const data = (res as any).data?.data ?? (res as any).data ?? [];
      setLessons(Array.isArray(data) ? data : []);
    } catch {
      lastFetchKey.current = null;
    } finally {
      setLoading(false);
    }
  }, [currentDate, academicTermId]);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  // Populate the subject filter's options from the instructor's own
  // assignments for the selected term — mirrors the ad-hoc picker's source
  // of truth in LessonReportModal, so the list always matches what they
  // could actually report against.
  useEffect(() => {
    myAssignedSubjectsApi
      .getAll(academicTermId ?? undefined)
      .then((res: any) => setSubjects(res.data?.data ?? res.data ?? []))
      .catch(() => setSubjects([]));
  }, [academicTermId]);

  // Reset the subject filter when the term changes — a subject selected for
  // one term may not exist (or mean something different) in another.
  useEffect(() => {
    setSubjectFilter("");
  }, [academicTermId]);

  // When the globally-selected academic term changes — or resolves for the
  // first time, e.g. a page reload restoring a persisted term from
  // localStorage while `currentDate` still defaults to today's real date —
  // the month currently on screen may fall completely outside that term's
  // date range. In that case the reportable-lessons query would always come
  // back empty, so jump the calendar to the start of the term instead of
  // leaving the instructor staring at a month that can never have data.
  // `prevTermId` starts at a sentinel (not the initial academicTermId) so
  // this check also runs once the very first time a real term is known,
  // not just on subsequent changes.
  const prevTermId = useRef<number | null | "unset">("unset");
  useEffect(() => {
    if (prevTermId.current === academicTermId) return;
    prevTermId.current = academicTermId;

    if (!termStartDate || !termEndDate) return;
    const start = new Date(termStartDate);
    const end = new Date(termEndDate);
    if (currentDate >= startOfMonth(start) && currentDate <= end) return;

    setCurrentDate(start);
  }, [academicTermId, termStartDate, termEndDate, currentDate]);

  // Close popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close the "jump to date" popover on outside click — the trigger button
  // itself is excluded so clicking it again toggles closed rather than
  // closing-then-immediately-reopening.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        datePickerRef.current &&
        !datePickerRef.current.contains(target) &&
        !dateJumpButtonRef.current?.contains(target)
      ) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Position the date picker the same way as the session picker (measure
  // real size, clamp to viewport) — opening below the header is always safe
  // here since the button sits near the top of the page, so no flip-above
  // logic is needed, just horizontal clamping.
  useLayoutEffect(() => {
    if (!showDatePicker) {
      setDatePickerPos(null);
      return;
    }
    const el = datePickerRef.current;
    const btn = dateJumpButtonRef.current;
    if (!el || !btn) return;

    const margin = 12;
    const vw = window.innerWidth;
    const btnRect = btn.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    let left = btnRect.left;
    if (left + elRect.width > vw - margin) {
      left = vw - elRect.width - margin;
    }
    left = Math.max(margin, left);

    setDatePickerPos({ top: btnRect.bottom + 6, left });
  }, [showDatePicker]);

  // Position the session picker once its real (content-dependent) size is
  // known: prefer opening below-left of the clicked cell, but flip above it
  // when that would run past the bottom of the viewport, and clamp the left
  // edge (with a margin) so it never runs past the right edge either. Runs
  // before paint so there's no visible jump from the initial guess.
  useLayoutEffect(() => {
    if (!popover) {
      setPopoverPos(null);
      return;
    }
    const el = popoverRef.current;
    if (!el) return;

    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const elRect = el.getBoundingClientRect();

    let top = popover.anchorBottom + 4;
    if (top + elRect.height > vh - margin) {
      top = popover.anchorTop - elRect.height - 4;
    }
    top = Math.max(margin, top);

    let left = popover.anchorLeft;
    if (left + elRect.width > vw - margin) {
      left = vw - elRect.width - margin;
    }
    left = Math.max(margin, left);

    setPopoverPos({ top, left });
  }, [popover]);

  // Apply the subject/status filters before grouping — ad-hoc "+" affordances
  // on days with only filtered-out occurrences correctly treat them as empty
  // since they read from this same filtered grouping.
  const visibleLessons = lessons.filter(
    (l) =>
      (subjectFilter === "" || l.subject_id === subjectFilter) &&
      statusFilter.has(l.reporting_status),
  );

  // Group lessons by date string
  const lessonsByDate = new Map<string, ReportableLesson[]>();
  for (const lesson of visibleLessons) {
    const arr = lessonsByDate.get(lesson.date) ?? [];
    arr.push(lesson);
    lessonsByDate.set(lesson.date, arr);
  }

  // Build calendar grid
  const monthStart   = startOfMonth(currentDate);
  const monthEnd     = endOfMonth(currentDate);
  const calStart     = startOfWeek(monthStart, { weekStartsOn: 1 }); // Mon start
  const calEnd       = endOfWeek(monthEnd,   { weekStartsOn: 1 });

  const days: Date[] = [];
  let cursor = calStart;
  while (cursor <= calEnd) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const openLesson = (lesson: ReportableLesson) => {
    setIsAdHoc(lesson.is_ad_hoc ?? false);
    setSelectedLesson(lesson);
    setModalDayLessons(lessonsByDate.get(lesson.date) ?? []);
    setShowModal(true);
  };

  // Reported occurrences are just as clickable as pending/upcoming ones —
  // opening one from the picker lets the instructor view/edit what they
  // already submitted, via LessonReportModal's edit mode. The picker always
  // opens (even for a single existing report) rather than jumping straight
  // into editing it, because an instructor may want to log a second
  // subject/activity for the same day instead.
  const handleDayClick = (dateStr: string, dayLessons: ReportableLesson[], e: React.MouseEvent) => {
    if (dayLessons.length === 0) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopover({
      date: dateStr,
      lessons: dayLessons,
      anchorTop: rect.top,
      anchorBottom: rect.bottom,
      anchorLeft: rect.left,
      anchorRight: rect.right,
    });
  };

  const handleAddUnscheduled = (dateStr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPopover(null);
    setIsAdHoc(true);
    setSelectedLesson(buildAdHocOccurrence(dateStr));
    setModalDayLessons(lessonsByDate.get(dateStr) ?? []);
    setShowModal(true);
  };

  // A day cell is always clickable: opens/edits existing occurrences when
  // present, otherwise starts an unscheduled-activity report for that day.
  const handleCellClick = (dateStr: string, dayLessons: ReportableLesson[], isCurrentMonth: boolean, e: React.MouseEvent) => {
    if (dayLessons.length > 0) {
      handleDayClick(dateStr, dayLessons, e);
    } else if (isCurrentMonth) {
      handleAddUnscheduled(dateStr, e);
    }
  };

  const handleRefresh = () => {
    lastFetchKey.current = null;
    fetchLessons(true);
  };

  const goToPrevMonth = () => {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    lastFetchKey.current = null;
  };

  const goToNextMonth = () => {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    lastFetchKey.current = null;
  };

  const goToToday = () => setCurrentDate(new Date());

  const jumpToDate = (dateStr: string) => {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split("-").map(Number);
    setCurrentDate(new Date(y, m - 1, d));
    setShowDatePicker(false);
  };

  const toggleStatusFilter = (status: ReportableLesson["reporting_status"]) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        // Never allow filtering down to zero visible statuses — that would
        // look identical to "no data" and be confusing to recover from.
        if (next.size === 1) return next;
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Calendar header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {format(currentDate, "MMMM yyyy")}
          </h3>
          {loading && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            ref={dateJumpButtonRef}
            onClick={() => setShowDatePicker((p) => !p)}
            className={`p-1.5 rounded-lg transition-colors ${
              showDatePicker
                ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
            title="Jump to date"
          >
            <CalendarDays className="w-4 h-4" />
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={goToPrevMonth}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
          >
            Today
          </button>
          <button
            onClick={goToNextMonth}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters — subject select plus a status legend that doubles as a
          toggle filter (click a status to hide/show it on the grid). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value ? Number(e.target.value) : "")}
          className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-white/5 ring-1 ring-inset ring-gray-200 dark:ring-white/10 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.subject_id} value={s.subject_id}>
              {s.subject_name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 text-xs">
          {(
            [
              { value: "REPORTED" as const, dot: "bg-green-500" },
              { value: "PENDING" as const, dot: "bg-red-500" },
              { value: "UPCOMING" as const, dot: "bg-blue-400" },
            ]
          ).map((opt) => {
            const active = statusFilter.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleStatusFilter(opt.value)}
                title={active ? `Hide ${statusLabel(opt.value)}` : `Show ${statusLabel(opt.value)}`}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all ${
                  active
                    ? "bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200"
                    : "opacity-40 hover:opacity-70 text-gray-500 dark:text-gray-400"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full inline-block flex-shrink-0 ${opt.dot}`} />
                {statusLabel(opt.value)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-px">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid — each day is its own rounded card (rather than a
          bordered spreadsheet cell) with a subtle hover lift, and every
          reported/pending/upcoming occurrence renders as a colored chip
          instead of a separate status-dot + text-label pair. */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const dateStr    = format(day, "yyyy-MM-dd");
          const dayLessons = lessonsByDate.get(dateStr) ?? [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isCurrentDay   = isToday(day);
          const isEmpty        = dayLessons.length === 0;
          const allReported    = dayLessons.length > 0 && dayLessons.every((l) => l.reporting_status === "REPORTED");

          return (
            <div
              key={dateStr}
              onClick={(e) => handleCellClick(dateStr, dayLessons, isCurrentMonth, e)}
              className={`
                group relative min-h-[84px] p-2 flex flex-col rounded-xl border
                transition-all duration-150 ease-out
                ${!isCurrentMonth ? "opacity-40" : ""}
                ${isCurrentMonth ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""}
                ${allReported
                  ? "bg-emerald-50/70 dark:bg-emerald-500/[0.07] border-emerald-100 dark:border-emerald-500/20 hover:bg-emerald-50 dark:hover:bg-emerald-500/[0.12]"
                  : dayLessons.length > 0
                  ? "bg-white dark:bg-white/[0.03] border-gray-100 dark:border-white/10 hover:border-gray-200 dark:hover:border-white/20"
                  : "bg-white dark:bg-white/[0.02] border-gray-100 dark:border-white/[0.06] hover:border-gray-200 dark:hover:border-white/15"}
              `}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`
                    text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0
                    ${isCurrentDay
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-300 dark:shadow-none"
                      : "text-gray-600 dark:text-gray-400"}
                  `}
                >
                  {format(day, "d")}
                </span>

                {allReported && (
                  <CheckCircle2
                    className="w-4 h-4 text-emerald-500 flex-shrink-0"
                    aria-label="Reported"
                  />
                )}

                {/* Secondary add affordance on days that already have
                    occurrences — lets an instructor log an additional
                    ad-hoc entry without losing the existing one(s). Empty
                    days use the big centered "+" below instead, and the
                    whole cell is already clickable for those. */}
                {isCurrentMonth && !isEmpty && (
                  <button
                    type="button"
                    onClick={(e) => handleAddUnscheduled(dateStr, e)}
                    title="Report additional unscheduled activity for this day"
                    className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-blue-600 dark:hover:bg-blue-600 transition-all flex-shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isEmpty ? (
                isCurrentMonth && (
                  <div className="flex-1 flex items-center justify-center" title="Report unscheduled activity for this day">
                    <Plus className="w-7 h-7 text-gray-400 dark:text-gray-500 opacity-20 group-hover:opacity-60 transition-opacity" />
                  </div>
                )
              ) : (
                <div className="mt-1.5 flex flex-col gap-1">
                  {dayLessons.slice(0, 3).map((l, i) => {
                    const reported = l.reporting_status === "REPORTED";
                    const pending  = l.reporting_status === "PENDING";
                    return (
                      <div
                        key={i}
                        title={`${l.subject_name ?? "Lesson"}${l.start_time ? ` · ${l.start_time}${l.end_time ? `–${l.end_time}` : ""}` : ""} · ${statusLabel(l.reporting_status)}`}
                        className={`flex items-center gap-1.5 px-1.5 py-1 rounded-lg text-[10px] font-medium leading-none truncate transition-colors ${
                          reported
                            ? "bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                            : pending
                            ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                            : "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColor(l.reporting_status)}`}
                        />
                        <span className="truncate min-w-0 flex-1">{l.subject_name ?? l.module_code}</span>
                        {/* Same subject can legitimately appear more than once a day
                            (multiple periods) — the start time disambiguates them so
                            two entries don't look like an accidental duplicate. */}
                        {l.start_time && (
                          <span className="flex-shrink-0 font-normal opacity-70">{l.start_time}</span>
                        )}
                      </div>
                    );
                  })}
                  {dayLessons.length > 3 && (
                    <span className="text-[10px] font-medium text-gray-400 pl-1.5">
                      +{dayLessons.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom month navigation — mirrors the header controls so switching
          months doesn't require scrolling back up past a long grid. */}
      <div className="flex items-center justify-center gap-2 pt-1">
        <button
          onClick={goToPrevMonth}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>
        <button
          onClick={goToToday}
          className="px-3 py-1.5 text-sm font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-full hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
        >
          Today
        </button>
        <button
          onClick={goToNextMonth}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* "Jump to date" popover — portaled for the same stacking-context
          reason as the other popovers/modal in this component. */}
      {showDatePicker &&
        createPortal(
          <div
            ref={datePickerRef}
            style={{
              top: (datePickerPos ?? { top: 0 }).top,
              left: (datePickerPos ?? { left: 0 }).left,
              visibility: datePickerPos ? "visible" : "hidden",
            }}
            className="fixed z-[110] bg-white dark:bg-gray-800/90 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl p-3"
          >
            <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
              Jump to date
            </label>
            <input
              type="date"
              autoFocus
              defaultValue={format(currentDate, "yyyy-MM-dd")}
              onChange={(e) => jumpToDate(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-white/5 ring-1 ring-inset ring-gray-200 dark:ring-white/10 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>,
          document.body,
        )}

      {/* Session Picker popover (multi-lesson day) — portaled to <body> for
          the same reason as LessonReportModal: rendering it deep in the
          page's own tree left it subject to ancestor stacking-context
          quirks (see the modal's z-index fix). */}
      {popover &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              top: (popoverPos ?? { top: popover.anchorBottom + 4 }).top,
              left: (popoverPos ?? { left: popover.anchorLeft }).left,
              visibility: popoverPos ? "visible" : "hidden",
            }}
            className="fixed z-[110] bg-white dark:bg-gray-800/80 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl min-w-[260px] p-2"
          >
            <p className="px-2 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              Select a session
            </p>
            <div className="space-y-1">
              {popover.lessons.map((lesson, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setPopover(null);
                    openLesson(lesson);
                  }}
                  className={`group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-all ring-1 ring-inset ring-transparent hover:ring-2 hover:-translate-y-px hover:shadow-sm ${statusRowTint(lesson.reporting_status)}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor(lesson.reporting_status)}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 dark:text-white truncate">
                      {lesson.subject_name ?? lesson.module_code ?? "Lesson"}
                    </p>
                    {lesson.start_time && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {lesson.start_time}
                        {lesson.end_time && `–${lesson.end_time}`}
                      </p>
                    )}
                  </div>
                  {lesson.lesson_report?.schedule_flag &&
                    scheduleFlagBadge(lesson.lesson_report.schedule_flag)}
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
            <div className="mt-1 pt-2 border-t border-gray-100 dark:border-white/10">
              <button
                type="button"
                onClick={(e) => handleAddUnscheduled(popover.date, e)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add unscheduled activity
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* Report Modal */}
      {showModal && selectedLesson && (
        <LessonReportModal
          lesson={selectedLesson}
          isAdHoc={isAdHoc}
          existingDayLessons={modalDayLessons}
          academicTermId={academicTermId}
          onClose={() => {
            setShowModal(false);
            setSelectedLesson(null);
            setIsAdHoc(false);
          }}
          onSubmitted={() => {
            lastFetchKey.current = null;
            fetchLessons(true);
          }}
        />
      )}

      {/* Empty state */}
      {!loading && lessons.length === 0 && (
        <div className="text-center py-10 text-sm text-gray-400 dark:text-gray-500">
          No scheduled lessons or reported activity found for this month.
          <br />
          <span className="text-xs">
            Lessons appear once CalendarSlots are created for your subjects — or use the "+" on any day to report unscheduled activity.
          </span>
        </div>
      )}
      {!loading && lessons.length > 0 && visibleLessons.length === 0 && (
        <div className="text-center py-10 text-sm text-gray-400 dark:text-gray-500">
          Nothing matches the current filters.
          <br />
          <span className="text-xs">Try a different subject or re-enable a status above.</span>
        </div>
      )}
    </div>
  );
};

export default LessonReportingCalendar;
