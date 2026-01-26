import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  User,
  AuthCredential,
  UserProfile,
  OTP,
  Program,
  UserProgramLead,
  UserRole,
  Role,
  Permission,
  RolePermission,
  AcademicYear,
  AcademicTerm,
  Grade,
  System,
} from "../db/schema";
import { getUserPermissions } from "../utils/auth";
import { sanitizeString, validateEmail } from "../utils/sanitization";
import { sendOTPByEmail, verifyOTP as verifyOTPUtil } from "../utils/otp";
import {
  AuthenticationError,
  ValidationError,
  NotFoundError,
} from "../errors/CustomError";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import config from "../config";
import logger from "../utils/logger";
import { recordActivity } from "../utils/activityLogger";

export const login = asyncHandler(async (req: any, res: any) => {
  const { username, password } = req.body;

  // Sanitize inputs
  const sanitizedInput = sanitizeString(username);
  const sanitizedPassword = password;

  // Validate inputs
  if (!sanitizedInput || !sanitizedPassword) {
    throw new ValidationError("Username/email and password are required");
  }

  logger.info(`Login attempt for: ${sanitizedInput}`);

  // Determine if input is email or username
  const isEmail = validateEmail(sanitizedInput);

  let user;

  if (isEmail) {
    // Find user by email
    user = await db
      .select()
      .from(User)
      .where(eq(User.email, sanitizedInput))
      .limit(1);
  } else {
    // Find user by username
    user = await db
      .select()
      .from(User)
      .where(eq(User.username, sanitizedInput))
      .limit(1);
  }

  if (user.length === 0) {
    logger.warn(`Failed login attempt: user ${sanitizedInput} not found`);
    throw new AuthenticationError("Invalid credentials");
  }

  // Check if user is active
  if (user[0].status !== "ACTIVE") {
    logger.warn(`Login attempt for inactive user: ${sanitizedInput}`);
    throw new AuthenticationError("Account is not active");
  }

  // Find auth credentials
  const auth = await db
    .select()
    .from(AuthCredential)
    .where(eq(AuthCredential.user_id, user[0].user_id))
    .limit(1);

  if (auth.length === 0) {
    logger.error(`No auth credentials found for user: ${sanitizedInput}`);
    throw new AuthenticationError("Invalid credentials");
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(
    sanitizedPassword,
    auth[0].password_hash,
  );
  if (!isValidPassword) {
    logger.warn(
      `Failed login attempt: invalid password for user ${sanitizedInput}`,
    );
    throw new AuthenticationError("Invalid credentials");
  }

  // Send OTP for 2FA
  await sendOTPByEmail(user[0].user_id, user[0].email, "LOGIN_2FA");

  // Generate temporary session token (short-lived)
  const tempToken = jwt.sign(
    { userId: user[0].user_id, username: user[0].username, requiresOTP: true },
    config.jwtSecret,
    { expiresIn: "5m" },
  );

  logger.info(`Password verified, OTP sent for user: ${user[0].username}`);

  successResponse(
    res,
    "Password verified. Please check your email for the verification code.",
    {
      tempToken,
      requiresOTP: true,
    },
  );
});

export const verifyOTP = asyncHandler(async (req: any, res: any) => {
  const { otp } = req.body;
  const userId = req.user.userId;

  if (!otp) {
    throw new ValidationError("OTP is required");
  }

  // Verify OTP
  const isValidOTP = await verifyOTPUtil(userId, otp, "LOGIN_2FA");
  if (!isValidOTP) {
    throw new AuthenticationError("Invalid or expired OTP");
  }

  // Get user permissions
  const permissions = await getUserPermissions(userId);

  // Get user data
  const user = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

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

  // Get assigned programs for program leads
  const assignedPrograms = await db
    .select({
      program_id: Program.program_id,
      name: Program.name,
      description: Program.description,
    })
    .from(UserProgramLead)
    .innerJoin(Program, eq(UserProgramLead.program_id, Program.program_id))
    .where(eq(UserProgramLead.user_id, userId));

  // Get user roles with permissions
  const userRoleIds = await db
    .select({ role_id: UserRole.role_id })
    .from(UserRole)
    .where(eq(UserRole.user_id, userId));

  const roles = [];
  for (const { role_id } of userRoleIds) {
    const role = await db
      .select({
        role_id: Role.role_id,
        name: Role.name,
        description: Role.description,
        status: Role.status,
      })
      .from(Role)
      .where(eq(Role.role_id, role_id))
      .limit(1);

    if (role.length > 0) {
      const permissions = await db
        .select({
          perm_id: Permission.perm_id,
          name: Permission.name,
          description: Permission.description,
          status: Permission.status,
        })
        .from(RolePermission)
        .innerJoin(Permission, eq(RolePermission.perm_id, Permission.perm_id))
        .where(eq(RolePermission.role_id, role_id));

      roles.push({
        ...role[0],
        permissions,
      });
    }
  }

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

  // Generate final JWT token
  const token = jwt.sign(
    {
      userId,
      username: user[0].username,
      role_id: roles[0]?.role_id || "",
      role_name: roles[0]?.name || "",
      academicYears,
      currentAcademicYear: currentAcademicYear[0] || null,
      currentAcademicTerms,
      allPrograms,
      allGrades,
      systems,
    },
    config.jwtSecret,
    { expiresIn: "24h" },
  );

  // Set HTTP-only cookie
  res.cookie("nga_auth_token", token, {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "lax",
    domain: config.cookieDomain,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  logger.info(`OTP verified, login completed for user: ${user[0].username}`);

  // Record activity
  await recordActivity(
    userId,
    "LOGIN_SUCCESS",
    "User successfully logged in via 2FA",
    "User",
    userId,
    { method: "OTP_EMAIL", timestamp: new Date().toISOString() },
    userId,
  );

  successResponse(res, "Login successful", {
    token,
    user: user[0],
    profile: profile[0] || null,
    permissions,
    assignedPrograms,
    roles,
    forcePasswordChange: auth[0]?.force_password_change === 1,
    academicYears,
    currentAcademicYear: currentAcademicYear[0] || null,
    currentAcademicTerms,
    allPrograms,
    allGrades,
  });
});

export const getSession = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;

  // Get user data
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

  const permissions = await getUserPermissions(userId);

  // Get user roles with permissions
  const userRoleIds = await db
    .select({ role_id: UserRole.role_id })
    .from(UserRole)
    .where(eq(UserRole.user_id, userId));

  const roles = [];
  for (const { role_id } of userRoleIds) {
    const role = await db
      .select({
        role_id: Role.role_id,
        name: Role.name,
        description: Role.description,
        status: Role.status,
      })
      .from(Role)
      .where(eq(Role.role_id, role_id))
      .limit(1);

    if (role.length > 0) {
      const perms = await db
        .select({
          perm_id: Permission.perm_id,
          name: Permission.name,
          description: Permission.description,
          status: Permission.status,
        })
        .from(RolePermission)
        .innerJoin(Permission, eq(RolePermission.perm_id, Permission.perm_id))
        .where(eq(RolePermission.role_id, role_id));

      roles.push({
        ...role[0],
        permissions: perms,
      });
    }
  }

  successResponse(res, "Session retrieved", {
    user: user[0],
    profile: profile[0] || null,
    permissions,
    roles,
  });
});

export const logout = asyncHandler(async (req: any, res: any) => {
  res.clearCookie("nga_auth_token", {
    domain: config.cookieDomain,
    path: "/",
  });
  successResponse(res, "Logged out successfully");
});

export const forgotPassword = asyncHandler(async (req: any, res: any) => {
  const { email } = req.body;

  if (!email) {
    throw new ValidationError("Email is required");
  }

  if (!validateEmail(email)) {
    throw new ValidationError("Invalid email format");
  }

  const sanitizedEmail = sanitizeString(email);

  // Find user by email
  const user = await db
    .select()
    .from(User)
    .where(eq(User.email, sanitizedEmail))
    .limit(1);

  if (user.length === 0) {
    // Don't reveal if user exists or not
    logger.info(
      `Password reset requested for non-existent email: ${sanitizedEmail}`,
    );
    successResponse(
      res,
      "If an account exists with this email, a verification code has been sent.",
    );
    return;
  }

  // Send OTP for password reset
  await sendOTPByEmail(user[0].user_id, user[0].email, "PASSWORD_RESET");

  // Generate temporary token for password reset flow
  const tempToken = jwt.sign(
    {
      userId: user[0].user_id,
      email: user[0].email,
      purpose: "PASSWORD_RESET",
    },
    config.jwtSecret,
    { expiresIn: "10m" },
  );

  logger.info(`Password reset OTP sent for user: ${user[0].username}`);

  successResponse(
    res,
    "If an account exists with this email, a verification code has been sent.",
    {
      tempToken,
      requiresOTP: true,
    },
  );
});

export const verifyResetOTP = asyncHandler(async (req: any, res: any) => {
  const { otp } = req.body;
  const userId = req.user.userId;

  if (!otp) {
    throw new ValidationError("OTP is required");
  }

  // Verify OTP
  const isValidOTP = await verifyOTPUtil(userId, otp, "PASSWORD_RESET");
  if (!isValidOTP) {
    throw new AuthenticationError("Invalid or expired OTP");
  }

  // Generate a new temporary token for password reset completion
  const resetToken = jwt.sign(
    { userId, purpose: "PASSWORD_RESET_CONFIRM" },
    config.jwtSecret,
    { expiresIn: "10m" },
  );

  logger.info(`Password reset OTP verified for userId: ${userId}`);

  successResponse(res, "OTP verified. Please enter your new password.", {
    resetToken,
    requiresNewPassword: true,
  });
});

export const resetPassword = asyncHandler(async (req: any, res: any) => {
  const { newPassword } = req.body;
  const userId = req.user.userId;

  if (!newPassword) {
    throw new ValidationError("New password is required");
  }

  if (newPassword.length < 8) {
    throw new ValidationError("Password must be at least 8 characters long");
  }

  // Hash new password
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  // Check if AuthCredential row exists for the user
  const existingAuth = await db
    .select()
    .from(AuthCredential)
    .where(eq(AuthCredential.user_id, userId))
    .limit(1);

  if (existingAuth.length > 0) {
    // Update existing password
    await db
      .update(AuthCredential)
      .set({ password_hash: passwordHash })
      .where(eq(AuthCredential.user_id, userId));
  } else {
    // Insert new AuthCredential row
    await db.insert(AuthCredential).values({
      user_id: userId,
      password_hash: passwordHash,
    });
  }

  logger.info(`Password reset completed for userId: ${userId}`);

  // Record activity
  await recordActivity(
    userId,
    "PASSWORD_RESET",
    "User successfully reset their password",
    "AuthCredential",
    userId,
    undefined,
    userId,
  );

  successResponse(
    res,
    "Password has been reset successfully. You can now login with your new password.",
  );
});

export const changePassword = asyncHandler(async (req: any, res: any) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.userId;

  if (!newPassword) {
    throw new ValidationError("New password is required");
  }

  if (newPassword.length < 8) {
    throw new ValidationError(
      "New password must be at least 8 characters long",
    );
  }

  // Get current auth credentials
  const auth = await db
    .select()
    .from(AuthCredential)
    .where(eq(AuthCredential.user_id, userId))
    .limit(1);

  if (auth.length === 0) {
    throw new AuthenticationError("Authentication credentials not found");
  }

  // Verify current password if provided (not required for forced changes)
  if (currentPassword) {
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      auth[0].password_hash,
    );
    if (!isValidPassword) {
      throw new AuthenticationError("Current password is incorrect");
    }
  }

  // Hash new password
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  // Update password and reset force_password_change
  await db
    .update(AuthCredential)
    .set({
      password_hash: passwordHash,
      force_password_change: 0,
    })
    .where(eq(AuthCredential.user_id, userId));

  logger.info(`Password changed for userId: ${userId}`);

  // Record activity
  await recordActivity(
    userId,
    "PASSWORD_CHANGE",
    "User successfully changed their password",
    "AuthCredential",
    userId,
    undefined,
    userId,
  );

  successResponse(res, "Password changed successfully");
});
