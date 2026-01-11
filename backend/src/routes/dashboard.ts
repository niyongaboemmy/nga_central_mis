import express from "express";
import {
  getDashboardStats,
  getTeacherDashboardStats,
} from "../controllers/dashboardController";
import { authenticate } from "../middleware/auth";

const router = express.Router();

// All dashboard routes require authentication
router.use(authenticate);

// Get dashboard statistics
router.get("/stats", getDashboardStats);

// Get teacher dashboard statistics
router.get("/teacher-stats", getTeacherDashboardStats);

export default router;
