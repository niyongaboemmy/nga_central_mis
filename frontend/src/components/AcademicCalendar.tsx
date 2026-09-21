import React, { useState, useEffect, useMemo } from "react";
import { useUser } from "../contexts/UserContext";
import { useScopedGrades } from "../hooks/useScopedGrades";
import { useToast } from "../contexts/ToastContext";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import { Permissions } from "../constants/permissions";
import {
  CalendarSlot,
  CalendarActivity,
  ActivityAssignee,
  CalendarNotification,
  UpcomingLesson,
  getCalendarSlots,
  createCalendarSlot,
  updateCalendarSlot,
  deleteCalendarSlot,
  getCalendarActivities,
  createCalendarActivity,
  updateCalendarActivity,
  deleteCalendarActivity,
  getMyCalendar,
  getStudentCalendar,
  getNotificationSettings,
  updateNotificationSettings,
  checkUpcomingLessons,
  getCalendarSetupData,
  getLessonPlanForSlot,
  CalendarSetupData,
  createAcademicCalendar,
  getAcademicCalendars,
  getCalendarClassGroups,
  getMyClassGroups,
} from "../api/calendar";
import type { AcademicCalendar } from "../api/calendar";
import { exportTimetablePdf } from "../utils/timetablePdfExport";

// Import calendar components
import {
  CalendarHeader,
  WeekNavigator,
  UpcomingLessons,
  CalendarLegend,
  CalendarGrid,
  CalendarGridSkeleton,
  CalendarSlotModal,
  AcademicCalendarModal,
  LessonPlanModal,
  NotificationSettingsModal,
  getStartOfWeek,
  getWeekDates,
  getDateRangeString,
  displayDayToBackend,
  backendDayToDisplay,
} from "./calendar";

interface AcademicCalendarProps {
  isAdminView?: boolean;
  /** Heading for the grid. Lets an embedding page name it ("Class Calendar")
   *  rather than adding a second header above the component's own. */
  title?: string;
}

const AcademicCalendar: React.FC<AcademicCalendarProps> = ({
  isAdminView = false,
  title,
}) => {
  const { user } = useUser();
  const { showToast } = useToast();

  // Check permissions
  const canManageCalendar = user?.roles?.some((role) =>
    role.permissions?.some(
      (perm) => perm.name === Permissions.MANAGE_ACADEMIC_CALENDAR,
    ),
  );

  const canCreateCalendar = user?.roles?.some((role) =>
    role.permissions?.some(
      (perm) => perm.name === Permissions.CREATE_ACADEMIC_CALENDAR,
    ),
  );

  const canUpdateSlot = user?.roles?.some((role) =>
    role.permissions?.some(
      (perm) => perm.name === Permissions.UPDATE_CALENDAR_SLOT,
    ),
  );

  const isStudent = user?.roles?.some((role) =>
    role.permissions?.some(
      (perm) => perm.name === Permissions.VIEW_STUDENT_CALENDAR,
    ),
  );

  const hasViewCalendar = user?.roles?.some((role) =>
    role.permissions?.some(
      (perm) => perm.name === Permissions.VIEW_ACADEMIC_CALENDAR,
    ),
  );

  // A class teacher reaches the same grid through their own "Class Calendar"
  // entry. The server confines every calendar read to their assigned class
  // groups (resolveUserScope), so this only decides whether the weekly grid
  // renders at all -- never how much of the school it can show.
  const hasClassTeacherCalendar = user?.roles?.some((role) =>
    role.permissions?.some(
      (perm) => perm.name === Permissions.VIEW_CALENDAR_BY_CLASS_TEACHER_GRADE,
    ),
  );

  const canManage = isAdminView || canManageCalendar;
  const canViewAll =
    canManage ||
    hasViewCalendar ||
    canCreateCalendar ||
    canUpdateSlot ||
    hasClassTeacherCalendar;
  const canEdit = canUpdateSlot;
  const canCreate = canCreateCalendar;
  const isBroadView = canViewAll;

  const canViewFullLessonPlan =
    canEdit ||
    user?.roles?.some((role) =>
      role.permissions?.some(
        (perm) => perm.name === Permissions.VIEW_CALENDAR_SUBJECT_LESSON_PLAN,
      ),
    );
  const canViewSummaryLessonPlan =
    canViewFullLessonPlan ||
    user?.roles?.some((role) =>
      role.permissions?.some(
        (perm) => perm.name === Permissions.STUDENT_VIEW_LESSON_PLAN_SUMMARY,
      ),
    );

  // A class teacher / program lead is confined to their own class groups --
  // the server clamps `allClassGroupsForYear` to them, and the effect below
  // lands them on their own calendar instead of an empty picker.
  const scope = useScopedGrades();

  // Academic period (year/term) comes from the global selector in the top nav
  const {
    years: academicYears,
    terms: academicTerms,
    selectedYearId: selectedYear,
    selectedTermId: selectedTerm,
  } = useAcademicPeriod();

  // State
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  // Admin view: switching class group refetches only that calendar's slots
  // (not everything loadData pulls), so it has its own in-flight flag.
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [activities, setActivities] = useState<CalendarActivity[]>([]);
  const [upcomingLessons, setUpcomingLessons] = useState<UpcomingLesson[]>([]);
  const [setupData, setSetupData] = useState<CalendarSetupData | null>(null);
  const [notifications, setNotifications] = useState<CalendarNotification[]>(
    [],
  );
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlot | null>(null);
  const [selectedSlotDate, setSelectedSlotDate] = useState<Date | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showLessonPlan, setShowLessonPlan] = useState(false);
  const [lessonPlan, setLessonPlan] = useState<any>(null);
  const [lessonPlanSlot, setLessonPlanSlot] = useState<CalendarSlot | null>(
    null,
  );
  const [showNotificationSettings, setShowNotificationSettings] =
    useState(false);
  const [modalMode, setModalMode] = useState<"details" | "form">("details");
  const [currentWeekStart, setCurrentWeekStart] = useState<Date | null>(null);

  // Loading states for actions
  const [isSubmittingSlot, setIsSubmittingSlot] = useState(false);
  const [isDeletingSlot, setIsDeletingSlot] = useState(false);
  const [isSubmittingCalendar, setIsSubmittingCalendar] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [isLoadingLessonPlan, setIsLoadingLessonPlan] = useState(false);
  const [isLoadingClassGroups, setIsLoadingClassGroups] = useState(false);

  // Academic Calendar (year + term + class group) state
  const [calendars, setCalendars] = useState<AcademicCalendar[]>([]);
  const [selectedCalendar, setSelectedCalendar] =
    useState<AcademicCalendar | null>(null);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [availableClassGroups, setAvailableClassGroups] = useState<any[]>([]);
  // Every class group in the selected year, regardless of whether it has an
  // AcademicCalendar row yet — lets the "Select a class group" dropdown list
  // groups you can create a first calendar for, not just ones that already
  // have one (previously the dropdown was populated from `calendars` alone,
  // so a term with zero calendars had nothing selectable at all).
  const [allClassGroupsForYear, setAllClassGroupsForYear] = useState<any[]>([]);
  const [calendarFormData, setCalendarFormData] = useState({
    academic_year_id: "",
    academic_term_id: "",
    class_group_id: "",
    name: "",
    description: "",
  });

  // Teacher's own class groups (a teacher must pick one before a calendar loads,
  // unless they only teach a single class group)
  const [myClassGroups, setMyClassGroups] = useState<any[]>([]);
  const [selectedTeacherClassGroupId, setSelectedTeacherClassGroupId] =
    useState<number | null>(null);

  // Filter activities based on selected calendar
  const filteredActivities = useMemo(() => {
    if (!selectedCalendar) return activities;
    return activities.filter(
      (a) =>
        a.class_group_id == null ||
        a.class_group_id === selectedCalendar.class_group_id,
    );
  }, [activities, selectedCalendar]);

  // There is no "all class groups" combined view — a calendar only ever
  // renders for the one specific class group currently selected. A
  // `calendar_id` of 0 is the synthetic placeholder used when the selected
  // class group has no real AcademicCalendar row yet (see
  // `allClassGroupsForYear` below) — never render a grid for that.
  const calendarsToDisplay = useMemo(() => {
    return selectedCalendar && selectedCalendar.calendar_id
      ? [selectedCalendar]
      : [];
  }, [selectedCalendar]);

  // Form state for creating/editing slots
  const [formData, setFormData] = useState({
    calendar_id: "", // set by handleEmptyCellClick / handleSlotClick
    class_group_id: "",
    subject_id: "",
    user_id: "",
    day_of_week: "",
    start_time: "",
    end_time: "",
    location: "room 1",
  });

  // Derive the effective class group ID purely from formData (a param, not global state).
  // Both handleEmptyCellClick and handleSlotClick write class_group_id into formData
  // explicitly, so no global-state fallback is needed.
  // When resetSlotModal() clears formData.class_group_id → "", this returns null
  // immediately — no stale value leaks from selectedCalendar or selectedSlot.
  const effectiveClassGroupId = useMemo(
    () => (formData.class_group_id ? Number(formData.class_group_id) : null),
    [formData.class_group_id],
  );

  // Form validation errors
  const [formErrors, setFormErrors] = useState<{
    subject_id?: string;
    day_of_week?: string;
    start_time?: string;
    end_time?: string;
  }>({});

  // ── Custom activity (non-subject event) state ────────────────────────────
  const [entryKind, setEntryKind] = useState<"lesson" | "activity">("lesson");
  const [selectedActivity, setSelectedActivity] =
    useState<CalendarActivity | null>(null);
  const emptyActivityForm = {
    activity_name: "",
    activity_type: "",
    day_of_week: "",
    start_time: "",
    end_time: "",
    location: "",
    description: "",
    color: "#10B981",
    assignees: [] as ActivityAssignee[],
  };
  const [activityForm, setActivityForm] = useState(emptyActivityForm);
  const [activityErrors, setActivityErrors] = useState<{
    activity_name?: string;
    activity_type?: string;
    day_of_week?: string;
    start_time?: string;
    end_time?: string;
  }>({});
  const [isSubmittingActivity, setIsSubmittingActivity] = useState(false);
  const [isDeletingActivity, setIsDeletingActivity] = useState(false);

  // Week dates
  const weekDates = useMemo(() => {
    if (!currentWeekStart) return [];
    return getWeekDates(currentWeekStart);
  }, [currentWeekStart]);

  // Date range string
  const dateRangeString = useMemo(() => {
    return getDateRangeString(weekDates);
  }, [weekDates]);

  // Whichever grid is actually on screen right now -- mirrors the same
  // branching the render below uses, so the download button only ever
  // appears once there is really something to export.
  const currentClassGroupName = useMemo(() => {
    if (isStudent) return slots[0]?.class_group_name;
    if (!isBroadView) {
      return myClassGroups.find(
        (g) => g.class_group_id === selectedTeacherClassGroupId,
      )?.name;
    }
    return selectedCalendar?.class_group_name;
  }, [
    isStudent,
    isBroadView,
    slots,
    myClassGroups,
    selectedTeacherClassGroupId,
    selectedCalendar,
  ]);

  const canDownloadTimetable = useMemo(() => {
    if (isStudent) return slots.length > 0;
    if (!isBroadView) return Boolean(selectedTeacherClassGroupId);
    return Boolean(selectedCalendar?.calendar_id);
  }, [isStudent, isBroadView, slots.length, selectedTeacherClassGroupId, selectedCalendar]);

  const handleDownloadPdf = () => {
    const yearName = academicYears.find(
      (y: any) => y.academic_year_id === selectedYear,
    )?.name;
    const termName = academicTerms.find(
      (t) => t.academic_term_id === selectedTerm,
    )?.name;
    exportTimetablePdf(slots, filteredActivities, {
      classGroupName: currentClassGroupName || "Class Timetable",
      yearName,
      termName,
    });
  };

  // Set current week start to today (Monday of current week) on mount
  useEffect(() => {
    const today = new Date();
    setCurrentWeekStart(getStartOfWeek(today));
    const interval = setInterval(checkUpcoming, 60000);
    return () => clearInterval(interval);
  }, []);

  // Load data when term changes. The previously-selected class group's
  // calendar almost never applies to the new term (a calendar is scoped to
  // one specific year+term+class-group triple), so it's cleared here —
  // otherwise the dropdown kept showing a stale selection from the prior
  // term while the loaded slots/activities silently belonged to the new one.
  useEffect(() => {
    setSelectedCalendar(null);
    if (selectedTerm) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerm]);

  // Land a scoped user on their own class group's calendar. Without this they
  // arrive at "Select a class group to view its calendar" every single time,
  // even though there is only ever one right answer for them. Only fills an
  // empty selection, so it never fights a manual choice.
  useEffect(() => {
    if (!isBroadView || selectedCalendar || !selectedYear || !selectedTerm) {
      return;
    }
    if (allClassGroupsForYear.length === 0) return;

    const preferred =
      (scope.defaultClassGroupId &&
        allClassGroupsForYear.find(
          (g) => g.class_group_id === scope.defaultClassGroupId,
        )) ||
      // A program lead has no single class group of their own; with the list
      // already clamped to their scope, the first entry is the sane default.
      (scope.isScoped ? allClassGroupsForYear[0] : null);

    if (!preferred) return;

    const existing = calendars.find(
      (c) =>
        c.class_group_id === preferred.class_group_id &&
        c.academic_year_id === selectedYear &&
        c.academic_term_id === selectedTerm,
    );

    setSelectedCalendar(
      existing ?? {
        // Placeholder row (calendar_id 0) -- the page renders its
        // "create a calendar for this group" prompt rather than a blank grid.
        calendar_id: 0,
        academic_year_id: selectedYear,
        academic_term_id: selectedTerm,
        class_group_id: preferred.class_group_id,
        class_group_name: preferred.name,
        is_active: 0,
      },
    );
  }, [
    isBroadView,
    selectedCalendar,
    selectedYear,
    selectedTerm,
    allClassGroupsForYear,
    calendars,
    scope.defaultClassGroupId,
    scope.isScoped,
  ]);

  // Slots are fetched per calendar (see loadData), so switching the selected
  // class group has to refetch them -- otherwise the grid keeps the previous
  // calendar's slots, which its own calendar_id filter then renders as empty.
  useEffect(() => {
    const calendarId = selectedCalendar?.calendar_id;
    if (!isBroadView || !calendarId) return;
    let cancelled = false;
    setSlotsLoading(true);
    getCalendarSlots({ calendar_id: calendarId })
      .then((data) => {
        if (!cancelled) setSlots(data);
      })
      .catch((error: any) => {
        if (!cancelled) {
          showToast(error.message || "Failed to load calendar slots", "error");
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBroadView, selectedCalendar?.calendar_id]);

  // Reload the instructor's schedule when they switch their own class group
  useEffect(() => {
    if (
      !isBroadView &&
      !isStudent &&
      selectedTerm &&
      selectedTeacherClassGroupId
    ) {
      loadData();
    }
  }, [selectedTeacherClassGroupId]);

  // Reload setupData when the modal opens or the class group changes.
  // Reads ONLY from formData.class_group_id (a scoped param, not global state)
  // so it resets cleanly whenever resetSlotModal() clears class_group_id.
  useEffect(() => {
    if (isBroadView && selectedTerm && showModal) {
      const classGroupId = formData.class_group_id
        ? parseInt(formData.class_group_id)
        : undefined;
      const loadSetupData = async () => {
        try {
          const setupDataRes = await getCalendarSetupData(
            selectedTerm,
            classGroupId,
          );
          setSetupData(setupDataRes);
        } catch (error) {
          console.error("Failed to load setup data:", error);
        }
      };
      loadSetupData();
    }
  }, [formData.class_group_id, selectedTerm, showModal]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedTerm) {
        params.academic_term_id = selectedTerm;
      }

      if (isBroadView) {
        // Load calendars for the selected year and term
        let calendarParams: any = {};
        if (selectedYear) {
          calendarParams.academic_year_id = selectedYear;
        }
        if (selectedTerm) {
          calendarParams.academic_term_id = selectedTerm;
        }

        // With a calendar selected, ask for that calendar's slots by id --
        // the same key they were written under. Filtering by term instead
        // dropped any slot whose denormalised term had drifted from its
        // calendar's, leaving a grid that looked empty while the timeslot
        // was still taken.
        const slotParams = selectedCalendar?.calendar_id
          ? { calendar_id: selectedCalendar.calendar_id }
          : params;

        const [slotsData, activitiesData, setupDataRes, calendarsData, classGroupsData] =
          await Promise.all([
            getCalendarSlots(slotParams),
            getCalendarActivities(params),
            getCalendarSetupData(
              selectedTerm || undefined,
              selectedCalendar?.class_group_id
                ? selectedCalendar.class_group_id
                : undefined,
            ),
            getAcademicCalendars(calendarParams),
            selectedYear
              ? getCalendarClassGroups({ academic_year_id: selectedYear })
              : Promise.resolve([]),
          ]);
        setSlots(slotsData);
        setActivities(activitiesData);
        setSetupData(setupDataRes);
        setCalendars(calendarsData);
        setAllClassGroupsForYear(classGroupsData);
      } else if (isStudent) {
        // Student view — the backend already scopes this to the student's own
        // class group and enrolled subjects, so no group selector is needed.
        const calendarData = await getStudentCalendar(params);
        setSlots(calendarData.slots);
        // Events pinned to the student's class group (or school-wide) come
        // back with the schedule; nothing else to fetch.
        setActivities(calendarData.activities ?? []);
      } else {
        // Instructor view — a teacher may teach in more than one class group,
        // so a specific one must be selected before a schedule loads (unless
        // they only teach in a single class group, which is auto-selected).
        const groupsParams: any = {};
        if (selectedYear) {
          groupsParams.academic_year_id = selectedYear;
        }
        const groups = await getMyClassGroups(groupsParams);
        setMyClassGroups(groups);

        let effectiveGroupId = selectedTeacherClassGroupId;
        if (!effectiveGroupId && groups.length === 1) {
          effectiveGroupId = groups[0].class_group_id;
          setSelectedTeacherClassGroupId(effectiveGroupId);
        }

        if (!effectiveGroupId) {
          setSlots([]);
          setUpcomingLessons([]);
          return;
        }

        const [calendarData, notificationsData, upcomingData, activitiesData] =
          await Promise.all([
            getMyCalendar({ ...params, class_group_id: effectiveGroupId }),
            getNotificationSettings(),
            checkUpcomingLessons(),
            getCalendarActivities({
              ...params,
              class_group_id: effectiveGroupId,
            }).catch(() => [] as CalendarActivity[]),
          ]);
        setSlots(calendarData.slots);
        setUpcomingLessons(upcomingData);
        setNotifications(notificationsData);
        setActivities(activitiesData);
      }
    } catch (error: any) {
      showToast(error.message || "Failed to load calendar data", "error");
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  };

  const checkUpcoming = async () => {
    if (!isBroadView) {
      try {
        const upcoming = await checkUpcomingLessons();
        setUpcomingLessons(upcoming);
      } catch (error) {
        console.error("Failed to check upcoming lessons:", error);
      }
    }
  };

  // Handle clicking on empty calendar cell to add new slot
  const handleEmptyCellClick = (
    dayIndex: number,
    scheduleSlot: { start: string; end: string; type: string },
    calendarId: number,
  ) => {
    if (!canEdit) return;

    setModalMode("form");

    // Find the calendar by ID to get full details (like class_group_id)
    const calendar = calendars.find((c) => c.calendar_id === calendarId);

    setSelectedSlot(null);
    setSelectedActivity(null);
    setEntryKind("lesson");
    setActivityErrors({});
    setFormData({
      calendar_id: calendar?.calendar_id?.toString() || "",
      class_group_id: calendar?.class_group_id?.toString() || "",
      subject_id: "",
      user_id: "",
      day_of_week: dayIndex.toString(),
      start_time: scheduleSlot.start,
      end_time: scheduleSlot.end,
      location: "room 1",
    });
    // Seed the activity form with the same cell so toggling Lesson → Activity
    // keeps the day/time the user clicked.
    setActivityForm({
      ...emptyActivityForm,
      day_of_week: dayIndex.toString(),
      start_time: scheduleSlot.start,
      end_time: scheduleSlot.end,
    });

    setShowModal(true);
  };

  // View / edit an existing custom activity
  const handleActivityClick = (activity: CalendarActivity) => {
    setModalMode("details");
    setSelectedSlot(null);
    setSelectedActivity(activity);
    setEntryKind("activity");
    setActivityErrors({});
    setActivityForm({
      activity_name: activity.activity_name || "",
      activity_type: activity.activity_type || "",
      day_of_week:
        activity.day_of_week != null
          ? backendDayToDisplay(activity.day_of_week).toString()
          : "",
      start_time: activity.start_time || "",
      end_time: activity.end_time || "",
      location: activity.location || "",
      description: activity.description || "",
      color: activity.color || "#10B981",
      assignees: activity.assignees ?? [],
    });
    setShowModal(true);
  };

  const handleActivitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: typeof activityErrors = {};
    if (!activityForm.activity_name.trim())
      errors.activity_name = "Please enter an activity name";
    if (!activityForm.activity_type.trim())
      errors.activity_type = "Please choose a type";
    if (activityForm.day_of_week === "")
      errors.day_of_week = "Please select a day";
    if (!activityForm.start_time) errors.start_time = "Please select start time";
    if (!activityForm.end_time) errors.end_time = "Please select end time";
    if (
      activityForm.start_time &&
      activityForm.end_time &&
      activityForm.start_time >= activityForm.end_time
    ) {
      errors.end_time = "End time must be after start time";
    }
    if (Object.keys(errors).length > 0) {
      setActivityErrors(errors);
      return;
    }
    setActivityErrors({});

    const classGroupId =
      selectedActivity?.class_group_id ??
      selectedCalendar?.class_group_id ??
      (formData.class_group_id ? parseInt(formData.class_group_id) : undefined);
    const termId =
      selectedActivity?.academic_term_id ??
      selectedCalendar?.academic_term_id ??
      selectedTerm ??
      0;

    const payload = {
      activity_name: activityForm.activity_name.trim(),
      activity_type: activityForm.activity_type.trim(),
      day_of_week: displayDayToBackend(parseInt(activityForm.day_of_week)),
      start_time: activityForm.start_time,
      end_time: activityForm.end_time,
      location: activityForm.location || undefined,
      description: activityForm.description || undefined,
      color: activityForm.color,
      // Always sent (possibly empty) so clearing every assignee on edit sticks.
      assigned_user_ids: activityForm.assignees.map((u) => u.user_id),
    };

    try {
      setIsSubmittingActivity(true);
      if (selectedActivity) {
        await updateCalendarActivity(selectedActivity.activity_id, payload);
        showToast("Activity updated successfully", "success");
      } else {
        await createCalendarActivity({
          ...payload,
          academic_term_id: termId,
          class_group_id: classGroupId,
          is_recurring: 1,
        });
        showToast("Activity created successfully", "success");
      }
      resetSlotModal();
      loadData();
    } catch (error: any) {
      showToast(error.message || "Failed to save activity", "error");
    } finally {
      setIsSubmittingActivity(false);
    }
  };

  const handleActivityDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this activity?")) return;
    try {
      setIsDeletingActivity(true);
      await deleteCalendarActivity(id);
      showToast("Activity deleted successfully", "success");
      resetSlotModal();
      loadData();
    } catch (error: any) {
      showToast(error.message || "Failed to delete activity", "error");
    } finally {
      setIsDeletingActivity(false);
    }
  };

  // Handle slot click to view details (then potentially edit)
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
    try {
      // Use the precisely captured date from the grid if available
      let slotDateString: string | undefined;

      if (selectedSlotDate) {
        const year = selectedSlotDate.getFullYear();
        const month = String(selectedSlotDate.getMonth() + 1).padStart(2, "0");
        const day = String(selectedSlotDate.getDate()).padStart(2, "0");
        slotDateString = `${year}-${month}-${day}`;
      } else if (weekDates.length > 0 && slot.day_of_week !== undefined) {
        // Fallback to calculation if selectedSlotDate is missing (shouldn't happen with new grid logic)
        const displayDay = backendDayToDisplay(slot.day_of_week);
        const slotDate = weekDates[displayDay];
        if (slotDate) {
          const year = slotDate.getFullYear();
          const month = String(slotDate.getMonth() + 1).padStart(2, "0");
          const day = String(slotDate.getDate()).padStart(2, "0");
          slotDateString = `${year}-${month}-${day}`;
        }
      }

      setIsLoadingLessonPlan(true);
      const lessonPlanData = await getLessonPlanForSlot(
        slot.slot_id,
        slotDateString,
      );
      setLessonPlan(lessonPlanData);
      setLessonPlanSlot(slot);
      setShowLessonPlan(true);
    } catch (error: any) {
      showToast(error.message || "No lesson plan found for this slot", "error");
    } finally {
      setIsLoadingLessonPlan(false);
    }
  };

  // Handle creating/updating slot
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    const errors: typeof formErrors = {};
    if (!formData.subject_id) {
      errors.subject_id = "Please select a subject with instructor";
    }
    if (!formData.day_of_week) {
      errors.day_of_week = "Please select a day";
    }
    if (!formData.start_time) {
      errors.start_time = "Please select start time";
    }
    if (!formData.end_time) {
      errors.end_time = "Please select end time";
    }

    if (formData.start_time && formData.end_time) {
      if (formData.start_time >= formData.end_time) {
        errors.end_time = "End time must be after start time";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});

    // Parse subject_id
    const [subjectIdStr, userIdStr] = formData.subject_id.split("_");
    const subjectId = subjectIdStr || formData.subject_id;
    const userId = userIdStr || formData.user_id;

    const classGroupId = formData.class_group_id
      ? parseInt(formData.class_group_id)
      : selectedSlot?.class_group_id || 1;

    try {
      setIsSubmittingSlot(true);
      if (selectedSlot) {
        await updateCalendarSlot(selectedSlot.slot_id, {
          class_group_id: classGroupId,
          subject_id: parseInt(subjectId),
          user_id: parseInt(userId) || 0,
          day_of_week: displayDayToBackend(parseInt(formData.day_of_week)),
          start_time: formData.start_time,
          end_time: formData.end_time,
        });
        showToast("Calendar slot updated successfully", "success");
      } else {
        const calendarId = formData.calendar_id
          ? parseInt(formData.calendar_id)
          : selectedCalendar?.calendar_id || 0;
        // The server derives the term (and class group) from the calendar --
        // these are sent for the API's shape only. The old `|| 1` fallback
        // here is what wrote slots under a term they never belonged to,
        // hiding them from every grid.
        const termId =
          calendars.find((c) => c.calendar_id === calendarId)
            ?.academic_term_id ??
          selectedCalendar?.academic_term_id ??
          setupData?.academic_term_id ??
          selectedTerm ??
          0;
        await createCalendarSlot({
          calendar_id: calendarId,
          academic_term_id: termId,
          class_group_id: classGroupId,
          subject_id: parseInt(subjectId),
          user_id: parseInt(userId) || 0,
          day_of_week: displayDayToBackend(parseInt(formData.day_of_week)),
          start_time: formData.start_time,
          end_time: formData.end_time,
          location: formData.location,
        });
        showToast("Calendar slot created successfully", "success");
      }
      resetSlotModal();
      loadData();
    } catch (error: any) {
      showToast(error.message || "Failed to save calendar slot", "error");
    } finally {
      setIsSubmittingSlot(false);
    }
  };

  // ── Centralised slot-modal teardown ────────────────────────────────────────
  const resetSlotModal = () => {
    setFormData({
      calendar_id: "",
      class_group_id: "",
      subject_id: "",
      user_id: "",
      day_of_week: "",
      start_time: "",
      end_time: "",
      location: "room 1",
    });
    setFormErrors({});
    setSelectedSlot(null);
    setSetupData(null); // clear stale subjects so next open starts fresh
    setSelectedActivity(null);
    setEntryKind("lesson");
    setActivityForm(emptyActivityForm);
    setActivityErrors({});
    setShowModal(false);
  };
  // ─────────────────────────────────────────────────────────────────────────

  // Handle deleting slot
  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this slot?")) return;
    try {
      setIsDeletingSlot(true);
      await deleteCalendarSlot(id);
      showToast("Calendar slot deleted successfully", "success");
      resetSlotModal();
      loadData();
    } catch (error: any) {
      showToast(error.message || "Failed to delete slot", "error");
    } finally {
      setIsDeletingSlot(false);
    }
  };

  // Handle notification settings
  const handleSaveNotifications = async () => {
    try {
      setIsSavingNotifications(true);
      await updateNotificationSettings({ notifications });
      showToast("Notification settings saved", "success");
      setShowNotificationSettings(false);
    } catch (error: any) {
      showToast(
        error.message || "Failed to save notification settings",
        "error",
      );
    } finally {
      setIsSavingNotifications(false);
    }
  };

  // Week navigation handlers
  const goToPreviousWeek = () => {
    if (!currentWeekStart) return;
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const goToNextWeek = () => {
    if (!currentWeekStart) return;
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  const goToToday = () => {
    const today = new Date();
    const startOfWeek = getStartOfWeek(today);
    setCurrentWeekStart(startOfWeek);
  };

  // Handle create calendar button click
  const handleCreateCalendarClick = async () => {
    if (selectedYear && selectedTerm) {
      try {
        setIsLoadingClassGroups(true);
        const classGroups = await getCalendarClassGroups({
          academic_year_id: selectedYear,
        });
        if (classGroups.length === 0) {
          showToast("No class groups available for this year", "info");
          return;
        }

        // Only the class groups this user was actually assigned — a class
        // teacher of L3 Class A must not be offered L3 Class B just because
        // they share a grade. The server clamps the same way; this keeps the
        // form honest if a stale list is ever in hand. No fallback to the
        // unfiltered list: an empty result means "you have none", not
        // "show everything".
        const filteredClassGroups =
          scope.isScoped && scope.classGroupIds.length > 0
            ? classGroups.filter((cg: any) =>
                scope.classGroupIds.includes(cg.class_group_id),
              )
            : classGroups;

        setAvailableClassGroups(filteredClassGroups);

        setCalendarFormData({
          academic_year_id: selectedYear.toString(),
          academic_term_id: selectedTerm.toString(),
          class_group_id: "",
          name: "",
          description: "",
        });
        setShowCalendarModal(true);
      } catch (error: any) {
        showToast(error.message || "Failed to load class groups", "error");
      } finally {
        setIsLoadingClassGroups(false);
      }
    } else {
      showToast("Please select an academic year and term first", "warning");
    }
  };

  // Same flow as handleCreateCalendarClick, but pre-selects a specific class
  // group — used by the "Create calendar for {group}" prompt shown when a
  // group picked from the dropdown has no calendar yet for the current term.
  const handleCreateCalendarForGroup = async (
    classGroupId: number,
    classGroupName: string,
  ) => {
    if (!selectedYear || !selectedTerm) return;
    try {
      setIsLoadingClassGroups(true);
      const classGroups = await getCalendarClassGroups({
        academic_year_id: selectedYear,
      });
      setAvailableClassGroups(
        scope.isScoped && scope.classGroupIds.length > 0
          ? classGroups.filter((cg: any) =>
              scope.classGroupIds.includes(cg.class_group_id),
            )
          : classGroups,
      );
      setCalendarFormData({
        academic_year_id: selectedYear.toString(),
        academic_term_id: selectedTerm.toString(),
        class_group_id: classGroupId.toString(),
        name: `${classGroupName} Calendar`,
        description: "",
      });
      setShowCalendarModal(true);
    } catch (error: any) {
      showToast(error.message || "Failed to load class groups", "error");
    } finally {
      setIsLoadingClassGroups(false);
    }
  };

  // Handle add slot button click
  const handleAddSlotClick = () => {
    const firstSubject = setupData?.subjects[0];
    const firstTeacher = firstSubject?.teachers?.[0];
    setSelectedSlot(null);
    setSelectedActivity(null);
    setEntryKind("lesson");
    setActivityForm({
      ...emptyActivityForm,
      day_of_week: "0",
      start_time: "09:00",
      end_time: "09:50",
    });
    setModalMode("form");
    setFormData({
      calendar_id: selectedCalendar?.calendar_id?.toString() || "",
      class_group_id: selectedCalendar?.class_group_id?.toString() || "",
      subject_id: firstSubject?.subject_id?.toString() || "",
      user_id: firstTeacher?.user_id?.toString() || "",
      day_of_week: "0",
      start_time: "09:00",
      end_time: "09:50",
      location: "",
    });
    setShowModal(true);
  };

  // Handle academic calendar form submit
  const handleCalendarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingCalendar(true);
      const classGroupId = parseInt(calendarFormData.class_group_id);
      const created = await createAcademicCalendar({
        academic_year_id: parseInt(calendarFormData.academic_year_id),
        academic_term_id: parseInt(calendarFormData.academic_term_id),
        class_group_id: classGroupId,
        name: calendarFormData.name || undefined,
        description: calendarFormData.description || undefined,
      });
      showToast("Calendar created successfully", "success");
      setShowCalendarModal(false);

      // loadData() will refresh `calendars`, but this closure's `selectedCalendar`
      // still points at the pre-creation placeholder (calendar_id 0) — fetch the
      // fresh list ourselves so we can point selectedCalendar at the real row
      // that now exists, instead of leaving the "no calendar yet" banner showing.
      const calendarParams: any = {};
      if (selectedYear) calendarParams.academic_year_id = selectedYear;
      if (selectedTerm) calendarParams.academic_term_id = selectedTerm;
      const refreshedCalendars = await getAcademicCalendars(calendarParams);
      setCalendars(refreshedCalendars);
      const newCalendar = refreshedCalendars.find(
        (c) => c.calendar_id === created.calendar_id,
      );
      if (newCalendar) {
        setSelectedCalendar(newCalendar);
      }

      loadData();
    } catch (error: any) {
      showToast(error.message || "Failed to create calendar", "error");
    } finally {
      setIsSubmittingCalendar(false);
    }
  };

  // Handle modal close
  const handleModalClose = () => {
    resetSlotModal();
  };

  // Wrapper for form data change
  const handleFormDataChange = (data: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

  // Handle calendar modal close
  const handleCalendarModalClose = () => {
    setShowCalendarModal(false);
    setCalendarFormData({
      academic_year_id: "",
      academic_term_id: "",
      class_group_id: "",
      name: "",
      description: "",
    });
  };

  // Wrapper for calendar form data change
  const handleCalendarFormDataChange = (
    data: Partial<typeof calendarFormData>,
  ) => {
    setCalendarFormData((prev) => ({ ...prev, ...data }));
  };

  // Only the very first load has nothing to show around the grid. After
  // that, switching year / term / class group keeps the header and selectors
  // in place and swaps just the grid for a placeholder timetable, so the
  // control the user just touched stays under their pointer.
  const gridLoading = loading || slotsLoading;

  if (loading && !hasLoadedOnce) {
    return (
      <div className="bg-white dark:bg-gray-900/50 rounded-3xl p-6 m-3 md:m-6">
        <CalendarGridSkeleton label="Loading calendar" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900/50 rounded-3xl p-6 m-3 md:m-6">
      {/* Header with Year/Term Selector and Week Navigator */}
      <div className="flex items-center justify-between mb-6">
        <CalendarHeader
          isAdmin={isBroadView}
          title={title}
          canEdit={canEdit}
          canCreate={canCreate}
          isStudent={isStudent}
          academicYears={academicYears}
          academicTerms={academicTerms}
          calendars={calendars}
          allClassGroupsForYear={allClassGroupsForYear}
          selectedYear={selectedYear}
          selectedTerm={selectedTerm}
          selectedCalendar={selectedCalendar}
          myClassGroups={myClassGroups}
          selectedTeacherClassGroupId={selectedTeacherClassGroupId}
          dateRangeString={dateRangeString}
          onCalendarChange={setSelectedCalendar}
          onTeacherClassGroupChange={setSelectedTeacherClassGroupId}
          onCreateCalendarClick={handleCreateCalendarClick}
          onAddSlotClick={handleAddSlotClick}
          onNotificationsClick={() => setShowNotificationSettings(true)}
          onDownloadPdf={handleDownloadPdf}
          canDownload={canDownloadTimetable}
          isCreatingCalendar={isLoadingClassGroups}
        />
      </div>

      {/* Week Navigator */}
      <div className="hidden">
        <WeekNavigator
          onPreviousWeek={goToPreviousWeek}
          onNextWeek={goToNextWeek}
          onToday={goToToday}
        />
      </div>

      {/* Upcoming Lessons Alert (for instructors) */}
      <UpcomingLessons lessons={upcomingLessons} />

      {/* Reloading after a selector change: placeholder grid in place */}
      {gridLoading && <CalendarGridSkeleton label="Loading calendar" />}

      {/* Student view: single personal grid, no class-group selection needed */}
      {!gridLoading && isStudent && (
        <div className="space-y-8">
          <CalendarGrid
            classGroupName={slots[0]?.class_group_name}
            slots={slots}
            activities={filteredActivities}
            weekDates={weekDates}
            canEdit={false}
            onSlotClick={handleSlotClick}
            onEmptyCellClick={handleEmptyCellClick}
            onActivityClick={handleActivityClick}
          />
        </div>
      )}

      {/* Instructor view: single personal grid for the selected class group */}
      {!gridLoading && !isBroadView && !isStudent && selectedTeacherClassGroupId && (
        <div className="space-y-8">
          <CalendarGrid
            classGroupName={
              myClassGroups.find(
                (g) => g.class_group_id === selectedTeacherClassGroupId,
              )?.name
            }
            slots={slots}
            activities={filteredActivities}
            weekDates={weekDates}
            canEdit={canEdit}
            onSlotClick={handleSlotClick}
            onEmptyCellClick={handleEmptyCellClick}
            onActivityClick={handleActivityClick}
          />
        </div>
      )}

      {/* Instructor view: prompt to pick a class group (or notice none assigned) */}
      {!gridLoading && !isBroadView && !isStudent && !selectedTeacherClassGroupId && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <svg className="w-12 h-12 mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm font-medium mb-1">
            {myClassGroups.length === 0
              ? "No class group assignments found for this term"
              : "Select a class group to view your teaching schedule"}
          </p>
        </div>
      )}

      {/* Admin/manager view: exactly one class group's calendar at a time — there is no combined "all class groups" view */}
      {!gridLoading && isBroadView && selectedCalendar && (
        <div className="space-y-8">
          {calendarsToDisplay.map((calendar) => (
            <CalendarGrid
              key={calendar.calendar_id}
              calendarId={calendar.calendar_id}
              classGroupName={calendar.class_group_name}
              slots={slots}
              activities={filteredActivities}
              weekDates={weekDates}
              canEdit={canEdit || canManage}
              onSlotClick={handleSlotClick}
              onEmptyCellClick={handleEmptyCellClick}
              onActivityClick={handleActivityClick}
            />
          ))}
        </div>
      )}

      {/* Admin/manager view: a class group was picked, but it has no calendar
          for this specific year/term yet (distinct from nothing being
          picked at all — see the block below). Still renders the empty
          weekly grid frame — matching what the instructor view already
          shows for a class group with no lessons yet — instead of hiding
          the schedule entirely behind a text-only message; "Add Slot" stays
          disabled until a real calendar exists (CalendarGrid gates that on
          a truthy calendarId). */}
      {!gridLoading && isBroadView && selectedCalendar && !selectedCalendar.calendar_id && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              No calendar created yet for <span className="font-semibold">{selectedCalendar.class_group_name}</span> in{" "}
              {academicYears.find((y: any) => y.academic_year_id === selectedYear)?.name ?? "this year"}
              {" / "}
              {academicTerms.find((t) => t.academic_term_id === selectedTerm)?.name ?? "this term"} —
              the schedule below is empty until one is created.
            </p>
            {canCreate && (
              <button
                onClick={() =>
                  handleCreateCalendarForGroup(
                    selectedCalendar.class_group_id,
                    selectedCalendar.class_group_name || "Class Group",
                  )
                }
                disabled={isLoadingClassGroups}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors disabled:opacity-50"
              >
                Create calendar for {selectedCalendar.class_group_name}
              </button>
            )}
          </div>
          <CalendarGrid
            classGroupName={selectedCalendar.class_group_name}
            slots={slots}
            activities={filteredActivities}
            weekDates={weekDates}
            canEdit={false}
            onSlotClick={handleSlotClick}
            onEmptyCellClick={handleEmptyCellClick}
            onActivityClick={handleActivityClick}
          />
        </div>
      )}

      {/* Admin/manager view: prompt to select a class group */}
      {!gridLoading && isBroadView && !selectedCalendar && selectedYear && selectedTerm && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <svg className="w-12 h-12 mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm font-medium mb-1">Select a class group to view its calendar</p>
          {canCreate && (
            <p className="text-xs">No calendar yet for this class group? Use the <span className="font-semibold">Create Calendar</span> button above to set one up.</p>
          )}
        </div>
      )}

      {/* Legend */}
      <CalendarLegend showActivityLegend={filteredActivities.length > 0} />

      {/* Modals */}
      <CalendarSlotModal
        showModal={showModal}
        selectedSlot={selectedSlot}
        formData={formData}
        formErrors={formErrors}
        effectiveClassGroupId={effectiveClassGroupId}
        setupData={setupData}
        onClose={handleModalClose}
        onSubmit={handleSubmit}
        onFormDataChange={handleFormDataChange}
        onErrorsChange={setFormErrors}
        onDelete={handleDelete}
        mode={modalMode}
        canEdit={Boolean(canEdit)}
        canViewLessonPlan={Boolean(canViewSummaryLessonPlan)}
        onEditClick={() => setModalMode("form")}
        onViewLessonPlan={handleViewLessonPlan}
        isSubmitting={entryKind === "activity" ? isSubmittingActivity : isSubmittingSlot}
        isDeleting={entryKind === "activity" ? isDeletingActivity : isDeletingSlot}
        isLoadingLessonPlan={isLoadingLessonPlan}
        entryKind={entryKind}
        onEntryKindChange={setEntryKind}
        canManageActivities={Boolean(canManage)}
        selectedActivity={selectedActivity}
        activityForm={activityForm}
        activityErrors={activityErrors}
        onActivityFormChange={(data) =>
          setActivityForm((prev) => ({ ...prev, ...data }))
        }
        onActivityErrorsChange={setActivityErrors}
        onActivitySubmit={handleActivitySubmit}
        onActivityDelete={handleActivityDelete}
      />

      <AcademicCalendarModal
        showModal={showCalendarModal}
        academicYears={academicYears}
        academicTerms={academicTerms}
        availableClassGroups={availableClassGroups}
        formData={calendarFormData}
        onClose={handleCalendarModalClose}
        onSubmit={handleCalendarSubmit}
        onFormDataChange={handleCalendarFormDataChange}
        isSubmitting={isSubmittingCalendar}
      />

      <LessonPlanModal
        showModal={showLessonPlan}
        lessonPlan={lessonPlan}
        onClose={() => {
          setShowLessonPlan(false);
          setLessonPlan(null);
          setLessonPlanSlot(null);
        }}
        onGenerated={() => {
          if (lessonPlanSlot) handleViewLessonPlan(lessonPlanSlot);
        }}
      />

      <NotificationSettingsModal
        showModal={showNotificationSettings}
        notifications={notifications}
        onClose={() => setShowNotificationSettings(false)}
        onSave={handleSaveNotifications}
        onNotificationsChange={setNotifications}
        isSubmitting={isSavingNotifications}
      />
    </div>
  );
};

export default AcademicCalendar;
