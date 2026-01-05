import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { User, AuthCredential, UserProfile } from "../db/schema";
import { getUserPermissions } from "../utils/auth";
import { sanitizeString, validateEmail } from "../utils/sanitization";
import { sendOTPByEmail, verifyOTP as verifyOTPUtil } from "../utils/otp";
import { AuthenticationError, ValidationError } from "../errors/CustomError";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import config from "../config";
import logger from "../utils/logger";

export const login = asyncHandler(async (req: any, res: any) => {
  const { username, password } = req.body;

  // Sanitize inputs
  const sanitizedUsername = sanitizeString(username);
  const sanitizedPassword = password; // Don't sanitize password as it might contain special chars

  // Validate inputs
  if (!sanitizedUsername || !sanitizedPassword) {
    throw new ValidationError("Username and password are required");
  }

  logger.info(`Login attempt for user: ${sanitizedUsername}`);

  // Find user
  const user = await db
    .select()
    .from(User)
    .where(eq(User.username, sanitizedUsername))
    .limit(1);

  if (user.length === 0) {
    logger.warn(`Failed login attempt: user ${sanitizedUsername} not found`);
    throw new AuthenticationError("Invalid credentials");
  }

  // Check if user is active
  if (user[0].status !== "ACTIVE") {
    logger.warn(`Login attempt for inactive user: ${sanitizedUsername}`);
    throw new AuthenticationError("Account is not active");
  }

  // Find auth credentials
  const auth = await db
    .select()
    .from(AuthCredential)
    .where(eq(AuthCredential.user_id, user[0].user_id))
    .limit(1);

  if (auth.length === 0) {
    logger.error(`No auth credentials found for user: ${sanitizedUsername}`);
    throw new AuthenticationError("Invalid credentials");
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(
    sanitizedPassword,
    auth[0].password_hash
  );
  if (!isValidPassword) {
    logger.warn(
      `Failed login attempt: invalid password for user ${sanitizedUsername}`
    );
    throw new AuthenticationError("Invalid credentials");
  }

  // Send OTP for 2FA
  await sendOTPByEmail(user[0].user_id, user[0].email, "LOGIN_2FA");

  // Generate temporary session token (short-lived)
  const tempToken = jwt.sign(
    { userId: user[0].user_id, username: user[0].username, requiresOTP: true },
    config.jwtSecret,
    { expiresIn: "5m" } // 5 minutes for OTP verification
  );

  logger.info(`Password verified, OTP sent for user: ${sanitizedUsername}`);

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
