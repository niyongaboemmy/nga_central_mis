import { db } from "../db";
import { eq } from "drizzle-orm";
import { User, UserProfile } from "../db/schema";
import { sanitizeString, validateEmail } from "../utils/sanitization";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../errors/CustomError";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import logger from "../utils/logger";

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

  successResponse(res, "User profile retrieved successfully", {
    user: user[0],
    profile: profile[0] || null,
  });
});

export const getUsers = asyncHandler(async (req: any, res: any) => {
  logger.info("Fetching all users", { userId: req.user?.userId });

  const users = await db.select().from(User);

  successResponse(res, "Users retrieved successfully", users);
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

  const profile = await db
    .select()
    .from(UserProfile)
    .where(eq(UserProfile.user_id, userId))
    .limit(1);

  successResponse(res, "User retrieved successfully", {
    user: user[0],
    profile: profile[0] || null,
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
