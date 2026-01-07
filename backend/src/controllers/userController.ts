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
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

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
  const {
    username,
    email,
    phone_number,
    status,
    roles,
    first_name,
    last_name,
    gender,
    date_of_birth,
    address,
  } = req.body;

  // Sanitize inputs
  const sanitizedUsername = sanitizeString(username);
  const sanitizedEmail = sanitizeString(email);
  const sanitizedPhone = phone_number
    ? sanitizeString(phone_number)
    : undefined;
  const sanitizedFirstName = first_name
    ? sanitizeString(first_name)
    : undefined;
  const sanitizedLastName = last_name ? sanitizeString(last_name) : undefined;
  const sanitizedAddress = address ? sanitizeString(address) : undefined;

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

  // Insert user
  await db.insert(User).values({
    username: sanitizedUsername,
    email: sanitizedEmail,
    phone_number: sanitizedPhone,
    status: status || "ACTIVE",
  });

  // Get the newly created user's ID
  const newUserResult = await db
    .select({ user_id: User.user_id })
    .from(User)
    .where(eq(User.username, sanitizedUsername))
    .limit(1);
  const newUserId = newUserResult[0]?.user_id;

  // Validate gender
  const validatedGender = validateGender(gender);

  // Format date
  const formattedDateOfBirth = formatDateForMySQL(date_of_birth);

  // Get user_type from the first selected role (if roles are provided)
  // Map role names to valid user_type values
  const validUserTypes = ["STUDENT", "TEACHER", "ADMIN", "PARENT", "STAFF"];
  let userType: "STUDENT" | "TEACHER" | "ADMIN" | "PARENT" | "STAFF" | null =
    null;
  if (roles && Array.isArray(roles) && roles.length > 0) {
    const firstRoleId = roles[0];
    const roleResult = await db
      .select({ name: Role.name })
      .from(Role)
      .where(eq(Role.role_id, firstRoleId))
      .limit(1);
    if (roleResult.length > 0) {
      const roleName = roleResult[0].name?.toUpperCase();
      if (validUserTypes.includes(roleName)) {
        userType = roleName as
          | "STUDENT"
          | "TEACHER"
          | "ADMIN"
          | "PARENT"
          | "STAFF";
      } else {
        userType = "STAFF"; // Default for unknown roles
      }
    }
  }

  // Create profile if any profile data is provided
  if (
    sanitizedFirstName ||
    sanitizedLastName ||
    validatedGender ||
    formattedDateOfBirth ||
    sanitizedAddress ||
    userType
  ) {
    await db.insert(UserProfile).values({
      user_id: newUserId,
      first_name: sanitizedFirstName || null,
      last_name: sanitizedLastName || null,
      gender: validatedGender,
      date_of_birth: formattedDateOfBirth ? sql`${formattedDateOfBirth}` : null,
      address: sanitizedAddress || null,
      user_type: userType || "STAFF",
    });
  }

  // Assign roles if provided
  if (roles && Array.isArray(roles) && roles.length > 0) {
    const roleInserts = roles.map((roleId: number) => ({
      user_id: newUserId,
      role_id: roleId,
    }));
    await db.insert(UserRole).values(roleInserts);
  }

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

// Bulk create users from Excel
export const bulkCreateUsers = asyncHandler(async (req: any, res: any) => {
  if (!req.file) {
    throw new ValidationError("No file uploaded");
  }

  const { role_id } = req.body;

  logger.info("Processing bulk user upload", {
    uploadedBy: req.user?.userId,
    roleId: role_id,
  });

  // Parse Excel file
  const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);

  if (!data || data.length === 0) {
    throw new ValidationError("Excel file is empty");
  }

  const errors: string[] = [];
  let successCount = 0;
  let failedCount = 0;

  // Validate role_id if provided
  let selectedRoleName: string | null = null;
  if (role_id) {
    const roleIdNum = parseInt(role_id);
    if (isNaN(roleIdNum)) {
      throw new ValidationError("Invalid role ID");
    }
    const roleResult = await db
      .select({ name: Role.name })
      .from(Role)
      .where(eq(Role.role_id, roleIdNum))
      .limit(1);
    if (roleResult.length > 0) {
      selectedRoleName = roleResult[0].name;
    } else {
      throw new ValidationError("Role not found");
    }
  }

  // Get user_type from role name
  const validUserTypes = [
    "STUDENT",
    "TEACHER",
    "PARENT",
    "ADMIN",
    "STAFF",
  ] as const;
  let validatedUserType: "STUDENT" | "TEACHER" | "PARENT" | "ADMIN" | "STAFF" =
    "STUDENT";
  if (selectedRoleName && validUserTypes.includes(selectedRoleName as any)) {
    validatedUserType = selectedRoleName as
      | "STUDENT"
      | "TEACHER"
      | "PARENT"
      | "ADMIN"
      | "STAFF";
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i] as any;
    const rowNum = i + 2; // Excel row number (1-based, with header)

    try {
      // Validate required fields
      const username = row.username?.toString().trim();
      const email = row.email?.toString().trim();

      if (!username || !email) {
        errors.push(`Row ${rowNum}: Missing required fields (username, email)`);
        failedCount++;
        continue;
      }

      if (!validateEmail(email)) {
        errors.push(`Row ${rowNum}: Invalid email format for ${email}`);
        failedCount++;
        continue;
      }

      // Check for duplicates
      const existingUser = await db
        .select()
        .from(User)
        .where(eq(User.username, sanitizeString(username)))
        .limit(1);

      if (existingUser.length > 0) {
        errors.push(`Row ${rowNum}: Username "${username}" already exists`);
        failedCount++;
        continue;
      }

      const existingEmail = await db
        .select()
        .from(User)
        .where(eq(User.email, sanitizeString(email)))
        .limit(1);

      if (existingEmail.length > 0) {
        errors.push(`Row ${rowNum}: Email "${email}" already exists`);
        failedCount++;
        continue;
      }

      // Sanitize optional fields
      const phoneNumber = row.phone_number
        ? sanitizeString(row.phone_number.toString())
        : undefined;
      const firstName = row.first_name
        ? sanitizeString(row.first_name.toString())
        : undefined;
      const lastName = row.last_name
        ? sanitizeString(row.last_name.toString())
        : undefined;
      const address = row.address
        ? sanitizeString(row.address.toString())
        : undefined;

      // Validate gender
      const gender = validateGender(row.gender?.toString());

      // Format date
      const dateOfBirth = formatDateForMySQL(row.date_of_birth?.toString());

      // Insert user
      await db.insert(User).values({
        username: sanitizeString(username),
        email: sanitizeString(email),
        phone_number: phoneNumber,
        status: "ACTIVE",
      });

      // Get the newly created user's ID
      const newUserResult = await db
        .select({ user_id: User.user_id })
        .from(User)
        .where(eq(User.username, sanitizeString(username)))
        .limit(1);
      const newUserId = newUserResult[0]?.user_id;

      // Insert profile if any profile data is provided
      if (firstName || lastName || gender || dateOfBirth || address) {
        await db.insert(UserProfile).values({
          user_id: newUserId,
          first_name: firstName || null,
          last_name: lastName || null,
          gender: gender,
          date_of_birth: dateOfBirth ? sql`${dateOfBirth}` : null,
          address: address || null,
          user_type: validatedUserType,
        });
      }

      // Assign role if role_id is provided
      if (role_id) {
        await db.insert(UserRole).values({
          user_id: newUserId,
          role_id: parseInt(role_id),
        });
      }

      successCount++;
    } catch (error: any) {
      errors.push(`Row ${rowNum}: ${error.message}`);
      failedCount++;
    }
  }

  logger.info("Bulk user upload complete", {
    successCount,
    failedCount,
    totalRows: data.length,
    uploadedBy: req.user?.userId,
    roleId: role_id,
  });

  successResponse(
    res,
    `Bulk upload complete: ${successCount} created, ${failedCount} failed`,
    { success: successCount, failed: failedCount, errors: errors.slice(0, 10) }
  );
});

// Download user template
export const downloadTemplate = asyncHandler(async (req: any, res: any) => {
  logger.info("Downloading user template", { userId: req.user?.userId });

  // Create template data
  const templateData = [
    {
      username: "john_doe_001",
      email: "john.doe@example.com",
      phone_number: "+250788123456",
      first_name: "John",
      last_name: "Doe",
      gender: "MALE",
      date_of_birth: "2010-01-15",
      address: "Kigali, Rwanda",
      user_type: "STUDENT",
    },
    {
      username: "jane_smith_002",
      email: "jane.smith@example.com",
      phone_number: "+250788654321",
      first_name: "Jane",
      last_name: "Smith",
      gender: "FEMALE",
      date_of_birth: "2008-05-20",
      address: "Kigali, Rwanda",
      user_type: "TEACHER",
    },
    {
      username: "parent_001",
      email: "parent@example.com",
      phone_number: "+250788111222",
      first_name: "Parent",
      last_name: "One",
      gender: "MALE",
      date_of_birth: "1980-03-10",
      address: "Kigali, Rwanda",
      user_type: "PARENT",
    },
    {
      username: "admin_user",
      email: "admin@example.com",
      phone_number: "+250788999888",
      first_name: "Admin",
      last_name: "User",
      gender: "MALE",
      date_of_birth: "1985-07-25",
      address: "Kigali, Rwanda",
      user_type: "ADMIN",
    },
    {
      username: "staff_member",
      email: "staff@example.com",
      phone_number: "+250788777666",
      first_name: "Staff",
      last_name: "Member",
      gender: "FEMALE",
      date_of_birth: "1990-11-30",
      address: "Kigali, Rwanda",
      user_type: "STAFF",
    },
  ];

  // Create workbook
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(templateData);

  // Set column widths
  const wscols = [
    { wch: 20 }, // username
    { wch: 30 }, // email
    { wch: 20 }, // phone_number
    { wch: 15 }, // first_name
    { wch: 15 }, // last_name
    { wch: 10 }, // gender
    { wch: 15 }, // date_of_birth
    { wch: 30 }, // address
    { wch: 15 }, // user_type
  ];

  // @ts-ignore
  worksheet["!cols"] = wscols;

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, "Users");

  // Set response headers
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=user_template.xlsx"
  );

  // Send file
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.send(buffer);
});
