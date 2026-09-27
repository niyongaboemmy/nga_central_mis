import { db } from "../db";
import { eq, and, or, inArray, notInArray, notLike } from "drizzle-orm";
import { Role, Permission, RolePermission, UserRole } from "../db/schema";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../errors/CustomError";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import { recordActivity } from "../utils/activityLogger";
import { sanitizeString } from "../utils/sanitization";
import logger from "../utils/logger";
import { isV2OnlyCapability, V2_ONLY_CAPABILITIES } from "../access/v2Only";

/**
 * This legacy Roles & Permissions screen manages legacy MIS permissions only.
 * Access control v2 capabilities (access/v2Only.ts) share the same tables but
 * are managed in Access Studio, so they are hidden here and never touched by
 * a save from this screen.
 */
const legacyOnly = () =>
  and(
    notLike(Permission.name, "%:%"),
    notInArray(Permission.name, [...V2_ONLY_CAPABILITIES]),
  );

// ==================== Role Management ====================

export const getRoles = asyncHandler(async (req: any, res: any) => {
  const { status } = req.query;

  let roles;
  if (status) {
    roles = await db
      .select()
      .from(Role)
      .where(eq(Role.status, status))
      .orderBy(Role.name);
  } else {
    roles = await db.select().from(Role).orderBy(Role.name);
  }

  successResponse(res, "Roles retrieved successfully", roles);
});

export const getRole = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const roleId = parseInt(id);

  if (isNaN(roleId)) {
    throw new ValidationError("Invalid role ID");
  }

  const role = await db
    .select()
    .from(Role)
    .where(eq(Role.role_id, roleId))
    .limit(1);

  if (role.length === 0) {
    throw new NotFoundError("Role not found");
  }

  // Get permissions for this role
  const permissions = await db
    .select({
      perm_id: Permission.perm_id,
      name: Permission.name,
      description: Permission.description,
    })
    .from(RolePermission)
    .innerJoin(Permission, eq(RolePermission.perm_id, Permission.perm_id))
    .where(and(eq(RolePermission.role_id, roleId), legacyOnly()));

  successResponse(res, "Role retrieved successfully", {
    ...role[0],
    permissions,
  });
});

export const createRole = asyncHandler(async (req: any, res: any) => {
  const { name, description } = req.body;

  if (!name) {
    throw new ValidationError("Role name is required");
  }

  const sanitizedName = sanitizeString(name);

  // Check if role already exists
  const existing = await db
    .select()
    .from(Role)
    .where(eq(Role.name, sanitizedName))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError("Role with this name already exists");
  }

  await db.insert(Role).values({
    name: sanitizedName,
    description: description ? sanitizeString(description) : null,
    status: "ACTIVE",
  });

  logger.info(`New role created: ${sanitizedName}`);

  // Fetch the created role
  const createdRole = await db
    .select()
    .from(Role)
    .where(eq(Role.name, sanitizedName))
    .limit(1);

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "ROLE_CREATE",
      `Role created: ${sanitizedName}`,
      "Role",
      createdRole[0].role_id,
      { name: sanitizedName, description },
      req.user.userId,
    );
  }

  successResponse(res, "Role created successfully", createdRole[0], 201);
});

export const updateRole = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const { name, description, status } = req.body;

  const roleId = parseInt(id);

  if (isNaN(roleId)) {
    throw new ValidationError("Invalid role ID");
  }

  // Check if role exists
  const existing = await db
    .select()
    .from(Role)
    .where(eq(Role.role_id, roleId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError("Role not found");
  }

  const updateData: any = {};

  if (name !== undefined) {
    const sanitizedName = sanitizeString(name);
    // Check for duplicate name (excluding current role)
    const duplicate = await db
      .select()
      .from(Role)
      .where(and(eq(Role.name, sanitizedName), eq(Role.role_id, roleId)))
      .limit(1);

    if (duplicate.length > 0) {
      throw new ConflictError("Role with this name already exists");
    }
    updateData.name = sanitizedName;
  }

  if (description !== undefined) {
    updateData.description = description ? sanitizeString(description) : null;
  }

  if (status !== undefined && ["ACTIVE", "DISABLED"].includes(status)) {
    updateData.status = status;
  }

  await db.update(Role).set(updateData).where(eq(Role.role_id, roleId));

  logger.info(`Role updated: ${existing[0].name}`);

  // Fetch updated role
  const updatedRole = await db
    .select()
    .from(Role)
    .where(eq(Role.role_id, roleId))
    .limit(1);

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "ROLE_UPDATE",
      `Role updated: ${updatedRole[0].name}`,
      "Role",
      roleId,
      { ...req.body },
      req.user.userId,
    );
  }

  successResponse(res, "Role updated successfully", updatedRole[0]);
});

export const disableRole = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const roleId = parseInt(id);

  if (isNaN(roleId)) {
    throw new ValidationError("Invalid role ID");
  }

  // Check if role exists
  const existing = await db
    .select()
    .from(Role)
    .where(eq(Role.role_id, roleId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError("Role not found");
  }

  await db
    .update(Role)
    .set({ status: "DISABLED" })
    .where(eq(Role.role_id, roleId));

  logger.info(`Role disabled: ${existing[0].name}`);

  successResponse(res, "Role disabled successfully");
});

export const enableRole = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const roleId = parseInt(id);

  if (isNaN(roleId)) {
    throw new ValidationError("Invalid role ID");
  }

  // Check if role exists
  const existing = await db
    .select()
    .from(Role)
    .where(eq(Role.role_id, roleId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError("Role not found");
  }

  await db
    .update(Role)
    .set({ status: "ACTIVE" })
    .where(eq(Role.role_id, roleId));

  logger.info(`Role enabled: ${existing[0].name}`);

  successResponse(res, "Role enabled successfully");
});

// ==================== Permission Management ====================

export const getPermissions = asyncHandler(async (req: any, res: any) => {
  const { status } = req.query;

  let permissions;
  if (status) {
    permissions = await db
      .select()
      .from(Permission)
      .where(and(eq(Permission.status, status), legacyOnly()))
      .orderBy(Permission.name);
  } else {
    permissions = await db
      .select()
      .from(Permission)
      .where(legacyOnly())
      .orderBy(Permission.name);
  }

  successResponse(res, "Permissions retrieved successfully", permissions);
});

export const getPermission = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const permId = parseInt(id);

  if (isNaN(permId)) {
    throw new ValidationError("Invalid permission ID");
  }

  const permission = await db
    .select()
    .from(Permission)
    .where(eq(Permission.perm_id, permId))
    .limit(1);

  if (permission.length === 0) {
    throw new NotFoundError("Permission not found");
  }

  // Get roles that have this permission
  const roles = await db
    .select({ role_id: Role.role_id, name: Role.name })
    .from(RolePermission)
    .innerJoin(Role, eq(RolePermission.role_id, Role.role_id))
    .where(eq(RolePermission.perm_id, permId));

  successResponse(res, "Permission retrieved successfully", {
    ...permission[0],
    roles,
  });
});

export const createPermission = asyncHandler(async (req: any, res: any) => {
  const { name, description } = req.body;

  if (!name) {
    throw new ValidationError("Permission name is required");
  }

  const sanitizedName = sanitizeString(name);

  // Check if permission already exists
  const existing = await db
    .select()
    .from(Permission)
    .where(eq(Permission.name, sanitizedName))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError("Permission with this name already exists");
  }

  await db.insert(Permission).values({
    name: sanitizedName,
    description: description ? sanitizeString(description) : null,
    status: "ACTIVE",
  });

  logger.info(`New permission created: ${sanitizedName}`);

  // Fetch the created permission
  const createdPermission = await db
    .select()
    .from(Permission)
    .where(eq(Permission.name, sanitizedName))
    .limit(1);

  successResponse(
    res,
    "Permission created successfully",
    createdPermission[0],
    201,
  );
});

export const updatePermission = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const { name, description, status } = req.body;

  const permId = parseInt(id);

  if (isNaN(permId)) {
    throw new ValidationError("Invalid permission ID");
  }

  // Check if permission exists
  const existing = await db
    .select()
    .from(Permission)
    .where(eq(Permission.perm_id, permId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError("Permission not found");
  }

  const updateData: any = {};

  if (name !== undefined) {
    const sanitizedName = sanitizeString(name);
    // Check for duplicate name (excluding current permission)
    const duplicate = await db
      .select()
      .from(Permission)
      .where(
        and(eq(Permission.name, sanitizedName), eq(Permission.perm_id, permId)),
      )
      .limit(1);

    if (duplicate.length > 0) {
      throw new ConflictError("Permission with this name already exists");
    }
    updateData.name = sanitizedName;
  }

  if (description !== undefined) {
    updateData.description = description ? sanitizeString(description) : null;
  }

  if (status !== undefined && ["ACTIVE", "DISABLED"].includes(status)) {
    updateData.status = status;
  }

  await db
    .update(Permission)
    .set(updateData)
    .where(eq(Permission.perm_id, permId));

  logger.info(`Permission updated: ${existing[0].name}`);

  // Fetch updated permission
  const updatedPermission = await db
    .select()
    .from(Permission)
    .where(eq(Permission.perm_id, permId))
    .limit(1);

  successResponse(res, "Permission updated successfully", updatedPermission[0]);
});

export const disablePermission = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const permId = parseInt(id);

  if (isNaN(permId)) {
    throw new ValidationError("Invalid permission ID");
  }

  // Check if permission exists
  const existing = await db
    .select()
    .from(Permission)
    .where(eq(Permission.perm_id, permId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError("Permission not found");
  }

  await db
    .update(Permission)
    .set({ status: "DISABLED" })
    .where(eq(Permission.perm_id, permId));

  logger.info(`Permission disabled: ${existing[0].name}`);

  successResponse(res, "Permission disabled successfully");
});

export const enablePermission = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const permId = parseInt(id);

  if (isNaN(permId)) {
    throw new ValidationError("Invalid permission ID");
  }

  // Check if permission exists
  const existing = await db
    .select()
    .from(Permission)
    .where(eq(Permission.perm_id, permId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError("Permission not found");
  }

  await db
    .update(Permission)
    .set({ status: "ACTIVE" })
    .where(eq(Permission.perm_id, permId));

  logger.info(`Permission enabled: ${existing[0].name}`);

  successResponse(res, "Permission enabled successfully");
});

// ==================== Role-Permission Assignment ====================

export const assignPermissionsToRole = asyncHandler(
  async (req: any, res: any) => {
    const { roleId } = req.params;
    const { permissionIds } = req.body;

    if (!permissionIds || !Array.isArray(permissionIds)) {
      throw new ValidationError("Permission IDs are required");
    }

    const role_id = parseInt(roleId);

    if (isNaN(role_id)) {
      throw new ValidationError("Invalid role ID");
    }

    // Check if role exists
    const role = await db
      .select()
      .from(Role)
      .where(eq(Role.role_id, role_id))
      .limit(1);

    if (role.length === 0) {
      throw new NotFoundError("Role not found");
    }

    // Apply the submitted legacy set as a diff: only legacy links that were
    // removed are deleted and only new ones inserted. Links that stay keep
    // their row (and any read depth set in Access Studio), and access control
    // v2 capabilities on the role are never touched from this screen.
    const requested = Array.from(
      new Set(
        permissionIds
          .map((id: any) => parseInt(id))
          .filter((id: number) => Number.isInteger(id) && id > 0),
      ),
    ) as number[];
    const requestedRows = requested.length
      ? await db
          .select({ perm_id: Permission.perm_id, name: Permission.name })
          .from(Permission)
          .where(inArray(Permission.perm_id, requested))
      : [];
    const wanted = new Set(
      requestedRows.filter((p) => !isV2OnlyCapability(p.name)).map((p) => p.perm_id),
    );
    const current = await db
      .select({ perm_id: RolePermission.perm_id })
      .from(RolePermission)
      .innerJoin(Permission, eq(RolePermission.perm_id, Permission.perm_id))
      .where(and(eq(RolePermission.role_id, role_id), legacyOnly()));
    const have = new Set(current.map((c) => c.perm_id));

    const toRemove = [...have].filter((id) => !wanted.has(id));
    if (toRemove.length > 0) {
      await db
        .delete(RolePermission)
        .where(
          and(
            eq(RolePermission.role_id, role_id),
            inArray(RolePermission.perm_id, toRemove),
          ),
        );
    }
    for (const permId of wanted) {
      if (!have.has(permId)) {
        await db.insert(RolePermission).values({ role_id, perm_id: permId });
      }
    }

    logger.info(`Permissions assigned to role: ${role[0].name}`);

    // Record activity
    if (req.user?.userId) {
      await recordActivity(
        req.user.userId,
        "ROLE_PERMISSIONS_ASSIGN",
        `Permissions assigned to role: ${role[0].name}`,
        "Role",
        parseInt(roleId),
        { permissionIds },
        req.user.userId,
      );
    }

    successResponse(res, "Permissions assigned successfully");
  },
);

export const getRolePermissions = asyncHandler(async (req: any, res: any) => {
  const { roleId } = req.params;
  const role_id = parseInt(roleId);

  if (isNaN(role_id)) {
    throw new ValidationError("Invalid role ID");
  }

  // Check if role exists
  const role = await db
    .select()
    .from(Role)
    .where(eq(Role.role_id, role_id))
    .limit(1);

  if (role.length === 0) {
    throw new NotFoundError("Role not found");
  }

  const permissions = await db
    .select({
      perm_id: Permission.perm_id,
      name: Permission.name,
      description: Permission.description,
    })
    .from(RolePermission)
    .innerJoin(Permission, eq(RolePermission.perm_id, Permission.perm_id))
    .where(and(eq(RolePermission.role_id, role_id), legacyOnly()));

  successResponse(res, "Role permissions retrieved successfully", permissions);
});

// ==================== User-Role Assignment ====================

export const getUserRoles = asyncHandler(async (req: any, res: any) => {
  const { userId } = req.params;
  const user_id = parseInt(userId);

  if (isNaN(user_id)) {
    throw new ValidationError("Invalid user ID");
  }

  const roles = await db
    .select({
      role_id: Role.role_id,
      name: Role.name,
      description: Role.description,
      status: Role.status,
    })
    .from(UserRole)
    .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
    .where(eq(UserRole.user_id, user_id));

  successResponse(res, "User roles retrieved successfully", roles);
});

export const assignRoleToUser = asyncHandler(async (req: any, res: any) => {
  const { userId } = req.params;
  const { roleId } = req.body;

  const user_id = parseInt(userId);
  const role_id = parseInt(roleId);

  if (isNaN(user_id) || isNaN(role_id)) {
    throw new ValidationError("Invalid user ID or role ID");
  }

  // Check if role exists
  const role = await db
    .select()
    .from(Role)
    .where(eq(Role.role_id, role_id))
    .limit(1);

  if (role.length === 0) {
    throw new NotFoundError("Role not found");
  }

  // Check if assignment already exists
  const existing = await db
    .select()
    .from(UserRole)
    .where(and(eq(UserRole.user_id, user_id), eq(UserRole.role_id, role_id)))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError("User already has this role");
  }

  await db.insert(UserRole).values({ user_id, role_id });

  logger.info(`Role ${role[0].name} assigned to user ${user_id}`);

  successResponse(res, "Role assigned to user successfully", null, 201);
});

export const removeRoleFromUser = asyncHandler(async (req: any, res: any) => {
  const { userId, roleId } = req.params;

  await db
    .delete(UserRole)
    .where(
      and(
        eq(UserRole.user_id, parseInt(userId)),
        eq(UserRole.role_id, parseInt(roleId)),
      ),
    );

  successResponse(res, "Role removed from user successfully");
});
