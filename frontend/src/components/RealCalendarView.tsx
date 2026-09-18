import React, { useState, useMemo } from "react";
import { SchemeEntry } from "../api/schemeOfWork";
import { LessonPlan } from "../api/lessonPlan";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  FileText,
  FileQuestion,
  FolderOpen,
  Trash2,
  AlertTriangle,
  Clock3,
  CalendarCheck2,
  ArrowRight,
} from "lucide-react";
import LessonPlanPreviewModal from "./LessonPlanPreviewModal";

interface RealCalendarViewProps {
  entries: SchemeEntry[];
  lessonPlans: Record<number, LessonPlan[]>;
  // Real weekdays this subject/class meets, taken from the teacher's own
  // timetable (0=Sun..6=Sat, matching Date#getDay()). When empty (no
  // timetable data yet for this subject/class), the view falls back to the
  // legacy "every 7 days from the first logged plan" guess below.
  scheduledWeekdays?: Set<number>;
  onDayClick: (date: Date, entryId: number | null) => void;
  onPlanClick: (plan: LessonPlan) => void;
  onDeletePlan: (id: number) => void;
}

/** YYYY-MM-DD in local time — avoids the UTC-shift bugs of toISOString(). */
const toDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const RealCalendarView: React.FC<RealCalendarViewProps> = ({
  entries,
  lessonPlans,
  scheduledWeekdays,
  onDayClick,
  onPlanClick,
  onDeletePlan,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [previewPlan, setPreviewPlan] = useState<LessonPlan | null>(null);

  const daysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) =>
    new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Legacy fallback pattern: when the teacher's timetable hasn't produced any
  // scheduled weekdays for this subject/class yet (e.g. the calendar hasn't
  // been set up), fall back to the old guess — expect a lesson every 7 days
  // starting from whichever lesson plan was logged first.
  const legacyExpectedDates = useMemo(() => {
    if (scheduledWeekdays && scheduledWeekdays.size > 0) return new Set<string>();

    const allPlans = Object.values(lessonPlans || {}).flat();
    if (allPlans.length === 0) return new Set<string>();

    const sortedPlans = [...allPlans].sort((a, b) => {
      const dateA = a.lesson_date ? new Date(a.lesson_date).getTime() : 0;
      const dateB = b.lesson_date ? new Date(b.lesson_date).getTime() : 0;
      return dateA - dateB;
    });

    const firstPlan = sortedPlans[0];
    if (!firstPlan?.lesson_date) return new Set<string>();

    const firstDateStr = firstPlan.lesson_date.split("T")[0];
    const [firstYear, firstMonth, firstDay] = firstDateStr
      .split("-")
      .map(Number);
    const firstDate = new Date(firstYear, firstMonth - 1, firstDay);

    const latestEndDate = entries.reduce((latest, entry) => {
      const endDateStr = entry.end_date.split("T")[0];
      const [endYear, endMonth, endDay] = endDateStr.split("-").map(Number);
      const endDate = new Date(endYear, endMonth - 1, endDay);
      return endDate > latest ? endDate : latest;
    }, new Date(0));

    const expectedDatesSet = new Set<string>();
    let cursor = new Date(firstDate);
    while (cursor <= latestEndDate) {
      expectedDatesSet.add(toDateKey(cursor));
      cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    return expectedDatesSet;
  }, [lessonPlans, entries, scheduledWeekdays]);

  type DayStatus = "missing" | "due-soon" | "ok";

  // Walk every date inside every scheme week and classify it against the
  // teacher's real timetable: a "teaching day" that has gone by with no
  // lesson plan is Missing; one landing today or in the next 3 days is Due
  // Soon (a nudge, not yet an alarm); everything else is fine.
  const { dayStatus, missingDates, dueSoonDates } = useMemo(() => {
    const statusMap = new Map<string, DayStatus>();
    const missing: string[] = [];
    const dueSoon: string[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueSoonCutoff = new Date(today);
    dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 3);

    const usingRealTimetable = !!scheduledWeekdays && scheduledWeekdays.size > 0;

    for (const entry of entries) {
      // A SKIPPED week (holiday/break, marked during AI generation) never expects a lesson plan
      // — it must not be flagged "missing", only shown as skipped (see the cell rendering below).
      if (entry.entry_status === "SKIPPED") continue;

      const start = new Date(entry.start_date);
      const end = new Date(entry.end_date);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      const plans = lessonPlans[entry.entry_id] || [];
      const plannedDates = new Set(
        plans.map((p) => p.lesson_date?.split("T")[0]).filter(Boolean),
      );

      for (
        let d = new Date(start);
        d <= end;
        d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
      ) {
        const key = toDateKey(d);
        const isTeachingDay = usingRealTimetable
          ? scheduledWeekdays!.has(d.getDay())
          : legacyExpectedDates.has(key);

        if (!isTeachingDay || plannedDates.has(key)) continue;

        if (d < today) {
          statusMap.set(key, "missing");
          missing.push(key);
        } else if (d <= dueSoonCutoff) {
          statusMap.set(key, "due-soon");
          dueSoon.push(key);
        }
      }
    }

    missing.sort();
    dueSoon.sort();
    return { dayStatus: statusMap, missingDates: missing, dueSoonDates: dueSoon };
  }, [entries, lessonPlans, scheduledWeekdays, legacyExpectedDates]);

  const jumpToDate = (dateKey: string) => {
    const [y, m] = dateKey.split("-").map(Number);
    setCurrentDate(new Date(y, m - 1, 1));
  };

  const days = [];
  // padding for previous month
  for (let i = 0; i < startDay; i++) {
    days.push(
      <div
        key={`prev-${i}`}
        className="min-h-[140px] bg-gray-50/30 dark:bg-gray-900/10 border-b border-r border-gray-100 dark:border-gray-700"
      />,
    );
  }

  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(year, month, d);
    // Format date as YYYY-MM-DD in local timezone (consistent with expected dates)
    const dateYear = date.getFullYear();
    const dateMonth = String(date.getMonth() + 1).padStart(2, "0");
    const dateDay = String(date.getDate()).padStart(2, "0");
    const dateStr = `${dateYear}-${dateMonth}-${dateDay}`;
    const isToday = date.toDateString() === new Date().toDateString();

    // Find if this day belongs to any scheme entry
    const entry = entries.find((e) => {
      const start = new Date(e.start_date);
      const end = new Date(e.end_date);
      date.setHours(0, 0, 0, 0);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      return date >= start && date <= end;
    });

    // Find lesson plans for this specific date
    const plansForDay = entry
      ? (lessonPlans[entry.entry_id] || []).filter((p) => {
          const planDate = p.lesson_date?.split("T")[0];
          return planDate === dateStr;
        })
      : [];

    // Status computed once, up front, from the teacher's real timetable
    // (falling back to the legacy 7-day guess only when no timetable data
    // exists for this subject/class yet).
    const status = dayStatus.get(dateStr);
    const isMissingPlan = status === "missing";
    const isDueSoon = status === "due-soon";
    const isSkippedWeek = entry?.entry_status === "SKIPPED";

    days.push(
      <div
        key={d}
        onClick={() => onDayClick(date, entry?.entry_id || null)}
        className={`group relative min-h-[140px] p-2 border-b border-r transition-colors ${
          isSkippedWeek
            ? "border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-50/70 dark:hover:bg-amber-950/20 cursor-pointer"
            : isMissingPlan
              ? "border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer ring-1 ring-inset ring-red-200 dark:ring-red-900/40"
              : isDueSoon
                ? "border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/10 hover:bg-amber-50 dark:hover:bg-amber-950/20 cursor-pointer"
                : entry
                  ? "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer"
                  : "border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-950"
        }`}
      >
        <div className="flex justify-between items-start mb-2">
          <span
            className={`text-sm font-medium w-8 h-8 flex items-center justify-center rounded-full ${
              isToday
                ? "bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none"
                : isSkippedWeek
                  ? "text-amber-700 dark:text-amber-400"
                  : isMissingPlan
                    ? "text-red-700 dark:text-red-300"
                    : isDueSoon
                      ? "text-amber-700 dark:text-amber-300"
                      : entry
                        ? "text-gray-900 dark:text-gray-100"
                        : "text-gray-400 dark:text-gray-600"
            }`}
          >
            {d}
          </span>
          <div className="flex items-center gap-1">
            {isSkippedWeek && (
              <div
                className="group/tooltip relative flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40"
                title="Marked as skipped (holiday/break) — no lesson expected this week"
              >
                <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Skipped
                </span>
              </div>
            )}
            {isMissingPlan && (
              <div
                className="group/tooltip relative flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40"
                title="Missing lesson plan — this class already met without one"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[9px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400">
                  Missing
                </span>
              </div>
            )}
            {isDueSoon && (
              <div
                className="group/tooltip relative flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40"
                title="Class day coming up — add a lesson plan"
              >
                <Clock3 className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Due
                </span>
              </div>
            )}
            {entry && (
              <span className="text-[10px] font-bold text-gray-300 dark:text-gray-600 uppercase">
                {entry.week_number}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          {plansForDay.map((plan) => (
            <div
              key={plan.id}
              onClick={(e) => {
                e.stopPropagation();
                setPreviewPlan(plan);
              }}
              className="group/file relative flex flex-col items-center justify-center p-2 py-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 hover:bg-blue-100/60 dark:hover:bg-blue-900/30 hover:border-blue-300 dark:hover:border-blue-500 transition-all cursor-pointer mt-1"
            >
              <FolderOpen className="w-9 h-9 text-blue-500 mb-1" />
              <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 truncate w-full text-center">
                {plan.start_time}
              </span>
              <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover/file:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlanClick(plan);
                  }}
                  className="p-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors"
                  title="Edit Plan"
                >
                  <FileText className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (plan.id) onDeletePlan(plan.id);
                  }}
                  className="p-1 rounded-md bg-red-600 text-white hover:bg-red-700 shadow-sm transition-colors"
                  title="Delete Plan"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}

          {isMissingPlan && (
            <div
              className="flex flex-col items-center justify-center p-2 py-4 rounded-xl border-2 border-dashed border-red-300 dark:border-red-800/50 bg-red-50/70 dark:bg-red-900/10 group-hover:bg-red-100/70 dark:group-hover:bg-red-900/20 transition-colors mt-1"
              title="This class already met and has no lesson plan on file"
            >
              <AlertTriangle className="w-8 h-8 text-red-400 dark:text-red-600 mb-1" />
              <span className="text-[10px] font-bold text-red-500 dark:text-red-400">
                Add lesson plan
              </span>
            </div>
          )}

          {isDueSoon && (
            <div
              className="flex flex-col items-center justify-center p-2 py-4 rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-900/10 group-hover:bg-amber-100/70 dark:group-hover:bg-amber-900/20 transition-colors mt-1"
              title="Upcoming class day — plan ahead"
            >
              <FileQuestion className="w-8 h-8 text-amber-400 dark:text-amber-600 mb-1" />
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                Plan needed
              </span>
            </div>
          )}

          {entry && plansForDay.length === 0 && !isMissingPlan && !isDueSoon && (
            <div className="hidden group-hover:flex items-center justify-center py-2 text-gray-300">
              <Plus className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>,
    );
  }

  const formatDateLabel = (dateKey: string) => {
    const [y, m, dd] = dateKey.split("-").map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <>
      {/* Notification strip — only appears when the real timetable has
          flagged actual teaching days without a lesson plan, so a teacher
          never has to hunt through months to notice a gap. */}
      {(missingDates.length > 0 || dueSoonDates.length > 0) && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                missingDates.length > 0
                  ? "bg-red-100 dark:bg-red-900/30"
                  : "bg-amber-100 dark:bg-amber-900/30"
              }`}
            >
              <AlertTriangle
                className={`w-5 h-5 ${
                  missingDates.length > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {missingDates.length > 0
                  ? `${missingDates.length} teaching day${missingDates.length === 1 ? "" : "s"} missing a lesson plan`
                  : `${dueSoonDates.length} upcoming class day${dueSoonDates.length === 1 ? "" : "s"} still need a plan`}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {missingDates.length > 0
                  ? `Earliest: ${formatDateLabel(missingDates[0])}`
                  : `Next up: ${formatDateLabel(dueSoonDates[0])}`}
                {missingDates.length > 0 && dueSoonDates.length > 0 && (
                  <span> · {dueSoonDates.length} more due soon</span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              jumpToDate(
                missingDates.length > 0 ? missingDates[0] : dueSoonDates[0],
              )
            }
            className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold rounded-full transition-all hover:scale-[1.02] active:scale-95 shadow-sm flex-shrink-0 ${
              missingDates.length > 0
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-amber-500 hover:bg-amber-600 text-white"
            }`}
          >
            Go to date
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            {monthNames[month]}{" "}
            <span className="text-gray-400 font-normal">{year}</span>
          </h2>

          <div className="flex items-center gap-3">
            {/* Legend — makes the colour coding self-explanatory instead of
                relying on the reader noticing the red/amber tint. */}
            <div className="hidden md:flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mr-2">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" /> Missing
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> Due soon
              </span>
              <span className="flex items-center gap-1">
                <CalendarCheck2 className="w-3 h-3 text-blue-400" /> Planned
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={prevMonth}
                className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                Today
              </button>
              <button
                onClick={nextMonth}
                className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Days Header */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          {days}
        </div>
      </div>

      <LessonPlanPreviewModal
        isOpen={!!previewPlan}
        onClose={() => setPreviewPlan(null)}
        plan={previewPlan}
        onEdit={(plan) => {
          setPreviewPlan(null);
          onPlanClick(plan);
        }}
        onDelete={(id) => {
          setPreviewPlan(null);
          onDeletePlan(id);
        }}
      />
    </>
  );
};

export default RealCalendarView;
