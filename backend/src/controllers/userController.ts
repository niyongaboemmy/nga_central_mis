import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "../db";
import {
  sql,
  eq,
  and,
  or,
  like,
  desc,
  asc,
  isNull,
  count,
  inArray,
  sql as drizzleSql,
  SQL,
} from "drizzle-orm";
import { ALL_PERMISSIONS } from "../utils/permissions";
import {
  User,
  UserProfile,
  AuthCredential,
  Role,
  Permission,
  UserRole,
  RolePermission,
  Program,
  UserProgramLead,
  Grade,
  Subject,
  GradeSubject,
  ClassGroup,
  StudentClassGroup,
  TeacherSubjectAssignment,
  StudentSubjectEnrollment,
  UserGrade,
  AcademicYear,
  AcademicTerm,
  System,
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
import emailService from "../utils/email";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { recordActivity } from "../utils/activityLogger";
import { getCurrentAcademicYearId } from "../utils/academicYear";
import { generateStudentRegistrationNumber } from "../utils/registrationNumber";

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
  gender: string | undefined,
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

    // Record activity
    await recordActivity(
      userId,
      "PROFILE_UPDATE",
      "User updated their personal profile information",
      "UserProfile",
      userId,
      { ...req.body },
      userId,
    );

    successResponse(
      res,
      "Profile updated successfully",
      updatedProfile[0] || null,
    );
  },
);

export const updateThemePreference = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user?.userId;

    if (!userId) {
      throw new ValidationError("User not authenticated");
    }

    const { theme } = req.body;

    if (!["light", "dark"].includes(theme)) {
      throw new ValidationError("Invalid theme preference");
    }

    await db
      .update(User)
      .set({ preferred_theme: theme })
      .where(eq(User.user_id, userId));

    logger.info("Updated user theme preference", { userId, theme });

    successResponse(res, "Theme preference updated successfully");
  },
);

export const updateUserProfile = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const userId = parseInt(id);

  if (isNaN(userId)) {
    throw new ValidationError("Invalid user ID");
  }

  const {
    first_name,
    last_name,
    gender,
    date_of_birth,
    address,
    external_id,
    phone_number,
  } = req.body;

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

  // Update User table if phone_number is provided
  if (phone_number !== undefined && phone_number !== null) {
    await db
      .update(User)
      .set({ phone_number: sanitizeString(phone_number) })
      .where(eq(User.user_id, userId));
  }

  // Fetch updated profile
  const updatedProfile = await db
    .select()
    .from(UserProfile)
    .where(eq(UserProfile.user_id, userId))
    .limit(1);

  // Record activity
  await recordActivity(
    userId,
    "PROFILE_UPDATE",
    "Administrator updated the user profile",
    "UserProfile",
    userId,
    { ...req.body, updatedBy: req.user?.userId },
    req.user?.userId,
  );

  successResponse(
    res,
    "Profile updated successfully",
    updatedProfile[0] || null,
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

  // Get auth credentials to check force_password_change
  const auth = await db
    .select({ force_password_change: AuthCredential.force_password_change })
    .from(AuthCredential)
    .where(eq(AuthCredential.user_id, userId))
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
            eq(Permission.status, "ACTIVE"),
          ),
        )
        .where(eq(RolePermission.role_id, role.role_id));

      return { ...role, permissions };
    }),
  );

  // Get flat list of permission names
  let permissions: string[];

  if (isSuperAdmin) {
    // SUPER_ADMIN gets all permissions
    permissions = ALL_PERMISSIONS as string[];
  } else {
    permissions = rolesWithPermissions.flatMap((r) =>
      r.permissions.map((p: any) => p.name),
    );
  }

  // Program-lead and class-teacher-of-grade roles are year-scoped; only the
  // current year's assignments should be reflected on the profile.
  const currentYearIdForAssignments = await getCurrentAcademicYearId();

  // Get assigned programs for program leads
  const assignedPrograms = currentYearIdForAssignments
    ? await db
        .select({
          program_id: Program.program_id,
          name: Program.name,
          description: Program.description,
        })
        .from(UserProgramLead)
        .innerJoin(
          Program,
          eq(UserProgramLead.program_id, Program.program_id),
        )
        .where(
          and(
            eq(UserProgramLead.user_id, userId),
            eq(
              UserProgramLead.academic_year_id,
              currentYearIdForAssignments,
            ),
          ),
        )
    : [];

  // Get assigned grades for class teachers
  const assignedGrades = currentYearIdForAssignments
    ? await db
        .select({
          grade_id: Grade.grade_id,
          name: Grade.name,
          level_order: Grade.level_order,
          program_id: Grade.program_id,
          program_name: Program.name,
          class_group_id: UserGrade.class_group_id,
          class_group_name: ClassGroup.name,
          assigned_at: UserGrade.assigned_at,
        })
        .from(UserGrade)
        .innerJoin(Grade, eq(UserGrade.grade_id, Grade.grade_id))
        .innerJoin(
          ClassGroup,
          eq(UserGrade.class_group_id, ClassGroup.class_group_id),
        )
        .innerJoin(Program, eq(Grade.program_id, Program.program_id))
        .where(
          and(
            eq(UserGrade.user_id, userId),
            eq(UserGrade.academic_year_id, currentYearIdForAssignments),
          ),
        )
        .orderBy(Grade.level_order, ClassGroup.name)
    : [];

  // Get all academic years
  const academicYears = await db
    .select()
    .from(AcademicYear)
    .orderBy(AcademicYear.start_date);

  // Get current academic year
  const currentAcademicYear = await db
    .select()
    .from(AcademicYear)
    .where(eq(AcademicYear.is_current, 1))
    .limit(1);

  // Get all academic terms for the current academic year
  let currentAcademicTerms: any[] = [];
  if (currentAcademicYear.length > 0) {
    currentAcademicTerms = await db
      .select()
      .from(AcademicTerm)
      .where(
        eq(
          AcademicTerm.academic_year_id,
          currentAcademicYear[0].academic_year_id,
        ),
      )
      .orderBy(AcademicTerm.start_date);
  }

  // Get all programs
  const allPrograms = await db.select().from(Program).orderBy(Program.name);

  // Get all grades with program information
  const allGrades = await db
    .select({
      grade_id: Grade.grade_id,
      name: Grade.name,
      level_order: Grade.level_order,
      program_id: Grade.program_id,
      program_name: Program.name,
    })
    .from(Grade)
    .innerJoin(Program, eq(Grade.program_id, Program.program_id))
    .orderBy(Grade.level_order);

  // Get all active systems
  const systems = await db
    .select()
    .from(System)
    .where(eq(System.status, "ACTIVE"));

  successResponse(res, "User profile retrieved successfully", {
    user: user[0],
    profile: profile[0] || null,
    roles: rolesWithPermissions,
    permissions,
    assignedPrograms,
    assignedGrades,
    forcePasswordChange: auth[0]?.force_password_change === 1,
    academicYears,
    currentAcademicYear: currentAcademicYear[0] || null,
    currentAcademicTerms,
    allPrograms,
    allGrades,
    systems,
  });
});

export const getUsers = asyncHandler(async (req: any, res: any) => {
  const {
    userRole,
    page = 1,
    limit = 10,
    search,
    status,
    class_group_id,
    academic_year_id,
  } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  logger.info("Fetching users with filters", {
    userId: req.user?.userId,
    userRole,
    page: pageNum,
    limit: limitNum,
    search,
    status,
  });

  const whereConditions: any[] = [];

  if (search) {
    whereConditions.push(
      or(
        sql`${User.username} LIKE ${`%${search}%`}`,
        sql`${User.email} LIKE ${`%${search}%`}`,
        sql`${User.phone_number} LIKE ${`%${search}%`}`,
      ),
    );
  }

  if (status && status !== "all") {
    whereConditions.push(eq(User.status, status.toUpperCase()));
  }

  if (userRole && userRole !== "all") {
    const userRoleId = parseInt(userRole as string, 10);
    if (!isNaN(userRoleId)) {
      const roleUserIds = await db
        .select({ user_id: UserRole.user_id })
        .from(UserRole)
        .where(eq(UserRole.role_id, userRoleId));
      const matchingUserIds = roleUserIds.map((r) => r.user_id);
      // No user holds this role — short-circuit to an empty result set
      // rather than falling through to an unfiltered query.
      whereConditions.push(
        matchingUserIds.length > 0
          ? inArray(User.user_id, matchingUserIds)
          : sql`1 = 0`,
      );
    }
  }

  // Class Groups Management filters the roster by class group. ClassGroup is a
  // permanent label reused across years, so without the year filter this would
  // return every cohort that ever sat in the group, not the current one.
  if (class_group_id !== undefined && class_group_id !== "") {
    const classGroupId = parseInt(class_group_id as string, 10);
    if (isNaN(classGroupId)) {
      throw new ValidationError("Invalid class group ID");
    }

    const membershipFilters: any[] = [
      eq(StudentClassGroup.class_group_id, classGroupId),
      eq(StudentClassGroup.status, "ACTIVE"),
    ];

    const yearId =
      academic_year_id !== undefined && academic_year_id !== ""
        ? parseInt(academic_year_id as string, 10)
        : await getCurrentAcademicYearId();
    if (yearId && !isNaN(yearId)) {
      membershipFilters.push(eq(StudentClassGroup.academic_year_id, yearId));
    }

    const memberRows = await db
      .select({ user_id: StudentClassGroup.user_id })
      .from(StudentClassGroup)
      .where(and(...membershipFilters));
    const memberIds = Array.from(
      new Set(memberRows.map((r) => Number(r.user_id))),
    );

    whereConditions.push(
      memberIds.length > 0 ? inArray(User.user_id, memberIds) : sql`1 = 0`,
    );
  }

  const totalCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(User)
    .where(
      whereConditions.length > 0 ? and(...whereConditions) : (undefined as any),
    );

  const totalCount = totalCountResult[0]?.count || 0;

  const users = await db
    .select()
    .from(User)
    .where(
      whereConditions.length > 0 ? and(...whereConditions) : (undefined as any),
    )
    .limit(limitNum)
    .offset(offset);

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
                eq(Permission.status, "ACTIVE"),
              ),
            )
            .where(eq(RolePermission.role_id, role.role_id));

          return { ...role, permissions };
        }),
      );

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
          r.permissions.map((p) => p.name),
        ),
      };
    }),
  );

  const totalPages = Math.ceil(totalCount / limitNum);
  res.setHeader("X-Total-Count", totalCount.toString());
  res.setHeader("X-Total-Pages", totalPages.toString());
  res.setHeader("X-Current-Page", pageNum.toString());
  res.setHeader("X-Per-Page", limitNum.toString());

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
            eq(Permission.status, "ACTIVE"),
          ),
        )
        .where(eq(RolePermission.role_id, role.role_id));

      return { ...role, permissions };
    }),
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
      r.permissions.map((p: any) => p.name),
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

  // Generate random password
  const randomPassword = crypto.randomBytes(8).toString("hex");

  // Hash the password
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(randomPassword, salt);

  // Insert auth credentials with force password change
  await db.insert(AuthCredential).values({
    user_id: newUserId,
    password_hash: passwordHash,
    force_password_change: 1,
  });

  // Send email with credentials (don't await to avoid blocking)
  try {
    emailService.sendAccountCreation(
      sanitizedEmail,
      sanitizedUsername,
      randomPassword,
    );
  } catch (emailError) {
    logger.warn("Failed to send account creation email", {
      emailError,
      userId: newUserId,
    });
  }

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
    const registrationNumber =
      userType === "STUDENT"
        ? await generateStudentRegistrationNumber()
        : null;

    await db.insert(UserProfile).values({
      user_id: newUserId,
      first_name: sanitizedFirstName || null,
      last_name: sanitizedLastName || null,
      gender: validatedGender,
      date_of_birth: formattedDateOfBirth ? sql`${formattedDateOfBirth}` : null,
      address: sanitizedAddress || null,
      user_type: userType || "STAFF",
      registration_number: registrationNumber,
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

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      newUserId,
      "USER_CREATE",
      `Created user: ${sanitizedUsername}`,
      "User",
      newUserId,
      { username: sanitizedUsername, email: sanitizedEmail, roles },
      req.user.userId,
    );
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

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      userId,
      "USER_UPDATE",
      `Updated user: ${sanitizedUsername || "ID " + userId}`,
      "User",
      userId,
      updateData,
      req.user.userId,
    );
  }

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

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      userId,
      "USER_DELETE",
      `Deleted user ID: ${userId}`,
      "User",
      userId,
      undefined,
      req.user.userId,
    );
  }

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

      // Generate random password
      const randomPassword = crypto.randomBytes(8).toString("hex");

      // Hash the password
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(randomPassword, salt);

      // Insert auth credentials with force password change
      await db.insert(AuthCredential).values({
        user_id: newUserId,
        password_hash: passwordHash,
        force_password_change: 1,
      });

      // Send email with credentials (don't await to avoid blocking)
      try {
        emailService.sendAccountCreation(
          sanitizeString(email),
          sanitizeString(username),
          randomPassword,
        );
      } catch (emailError) {
        logger.warn("Failed to send account creation email for bulk user", {
          emailError,
          userId: newUserId,
        });
      }

      // Insert profile if any profile data (or a role/user_type) is provided
      // -- a student profile row must exist even with no other fields, since
      // that's where the registration number below gets stored.
      if (firstName || lastName || gender || dateOfBirth || address || role_id) {
        const registrationNumber =
          validatedUserType === "STUDENT"
            ? await generateStudentRegistrationNumber()
            : null;

        await db.insert(UserProfile).values({
          user_id: newUserId,
          first_name: firstName || null,
          last_name: lastName || null,
          gender: gender,
          date_of_birth: dateOfBirth ? sql`${dateOfBirth}` : null,
          address: address || null,
          user_type: validatedUserType,
          registration_number: registrationNumber,
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

  // Record activity
  if (req.user?.userId && successCount > 0) {
    await recordActivity(
      req.user.userId,
      "USER_BULK_CREATE",
      `Bulk created ${successCount} users via Excel upload`,
      "User",
      undefined,
      { successCount, failedCount, totalRows: data.length, roleId: role_id },
      req.user.userId,
    );
  }

  successResponse(
    res,
    `Bulk upload complete: ${successCount} created, ${failedCount} failed`,
    { success: successCount, failed: failedCount, errors: errors.slice(0, 10) },
  );
});

/**
 * Backfill registration numbers for every STUDENT that doesn't have one yet,
 * oldest first (by user_id, i.e. "first in"). New students already get a
 * number automatically at creation (see createUser / bulkCreateUsers above)
 * -- this is only for students that predate the feature or slipped through.
 * Each number's year segment is the student's own admission year
 * (`User.created_at`), not the year this endpoint happens to run in.
 */
export const generateStudentRegistrationNumbers = asyncHandler(
  async (req: any, res: any) => {
    const pending = await db
      .select({
        profile_id: UserProfile.profile_id,
        user_id: UserProfile.user_id,
        created_at: User.created_at,
      })
      .from(UserProfile)
      .innerJoin(User, eq(UserProfile.user_id, User.user_id))
      .where(
        and(
          eq(UserProfile.user_type, "STUDENT"),
          isNull(UserProfile.registration_number),
        ),
      )
      .orderBy(asc(UserProfile.user_id));

    const assignments: { user_id: number; registration_number: string }[] =
      [];

    for (const row of pending) {
      const registrationNumber = await generateStudentRegistrationNumber(
        row.created_at ? new Date(row.created_at) : new Date(),
      );
      await db
        .update(UserProfile)
        .set({ registration_number: registrationNumber })
        .where(eq(UserProfile.profile_id, row.profile_id));
      assignments.push({
        user_id: row.user_id,
        registration_number: registrationNumber,
      });
    }

    logger.info("Student registration numbers generated", {
      updated: assignments.length,
      total: pending.length,
      triggeredBy: req.user?.userId,
    });

    if (req.user?.userId && assignments.length > 0) {
      await recordActivity(
        req.user.userId,
        "USER_UPDATE",
        `Generated registration numbers for ${assignments.length} student(s)`,
        "UserProfile",
        undefined,
        { updated: assignments.length },
        req.user.userId,
      );
    }

    successResponse(res, "Student registration numbers generated", {
      updated: assignments.length,
      total: pending.length,
      assignments,
    });
  },
);

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
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=user_template.xlsx",
  );

  // Send file
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.send(buffer);
});

// Search users by any keyword including email, username, phone, name, address, etc. (for document sharing)
export const searchUsers = asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.userId;
  const { q } = req.query;

  if (!q || (typeof q === "string" && q.trim().length === 0)) {
    throw new ValidationError("Search query is required");
  }

  const searchTerm = `%${q}%`;

  // Search users by username, email, phone, first/last name, full name, address, external_id, user_type
  const users = await db
    .select({
      user_id: User.user_id,
      username: User.username,
      email: User.email,
      phone_number: User.phone_number,
      status: User.status,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      address: UserProfile.address,
      external_id: UserProfile.external_id,
      user_type: UserProfile.user_type,
    })
    .from(User)
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(
      and(
        eq(User.status, "ACTIVE"),
        or(
          sql`LOWER(${User.username}) LIKE LOWER(${searchTerm})`,
          sql`LOWER(${User.email}) LIKE LOWER(${searchTerm})`,
          sql`LOWER(${User.phone_number}) LIKE LOWER(${searchTerm})`,
          sql`LOWER(${UserProfile.first_name}) LIKE LOWER(${searchTerm})`,
          sql`LOWER(${UserProfile.last_name}) LIKE LOWER(${searchTerm})`,
          sql`LOWER(CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})) LIKE LOWER(${searchTerm})`,
          sql`LOWER(${UserProfile.address}) LIKE LOWER(${searchTerm})`,
          sql`LOWER(${UserProfile.external_id}) LIKE LOWER(${searchTerm})`,
          sql`LOWER(${UserProfile.user_type}) LIKE LOWER(${searchTerm})`,
        ),
      ),
    )
    .limit(20);

  logger.info(
    `User search for "${q}" by user ${userId}, found ${users.length} results`,
  );

  successResponse(res, "Users retrieved successfully", users);
});

// Assign role to user
export const assignRoleToUser = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const { role_id } = req.body;
  const userId = parseInt(id);
  const roleId = parseInt(role_id);

  if (isNaN(userId) || isNaN(roleId)) {
    throw new ValidationError("Invalid user ID or role ID");
  }

  logger.info("Assigning role to user", {
    userId,
    roleId,
    assignedBy: req.user?.userId,
  });

  // Check if user exists
  const user = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

  if (user.length === 0) {
    throw new NotFoundError("User not found");
  }

  // Check if role exists and is active
  const role = await db
    .select()
    .from(Role)
    .where(and(eq(Role.role_id, roleId), eq(Role.status, "ACTIVE")))
    .limit(1);

  if (role.length === 0) {
    throw new NotFoundError("Role not found or inactive");
  }

  // Check if user already has this role
  const existingRole = await db
    .select()
    .from(UserRole)
    .where(and(eq(UserRole.user_id, userId), eq(UserRole.role_id, roleId)))
    .limit(1);

  if (existingRole.length > 0) {
    throw new ConflictError("User already has this role");
  }

  // Remove any existing roles for this user (one role per user policy)
  await db.delete(UserRole).where(eq(UserRole.user_id, userId));

  // Assign new role
  await db.insert(UserRole).values({
    user_id: userId,
    role_id: roleId,
  });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      userId,
      "ROLE_ASSIGN",
      `User assigned to role: ${role[0].name}`,
      "UserRole",
      userId,
      { role_id: roleId, role_name: role[0].name },
      req.user.userId,
    );
  }

  successResponse(res, "Role assigned to user successfully");
});

// Remove role from user
export const removeRoleFromUser = asyncHandler(async (req: any, res: any) => {
  const { id, roleId } = req.params;
  const userId = parseInt(id);
  const roleIdNum = parseInt(roleId);

  if (isNaN(userId) || isNaN(roleIdNum)) {
    throw new ValidationError("Invalid user ID or role ID");
  }

  logger.info("Removing role from user", {
    userId,
    roleId: roleIdNum,
    removedBy: req.user?.userId,
  });

  // Check if user exists
  const user = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

  if (user.length === 0) {
    throw new NotFoundError("User not found");
  }

  // Check if role assignment exists
  const existingRole = await db
    .select()
    .from(UserRole)
    .where(and(eq(UserRole.user_id, userId), eq(UserRole.role_id, roleIdNum)))
    .limit(1);

  if (existingRole.length === 0) {
    throw new NotFoundError("User does not have this role");
  }

  // Prevent removing SUPER_ADMIN role
  const role = await db
    .select({ name: Role.name })
    .from(Role)
    .where(eq(Role.role_id, roleIdNum))
    .limit(1);

  if (role.length > 0 && role[0].name === "SUPER_ADMIN") {
    throw new ValidationError("Cannot remove SUPER_ADMIN role");
  }

  // Remove role
  await db
    .delete(UserRole)
    .where(and(eq(UserRole.user_id, userId), eq(UserRole.role_id, roleIdNum)));

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      userId,
      "ROLE_REMOVE",
      `Role ${role[0]?.name || "ID " + roleIdNum} removed from user`,
      "UserRole",
      userId,
      { role_id: roleIdNum, role_name: role[0]?.name },
      req.user.userId,
    );
  }

  successResponse(res, "Role removed from user successfully");
});

// Disable user
export const disableUser = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const userId = parseInt(id);

  if (isNaN(userId)) {
    throw new ValidationError("Invalid user ID");
  }

  logger.info("Disabling user", {
    userId,
    disabledBy: req.user?.userId,
  });

  // Check if user exists
  const user = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

  if (user.length === 0) {
    throw new NotFoundError("User not found");
  }

  // Prevent disabling own account
  if (req.user?.userId === userId) {
    throw new ValidationError("Cannot disable your own account");
  }

  // Update user status to INACTIVE (disabled)
  await db
    .update(User)
    .set({ status: "INACTIVE" })
    .where(eq(User.user_id, userId));

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      userId,
      "ACCOUNT_DISABLE",
      "User account was disabled by administrator",
      "User",
      userId,
      { disabled_by: req.user.userId },
      req.user.userId,
    );
  }

  successResponse(res, "User disabled successfully");
});

// Enable user
export const enableUser = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const userId = parseInt(id);

  if (isNaN(userId)) {
    throw new ValidationError("Invalid user ID");
  }

  logger.info("Enabling user", {
    userId,
    enabledBy: req.user?.userId,
  });

  // Check if user exists
  const user = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

  if (user.length === 0) {
    throw new NotFoundError("User not found");
  }

  // Update user status to ACTIVE
  await db
    .update(User)
    .set({ status: "ACTIVE" })
    .where(eq(User.user_id, userId));

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      userId,
      "ACCOUNT_ENABLE",
      "User account was enabled by administrator",
      "User",
      userId,
      { enabled_by: req.user.userId },
      req.user.userId,
    );
  }

  successResponse(res, "User enabled successfully");
});

// Get user roles
export const getUserRoles = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const userId = parseInt(id);

  if (isNaN(userId)) {
    throw new ValidationError("Invalid user ID");
  }

  logger.info("Fetching user roles", { userId, requestedBy: req.user?.userId });

  // Check if user exists
  const user = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

  if (user.length === 0) {
    throw new NotFoundError("User not found");
  }

  // Get user roles with permissions
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
            eq(Permission.status, "ACTIVE"),
          ),
        )
        .where(eq(RolePermission.role_id, role.role_id));

      return { ...role, permissions };
    }),
  );

  successResponse(
    res,
    "User roles retrieved successfully",
    rolesWithPermissions,
  );
});

// Get roles for a program (roles that have users associated with the program)
export const getProgramRoles = asyncHandler(async (req: any, res: any) => {
  const { programId } = req.params;
  const programIdNum = parseInt(programId);
  const userId = req.user?.userId;

  if (isNaN(programIdNum)) {
    throw new ValidationError("Invalid program ID");
  }

  logger.info("Fetching roles for program", {
    programId: programIdNum,
    requestedBy: userId,
  });

  // Check if program exists
  const program = await db
    .select()
    .from(Program)
    .where(eq(Program.program_id, programIdNum))
    .limit(1);

  if (program.length === 0) {
    throw new NotFoundError("Program not found");
  }

  // Program leadership is year-scoped; only the current year's leadership
  // grants access here and counts toward the "leads" roster below.
  const currentYearIdForProgram = await getCurrentAcademicYearId();
  if (!currentYearIdForProgram) {
    throw new ValidationError("No current academic year is set");
  }
  const userLead = await db
    .select()
    .from(UserProgramLead)
    .where(
      and(
        eq(UserProgramLead.user_id, userId),
        eq(UserProgramLead.program_id, programIdNum),
        eq(UserProgramLead.academic_year_id, currentYearIdForProgram),
      ),
    )
    .limit(1);

  if (userLead.length === 0) {
    throw new ValidationError(
      "You do not have permission to view users in this program",
    );
  }

  // Get all users associated with the program
  // Students: via StudentClassGroup -> ClassGroup -> Grade -> Program
  const studentUsers = await db
    .select({ user_id: User.user_id })
    .from(User)
    .innerJoin(StudentClassGroup, eq(User.user_id, StudentClassGroup.user_id))
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .where(eq(Grade.program_id, programIdNum));

  // Teachers: via TeacherSubjectAssignment -> ClassGroup -> Grade -> Program
  const teacherUsers = await db
    .select({ user_id: User.user_id })
    .from(User)
    .innerJoin(
      TeacherSubjectAssignment,
      eq(User.user_id, TeacherSubjectAssignment.user_id),
    )
    .innerJoin(
      ClassGroup,
      eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .where(eq(Grade.program_id, programIdNum));

  // Program leads: via UserProgramLead, current academic year only
  const leadUsers = await db
    .select({ user_id: User.user_id })
    .from(User)
    .innerJoin(UserProgramLead, eq(User.user_id, UserProgramLead.user_id))
    .where(
      and(
        eq(UserProgramLead.program_id, programIdNum),
        eq(UserProgramLead.academic_year_id, currentYearIdForProgram),
      ),
    );

  // Combine all user IDs
  const allUserIds = [
    ...new Set([
      ...studentUsers.map((u) => u.user_id),
      ...teacherUsers.map((u) => u.user_id),
      ...leadUsers.map((u) => u.user_id),
    ]),
  ];

  if (allUserIds.length === 0) {
    successResponse(res, "No roles found for this program", []);
    return;
  }

  // Get distinct roles for these users
  const roles = await db
    .select({
      role_id: Role.role_id,
      name: Role.name,
      description: Role.description,
      status: Role.status,
    })
    .from(Role)
    .innerJoin(UserRole, eq(Role.role_id, UserRole.role_id))
    .where(
      and(eq(Role.status, "ACTIVE"), inArray(UserRole.user_id, allUserIds)),
    )
    .groupBy(Role.role_id, Role.name, Role.description, Role.status);

  successResponse(res, "Program roles retrieved successfully", roles);
});

// Get users by program and role
export const getProgramUsersByRole = asyncHandler(
  async (req: any, res: any) => {
    const { programId, roleId } = req.params;
    const programIdNum = parseInt(programId);
    const roleIdNum = parseInt(roleId);
    const { page = 1, limit = 10, search } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    const userId = req.user?.userId;

    if (isNaN(programIdNum) || isNaN(roleIdNum)) {
      throw new ValidationError("Invalid program ID or role ID");
    }

    logger.info("Fetching users by program and role", {
      programId: programIdNum,
      roleId: roleIdNum,
      page: pageNum,
      limit: limitNum,
      search,
      requestedBy: userId,
    });

    // Check if program and role exist
    const program = await db
      .select()
      .from(Program)
      .where(eq(Program.program_id, programIdNum))
      .limit(1);

    if (program.length === 0) {
      throw new NotFoundError("Program not found");
    }

    const role = await db
      .select()
      .from(Role)
      .where(and(eq(Role.role_id, roleIdNum), eq(Role.status, "ACTIVE")))
      .limit(1);

    if (role.length === 0) {
      throw new NotFoundError("Role not found or inactive");
    }

    // Program leadership is year-scoped; only the current year's leadership
    // grants access here.
    const currentYearIdForProgram = await getCurrentAcademicYearId();
    if (!currentYearIdForProgram) {
      throw new ValidationError("No current academic year is set");
    }
    const userLead = await db
      .select()
      .from(UserProgramLead)
      .where(
        and(
          eq(UserProgramLead.user_id, userId),
          eq(UserProgramLead.program_id, programIdNum),
          eq(UserProgramLead.academic_year_id, currentYearIdForProgram),
        ),
      )
      .limit(1);

    if (userLead.length === 0) {
      throw new ValidationError(
        "You do not have permission to view users in this program",
      );
    }

    // Get users associated with the program who have the specified role
    // Students: via StudentClassGroup -> ClassGroup -> Grade -> Program
    const studentUsers = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        phone_number: User.phone_number,
        status: User.status,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
        user_type: UserProfile.user_type,
      })
      .from(User)
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .innerJoin(StudentClassGroup, eq(User.user_id, StudentClassGroup.user_id))
      .innerJoin(
        ClassGroup,
        eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
      )
      .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
      .innerJoin(UserRole, eq(User.user_id, UserRole.user_id))
      .where(
        and(
          eq(Grade.program_id, programIdNum),
          eq(UserRole.role_id, roleIdNum),
          eq(StudentClassGroup.status, "ACTIVE"),
        ),
      );

    // Teachers: via TeacherSubjectAssignment -> ClassGroup -> Grade -> Program
    const teacherUsers = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        phone_number: User.phone_number,
        status: User.status,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
        user_type: UserProfile.user_type,
      })
      .from(User)
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .innerJoin(
        TeacherSubjectAssignment,
        eq(User.user_id, TeacherSubjectAssignment.user_id),
      )
      .innerJoin(
        ClassGroup,
        eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
      )
      .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
      .innerJoin(UserRole, eq(User.user_id, UserRole.user_id))
      .where(
        and(
          eq(Grade.program_id, programIdNum),
          eq(UserRole.role_id, roleIdNum),
        ),
      );

    // Program leads: via UserProgramLead
    const leadUsers = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        phone_number: User.phone_number,
        status: User.status,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
        user_type: UserProfile.user_type,
      })
      .from(User)
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .innerJoin(UserProgramLead, eq(User.user_id, UserProgramLead.user_id))
      .innerJoin(UserRole, eq(User.user_id, UserRole.user_id))
      .where(
        and(
          eq(UserProgramLead.program_id, programIdNum),
          eq(UserRole.role_id, roleIdNum),
          eq(UserProgramLead.academic_year_id, currentYearIdForProgram),
        ),
      );

    // Combine all users
    const allUsers = [...studentUsers, ...teacherUsers, ...leadUsers];

    // Remove duplicates based on user_id
    const uniqueUsers = allUsers.filter(
      (user, index, self) =>
        index === self.findIndex((u) => u.user_id === user.user_id),
    );

    // Apply search filter
    let filteredUsers = uniqueUsers;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredUsers = uniqueUsers.filter(
        (user) =>
          user.username?.toLowerCase().includes(searchLower) ||
          user.email?.toLowerCase().includes(searchLower) ||
          user.first_name?.toLowerCase().includes(searchLower) ||
          user.last_name?.toLowerCase().includes(searchLower) ||
          user.phone_number?.toLowerCase().includes(searchLower),
      );
    }

    // Apply pagination
    const totalCount = filteredUsers.length;
    const paginatedUsers = filteredUsers.slice(offset, offset + limitNum);

    const totalPages = Math.ceil(totalCount / limitNum);
    res.setHeader("X-Total-Count", totalCount.toString());
    res.setHeader("X-Total-Pages", totalPages.toString());
    res.setHeader("X-Current-Page", pageNum.toString());
    res.setHeader("X-Per-Page", limitNum.toString());

    successResponse(res, "Users retrieved successfully", paginatedUsers);
  },
);

// Get all users in a program (for program leads)
export const getProgramUsers = asyncHandler(async (req: any, res: any) => {
  const { programId } = req.params;
  const programIdNum = parseInt(programId);
  const { page = 1, limit = 10, search } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;
  const userId = req.user?.userId;

  if (isNaN(programIdNum)) {
    throw new ValidationError("Invalid program ID");
  }

  logger.info("Fetching all users in program", {
    programId: programIdNum,
    page: pageNum,
    limit: limitNum,
    search,
    requestedBy: userId,
  });

  // Check if program exists
  const program = await db
    .select()
    .from(Program)
    .where(eq(Program.program_id, programIdNum))
    .limit(1);

  if (program.length === 0) {
    throw new NotFoundError("Program not found");
  }

  // Program leadership is year-scoped; only the current year's leadership
  // grants access here and counts toward the "leads" roster below.
  const currentYearIdForProgram = await getCurrentAcademicYearId();
  if (!currentYearIdForProgram) {
    throw new ValidationError("No current academic year is set");
  }
  const userLead = await db
    .select()
    .from(UserProgramLead)
    .where(
      and(
        eq(UserProgramLead.user_id, userId),
        eq(UserProgramLead.program_id, programIdNum),
        eq(UserProgramLead.academic_year_id, currentYearIdForProgram),
      ),
    )
    .limit(1);

  if (userLead.length === 0) {
    throw new ValidationError(
      "You do not have permission to view users in this program",
    );
  }

  // Get all users associated with the program
  // Students: via StudentClassGroup -> ClassGroup -> Grade -> Program
  const studentUsers = await db
    .select({
      user_id: User.user_id,
      username: User.username,
      email: User.email,
      phone_number: User.phone_number,
      status: User.status,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      user_type: UserProfile.user_type,
      role_name: Role.name,
    })
    .from(User)
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .innerJoin(StudentClassGroup, eq(User.user_id, StudentClassGroup.user_id))
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .innerJoin(UserRole, eq(User.user_id, UserRole.user_id))
    .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
    .where(
      and(
        eq(Grade.program_id, programIdNum),
        eq(StudentClassGroup.status, "ACTIVE"),
      ),
    );

  // Teachers: via TeacherSubjectAssignment -> ClassGroup -> Grade -> Program
  const teacherUsers = await db
    .select({
      user_id: User.user_id,
      username: User.username,
      email: User.email,
      phone_number: User.phone_number,
      status: User.status,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      user_type: UserProfile.user_type,
      role_name: Role.name,
    })
    .from(User)
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .innerJoin(
      TeacherSubjectAssignment,
      eq(User.user_id, TeacherSubjectAssignment.user_id),
    )
    .innerJoin(
      ClassGroup,
      eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .innerJoin(UserRole, eq(User.user_id, UserRole.user_id))
    .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
    .where(eq(Grade.program_id, programIdNum));

  // Program leads: via UserProgramLead
  const leadUsers = await db
    .select({
      user_id: User.user_id,
      username: User.username,
      email: User.email,
      phone_number: User.phone_number,
      status: User.status,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      user_type: UserProfile.user_type,
      role_name: Role.name,
    })
    .from(User)
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .innerJoin(UserProgramLead, eq(User.user_id, UserProgramLead.user_id))
    .innerJoin(UserRole, eq(User.user_id, UserRole.user_id))
    .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
    .where(
      and(
        eq(UserProgramLead.program_id, programIdNum),
        eq(UserProgramLead.academic_year_id, currentYearIdForProgram),
      ),
    );

  // Combine all users
  const allUsers = [...studentUsers, ...teacherUsers, ...leadUsers];

  // Remove duplicates based on user_id
  const uniqueUsers = allUsers.filter(
    (user, index, self) =>
      index === self.findIndex((u) => u.user_id === user.user_id),
  );

  // Apply search filter
  let filteredUsers = uniqueUsers;
  if (search) {
    const searchLower = search.toLowerCase();
    filteredUsers = uniqueUsers.filter(
      (user) =>
        user.username?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower) ||
        user.first_name?.toLowerCase().includes(searchLower) ||
        user.last_name?.toLowerCase().includes(searchLower) ||
        user.phone_number?.toLowerCase().includes(searchLower) ||
        user.role_name?.toLowerCase().includes(searchLower),
    );
  }

  // Apply pagination
  const totalCount = filteredUsers.length;
  const paginatedUsers = filteredUsers.slice(offset, offset + limitNum);

  const totalPages = Math.ceil(totalCount / limitNum);
  res.setHeader("X-Total-Count", totalCount.toString());
  res.setHeader("X-Total-Pages", totalPages.toString());
  res.setHeader("X-Current-Page", pageNum.toString());
  res.setHeader("X-Per-Page", limitNum.toString());

  successResponse(res, "Users retrieved successfully", paginatedUsers);
});

// Get all programs associated with a user (as lead, student, or teacher)
export const getUserPrograms = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const userId = parseInt(id);

  if (isNaN(userId)) {
    throw new ValidationError("Invalid user ID");
  }

  logger.info("Fetching programs for user", {
    userId,
    requestedBy: req.user?.userId,
  });

  // Check if user exists
  const user = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

  if (user.length === 0) {
    throw new NotFoundError("User not found");
  }

  // Get programs where user is a lead, per academic year
  const leadProgramsRaw = await db
    .select({
      program_id: Program.program_id,
      name: Program.name,
      description: Program.description,
      academic_year_id: UserProgramLead.academic_year_id,
      academic_year_name: AcademicYear.name,
      academic_year_is_current: AcademicYear.is_current,
    })
    .from(UserProgramLead)
    .innerJoin(Program, eq(UserProgramLead.program_id, Program.program_id))
    .innerJoin(
      AcademicYear,
      eq(UserProgramLead.academic_year_id, AcademicYear.academic_year_id),
    )
    .where(eq(UserProgramLead.user_id, userId));

  const leadPrograms = leadProgramsRaw.map((p) => ({
    ...p,
    relationship: "LEAD",
  }));

  // Get programs where user is a student, per academic year
  const studentProgramsRaw = await db
    .select({
      program_id: Program.program_id,
      name: Program.name,
      description: Program.description,
      academic_year_id: StudentClassGroup.academic_year_id,
      academic_year_name: AcademicYear.name,
      academic_year_is_current: AcademicYear.is_current,
    })
    .from(StudentClassGroup)
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .innerJoin(Program, eq(Grade.program_id, Program.program_id))
    .innerJoin(
      AcademicYear,
      eq(StudentClassGroup.academic_year_id, AcademicYear.academic_year_id),
    )
    .where(
      and(
        eq(StudentClassGroup.user_id, userId),
        eq(StudentClassGroup.status, "ACTIVE"),
      ),
    );

  const studentPrograms = studentProgramsRaw.map((p) => ({
    ...p,
    relationship: "STUDENT",
  }));

  // Get programs where user is a teacher, per academic year
  const teacherProgramsRaw = await db
    .select({
      program_id: Program.program_id,
      name: Program.name,
      description: Program.description,
      academic_year_id: TeacherSubjectAssignment.academic_year_id,
      academic_year_name: AcademicYear.name,
      academic_year_is_current: AcademicYear.is_current,
    })
    .from(TeacherSubjectAssignment)
    .innerJoin(
      ClassGroup,
      eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .innerJoin(Program, eq(Grade.program_id, Program.program_id))
    .innerJoin(
      AcademicYear,
      eq(TeacherSubjectAssignment.academic_year_id, AcademicYear.academic_year_id),
    )
    .where(eq(TeacherSubjectAssignment.user_id, userId));

  const teacherPrograms = teacherProgramsRaw.map((p) => ({
    ...p,
    relationship: "TEACHER",
  }));

  // Combine all programs and remove duplicates, keeping the highest priority
  // relationship per program+academic year (a user can hold a given program
  // relationship in more than one year, so year is part of the dedup key).
  const allPrograms = [...leadPrograms, ...studentPrograms, ...teacherPrograms];
  const uniquePrograms = allPrograms
    .filter(
      (program, index, self) =>
        index ===
        self.findIndex(
          (p) =>
            p.program_id === program.program_id &&
            p.academic_year_id === program.academic_year_id,
        ),
    )
    .sort((a, b) => b.academic_year_id - a.academic_year_id);

  successResponse(res, "User programs retrieved successfully", uniquePrograms);
});

// A class-teacher assignment names both a grade and a class group, and the
// two must agree -- ClassGroup already carries its own grade_id, so a
// mismatched pair would put the row in a state no UI could render sensibly.
const assertClassGroupBelongsToGrade = async (
  classGroupId: number,
  gradeId: number,
) => {
  const classGroup = await db
    .select({
      class_group_id: ClassGroup.class_group_id,
      grade_id: ClassGroup.grade_id,
      name: ClassGroup.name,
    })
    .from(ClassGroup)
    .where(eq(ClassGroup.class_group_id, classGroupId))
    .limit(1);

  if (classGroup.length === 0) {
    throw new NotFoundError("Class group not found");
  }

  if (classGroup[0].grade_id !== gradeId) {
    throw new ValidationError(
      "The selected class group does not belong to the selected grade",
    );
  }

  return classGroup[0];
};

// Assign grade to class teacher
export const assignGradeToUser = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const { grade_id, class_group_id, academic_year_id } = req.body;
  const userId = parseInt(id);
  const gradeId = parseInt(grade_id);
  const classGroupId = parseInt(class_group_id);

  if (isNaN(userId) || isNaN(gradeId)) {
    throw new ValidationError("Invalid user ID or grade ID");
  }

  if (isNaN(classGroupId)) {
    throw new ValidationError("Class group ID is required");
  }

  const yearId = academic_year_id
    ? parseInt(academic_year_id)
    : await getCurrentAcademicYearId();

  if (!yearId || isNaN(yearId)) {
    throw new ValidationError(
      "Academic year ID is required (no current academic year set)",
    );
  }

  logger.info("Assigning grade to user", {
    userId,
    gradeId,
    classGroupId,
    academicYearId: yearId,
    assignedBy: req.user?.userId,
  });

  // Check if user exists
  const user = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

  if (user.length === 0) {
    throw new NotFoundError("User not found");
  }

  // Check if grade exists
  const grade = await db
    .select()
    .from(Grade)
    .where(eq(Grade.grade_id, gradeId))
    .limit(1);

  if (grade.length === 0) {
    throw new NotFoundError("Grade not found");
  }

  // Check the class group exists and sits under the grade being assigned
  await assertClassGroupBelongsToGrade(classGroupId, gradeId);

  // Check if academic year exists
  const academicYear = await db
    .select()
    .from(AcademicYear)
    .where(eq(AcademicYear.academic_year_id, yearId))
    .limit(1);

  if (academicYear.length === 0) {
    throw new NotFoundError("Academic year not found");
  }

  // Check if user already leads this class group for this academic year
  const existingAssignment = await db
    .select()
    .from(UserGrade)
    .where(
      and(
        eq(UserGrade.user_id, userId),
        eq(UserGrade.grade_id, gradeId),
        eq(UserGrade.class_group_id, classGroupId),
        eq(UserGrade.academic_year_id, yearId),
      ),
    )
    .limit(1);

  if (existingAssignment.length > 0) {
    throw new ConflictError(
      "User is already class teacher of this class group for the selected academic year",
    );
  }

  // Assign grade
  await db.insert(UserGrade).values({
    user_id: userId,
    grade_id: gradeId,
    class_group_id: classGroupId,
    academic_year_id: yearId,
  });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      userId,
      "GRADE_ASSIGN_TO_TEACHER",
      `Grade assigned to teacher`,
      "UserGrade",
      gradeId,
      {
        teacher_id: userId,
        grade_id: gradeId,
        class_group_id: classGroupId,
        academic_year_id: yearId,
      },
      req.user.userId,
    );
  }

  successResponse(res, "Grade assigned to user successfully");
});

// Remove grade from class teacher
export const removeGradeFromUser = asyncHandler(async (req: any, res: any) => {
  const { id, gradeId, classGroupId, academicYearId } = req.params;
  const userId = parseInt(id);
  const gradeIdNum = parseInt(gradeId);
  const classGroupIdNum = parseInt(classGroupId);
  const yearIdNum = parseInt(academicYearId);

  if (
    isNaN(userId) ||
    isNaN(gradeIdNum) ||
    isNaN(classGroupIdNum) ||
    isNaN(yearIdNum)
  ) {
    throw new ValidationError(
      "Invalid user ID, grade ID, class group ID, or academic year ID",
    );
  }

  logger.info("Removing grade from user", {
    userId,
    gradeId: gradeIdNum,
    classGroupId: classGroupIdNum,
    academicYearId: yearIdNum,
    removedBy: req.user?.userId,
  });

  // Check if assignment exists
  const existingAssignment = await db
    .select()
    .from(UserGrade)
    .where(
      and(
        eq(UserGrade.user_id, userId),
        eq(UserGrade.grade_id, gradeIdNum),
        eq(UserGrade.class_group_id, classGroupIdNum),
        eq(UserGrade.academic_year_id, yearIdNum),
      ),
    )
    .limit(1);

  if (existingAssignment.length === 0) {
    throw new NotFoundError(
      "User is not class teacher of this class group for the selected academic year",
    );
  }

  // Remove assignment
  await db
    .delete(UserGrade)
    .where(
      and(
        eq(UserGrade.user_id, userId),
        eq(UserGrade.grade_id, gradeIdNum),
        eq(UserGrade.class_group_id, classGroupIdNum),
        eq(UserGrade.academic_year_id, yearIdNum),
      ),
    );

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      userId,
      "GRADE_REMOVE_FROM_TEACHER",
      `Grade removed from teacher`,
      "UserGrade",
      gradeIdNum,
      {
        teacher_id: userId,
        grade_id: gradeIdNum,
        class_group_id: classGroupIdNum,
        academic_year_id: yearIdNum,
      },
      req.user.userId,
    );
  }

  successResponse(res, "Grade removed from user successfully");
});

// All class-teacher grade assignments across every user, optionally scoped
// to one academic year -- powers the admin "Class Teachers" overview tab,
// which previously had no cross-user view (only per-user, via each user's
// profile).
export const getAllGradeAssignments = asyncHandler(
  async (req: any, res: any) => {
    const { academic_year_id } = req.query;

    let whereCondition: SQL<unknown> | undefined;
    if (academic_year_id) {
      const yearIdNum = Number(academic_year_id);
      if (isNaN(yearIdNum)) {
        throw new ValidationError("Invalid academic year ID");
      }
      whereCondition = eq(UserGrade.academic_year_id, yearIdNum);
    }

    const assignments = await db
      .select({
        grade_assignment_id: sql`CONCAT(${UserGrade.user_id}, '-', ${UserGrade.grade_id}, '-', ${UserGrade.class_group_id}, '-', ${UserGrade.academic_year_id})`,
        user_id: UserGrade.user_id,
        user_name: sql`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
        username: User.username,
        email: User.email,
        grade_id: UserGrade.grade_id,
        grade_name: Grade.name,
        class_group_id: UserGrade.class_group_id,
        class_group_name: ClassGroup.name,
        program_name: Program.name,
        academic_year_id: UserGrade.academic_year_id,
        academic_year_name: AcademicYear.name,
        academic_year_is_current: AcademicYear.is_current,
        assigned_at: UserGrade.assigned_at,
      })
      .from(UserGrade)
      .innerJoin(User, eq(UserGrade.user_id, User.user_id))
      .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .innerJoin(Grade, eq(UserGrade.grade_id, Grade.grade_id))
      .innerJoin(
        ClassGroup,
        eq(UserGrade.class_group_id, ClassGroup.class_group_id),
      )
      .innerJoin(Program, eq(Grade.program_id, Program.program_id))
      .innerJoin(
        AcademicYear,
        eq(UserGrade.academic_year_id, AcademicYear.academic_year_id),
      )
      .where(whereCondition)
      .orderBy(
        desc(AcademicYear.academic_year_id),
        UserProfile.first_name,
        UserProfile.last_name,
      );

    successResponse(
      res,
      "Grade assignments retrieved successfully",
      assignments,
    );
  },
);

// Edit an existing class-teacher assignment in place. Every column of
// UserGrade is part of its primary key, so there is nothing to UPDATE --
// this is a delete of the old row plus an insert of the new one, wrapped in
// a transaction so a rejected insert cannot leave the assignment deleted.
export const updateGradeAssignment = asyncHandler(
  async (req: any, res: any) => {
    const { id, gradeId, classGroupId, academicYearId } = req.params;
    const currentUserId = parseInt(id);
    const currentGradeId = parseInt(gradeId);
    const currentClassGroupId = parseInt(classGroupId);
    const currentYearId = parseInt(academicYearId);

    if (
      isNaN(currentUserId) ||
      isNaN(currentGradeId) ||
      isNaN(currentClassGroupId) ||
      isNaN(currentYearId)
    ) {
      throw new ValidationError(
        "Invalid user ID, grade ID, class group ID, or academic year ID",
      );
    }

    // Each field falls back to its current value, so the client may send only
    // what actually changed.
    const nextUserId =
      req.body.user_id !== undefined
        ? parseInt(req.body.user_id)
        : currentUserId;
    const nextGradeId =
      req.body.grade_id !== undefined
        ? parseInt(req.body.grade_id)
        : currentGradeId;
    const nextClassGroupId =
      req.body.class_group_id !== undefined
        ? parseInt(req.body.class_group_id)
        : currentClassGroupId;
    const nextYearId =
      req.body.academic_year_id !== undefined
        ? parseInt(req.body.academic_year_id)
        : currentYearId;

    if (
      isNaN(nextUserId) ||
      isNaN(nextGradeId) ||
      isNaN(nextClassGroupId) ||
      isNaN(nextYearId)
    ) {
      throw new ValidationError(
        "Invalid user, grade, class group, or academic year",
      );
    }

    logger.info("Updating class teacher assignment", {
      from: {
        userId: currentUserId,
        gradeId: currentGradeId,
        classGroupId: currentClassGroupId,
        academicYearId: currentYearId,
      },
      to: {
        userId: nextUserId,
        gradeId: nextGradeId,
        classGroupId: nextClassGroupId,
        academicYearId: nextYearId,
      },
      updatedBy: req.user?.userId,
    });

    const existingAssignment = await db
      .select()
      .from(UserGrade)
      .where(
        and(
          eq(UserGrade.user_id, currentUserId),
          eq(UserGrade.grade_id, currentGradeId),
          eq(UserGrade.class_group_id, currentClassGroupId),
          eq(UserGrade.academic_year_id, currentYearId),
        ),
      )
      .limit(1);

    if (existingAssignment.length === 0) {
      throw new NotFoundError("Class teacher assignment not found");
    }

    const unchanged =
      nextUserId === currentUserId &&
      nextGradeId === currentGradeId &&
      nextClassGroupId === currentClassGroupId &&
      nextYearId === currentYearId;

    if (unchanged) {
      successResponse(res, "Class teacher assignment updated successfully");
      return;
    }

    const [nextUser, nextGrade, nextYear] = await Promise.all([
      db
        .select({ user_id: User.user_id })
        .from(User)
        .where(eq(User.user_id, nextUserId))
        .limit(1),
      db
        .select({ grade_id: Grade.grade_id })
        .from(Grade)
        .where(eq(Grade.grade_id, nextGradeId))
        .limit(1),
      db
        .select({ academic_year_id: AcademicYear.academic_year_id })
        .from(AcademicYear)
        .where(eq(AcademicYear.academic_year_id, nextYearId))
        .limit(1),
    ]);

    if (nextUser.length === 0) {
      throw new NotFoundError("User not found");
    }
    if (nextGrade.length === 0) {
      throw new NotFoundError("Grade not found");
    }
    if (nextYear.length === 0) {
      throw new NotFoundError("Academic year not found");
    }

    await assertClassGroupBelongsToGrade(nextClassGroupId, nextGradeId);

    const conflicting = await db
      .select()
      .from(UserGrade)
      .where(
        and(
          eq(UserGrade.user_id, nextUserId),
          eq(UserGrade.grade_id, nextGradeId),
          eq(UserGrade.class_group_id, nextClassGroupId),
          eq(UserGrade.academic_year_id, nextYearId),
        ),
      )
      .limit(1);

    if (conflicting.length > 0) {
      throw new ConflictError(
        "That user is already class teacher of this class group for the selected academic year",
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(UserGrade)
        .where(
          and(
            eq(UserGrade.user_id, currentUserId),
            eq(UserGrade.grade_id, currentGradeId),
            eq(UserGrade.class_group_id, currentClassGroupId),
            eq(UserGrade.academic_year_id, currentYearId),
          ),
        );

      await tx.insert(UserGrade).values({
        user_id: nextUserId,
        grade_id: nextGradeId,
        class_group_id: nextClassGroupId,
        academic_year_id: nextYearId,
        // Preserve the original assignment timestamp -- editing which class
        // group a teacher leads is not a re-assignment.
        assigned_at: existingAssignment[0].assigned_at ?? undefined,
      });
    });

    if (req.user?.userId) {
      await recordActivity(
        nextUserId,
        "GRADE_ASSIGNMENT_UPDATE",
        `Class teacher assignment updated`,
        "UserGrade",
        nextGradeId,
        {
          previous: {
            teacher_id: currentUserId,
            grade_id: currentGradeId,
            class_group_id: currentClassGroupId,
            academic_year_id: currentYearId,
          },
          updated: {
            teacher_id: nextUserId,
            grade_id: nextGradeId,
            class_group_id: nextClassGroupId,
            academic_year_id: nextYearId,
          },
        },
        req.user.userId,
      );
    }

    successResponse(res, "Class teacher assignment updated successfully");
  },
);

// Copy every class-teacher grade assignment from one academic year into
// another. Like UserProgramLead, UserGrade points directly at Grade and
// ClassGroup (not at per-year rows), so this is a straight
// (user_id, grade_id, class_group_id) copy with no re-matching step needed
// -- skip triples that already exist in the target year.
export const copyGradeAssignments = asyncHandler(async (req: any, res: any) => {
  const { source_academic_year_id, target_academic_year_id } = req.body;

  if (!source_academic_year_id || !target_academic_year_id) {
    throw new ValidationError(
      "Source and target academic year IDs are required",
    );
  }

  const sourceYearId = parseInt(source_academic_year_id);
  const targetYearId = parseInt(target_academic_year_id);

  if (isNaN(sourceYearId) || isNaN(targetYearId)) {
    throw new ValidationError("Invalid academic year ID");
  }

  if (sourceYearId === targetYearId) {
    throw new ValidationError(
      "Source and target academic years must be different",
    );
  }

  const [sourceYear, targetYear] = await Promise.all([
    db
      .select()
      .from(AcademicYear)
      .where(eq(AcademicYear.academic_year_id, sourceYearId))
      .limit(1),
    db
      .select()
      .from(AcademicYear)
      .where(eq(AcademicYear.academic_year_id, targetYearId))
      .limit(1),
  ]);

  if (sourceYear.length === 0 || targetYear.length === 0) {
    throw new NotFoundError("Academic year not found");
  }

  const [sourceAssignments, targetAssignments] = await Promise.all([
    db
      .select({
        user_id: UserGrade.user_id,
        grade_id: UserGrade.grade_id,
        class_group_id: UserGrade.class_group_id,
      })
      .from(UserGrade)
      .where(eq(UserGrade.academic_year_id, sourceYearId)),
    db
      .select({
        user_id: UserGrade.user_id,
        grade_id: UserGrade.grade_id,
        class_group_id: UserGrade.class_group_id,
      })
      .from(UserGrade)
      .where(eq(UserGrade.academic_year_id, targetYearId)),
  ]);

  if (sourceAssignments.length === 0) {
    throw new ValidationError(
      `${sourceYear[0].name} has no grade assignments to copy`,
    );
  }

  const existingKeys = new Set(
    targetAssignments.map(
      (a) => `${a.user_id}::${a.grade_id}::${a.class_group_id}`,
    ),
  );

  const toInsert = sourceAssignments.filter(
    (a) =>
      !existingKeys.has(`${a.user_id}::${a.grade_id}::${a.class_group_id}`),
  );

  if (toInsert.length > 0) {
    await db.insert(UserGrade).values(
      toInsert.map((a) => ({
        user_id: a.user_id,
        grade_id: a.grade_id,
        class_group_id: a.class_group_id,
        academic_year_id: targetYearId,
      })),
    );
  }

  logger.info("Grade assignments copied", {
    sourceYearId,
    targetYearId,
    copied: toInsert.length,
    skipped: sourceAssignments.length - toInsert.length,
  });

  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "GRADE_ASSIGNMENTS_COPY",
      `Copied ${toInsert.length} grade assignment(s) from ${sourceYear[0].name} to ${targetYear[0].name}`,
      "UserGrade",
      undefined,
      { sourceYearId, targetYearId, copied: toInsert.length },
      req.user.userId,
    );
  }

  successResponse(res, "Grade assignments copied successfully", {
    copied: toInsert.length,
    skipped: sourceAssignments.length - toInsert.length,
    total: sourceAssignments.length,
  });
});

// Get grades assigned to a user
export const getUserGrades = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const userId = parseInt(id);

  if (isNaN(userId)) {
    throw new ValidationError("Invalid user ID");
  }

  logger.info("Fetching grades for user", {
    userId,
    requestedBy: req.user?.userId,
  });

  // Check if user exists
  const user = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

  if (user.length === 0) {
    throw new NotFoundError("User not found");
  }

  // Get assigned grades
  const grades = await db
    .select({
      grade_id: Grade.grade_id,
      name: Grade.name,
      level_order: Grade.level_order,
      program_id: Grade.program_id,
      program_name: Program.name,
      class_group_id: UserGrade.class_group_id,
      class_group_name: ClassGroup.name,
      academic_year_id: UserGrade.academic_year_id,
      academic_year_name: AcademicYear.name,
      academic_year_is_current: AcademicYear.is_current,
      assigned_at: UserGrade.assigned_at,
    })
    .from(UserGrade)
    .innerJoin(Grade, eq(UserGrade.grade_id, Grade.grade_id))
    .innerJoin(
      ClassGroup,
      eq(UserGrade.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(Program, eq(Grade.program_id, Program.program_id))
    .innerJoin(
      AcademicYear,
      eq(UserGrade.academic_year_id, AcademicYear.academic_year_id),
    )
    .where(eq(UserGrade.user_id, userId))
    .orderBy(
      desc(AcademicYear.academic_year_id),
      Grade.level_order,
      ClassGroup.name,
    );

  successResponse(res, "User grades retrieved successfully", grades);
});

// Get users by grade (for class teachers to view users in their grades)
export const getUsersByGrade = asyncHandler(async (req: any, res: any) => {
  const { gradeId } = req.params;
  const gradeIdNum = parseInt(gradeId);
  const { page = 1, limit = 10, search } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;
  const userId = req.user?.userId;

  if (isNaN(gradeIdNum)) {
    throw new ValidationError("Invalid grade ID");
  }

  logger.info("Fetching users by grade", {
    gradeId: gradeIdNum,
    page: pageNum,
    limit: limitNum,
    search,
    requestedBy: userId,
  });

  // Check if grade exists
  const grade = await db
    .select()
    .from(Grade)
    .where(eq(Grade.grade_id, gradeIdNum))
    .limit(1);

  if (grade.length === 0) {
    throw new NotFoundError("Grade not found");
  }

  // Get students in this grade (via class groups)
  const students = await db
    .select({
      user_id: User.user_id,
      username: User.username,
      email: User.email,
      phone_number: User.phone_number,
      status: User.status,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      user_type: UserProfile.user_type,
      role_name: Role.name,
    })
    .from(User)
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .innerJoin(StudentClassGroup, eq(User.user_id, StudentClassGroup.user_id))
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(UserRole, eq(User.user_id, UserRole.user_id))
    .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
    .where(
      and(
        sql`${ClassGroup.grade_id} = ${gradeIdNum}`,
        eq(StudentClassGroup.status, "ACTIVE"),
      ),
    );

  // Get teachers assigned to subjects in this grade (via teacher subject assignments)
  const teachers = await db
    .select({
      user_id: User.user_id,
      username: User.username,
      email: User.email,
      phone_number: User.phone_number,
      status: User.status,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      user_type: UserProfile.user_type,
      role_name: Role.name,
    })
    .from(User)
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .innerJoin(
      TeacherSubjectAssignment,
      eq(User.user_id, TeacherSubjectAssignment.user_id),
    )
    .innerJoin(
      ClassGroup,
      eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(UserRole, eq(User.user_id, UserRole.user_id))
    .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
    .where(sql`${ClassGroup.grade_id} = ${gradeIdNum}`);

  // Combine students and teachers, remove duplicates
  const allUsers = [...students, ...teachers];
  const users = allUsers.filter(
    (user, index, self) =>
      index === self.findIndex((u) => u.user_id === user.user_id),
  );

  // Apply search filter
  let filteredUsers = users;
  if (search) {
    const searchLower = search.toLowerCase();
    filteredUsers = users.filter(
      (user) =>
        user.username?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower) ||
        user.first_name?.toLowerCase().includes(searchLower) ||
        user.last_name?.toLowerCase().includes(searchLower) ||
        user.phone_number?.toLowerCase().includes(searchLower) ||
        user.role_name?.toLowerCase().includes(searchLower),
    );
  }

  // Apply pagination
  const totalCount = filteredUsers.length;
  const paginatedUsers = filteredUsers.slice(offset, offset + limitNum);

  const totalPages = Math.ceil(totalCount / limitNum);
  res.setHeader("X-Total-Count", totalCount.toString());
  res.setHeader("X-Total-Pages", totalPages.toString());
  res.setHeader("X-Current-Page", pageNum.toString());
  res.setHeader("X-Per-Page", limitNum.toString());

  successResponse(res, "Users retrieved successfully", paginatedUsers);
});

// Get subjects by grade (for class teachers to view subjects in their grades)
export const getSubjectsByGrade = asyncHandler(async (req: any, res: any) => {
  const { gradeId } = req.params;
  const gradeIdNum = parseInt(gradeId);
  const { page = 1, limit = 10, search } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;
  const userId = req.user?.userId;

  if (isNaN(gradeIdNum)) {
    throw new ValidationError("Invalid grade ID");
  }

  logger.info("Fetching subjects by grade", {
    gradeId: gradeIdNum,
    page: pageNum,
    limit: limitNum,
    search,
    requestedBy: userId,
  });

  // Check if grade exists
  const grade = await db
    .select()
    .from(Grade)
    .where(eq(Grade.grade_id, gradeIdNum))
    .limit(1);

  if (grade.length === 0) {
    throw new NotFoundError("Grade not found");
  }

  // Get subjects with their assigned teachers in this grade
  const subjectsWithTeachers = await db
    .select({
      subject_id: Subject.subject_id,
      code: Subject.code,
      name: Subject.name,
      description: Subject.description,
      status: Subject.status,
      teacher_id: User.user_id,
      teacher_username: User.username,
      teacher_first_name: UserProfile.first_name,
      teacher_last_name: UserProfile.last_name,
    })
    .from(Subject)
    .innerJoin(
      TeacherSubjectAssignment,
      eq(Subject.subject_id, TeacherSubjectAssignment.subject_id),
    )
    .innerJoin(
      ClassGroup,
      eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
    )
    .leftJoin(User, eq(TeacherSubjectAssignment.user_id, User.user_id))
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(sql`${ClassGroup.grade_id} = ${gradeIdNum}`);

  // Group subjects by subject_id and collect teachers
  const subjectMap = new Map();

  subjectsWithTeachers.forEach((row) => {
    const subjectId = row.subject_id;
    if (!subjectMap.has(subjectId)) {
      subjectMap.set(subjectId, {
        subject_id: row.subject_id,
        code: row.code,
        name: row.name,
        description: row.description,
        status: row.status,
        teachers: [],
      });
    }

    // One row per (subject, class group, year) assignment, so the same
    // teacher recurs -- dedupe by user_id or the UI renders their chip once
    // per assignment.
    if (
      row.teacher_id &&
      !subjectMap
        .get(subjectId)
        .teachers.some((t: any) => t.user_id === row.teacher_id)
    ) {
      subjectMap.get(subjectId).teachers.push({
        user_id: row.teacher_id,
        username: row.teacher_username,
        first_name: row.teacher_first_name,
        last_name: row.teacher_last_name,
      });
    }
  });

  // Also get subjects enrolled by students (that might not have teachers assigned yet)
  const studentOnlySubjects = await db
    .select({
      subject_id: Subject.subject_id,
      code: Subject.code,
      name: Subject.name,
      description: Subject.description,
      status: Subject.status,
    })
    .from(Subject)
    .innerJoin(
      StudentSubjectEnrollment,
      eq(Subject.subject_id, StudentSubjectEnrollment.subject_id),
    )
    .innerJoin(
      StudentClassGroup,
      eq(StudentSubjectEnrollment.user_id, StudentClassGroup.user_id),
    )
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .where(
      and(
        sql`${ClassGroup.grade_id} = ${gradeIdNum}`,
        eq(StudentClassGroup.status, "ACTIVE"),
      ),
    );

  // Add student-only subjects that don't have teachers
  studentOnlySubjects.forEach((subject) => {
    if (!subjectMap.has(subject.subject_id)) {
      subjectMap.set(subject.subject_id, {
        ...subject,
        teachers: [],
      });
    }
  });

  const subjects = Array.from(subjectMap.values());

  // Apply search filter
  let filteredSubjects = subjects;
  if (search) {
    const searchLower = search.toLowerCase();
    filteredSubjects = subjects.filter(
      (subject) =>
        subject.code?.toLowerCase().includes(searchLower) ||
        subject.name?.toLowerCase().includes(searchLower) ||
        subject.description?.toLowerCase().includes(searchLower),
    );
  }

  // Apply pagination
  const totalCount = filteredSubjects.length;
  const paginatedSubjects = filteredSubjects.slice(offset, offset + limitNum);

  const totalPages = Math.ceil(totalCount / limitNum);
  res.setHeader("X-Total-Count", totalCount.toString());
  res.setHeader("X-Total-Pages", totalPages.toString());
  res.setHeader("X-Current-Page", pageNum.toString());
  res.setHeader("X-Per-Page", limitNum.toString());

  successResponse(res, "Subjects retrieved successfully", paginatedSubjects);
});
