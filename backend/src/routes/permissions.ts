import express from "express";
import {
  getRoles,
  getRole,
  createRole,
  updateRole,
  disableRole,
  enableRole,
  getPermissions,
  getPermission,
  createPermission,
  updatePermission,
  disablePermission,
  enablePermission,
  assignPermissionsToRole,
  getRolePermissions,
  getUserRoles,
  assignRoleToUser,
  removeRoleFromUser,
} from "../controllers/permissionController";
import { authenticate, authorize } from "../middleware/auth";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Role routes
router.get("/roles", authorize("MANAGE_ROLES"), getRoles);
router.get("/roles/:id", authorize("MANAGE_ROLES"), getRole);
router.post("/roles", authorize("MANAGE_ROLES"), createRole);
router.put("/roles/:id", authorize("MANAGE_ROLES"), updateRole);
router.put("/roles/:id/disable", authorize("MANAGE_ROLES"), disableRole);
router.put("/roles/:id/enable", authorize("MANAGE_ROLES"), enableRole);

// Permission routes
router.get("/permissions", authorize("MANAGE_PERMISSIONS"), getPermissions);
router.get("/permissions/:id", authorize("MANAGE_PERMISSIONS"), getPermission);
router.post("/permissions", authorize("MANAGE_PERMISSIONS"), createPermission);
router.put(
  "/permissions/:id",
  authorize("MANAGE_PERMISSIONS"),
  updatePermission
);
router.put(
  "/permissions/:id/disable",
  authorize("MANAGE_PERMISSIONS"),
  disablePermission
);
router.put(
  "/permissions/:id/enable",
  authorize("MANAGE_PERMISSIONS"),
  enablePermission
);

// Role-Permission assignment
router.get(
  "/roles/:roleId/permissions",
  authorize("MANAGE_ROLES"),
  getRolePermissions
);
router.post(
  "/roles/:roleId/permissions",
  authorize("MANAGE_ROLES"),
  assignPermissionsToRole
);

// User-Role assignment
router.get("/users/:userId/roles", authorize("MANAGE_USERS"), getUserRoles);
router.post(
  "/users/:userId/roles",
  authorize("MANAGE_USERS"),
  assignRoleToUser
);
router.delete(
  "/users/:userId/roles/:roleId",
  authorize("MANAGE_USERS"),
  removeRoleFromUser
);

export default router;
