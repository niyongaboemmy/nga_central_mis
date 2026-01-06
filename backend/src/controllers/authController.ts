import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { User, AuthCredential, UserProfile, OTP } from "../db/schema";
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
    auth[0].password_hash
  );
  if (!isValidPassword) {
    logger.warn(
      `Failed login attempt: invalid password for user ${sanitizedInput}`
    );
    throw new AuthenticationError("Invalid credentials");
  }

  // Send OTP for 2FA
  await sendOTPByEmail(user[0].user_id, user[0].email, "LOGIN_2FA");

  // Generate temporary session token (short-lived)
  const tempToken = jwt.sign(
    { userId: user[0].user_id, username: user[0].username, requiresOTP: true },
    config.jwtSecret,
    { expiresIn: "5m" }
  );

  logger.info(`Password verified, OTP sent for user: ${user[0].username}`);

  successResponse(
    res,
    "Password verified. Please check your email for the verification code.",
    {
      tempToken,
      requiresOTP: true,
    }
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

  // Generate final JWT token
  const token = jwt.sign(
    { userId, username: user[0].username },
    config.jwtSecret,
    { expiresIn: "1h" }
  );

  logger.info(`OTP verified, login completed for user: ${user[0].username}`);

  successResponse(res, "Login successful", {
    token,
    user: user[0],
    profile: profile[0] || null,
    permissions,
  });
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
      `Password reset requested for non-existent email: ${sanitizedEmail}`
    );
    successResponse(
      res,
      "If an account exists with this email, a verification code has been sent."
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
    { expiresIn: "10m" }
  );

  logger.info(`Password reset OTP sent for user: ${user[0].username}`);

  successResponse(
    res,
    "If an account exists with this email, a verification code has been sent.",
    {
      tempToken,
      requiresOTP: true,
    }
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
    { expiresIn: "10m" }
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

  // Update password
  await db
    .update(AuthCredential)
    .set({ password_hash: passwordHash })
    .where(eq(AuthCredential.user_id, userId));

  logger.info(`Password reset completed for userId: ${userId}`);

  successResponse(
    res,
    "Password has been reset successfully. You can now login with your new password."
  );
});
