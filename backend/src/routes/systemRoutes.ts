import { Router } from "express";
import {
  createSystem,
  getAllSystems,
  getSystemById,
  updateSystem,
  assignSystemToSchool,
  removeSystemFromSchool,
  assignSystemToRoleInSchool,
  getSchoolSystems,
  deleteSystem,
  getSchoolRoleAssignments,
  removeSystemFromRoleInSchool,
  getLogsHistory,
} from "../controllers/systemController";
import { authenticate, authorize } from "../middleware/auth";
import { Permissions } from "../utils/permissions";

const router = Router();

// Logs History - View all system activity logs
router.get(
  "/logs",
  authenticate,
  authorize([Permissions.VIEW_ALL_LOGS_HISTORY]),
  getLogsHistory,
);

// System Management
router.post(
  "/",
  authenticate,
  authorize([Permissions.MANAGE_SYSTEMS]),
  createSystem,
);
router.get(
  "/",
  authenticate,
  authorize([Permissions.MANAGE_SYSTEMS, Permissions.ASSIGN_SCHOOL_SYSTEMS]),
  getAllSystems,
);
router.get(
  "/:id",
  authenticate,
  authorize([Permissions.MANAGE_SYSTEMS]),
  getSystemById,
);
router.put(
  "/:id",
  authenticate,
  authorize([Permissions.MANAGE_SYSTEMS]),
  updateSystem,
);
router.delete(
  "/:id",
  authenticate,
  authorize([Permissions.MANAGE_SYSTEMS]),
  deleteSystem,
);

// Assignments
router.post(
  "/assign/school",
  authenticate,
  authorize([Permissions.ASSIGN_SCHOOL_SYSTEMS]),
  assignSystemToSchool,
);
router.post(
  "/remove/school",
  authenticate,
  authorize([Permissions.ASSIGN_SCHOOL_SYSTEMS]),
  removeSystemFromSchool,
);
router.post(
  "/assign/role",
  authenticate,
  authorize([Permissions.ASSIGN_SCHOOL_SYSTEMS]),
  assignSystemToRoleInSchool,
);

// Get systems assigned to a specific school
router.get(
  "/school/:schoolId",
  authenticate,
  authorize([Permissions.MANAGE_SCHOOLS, Permissions.MANAGE_SYSTEMS]),
  getSchoolSystems,
);

router.get(
  "/school/:schoolId/roles",
  authenticate,
  authorize([Permissions.MANAGE_SCHOOLS, Permissions.MANAGE_SYSTEMS]),
  getSchoolRoleAssignments,
);

router.post(
  "/remove/role",
  authenticate,
  authorize([Permissions.ASSIGN_SCHOOL_SYSTEMS]),
  removeSystemFromRoleInSchool,
);

export default router;
