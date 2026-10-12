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
  getMyMentorshipRole,
} from "../controllers/mentorshipController";
import { generateMenteeAIInsights } from "../controllers/mentorshipAIController";
import {
  listAssignments,
  createAssignment,
  bulkAssign,
  endAssignment,
  getUnassignedStudents,
  searchCandidates,
} from "../controllers/mentorAssignmentController";
import { Permissions } from "../utils/permissions";
import { db } from "../db";
import { MentorAssignment } from "../db/schema";
import { and, eq } from "drizzle-orm";

const router = Router();

router.use(authenticate);

/**
 * Mentor-side gate. A mentor may be anyone who is not a student — teachers,
 * but also staff and admins who hold no teacher permission. Holding the
 * route's permission still works as before; otherwise an ACTIVE assignment
 * as mentor is what grants entry. Each handler then scopes the data to the
 * caller's own mentees.
 */
const mentorOr = (perm: string | string[]) => {
  const allow = authorize(perm);
  return async (req: any, res: any, next: any) => {
    const perms: string[] = req.user?.permissions ?? [];
    const required = Array.isArray(perm) ? perm : [perm];
    if (required.some((p) => perms.includes(p))) return allow(req, res, next);
    try {
      const [row] = await db
        .select({ id: MentorAssignment.assignment_id })
        .from(MentorAssignment)
        .where(and(eq(MentorAssignment.mentor_id, req.user.userId), eq(MentorAssignment.status, "ACTIVE")))
        .limit(1);
      if (row) return next();
    } catch (err) {
      return next(err);
    }
    return res.status(403).json({ message: "Forbidden" });
  };
};

// Anyone signed in: am I a mentor / do I have one? Drives the sidebar.
router.get("/me", getMyMentorshipRole);

// Instructor (mentor) routes
router.get("/students", mentorOr(Permissions.TEACHER_DASHBOARD), getAssignedStudents);
router.get("/students/:studentId/history", mentorOr(Permissions.TEACHER_DASHBOARD), getStudentMentorshipHistory);
router.get("/students/:studentId/intelligence", mentorOr(Permissions.TEACHER_DASHBOARD), getMenteeIntelligence);
router.post(
  "/students/:studentId/ai-insights",
  mentorOr(Permissions.TEACHER_DASHBOARD),
  generateMenteeAIInsights,
);
router.get("/follow-ups", mentorOr(Permissions.TEACHER_DASHBOARD), getPendingFollowUps);
router.post("/sessions", mentorOr(Permissions.SUBMIT_REPORTING), submitMentorshipSession);
router.get("/sessions/:sessionId", mentorOr(Permissions.SUBMIT_REPORTING), getMentorshipSessionById);
router.put("/sessions/:sessionId", mentorOr(Permissions.SUBMIT_REPORTING), updateMentorshipSession);
router.patch("/sessions/:sessionId/status", mentorOr(Permissions.SUBMIT_REPORTING), updateSessionStatus);
router.get(
  "/reports/consolidated",
  mentorOr([
    Permissions.TEACHER_DASHBOARD,
    Permissions.MANAGE_REPORTS,
    Permissions.ALL_SUBMITTED_REPORTS,
    Permissions.VIEW_REPORTS,
  ]),
  getConsolidatedReport,
);
router.get(
  "/reports/my-sessions",
  mentorOr(Permissions.TEACHER_DASHBOARD),
  getMySessionsReport,
);

// Mentor's check-in inbox (mentee-submitted messages) — specific paths
// ("inbox") must be registered before the "/:id" wildcard route below.
router.get("/checkins/inbox", mentorOr(Permissions.TEACHER_DASHBOARD), getCheckInInbox);

// Student (mentee) routes — "/mine" must also precede "/:id"
router.post("/checkins", authorize(Permissions.SUBMIT_MENTEE_CHECKIN), submitCheckIn);
router.get("/checkins/mine", authorize(Permissions.SUBMIT_MENTEE_CHECKIN), getMyCheckIns);
router.get("/my-mentor", authorize(Permissions.SUBMIT_MENTEE_CHECKIN), getMyMentor);

router.get("/checkins/:id", mentorOr(Permissions.TEACHER_DASHBOARD), getCheckInDetail);
router.patch("/checkins/:id", mentorOr(Permissions.TEACHER_DASHBOARD), updateCheckIn);

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
router.get("/admin/candidates", authorize(Permissions.MANAGE_MENTOR_ASSIGNMENTS), searchCandidates);
router.get(
  "/admin/unassigned-students",
  authorize(Permissions.MANAGE_MENTOR_ASSIGNMENTS),
  getUnassignedStudents,
);
router.post("/assignments", authorize(Permissions.MANAGE_MENTOR_ASSIGNMENTS), createAssignment);
router.post("/assignments/bulk", authorize(Permissions.MANAGE_MENTOR_ASSIGNMENTS), bulkAssign);
router.delete("/assignments/:id", authorize(Permissions.MANAGE_MENTOR_ASSIGNMENTS), endAssignment);

export default router;
