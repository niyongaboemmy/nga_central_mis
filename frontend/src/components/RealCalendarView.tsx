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
} from "lucide-react";
import LessonPlanPreviewModal from "./LessonPlanPreviewModal";

interface RealCalendarViewProps {
  entries: SchemeEntry[];
  lessonPlans: Record<number, LessonPlan[]>;
  onDayClick: (date: Date, entryId: number | null) => void;
  onPlanClick: (plan: LessonPlan) => void;
  onDeletePlan: (id: number) => void;
}

const RealCalendarView: React.FC<RealCalendarViewProps> = ({
  entries,
  lessonPlans,
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

  // Smart Pattern Matching: Global Expected Dates (7-day intervals)
  // Find the FIRST lesson plan across ALL entries, then expect lessons every 7 days
  // This works across all scheme weeks, not just within a single entry
  const expectedDates = useMemo(() => {
    const allPlans = Object.values(lessonPlans).flat();

    if (allPlans.length === 0) return new Set<string>();

    // Find the absolute first lesson plan date across all entries
    const sortedPlans = [...allPlans].sort((a, b) => {
      const dateA = a.lesson_date ? new Date(a.lesson_date).getTime() : 0;
      const dateB = b.lesson_date ? new Date(b.lesson_date).getTime() : 0;
      return dateA - dateB;
    });

    const firstPlan = sortedPlans[0];
    if (!firstPlan?.lesson_date) return new Set<string>();

    // Parse the first date correctly (avoid timezone issues)
    // Use local timezone parsing to match how the calendar renders dates
    const firstDateStr = firstPlan.lesson_date.split("T")[0];
    const [firstYear, firstMonth, firstDay] = firstDateStr
      .split("-")
      .map(Number);
    const firstDate = new Date(firstYear, firstMonth - 1, firstDay);

    // Find the latest end date across all entries
    const latestEndDate = entries.reduce((latest, entry) => {
      const endDateStr = entry.end_date.split("T")[0];
      const [endYear, endMonth, endDay] = endDateStr.split("-").map(Number);
      const endDate = new Date(endYear, endMonth - 1, endDay);
      return endDate > latest ? endDate : latest;
    }, new Date(0));

    // Generate expected dates: first date, first date + 7 days, first date + 14 days, etc.
    const expectedDatesSet = new Set<string>();
    let currentDate = new Date(firstDate);

    while (currentDate <= latestEndDate) {
      // Format as YYYY-MM-DD in local timezone
      const currentYear = currentDate.getFullYear();
      const currentMonth = String(currentDate.getMonth() + 1).padStart(2, "0");
      const currentDay = String(currentDate.getDate()).padStart(2, "0");
      const dateStr = `${currentYear}-${currentMonth}-${currentDay}`;
      expectedDatesSet.add(dateStr);

      // Add 7 days
      currentDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    return expectedDatesSet;
  }, [lessonPlans, entries]);

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

    const hasPlan = plansForDay.length > 0;

    // Is Missing? Check if this exact date is in the global expected pattern
    const isMissingPlan = entry && !hasPlan && expectedDates.has(dateStr);

    days.push(
      <div
        key={d}
        onClick={() => onDayClick(date, entry?.entry_id || null)}
        className={`group relative min-h-[140px] p-2 border-b border-r border-gray-100 dark:border-gray-700 transition-colors ${
          entry
            ? "bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer"
            : "bg-gray-50/50 dark:bg-gray-950"
        }`}
      >
        <div className="flex justify-between items-start mb-2">
          <span
            className={`text-sm font-medium w-8 h-8 flex items-center justify-center rounded-full ${
              isToday
                ? "bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none"
                : entry
                  ? "text-gray-900 dark:text-gray-100"
                  : "text-gray-400 dark:text-gray-600"
            }`}
          >
            {d}
          </span>
          <div className="flex items-center gap-1">
            {isMissingPlan && (
              <div
                className="group/tooltip relative"
                title="Missing Lesson Plan"
              >
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
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
              className="flex flex-col items-center justify-center p-2 py-4 rounded-xl border-2 border-dashed border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/5 group-hover:bg-red-50 dark:group-hover:bg-red-900/10 transition-colors mt-1"
              title="Missing Plan"
            >
              <FileQuestion className="w-9 h-9 text-red-300 dark:text-red-700 mb-1" />
              <span className="text-[10px] font-bold text-red-400 dark:text-red-500">
                Missing
              </span>
            </div>
          )}

          {entry && plansForDay.length === 0 && !isMissingPlan && (
            <div className="hidden group-hover:flex items-center justify-center py-2 text-gray-300">
              <Plus className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>,
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            {monthNames[month]}{" "}
            <span className="text-gray-400 font-normal">{year}</span>
          </h2>

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
