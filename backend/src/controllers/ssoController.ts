import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import {
  System,
  SSOCode,
  User,
  UserProfile,
  AcademicYear,
  AcademicTerm,
  Program,
  Grade,
} from "../db/schema";
import { getUserPermissions } from "../utils/auth";
import {
  AuthenticationError,
  ValidationError,
  NotFoundError,
} from "../errors/CustomError";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import config from "../config";
import logger from "../utils/logger";

/**
 * Authorize SSO Request
 * Generates an authorization code for a logged-in user
 */
export const authorizeSSO = asyncHandler(async (req: any, res: any) => {
  const { client_id, redirect_uri, response_type, state } = req.query;
  const userId = req.user.userId;

  if (!client_id || !redirect_uri) {
    throw new ValidationError("client_id and redirect_uri are required");
  }

  if (response_type !== "code") {
    throw new ValidationError("Only response_type='code' is supported");
  }

  // Verify SSO client (via System table)
  const client = await db
    .select()
    .from(System)
    .where(eq(System.client_id, client_id))
    .limit(1);

  if (client.length === 0) {
    throw new NotFoundError("SSO System not found");
  }

  if (client[0].status !== "ACTIVE") {
    throw new AuthenticationError("System is disabled");
  }

  // Verify redirect URI
  const normalizedRedirectUri = redirect_uri.replace(/\/$/, "").trim();

  const allowedUris =
    client[0].allowed_redirect_uris
      ?.split(",")
      .map((u: string) => u.replace(/\/$/, "").trim()) || [];
  if (!allowedUris.includes(normalizedRedirectUri)) {
    logger.warn(
      `SSO Reject: ${normalizedRedirectUri} not in [${allowedUris.join(", ")}]`,
    );
    throw new ValidationError(
      `Redirect URI not allowed. Received: ${redirect_uri}`,
    );
  }

  // Generate auth code
  const code = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1 * 60 * 1000); // 1 minute expiration

  await db.insert(SSOCode).values({
    code,
    user_id: userId,
    system_id: client[0].system_id,
    expires_at: expiresAt,
  });

  logger.info(
    `Generated SSO auth code for user ${userId} and client ${client_id}`,
  );

  successResponse(res, "Authorization code generated", { code, state });
});

/**
 * Exchange Authorization Code for JWT
 */
export const getSSOToken = asyncHandler(async (req: any, res: any) => {
  const { code, client_id, client_secret } = req.body;

  if (!code || !client_id || !client_secret) {
    throw new ValidationError(
      "code, client_id, and client_secret are required",
    );
  }

  // Verify client (via System table)
  const client = await db
    .select()
    .from(System)
    .where(
      and(
        eq(System.client_id, client_id),
        eq(System.client_secret, client_secret),
      ),
    )
    .limit(1);

  if (client.length === 0) {
    throw new AuthenticationError("Invalid client credentials");
  }

  // Verify code
  const ssoCode = await db
    .select()
    .from(SSOCode)
    .where(
      and(
        eq(SSOCode.code, code),
        eq(SSOCode.system_id, client[0].system_id),
        eq(SSOCode.is_used, 0),
      ),
    )
    .limit(1);

  if (ssoCode.length === 0) {
    throw new AuthenticationError("Invalid or already used authorization code");
  }

  const currentTime = new Date();
  if (ssoCode[0].expires_at < currentTime) {
    throw new AuthenticationError("Authorization code expired");
  }

  // Mark code as used
  await db
    .update(SSOCode)
    .set({ is_used: 1 })
    .where(eq(SSOCode.code_id, ssoCode[0].code_id));

  const userId = ssoCode[0].user_id;

  // Fetch full user data to generate the same token as regular login
  const user = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);
  const permissions = await getUserPermissions(userId);

  // Get current academic data (copied logic from authController)
  const academicYears = await db
    .select()
    .from(AcademicYear)
    .orderBy(AcademicYear.start_date);
  const currentAcademicYear = await db
    .select()
    .from(AcademicYear)
    .where(eq(AcademicYear.is_current, 1))
    .limit(1);
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

  const allPrograms = await db.select().from(Program).orderBy(Program.name);
  const allGrades = await db.select().from(Grade).orderBy(Grade.level_order);

  // Get all active systems
  const systems = await db
    .select()
    .from(System)
    .where(eq(System.status, "ACTIVE"));

  // Generate JWT
  const token = jwt.sign(
    {
      userId,
      username: user[0].username,
      permissions,
      academicYears,
      currentAcademicYear: currentAcademicYear[0] || null,
      currentAcademicTerms,
      allGrades,
      systems,
      preferred_theme: user[0].preferred_theme,
    },
    config.jwtSecret,
    { expiresIn: "24h" },
  );

  logger.info(`SSO Token generated for user ${userId} via client ${client_id}`);

  successResponse(res, "Token generated successfully", {
    token,
    user: user[0],
    permissions,
  });
});

/**
 * Register a new SSO System (Admin Only)
 */
export const registerSSOClient = asyncHandler(async (req: any, res: any) => {
  const {
    client_id,
    name,
    allowed_redirect_uris,
    description,
    icon_url,
    home_url,
  } = req.body;

  if (!client_id || !name || !allowed_redirect_uris || !icon_url || !home_url) {
    throw new ValidationError(
      "client_id, name, allowed_redirect_uris, icon_url, and home_url are required",
    );
  }

  // Check if system with this client_id already exists
  const existing = await db
    .select()
    .from(System)
    .where(eq(System.client_id, client_id))
    .limit(1);

  if (existing.length > 0) {
    throw new ValidationError("SSO client_id already exists");
  }

  // Generate a random client secret
  const client_secret = crypto.randomBytes(32).toString("hex");

  await db.insert(System).values({
    name,
    description,
    client_id,
    client_secret,
    allowed_redirect_uris,
    icon_url,
    home_url,
    status: "ACTIVE",
  });

  logger.info(`Registered new SSO system: ${name} (${client_id})`);

  successResponse(res, "SSO system registered successfully", {
    client_id,
    client_secret,
    name,
    allowed_redirect_uris,
  });
});
