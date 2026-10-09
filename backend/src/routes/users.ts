import express from "express";
import multer from "multer";
import {
  getCurrentUser,
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  updateCurrentUserProfile,
  updateUserProfile,
  bulkCreateUsers,
  generateStudentRegistrationNumbers,
  downloadTemplate,
  searchUsers,
  assignRoleToUser,
  removeRoleFromUser,
  getUserRoles,
  enableUser,
  disableUser,
  getProgramRoles,
  getProgramUsersByRole,
  getProgramUsers,
  getUserPrograms,
  assignGradeToUser,
  removeGradeFromUser,
  getUserGrades,
  getAllGradeAssignments,
  updateGradeAssignment,
  copyGradeAssignments,
  getUsersByGrade,
  getSubjectsByGrade,
  updateThemePreference,
} from "../controllers/userController";
import {
  getUserStats,
  getScopedSubjects,
  getScopedSubjectDetail,
  getScopedUsers,
  getScopedUserDetail,
} from "../controllers/userScopeController";
import { getUserActivities } from "../controllers/activityController";
import {
  avatarUpload,
  getMyAvatar,
  uploadMyAvatar,
  deleteMyAvatar,
  uploadUserAvatar,
  deleteUserAvatar,
  coverUpload,
  uploadMyCover,
  deleteMyCover,
  lookupProfileMedia,
} from "../controllers/avatarController";
import { requireServiceToken } from "../middleware/serviceAuth";
import { authenticate, authorize } from "../middleware/auth";

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files are allowed"));
    }
  },
});

router.get("/me", authenticate, getCurrentUser);
router.put("/me/profile", authenticate, updateCurrentUserProfile);
router.patch("/me/theme", authenticate, updateThemePreference);
// Central profile picture, shown by every NGA app (services/avatar/).
router.get("/me/avatar", authenticate, getMyAvatar);
router.put("/me/avatar", authenticate, avatarUpload, uploadMyAvatar);
router.delete("/me/avatar", authenticate, deleteMyAvatar);
router.put("/me/cover", authenticate, coverUpload, uploadMyCover);
router.delete("/me/cover", authenticate, deleteMyCover);
// Sibling apps (client credentials): everyone's current picture + cover in one call.
router.post("/profile-media/lookup", requireServiceToken("profiles:read"), lookupProfileMedia);
router.get("/", authenticate, authorize("MANAGE_USERS"), getUsers);

// Role/status counts for the management chips and dashboard. Two aggregate
// queries in place of the `3 + 2 * roles` per-role HEAD-style requests the
// client used to fire at "/" just to read X-Total-Count off each one.
router.get("/stats", authenticate, authorize("VIEW_USERS"), getUserStats);

// Grade-scoped reads for class teachers and program leads. Registered before
// the bare "/:id" route so "scope" is not matched as an :id.
router.get(
  "/scope/subjects",
  authenticate,
  authorize("VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE"),
  getScopedSubjects,
);
router.get(
  "/scope/subjects/:id",
  authenticate,
  authorize("VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE"),
  getScopedSubjectDetail,
);
router.get(
  "/scope/users",
  authenticate,
  authorize("VIEW_USERS_BY_CLASS_TEACHER_GRADE"),
  getScopedUsers,
);
router.get(
  "/scope/users/:id",
  authenticate,
  authorize("VIEW_USERS_BY_CLASS_TEACHER_GRADE"),
  getScopedUserDetail,
);
router.get(
  "/template",
  authenticate,
  authorize("MANAGE_USERS"),
  downloadTemplate,
);
// Search users (for document sharing) - available to all authenticated users
router.get("/search", authenticate, searchUsers);

// Grade assignment for class teachers -- must be registered before the
// bare "/:id" route below, otherwise Express matches "/grade-assignments"
// as :id="grade-assignments" and calls getUser instead.
router.get("/grade-assignments", authenticate, getAllGradeAssignments);
router.post(
  "/grade-assignments/copy",
  authenticate,
  authorize("ASSIGN_GRADE_TO_CLASS_TEACHER"),
  copyGradeAssignments,
);

// Registered before the bare "/:id" route below, otherwise Express matches
// "/students" as :id="students" and calls getUser instead.
router.post(
  "/students/generate-registration-numbers",
  authenticate,
  authorize("MANAGE_USERS"),
  generateStudentRegistrationNumbers,
);

router.get("/:id", authenticate, getUser);
router.get("/:id/programs", authenticate, getUserPrograms);
// Someone's activity feed: their own, or staff who manage users / read the logs (plan G5).
router.get(
  "/:userId/activities",
  authenticate,
  (req: any, res: any, next: any) => {
    const own = Number(req.params.userId) === Number(req.user.userId);
    const perms: string[] = req.user.permissions ?? [];
    if (own || perms.includes("MANAGE_USERS") || perms.includes("VIEW_ALL_LOGS_HISTORY")) return next();
    return res.status(403).json({ message: "Forbidden" });
  },
  getUserActivities,
);
router.put(
  "/:id/profile",
  authenticate,
  authorize("UPDATE_USER_PROFILE_INFO"),
  updateUserProfile,
);
router.post("/", authenticate, authorize("MANAGE_USERS"), createUser);
router.post(
  "/bulk",
  authenticate,
  authorize("MANAGE_USERS"),
  upload.single("file"),
  bulkCreateUsers,
);
router.put("/:id", authenticate, authorize("MANAGE_USERS"), updateUser);
router.put("/:id/avatar", authenticate, authorize("MANAGE_USERS"), avatarUpload, uploadUserAvatar);
router.delete("/:id/avatar", authenticate, authorize("MANAGE_USERS"), deleteUserAvatar);
router.delete("/:id", authenticate, authorize("MANAGE_USERS"), deleteUser);

// User status management
router.put("/:id/enable", authenticate, authorize("MANAGE_USERS"), enableUser);
router.put(
  "/:id/disable",
  authenticate,
  authorize("MANAGE_USERS"),
  disableUser,
);

// User role management
router.get("/:id/roles", authenticate, authorize("MANAGE_USERS"), getUserRoles);
router.post(
  "/:id/roles",
  authenticate,
  authorize("MANAGE_USERS"),
  assignRoleToUser,
);
router.delete(
  "/:id/roles/:roleId",
  authenticate,
  authorize("MANAGE_USERS"),
  removeRoleFromUser,
);

// Program-based user management
router.get(
  "/programs/:programId/roles",
  authenticate,
  authorize("VIEW_PROGRAM_USERS"),
  getProgramRoles,
);
router.get(
  "/programs/:programId/roles/:roleId/users",
  authenticate,
  authorize("VIEW_PROGRAM_USERS"),
  getProgramUsersByRole,
);
router.get(
  "/programs/:programId/users",
  authenticate,
  authorize("VIEW_PROGRAM_USERS"),
  getProgramUsers,
);

// Grade assignment for class teachers
router.get("/:id/grades", authenticate, getUserGrades);
router.post(
  "/:id/grades",
  authenticate,
  authorize("ASSIGN_GRADE_TO_CLASS_TEACHER"),
  assignGradeToUser,
);
// A class-teacher assignment is keyed by user + grade + class group + year,
// so both editing and removing one address all four.
router.put(
  "/:id/grades/:gradeId/class-groups/:classGroupId/years/:academicYearId",
  authenticate,
  authorize("ASSIGN_GRADE_TO_CLASS_TEACHER"),
  updateGradeAssignment,
);
router.delete(
  "/:id/grades/:gradeId/class-groups/:classGroupId/years/:academicYearId",
  authenticate,
  authorize("ASSIGN_GRADE_TO_CLASS_TEACHER"),
  removeGradeFromUser,
);

// View users and subjects by grade (for class teachers)
router.get(
  "/grades/:gradeId/users",
  authenticate,
  authorize("VIEW_USERS_BY_CLASS_TEACHER_GRADE"),
  getUsersByGrade,
);
router.get(
  "/grades/:gradeId/subjects",
  authenticate,
  authorize("VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE"),
  getSubjectsByGrade,
);

export default router;
