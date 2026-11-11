import jwt from "jsonwebtoken";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { User } from "../db/schema";
import { ValidationError } from "../errors/CustomError";
import { getEffectivePermissions } from "../utils/auth";
import { shadowCompareLegacy } from "../services/access/policy";
import { enterTenant, isSuspendedRefusal, sendRefusal, suspendedSessionRefusal, tenantFromClaims } from "../tenancy/express";
import { TENANT_HEADER, parseTid, tidFromClaims } from "../vendor/nga-tenancy";
import { legacyDefaultTid } from "../tenancy/context";

/** Single indexed lookup backing the logout-revocation check below. Returns
 *  null if the user row is gone (deleted account) so callers can reject.
 *  Exported because every token that will later be presented to
 *  `authenticate` has to carry this same value as its `tokenVersion` claim. */
export const getUserTokenVersion = async (userId: number): Promise<number | null> => {
  const row = await db
    .select({ token_version: User.token_version })
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);
  return row.length > 0 ? row[0].token_version : null;
};

/** Token version + account status in one indexed lookup (authenticate). */
export const getUserSessionState = async (
  userId: number,
): Promise<{ token_version: number; status: string | null } | null> => {
  const row = await db
    .select({ token_version: User.token_version, status: User.status })
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);
  return row.length > 0 ? row[0] : null;
};

/** Body every endpoint answers when the account behind a valid token is no
 *  longer ACTIVE (INACTIVE / SUSPENDED). Spokes key their sign-out on `code`. */
export const ACCOUNT_INACTIVE_BODY = {
  code: "ACCOUNT_INACTIVE",
  message: "This account is no longer active.",
};

/**
 * Every MIS-signed JWT shares JWT_SECRET, so a valid signature alone proves
 * nothing about what the token is FOR. Audiences minted by the MIS for one
 * narrow job; such a token is never a session.
 */
const NON_SESSION_AUDIENCES = new Set(["nga-mcp-relay", "nga-mcp-consent", "nga-desktop-handoff", "nga-onboarding"]);

/**
 * Why `decoded` is not a person's session token, or null when it is one.
 * Sessions are the login token (no aud) and the SSO token (aud = a System's
 * client id, forwarded by the spokes). Everything else is refused here:
 *   - requiresOTP: the half-finished login (password accepted, code not yet) --
 *     accepting it was a 2FA bypass;
 *   - dbAccess: the Database Management step-up token;
 *   - any `purpose` (PASSWORD_RESET, PASSWORD_RESET_CONFIRM, mcp-relay, ...);
 *   - an MIS-internal audience (MCP relay / consent, desktop hand-off).
 * Each of those has its own verifier (authenticateFor below, requireDbStepUp,
 * the MCP and desktop routes).
 */
export const nonSessionReason = (decoded: any): string | null => {
  if (!decoded || typeof decoded !== "object") return "malformed";
  if (decoded.requiresOTP) return "requires_otp";
  if (decoded.dbAccess) return "step_up";
  if (decoded.purpose !== undefined && decoded.purpose !== null) return "purpose";
  const auds = Array.isArray(decoded.aud) ? decoded.aud : decoded.aud === undefined ? [] : [decoded.aud];
  if (auds.some((a: unknown) => NON_SESSION_AUDIENCES.has(String(a)))) return "audience";
  return null;
};

export const isSessionClaims = (decoded: any): boolean => nonSessionReason(decoded) === null;

/** The token a request carries: Bearer, then the cookie, then ?token= on GET. */
const requestToken = (req: any): string | undefined => {
  let token = req.header("Authorization")?.replace("Bearer ", "");

  // If no token in header, check cookies
  if (!token && req.cookies) {
    token = req.cookies.nga_auth_token;
  }

  // Browser-rendered <img>/<a> tags can't attach an Authorization header or a
  // cross-site Lax cookie, so GET endpoints that render into such tags (e.g.
  // lesson note images) accept the same JWT as a query param instead.
  if (!token && req.method === "GET" && req.query?.token) {
    token = req.query.token;
  }
  return token || undefined;
};

/**
 * The shared verifier: signature, `accept(decoded)`, tenant gates, token version,
 * account status, permissions. `authenticate` accepts sessions only; the narrow
 * flows (login OTP, password reset) use authenticateFor with their own rule.
 */
const authenticateWith = (accept: (decoded: any) => boolean) => async (req: any, res: any, next: any) => {
  const token = requestToken(req);

  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }
  let decoded: any;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET!);
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
  if (!accept(decoded)) {
    // A school applicant (tenant management §6.2) is signed in, but has no school yet:
    // the app answers "pending", so the frontend sends them to the progress tracker.
    if (nonSessionReason(decoded) === "audience" && [].concat(decoded.aud).includes("nga-onboarding" as never)) {
      return res.status(403).json({ success: false, code: "TENANT_PENDING", message: "Your school is not active yet." });
    }
    return res.status(401).json({ message: "Invalid token" });
  }

  // Multi-tenancy (CONTRACT.md §6.1): the token's tid (legacy tokens: the
  // TENANCY_LEGACY_DEFAULT_TID rule), the tenant's status gates, and then the
  // rest of the request runs inside that tenant -- including the token-version
  // check below, which must read the tenant's own User table.
  let resolved;
  try {
    resolved = await tenantFromClaims(decoded);
  } catch {
    return res.status(503).json({ message: "School directory unavailable, please retry." });
  }
  // A SUSPENDED school still lets its billing owners in, on the billing paths only
  // (tenant management §6.7) -- decided below, once the user is known.
  const suspended = isSuspendedRefusal(resolved.tenant, resolved.refusal);
  if (resolved.refusal && !suspended) return sendRefusal(res, resolved.refusal);
  const tenant = resolved.tenant!;
  // A spoke forwarding the user's token may also send X-NGA-Tenant; it must agree (§3).
  const headerTid = req.header?.(TENANT_HEADER);
  if (headerTid !== undefined && headerTid !== "" && parseTid(headerTid) !== tenant.tid) {
    return sendRefusal(res, { status: 403, code: "TENANT_MISMATCH", message: "The school in the request does not match the session." });
  }

  return enterTenant(req, tenant, async () => {
    try {
      req.user = decoded;

      // Ensure userId is a valid number
      req.user.userId = Number(decoded.userId);
      if (isNaN(req.user.userId) || req.user.userId <= 0) {
        throw new ValidationError("Invalid user ID in token");
      }

      // Revoke on logout: a token issued before this user's most recent
      // logout carries a stale tokenVersion and is rejected here even though
      // it's still cryptographically valid and unexpired. Tokens signed
      // before this check existed carry no tokenVersion claim at all --
      // treated as 0, matching the column's default, so already-issued
      // sessions keep working until their next logout.
      const state = await getUserSessionState(req.user.userId);
      if (state === null || (decoded.tokenVersion ?? 0) !== state.token_version) {
        return res
          .status(401)
          .json({ message: "Session expired, please log in again." });
      }
      // A disabled / suspended account loses every session at once, even one
      // whose token predates the change (contract: active users only).
      if (state.status !== "ACTIVE") {
        return res.status(401).json(ACCOUNT_INACTIVE_BODY);
      }

      // Same resolver as GET /users/me and the SSO token (utils/auth.ts).
      req.user.permissions = await getEffectivePermissions(req.user.userId);
      req.user.tid = tenant.tid;
    } catch (error) {
      return res.status(401).json({ message: "Invalid token" });
    }
    // Tenant management gates (suspended school; consented support sessions, §6.9).
    try {
      if (suspended) {
        const r = await suspendedSessionRefusal(req, req.user.userId);
        if (r) return sendRefusal(res, r);
      }
      if (decoded.support) {
        const { supportClaimOf, supportRefusal } = await import("../services/tenantMgmt/support");
        const support = supportClaimOf(decoded) ?? { sid: 0, mode: "READ" as const };
        const r = await supportRefusal(support, req, tenant.tid, {
          platformUserId: Number(decoded.act?.sub) || null,
          userId: req.user.userId,
        });
        if (r) return res.status(r.status).json({ success: false, code: r.code, message: r.message });
      }
    } catch {
      return res.status(503).json({ message: "Access check unavailable, please retry." });
    }
    next();
  });
};

export const authorize =
  (requiredPerm: string | string[]) => (req: any, res: any, next: any) => {
    const permissions = Array.isArray(requiredPerm)
      ? requiredPerm
      : [requiredPerm];
    const hasPermission = permissions.some((perm) =>
      req.user.permissions.includes(perm),
    );
    // Access control v2 shadow mode: the legacy check above still decides;
    // v2's answer is compared and any disagreement recorded for review.
    // No-op unless ACCESS_V2_MIS_MODE=shadow (the non-test default).
    void shadowCompareLegacy(req, permissions, hasPermission);
    if (!hasPermission) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };

/** A person's session (login or SSO token) -- never a temp / purpose token. */
export const authenticate = authenticateWith(isSessionClaims);

/**
 * The narrow, single-step tokens, each accepted only by its own endpoint:
 *   loginOtp       -- the requiresOTP token from POST /auth/login -> /auth/verify-otp;
 *   resetRequest   -- legacy (pre-ticket) forgot-password token -> /auth/verify-reset-otp;
 *   resetConfirm   -- PASSWORD_RESET_CONFIRM from verify-reset-otp -> /auth/reset-password.
 */
export const authenticateFor = {
  loginOtp: authenticateWith((d) => d?.requiresOTP === true && !d?.purpose && !d?.dbAccess),
  resetRequest: authenticateWith((d) => d?.purpose === "PASSWORD_RESET" && !d?.requiresOTP),
  resetConfirm: authenticateWith((d) => d?.purpose === "PASSWORD_RESET_CONFIRM" && !d?.requiresOTP),
};

/** The 5-minute MCP relay token the MIS hands a spoke for one tool call (services/mcp/relay.ts). */
const isRelayToken = (d: any) => {
  const auds = Array.isArray(d?.aud) ? d.aud : [d?.aud];
  return d?.purpose === "mcp-relay" && auds.includes("nga-mcp-relay") && !d?.requiresOTP && !d?.dbAccess;
};

/**
 * A session, or -- on GET only -- the MCP relay token. The spokes verify the relay
 * token they receive the way they verify any MIS bearer: GET /auth/verify, then
 * /users/me and /access/me for the person's identity and access. Those identity
 * reads (and nothing else) take it; every other MIS API refuses it.
 */
export const authenticateIdentityRead = (req: any, res: any, next: any) =>
  authenticateWith((d) => isSessionClaims(d) || (req.method === "GET" && isRelayToken(d)))(req, res, next);

// Guards the Database Management tool: even an authenticated admin session
// isn't enough, they must have separately re-confirmed their password via
// POST /auth/confirm-db-access to obtain this short-lived token.
export const requireDbStepUp = (req: any, res: any, next: any) => {
  const token = req.header("X-Db-Access-Token");
  if (!token) {
    return res
      .status(401)
      .json({ message: "Step-up authentication required" });
  }
  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
    // Same person AND same school as the session (user ids repeat across schools).
    if (
      decoded.dbAccess !== true ||
      Number(decoded.userId) !== req.user.userId ||
      tidFromClaims(decoded, legacyDefaultTid()) !== (req.user.tid ?? req.tenant?.tid)
    ) {
      return res
        .status(401)
        .json({ message: "Step-up authentication required" });
    }
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ message: "Step-up session expired, please re-confirm your password" });
  }
};
