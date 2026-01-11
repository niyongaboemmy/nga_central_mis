import express from "express";
import { getDashboardStats } from "../controllers/dashboardController";
import { authenticate } from "../middleware/auth";

const router = express.Router();

// All dashboard routes require authentication
router.use(authenticate);

// Get dashboard statistics
router.get("/stats", getDashboardStats);

export default router;
