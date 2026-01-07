import { db } from "../db";
import { eq, sql, and } from "drizzle-orm";
import {
  User,
  UserProfile,
  Role,
  Permission,
  UserRole,
  RolePermission,
} from "../db/schema";
import { sanitizeString, validateEmail } from "../utils/sanitization";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../errors/CustomError";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import logger from "../utils/logger";

// Helper function to convert date to MySQL DATE format
const formatDateForMySQL = (dateStr: string | undefined) => {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split("T")[0];
  } catch {
    return null;
  }
};

// Helper function to validate gender
const validateGender = (
  gender: string | undefined
): "MALE" | "FEMALE" | "OTHER" | null => {
  if (!gender) return null;
  const normalized = gender.toUpperCase().trim();
  if (["MALE", "FEMALE", "OTHER"].includes(normalized)) {
    return normalized as "MALE" | "FEMALE" | "OTHER";
  }
  return null;
};

export const updateCurrentUserProfile = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user?.userId;

    if (!userId) {
      throw new ValidationError("User not authenticated");
    }

    const {
      first_name,
      last_name,
      gender,
      date_of_birth,
      address,
      external_id,
    } = req.body;

    logger.info("Updating current user profile", { userId });

    // Validate gender
    const validatedGender = validateGender(gender);
    if (gender !== undefined && validatedGender === null) {
      throw new ValidationError("Gender must be MALE, FEMALE, or OTHER");
    }

    // Format date for MySQL
    const formattedDateOfBirth = formatDateForMySQL(date_of_birth);

    // Check if profile exists
    const existingProfile = await db
      .select()
      .from(UserProfile)
      .where(eq(UserProfile.user_id, userId))
      .limit(1);

    if (existingProfile.length === 0) {
      // Create new profile
      await db.insert(UserProfile).values({
        user_id: userId,
        first_name: first_name ? sanitizeString(first_name) : null,
        last_name: last_name ? sanitizeString(last_name) : null,
        gender: validatedGender,
        date_of_birth: formattedDateOfBirth
          ? sql`${formattedDateOfBirth}`
          : null,
        address: address ? sanitizeString(address) : null,
        external_id: external_id ? sanitizeString(external_id) : null,
      });
    } else {
      // Update existing profile
      const updateData: any = {};
      if (
        first_name !== undefined &&
        first_name !== null &&
        first_name.trim() !== ""
      )
        updateData.first_name = sanitizeString(first_name);
      if (
        last_name !== undefined &&
        last_name !== null &&
        last_name.trim() !== ""
      )
        updateData.last_name = sanitizeString(last_name);
      if (validatedGender !== null) updateData.gender = validatedGender;
      if (formattedDateOfBirth !== null)
        updateData.date_of_birth = sql`${formattedDateOfBirth}`;
      if (address !== undefined && address !== null && address.trim() !== "")
        updateData.address = sanitizeString(address);
      if (
        external_id !== undefined &&
        external_id !== null &&
        external_id.trim() !== ""
      )
        updateData.external_id = sanitizeString(external_id);

      await db
        .update(UserProfile)
        .set(updateData)
        .where(eq(UserProfile.user_id, userId));
    }

    // Fetch updated profile
    const updatedProfile = await db
      .select()
      .from(UserProfile)
      .where(eq(UserProfile.user_id, userId))
      .limit(1);

    successResponse(
      res,
      "Profile updated successfully",
      updatedProfile[0] || null
    );
  }
);

export const updateUserProfile = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const userId = parseInt(id);

  if (isNaN(userId)) {
    throw new ValidationError("Invalid user ID");
  }

  const { first_name, last_name, gender, date_of_birth, address, external_id } =
    req.body;

  logger.info("Updating user profile", {
    userId,
    requestedBy: req.user?.userId,
  });

  // Validate gender
  const validatedGender = validateGender(gender);
  if (gender !== undefined && validatedGender === null) {
    throw new ValidationError("Gender must be MALE, FEMALE, or OTHER");
  }

  // Format date for MySQL
  const formattedDateOfBirth = formatDateForMySQL(date_of_birth);

  // Check if profile exists
  const existingProfile = await db
    .select()
    .from(UserProfile)
    .where(eq(UserProfile.user_id, userId))
    .limit(1);

  if (existingProfile.length === 0) {
    // Create new profile
    await db.insert(UserProfile).values({
      user_id: userId,
      first_name: first_name ? sanitizeString(first_name) : null,
      last_name: last_name ? sanitizeString(last_name) : null,
      gender: validatedGender,
      date_of_birth: formattedDateOfBirth ? sql`${formattedDateOfBirth}` : null,
      address: address ? sanitizeString(address) : null,
      external_id: external_id ? sanitizeString(external_id) : null,
    });
  } else {
    // Update existing profile
    const updateData: any = {};
    if (
      first_name !== undefined &&
      first_name !== null &&
      first_name.trim() !== ""
    )
      updateData.first_name = sanitizeString(first_name);
    if (
      last_name !== undefined &&
      last_name !== null &&
      last_name.trim() !== ""
    )
      updateData.last_name = sanitizeString(last_name);
    if (validatedGender !== null) updateData.gender = validatedGender;
    if (formattedDateOfBirth !== null)
      updateData.date_of_birth = sql`${formattedDateOfBirth}`;
    if (address !== undefined && address !== null && address.trim() !== "")
      updateData.address = sanitizeString(address);
    if (
      external_id !== undefined &&
      external_id !== null &&
      external_id.trim() !== ""
    )
      updateData.external_id = sanitizeString(external_id);

    await db
      .update(UserProfile)
      .set(updateData)
      .where(eq(UserProfile.user_id, userId));
  }

  // Fetch updated profile
  const updatedProfile = await db
    .select()
    .from(UserProfile)
    .where(eq(UserProfile.user_id, userId))
    .limit(1);

  successResponse(
    res,
    "Profile updated successfully",
    updatedProfile[0] || null
  );
});

export const getCurrentUser = asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new ValidationError("User not authenticated");
  }

  logger.info("Fetching current user", { userId });

  const user = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

  if (user.length === 0) {
    throw new NotFoundError("User not found");
  }

  const profile = await db
    .select()
    .from(UserProfile)
    .where(eq(UserProfile.user_id, userId))
    .limit(1);

  // Get user roles
  const userRoles = await db
    .select({
      role_id: Role.role_id,
      name: Role.name,
      description: Role.description,
      status: Role.status,
    })
    .from(UserRole)
    .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
    .where(eq(UserRole.user_id, userId));

  // Check if user is SUPER_ADMIN
  const isSuperAdmin = userRoles.some((r) => r.name === "SUPER_ADMIN");

  // Get permissions for each role
  const rolesWithPermissions = await Promise.all(
    userRoles.map(async (role) => {
      const permissions = await db
        .select({
          perm_id: Permission.perm_id,
          name: Permission.name,
          description: Permission.description,
          status: Permission.status,
        })
        .from(RolePermission)
        .innerJoin(
          Permission,
          and(
            eq(RolePermission.perm_id, Permission.perm_id),
            eq(Permission.status, "ACTIVE")
          )
        )
        .where(eq(RolePermission.role_id, role.role_id));

      return { ...role, permissions };
    })
  );

  // Get flat list of permission names
  let permissions: string[];

  if (isSuperAdmin) {
    // SUPER_ADMIN gets all permissions
    permissions = [
      "MANAGE_USERS",
      "MANAGE_ROLES",
      "MANAGE_PERMISSIONS",
      "MANAGE_ACADEMICS",
      "MANAGE_CLASSES",
      "MANAGE_STUDENTS",
      "MANAGE_TEACHERS",
      "MANAGE_PARENTS",
      "MANAGE_FEES",
      "VIEW_FINANCE",
      "MARK_ATTENDANCE",
      "VIEW_ATTENDANCE",
      "ENTER_MARKS",
      "VIEW_RESULTS",
      "SEND_ANNOUNCEMENTS",
      "UPLOAD_DOCUMENTS",
      "VIEW_REPORTS",
      "GENERATE_REPORTS",
      "MANAGE_SETTINGS",
      "ADMIN",
    ];
  } else {
    permissions = rolesWithPermissions.flatMap((r) =>
      r.permissions.map((p: any) => p.name)
    );
  }

  successResponse(res, "User profile retrieved successfully", {
    user: user[0],
    profile: profile[0] || null,
    roles: rolesWithPermissions,
    permissions,
  });
});

export const getUsers = asyncHandler(async (req: any, res: any) => {
  logger.info("Fetching all users", { userId: req.user?.userId });

  const users = await db.select().from(User);

  // Get users with their roles
  const usersWithRoles = await Promise.all(
    users.map(async (user) => {
      const userRoles = await db
        .select({
          role_id: Role.role_id,
          name: Role.name,
          description: Role.description,
          status: Role.status,
        })
        .from(UserRole)
        .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
        .where(eq(UserRole.user_id, user.user_id));

      // Get permissions for each role
      const rolesWithPermissions = await Promise.all(
        userRoles.map(async (role) => {
          const permissions = await db
            .select({
              perm_id: Permission.perm_id,
              name: Permission.name,
              description: Permission.description,
              status: Permission.status,
            })
            .from(RolePermission)
            .innerJoin(
              Permission,
              and(
                eq(RolePermission.perm_id, Permission.perm_id),
                eq(Permission.status, "ACTIVE")
              )
            )
            .where(eq(RolePermission.role_id, role.role_id));

          return { ...role, permissions };
        })
      );

      // Get profile
      const profile = await db
        .select()
        .from(UserProfile)
        .where(eq(UserProfile.user_id, user.user_id))
        .limit(1);

      return {
        user,
        profile: profile[0] || null,
        roles: rolesWithPermissions,
        permissions: rolesWithPermissions.flatMap((r) =>
          r.permissions.map((p) => p.name)
        ),
      };
    })
  );

  successResponse(res, "Users retrieved successfully", usersWithRoles);
});

export const getUser = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const userId = parseInt(id);

  if (isNaN(userId)) {
    throw new ValidationError("Invalid user ID");
  }

  logger.info("Fetching user", { userId, requestedBy: req.user?.userId });

  const user = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

  if (user.length === 0) {
    throw new NotFoundError("User not found");
  }

  // Get user roles
  const userRoles = await db
    .select({
      role_id: Role.role_id,
      name: Role.name,
      description: Role.description,
      status: Role.status,
    })
    .from(UserRole)
    .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
    .where(eq(UserRole.user_id, userId));

  // Get permissions for each role
  const rolesWithPermissions = await Promise.all(
    userRoles.map(async (role) => {
      const permissions = await db
        .select({
          perm_id: Permission.perm_id,
          name: Permission.name,
          description: Permission.description,
          status: Permission.status,
        })
        .from(RolePermission)
        .innerJoin(
          Permission,
          and(
            eq(RolePermission.perm_id, Permission.perm_id),
            eq(Permission.status, "ACTIVE")
          )
        )
        .where(eq(RolePermission.role_id, role.role_id));

      return { ...role, permissions };
    })
  );

  const profile = await db
    .select()
    .from(UserProfile)
    .where(eq(UserProfile.user_id, userId))
    .limit(1);

  successResponse(res, "User retrieved successfully", {
    user: user[0],
    profile: profile[0] || null,
    roles: rolesWithPermissions,
    permissions: rolesWithPermissions.flatMap((r) =>
      r.permissions.map((p: any) => p.name)
    ),
  });
});

export const createUser = asyncHandler(async (req: any, res: any) => {
  const { username, email, phone_number, status } = req.body;

  // Sanitize inputs
  const sanitizedUsername = sanitizeString(username);
  const sanitizedEmail = sanitizeString(email);
  const sanitizedPhone = phone_number
    ? sanitizeString(phone_number)
    : undefined;

  // Validate inputs
  if (!sanitizedUsername || !sanitizedEmail) {
    throw new ValidationError("Username and email are required");
  }

  if (!validateEmail(sanitizedEmail)) {
    throw new ValidationError("Invalid email format");
  }

  // Check if username or email already exists
  const existingUser = await db
    .select()
    .from(User)
    .where(eq(User.username, sanitizedUsername))
    .limit(1);

  if (existingUser.length > 0) {
    throw new ConflictError("Username already exists");
  }

  const existingEmail = await db
    .select()
    .from(User)
    .where(eq(User.email, sanitizedEmail))
    .limit(1);

  if (existingEmail.length > 0) {
    throw new ConflictError("Email already exists");
  }

  logger.info("Creating new user", {
    username: sanitizedUsername,
    email: sanitizedEmail,
    createdBy: req.user?.userId,
  });

  await db.insert(User).values({
    username: sanitizedUsername,
    email: sanitizedEmail,
    phone_number: sanitizedPhone,
    status: status || "ACTIVE",
  });

  successResponse(res, "User created successfully", null, 201);
});

export const updateUser = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const userId = parseInt(id);
  const { username, email, phone_number, status } = req.body;

  if (isNaN(userId)) {
    throw new ValidationError("Invalid user ID");
  }

  // Sanitize inputs
  const sanitizedUsername = username ? sanitizeString(username) : undefined;
  const sanitizedEmail = email ? sanitizeString(email) : undefined;
  const sanitizedPhone = phone_number
    ? sanitizeString(phone_number)
    : undefined;

  // Validate email if provided
  if (sanitizedEmail && !validateEmail(sanitizedEmail)) {
    throw new ValidationError("Invalid email format");
  }

  // Check if user exists
  const existingUser = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

  if (existingUser.length === 0) {
    throw new NotFoundError("User not found");
  }

  // Check for conflicts if username or email is being changed
  if (sanitizedUsername && sanitizedUsername !== existingUser[0].username) {
    const usernameConflict = await db
      .select()
      .from(User)
      .where(eq(User.username, sanitizedUsername))
      .limit(1);

    if (usernameConflict.length > 0) {
      throw new ConflictError("Username already exists");
    }
  }

  if (sanitizedEmail && sanitizedEmail !== existingUser[0].email) {
    const emailConflict = await db
      .select()
      .from(User)
      .where(eq(User.email, sanitizedEmail))
      .limit(1);

    if (emailConflict.length > 0) {
      throw new ConflictError("Email already exists");
    }
  }

  const updateData: any = {};
  if (sanitizedUsername) updateData.username = sanitizedUsername;
  if (sanitizedEmail) updateData.email = sanitizedEmail;
  if (sanitizedPhone !== undefined) updateData.phone_number = sanitizedPhone;
  if (status) updateData.status = status;

  logger.info("Updating user", {
    userId,
    updates: Object.keys(updateData),
    updatedBy: req.user?.userId,
  });

  await db.update(User).set(updateData).where(eq(User.user_id, userId));

  successResponse(res, "User updated successfully");
});

export const deleteUser = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const userId = parseInt(id);

  if (isNaN(userId)) {
    throw new ValidationError("Invalid user ID");
  }

  // Check if user exists
  const existingUser = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

  if (existingUser.length === 0) {
    throw new NotFoundError("User not found");
  }

  // Prevent deleting own account
  if (req.user?.userId === userId) {
    throw new ValidationError("Cannot delete your own account");
  }

  logger.info("Deleting user", {
    userId,
    deletedBy: req.user?.userId,
  });

  await db.delete(User).where(eq(User.user_id, userId));

  successResponse(res, "User deleted successfully");
});
