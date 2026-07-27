import React, { useState, useEffect, useMemo } from "react";
import { useUser } from "../contexts/UserContext";
import { useToast } from "../contexts/ToastContext";
import { Permissions } from "../constants/permissions";
import {
  academicYearsApi,
  academicTermsApi,
  AcademicTerm,
} from "../api/academics";
import {
  CalendarSlot,
  CalendarActivity,
  CalendarNotification,
  UpcomingLesson,
  getCalendarSlots,
  createCalendarSlot,
  updateCalendarSlot,
  deleteCalendarSlot,
  getCalendarActivities,
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

// Import calendar components
import {
  CalendarHeader,
  WeekNavigator,
  UpcomingLessons,
  CalendarLegend,
  CalendarGrid,
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
}

const AcademicCalendar: React.FC<AcademicCalendarProps> = ({
  isAdminView = false,
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

  const canManage = isAdminView || canManageCalendar;
  const canViewAll =
    canManage || hasViewCalendar || canCreateCalendar || canUpdateSlot;
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

  // State
  const [loading, setLoading] = useState(true);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [academicTerms, setAcademicTerms] = useState<AcademicTerm[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);
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
      (a) => a.class_group_id === selectedCalendar.class_group_id,
    );
  }, [activities, selectedCalendar]);

  // There is no "all class groups" combined view — a calendar only ever
  // renders for the one specific class group currently selected.
  const calendarsToDisplay = useMemo(() => {
    return selectedCalendar ? [selectedCalendar] : [];
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

  // Week dates
  const weekDates = useMemo(() => {
    if (!currentWeekStart) return [];
    return getWeekDates(currentWeekStart);
  }, [currentWeekStart]);

  // Date range string
  const dateRangeString = useMemo(() => {
    return getDateRangeString(weekDates);
  }, [weekDates]);

  // Load data
  useEffect(() => {
    loadAcademicYears();
    const interval = setInterval(checkUpcoming, 60000);
    return () => clearInterval(interval);
  }, []);

  // Load data when term changes
  useEffect(() => {
    if (selectedTerm) {
      loadData();
    }
  }, [selectedTerm]);

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

  // Load academic terms for a year
  const loadTerms = async (yearId: number) => {
    try {
      const termsRes = await academicTermsApi.getAll(yearId);
      const responseData = (termsRes as any).data;
      const terms = (responseData as any).data || responseData;
      setAcademicTerms(terms);

      // Find current term
      const currentTerm = terms.find((t: AcademicTerm) => t.is_current === 1);
      if (currentTerm) {
        setSelectedTerm(currentTerm.academic_term_id);
      }
    } catch (error) {
      console.error("Failed to load academic terms:", error);
    }
  };

  // Load academic years and terms
  const loadAcademicYears = async () => {
    try {
      const yearsRes = await academicYearsApi.getAll();
      const responseData = (yearsRes as any).data;
      const years = (responseData as any).data || responseData;
      setAcademicYears(years);

      // Find current year or first available
      const currentYear =
        years.find((y: any) => y.is_current === 1) || years[0];
      if (currentYear) {
        setSelectedYear(currentYear.academic_year_id);
        loadTerms(currentYear.academic_year_id);
        // Set current week start to today (Monday of current week)
        const today = new Date();
        const startOfWeek = getStartOfWeek(today);
        setCurrentWeekStart(startOfWeek);
      }
    } catch (error) {
      console.error("Failed to load academic years:", error);
    }
  };

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

        const [slotsData, activitiesData, setupDataRes, calendarsData] =
          await Promise.all([
            getCalendarSlots(params),
            getCalendarActivities(params),
            getCalendarSetupData(
              selectedTerm || undefined,
              selectedCalendar?.class_group_id
                ? selectedCalendar.class_group_id
                : undefined,
            ),
            getAcademicCalendars(calendarParams),
          ]);
        setSlots(slotsData);
        setActivities(activitiesData);
        setSetupData(setupDataRes);
        setCalendars(calendarsData);
      } else if (isStudent) {
        // Student view — the backend already scopes this to the student's own
        // class group and enrolled subjects, so no group selector is needed.
        const calendarData = await getStudentCalendar(params);
        setSlots(calendarData.slots);
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

        const [calendarData, notificationsData, upcomingData] =
          await Promise.all([
            getMyCalendar({ ...params, class_group_id: effectiveGroupId }),
            getNotificationSettings(),
            checkUpcomingLessons(),
          ]);
        setSlots(calendarData.slots);
        setUpcomingLessons(upcomingData);
        setNotifications(notificationsData);
      }
    } catch (error: any) {
      showToast(error.message || "Failed to load calendar data", "error");
    } finally {
      setLoading(false);
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

    setShowModal(true);
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
        const termId = formData.calendar_id
          ? calendars.find((c) => c.calendar_id === calendarId)
              ?.academic_term_id ||
            setupData?.academic_term_id ||
            1
          : selectedCalendar?.academic_term_id ||
            setupData?.academic_term_id ||
            1;
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

        // Filter class groups to only those within the user's assigned grades
        const userGradeNames = user?.assignedGrades?.map((g) => g.name) ?? [];
        const filteredClassGroups =
          userGradeNames.length > 0
            ? classGroups.filter((cg: any) =>
                userGradeNames.includes(cg.grade_name ?? ""),
              )
            : classGroups;

        setAvailableClassGroups(
          filteredClassGroups.length > 0 ? filteredClassGroups : classGroups,
        );

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

  // Handle add slot button click
  const handleAddSlotClick = () => {
    const firstSubject = setupData?.subjects[0];
    const firstTeacher = firstSubject?.teachers?.[0];
    setSelectedSlot(null);
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
      await createAcademicCalendar({
        academic_year_id: parseInt(calendarFormData.academic_year_id),
        academic_term_id: parseInt(calendarFormData.academic_term_id),
        class_group_id: parseInt(calendarFormData.class_group_id),
        name: calendarFormData.name || undefined,
        description: calendarFormData.description || undefined,
      });
      showToast("Calendar created successfully", "success");
      setShowCalendarModal(false);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900/50 rounded-3xl p-6 m-3 md:m-6">
      {/* Header with Year/Term Selector and Week Navigator */}
      <div className="flex items-center justify-between mb-6">
        <CalendarHeader
          isAdmin={isBroadView}
          canEdit={canEdit}
          canCreate={canCreate}
          isStudent={isStudent}
          academicYears={academicYears}
          academicTerms={academicTerms}
          calendars={calendars}
          selectedYear={selectedYear}
          selectedTerm={selectedTerm}
          selectedCalendar={selectedCalendar}
          myClassGroups={myClassGroups}
          selectedTeacherClassGroupId={selectedTeacherClassGroupId}
          dateRangeString={dateRangeString}
          onYearChange={(yearId) => {
            setSelectedYear(yearId);
            loadTerms(yearId);
          }}
          onTermChange={setSelectedTerm}
          onCalendarChange={setSelectedCalendar}
          onTeacherClassGroupChange={setSelectedTeacherClassGroupId}
          onCreateCalendarClick={handleCreateCalendarClick}
          onAddSlotClick={handleAddSlotClick}
          onNotificationsClick={() => setShowNotificationSettings(true)}
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

      {/* Student view: single personal grid, no class-group selection needed */}
      {isStudent && (
        <div className="space-y-8">
          <CalendarGrid
            classGroupName={slots[0]?.class_group_name}
            slots={slots}
            activities={filteredActivities}
            weekDates={weekDates}
            canEdit={false}
            onSlotClick={handleSlotClick}
            onEmptyCellClick={handleEmptyCellClick}
          />
        </div>
      )}

      {/* Instructor view: single personal grid for the selected class group */}
      {!isBroadView && !isStudent && selectedTeacherClassGroupId && (
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
          />
        </div>
      )}

      {/* Instructor view: prompt to pick a class group (or notice none assigned) */}
      {!isBroadView && !isStudent && !selectedTeacherClassGroupId && (
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
      {isBroadView && selectedCalendar && (
        <div className="space-y-8">
          {calendarsToDisplay.map((calendar) => (
            <CalendarGrid
              key={calendar.calendar_id}
              calendarId={calendar.calendar_id}
              classGroupName={calendar.class_group_name}
              slots={slots}
              activities={filteredActivities}
              weekDates={weekDates}
              canEdit={canEdit}
              onSlotClick={handleSlotClick}
              onEmptyCellClick={handleEmptyCellClick}
            />
          ))}
        </div>
      )}

      {/* Admin/manager view: prompt to select a class group */}
      {isBroadView && !selectedCalendar && selectedYear && selectedTerm && (
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
        isSubmitting={isSubmittingSlot}
        isDeleting={isDeletingSlot}
        isLoadingLessonPlan={isLoadingLessonPlan}
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
