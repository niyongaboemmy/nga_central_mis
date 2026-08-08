import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import {
  getReportById,
  getDashboardStats,
  getAllAdminReports,
  getMissingReports,
} from "../controllers/reportController";
import {
  getReportableLessons,
  submitLessonReport,
  getLessonReportById,
  updateLessonReport,
  getWeeklySummary,
  getMyLessonReportsRollup,
} from "../controllers/lessonReportController";
import {
  getAdminDashboardStats,
  getComplianceReport,
  getSubjectCoverageStats,
  getAdminLessonReports,
  getAdminLessonReportsRollup,
  adminUpdateLessonReportApproval,
  getSupportRequestSummary,
  getChallengeSummary,
  getAdminMentorshipLogs,
  adminUpdateMentorshipSessionApproval,
  getAdminProjectUpdates,
  getWeeklyStitchedReport,
  exportReportingData,
  getAdminStudentTimeline,
} from "../controllers/adminReportController";
import {
  getSupportRequestCategories,
  getChallengeCategories,
  createSupportRequestCategory,
  updateSupportRequestCategory,
  deactivateSupportRequestCategory,
  createChallengeCategory,
  updateChallengeCategory,
  deactivateChallengeCategory,
} from "../controllers/reportCategoryController";
import { Permissions } from "../utils/permissions";

const router = Router();

// All routes are protected
router.use(authenticate);

// Phase 6 permission split: narrower VIEW_REPORTS / EXPORT_REPORTS /
// MANAGE_REPORTS permissions replace the single ALL_SUBMITTED_REPORTS.
// ALL_SUBMITTED_REPORTS is kept as an OR-fallback in every guard below for
// at least one release cycle (rollback plan) — existing roles were granted
// all three new permissions in the same migration that added them
// (046_reporting_permissions_split.sql), so no admin loses access.
const canView   = [Permissions.VIEW_REPORTS, Permissions.ALL_SUBMITTED_REPORTS];
const canExport = [Permissions.EXPORT_REPORTS, Permissions.ALL_SUBMITTED_REPORTS];
const canManage = [Permissions.MANAGE_REPORTS, Permissions.ALL_SUBMITTED_REPORTS];

// Phase 5 (decommission legacy InstructorReport flow): these five endpoints
// only ever had one caller — ReportForm.tsx / SubmittedReports.tsx /
// ReportingCalendar.tsx, all removed from active navigation in
// ReportingModule.tsx. Confirmed via a grep of every frontend call site
// before retiring — 410, not a silent 404, so any stray caller gets a clear
// signal instead of a confusing "not found". The controller functions
// themselves are left defined in reportController.ts (not deleted), same
// rollback-friendly approach used for the removed UI components.
//
// GET /dashboard-stats and GET /:id are deliberately NOT retired here even
// though the original Phase 5 plan listed /dashboard-stats as a candidate —
// ReportingModule.tsx's "Dashboard" tab (kept live, instructor's own stats)
// still calls getDashboardStats, and ReportDetailsModal.tsx (still used by
// the admin "Weekly Reports" read-only view) still calls getById.
const retired = (replacement: string) => (req: any, res: any) =>
  res.status(410).json({
    success: false,
    message: `This endpoint has been retired as part of the reporting module restructure. Use ${replacement} instead.`,
  });

router.post("/submit", retired("POST /reports/lessons"));
router.get("/autofill", retired("GET /reports/lessons/reportable"));
router.get("/", retired("GET /reports/admin/lesson-reports (admin) or GET /reports/lessons/reportable (instructor)"));
router.put("/:id", retired("PUT is not yet supported on /reports/lessons/:id"));
router.get("/by-date", retired("GET /reports/lessons/reportable"));

// Admin: View all submitted reports
router.get("/admin/all", authorize(canView), getAllAdminReports);

// Admin: View instructors who haven't submitted reports
router.get("/admin/missing", authorize(canView), getMissingReports);

// Admin: Live aggregated analytics dashboard stats
router.get("/admin/dashboard", authorize(canView), getAdminDashboardStats);

// Admin: Per-instructor reporting compliance health
router.get("/admin/compliance", authorize(canView), getComplianceReport);

// Admin: List views for each decoupled log category
router.get("/admin/lesson-reports", authorize(canView), getAdminLessonReports);
router.get("/admin/lesson-reports/rollup", authorize(canView), getAdminLessonReportsRollup);
router.patch("/admin/lesson-reports/:id/approval", authorize(canManage), adminUpdateLessonReportApproval);

// Admin: ranked Support Needed / Challenges summaries (Phase 4)
router.get("/admin/support-requests/summary", authorize(canView), getSupportRequestSummary);
router.get("/admin/challenges/summary", authorize(canView), getChallengeSummary);

// Admin-managed lookup lists — mutations require MANAGE_REPORTS.
router.post("/admin/categories/support-request", authorize(canManage), createSupportRequestCategory);
router.put("/admin/categories/support-request/:id", authorize(canManage), updateSupportRequestCategory);
router.delete("/admin/categories/support-request/:id", authorize(canManage), deactivateSupportRequestCategory);
router.post("/admin/categories/challenge", authorize(canManage), createChallengeCategory);
router.put("/admin/categories/challenge/:id", authorize(canManage), updateChallengeCategory);
router.delete("/admin/categories/challenge/:id", authorize(canManage), deactivateChallengeCategory);

// Any authenticated user (instructors) — populates the LessonReportModal
// Support Needed / Challenges pickers.
router.get("/categories/support-request", getSupportRequestCategories);
router.get("/categories/challenge", getChallengeCategories);

router.get("/admin/mentorship-logs", authorize(canView), getAdminMentorshipLogs);
router.patch("/admin/mentorship-logs/:id/approval", authorize(canManage), adminUpdateMentorshipSessionApproval);
router.get("/admin/project-updates", authorize(canView), getAdminProjectUpdates);

// Admin: Per-subject SOW vs delivery compliance heatmap
router.get("/admin/coverage", authorize(canView), getSubjectCoverageStats);

// Admin: Unified weekly stitched report (lessons + mentorship + projects in one response)
router.get("/admin/weekly-stitched", authorize(canView), getWeeklyStitchedReport);

// Admin: Full mentorship timeline for a specific student (cross-instructor view)
router.get("/admin/student-timeline/:studentId", authorize(canView), getAdminStudentTimeline);

// Admin: CSV/HTML/rollup export (streams file directly — use window.open or <a href> on the client)
router.get("/admin/export", authorize(canExport), exportReportingData);

// Get dashboard statistics
router.get("/dashboard-stats", getDashboardStats);

// Decoupled lesson reporting — must precede /lessons/:id catch-all
router.get("/lessons/reportable", getReportableLessons);
router.get("/lessons/rollup", getMyLessonReportsRollup);
router.post("/lessons", submitLessonReport);
router.get("/lessons/:id", getLessonReportById);
router.put("/lessons/:id", updateLessonReport);
router.get("/weekly-summary", getWeeklySummary);

// Get a single report by ID — still used by the admin "Weekly Reports"
// read-only view (ReportDetailsModal.tsx); see the retirement note above.
router.get("/:id", getReportById);

export default router;
