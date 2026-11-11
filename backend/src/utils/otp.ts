import crypto from "crypto";
import { db } from "../db";
import { eq, and, gt, lt } from "drizzle-orm";
import { OTP } from "../db/schema";
import config from "../config";
import emailService from "./email";
import logger from "./logger";
import { scopedKey } from "../tenancy/scoped";

/** Codes come from the CSPRNG (Math.random is predictable). */
export const generateOTP = (length: number = config.otp.length): string => {
  let otp = "";
  for (let i = 0; i < length; i++) otp += String(crypto.randomInt(0, 10));
  return otp;
};

// ─── brute-force guard ───────────────────────────────────────────────────────
// A 6-digit code is 1 in a million; without a limit a script walks it. After
// OTP_MAX_ATTEMPTS wrong codes for one (school, user, kind) every outstanding
// code of that kind is burnt and the kind is locked for OTP_LOCK_MINUTES: the
// person asks for a new code once the lock ends. Keyed by tenant (user ids
// repeat across schools); in memory -- the MIS runs as one process.
type OtpType = "LOGIN_2FA" | "PASSWORD_RESET" | "EMAIL_VERIFICATION";
const maxAttempts = () => Math.max(1, Number(process.env.OTP_MAX_ATTEMPTS) || 5);
const lockMs = () => Math.max(1, Number(process.env.OTP_LOCK_MINUTES) || 15) * 60_000;
const otpFailures = new Map<string, { n: number; first: number; lockedUntil: number }>();
const failureKey = (userId: number, type: OtpType) => scopedKey("otp", type, userId);

/** Is this user's `type` code entry locked right now? */
export const isOtpLocked = (userId: number, type: OtpType = "LOGIN_2FA"): boolean => {
  const st = otpFailures.get(failureKey(userId, type));
  return !!st && st.lockedUntil > Date.now();
};

/** Tests / admin unlock. */
export const resetOtpAttempts = (userId?: number, type?: OtpType) => {
  if (userId === undefined) return otpFailures.clear();
  for (const t of type ? [type] : (["LOGIN_2FA", "PASSWORD_RESET", "EMAIL_VERIFICATION"] as OtpType[])) otpFailures.delete(failureKey(userId, t));
};

const noteFailure = async (userId: number, type: OtpType) => {
  const key = failureKey(userId, type);
  const now = Date.now();
  let st = otpFailures.get(key);
  if (!st || now - st.first > lockMs()) st = { n: 0, first: now, lockedUntil: 0 };
  st.n++;
  if (st.n >= maxAttempts()) {
    st.lockedUntil = now + lockMs();
    // Burn every outstanding code: guessing on must start over with a fresh one.
    await db
      .update(OTP)
      .set({ is_used: 1 })
      .where(and(eq(OTP.user_id, userId), eq(OTP.otp_type, type), eq(OTP.is_used, 0)))
      .catch(() => undefined);
    logger.warn("OTP locked after repeated wrong codes", { userId, type });
  }
  otpFailures.set(key, st);
  if (otpFailures.size > 50_000) {
    for (const [k, v] of otpFailures) if (v.lockedUntil < now && now - v.first > lockMs()) otpFailures.delete(k);
  }
};

export const saveOTP = async (
  userId: number,
  otpCode: string,
  type: "LOGIN_2FA" | "PASSWORD_RESET" | "EMAIL_VERIFICATION" = "LOGIN_2FA"
): Promise<void> => {
  const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);

  await db.insert(OTP).values({
    user_id: userId,
    otp_code: otpCode,
    otp_type: type,
    expires_at: expiresAt,
  });

  logger.info("OTP saved", { userId, type });
};

export const verifyOTP = async (
  userId: number,
  otpCode: string,
  type: "LOGIN_2FA" | "PASSWORD_RESET" | "EMAIL_VERIFICATION" = "LOGIN_2FA"
): Promise<boolean> => {
  const now = new Date();
  if (isOtpLocked(userId, type)) {
    logger.warn("OTP attempt while locked", { userId, type });
    return false;
  }

  // Find valid OTP
  const otpRecord = await db
    .select()
    .from(OTP)
    .where(
      and(
        eq(OTP.user_id, userId),
        eq(OTP.otp_code, otpCode),
        eq(OTP.otp_type, type),
        eq(OTP.is_used, 0),
        gt(OTP.expires_at, now)
      )
    )
    .limit(1);

  if (otpRecord.length === 0) {
    logger.warn("Invalid OTP attempt", { userId, type });
    await noteFailure(userId, type);
    return false;
  }
  otpFailures.delete(failureKey(userId, type));

  // Mark OTP as used
  await db
    .update(OTP)
    .set({ is_used: 1 })
    .where(eq(OTP.otp_id, otpRecord[0].otp_id));

  logger.info("OTP verified successfully", { userId, type });
  return true;
};

export const sendOTPByEmail = async (
  userId: number,
  email: string,
  type: "LOGIN_2FA" | "PASSWORD_RESET" | "EMAIL_VERIFICATION" = "LOGIN_2FA"
): Promise<string> => {
  const otp = generateOTP();

  // Save OTP to database
  await saveOTP(userId, otp, type);

  // Outside production, skip the real email and let the caller surface the
  // OTP directly (e.g. auto-filled in the UI) so local/dev testing doesn't
  // depend on a working mail transport.
  if (config.envType === "production") {
    await emailService.sendOTP(email, otp, type);
  } else {
    logger.info("Dev mode: skipping OTP email, returning code directly", {
      userId,
      type,
    });
  }

  return otp; // Return for testing purposes, don't return in production
};

export const cleanupExpiredOTPs = async (): Promise<void> => {
  const now = new Date();

  const result = await db.delete(OTP).where(lt(OTP.expires_at, now));

  logger.info("Cleaned up expired OTPs", { result });
};
