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

// Get dashboard statistics
router.get("/dashboard-stats", getDashboardStats);

// Get a single report by ID
router.get("/by-date", getReportByDate);
router.put("/:id", updateReport);
router.get("/:id", getReportById);

export default router;
