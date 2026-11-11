/**
 * Applicant accounts (plan §6.1 step 3, §6.2): the person registering a school.
 * Not a user of any tenant -- a control-plane ApplicantAccount with its own
 * bcrypt password (MIS policy), a 6-digit e-mail code (sha256 at rest, 10 min,
 * 5 tries) and the onboarding token (guards.signOnboardingToken).
 *
 * An e-mail that already belongs to a school user is fine (people run several
 * schools) and nothing here ever says whether it does.
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { RowDataPacket } from "mysql2/promise";
import { controlPool } from "../../db/platform";
import { CustomError } from "../../errors/CustomError";
import { validateEmail, validatePassword } from "../../utils/sanitization";
import emailService from "../../utils/email";
import config from "../../config";
import logger from "../../utils/logger";
import { generateOTP } from "../../utils/otp";
import { signOnboardingToken } from "./guards";

/** An error with a contract `code` ({ success:false, code, message }). */
export class OnboardingError extends CustomError {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public errors?: any[],
  ) {
    super(message, status);
  }
}
export const fail = (status: number, code: string, message: string, errors?: any[]): never => {
  throw new OnboardingError(status, code, message, errors);
};
/** A field error: { code, field, message, errors: [{ field, message }] } (frontend wizard). */
export const failField = (field: string, message: string, code = "VALIDATION", status = 400): never => {
  const e = new OnboardingError(status, code, message, [{ field, message }]);
  (e as any).field = field;
  throw e;
};

export const OTP_TTL_SEC = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;

export const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();

/** "jane.doe@example.com" -> "j***e@example.com" */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 1);
  const tail = local.length > 2 ? local.slice(-1) : "";
  return `${head}***${tail}@${domain}`;
}

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamailblock.com", "grr.la", "sharklasers.com",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org", "temp-mail.io", "tempail.com", "tempr.email",
  "yopmail.com", "yopmail.fr", "trashmail.com", "getnada.com", "nada.email", "dispostable.com", "maildrop.cc",
  "throwawaymail.com", "fakeinbox.com", "mintemail.com", "mohmal.com", "emailondeck.com", "spam4.me", "burnermail.io",
  "mailnesia.com", "mytemp.email", "discard.email", "moakt.com", "mailcatch.com", "trbvm.com", "getairmail.com",
  "emailfake.com", "fakemail.net", "spambox.us", "mailpoof.com", "inboxkitten.com", "tmpmail.org", "tmpmail.net",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const extra = String(process.env.ONBOARDING_DISPOSABLE_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const parts = domain.split(".");
  // sub.mailinator.com counts too
  for (let i = 0; i < parts.length - 1; i++) {
    const d = parts.slice(i).join(".");
    if (DISPOSABLE.has(d) || extra.includes(d)) return true;
  }
  return false;
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const bcryptRounds = () => (process.env.NODE_ENV === "test" ? 4 : 12);

export interface AccountRow extends RowDataPacket {
  account_id: number;
  email_norm: string;
  full_name: string;
  phone: string | null;
  password_hash: string;
  email_verified_at: Date | null;
  otp_hash: string | null;
  otp_expires_at: Date | null;
  otp_attempts: number;
  status: "ACTIVE" | "LOCKED" | "CONVERTED";
  tenant_id: number | null;
  token_version: number;
}

export async function accountByEmail(email: string): Promise<AccountRow | null> {
  const [rows] = await controlPool().query<AccountRow[]>("SELECT * FROM ApplicantAccount WHERE email_norm = ?", [normEmail(email)]);
  return rows[0] ?? null;
}

export async function accountById(id: number): Promise<AccountRow | null> {
  const [rows] = await controlPool().query<AccountRow[]>("SELECT * FROM ApplicantAccount WHERE account_id = ?", [id]);
  return rows[0] ?? null;
}

export function serializeAccount(a: AccountRow) {
  return {
    id: Number(a.account_id),
    email: String(a.email_norm),
    fullName: String(a.full_name),
    phone: a.phone ?? null,
    emailVerified: !!a.email_verified_at,
    status: String(a.status),
  };
}

// ---------------------------------------------------------------------------
// The e-mailed code. Tests read it through peekOtpForTests (NODE_ENV=test only).
// ---------------------------------------------------------------------------

const testOtps = new Map<string, string>();

/** The last code e-mailed to `email` -- only under NODE_ENV=test (null otherwise). */
export function peekOtpForTests(email: string): string | null {
  if (process.env.NODE_ENV !== "test") return null;
  return testOtps.get(normEmail(email)) ?? null;
}

async function issueOtp(account: AccountRow): Promise<void> {
  const code = generateOTP(6);
  await controlPool().query(
    "UPDATE ApplicantAccount SET otp_hash = ?, otp_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), otp_attempts = 0 WHERE account_id = ?",
    [sha(code), OTP_TTL_SEC, account.account_id],
  );
  if (process.env.NODE_ENV === "test") testOtps.set(String(account.email_norm), code);
  if (config.envType === "production") {
    try {
      await emailService.sendOTP(String(account.email_norm), code, "EMAIL_VERIFICATION");
    } catch (err) {
      logger.error("[onboarding] verification e-mail failed", { err, accountId: account.account_id });
    }
  } else {
    logger.info(`[onboarding] dev mode: verification code for ${account.email_norm} is ${code}`);
  }
}

// ---------------------------------------------------------------------------
// Account start / resend / verify
// ---------------------------------------------------------------------------

export function checkPasswordPolicy(password: unknown): string {
  const pw = typeof password === "string" ? password : "";
  const v = validatePassword(pw);
  if (!v.isValid) failField("password", v.errors[0] ?? "Choose a stronger password.", "WEAK_PASSWORD");
  return pw;
}

export async function startAccount(body: { fullName?: unknown; email?: unknown; phone?: unknown; password?: unknown }) {
  const email = normEmail(body.email);
  const fullName = String(body.fullName ?? "").trim().slice(0, 150);
  const phone = body.phone ? String(body.phone).trim().slice(0, 40) : null;
  if (!fullName) failField("fullName", "Your full name is required.");
  if (!email || !validateEmail(email) || email.length > 191) failField("email", "Enter a valid e-mail address.", "INVALID_EMAIL");
  if (isDisposableEmail(email)) failField("email", "Use a permanent e-mail address (not a disposable one).", "DISPOSABLE_EMAIL");
  const password = checkPasswordPolicy(body.password);
  const hash = await bcrypt.hash(password, bcryptRounds());

  let acc = await accountByEmail(email);
  if (acc && acc.email_verified_at) {
    fail(409, "ACCOUNT_EXISTS", "This e-mail is already registered. Sign in instead.");
  }
  if (acc) {
    // Unverified: whoever proves the mailbox owns it, so the details may be replaced.
    await controlPool().query("UPDATE ApplicantAccount SET full_name = ?, phone = ?, password_hash = ? WHERE account_id = ?", [
      fullName,
      phone,
      hash,
      acc.account_id,
    ]);
  } else {
    try {
      await controlPool().query("INSERT INTO ApplicantAccount (email_norm, full_name, phone, password_hash) VALUES (?, ?, ?, ?)", [
        email,
        fullName,
        phone,
        hash,
      ]);
    } catch (err: any) {
      if (err?.code !== "ER_DUP_ENTRY") throw err; // a parallel start: fall through to resend
    }
  }
  acc = (await accountByEmail(email))!;
  await issueOtp(acc);
  return { accountId: Number(acc.account_id), otpSentTo: maskEmail(email), expiresInSec: OTP_TTL_SEC };
}

/** Same answer whether or not an unverified account exists (no enumeration). */
export async function resendCode(emailRaw: unknown) {
  const email = normEmail(emailRaw);
  if (!email || !validateEmail(email)) failField("email", "Enter a valid e-mail address.", "INVALID_EMAIL");
  const acc = await accountByEmail(email);
  if (acc && !acc.email_verified_at && acc.status === "ACTIVE") await issueOtp(acc);
  return { otpSentTo: maskEmail(email), expiresInSec: OTP_TTL_SEC };
}

/** Every code refusal: 400 INVALID_CODE, `reason` INVALID | EXPIRED | LOCKED (EXPIRED / LOCKED: ask for a new code). */
function badCode(reason: "INVALID" | "EXPIRED" | "LOCKED", message: string, attemptsLeft?: number): never {
  const e = new OnboardingError(400, "INVALID_CODE", message, [{ field: "code", message }]);
  Object.assign(e, { field: "code", reason, ...(attemptsLeft !== undefined ? { attemptsLeft } : {}) });
  throw e;
}

export async function verifyCode(emailRaw: unknown, codeRaw: unknown): Promise<AccountRow> {
  const email = normEmail(emailRaw);
  const code = String(codeRaw ?? "").trim();
  const acc = await accountByEmail(email);
  if (!acc || acc.email_verified_at || !acc.otp_hash) badCode("INVALID", "That code is not right. Ask for a new one.");
  const a = acc!;
  if (Number(a.otp_attempts) >= OTP_MAX_ATTEMPTS) badCode("LOCKED", "Too many wrong codes. Ask for a new one.");
  const [[exp]] = await controlPool().query<RowDataPacket[]>(
    "SELECT otp_expires_at IS NULL OR otp_expires_at < UTC_TIMESTAMP() AS expired FROM ApplicantAccount WHERE account_id = ?",
    [a.account_id],
  );
  if (Number(exp.expired) === 1) badCode("EXPIRED", "This code has expired. Ask for a new one.");
  const ok = /^\d{6}$/.test(code) && crypto.timingSafeEqual(Buffer.from(sha(code)), Buffer.from(String(a.otp_hash)));
  if (!ok) {
    await controlPool().query("UPDATE ApplicantAccount SET otp_attempts = otp_attempts + 1 WHERE account_id = ?", [a.account_id]);
    const left = OTP_MAX_ATTEMPTS - (Number(a.otp_attempts) + 1);
    if (left <= 0) {
      await controlPool().query("UPDATE ApplicantAccount SET otp_hash = NULL WHERE account_id = ?", [a.account_id]);
      badCode("LOCKED", "Too many wrong codes. Ask for a new one.");
    }
    badCode("INVALID", `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`, left);
  }
  await controlPool().query(
    "UPDATE ApplicantAccount SET email_verified_at = UTC_TIMESTAMP(), otp_hash = NULL, otp_expires_at = NULL, otp_attempts = 0, last_login_at = UTC_TIMESTAMP() WHERE account_id = ?",
    [a.account_id],
  );
  testOtps.delete(email);
  return (await accountById(Number(a.account_id)))!;
}

// ---------------------------------------------------------------------------
// Sign-in, sign-out, password
// ---------------------------------------------------------------------------

/** /onboarding/login: verified, usable accounts only. */
export async function passwordLogin(emailRaw: unknown, password: unknown): Promise<AccountRow> {
  const acc = await accountByEmail(normEmail(emailRaw));
  const ok = !!acc && typeof password === "string" && (await bcrypt.compare(password, acc.password_hash));
  if (!ok) fail(401, "INVALID_CREDENTIALS", "Invalid credentials");
  const a = acc!;
  if (a.status === "CONVERTED") fail(409, "USE_SCHOOL_LOGIN", "Your school is live. Sign in with the school login.");
  if (a.status === "LOCKED") fail(403, "ACCOUNT_LOCKED", "This account is locked.");
  if (!a.email_verified_at) fail(403, "EMAIL_NOT_VERIFIED", "Verify your e-mail first.");
  await controlPool().query("UPDATE ApplicantAccount SET last_login_at = UTC_TIMESTAMP() WHERE account_id = ?", [a.account_id]);
  return a;
}

/**
 * The MIS login's applicant branch (§6.2): an onboarding token when this e-mail
 * + password open a verified, not-yet-converted applicant account; null otherwise
 * (the caller then answers its usual "Invalid credentials"). Never throws.
 */
export async function onboardingLoginFor(identifier: string, password: string): Promise<{ token: string; status: string } | null> {
  try {
    const email = normEmail(identifier);
    if (!validateEmail(email)) return null;
    const acc = await accountByEmail(email);
    if (!acc || acc.status !== "ACTIVE" || !acc.email_verified_at) return null;
    if (!(await bcrypt.compare(password, acc.password_hash))) return null;
    await controlPool().query("UPDATE ApplicantAccount SET last_login_at = UTC_TIMESTAMP() WHERE account_id = ?", [acc.account_id]);
    const [apps] = await controlPool().query<RowDataPacket[]>(
      "SELECT status FROM TenantApplication WHERE account_id = ? ORDER BY (status IN ('REJECTED','WITHDRAWN','EXPIRED')) ASC, application_id DESC LIMIT 1",
      [acc.account_id],
    );
    return { token: signOnboardingToken(acc), status: apps[0] ? String(apps[0].status) : "NONE" };
  } catch {
    return null; // no control plane, etc.
  }
}

/** Google sign-in (the mailbox is proven by Google): a verified applicant's onboarding token, else null. */
export async function onboardingTokenForVerifiedEmail(identifier: string): Promise<{ token: string; status: string } | null> {
  try {
    const acc = await accountByEmail(normEmail(identifier));
    if (!acc || acc.status !== "ACTIVE" || !acc.email_verified_at) return null;
    await controlPool().query("UPDATE ApplicantAccount SET last_login_at = UTC_TIMESTAMP() WHERE account_id = ?", [acc.account_id]);
    const [apps] = await controlPool().query<RowDataPacket[]>(
      "SELECT status FROM TenantApplication WHERE account_id = ? ORDER BY (status IN ('REJECTED','WITHDRAWN','EXPIRED')) ASC, application_id DESC LIMIT 1",
      [acc.account_id],
    );
    return { token: signOnboardingToken(acc), status: apps[0] ? String(apps[0].status) : "NONE" };
  } catch {
    return null;
  }
}

export async function logoutAccount(accountId: number): Promise<void> {
  await controlPool().query("UPDATE ApplicantAccount SET token_version = token_version + 1 WHERE account_id = ?", [accountId]);
}

/** Change the password (the current token stays valid; logout revokes it). */
export async function changePassword(accountId: number, current: unknown, next: unknown): Promise<AccountRow> {
  const acc = await accountById(accountId);
  if (!acc || typeof current !== "string" || !(await bcrypt.compare(current, acc.password_hash))) {
    failField("currentPassword", "Your current password is not right.", "INVALID_PASSWORD");
  }
  const pw = checkPasswordPolicy(next);
  await controlPool().query("UPDATE ApplicantAccount SET password_hash = ? WHERE account_id = ?", [await bcrypt.hash(pw, bcryptRounds()), accountId]);
  return (await accountById(accountId))!;
}

// ---------------------------------------------------------------------------
// Captcha (free tiers: Cloudflare Turnstile or hCaptcha). Off unless configured.
// ---------------------------------------------------------------------------

export function captchaConfig(): { provider: "turnstile" | "hcaptcha" | null; siteKey: string | null } {
  if (process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY) return { provider: "turnstile", siteKey: process.env.TURNSTILE_SITE_KEY };
  if (process.env.HCAPTCHA_SITE_KEY && process.env.HCAPTCHA_SECRET_KEY) return { provider: "hcaptcha", siteKey: process.env.HCAPTCHA_SITE_KEY };
  return { provider: null, siteKey: null };
}

/** Throws 400 CAPTCHA_FAILED when a captcha is configured and the token does not verify. */
export async function assertCaptcha(token: unknown, ip?: string | null): Promise<void> {
  const { provider } = captchaConfig();
  if (!provider) return;
  if (typeof token !== "string" || !token) fail(400, "CAPTCHA_REQUIRED", "Please complete the check.");
  const url = provider === "turnstile" ? "https://challenges.cloudflare.com/turnstile/v0/siteverify" : "https://api.hcaptcha.com/siteverify";
  const secret = provider === "turnstile" ? process.env.TURNSTILE_SECRET_KEY! : process.env.HCAPTCHA_SECRET_KEY!;
  let ok = false;
  try {
    const form = new URLSearchParams({ secret, response: String(token) });
    if (ip) form.set("remoteip", ip);
    const r = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(8000) });
    const j: any = await r.json().catch(() => ({}));
    ok = j?.success === true;
  } catch (err) {
    logger.warn("[onboarding] captcha verification unreachable", { err });
    ok = false;
  }
  if (!ok) fail(400, "CAPTCHA_FAILED", "The check did not pass. Please try again.");
}
