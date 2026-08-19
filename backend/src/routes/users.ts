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
import { getUserActivities } from "../controllers/activityController";
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
router.get("/", authenticate, authorize("MANAGE_USERS"), getUsers);
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

router.get("/:id", authenticate, getUser);
router.get("/:id/programs", authenticate, getUserPrograms);
router.get("/:userId/activities", authenticate, getUserActivities);
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
