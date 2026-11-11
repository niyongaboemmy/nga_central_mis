import bcrypt from "bcryptjs";
import { avatarUrls, profileMedia, withAvatar } from "../services/avatar/urls";
import { getPublicSystems } from "../utils/publicSystems";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
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
import { getEffectivePermissions } from "../utils/auth";
import { sanitizeString, validateEmail } from "../utils/sanitization";
import { sendOTPByEmail, verifyOTP as verifyOTPUtil } from "../utils/otp";
import { getUserTokenVersion } from "../middleware/auth";
import {
  AuthenticationError,
  ValidationError,
  NotFoundError,
} from "../errors/CustomError";
import { errorResponse, successResponse } from "../utils/response";
import { HANDOFF_TTL_SECONDS, issueHandoffCode, redeemHandoffCode, validChallenge } from "../utils/desktopHandoff";
import { asyncHandler } from "../middleware/asyncHandler";
import config from "../config";
import logger from "../utils/logger";
import { recordActivity } from "../utils/activityLogger";
import { getAiPolicy } from "../services/ai/policy";
import { routesVersion } from "../services/ai/personal/routes";
import { notifyLogout } from "../services/sso/backchannelLogout";
import { clientIpOf, deviceIdOf, trackAuth } from "../services/activity/authEvents";
import { checkBlocked } from "../services/activity/blocklist";
import { signOutEverywhereLocal } from "../services/activity/control";
import { getCurrentAcademicYearId } from "../utils/academicYear";
import { TenantCtx, runWithTenant } from "../vendor/nga-tenancy";
import { resolveLoginTenants, sendChoose } from "../tenancy/loginResolver";
import { sendRefusal, tenantFromClaims } from "../tenancy/express";
import { tenantBlock, tenantClaims } from "../tenancy/claims";
import { lookupDirectory, queueDirectorySync } from "../tenancy/directory";
import { findTenant, getTenant } from "../tenancy/registry";
import { primaryTenant } from "../tenancy/express";
import { isTenantUsable } from "../vendor/nga-tenancy";
import { MAX_RESET_CANDIDATES, ResetCandidate, isResetTicket, openResetTicket, sealResetTicket } from "../utils/resetTicket";

/**
 * Multi-tenancy: find the school for an unauthenticated sign-in step and run
 * `fn` inside it. Returns false when a response (choose / refusal) was sent.
 * `narrow` (password sign-in) keeps only the schools where the credentials
 * are right, so the picker never lists a school the password doesn't open.
 */
const withSignInTenant = async (
  req: any,
  res: any,
  identifier: string,
  fn: () => Promise<unknown>,
  narrow?: () => Promise<boolean>,
): Promise<void> => {
  const r = await resolveLoginTenants(identifier, req.body?.tenant);
  if (r.kind === "refused") {
    sendRefusal(res, r.refusal);
    return;
  }
  let tenant: TenantCtx;
  if (r.kind === "many") {
    let candidates = r.tenants;
    if (narrow) {
      const matching: TenantCtx[] = [];
      for (const t of r.tenants) if (await runWithTenant(t, narrow).catch(() => false)) matching.push(t);
      if (matching.length > 0) candidates = matching;
      else candidates = [r.tenants[0]]; // fails in there with the usual "Invalid credentials"
    }
    if (candidates.length > 1) {
      sendChoose(res, candidates);
      return;
    }
    tenant = candidates[0];
  } else {
    tenant = r.tenant;
  }
  req.tenant = tenant;
  await runWithTenant(tenant, fn);
};

/** Does this identifier + password open an ACTIVE account in the current tenant? */
const passwordMatches = async (identifier: string, password: string): Promise<boolean> => {
  const [u] = await db
    .select({ user_id: User.user_id, status: User.status })
    .from(User)
    .where(validateEmail(identifier) ? eq(User.email, identifier) : eq(User.username, identifier))
    .limit(1);
  if (!u || u.status !== "ACTIVE") return false;
  const [cred] = await db
    .select({ password_hash: AuthCredential.password_hash })
    .from(AuthCredential)
    .where(eq(AuthCredential.user_id, u.user_id))
    .limit(1);
  return !!cred && (await bcrypt.compare(password, cred.password_hash));
};

export const login = asyncHandler(async (req: any, res: any) => {
  const { username, password } = req.body;

  // Sanitize inputs
  const sanitizedInput = sanitizeString(username);
  const sanitizedPassword = password;

  // Validate inputs
  if (!sanitizedInput || !sanitizedPassword) {
    throw new ValidationError("Username/email and password are required");
  }

  // Which school: explicit `tenant` (slug or tid), else the Account Directory
  // (several schools -> only those the password opens; still several -> choose).
  await withSignInTenant(
    req,
    res,
    sanitizedInput,
    () => loginInTenant(req, res, sanitizedInput, sanitizedPassword),
    () => passwordMatches(sanitizedInput, sanitizedPassword),
  );
});

const loginInTenant = async (req: any, res: any, sanitizedInput: string, sanitizedPassword: string) => {
  logger.info(`Login attempt for: ${sanitizedInput}`);

  // A device or IP an administrator blocked (Usage & Monitoring → Visitors / IP lookup).
  if (await checkBlocked(deviceIdOf(req), clientIpOf(req)).catch(() => null)) {
    trackAuth(req, { kind: "login", outcome: "failure", reason: "blocked", usernameAttempted: sanitizedInput });
    throw new AuthenticationError("Sign-in from this device or network has been blocked. Contact your administrator.");
  }

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
    trackAuth(req, { kind: "login", outcome: "failure", reason: "unknown_user", usernameAttempted: sanitizedInput });
    throw new AuthenticationError("Invalid credentials");
  }

  // Check if user is active
  if (user[0].status !== "ACTIVE") {
    logger.warn(`Login attempt for inactive user: ${sanitizedInput}`);
    trackAuth(req, { kind: "login", outcome: "failure", reason: "inactive", userId: user[0].user_id, usernameAttempted: sanitizedInput });
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
    trackAuth(req, { kind: "login", outcome: "failure", reason: "no_credentials", userId: user[0].user_id, usernameAttempted: sanitizedInput });
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
    trackAuth(req, { kind: "login", outcome: "failure", reason: "bad_password", userId: user[0].user_id, usernameAttempted: sanitizedInput });
    throw new AuthenticationError("Invalid credentials");
  }

  // Send OTP for 2FA
  const otp = await sendOTPByEmail(user[0].user_id, user[0].email, "LOGIN_2FA");
  trackAuth(req, { kind: "otp", outcome: "info", method: "password", userId: user[0].user_id, usernameAttempted: sanitizedInput });

  // Generate temporary session token (short-lived).
  //
  // `tokenVersion` is not optional here: /auth/verify-otp runs through
  // `authenticate`, which rejects any token whose claim does not equal the
  // user's current `token_version`. A missing claim counts as 0, so once a
  // user had logged out even once (logout increments the column) this token
  // was refused and the OTP step failed forever — with the password already
  // accepted, which reads as "the code is wrong".
  //
  // The lifetime matches the OTP's own validity: a shorter window left a gap
  // in which the emailed code was still valid but this token was not, and the
  // UI could only report that as a bad code.
  const tempToken = jwt.sign(
    {
      userId: user[0].user_id,
      username: user[0].username,
      requiresOTP: true,
      tokenVersion: user[0].token_version || 0,
      ...tenantClaims(),
    },
    config.jwtSecret,
    { expiresIn: `${config.otp.expiryMinutes}m` },
  );

  logger.info(`Password verified, OTP sent for user: ${user[0].username}`);

  successResponse(
    res,
    "Password verified. Please check your email for the verification code.",
    {
      tempToken,
      requiresOTP: true,
      // Only present outside production, where the OTP email is skipped so
      // the frontend can auto-fill the code instead of hitting a real inbox.
      ...(config.envType !== "production" && { devOtp: otp }),
      tenant: tenantBlock(),
    },
  );
};

const googleClient = new OAuth2Client(config.google.clientId);

// Builds and sends the final session (JWT + cookie + full user context) for
// any login method that has already verified the user's identity (password
// + OTP, or a verified Google ID token).
const completeLogin = async (
  userId: number,
  res: any,
  loginMethod: "OTP_EMAIL" | "GOOGLE_OAUTH" | "DESKTOP_BROWSER",
  req?: any,
) => {
  // Get user permissions
  const permissions = await getEffectivePermissions(userId);

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

  // Get assigned programs for program leads, scoped to the current academic
  // year -- program leadership is a per-year assignment, so a stale lead
  // from a past year that hasn't been re-assigned should not keep access.
  const currentYearIdForLead = await getCurrentAcademicYearId();
  const assignedPrograms = currentYearIdForLead
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
            eq(UserProgramLead.academic_year_id, currentYearIdForLead),
          ),
        )
    : [];

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
  // No client_secret -- see utils/publicSystems.ts.
  const systems = await getPublicSystems();

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
      preferred_theme: user[0].preferred_theme,
      // See middleware/auth.ts -- lets logout revoke this token before its
      // natural 24h expiry.
      tokenVersion: user[0].token_version || 0,
      // Token contract v2 (packages/tenancy/CONTRACT.md §2).
      ...tenantClaims(),
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

  logger.info(
    `Login completed for user: ${user[0].username} via ${loginMethod}`,
  );

  trackAuth(req, {
    kind: loginMethod === "GOOGLE_OAUTH" ? "google" : "login",
    // DESKTOP_BROWSER: the NGA desktop app, signed in through the person's browser.
    outcome: "success",
    method: loginMethod === "GOOGLE_OAUTH" ? "google" : loginMethod === "DESKTOP_BROWSER" ? "desktop_browser" : "password_otp",
    userId,
  });

  // Record activity
  await recordActivity(
    userId,
    "LOGIN_SUCCESS",
    `User successfully logged in via ${loginMethod === "GOOGLE_OAUTH" ? "Google" : loginMethod === "DESKTOP_BROWSER" ? "the desktop app (browser sign-in)" : "2FA"}`,
    "User",
    userId,
    { method: loginMethod, timestamp: new Date().toISOString() },
    userId,
  );

  successResponse(res, "Login successful", {
    token,
    user: withAvatar(user[0]),
    ...profileMedia(user[0]),
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
    systems,
    tenant: tenantBlock(),
  });

  // Self-healing Account Directory entry (sign-in can find this school next time).
  queueDirectorySync(userId);
};

export const verifyOTP = asyncHandler(async (req: any, res: any) => {
  const { otp } = req.body;
  const userId = req.user.userId;

  if (!otp) {
    throw new ValidationError("OTP is required");
  }

  // Verify OTP
  const isValidOTP = await verifyOTPUtil(userId, otp, "LOGIN_2FA");
  if (!isValidOTP) {
    trackAuth(req, { kind: "otp", outcome: "failure", reason: "otp_failed", userId });
    throw new AuthenticationError("Invalid or expired OTP");
  }

  await completeLogin(userId, res, "OTP_EMAIL", req);
});

// "Sign in with Google" — the frontend obtains a Google ID token (via Google
// Identity Services) and sends it here. We verify it server-side against our
// GOOGLE_CLIENT_ID, then match the verified email to an existing NGA MIS
// account. We deliberately do NOT auto-create accounts from Google logins —
// only pre-provisioned accounts (created by an admin) may sign in, since
// account creation/role assignment for a school MIS is an administrative
// action.
export const googleLogin = asyncHandler(async (req: any, res: any) => {
  const { credential } = req.body;

  if (!credential) {
    throw new ValidationError("Google credential is required");
  }

  if (!config.google.clientId) {
    throw new AuthenticationError("Google sign-in is not configured");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.google.clientId,
    });
    payload = ticket.getPayload();
  } catch (error) {
    logger.warn(`Google ID token verification failed: ${error}`);
    trackAuth(req, { kind: "google", outcome: "failure", reason: "google_invalid" });
    throw new AuthenticationError("Invalid or expired Google credential");
  }

  if (!payload?.email || !payload.email_verified) {
    throw new AuthenticationError(
      "Your Google account's email is not verified",
    );
  }

  const sanitizedEmail = sanitizeString(payload.email);
  const googleSub = payload.sub;

  await withSignInTenant(req, res, sanitizedEmail, () => googleLoginInTenant(req, res, sanitizedEmail, googleSub));
});

const googleLoginInTenant = async (req: any, res: any, sanitizedEmail: string, googleSub: string) => {
  const user = await db
    .select()
    .from(User)
    .where(eq(User.email, sanitizedEmail))
    .limit(1);

  if (user.length === 0) {
    logger.warn(`Google login attempt for unknown email: ${sanitizedEmail}`);
    trackAuth(req, { kind: "google", outcome: "failure", reason: "unknown_user", usernameAttempted: sanitizedEmail });
    throw new AuthenticationError(
      "No NGA MIS account found for this Google email. Contact your administrator.",
    );
  }

  if (user[0].status !== "ACTIVE") {
    trackAuth(req, { kind: "google", outcome: "failure", reason: "inactive", userId: user[0].user_id, usernameAttempted: sanitizedEmail });
    throw new AuthenticationError("Account is not active");
  }

  // Link the Google account to the existing AuthCredential row (if not
  // already linked) so future logins can be audited/traced.
  const auth = await db
    .select()
    .from(AuthCredential)
    .where(eq(AuthCredential.user_id, user[0].user_id))
    .limit(1);

  if (auth.length > 0 && !auth[0].google_id) {
    await db
      .update(AuthCredential)
      .set({ google_id: googleSub })
      .where(eq(AuthCredential.user_id, user[0].user_id));
  }

  await completeLogin(user[0].user_id, res, "GOOGLE_OAUTH", req);
};

/**
 * NGA desktop app, step 1 (in the person's browser, signed in to MIS):
 * issue a one-time code bound to the app's PKCE challenge. See utils/desktopHandoff.ts.
 */
export const createDesktopHandoff = asyncHandler(async (req: any, res: any) => {
  const challenge = req.body?.challenge;
  if (!validChallenge(challenge)) {
    return errorResponse(res, "Invalid challenge", 400);
  }
  const code = issueHandoffCode(req.user.userId, challenge, config.jwtSecret, tenantClaims().tid);
  successResponse(res, "Desktop sign-in code issued", { code, expiresIn: HANDOFF_TTL_SECONDS });
});

/**
 * NGA desktop app, step 2 (inside the app's MIS window): redeem the code with
 * the PKCE verifier and sign in exactly like any other login.
 */
export const redeemDesktopHandoff = asyncHandler(async (req: any, res: any) => {
  const result = redeemHandoffCode(req.body?.code, req.body?.verifier, config.jwtSecret);
  if (!result.ok) {
    trackAuth(req, { kind: "login", outcome: "failure", method: "desktop_browser", reason: `handoff_${result.reason}` });
    return errorResponse(
      res,
      result.reason === "expired" ? "This sign-in took too long. Start again from the NGA app." : "This sign-in link is not valid. Start again from the NGA app.",
      400,
    );
  }
  // The code says which school issued it (legacy codes: the primary tenant).
  const resolved = await tenantFromClaims({ tid: result.tid });
  if (resolved.refusal) return sendRefusal(res, resolved.refusal);
  req.tenant = resolved.tenant;
  await runWithTenant(resolved.tenant, () => redeemDesktopHandoffInTenant(req, res, result.userId));
});

const redeemDesktopHandoffInTenant = async (req: any, res: any, userId: number) => {
  // Same gates as the other logins: blocked device/IP, account not active.
  if (await checkBlocked(deviceIdOf(req), clientIpOf(req)).catch(() => null)) {
    return errorResponse(res, "Sign-in from this device is blocked.", 403);
  }
  const user = await db.select().from(User).where(eq(User.user_id, userId));
  if (!user[0] || user[0].status !== "ACTIVE") {
    return errorResponse(res, "This account can't sign in.", 403);
  }
  await completeLogin(userId, res, "DESKTOP_BROWSER", req);
};

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

  const permissions = await getEffectivePermissions(userId);

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

  // Get all active systems
  // No client_secret -- see utils/publicSystems.ts.
  const systems = await getPublicSystems();

  successResponse(res, "Session retrieved", {
    user: withAvatar(user[0]),
    ...profileMedia(user[0]),
    profile: profile[0] || null,
    permissions,
    roles,
    systems,
    tenant: tenantBlock(),
  });
});

/** Cheap session-validity probe -- authenticate() has already done the real
 *  work (signature, expiry, and the logout-revocation tokenVersion check)
 *  by the time this runs, so there's nothing left to do but confirm it. */
export const verifySession = asyncHandler(async (req: any, res: any) => {
  // Every spoke app polls this every few minutes; access_version tells them
  // when to re-fetch their access snapshot (GET /access/me). Best-effort: a
  // server without migration 090 answers exactly as before.
  let accessVersion: number | null = null;
  try {
    const { currentAccessVersion } = await import("../services/access/compile");
    accessVersion = await currentAccessVersion(req.user.userId);
  } catch {
    accessVersion = null;
  }
  // The current picture rides along, so a spoke's poll picks up a new one within
  // minutes without a separate call (services/avatar/).
  const [row] = await db
    .select({ avatar_version: User.avatar_version, cover_version: User.cover_version })
    .from(User)
    .where(eq(User.user_id, req.user.userId))
    .limit(1);
  // School AI policy version (AI_USAGE_CONTROL_PLAN.md §4.3): a spoke seeing a new
  // value refetches GET /integrations/ai-policy, so a flip reaches every app in minutes.
  const aiPolicy = await getAiPolicy();
  // My AI (PERSONAL_AI_PROVIDERS_PLAN.md §10.2): a new value means this person's own AI keys
  // or "what answers what" changed, so the app refetches GET /integrations/ai/routes.
  const aiRoutesVersion = aiPolicy.personal.enabled ? await routesVersion(Number(req.user.userId)) : 0;
  successResponse(res, "Token valid", {
    userId: req.user.userId,
    access_version: accessVersion,
    ai_policy_v: aiPolicy.v,
    ai_routes_v: aiRoutesVersion,
    ...profileMedia({ user_id: req.user.userId, ...row }),
    tenant: tenantBlock(),
  });
});

export const logout = asyncHandler(async (req: any, res: any) => {
  // Bumping this invalidates every outstanding JWT for the user -- this
  // app's own cookie and, critically, the misToken copy any spoke app
  // (TaskMentor, Tendo, ...) took at SSO-exchange time. Without this,
  // logout only ever cleared the cookie in this one browser and every other
  // session (this token in another tab, or a sibling app that already
  // extracted its own copy) stayed valid until its natural 24h expiry.
  await db
    .update(User)
    .set({ token_version: sql`token_version + 1` })
    .where(eq(User.user_id, req.user.userId));

  res.clearCookie("nga_auth_token", {
    domain: config.cookieDomain,
    path: "/",
  });

  // Single sign-out: tell every connected app (Task Mentor, Tendo, Tupo, ...)
  // to end this user's sessions too -- OIDC Back-Channel Logout, in the
  // background so signing out never waits on another app.
  void notifyLogout(req.user.userId).catch(() => undefined);

  // Presence and sessions end now rather than after the 90 s / 30 min timeouts.
  signOutEverywhereLocal(req.user.userId);
  trackAuth(req, { kind: "logout", outcome: "info", initiator: "user", userId: req.user.userId });

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

  // No account / school enumeration: the answer is the same whether this e-mail is
  // unknown, known to one school or to several. Every school that knows it gets its
  // own code (stored in, and only valid for, that school); the opaque ticket lists
  // where codes went, and verify-reset-otp tries the code in each of them.
  const tenants = await resetTenants(sanitizedEmail, req.body?.tenant);
  const candidates: ResetCandidate[] = [];
  for (const tenant of tenants) {
    const found = await runWithTenant(tenant, async () => {
      const [u] = await db.select().from(User).where(eq(User.email, sanitizedEmail)).limit(1);
      if (!u || u.status !== "ACTIVE") return null;
      return u;
    }).catch(() => null);
    if (!found || candidates.length >= MAX_RESET_CANDIDATES) continue;
    candidates.push({ tid: tenant.tid, uid: found.user_id, tv: found.token_version || 0 });
    // Not awaited: sending (or not) must not change how long the answer takes.
    runWithTenant(tenant, () => {
      setImmediate(() => {
        sendOTPByEmail(found.user_id, found.email!, "PASSWORD_RESET")
          .then(() => logger.info(`Password reset OTP sent for user: ${found.username} (tenant ${tenant.tid})`))
          .catch((error) => logger.error("Password reset OTP failed", { error: error?.message, tid: tenant.tid }));
        trackAuth(req, { kind: "password_reset", outcome: "info", userId: found.user_id, usernameAttempted: sanitizedEmail });
      });
    });
  }
  if (candidates.length === 0) {
    logger.info(`Password reset requested for an e-mail no school knows: ${sanitizedEmail}`);
    trackAuth(req, { kind: "password_reset", outcome: "failure", reason: "unknown_user", usernameAttempted: sanitizedEmail });
  }

  const tempToken = sealResetTicket(candidates, Math.max(config.otp.expiryMinutes, 10) * 60);
  successResponse(res, "If an account exists with this email, a verification code has been sent.", {
    tempToken,
    requiresOTP: true,
  });
});

/** The usable schools a reset may concern: an explicit one, the directory's, else NGA. */
const resetTenants = async (email: string, explicit: unknown): Promise<TenantCtx[]> => {
  if (explicit !== undefined && explicit !== null && explicit !== "") {
    const t = await findTenant(explicit).catch(() => null);
    return t && isTenantUsable(t.status) ? [t] : [];
  }
  const hits = await lookupDirectory(email).catch(() => null);
  if (!hits || hits.length === 0) return [await primaryTenant()];
  const tids = Array.from(new Set(hits.map((h) => h.tid))).sort((a, b) => a - b);
  const tenants = (await Promise.all(tids.map((tid) => getTenant(tid).catch(() => null)))).filter(
    (t): t is TenantCtx => !!t && isTenantUsable(t.status),
  );
  return tenants;
};

/**
 * POST /auth/verify-reset-otp with the forgot-password ticket (`Bearer rt1.…`): try
 * the code in each school the ticket lists; the first that accepts it issues the
 * reset token (carrying that school's tid). A legacy JWT tempToken falls through to
 * `authenticate` + verifyResetOTP.
 */
export const verifyResetOTPTicket = asyncHandler(async (req: any, res: any, next: any) => {
  const header: string = req.get?.("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!isResetTicket(token)) return next();
  const { otp } = req.body;
  if (!otp) throw new ValidationError("OTP is required");
  const candidates = openResetTicket(token);
  if (!candidates) throw new AuthenticationError("Invalid or expired OTP");
  for (const c of candidates) {
    const tenant = await getTenant(c.tid).catch(() => null);
    if (!tenant || !isTenantUsable(tenant.status)) continue;
    const resetToken = await runWithTenant(tenant, async () => {
      const [u] = await db.select({ status: User.status, tv: User.token_version }).from(User).where(eq(User.user_id, c.uid)).limit(1);
      if (!u || u.status !== "ACTIVE" || (u.tv || 0) !== c.tv) return null;
      if (!(await verifyOTPUtil(c.uid, String(otp), "PASSWORD_RESET"))) return null;
      return jwt.sign(
        { userId: c.uid, purpose: "PASSWORD_RESET_CONFIRM", tokenVersion: u.tv || 0, ...tenantClaims(tenant) },
        config.jwtSecret,
        { expiresIn: "10m" },
      );
    });
    if (!resetToken) continue;
    req.tenant = tenant;
    logger.info(`Password reset OTP verified for userId: ${c.uid} (tenant ${tenant.tid})`);
    return successResponse(res, "OTP verified. Please enter your new password.", {
      resetToken,
      requiresNewPassword: true,
    });
  }
  throw new AuthenticationError("Invalid or expired OTP");
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

  // Generate a new temporary token for password reset completion. /auth/reset-password
  // is behind `authenticate`, so this carries tokenVersion too.
  const resetToken = jwt.sign(
    { userId, purpose: "PASSWORD_RESET_CONFIRM", tokenVersion: (await getUserTokenVersion(userId)) ?? 0, ...tenantClaims() },
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
  trackAuth(req, { kind: "password_reset", outcome: "success", userId });

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
  trackAuth(req, { kind: "password_change", outcome: "success", userId });

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

// Step-up re-authentication gate for the Database Management tool: a valid
// session is not enough to open it, the admin must re-prove their password.
export const confirmDbAccess = asyncHandler(async (req: any, res: any) => {
  const { password } = req.body;
  const userId = req.user.userId;

  if (!password) {
    throw new ValidationError("Password is required");
  }

  const auth = await db
    .select()
    .from(AuthCredential)
    .where(eq(AuthCredential.user_id, userId))
    .limit(1);

  if (auth.length === 0) {
    throw new AuthenticationError("Authentication credentials not found");
  }

  const isValidPassword = await bcrypt.compare(password, auth[0].password_hash);
  if (!isValidPassword) {
    throw new AuthenticationError("Incorrect password");
  }

  // /auth/confirm-db-access and the step-up guard run through `authenticate`,
  // so this carries tokenVersion as well.
  const dbAccessToken = jwt.sign(
    { userId, dbAccess: true, tokenVersion: (await getUserTokenVersion(userId)) ?? 0, ...tenantClaims() },
    config.jwtSecret,
    { expiresIn: "20m" },
  );

  logger.info(`Database Management step-up auth granted for userId: ${userId}`);

  await recordActivity(
    userId,
    "DATABASE_MANAGEMENT_ACCESS",
    "Admin confirmed password to access the Database Management tool",
    "User",
    userId,
    undefined,
    userId,
  );

  successResponse(res, "Access confirmed", {
    dbAccessToken,
    expiresIn: 1200,
  });
});
