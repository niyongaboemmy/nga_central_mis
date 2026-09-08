import React, { useState, useEffect, useMemo } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useUser } from "../../contexts/UserContext";
import { useToast } from "../../contexts/ToastContext";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { Permissions } from "../../constants/permissions";
import {
  CalendarSlot,
  getMyCalendar,
  getStudentCalendar,
  getLessonPlanForSlot,
  getMyClassGroups,
} from "../../api/calendar";
import {
  DAYS,
  buildScheduleRows,
  displayDayToBackend,
  countScheduleSlots,
  getStartOfWeek,
  getWeekDates,
  getDateRangeString,
  formatDateShort,
} from "./calendarConstants";
import CalendarSlotModal from "./CalendarSlotModal";
import LessonPlanModal from "./LessonPlanModal";

// ─── DashboardCalendarWidget ───────────────────────────────────────────────
// A compact, read-only weekly schedule grid shown on every user's dashboard.
// No editing, no modals, no admin controls.
// Fetches data independently using the logged-in user's role.

const DashboardCalendarWidget: React.FC = () => {
  const { user } = useUser();
  const { showToast } = useToast();
  const { selectedTermId, selectedTerm, selectedYearId } =
    useAcademicPeriod();

  // Role detection
  const isStudent = user?.roles?.some((role) =>
    role.permissions?.some(
      (perm) => perm.name === Permissions.VIEW_STUDENT_CALENDAR,
    ),
  );

  // State
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [_upcomingLessons, setUpcomingLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    getStartOfWeek(new Date()),
  );

  // Class-group filter (teachers only) — "ALL" shows every class group the
  // teacher is assigned to teach; a specific selection narrows the grid to
  // just that group.
  const [classGroups, setClassGroups] = useState<
    { class_group_id: number; name: string; grade_name?: string }[]
  >([]);
  const [selectedClassGroupId, setSelectedClassGroupId] = useState<
    number | "all"
  >("all");

  // Modal State
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlot | null>(null);
  const [selectedSlotDate, setSelectedSlotDate] = useState<Date | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showLessonPlan, setShowLessonPlan] = useState(false);
  const [lessonPlan, setLessonPlan] = useState<any>(null);
  const [isLoadingLessonPlan, setIsLoadingLessonPlan] = useState(false);
  const [modalMode, setModalMode] = useState<"details" | "form">("details");
  const [formData, setFormData] = useState({
    calendar_id: "",
    class_group_id: "",
    subject_id: "",
    user_id: "",
    day_of_week: "",
    start_time: "",
    end_time: "",
    location: "room 1",
  });

  // Permissions for dashboard view
  const canViewFullLessonPlan =
    user?.roles?.some((role) =>
      role.permissions?.some(
        (perm) => perm.name === Permissions.VIEW_CALENDAR_SUBJECT_LESSON_PLAN,
      ),
    ) || !isStudent; // Staff/Teachers get full view by default if not student

  const canViewSummaryLessonPlan =
    canViewFullLessonPlan ||
    user?.roles?.some((role) =>
      role.permissions?.some(
        (perm) => perm.name === Permissions.STUDENT_VIEW_LESSON_PLAN_SUMMARY,
      ),
    );

  // Week dates (Sun offset -1, Mon..Sun)
  const weekDates = useMemo(
    () => getWeekDates(currentWeekStart),
    [currentWeekStart],
  );

  const dateRangeString = useMemo(
    () => getDateRangeString(weekDates),
    [weekDates],
  );

  // Load the class groups the teacher is assigned to, for the filter
  // dropdown. Not applicable to students (they only ever have one group).
  useEffect(() => {
    if (isStudent) {
      setClassGroups([]);
      return;
    }
    let cancelled = false;
    getMyClassGroups(
      selectedYearId ? { academic_year_id: selectedYearId } : undefined,
    )
      .then((groups) => {
        if (!cancelled) setClassGroups(groups || []);
      })
      .catch((err) => {
        console.error("Failed to load class groups for filter:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [isStudent, selectedYearId]);

  // Reset the class-group filter whenever the teacher switches academic year
  // so a stale group from a different year isn't silently applied.
  useEffect(() => {
    setSelectedClassGroupId("all");
  }, [selectedYearId]);

  // Load slots for the globally selected academic term — reloads whenever
  // the term is switched from the top nav or the class-group filter changes.
  useEffect(() => {
    if (!selectedTermId) return;

    const load = async () => {
      setLoading(true);
      try {
        const params: { academic_term_id: number; class_group_id?: number } =
          {
            academic_term_id: selectedTermId,
          };
        if (!isStudent && selectedClassGroupId !== "all") {
          params.class_group_id = selectedClassGroupId;
        }

        if (isStudent) {
          const calendarData = await getStudentCalendar(params);
          setSlots(calendarData.slots || []);
          setUpcomingLessons(calendarData.upcoming || []);
        } else {
          // Teacher or generic authenticated user
          const calendarData = await getMyCalendar(params);
          setSlots(calendarData.slots || []);
          setUpcomingLessons(calendarData.upcoming || []);
        }
      } catch (err: any) {
        console.error("Dashboard calendar widget failed to load:", err);
        showToast(
          err.message || "Failed to load dashboard calendar data",
          "error",
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isStudent, selectedTermId, selectedClassGroupId]);

  // Handle slot click
  const handleSlotClick = (slot: CalendarSlot, date: Date) => {
    setModalMode("details");
    setSelectedSlot(slot);
    setSelectedSlotDate(date);
    setFormData({
      calendar_id: slot.calendar_id?.toString() || "",
      class_group_id: slot.class_group_id?.toString() || "",
      subject_id: `${slot.subject_id}_${slot.user_id}_${slot.class_group_id || ""}`,
      user_id: slot.user_id.toString(),
      day_of_week: slot.day_of_week.toString(),
      start_time: slot.start_time,
      end_time: slot.end_time,
      location: slot.location || "room 1",
    });
    setShowModal(true);
  };

  // Handle viewing lesson plan
  const handleViewLessonPlan = async (slot: CalendarSlot) => {
    if (!canViewSummaryLessonPlan) {
      console.warn("User does not have permission to view lesson plans.");
      return;
    }

    try {
      setIsLoadingLessonPlan(true);
      const formattedDate = selectedSlotDate
        ? selectedSlotDate.toISOString().split("T")[0]
        : undefined;
      const data = await getLessonPlanForSlot(slot.slot_id, formattedDate);
      setLessonPlan(data);
      setShowLessonPlan(true);
    } catch (error: any) {
      console.error("Failed to load lesson plan:", error);
      showToast(error.message || "Failed to load lesson plan", "error");
    } finally {
      setIsLoadingLessonPlan(false);
    }
  };

  // Week navigation
  const goToPreviousWeek = () => {
    setCurrentWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const goToNextWeek = () => {
    setCurrentWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const goToToday = () => setCurrentWeekStart(getStartOfWeek(new Date()));

  const title = isStudent ? "My Class Schedule" : "My Teaching Schedule";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white dark:bg-gray-900/50 rounded-t-3xl rounded-b-md p-6 pb-0">
      {/* Widget Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center flex-shrink-0">
            <Calendar className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              {title}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {selectedTerm?.name && <span>{selectedTerm.name} • </span>}
              <span className="text-blue-600 dark:text-blue-400 font-medium">
                {dateRangeString}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Class group filter (teachers with more than one group) */}
          {!isStudent && classGroups.length > 1 && (
            <select
              aria-label="Filter by class group"
              value={selectedClassGroupId}
              onChange={(e) =>
                setSelectedClassGroupId(
                  e.target.value === "all" ? "all" : Number(e.target.value),
                )
              }
              className="text-xs font-medium bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/40 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer"
            >
              <option value="all">All Class Groups</option>
              {classGroups.map((cg) => (
                <option key={cg.class_group_id} value={cg.class_group_id}>
                  {cg.name}
                  {cg.grade_name ? ` (${cg.grade_name})` : ""}
                </option>
              ))}
            </select>
          )}

          {/* Week navigator */}
          <div className="flex items-center gap-1">
          <button
            onClick={goToPreviousWeek}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
            title="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToToday}
            className="px-2.5 py-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors font-medium"
          >
            Today
          </button>
          <button
            onClick={goToNextWeek}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
            title="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {/* Empty state */}
      {!loading && slots.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <Calendar className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            No subjects scheduled for this term
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Slots assigned in the Academic Calendar will appear here.
          </p>
        </div>
      )}

      {/* Calendar Grid */}
      {!loading && slots.length > 0 && (
        <ReadOnlyCalendarGrid
          slots={slots}
          weekDates={weekDates}
          onSlotClick={handleSlotClick}
          showClassGroup={!isStudent && selectedClassGroupId === "all"}
        />
      )}

      {/* Detail Modals */}
      <CalendarSlotModal
        showModal={showModal}
        selectedSlot={selectedSlot}
        formData={formData}
        formErrors={{}}
        effectiveClassGroupId={
          formData.class_group_id ? parseInt(formData.class_group_id) : null
        }
        setupData={null}
        onClose={() => setShowModal(false)}
        onSubmit={() => {}}
        onFormDataChange={setFormData as any}
        onErrorsChange={() => {}}
        onDelete={() => {}}
        mode={modalMode}
        canEdit={false}
        onEditClick={() => {}}
        onViewLessonPlan={handleViewLessonPlan}
        canViewLessonPlan={Boolean(canViewSummaryLessonPlan)}
        isLoadingLessonPlan={isLoadingLessonPlan}
      />

      <LessonPlanModal
        showModal={showLessonPlan}
        onClose={() => setShowLessonPlan(false)}
        lessonPlan={lessonPlan}
      />
    </div>
  );
};

// ─── ReadOnlyCalendarGrid ─────────────────────────────────────────────────
// Stripped-down grid that shows slots for the current user only.
// No calendar_id filter needed — slots are already scoped to the user.

interface ReadOnlyCalendarGridProps {
  slots: CalendarSlot[];
  weekDates: Date[];
  onSlotClick: (slot: CalendarSlot, date: Date) => void;
  showClassGroup?: boolean;
}

const ReadOnlyCalendarGrid: React.FC<ReadOnlyCalendarGridProps> = ({
  slots,
  weekDates,
  onSlotClick,
  showClassGroup = false,
}) => {
  // Rows follow the data, so a period outside the standard timetable still
  // gets a row instead of silently matching none (see buildScheduleRows).
  const scheduleRows = useMemo(() => buildScheduleRows(slots), [slots]);

  return (
    <div className="overflow-x-auto -mx-6 border-4 border-white dark:border-gray-800/20">
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr className="bg-gradient-to-r from-blue-50 to-blue-100/30 dark:from-gray-800/30 dark:to-gray-800/30 border-b-4 border-white dark:border-none">
            {/* Time column header */}
            <th className="p-2 text-center text-xs font-semibold text-blue-600 dark:text-gray-300 w-20 min-w-20">
              Time
            </th>
            {DAYS.map((day, idx) => {
              const weekDate = weekDates[idx];
              const isToday =
                weekDate &&
                new Date().toDateString() === weekDate.toDateString();
              return (
                <th
                  key={idx}
                  className="p-2 text-center text-sm font-semibold text-gray-600 dark:text-gray-300 flex-1 min-w-0"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs ${
                        isToday
                          ? "bg-blue-600 text-white"
                          : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      }`}
                    >
                      {day}
                    </span>
                    {weekDate && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {formatDateShort(weekDate)}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="border-b border-blue-200/50 dark:border-blue-700/20">
          {(() => {
            const occupiedCells = new Set<string>();

            return scheduleRows.map((scheduleSlot, scheduleIdx) => {
              const isBreakOrLunch =
                scheduleSlot.type === "break" || scheduleSlot.type === "lunch";

              return (
                <tr
                  key={scheduleIdx}
                  className={`border-t border-gray-100 dark:border-gray-700/20 ${
                    isBreakOrLunch
                      ? "h-8 bg-gray-50 dark:bg-gray-800/10"
                      : "h-14"
                  } transition-colors`}
                >
                  {/* Time cell */}
                  <td
                    className={`p-1.5 text-center text-[10px] font-medium align-middle border border-blue-200/50 dark:border-blue-700/20 ${
                      isBreakOrLunch
                        ? "bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500/60 font-light"
                        : "bg-gray-50 dark:bg-gray-800/20 text-gray-700 dark:text-gray-200 font-semibold"
                    }`}
                  >
                    <div>{scheduleSlot.start}</div>
                    <div>{scheduleSlot.end}</div>
                    {isBreakOrLunch && (
                      <div className="text-[8px] font-bold mt-0.5 text-orange-600 dark:text-orange-400">
                        {scheduleSlot.type === "lunch" ? "🍴" : "⏸"}
                      </div>
                    )}
                  </td>

                  {/* Day cells */}
                  {DAYS.map((_, dayIdx) => {
                    const weekDate = weekDates[dayIdx];
                    const isToday =
                      weekDate &&
                      new Date().toDateString() === weekDate.toDateString();

                    const cellKey = `${dayIdx}-${scheduleIdx}`;
                    if (occupiedCells.has(cellKey)) return null;

                    if (isBreakOrLunch) {
                      return (
                        <td
                          key={dayIdx}
                          className="p-1 border-l border-gray-100 dark:border-gray-700/20 bg-gray-100 dark:bg-gray-800/50"
                        />
                      );
                    }

                    const courseStartingHere = slots.find(
                      (s) =>
                        parseInt(s.day_of_week as any) ===
                          displayDayToBackend(dayIdx) &&
                        s.start_time === scheduleSlot.start,
                    );

                    if (courseStartingHere) {
                      const rowSpan = countScheduleSlots(
                        courseStartingHere.start_time,
                        courseStartingHere.end_time,
                        scheduleRows,
                        scheduleIdx,
                      );

                      for (let r = 1; r < rowSpan; r++) {
                        occupiedCells.add(`${dayIdx}-${scheduleIdx + r}`);
                      }

                      return (
                        <td
                          key={dayIdx}
                          rowSpan={rowSpan}
                          className={`p-0 border-l border-gray-100 dark:border-gray-700/20 relative cursor-pointer ${
                            isToday ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                          }`}
                          onClick={() =>
                            onSlotClick(courseStartingHere, weekDate!)
                          }
                        >
                          <div
                            className="absolute inset-0.5 overflow-hidden rounded-sm"
                            style={{
                              backgroundColor:
                                courseStartingHere.color || "#3B82F6",
                            }}
                          >
                            <div
                              className={`h-full p-1.5 text-xs flex flex-col justify-start hover:brightness-110 transition-all duration-200 ${
                                isToday
                                  ? "ring-2 ring-white dark:ring-gray-600 shadow-lg"
                                  : ""
                              }`}
                              title={`${courseStartingHere.subject_name}${courseStartingHere.class_group_name ? ` - ${courseStartingHere.class_group_name}` : ""}`}
                            >
                              <div className="font-normal text-white truncate text-[12px]">
                                {courseStartingHere.subject_name}
                              </div>
                              {showClassGroup &&
                                courseStartingHere.class_group_name && (
                                  <div className="text-white/80 truncate text-[10px]">
                                    {courseStartingHere.class_group_name}
                                  </div>
                                )}
                              <div className="text-white/70 text-[10px] mt-auto">
                                {courseStartingHere.start_time} -{" "}
                                {courseStartingHere.end_time}
                              </div>
                            </div>
                          </div>
                        </td>
                      );
                    }

                    // Empty cell – read-only, no hover add icon
                    return (
                      <td
                        key={dayIdx}
                        className={`p-1 border-l border-gray-100 dark:border-gray-700/20 ${
                          isToday ? "bg-blue-50/30 dark:bg-blue-900/5" : ""
                        }`}
                      />
                    );
                  })}
                </tr>
              );
            });
          })()}
        </tbody>
      </table>
    </div>
  );
};

export default DashboardCalendarWidget;
