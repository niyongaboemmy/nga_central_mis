import React, { useMemo } from "react";
import { MdAdd } from "react-icons/md";
import type { CalendarSlot, CalendarActivity } from "../../api/calendar";
import {
  DAYS,
  buildScheduleRows,
  displayDayToBackend,
  backendDayToDisplay,
  countScheduleSlots,
} from "./calendarConstants";

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
  const calendarSlots = calendarId
    ? slots.filter((s) => s.calendar_id === calendarId)
    : slots;

  // Rows follow the data: a period outside the standard timetable still needs
  // a row of its own, or its slots match nothing and the grid renders empty.
  const scheduleRows = useMemo(
    () => buildScheduleRows(calendarSlots),
    [calendarSlots],
  );

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 px-2">
        {classGroupName}
      </h3>
      <div className="overflow-x-auto -mx-6 border-4 border-white dark:border-gray-800/20">
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr className="bg-gradient-to-r from-blue-50 to-blue-100/30 dark:from-gray-800/30 dark:to-gray-800/30 border-b-4 border-white dark:border-none">
              <th className="p-2 text-center text-xs font-semibold text-blue-600 dark:text-gray-300 w-24 min-w-24">
                Time
              </th>
              {DAYS.map((day, idx) => (
                <th
                  key={idx}
                  className="p-2 text-center text-sm font-semibold text-gray-600 dark:text-gray-300 flex-1 min-w-0"
                >
                  <div className="flex flex-col items-center">
                    <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-xs">
                      {day}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="border-b border-blue-200/50 dark:border-blue-700/20">
            {(() => {
              const occupiedCells = new Set<string>(); // key: "dayIdx-scheduleIdx"

              return scheduleRows.map((scheduleSlot, scheduleIdx) => {
                const isBreakOrLunch =
                  scheduleSlot.type === "break" ||
                  scheduleSlot.type === "lunch";

                return (
                  <tr
                    key={scheduleIdx}
                    className={`border-t border-gray-100 dark:border-gray-700/20 ${
                      isBreakOrLunch
                        ? "h-10 bg-gray-50 dark:bg-gray-800/10"
                        : "h-16"
                    } transition-colors`}
                  >
                    {/* TIME CELL */}
                    <td
                      className={`p-2 text-center text-xs font-medium align-middle border border-blue-200/50 dark:border-blue-700/20 ${
                        isBreakOrLunch
                          ? "h-10 bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500/60 font-light"
                          : "h-16 bg-gray-50 dark:bg-gray-800/20 text-gray-700 dark:text-gray-200 font-semibold"
                      }`}
                    >
                      <div className="">{scheduleSlot.start}</div>
                      <div className="">{scheduleSlot.end}</div>
                      {isBreakOrLunch && (
                        <div className="text-[9px] font-bold mt-1 text-orange-600 dark:text-orange-400">
                          {scheduleSlot.type === "lunch"
                            ? "🍴 LUNCH"
                            : "⏸ BREAK"}
                        </div>
                      )}
                    </td>

                    {/* DAY CELLS */}
                    {DAYS.map((_, dayIdx) => {
                      const weekDate = weekDates[dayIdx];
                      const isToday =
                        weekDate &&
                        new Date().toDateString() === weekDate.toDateString();

                      // Skip rendering this cell — a rowspan from a previous row covers it
                      const cellKey = `${dayIdx}-${scheduleIdx}`;
                      if (occupiedCells.has(cellKey)) return null;

                      if (isBreakOrLunch) {
                        return (
                          <td
                            key={dayIdx}
                            className={`p-2 border-l border-gray-100 dark:border-gray-700/20 ${
                              scheduleSlot.type === "lunch"
                                ? "bg-gray-100 dark:bg-gray-800/50"
                                : "bg-gray-100 dark:bg-gray-800/50"
                            }`}
                          />
                        );
                      }

                      const courseStartingHere = calendarSlots.find(
                        (s) =>
                          s.day_of_week === displayDayToBackend(dayIdx) &&
                          s.start_time === scheduleSlot.start,
                      );

                      if (courseStartingHere) {
                        const rowSpan = countScheduleSlots(
                          courseStartingHere.start_time,
                          courseStartingHere.end_time,
                          scheduleRows,
                          scheduleIdx,
                        );

                        // Mark all future rows this rowspan will cover as occupied
                        for (let r = 1; r < rowSpan; r++) {
                          occupiedCells.add(`${dayIdx}-${scheduleIdx + r}`);
                        }

                        return (
                          <td
                            key={dayIdx}
                            rowSpan={rowSpan}
                            className={`p-0 border-l border-gray-100 dark:border-gray-700/20 relative ${
                              isToday ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                            }`}
                            onClick={() => {
                              // Construct the proper format for SubjectSelect
                              const subjectValue = `${courseStartingHere.subject_id}_${courseStartingHere.user_id}_${courseStartingHere.class_group_id || ""}`;
                              onSlotClick(
                                {
                                  ...courseStartingHere,
                                  subject_id: parseInt(
                                    subjectValue.split("_")[0],
                                  ),
                                  day_of_week: backendDayToDisplay(
                                    courseStartingHere.day_of_week,
                                  ),
                                } as CalendarSlot,
                                weekDate!,
                              );
                            }}
                          >
                            <div
                              className="absolute inset-0.5 overflow-hidden rounded-sm"
                              style={{
                                backgroundColor:
                                  courseStartingHere.color || "#3B82F6",
                              }}
                            >
                              <div
                                className={`h-full p-2 text-xs cursor-pointer hover:brightness-110 transition-all duration-200 flex flex-col justify-start ${
                                  isToday
                                    ? "ring-2 ring-white dark:ring-gray-600 shadow-lg"
                                    : ""
                                }`}
                                title={`${courseStartingHere.subject_name} - ${courseStartingHere.class_group_name}`}
                              >
                                <div className="font-medium text-white truncate">
                                  {courseStartingHere.subject_name}
                                </div>
                                <div className="text-white/90 text-[10px] mt-1 font-medium">
                                  {courseStartingHere.start_time} -{" "}
                                  {courseStartingHere.end_time}
                                </div>
                              </div>
                            </div>
                          </td>
                        );
                      }

                      // Empty cell
                      return (
                        <td
                          key={dayIdx}
                          className={`p-2 border-l border-gray-100 dark:border-gray-700/20 group ${
                            canEdit
                              ? "cursor-pointer hover:bg-blue-500 dark:hover:bg-blue-900/20 transition-colors"
                              : ""
                          } ${isToday ? "bg-blue-100 dark:bg-blue-900/10" : ""}`}
                          onClick={() => {
                            if (canEdit && calendarId) {
                              onEmptyCellClick(
                                dayIdx,
                                scheduleSlot,
                                calendarId,
                              );
                            }
                          }}
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
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CalendarGrid;
