import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  DAYS_FULL,
  buildScheduleRows,
  displayDayToBackend,
  findCurrentRowIndex,
  isTeachingRow,
  minutesToTime,
  timeToMinutes,
  getStartOfWeek,
  getWeekDates,
  getDateRangeString,
  formatDateShort,
} from "./calendarConstants";
import { buildGridLayout, cellKey, type GridCell } from "./calendarLayout";
import SlotTooltip, { useSlotTooltip } from "./SlotTooltip";
import { useCurrentTime } from "./useCurrentTime";
import { getSlotColor, slotSurface } from "./slotColor";
import { useIsDark } from "./useIsDark";
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
  // Class groups seen in the loaded slots. getMyClassGroups is the teacher's
  // assignment list, which can be incomplete (or fail) while the timetable
  // itself clearly names a group — a group with lessons on screen must always
  // be selectable, so what the slots reveal is remembered here and merged in.
  const [discoveredGroups, setDiscoveredGroups] = useState<
    Record<number, string>
  >({});

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
    setDiscoveredGroups({});
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

  // Remember any class group the loaded slots name, so filtering down to one
  // group never removes the others from the dropdown.
  useEffect(() => {
    setDiscoveredGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const slot of slots) {
        const id = slot.class_group_id;
        if (!id || next[id]) continue;
        next[id] = slot.class_group_name || `Class group ${id}`;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [slots]);

  // Everything the teacher can filter by: their assigned groups, plus any
  // group the timetable itself has revealed.
  const classGroupOptions = useMemo(() => {
    const byId = new Map<number, string>();
    for (const cg of classGroups) {
      byId.set(
        cg.class_group_id,
        `${cg.name}${cg.grade_name ? ` (${cg.grade_name})` : ""}`,
      );
    }
    for (const [id, label] of Object.entries(discoveredGroups)) {
      if (!byId.has(Number(id))) byId.set(Number(id), label);
    }
    return [...byId.entries()]
      .map(([class_group_id, label]) => ({ class_group_id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [classGroups, discoveredGroups]);

  // With a single class group there is nothing to filter: select it so the
  // dropdown names the group being shown rather than a vague "All".
  useEffect(() => {
    if (isStudent) return;
    if (classGroupOptions.length === 1 && selectedClassGroupId === "all") {
      setSelectedClassGroupId(classGroupOptions[0].class_group_id);
    }
  }, [classGroupOptions, isStudent, selectedClassGroupId]);

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
          {!isStudent && classGroupOptions.length > 0 && (
            <select
              aria-label="Filter by class group"
              value={selectedClassGroupId}
              onChange={(e) =>
                setSelectedClassGroupId(
                  e.target.value === "all" ? "all" : Number(e.target.value),
                )
              }
              className="text-xs font-medium bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/40 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer hover:border-blue-400 transition-colors"
            >
              {classGroupOptions.length > 1 && (
                <option value="all">All Class Groups</option>
              )}
              {classGroupOptions.map((cg) => (
                <option key={cg.class_group_id} value={cg.class_group_id}>
                  {cg.label}
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
          showClassGroup={!isStudent}
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
//
// Shares the timetable rows, the layout resolver, the "now" marker and the
// hover/focus tooltip with the editable CalendarGrid, so the two stay in step.

interface ReadOnlyCalendarGridProps {
  slots: CalendarSlot[];
  weekDates: Date[];
  onSlotClick: (slot: CalendarSlot, date: Date) => void;
  showClassGroup?: boolean;
}

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

const ReadOnlyCalendarGrid: React.FC<ReadOnlyCalendarGridProps> = ({
  slots,
  weekDates,
  onSlotClick,
  showClassGroup = false,
}) => {
  // Rows follow the data, so a period outside the standard timetable still
  // gets a row instead of silently matching none (see buildScheduleRows).
  const scheduleRows = useMemo(() => buildScheduleRows(slots), [slots]);

  // Every lesson starting on a row is kept, not just the first: a teacher
  // viewing all their class groups can have two lessons on the same day and
  // time, and dropping one made "all class groups" look like one calendar.
  const layout = useMemo(
    () =>
      buildGridLayout<CalendarSlot>(scheduleRows, DAYS.length, (dayIdx, start) =>
        slots.filter(
          (s) =>
            Number(s.day_of_week) === displayDayToBackend(dayIdx) &&
            s.start_time === start,
        ),
      ),
    [scheduleRows, slots],
  );

  const isDark = useIsDark();
  const { minutes: nowMinutes, date: now } = useCurrentTime();
  const currentRowIndex = findCurrentRowIndex(scheduleRows, nowMinutes);
  const todayIndex = weekDates.findIndex(
    (d) => d && d.toDateString() === now.toDateString(),
  );

  const { tooltip, show: showTooltip, hide: hideTooltip } = useSlotTooltip();
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());

  // Roving tabindex: one cell in the tab order, arrows move the point.
  const firstCourseCell = useMemo(() => {
    const row = scheduleRows.findIndex((r) => r.type === "course");
    return row === -1 ? null : cellKey(row, 0);
  }, [scheduleRows]);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const tabStop = activeCell ?? firstCourseCell;

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

  const moveTo = useCallback((key: string | null) => {
    if (!key) return;
    setActiveCell(key);
    cellRefs.current.get(key)?.focus();
  }, []);

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
        case " ": {
          const slot = cell.slots[0];
          if (slot) {
            event.preventDefault();
            onSlotClick(slot, weekDates[dayIndex]!);
          }
          return;
        }
        case "Escape":
          hideTooltip();
          return;
        default:
          return;
      }

      event.preventDefault();
      moveTo(next);
    },
    [hideTooltip, moveTo, onSlotClick, resolve, scheduleRows.length, weekDates],
  );

  return (
    <div>
      <div className="overflow-x-auto -mx-6 border-4 border-white dark:border-gray-800/20">
        <table role="grid" className="w-full border-collapse table-fixed">
          <thead>
            <tr className="bg-gradient-to-r from-blue-50 to-blue-100/30 dark:from-gray-800/30 dark:to-gray-800/30 border-b-4 border-white dark:border-none">
              {/* Time column header */}
              <th
                scope="col"
                className="p-2 text-center text-xs font-semibold text-blue-600 dark:text-gray-300 w-20 min-w-20"
              >
                Time
              </th>
              {DAYS.map((day, idx) => {
                const weekDate = weekDates[idx];
                const isToday = idx === todayIndex;
                return (
                  <th
                    key={idx}
                    scope="col"
                    aria-current={isToday ? "date" : undefined}
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
            {scheduleRows.map((scheduleSlot, scheduleIdx) => {
              const isTeaching = isTeachingRow(scheduleSlot);
              const isNow = scheduleIdx === currentRowIndex && todayIndex !== -1;

              return (
                <tr
                  key={`${scheduleSlot.start}-${scheduleSlot.end}`}
                  className={`border-t border-gray-100 dark:border-gray-700/20 ${
                    isTeaching ? "h-14" : "h-8 bg-gray-50 dark:bg-gray-800/10"
                  } transition-colors`}
                >
                  {/* Time cell */}
                  <th
                    scope="row"
                    className={`p-1.5 text-center text-[10px] font-medium align-middle border border-blue-200/50 dark:border-blue-700/20 ${
                      isNow ? "border-l-4 !border-l-rose-500" : ""
                    } ${
                      isTeaching
                        ? "bg-gray-50 dark:bg-gray-800/20 text-gray-700 dark:text-gray-200 font-semibold"
                        : "bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500/60 font-light"
                    }`}
                  >
                    {isTeaching && scheduleSlot.label && (
                      <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                        {scheduleSlot.label}
                      </div>
                    )}
                    <div>{scheduleSlot.start}</div>
                    <div>{scheduleSlot.end}</div>
                    {isNow && (
                      <div className="text-[8px] font-bold mt-0.5 text-rose-600 dark:text-rose-400">
                        ● {minutesToTime(nowMinutes)}
                      </div>
                    )}
                  </th>

                  {/* Breaks, lunch and office hours run right across the week,
                      as one labelled band rather than seven blank cells. */}
                  {!isTeaching && (
                    <td
                      colSpan={DAYS.length}
                      className={`border-l border-gray-100 dark:border-gray-700/20 text-center text-[10px] font-bold uppercase tracking-wider ${
                        scheduleSlot.type === "lunch"
                          ? "bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400/80"
                          : "bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400/70"
                      }`}
                    >
                      {scheduleSlot.label}
                    </td>
                  )}

                  {/* Day cells */}
                  {isTeaching &&
                    DAYS.map((_, dayIdx) => {
                    const key = cellKey(scheduleIdx, dayIdx);
                    const cell = layout.cells.get(key);
                    // A rowSpan from an earlier row already covers this one
                    if (!cell) return null;

                    const isToday = dayIdx === todayIndex;

                    const courses = cell.slots;
                    const isTabStop = key === tabStop;
                    const dayLabel = `${DAYS_FULL[dayIdx]} ${scheduleSlot.label ? `${scheduleSlot.label} ` : ""}${scheduleSlot.start}`;
                    const commonProps = {
                      ref: (el: HTMLTableCellElement | null) => {
                        if (el) cellRefs.current.set(key, el);
                        else cellRefs.current.delete(key);
                      },
                      role: "gridcell",
                      tabIndex: isTabStop ? 0 : -1,
                      onKeyDown: (e: React.KeyboardEvent) =>
                        handleKeyDown(e, cell),
                    };

                    if (courses.length > 0) {
                      const label = courses
                        .map(
                          (c) =>
                            `${c.subject_name ?? "Lesson"}${c.class_group_name ? `, ${c.class_group_name}` : ""}, ${c.start_time} to ${c.end_time}`,
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
                          {/* Lessons starting at the same time sit side by
                              side rather than one hiding the other. */}
                          <div className="absolute inset-0.5 flex gap-0.5">
                            {courses.map((course) => {
                              const progress = isToday
                                ? lessonProgress(course, nowMinutes)
                                : null;
                              const color = getSlotColor(course);
                              const surface = slotSurface(color, isDark);
                              const isLive = progress !== null;
                              return (
                                <div
                                  key={course.slot_id}
                                  className="relative flex-1 min-w-0 overflow-hidden rounded-md transition-colors duration-150 bg-[var(--slot-bg)] hover:bg-[var(--slot-bg-hover)]"
                                  style={
                                    {
                                      "--slot-bg": surface.background,
                                      "--slot-bg-hover": surface.hoverBackground,
                                      boxShadow: isLive
                                        ? `inset 0 0 0 1.5px ${surface.accent}`
                                        : undefined,
                                    } as React.CSSProperties
                                  }
                                  onClick={() =>
                                    onSlotClick(course, weekDates[dayIdx]!)
                                  }
                                  onMouseEnter={(e) =>
                                    showTooltip(course, e.currentTarget)
                                  }
                                  onMouseLeave={hideTooltip}
                                >
                                  <div
                                    className="h-full p-1.5 text-xs flex flex-col justify-start"
                                    style={{ color: surface.text }}
                                  >
                                    <div className="font-semibold truncate text-[12px]">
                                      {course.subject_name}
                                    </div>
                                    {showClassGroup &&
                                      course.class_group_name && (
                                        <div
                                          className="truncate text-[10px]"
                                          style={{ color: surface.meta }}
                                        >
                                          {course.class_group_name}
                                        </div>
                                      )}
                                    <div
                                      className="text-[10px] mt-auto tabular-nums"
                                      style={{ color: surface.meta }}
                                    >
                                      {course.start_time} - {course.end_time}
                                    </div>
                                  </div>
                                  {isLive && (
                                    <div
                                      className="absolute bottom-0 left-0 h-0.5"
                                      style={{
                                        width: `${progress * 100}%`,
                                        backgroundColor: surface.accent,
                                      }}
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

                    // Empty cell – read-only, no hover add icon
                    return (
                      <td
                        {...commonProps}
                        key={dayIdx}
                        aria-label={`${dayLabel}, free`}
                        onFocus={() => setActiveCell(key)}
                        className={`p-1 border-l border-gray-100 dark:border-gray-700/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                          isToday ? "bg-blue-50/30 dark:bg-blue-900/5" : ""
                        } ${isNow ? "ring-1 ring-inset ring-rose-400/60" : ""}`}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SlotTooltip state={tooltip} />
    </div>
  );
};

export default DashboardCalendarWidget;
