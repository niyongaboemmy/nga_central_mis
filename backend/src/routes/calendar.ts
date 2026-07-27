import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  getCalendarSlots,
  createCalendarSlot,
  updateCalendarSlot,
  deleteCalendarSlot,
  getMyCalendar,
  getNotificationSettings,
  updateNotificationSettings,
  checkUpcomingLessons,
  getCalendarActivities,
  createCalendarActivity,
  updateCalendarActivity,
  deleteCalendarActivity,
  getLessonPlanForSlot,
  getCalendarSetupData,
  getStudentCalendar,
  createAcademicCalendar,
  getAcademicCalendars,
  getAcademicCalendar,
  updateAcademicCalendar,
  deleteAcademicCalendar,
  getCalendarClassGroups,
  getMyClassGroups,
} from "../controllers/calendarController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

// All calendar routes require authentication

// Admin Calendar Management Routes
router.get(
  "/slots",
  authenticate,
  authorize([
    "MANAGE_ACADEMIC_CALENDAR",
    "VIEW_ACADEMIC_CALENDAR",
    "UPDATE_CALENDAR_SLOT",
  ]),
  asyncHandler(getCalendarSlots),
);
router.post(
  "/slots",
  authenticate,
  authorize(["MANAGE_ACADEMIC_CALENDAR", "UPDATE_CALENDAR_SLOT"]),
  asyncHandler(createCalendarSlot),
);
router.put(
  "/slots/:id",
  authenticate,
  authorize(["MANAGE_ACADEMIC_CALENDAR", "UPDATE_CALENDAR_SLOT"]),
  asyncHandler(updateCalendarSlot),
);
router.delete(
  "/slots/:id",
  authenticate,
  authorize("MANAGE_ACADEMIC_CALENDAR"),
  asyncHandler(deleteCalendarSlot),
);

// Calendar Setup Data (for admin and users with create/update permissions)
router.get(
  "/setup-data",
  authenticate,
  authorize([
    "MANAGE_ACADEMIC_CALENDAR",
    "CREATE_ACADEMIC_CALENDAR",
    "UPDATE_CALENDAR_SLOT",
  ]),
  asyncHandler(getCalendarSetupData),
);

// Calendar Activities
router.get(
  "/activities",
  authenticate,
  authorize([
    "MANAGE_ACADEMIC_CALENDAR",
    "VIEW_ACADEMIC_CALENDAR",
    "VIEW_MY_CALENDAR",
  ]),
  asyncHandler(getCalendarActivities),
);
router.post(
  "/activities",
  authenticate,
  authorize("MANAGE_ACADEMIC_CALENDAR"),
  asyncHandler(createCalendarActivity),
);
router.put(
  "/activities/:id",
  authenticate,
  authorize("MANAGE_ACADEMIC_CALENDAR"),
  asyncHandler(updateCalendarActivity),
);
router.delete(
  "/activities/:id",
  authenticate,
  authorize("MANAGE_ACADEMIC_CALENDAR"),
  asyncHandler(deleteCalendarActivity),
);

// Instructor Routes
router.get(
  "/my-calendar",
  authenticate,
  authorize(["VIEW_MY_CALENDAR", "TEACHER_DASHBOARD"]),
  asyncHandler(getMyCalendar),
);
router.get(
  "/notifications",
  authenticate,
  authorize(["VIEW_CALENDAR_NOTIFICATIONS", "MANAGE_CALENDAR_NOTIFICATIONS"]),
  asyncHandler(getNotificationSettings),
);
router.put(
  "/notifications",
  authenticate,
  authorize("MANAGE_CALENDAR_NOTIFICATIONS"),
  asyncHandler(updateNotificationSettings),
);
router.get(
  "/upcoming",
  authenticate,
  authorize(["VIEW_MY_CALENDAR", "TEACHER_DASHBOARD"]),
  asyncHandler(checkUpcomingLessons),
);
router.get(
  "/my-class-groups",
  authenticate,
  authorize(["VIEW_MY_CALENDAR", "TEACHER_DASHBOARD"]),
  asyncHandler(getMyClassGroups),
);

// Lesson Plan Integration
router.get(
  "/lesson-plan/:slot_id",
  authenticate,
  authorize(["VIEW_LESSON_PLANS", "VIEW_MY_CALENDAR"]),
  asyncHandler(getLessonPlanForSlot),
);

// Student Calendar
router.get(
  "/student-calendar",
  authenticate,
  authorize("VIEW_STUDENT_CALENDAR"),
  asyncHandler(getStudentCalendar),
);

// Academic Calendar Management (year + term + class group)
// IMPORTANT: specific routes must come before parameterized routes

// Get class groups available for calendar creation (must be before /:id route)
router.get(
  "/calendars/class-groups",
  authenticate,
  authorize([
    "MANAGE_ACADEMIC_CALENDAR",
    "VIEW_ACADEMIC_CALENDAR",
    "CREATE_ACADEMIC_CALENDAR",
  ]),
  asyncHandler(getCalendarClassGroups),
);

router.post(
  "/calendars",
  authenticate,
  authorize(["MANAGE_ACADEMIC_CALENDAR", "CREATE_ACADEMIC_CALENDAR"]),
  asyncHandler(createAcademicCalendar),
);
router.get(
  "/calendars",
  authenticate,
  authorize([
    "MANAGE_ACADEMIC_CALENDAR",
    "VIEW_ACADEMIC_CALENDAR",
    "CREATE_ACADEMIC_CALENDAR",
    "UPDATE_CALENDAR_SLOT",
  ]),
  asyncHandler(getAcademicCalendars),
);
router.get(
  "/calendars/:id",
  authenticate,
  authorize([
    "MANAGE_ACADEMIC_CALENDAR",
    "VIEW_ACADEMIC_CALENDAR",
    "CREATE_ACADEMIC_CALENDAR",
    "UPDATE_CALENDAR_SLOT",
  ]),
  asyncHandler(getAcademicCalendar),
);
router.put(
  "/calendars/:id",
  authenticate,
  authorize("MANAGE_ACADEMIC_CALENDAR"),
  asyncHandler(updateAcademicCalendar),
);
router.delete(
  "/calendars/:id",
  authenticate,
  authorize("MANAGE_ACADEMIC_CALENDAR"),
  asyncHandler(deleteAcademicCalendar),
);

export default router;
