import express from "express";
import {
  getDashboardStats,
  getTeacherDashboardStats,
  getBasicDashboardStats,
} from "../controllers/dashboardController";
import { authenticate } from "../middleware/auth";

const router = express.Router();

// All dashboard routes require authentication
router.use(authenticate);

// Get dashboard statistics
router.get("/stats", getDashboardStats);

// Get basic dashboard statistics
router.get("/basic-stats", getBasicDashboardStats);

// Get teacher dashboard statistics
router.get("/teacher-stats", getTeacherDashboardStats);

export default router;
