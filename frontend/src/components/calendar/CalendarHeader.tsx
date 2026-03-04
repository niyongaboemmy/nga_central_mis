import React from "react";
import { Calendar, Bell } from "lucide-react";
import { AcademicTerm } from "../../api/academics";
import type { AcademicCalendar } from "../../api/calendar";

interface CalendarHeaderProps {
  isAdmin: boolean | undefined;
  isStudent: boolean | undefined;
  academicYears: any[];
  academicTerms: AcademicTerm[];
  calendars: AcademicCalendar[];
  selectedYear: number | null;
  selectedTerm: number | null;
  selectedCalendar: AcademicCalendar | null;
  dateRangeString: string;
  onYearChange: (yearId: number) => void;
  onTermChange: (termId: number) => void;
  onCalendarChange: (calendar: AcademicCalendar | null) => void;
  onCreateCalendarClick: () => void;
  onAddSlotClick: () => void;
  onNotificationsClick: () => void;
  canEdit?: boolean;
}

const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  isAdmin,
  isStudent,
  academicYears,
  academicTerms,
  calendars,
  selectedYear,
  selectedTerm,
  selectedCalendar,
  dateRangeString,
  onYearChange,
  onTermChange,
  onCalendarChange,
  onCreateCalendarClick,
  onNotificationsClick,
  canEdit = false,
}) => {
  const getTitle = () => {
    if (isAdmin) return "Academic Calendar";
    if (isStudent) return "My Class Schedule";
    return "My Teaching Calendar";
  };

  const getTermName = () => {
    const term = academicTerms.find((t) => t.academic_term_id === selectedTerm);
    return term?.name || "Select a term";
  };

  return (
    <div className="flex items-center justify-between mb-0">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center">
          <Calendar className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {getTitle()}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {getTermName()}
            {dateRangeString && (
              <span className="ml-2 text-blue-600 dark:text-blue-400 font-medium">
                • Week: {dateRangeString}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-4">
        {/* Academic Year/Term Selector */}
        <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-700/20 p-1.5 rounded-full">
          <select
            value={selectedYear || ""}
            onChange={(e) => {
              const yearId = parseInt(e.target.value);
              onYearChange(yearId);
            }}
            className="px-4 py-2 text-sm bg-transparent border-0 rounded-full focus:ring-2 focus:ring-blue-500 dark:text-white"
          >
            <option value="">Year</option>
            {academicYears.map((year: any) => (
              <option key={year.academic_year_id} value={year.academic_year_id}>
                {year.name}
              </option>
            ))}
          </select>
          <span className="text-gray-400">|</span>
          <select
            value={selectedTerm || ""}
            onChange={(e) => onTermChange(parseInt(e.target.value))}
            className="px-4 py-2 text-sm bg-transparent border-0 rounded-full focus:ring-2 focus:ring-blue-500 dark:text-white"
          >
            <option value="">Term</option>
            {academicTerms.map((term: AcademicTerm) => (
              <option key={term.academic_term_id} value={term.academic_term_id}>
                {term.name}
              </option>
            ))}
          </select>
          {isAdmin && (
            <>
              <span className="text-gray-400">|</span>
              <select
                value={selectedCalendar?.calendar_id || ""}
                onChange={(e) => {
                  const calendarId = parseInt(e.target.value);
                  const calendar = calendars.find(
                    (c) => c.calendar_id === calendarId,
                  );
                  onCalendarChange(calendar || null);
                }}
                className="px-4 py-2 text-sm bg-transparent border-0 rounded-full focus:ring-2 focus:ring-blue-500 dark:text-white"
              >
                <option value="">All Class Groups</option>
                {calendars
                  .filter(
                    (c) =>
                      c.academic_year_id === selectedYear &&
                      c.academic_term_id === selectedTerm,
                  )
                  .map((calendar) => (
                    <option
                      key={calendar.calendar_id}
                      value={calendar.calendar_id}
                    >
                      {calendar.class_group_name}
                    </option>
                  ))}
              </select>
            </>
          )}
        </div>

        {/* Admin Action Buttons */}
        {isAdmin && canEdit && (
          <>
            <button
              onClick={onCreateCalendarClick}
              className="flex items-center px-5 py-2.5 text-sm bg-gradient-to-r from-blue-600 to-blue-600 text-white rounded-full hover:from-blue-700 hover:to-blue-700 transition-all duration-200"
            >
              <Calendar className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Create Calendar</span>
            </button>
          </>
        )}

        {/* Notification Button for Instructors */}
        {!isAdmin && !isStudent && (
          <button
            onClick={onNotificationsClick}
            className="flex items-center px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200"
          >
            <Bell className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Notifications</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default CalendarHeader;
