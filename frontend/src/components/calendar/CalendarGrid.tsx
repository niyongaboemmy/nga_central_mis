import React, { useCallback, useMemo, useRef, useState } from "react";
import { MdAdd } from "react-icons/md";
import type { CalendarSlot, CalendarActivity } from "../../api/calendar";
import {
  DAYS,
  DAYS_FULL,
  buildScheduleRows,
  displayDayToBackend,
  backendDayToDisplay,
  findCurrentRowIndex,
  minutesToTime,
  timeToMinutes,
} from "./calendarConstants";
import { buildGridLayout, cellKey, type GridCell } from "./calendarLayout";
import { useCurrentTime } from "./useCurrentTime";

interface CalendarGridProps {
  calendarId?: number;
  classGroupName: string | undefined;
  slots: CalendarSlot[];
  activities: CalendarActivity[];
  weekDates: Date[];
  onSlotClick: (slot: CalendarSlot, date: Date) => void;
  onEmptyCellClick: (
    dayIndex: number,
    scheduleSlot: { start: string; end: string; type: string },
    class_group_id: number,
  ) => void;
  canEdit?: boolean;
}

interface TooltipState {
  slot: CalendarSlot;
  x: number;
  y: number;
}

const instructorOf = (slot: CalendarSlot): string =>
  [slot.instructor_name, slot.instructor_lastname].filter(Boolean).join(" ");

/** How far through a lesson we are, 0-1, or null when it isn't running. */
const lessonProgress = (
  slot: CalendarSlot,
  nowMinutes: number,
): number | null => {
  const start = timeToMinutes(slot.start_time);
  const end = timeToMinutes(slot.end_time);
  if (end <= start || nowMinutes < start || nowMinutes >= end) return null;
  return (nowMinutes - start) / (end - start);
};

const CalendarGrid: React.FC<CalendarGridProps> = ({
  calendarId,
  classGroupName,
  slots,
  activities: _activities,
  weekDates,
  onSlotClick,
  onEmptyCellClick,
  canEdit = false,
}) => {
  // Filter slots for this calendar (skip filtering for personal/teacher & student
  // views, which have no calendar_id — slots are already scoped server-side)
  const calendarSlots = useMemo(
    () => (calendarId ? slots.filter((s) => s.calendar_id === calendarId) : slots),
    [calendarId, slots],
  );

  // Rows follow the data: a period outside the standard timetable still needs
  // a row of its own, or its slots match nothing and the grid renders empty.
  const scheduleRows = useMemo(
    () => buildScheduleRows(calendarSlots),
    [calendarSlots],
  );

  // Which `<td>` goes where is resolved before rendering, so navigation and
  // rendering can never disagree about what exists.
  const layout = useMemo(
    () =>
      buildGridLayout<CalendarSlot>(scheduleRows, DAYS.length, (dayIdx, start) =>
        calendarSlots.find(
          (s) =>
            Number(s.day_of_week) === displayDayToBackend(dayIdx) &&
            s.start_time === start,
        ),
      ),
    [scheduleRows, calendarSlots],
  );

  const { minutes: nowMinutes, date: now } = useCurrentTime();
  const currentRowIndex = findCurrentRowIndex(scheduleRows, nowMinutes);
  const todayIndex = weekDates.findIndex(
    (d) => d && d.toDateString() === now.toDateString(),
  );

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());

  // Roving tabindex: exactly one cell is in the tab order at a time, and the
  // arrow keys move that point rather than tabbing through 84 cells.
  const firstCourseCell = useMemo(() => {
    const row = scheduleRows.findIndex((r) => r.type === "course");
    return row === -1 ? null : cellKey(row, 0);
  }, [scheduleRows]);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const tabStop = activeCell ?? firstCourseCell;

  const showTooltip = useCallback(
    (slot: CalendarSlot, el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      setTooltip({ slot, x: rect.left + rect.width / 2, y: rect.top });
    },
    [],
  );

  const activate = useCallback(
    (cell: GridCell<CalendarSlot>) => {
      const weekDate = weekDates[cell.dayIndex];
      if (cell.slot) {
        onSlotClick(
          {
            ...cell.slot,
            day_of_week: backendDayToDisplay(Number(cell.slot.day_of_week)),
          } as CalendarSlot,
          weekDate!,
        );
        return;
      }
      if (canEdit && calendarId) {
        onEmptyCellClick(cell.dayIndex, scheduleRows[cell.rowIndex], calendarId);
      }
    },
    [calendarId, canEdit, onEmptyCellClick, onSlotClick, scheduleRows, weekDates],
  );

  /** The nearest navigable (course-row) cell at or beyond a coordinate. */
  const resolve = useCallback(
    (rowIndex: number, dayIndex: number, step: 1 | -1): string | null => {
      for (let r = rowIndex; r >= 0 && r < scheduleRows.length; r += step) {
        const owner = layout.ownerOf.get(cellKey(r, dayIndex));
        const cell = owner ? layout.cells.get(owner) : undefined;
        if (cell && cell.type === "course") return owner!;
      }
      return null;
    },
    [layout, scheduleRows.length],
  );

  const moveTo = useCallback(
    (key: string | null) => {
      if (!key) return;
      setActiveCell(key);
      cellRefs.current.get(key)?.focus();
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, cell: GridCell<CalendarSlot>) => {
      const { rowIndex, dayIndex, rowSpan } = cell;
      const lastDay = DAYS.length - 1;
      let next: string | null = null;

      switch (event.key) {
        case "ArrowRight":
          next = resolve(rowIndex, Math.min(dayIndex + 1, lastDay), 1);
          break;
        case "ArrowLeft":
          next = resolve(rowIndex, Math.max(dayIndex - 1, 0), 1);
          break;
        case "ArrowDown":
          next = resolve(rowIndex + rowSpan, dayIndex, 1);
          break;
        case "ArrowUp":
          next = resolve(rowIndex - 1, dayIndex, -1);
          break;
        case "Home":
          next = resolve(rowIndex, 0, 1);
          break;
        case "End":
          next = resolve(rowIndex, lastDay, 1);
          break;
        case "PageUp":
          next = resolve(0, dayIndex, 1);
          break;
        case "PageDown":
          next = resolve(scheduleRows.length - 1, dayIndex, -1);
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          activate(cell);
          return;
        case "Escape":
          setTooltip(null);
          return;
        default:
          return;
      }

      event.preventDefault();
      moveTo(next);
    },
    [activate, moveTo, resolve, scheduleRows.length],
  );

  const headingId = `calendar-grid-${calendarId ?? "personal"}`;

  return (
    <div>
      <h3
        id={headingId}
        className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 px-2"
      >
        {classGroupName}
      </h3>
      <div className="overflow-x-auto -mx-6 border-4 border-white dark:border-gray-800/20">
        <table
          role="grid"
          aria-labelledby={headingId}
          className="w-full border-collapse table-fixed"
        >
          <thead>
            <tr className="bg-gradient-to-r from-blue-50 to-blue-100/30 dark:from-gray-800/30 dark:to-gray-800/30 border-b-4 border-white dark:border-none">
              <th
                scope="col"
                className="p-2 text-center text-xs font-semibold text-blue-600 dark:text-gray-300 w-24 min-w-24"
              >
                Time
              </th>
              {DAYS.map((day, idx) => {
                const isToday = idx === todayIndex;
                return (
                  <th
                    key={idx}
                    scope="col"
                    aria-current={isToday ? "date" : undefined}
                    className="p-2 text-center text-sm font-semibold text-gray-600 dark:text-gray-300 flex-1 min-w-0"
                  >
                    <div className="flex flex-col items-center">
                      <span
                        className={`px-3 py-1 rounded-full text-xs ${
                          isToday
                            ? "bg-blue-600 text-white"
                            : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                        }`}
                      >
                        {day}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="border-b border-blue-200/50 dark:border-blue-700/20">
            {scheduleRows.map((scheduleSlot, scheduleIdx) => {
              const isBreakOrLunch =
                scheduleSlot.type === "break" || scheduleSlot.type === "lunch";
              const isNow = scheduleIdx === currentRowIndex && todayIndex !== -1;

              return (
                <tr
                  key={`${scheduleSlot.start}-${scheduleSlot.end}`}
                  className={`border-t border-gray-100 dark:border-gray-700/20 ${
                    isBreakOrLunch
                      ? "h-10 bg-gray-50 dark:bg-gray-800/10"
                      : "h-16"
                  } transition-colors`}
                >
                  {/* TIME CELL */}
                  <th
                    scope="row"
                    className={`p-2 text-center text-xs font-medium align-middle border border-blue-200/50 dark:border-blue-700/20 ${
                      isNow ? "border-l-4 !border-l-rose-500" : ""
                    } ${
                      isBreakOrLunch
                        ? "h-10 bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500/60 font-light"
                        : "h-16 bg-gray-50 dark:bg-gray-800/20 text-gray-700 dark:text-gray-200 font-semibold"
                    }`}
                  >
                    <div>{scheduleSlot.start}</div>
                    <div>{scheduleSlot.end}</div>
                    {isBreakOrLunch && (
                      <div className="text-[9px] font-bold mt-1 text-orange-600 dark:text-orange-400">
                        {scheduleSlot.type === "lunch" ? "🍴 LUNCH" : "⏸ BREAK"}
                      </div>
                    )}
                    {isNow && (
                      <div className="text-[9px] font-bold mt-1 text-rose-600 dark:text-rose-400">
                        ● NOW {minutesToTime(nowMinutes)}
                      </div>
                    )}
                  </th>

                  {/* DAY CELLS */}
                  {DAYS.map((_, dayIdx) => {
                    const key = cellKey(scheduleIdx, dayIdx);
                    const cell = layout.cells.get(key);
                    // A rowSpan from an earlier row already covers this one
                    if (!cell) return null;

                    const weekDate = weekDates[dayIdx];
                    const isToday = dayIdx === todayIndex;

                    if (isBreakOrLunch) {
                      return (
                        <td
                          key={dayIdx}
                          className="p-2 border-l border-gray-100 dark:border-gray-700/20 bg-gray-100 dark:bg-gray-800/50"
                        />
                      );
                    }

                    const isTabStop = key === tabStop;
                    const course = cell.slot;
                    const dayLabel = `${DAYS_FULL[dayIdx]} ${scheduleSlot.start}`;
                    const commonProps = {
                      ref: (el: HTMLTableCellElement | null) => {
                        if (el) cellRefs.current.set(key, el);
                        else cellRefs.current.delete(key);
                      },
                      role: "gridcell",
                      tabIndex: isTabStop ? 0 : -1,
                      onFocus: () => setActiveCell(key),
                      onKeyDown: (e: React.KeyboardEvent) =>
                        handleKeyDown(e, cell),
                    };

                    if (course) {
                      const progress = isToday
                        ? lessonProgress(course, nowMinutes)
                        : null;
                      const instructor = instructorOf(course);

                      return (
                        <td
                          {...commonProps}
                          key={dayIdx}
                          rowSpan={cell.rowSpan}
                          aria-label={`${dayLabel}, ${course.subject_name ?? "Lesson"}, ${course.start_time} to ${course.end_time}${instructor ? `, ${instructor}` : ""}`}
                          className={`p-0 border-l border-gray-100 dark:border-gray-700/20 relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                            isToday ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                          }`}
                          onClick={() => activate(cell)}
                          onMouseEnter={(e) =>
                            showTooltip(course, e.currentTarget)
                          }
                          onMouseLeave={() => setTooltip(null)}
                          onFocus={(e) => {
                            setActiveCell(key);
                            showTooltip(course, e.currentTarget);
                          }}
                          onBlur={() => setTooltip(null)}
                        >
                          <div
                            className="absolute inset-0.5 overflow-hidden rounded-sm"
                            style={{ backgroundColor: course.color || "#3B82F6" }}
                          >
                            <div
                              className={`h-full p-2 text-xs hover:brightness-110 transition-all duration-200 flex flex-col justify-start ${
                                progress !== null
                                  ? "ring-2 ring-rose-400 shadow-lg"
                                  : isToday
                                    ? "ring-2 ring-white dark:ring-gray-600 shadow-lg"
                                    : ""
                              }`}
                            >
                              <div className="font-medium text-white truncate">
                                {course.subject_name}
                              </div>
                              <div className="text-white/90 text-[10px] mt-1 font-medium">
                                {course.start_time} - {course.end_time}
                              </div>
                            </div>
                            {progress !== null && (
                              <div
                                className="absolute bottom-0 left-0 h-1 bg-white/90"
                                style={{ width: `${progress * 100}%` }}
                                aria-hidden="true"
                              />
                            )}
                          </div>
                        </td>
                      );
                    }

                    // Empty cell
                    return (
                      <td
                        {...commonProps}
                        key={dayIdx}
                        aria-label={`${dayLabel}, free${canEdit ? " — press Enter to schedule a lesson" : ""}`}
                        className={`p-2 border-l border-gray-100 dark:border-gray-700/20 group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                          canEdit
                            ? "cursor-pointer hover:bg-blue-500 dark:hover:bg-blue-900/20 transition-colors"
                            : ""
                        } ${isToday ? "bg-blue-100 dark:bg-blue-900/10" : ""} ${
                          isNow ? "ring-1 ring-inset ring-rose-400/60" : ""
                        }`}
                        onClick={() => activate(cell)}
                        title={
                          weekDate
                            ? `${DAYS_FULL[dayIdx]} ${scheduleSlot.start} - ${scheduleSlot.end}`
                            : undefined
                        }
                      >
                        {canEdit && dayIdx < 5 && (
                          <div className="flex items-center justify-center text-4xl text-blue-300/10 group-hover:text-white dark:text-gray-900/10">
                            <MdAdd />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tooltip && (
        <div
          role="tooltip"
          // Fixed to the viewport: the grid scrolls horizontally, and a tooltip
          // positioned inside that container would be clipped by its overflow.
          style={{ left: tooltip.x, top: tooltip.y }}
          className="fixed z-50 -translate-x-1/2 -translate-y-full mb-2 pointer-events-none max-w-xs rounded-lg bg-gray-900/95 dark:bg-gray-800 px-3 py-2 text-xs text-white shadow-xl ring-1 ring-white/10"
        >
          <div className="font-semibold">{tooltip.slot.subject_name}</div>
          {tooltip.slot.subject_code && (
            <div className="text-white/60">{tooltip.slot.subject_code}</div>
          )}
          <div className="mt-1 text-white/90">
            {tooltip.slot.start_time} - {tooltip.slot.end_time}
          </div>
          {tooltip.slot.class_group_name && (
            <div className="text-white/80">{tooltip.slot.class_group_name}</div>
          )}
          {instructorOf(tooltip.slot) && (
            <div className="text-white/80">{instructorOf(tooltip.slot)}</div>
          )}
          {tooltip.slot.location && (
            <div className="text-white/60">📍 {tooltip.slot.location}</div>
          )}
          {tooltip.slot.notes && (
            <div className="mt-1 text-white/60 italic">{tooltip.slot.notes}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default CalendarGrid;
