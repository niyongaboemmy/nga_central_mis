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
  isTeachingRow,
  minutesToTime,
  timeToMinutes,
} from "./calendarConstants";
import { buildGridLayout, cellKey, type GridCell } from "./calendarLayout";
import SlotTooltip, { instructorOf, useSlotTooltip } from "./SlotTooltip";
import { useCurrentTime } from "./useCurrentTime";
import {
  getSlotColor,
  hexToRgba,
  readableTextColor,
  shadeColor,
} from "./slotColor";

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
  /** Opens an existing custom activity (non-subject event) for view/edit. */
  onActivityClick?: (activity: CalendarActivity) => void;
  canEdit?: boolean;
}

/**
 * A custom activity rendered on the weekly grid.
 *
 * Activities aren't tied to a subject or instructor, but they occupy a
 * day + time range exactly like a lesson does, so they're mapped onto the
 * same `CalendarSlot` shape the layout engine already understands (negative
 * `slot_id` keeps them from colliding with real slot ids) and tagged with
 * `__activity` so clicks route to the activity editor instead of the lesson one.
 */
type GridEntry = CalendarSlot & { __activity?: CalendarActivity };

const activityToEntry = (
  a: CalendarActivity,
  calendarId?: number,
): GridEntry => ({
  slot_id: -Math.abs(a.activity_id),
  calendar_id: calendarId,
  academic_term_id: a.academic_term_id,
  class_group_id: a.class_group_id,
  subject_id: 0,
  user_id: 0,
  day_of_week: Number(a.day_of_week ?? 0),
  start_time: a.start_time,
  end_time: a.end_time,
  location: a.location,
  color: a.color || "#10B981",
  notes: a.description,
  subject_name: a.activity_name,
  class_group_name: a.activity_type,
  __activity: a,
});

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
  activities,
  weekDates,
  onSlotClick,
  onEmptyCellClick,
  onActivityClick,
  canEdit = false,
}) => {
  // Filter slots for this calendar (skip filtering for personal/teacher & student
  // views, which have no calendar_id — slots are already scoped server-side).
  // Custom activities (non-subject events) are merged in as pseudo-slots so the
  // layout engine positions them exactly like lessons; only weekly (recurring
  // day-of-week) activities are drawn here — one-off dated ones are skipped.
  const calendarSlots = useMemo(() => {
    const base = calendarId
      ? slots.filter((s) => s.calendar_id === calendarId)
      : slots;
    const activityEntries = (activities ?? [])
      .filter(
        (a) =>
          a.start_time &&
          a.end_time &&
          a.day_of_week !== null &&
          a.day_of_week !== undefined,
      )
      .map((a) => activityToEntry(a, calendarId));
    return [...base, ...activityEntries];
  }, [calendarId, slots, activities]);

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
        calendarSlots.filter(
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

  const { tooltip, show: showTooltip, hide: hideTooltip } = useSlotTooltip();
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());

  // Roving tabindex: exactly one cell is in the tab order at a time, and the
  // arrow keys move that point rather than tabbing through 84 cells.
  const firstCourseCell = useMemo(() => {
    const row = scheduleRows.findIndex((r) => r.type === "course");
    return row === -1 ? null : cellKey(row, 0);
  }, [scheduleRows]);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const tabStop = activeCell ?? firstCourseCell;

  const activate = useCallback(
    (cell: GridCell<CalendarSlot>, target?: CalendarSlot) => {
      const weekDate = weekDates[cell.dayIndex];
      const slot = target ?? cell.slots[0];
      if (slot) {
        const activity = (slot as GridEntry).__activity;
        if (activity) {
          onActivityClick?.(activity);
          return;
        }
        onSlotClick(
          {
            ...slot,
            day_of_week: backendDayToDisplay(Number(slot.day_of_week)),
          } as CalendarSlot,
          weekDate!,
        );
        return;
      }
      if (canEdit && calendarId) {
        onEmptyCellClick(cell.dayIndex, scheduleRows[cell.rowIndex], calendarId);
      }
    },
    [
      calendarId,
      canEdit,
      onActivityClick,
      onEmptyCellClick,
      onSlotClick,
      scheduleRows,
      weekDates,
    ],
  );

  /** The nearest navigable (course-row) cell at or beyond a coordinate. */
  const resolve = useCallback(
    (rowIndex: number, dayIndex: number, step: 1 | -1): string | null => {
      for (let r = rowIndex; r >= 0 && r < scheduleRows.length; r += step) {
        const owner = layout.ownerOf.get(cellKey(r, dayIndex));
        const cell = owner ? layout.cells.get(owner) : undefined;
        if (cell && isTeachingRow(cell)) return owner!;
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
          hideTooltip();
          return;
        default:
          return;
      }

      event.preventDefault();
      moveTo(next);
    },
    [activate, hideTooltip, moveTo, resolve, scheduleRows.length],
  );

  const headingId = `calendar-grid-${calendarId ?? "personal"}`;

  // One swatch per distinct subject actually on this grid, so the colours mean
  // something to the reader instead of being decoration.
  const subjectLegend = useMemo(() => {
    const seen = new Map<string, { name: string; color: string }>();
    for (const s of calendarSlots) {
      if ((s as GridEntry).__activity) continue;
      const name = s.subject_name;
      if (!name || seen.has(name)) continue;
      seen.set(name, { name, color: getSlotColor(s) });
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [calendarSlots]);

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
              const isTeaching = isTeachingRow(scheduleSlot);
              const isNow = scheduleIdx === currentRowIndex && todayIndex !== -1;

              return (
                <tr
                  key={`${scheduleSlot.start}-${scheduleSlot.end}`}
                  className={`border-t border-gray-100 dark:border-gray-700/20 ${
                    isTeaching ? "h-16" : "h-10 bg-gray-50 dark:bg-gray-800/10"
                  } transition-colors`}
                >
                  {/* TIME CELL */}
                  <th
                    scope="row"
                    className={`p-2 text-center text-xs font-medium align-middle border border-blue-200/50 dark:border-blue-700/20 ${
                      isNow ? "border-l-4 !border-l-rose-500" : ""
                    } ${
                      isTeaching
                        ? "h-16 bg-gray-50 dark:bg-gray-800/20 text-gray-700 dark:text-gray-200 font-semibold"
                        : "h-10 bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500/60 font-light"
                    }`}
                  >
                    {isTeaching && scheduleSlot.label && (
                      <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                        {scheduleSlot.label}
                      </div>
                    )}
                    <div>{scheduleSlot.start}</div>
                    <div>{scheduleSlot.end}</div>
                    {isNow && (
                      <div className="text-[9px] font-bold mt-1 text-rose-600 dark:text-rose-400">
                        ● NOW {minutesToTime(nowMinutes)}
                      </div>
                    )}
                  </th>

                  {/* Breaks, lunch and office hours run right across the week,
                      as one labelled band rather than seven blank cells. */}
                  {!isTeaching && (
                    <td
                      colSpan={DAYS.length}
                      className={`border-l border-gray-100 dark:border-gray-700/20 text-center text-[11px] font-bold uppercase tracking-wider ${
                        scheduleSlot.type === "lunch"
                          ? "bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400/80"
                          : "bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400/70"
                      }`}
                    >
                      {scheduleSlot.label}
                    </td>
                  )}

                  {/* DAY CELLS */}
                  {isTeaching &&
                    DAYS.map((_, dayIdx) => {
                    const key = cellKey(scheduleIdx, dayIdx);
                    const cell = layout.cells.get(key);
                    // A rowSpan from an earlier row already covers this one
                    if (!cell) return null;

                    const weekDate = weekDates[dayIdx];
                    const isToday = dayIdx === todayIndex;

                    const isTabStop = key === tabStop;
                    const courses = cell.slots;
                    const dayLabel = `${DAYS_FULL[dayIdx]} ${scheduleSlot.label ? `${scheduleSlot.label} ` : ""}${scheduleSlot.start}`;
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

                    if (courses.length > 0) {
                      const label = courses
                        .map(
                          (c) =>
                            `${c.subject_name ?? "Lesson"}${c.class_group_name ? `, ${c.class_group_name}` : ""}, ${c.start_time} to ${c.end_time}${instructorOf(c) ? `, ${instructorOf(c)}` : ""}`,
                        )
                        .join("; ");

                      return (
                        <td
                          {...commonProps}
                          key={dayIdx}
                          rowSpan={cell.rowSpan}
                          aria-label={`${dayLabel}, ${label}`}
                          className={`p-0 border-l border-gray-100 dark:border-gray-700/20 relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                            isToday ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                          }`}
                          onFocus={() => {
                            setActiveCell(key);
                            const el = cellRefs.current.get(key);
                            if (el) showTooltip(courses[0], el);
                          }}
                          onBlur={hideTooltip}
                        >
                          {/* Lessons that start at the same time sit side by
                              side rather than one hiding the other. */}
                          <div className="absolute inset-1 flex gap-1">
                            {courses.map((course) => {
                              const progress = isToday
                                ? lessonProgress(course, nowMinutes)
                                : null;
                              const isActivity = Boolean(
                                (course as GridEntry).__activity,
                              );
                              const color = getSlotColor(course);
                              const textColor = readableTextColor(color);
                              const isLive = progress !== null;
                              return (
                                <div
                                  key={course.slot_id}
                                  className={`group/slot relative flex-1 min-w-0 overflow-hidden rounded-lg cursor-pointer transition-all duration-200 hover:-translate-y-px ${
                                    isLive
                                      ? "ring-2 ring-rose-400 shadow-lg shadow-rose-500/20"
                                      : isToday
                                        ? "shadow-md"
                                        : "shadow-sm hover:shadow-md"
                                  }`}
                                  style={{
                                    background: `linear-gradient(160deg, ${hexToRgba(
                                      color,
                                      0.96,
                                    )}, ${shadeColor(color, 0.82)})`,
                                    borderLeft: `3px solid ${shadeColor(color, 0.6)}`,
                                  }}
                                  onClick={() => activate(cell, course)}
                                  onMouseEnter={(e) =>
                                    showTooltip(course, e.currentTarget)
                                  }
                                  onMouseLeave={hideTooltip}
                                >
                                  {/* top sheen for a bit of depth */}
                                  <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
                                    style={{
                                      background:
                                        "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0))",
                                    }}
                                  />
                                  <div
                                    className="relative h-full p-2 text-xs flex flex-col justify-start gap-0.5"
                                    style={{ color: textColor }}
                                  >
                                    <div className="flex items-center gap-1 min-w-0">
                                      {isActivity && (
                                        <span
                                          aria-hidden="true"
                                          className="text-[9px] font-bold uppercase tracking-wide px-1 py-px rounded"
                                          style={{
                                            backgroundColor: hexToRgba(
                                              textColor === "#ffffff"
                                                ? "#000000"
                                                : "#ffffff",
                                              0.18,
                                            ),
                                          }}
                                        >
                                          Event
                                        </span>
                                      )}
                                      <span className="font-semibold truncate">
                                        {course.subject_name}
                                      </span>
                                    </div>
                                    {course.class_group_name && (
                                      <div
                                        className="text-[10px] truncate"
                                        style={{ opacity: 0.85 }}
                                      >
                                        {course.class_group_name}
                                      </div>
                                    )}
                                    <div
                                      className="text-[10px] mt-auto font-medium tabular-nums"
                                      style={{ opacity: 0.9 }}
                                    >
                                      {course.start_time} - {course.end_time}
                                    </div>
                                  </div>
                                  {isLive && (
                                    <div
                                      className="absolute bottom-0 left-0 h-1 bg-white/90"
                                      style={{ width: `${(progress ?? 0) * 100}%` }}
                                      aria-hidden="true"
                                    />
                                  )}
                                </div>
                              );
                            })}
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
                        className={`p-1 border-l border-gray-100 dark:border-gray-700/20 group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                          canEdit
                            ? "cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/15 transition-colors"
                            : ""
                        } ${isToday ? "bg-blue-50/60 dark:bg-blue-900/10" : ""} ${
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
                          <div className="flex h-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 dark:text-blue-400 text-lg">
                              <MdAdd />
                            </span>
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

      {subjectLegend.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 px-2">
          {subjectLegend.map((s) => (
            <div
              key={s.name}
              className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300"
            >
              <span
                className="w-3 h-3 rounded-[4px] flex-shrink-0 ring-1 ring-black/5"
                style={{ backgroundColor: s.color }}
              />
              <span className="truncate max-w-[12rem]">{s.name}</span>
            </div>
          ))}
        </div>
      )}

      <SlotTooltip state={tooltip} />
    </div>
  );
};

export default CalendarGrid;
