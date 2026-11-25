import { OAuth2Client } from "google-auth-library";
import config from "../config";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse, errorResponse } from "../utils/response";
import { ValidationError, AuthenticationError } from "../errors/CustomError";
import {
  findStaffByGoogle,
  GoogleLinkConflict,
  linkVerifiedGoogle,
  normEmail,
  readAttendanceGoogle,
  setAttendanceGoogleEmail,
  unlinkGoogle,
} from "../services/staffIdentity";

const googleClient = new OAuth2Client(config.google.clientId);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /users/service/staff-identity (client credentials, scope profiles:read).
 * Body: { google_sub, google_email } -- already verified by the calling app.
 * 404 NO_MATCH when no account in this school uses that Google account.
 */
export const staffIdentity = asyncHandler(async (req: any, res: any) => {
  const sub = String(req.body?.google_sub ?? "").trim();
  const email = normEmail(req.body?.google_email);
  if (!sub || sub.length > 255 || !EMAIL_RE.test(email)) throw new ValidationError("google_sub and google_email are required");
  const person = await findStaffByGoogle({ sub, email });
  if (!person) {
    return res.status(404).json({ success: false, code: "NO_MATCH", message: "No account in this school uses this Google account." });
  }
  successResponse(res, "Staff identity", person);
});

/** GET /users/me/attendance-google */
export const getMyAttendanceGoogle = asyncHandler(async (req: any, res: any) => {
  successResponse(res, "Attendance Google account", await readAttendanceGoogle(req.user.userId));
});

/** POST /users/me/attendance-google { credential } -- link the Google account the person just signed in with. */
export const linkMyAttendanceGoogle = asyncHandler(async (req: any, res: any) => {
  const credential = req.body?.credential;
  if (!credential) throw new ValidationError("Google credential is required");
  if (!config.google.clientId) throw new AuthenticationError("Google sign-in is not configured");
  let payload: any;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.google.clientId });
    payload = ticket.getPayload();
  } catch {
    throw new AuthenticationError("Invalid or expired Google credential");
  }
  if (!payload?.sub || !payload?.email || !payload.email_verified) throw new AuthenticationError("Your Google account's e-mail is not verified");
  try {
    await linkVerifiedGoogle(req.user.userId, payload.sub, payload.email);
  } catch (err) {
    if (err instanceof GoogleLinkConflict) return errorResponse(res, err.message, 409);
    throw err;
  }
  successResponse(res, "Google account linked", await readAttendanceGoogle(req.user.userId));
});

/**
 * PUT /users/me/attendance-google { email } -- type the Gmail you check in with, no Google
 * pop-up. Unverified until that Google account signs in once on the check-in page.
 */
export const setMyAttendanceGoogle = asyncHandler(async (req: any, res: any) => {
  const raw = req.body?.email;
  const email = raw === null || raw === undefined || String(raw).trim() === "" ? null : normEmail(raw);
  if (!email) throw new ValidationError("Enter the Gmail you use on your phone");
  if (!EMAIL_RE.test(email) || email.length > 255) throw new ValidationError("Enter a valid e-mail address");
  try {
    await setAttendanceGoogleEmail(req.user.userId, email);
  } catch (err) {
    if (err instanceof GoogleLinkConflict) return errorResponse(res, err.message, 409);
    throw err;
  }
  successResponse(res, "Gmail saved for attendance", await readAttendanceGoogle(req.user.userId));
});

/** DELETE /users/me/attendance-google -- forget both the typed Gmail and the linked Google account */
export const unlinkMyAttendanceGoogle = asyncHandler(async (req: any, res: any) => {
  await setAttendanceGoogleEmail(req.user.userId, null);
  await unlinkGoogle(req.user.userId);
  successResponse(res, "Google account unlinked", await readAttendanceGoogle(req.user.userId));
});

/** GET /users/:id/attendance-google (MANAGE_USERS) */
export const getUserAttendanceGoogle = asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid user id");
  successResponse(res, "Attendance Google account", await readAttendanceGoogle(id));
});

/** PUT /users/:id/attendance-google { email | null } (MANAGE_USERS) */
export const setUserAttendanceGoogle = asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid user id");
  const raw = req.body?.email;
  const email = raw === null || raw === undefined || String(raw).trim() === "" ? null : normEmail(raw);
  if (email && (!EMAIL_RE.test(email) || email.length > 255)) throw new ValidationError("Enter a valid e-mail address");
  try {
    await setAttendanceGoogleEmail(id, email);
  } catch (err) {
    if (err instanceof GoogleLinkConflict) return errorResponse(res, err.message, 409);
    throw err;
  }
  successResponse(res, email ? "Attendance Google account saved" : "Attendance Google account removed", await readAttendanceGoogle(id));
});
