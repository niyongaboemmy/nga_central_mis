import React from "react";
import { Calendar, Bell, Download } from "lucide-react";
import { AcademicTerm } from "../../api/academics";
import type { AcademicCalendar } from "../../api/calendar";

interface CalendarHeaderProps {
  isAdmin: boolean | undefined;
  /** Overrides the heading, so an embedding page (the class teacher's own
   *  Class Calendar) titles the grid itself instead of stacking a second
   *  header of its own above it. */
  title?: string;
  isStudent: boolean | undefined;
  academicYears: any[];
  academicTerms: AcademicTerm[];
  calendars: AcademicCalendar[];
  // Every class group in the selected year, regardless of whether it
  // already has a calendar for the current term — lets the selector list
  // groups that still need a first calendar, not just ones that have one.
  allClassGroupsForYear?: { class_group_id: number; name: string }[];
  selectedYear: number | null;
  selectedTerm: number | null;
  selectedCalendar: AcademicCalendar | null;
  myClassGroups?: {
    class_group_id: number;
    name: string;
    grade_name?: string;
  }[];
  selectedTeacherClassGroupId?: number | null;
  dateRangeString: string;
  onCalendarChange: (calendar: AcademicCalendar | null) => void;
  onTeacherClassGroupChange?: (classGroupId: number | null) => void;
  onCreateCalendarClick: () => void;
  onAddSlotClick: () => void;
  onNotificationsClick: () => void;
  /** Exports the currently displayed grid as a designed PDF. Omitted (or
   *  `canDownload` false) hides the button rather than showing it disabled —
   *  there's nothing useful to click before a grid has data. */
  onDownloadPdf?: () => void;
  canDownload?: boolean;
  canEdit?: boolean;
  canCreate?: boolean;
  isCreatingCalendar?: boolean;
}

const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  isAdmin,
  title,
  isStudent,
  academicYears,
  academicTerms,
  calendars,
  allClassGroupsForYear = [],
  selectedYear,
  selectedTerm,
  selectedCalendar,
  myClassGroups = [],
  selectedTeacherClassGroupId,
  dateRangeString,
  onCalendarChange,
  onTeacherClassGroupChange,
  onCreateCalendarClick,
  onNotificationsClick,
  onDownloadPdf,
  canDownload = false,
  canEdit = false,
  canCreate = false,
  isCreatingCalendar,
}) => {
  const getTitle = () => {
    if (title) return title;
    if (isAdmin) return "Academic Calendar";
    if (isStudent) return "My Class Schedule";
    return "My Teaching Calendar";
  };

  const getTermName = () => {
    const term = academicTerms.find((t) => t.academic_term_id === selectedTerm);
    return term?.name || "Select a term";
  };

  const getYearName = () => {
    const year = academicYears.find(
      (y: any) => y.academic_year_id === selectedYear,
    );
    return year?.name || "Select a year";
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
        {/* Academic Year/Term — read-only; switch it from the top navigation bar */}
        <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-700/20 p-1.5 rounded-full">
          <span
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200"
            title="Change the academic year and term from the top navigation bar"
          >
            {getYearName()} / {getTermName()}
          </span>
          {isAdmin && (
            <>
              <span className="text-gray-400">|</span>
              <select
                value={selectedCalendar?.class_group_id ?? ""}
                onChange={(e) => {
                  const classGroupId = parseInt(e.target.value);
                  if (!classGroupId) {
                    onCalendarChange(null);
                    return;
                  }
                  const existingCalendar = calendars.find(
                    (c) =>
                      c.class_group_id === classGroupId &&
                      c.academic_year_id === selectedYear &&
                      c.academic_term_id === selectedTerm,
                  );
                  if (existingCalendar) {
                    onCalendarChange(existingCalendar);
                    return;
                  }
                  // No calendar exists yet for this class group/term — pass
                  // a placeholder (calendar_id: 0) so the page can show a
                  // "create a calendar for this group" prompt instead of
                  // nothing selectable at all.
                  const group = allClassGroupsForYear.find(
                    (g) => g.class_group_id === classGroupId,
                  );
                  onCalendarChange({
                    calendar_id: 0,
                    academic_year_id: selectedYear ?? 0,
                    academic_term_id: selectedTerm ?? 0,
                    class_group_id: classGroupId,
                    class_group_name: group?.name,
                    is_active: 0,
                  });
                }}
                className="px-4 py-2 text-sm bg-transparent border-0 rounded-full focus:ring-2 focus:ring-blue-500 dark:text-white"
              >
                <option value="">Select a class group</option>
                {allClassGroupsForYear.map((group) => {
                  const hasCalendar = calendars.some(
                    (c) =>
                      c.class_group_id === group.class_group_id &&
                      c.academic_year_id === selectedYear &&
                      c.academic_term_id === selectedTerm,
                  );
                  return (
                    <option key={group.class_group_id} value={group.class_group_id}>
                      {group.name}
                      {!hasCalendar ? " (no calendar yet)" : ""}
                    </option>
                  );
                })}
              </select>
            </>
          )}
          {!isAdmin && !isStudent && myClassGroups.length > 1 && (
            <>
              <span className="text-gray-400">|</span>
              <select
                value={selectedTeacherClassGroupId || ""}
                onChange={(e) => {
                  const classGroupId = e.target.value
                    ? parseInt(e.target.value)
                    : null;
                  onTeacherClassGroupChange?.(classGroupId);
                }}
                className="px-4 py-2 text-sm bg-transparent border-0 rounded-full focus:ring-2 focus:ring-blue-500 dark:text-white"
              >
                <option value="">Select a class group</option>
                {myClassGroups.map((group) => (
                  <option key={group.class_group_id} value={group.class_group_id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {/* Admin Action Buttons */}
        {(isAdmin || canCreate) && (canEdit || canCreate) && (
          <>
            <button
              onClick={onCreateCalendarClick}
              disabled={isCreatingCalendar}
              className="flex items-center px-5 py-2.5 text-sm bg-gradient-to-r from-blue-600 to-blue-600 text-white rounded-full hover:from-blue-700 hover:to-blue-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingCalendar ? (
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Calendar className="w-4 h-4 mr-2" />
              )}
              <span className="hidden sm:inline">
                {isCreatingCalendar ? "Loading..." : "Create Calendar"}
              </span>
            </button>
          </>
        )}

        {/* Notification Button for Instructors */}
        {!isAdmin && !isStudent && (
          <button
            onClick={onNotificationsClick}
            className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200"
          >
            <Bell className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Notifications</span>
          </button>
        )}

        {/* Download PDF — only shown once there's an actual grid to export */}
        {canDownload && onDownloadPdf && (
          <button
            onClick={onDownloadPdf}
            className="flex items-center px-4 py-2 text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-100 dark:border-blue-800/40 transition-all duration-200"
            title="Download this timetable as a PDF"
          >
            <Download className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Download PDF</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default CalendarHeader;
