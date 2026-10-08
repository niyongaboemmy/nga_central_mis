import { trackAuth } from "../services/activity/authEvents";
import { avatarUrls, withAvatar } from "../services/avatar/urls";
import { activitySourceClients } from "../services/activity/apps";
import jwt from "jsonwebtoken";
import { getPublicSystems } from "../utils/publicSystems";
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
import { getEffectivePermissions } from "../utils/auth";
import { verifyClientSecret } from "../utils/ssoClientSecret";
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

  if (response_type && response_type !== "code") {
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
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minute expiration

  await db.insert(SSOCode).values({
    code,
    user_id: userId,
    system_id: client[0].system_id,
    expires_at: expiresAt,
  });

  logger.info(
    `Generated SSO auth code for user ${userId} and client ${client_id}`,
  );

  // "Opened Task Mentor / Tendo / Tupo" -- counted even before an app is instrumented.
  // Only a browser opening an app counts: servers that pre-generate codes for a user
  // (HTTP libraries such as axios) are not launches, and would stamp the server's own
  // IP and place on the person.
  if (!isServerToServer(req)) {
    const launchedApp = activitySourceClients().get(String(client_id));
    trackAuth(req, { kind: "app_launch", outcome: "success", userId, app: launchedApp ?? null, method: String(client_id).slice(0, 20) });
  }

  successResponse(res, "Authorization code generated", { code, state });
});

/** A request made by a program rather than a person's browser (no UA, or an HTTP library's). */
export const isServerToServer = (req: any): boolean => {
  const ua = String(req.headers?.["user-agent"] ?? "").trim();
  return !ua || /^(axios|node-fetch|undici|got|node|python-requests|python-urllib|aiohttp|curl|wget|go-http-client|okhttp|java|apache-httpclient|ruby|php|postmanruntime|insomnia)\b/i.test(ua);
};

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

  // Verify client (via System table). The secret is compared in constant
  // time and may be stored either as a bcrypt hash or (legacy) in plaintext
  // -- see utils/ssoClientSecret.ts.
  const client = await db
    .select()
    .from(System)
    .where(eq(System.client_id, client_id))
    .limit(1);

  if (
    client.length === 0 ||
    client[0].status !== "ACTIVE" ||
    !(await verifyClientSecret(client_secret, client[0].client_secret))
  ) {
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

  // A user disabled (or deleted) between /sso/authorize and this exchange
  // must not walk away with a fresh 24h token.
  if (user.length === 0 || user[0].status !== "ACTIVE") {
    throw new AuthenticationError("User account is not active");
  }

  const permissions = await getEffectivePermissions(userId);

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
  // No client_secret -- see utils/publicSystems.ts.
  const systems = await getPublicSystems();

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
      // See middleware/auth.ts -- lets an MIS logout revoke this token (and
      // therefore any spoke app session built on it) before its natural
      // 24h expiry.
      tokenVersion: user[0].token_version || 0,
    },
    config.jwtSecret,
    // iss/aud identify who minted the token and which client it was minted
    // for. `authenticate` does not pin an audience, because every spoke app
    // calls MIS APIs with this same token.
    { expiresIn: "24h", issuer: "nga-mis", audience: client_id },
  );

  logger.info(`SSO Token generated for user ${userId} via client ${client_id}`);

  // Apps drop a cached access snapshot at sign-in when this moved (fail-safe:
  // null on a server without migration 090).
  let accessVersion: number | null = null;
  try {
    const { currentAccessVersion } = await import("../services/access/compile");
    accessVersion = await currentAccessVersion(userId);
  } catch {
    accessVersion = null;
  }

  successResponse(res, "Token generated successfully", {
    token,
    user: withAvatar(user[0]),
    avatar: avatarUrls(user[0].user_id, user[0].avatar_version),
    permissions,
    access_version: accessVersion,
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
