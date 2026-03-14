import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { InstructorReport } from "../../api/reports";
import { format, isBefore, startOfDay } from "date-fns";

interface ReportingCalendarProps {
  onDateClick: (
    start: string,
    end: string,
    existingReport?: InstructorReport,
  ) => void;
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  reportedDates: InstructorReport[];
  loading: boolean;
}

const ReportingCalendar: React.FC<ReportingCalendarProps> = ({
  onDateClick,
  currentDate,
  setCurrentDate,
  reportedDates,
  loading,
}) => {
  const daysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();

  const prevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1),
    );
  };

  const nextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1),
    );
  };

  const renderDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const totalDays = daysInMonth(year, month);
    // Adjusted to Monday start: 0=Mon, 1=Tue, ..., 6=Sun
    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
    const blanks = Array(firstDay).fill(null);
    const days = Array.from({ length: totalDays }, (_, i) => i + 1);

    const allSlots = [...blanks, ...days];
    const rows: (number | null)[][] = [];
    for (let i = 0; i < allSlots.length; i += 7) {
      rows.push(allSlots.slice(i, i + 7));
    }

    return rows.map((row, i) => (
      <tr
        key={i}
        className="group h-24 border-b border-gray-100 dark:border-gray-700/50 last:border-0"
      >
        <td className="w-12 text-center text-[10px] text-gray-400 font-medium bg-gray-50/50 dark:bg-gray-800/30">
          W
          {getWeekNumber(
            new Date(year, month, row.find((d) => d !== null) || 1),
          )}
        </td>
        {row.map((day, j) => {
          const date = day ? new Date(year, month, day) : null;
          const dateStr = date ? format(date, "yyyy-MM-dd") : null;
          const isToday =
            day &&
            day === new Date().getDate() &&
            month === new Date().getMonth() &&
            year === new Date().getFullYear();

          const existingReport = day
            ? reportedDates.find((r: InstructorReport) => {
                // Normalize dates to yyyy-MM-dd for consistent string comparison
                // Use split to avoid timezone shifting by new Date(string)
                const start = r.start_date.split("T")[0];
                const end = r.end_date.split("T")[0];
                return dateStr && dateStr >= start && dateStr <= end;
              })
            : null;
          const hasReport = !!existingReport;

          const isPast =
            day && date && isBefore(startOfDay(date), startOfDay(new Date()));

          return (
            <td
              key={j}
              className={`relative p-2 transition-all duration-200 
                ${day ? "hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer" : ""} 
                ${isToday ? "bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" : "border-transparent"}
                ${hasReport ? "bg-green-50/30 dark:bg-green-900/5 border-l-4 border-l-green-400/50" : ""}
                ${!hasReport && isPast ? "bg-rose-50/80 dark:bg-rose-900/20 border-l-4 border-l-rose-500" : ""}
              `}
              onClick={() => {
                if (day) {
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  // Daily: start and end are the same date string
                  onDateClick(dateStr, dateStr, existingReport || undefined);
                }
              }}
            >
              {day && (
                <div className="flex flex-col h-full justify-between">
                  <span
                    className={`text-sm font-semibold ${isToday ? "text-blue-600" : "text-gray-700 dark:text-gray-300"}`}
                  >
                    {day}
                  </span>
                  {hasReport ? (
                    <div className="flex items-center space-x-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-xl text-[10px] w-fit font-medium border border-green-100 dark:border-green-800/50">
                      <CheckCircle className="w-3 h-3" />
                      <span>Reported</span>
                    </div>
                  ) : isPast ? (
                    <div className="flex items-center space-x-1.5 bg-rose-600 text-white px-2.5 py-1 rounded-xl text-[10px] w-fit shadow-rose-200 dark:shadow-none font-bold animate-pulse duration-[2000ms]">
                      <AlertCircle className="w-3 h-3" />
                      <span>Action Due</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 px-2 py-0.5 rounded-xl text-[10px] w-fit border border-gray-200 dark:border-gray-700">
                      <span>Upcoming</span>
                    </div>
                  )}
                </div>
              )}
            </td>
          );
        })}
      </tr>
    ));
  };

  const getWeekNumber = (d: Date) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return weekNo;
  };

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Select a day to file your instructor report
          </p>
        </div>

        <div className="flex items-center space-x-3 bg-gray-100 dark:bg-gray-900/50 p-1.5 rounded-2xl">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-white dark:hover:bg-gray-600 rounded-xl transition-all"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-4 py-2 hover:bg-white dark:hover:bg-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 transition-all"
          >
            Today
          </button>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-white dark:hover:bg-gray-600 rounded-xl transition-all"
          >
            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 dark:bg-black/50 z-10 flex items-center justify-center backdrop-blur-[1px] rounded-3xl">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        )}
        <table className="w-full h-full border-collapse">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700/50">
              <th className="w-12 pb-4"></th>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <th
                  key={d}
                  className="pb-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{renderDays()}</tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportingCalendar;
