import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import {
  getAssignedStudents,
  getStudentMentorshipHistory,
  getMenteeIntelligence,
  submitMentorshipSession,
  getMentorshipSessionById,
  updateMentorshipSession,
  updateSessionStatus,
  getPendingFollowUps,
  getAdminMentoringLog,
  submitCheckIn,
  getMyCheckIns,
  getMyMentor,
  getCheckInInbox,
  getCheckInDetail,
  updateCheckIn,
  getConsolidatedReport,
  getAdminCheckIns,
  getMySessionsReport,
  adminUpdateCheckIn,
  getAdminMentorshipDashboard,
} from "../controllers/mentorshipController";
import { generateMenteeAIInsights } from "../controllers/mentorshipAIController";
import {
  listAssignments,
  createAssignment,
  bulkAssign,
  endAssignment,
  getUnassignedStudents,
} from "../controllers/mentorAssignmentController";
import { Permissions } from "../utils/permissions";

const router = Router();

router.use(authenticate);

// Instructor (mentor) routes
router.get("/students", authorize(Permissions.TEACHER_DASHBOARD), getAssignedStudents);
router.get("/students/:studentId/history", authorize(Permissions.TEACHER_DASHBOARD), getStudentMentorshipHistory);
router.get("/students/:studentId/intelligence", authorize(Permissions.TEACHER_DASHBOARD), getMenteeIntelligence);
router.post(
  "/students/:studentId/ai-insights",
  authorize(Permissions.TEACHER_DASHBOARD),
  generateMenteeAIInsights,
);
router.get("/follow-ups", authorize(Permissions.TEACHER_DASHBOARD), getPendingFollowUps);
router.post("/sessions", authorize(Permissions.SUBMIT_REPORTING), submitMentorshipSession);
router.get("/sessions/:sessionId", authorize(Permissions.SUBMIT_REPORTING), getMentorshipSessionById);
router.put("/sessions/:sessionId", authorize(Permissions.SUBMIT_REPORTING), updateMentorshipSession);
router.patch("/sessions/:sessionId/status", authorize(Permissions.SUBMIT_REPORTING), updateSessionStatus);
router.get(
  "/reports/consolidated",
  authorize([
    Permissions.TEACHER_DASHBOARD,
    Permissions.MANAGE_REPORTS,
    Permissions.ALL_SUBMITTED_REPORTS,
    Permissions.VIEW_REPORTS,
  ]),
  getConsolidatedReport,
);
router.get(
  "/reports/my-sessions",
  authorize(Permissions.TEACHER_DASHBOARD),
  getMySessionsReport,
);

// Mentor's check-in inbox (mentee-submitted messages) — specific paths
// ("inbox") must be registered before the "/:id" wildcard route below.
router.get("/checkins/inbox", authorize(Permissions.TEACHER_DASHBOARD), getCheckInInbox);

// Student (mentee) routes — "/mine" must also precede "/:id"
router.post("/checkins", authorize(Permissions.SUBMIT_MENTEE_CHECKIN), submitCheckIn);
router.get("/checkins/mine", authorize(Permissions.SUBMIT_MENTEE_CHECKIN), getMyCheckIns);
router.get("/my-mentor", authorize(Permissions.SUBMIT_MENTEE_CHECKIN), getMyMentor);

router.get("/checkins/:id", authorize(Permissions.TEACHER_DASHBOARD), getCheckInDetail);
router.patch("/checkins/:id", authorize(Permissions.TEACHER_DASHBOARD), updateCheckIn);

// Admin routes
router.get(
  "/admin/log",
  authorize([Permissions.ALL_SUBMITTED_REPORTS, Permissions.VIEW_REPORTS]),
  getAdminMentoringLog,
);
router.get(
  "/admin/checkins",
  authorize([Permissions.ALL_SUBMITTED_REPORTS, Permissions.VIEW_REPORTS]),
  getAdminCheckIns,
);
router.patch(
  "/admin/checkins/:id",
  authorize([Permissions.MANAGE_REPORTS, Permissions.ALL_SUBMITTED_REPORTS]),
  adminUpdateCheckIn,
);
router.get(
  "/admin/dashboard",
  authorize([Permissions.ALL_SUBMITTED_REPORTS, Permissions.VIEW_REPORTS]),
  getAdminMentorshipDashboard,
);
router.get("/admin/assignments", authorize(Permissions.MANAGE_MENTOR_ASSIGNMENTS), listAssignments);
router.get(
  "/admin/unassigned-students",
  authorize(Permissions.MANAGE_MENTOR_ASSIGNMENTS),
  getUnassignedStudents,
);
router.post("/assignments", authorize(Permissions.MANAGE_MENTOR_ASSIGNMENTS), createAssignment);
router.post("/assignments/bulk", authorize(Permissions.MANAGE_MENTOR_ASSIGNMENTS), bulkAssign);
router.delete("/assignments/:id", authorize(Permissions.MANAGE_MENTOR_ASSIGNMENTS), endAssignment);

export default router;
