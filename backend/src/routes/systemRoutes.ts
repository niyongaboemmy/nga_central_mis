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
  getLogsSummary,
  exportLogsCsv,
} from "../controllers/systemController";
import {
  listIntegrationTokens,
  createIntegrationToken,
  revokeIntegrationToken,
} from "../controllers/integrationTokenController";
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
router.get("/logs/summary", authenticate, authorize([Permissions.VIEW_ALL_LOGS_HISTORY]), getLogsSummary);
router.get("/logs/export.csv", authenticate, authorize([Permissions.VIEW_ALL_LOGS_HISTORY]), exportLogsCsv);

// Integration tokens — the machine credentials partner systems (Ganzaa) use to
// pull read-only data from /integrations. Managed here rather than under
// /integrations because these are authenticated as a PERSON: everything mounted
// at /integrations is machine-authenticated and read-only, and keeping that true
// of the whole router is worth more than the tidier URL.
//
// Registered before "/:id" below — Express matches in order, so the parametric
// route would otherwise swallow "/integration-tokens" and try to load a system
// with that id.
//
// MANAGE_SYSTEMS is the right permission: an admin who can register an SSO
// client is the same admin who decides which partner may read the school's data.
router.get(
  "/integration-tokens",
  authenticate,
  authorize([Permissions.MANAGE_SYSTEMS]),
  listIntegrationTokens,
);
router.post(
  "/integration-tokens",
  authenticate,
  authorize([Permissions.MANAGE_SYSTEMS]),
  createIntegrationToken,
);
router.delete(
  "/integration-tokens/:id",
  authenticate,
  authorize([Permissions.MANAGE_SYSTEMS]),
  revokeIntegrationToken,
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
