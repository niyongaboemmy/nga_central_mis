import React, { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday } from "date-fns";
import { reportsApi, ReportableLesson } from "../../api/reports";
import LessonReportModal from "./LessonReportModal";

interface Props {
  academicTermId: number | null;
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

const scheduleFlagBadge = (flag: string) => {
  if (flag === "AHEAD")  return <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">Ahead</span>;
  if (flag === "BEHIND") return <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">Behind</span>;
  return null;
};

const LessonReportingCalendar: React.FC<Props> = ({ academicTermId }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [lessons, setLessons] = useState<ReportableLesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<ReportableLesson | null>(null);
  const [showModal, setShowModal] = useState(false);
  // popover: { date, lessons, anchor rect }
  const [popover, setPopover] = useState<{
    date: string;
    lessons: ReportableLesson[];
    top: number;
    left: number;
  } | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const lastFetchKey = useRef<string | null>(null);

  const fetchLessons = useCallback(async (force = false) => {
    const key = format(currentDate, "yyyy-MM");
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

  // Group lessons by date string
  const lessonsByDate = new Map<string, ReportableLesson[]>();
  for (const lesson of lessons) {
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

  const handleDayClick = (dateStr: string, dayLessons: ReportableLesson[], e: React.MouseEvent) => {
    const actionable = dayLessons.filter((l) => l.reporting_status !== "REPORTED");
    if (actionable.length === 0) return;

    if (actionable.length === 1) {
      setSelectedLesson(actionable[0]);
      setShowModal(true);
      return;
    }

    // Multiple — show session picker popover
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const scrollY = window.scrollY;
    setPopover({
      date: dateStr,
      lessons: actionable,
      top:  rect.bottom + scrollY + 4,
      left: rect.left,
    });
  };

  const handleRefresh = () => {
    lastFetchKey.current = null;
    fetchLessons(true);
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
            onClick={handleRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
              lastFetchKey.current = null;
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => {
              setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
              lastFetchKey.current = null;
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
          Delivered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
          Pending
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />
          Upcoming
        </span>
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

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden">
        {days.map((day) => {
          const dateStr    = format(day, "yyyy-MM-dd");
          const dayLessons = lessonsByDate.get(dateStr) ?? [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isCurrentDay   = isToday(day);
          const hasActionable  = dayLessons.some((l) => l.reporting_status !== "REPORTED");

          return (
            <div
              key={dateStr}
              onClick={(e) => dayLessons.length > 0 && handleDayClick(dateStr, dayLessons, e)}
              className={`
                bg-white dark:bg-gray-900 min-h-[72px] p-1.5 flex flex-col
                ${!isCurrentMonth ? "opacity-40" : ""}
                ${dayLessons.length > 0 && hasActionable ? "cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20" : ""}
                ${dayLessons.length > 0 && !hasActionable ? "cursor-default" : ""}
                transition-colors
              `}
            >
              <span
                className={`
                  text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                  ${isCurrentDay
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 dark:text-gray-400"}
                `}
              >
                {format(day, "d")}
              </span>

              {/* Dots */}
              {dayLessons.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {dayLessons.slice(0, 4).map((l, i) => (
                    <span
                      key={i}
                      title={`${l.subject_name ?? "Lesson"} · ${statusLabel(l.reporting_status)}`}
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor(l.reporting_status)}`}
                    />
                  ))}
                  {dayLessons.length > 4 && (
                    <span className="text-xs text-gray-400">+{dayLessons.length - 4}</span>
                  )}
                </div>
              )}

              {/* Subject name label (show if single lesson and space allows) */}
              {dayLessons.length === 1 && (
                <p className="mt-0.5 text-[10px] leading-tight text-gray-500 dark:text-gray-400 truncate">
                  {dayLessons[0].subject_name ?? dayLessons[0].module_code}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Session Picker popover (multi-lesson day) */}
      {popover && (
        <div
          ref={popoverRef}
          style={{ top: popover.top, left: popover.left }}
          className="fixed z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl min-w-[220px] py-1"
        >
          <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
            Select a session
          </p>
          {popover.lessons.map((lesson, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setPopover(null);
                setSelectedLesson(lesson);
                setShowModal(true);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor(lesson.reporting_status)}`}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 dark:text-white truncate">
                  {lesson.subject_name ?? lesson.module_code ?? "Lesson"}
                </p>
                {lesson.start_time && (
                  <p className="text-xs text-gray-400">
                    {lesson.start_time}
                    {lesson.end_time && `–${lesson.end_time}`}
                  </p>
                )}
              </div>
              {lesson.lesson_report?.schedule_flag &&
                scheduleFlagBadge(lesson.lesson_report.schedule_flag)}
            </button>
          ))}
        </div>
      )}

      {/* Report Modal */}
      {showModal && selectedLesson && (
        <LessonReportModal
          lesson={selectedLesson}
          academicTermId={academicTermId}
          onClose={() => {
            setShowModal(false);
            setSelectedLesson(null);
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
          No scheduled lessons found for this month.
          <br />
          <span className="text-xs">
            Lessons appear once CalendarSlots are created for your subjects.
          </span>
        </div>
      )}
    </div>
  );
};

export default LessonReportingCalendar;
