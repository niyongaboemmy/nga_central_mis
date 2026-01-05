import crypto from "crypto";
import { db } from "../db";
import { eq, and, gt, lt } from "drizzle-orm";
import { OTP } from "../db/schema";
import config from "../config";
import emailService from "./email";
import logger from "./logger";

export const generateOTP = (length: number = config.otp.length): string => {
  const digits = "0123456789";
  let otp = "";

  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }

  return otp;
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
    return false;
  }

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

  // Send email
  await emailService.sendOTP(email, otp, type);

  return otp; // Return for testing purposes, don't return in production
};

export const cleanupExpiredOTPs = async (): Promise<void> => {
  const now = new Date();

  const result = await db.delete(OTP).where(lt(OTP.expires_at, now));

  logger.info("Cleaned up expired OTPs", { result });
};
