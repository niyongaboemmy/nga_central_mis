import jwt from "jsonwebtoken";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { User } from "../db/schema";
import { ValidationError } from "../errors/CustomError";
import { getEffectivePermissions } from "../utils/auth";
import { shadowCompareLegacy } from "../services/access/policy";

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

export const authenticate = async (req: any, res: any, next: any) => {
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

  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }
  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
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
    const currentTokenVersion = await getUserTokenVersion(req.user.userId);
    if (
      currentTokenVersion === null ||
      (decoded.tokenVersion ?? 0) !== currentTokenVersion
    ) {
      return res
        .status(401)
        .json({ message: "Session expired, please log in again." });
    }

    // Same resolver as GET /users/me and the SSO token (utils/auth.ts).
    req.user.permissions = await getEffectivePermissions(req.user.userId);

    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
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
    if (decoded.dbAccess !== true || decoded.userId !== req.user.userId) {
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
