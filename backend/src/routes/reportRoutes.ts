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

// Get dashboard statistics
router.get("/dashboard-stats", getDashboardStats);

// Get a single report by ID
router.get("/by-date", getReportByDate);
router.put("/:id", updateReport);
router.get("/:id", getReportById);

export default router;
