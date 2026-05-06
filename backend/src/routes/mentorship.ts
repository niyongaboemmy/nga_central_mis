import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import {
  getAssignedStudents,
  getStudentMentorshipHistory,
  getMenteeIntelligence,
  submitMentorshipSession,
  updateSessionStatus,
  getPendingFollowUps,
  getAdminMentoringLog,
} from "../controllers/mentorshipController";
import { Permissions } from "../utils/permissions";

const router = Router();

router.use(authenticate);

// Instructor routes
router.get("/students", authorize(Permissions.TEACHER_DASHBOARD), getAssignedStudents);
router.get("/students/:studentId/history", authorize(Permissions.TEACHER_DASHBOARD), getStudentMentorshipHistory);
router.get("/students/:studentId/intelligence", authorize(Permissions.TEACHER_DASHBOARD), getMenteeIntelligence);
router.get("/follow-ups", authorize(Permissions.TEACHER_DASHBOARD), getPendingFollowUps);
router.post("/sessions", authorize(Permissions.SUBMIT_REPORTING), submitMentorshipSession);
router.patch("/sessions/:sessionId/status", authorize(Permissions.SUBMIT_REPORTING), updateSessionStatus);

// Admin routes
router.get("/admin/log", authorize(Permissions.ALL_SUBMITTED_REPORTS), getAdminMentoringLog);

export default router;
