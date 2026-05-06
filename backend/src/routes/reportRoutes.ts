import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import {
  submitReport,
  getAutoFillData,
  getReports,
  getReportById,
  getDashboardStats,
  getReportByDate,
  updateReport,
  getAllAdminReports,
  getMissingReports,
} from "../controllers/reportController";
import {
  getReportableLessons,
  submitLessonReport,
  getWeeklySummary,
} from "../controllers/lessonReportController";
import {
  getAdminDashboardStats,
  getComplianceReport,
  getSubjectCoverageStats,
  getAdminLessonReports,
  getAdminMentorshipLogs,
  getAdminProjectUpdates,
  getWeeklyStitchedReport,
  exportReportingData,
  getAdminStudentTimeline,
} from "../controllers/adminReportController";
import { Permissions } from "../utils/permissions";

const router = Router();

// All routes are protected
router.use(authenticate);

// Submit a new report
router.post("/submit", submitReport);

// Get auto-fill data for a given range
router.get("/autofill", getAutoFillData);

// List reports (instructors see their own, admins see all)
router.get("/", getReports);

// Admin: View all submitted reports
router.get(
  "/admin/all",
  authorize(Permissions.ALL_SUBMITTED_REPORTS),
  getAllAdminReports,
);

// Admin: View instructors who haven't submitted reports
router.get(
  "/admin/missing",
  authorize(Permissions.ALL_SUBMITTED_REPORTS),
  getMissingReports,
);

// Admin: Live aggregated analytics dashboard stats
router.get(
  "/admin/dashboard",
  authorize(Permissions.ALL_SUBMITTED_REPORTS),
  getAdminDashboardStats,
);

// Admin: Per-instructor reporting compliance health
router.get(
  "/admin/compliance",
  authorize(Permissions.ALL_SUBMITTED_REPORTS),
  getComplianceReport,
);

// Admin: List views for each decoupled log category
router.get(
  "/admin/lesson-reports",
  authorize(Permissions.ALL_SUBMITTED_REPORTS),
  getAdminLessonReports,
);
router.get(
  "/admin/mentorship-logs",
  authorize(Permissions.ALL_SUBMITTED_REPORTS),
  getAdminMentorshipLogs,
);
router.get(
  "/admin/project-updates",
  authorize(Permissions.ALL_SUBMITTED_REPORTS),
  getAdminProjectUpdates,
);

// Admin: Per-subject SOW vs delivery compliance heatmap
router.get(
  "/admin/coverage",
  authorize(Permissions.ALL_SUBMITTED_REPORTS),
  getSubjectCoverageStats,
);

// Admin: Unified weekly stitched report (lessons + mentorship + projects in one response)
router.get(
  "/admin/weekly-stitched",
  authorize(Permissions.ALL_SUBMITTED_REPORTS),
  getWeeklyStitchedReport,
);

// Admin: Full mentorship timeline for a specific student (cross-instructor view)
router.get(
  "/admin/student-timeline/:studentId",
  authorize(Permissions.ALL_SUBMITTED_REPORTS),
  getAdminStudentTimeline,
);

// Admin: CSV/HTML export (streams file directly — use window.open or <a href> on the client)
router.get(
  "/admin/export",
  authorize(Permissions.ALL_SUBMITTED_REPORTS),
  exportReportingData,
);

// Get dashboard statistics
router.get("/dashboard-stats", getDashboardStats);

// Decoupled lesson reporting — must precede /:id catch-all
router.get("/lessons/reportable", getReportableLessons);
router.post("/lessons", submitLessonReport);
router.get("/weekly-summary", getWeeklySummary);

// Get a single report by ID
router.get("/by-date", getReportByDate);
router.put("/:id", updateReport);
router.get("/:id", getReportById);

export default router;
