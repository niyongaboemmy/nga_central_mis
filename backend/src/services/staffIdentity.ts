import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sql, SQL } from "drizzle-orm";
import { db } from "../db";
import { getEffectivePermissions } from "../utils/auth";

/**
 * Staff attendance clock (Tendo /c/<school>, STAFF_ATTENDANCE_CLOCK_PLAN.md §6.2-6.3).
 *
 * The clock page proves a person with a Google ID token; Tendo verifies it and asks
 * here which Amashuri account (in this school) that Google account belongs to.
 * Matching rule, first hit wins:
 *   1. AuthCredential.google_id = the Google account id (sub) -- set by any Google
 *      sign-in or an earlier clock registration;
 *   2. User.email = the verified Google e-mail;
 *   3. AuthCredential.google_email = the verified Google e-mail (an address the
 *      person or an admin named for attendance, migration 149).
 * Accounts are never created here (same rule as POST /auth/google).
 *
 * google_email is read and written with raw SQL so a server without migration 149
 * keeps working: rule 3 is then skipped.
 */

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const one = async (q: SQL): Promise<any | undefined> => rows(await db.execute(q))[0];
const missingColumn = (err: any) => err?.code === "ER_BAD_FIELD_ERROR" || err?.cause?.code === "ER_BAD_FIELD_ERROR";

export const normEmail = (value: unknown): string => String(value ?? "").trim().toLowerCase();

export interface StaffIdentity {
  user_id: number;
  name: string;
  email: string | null;
  status: string;
  user_type: string | null;
  is_student: boolean;
  roles: string[];
  permissions: string[];
  matched_by: "google_id" | "email" | "google_email";
}

const PERSON = sql`SELECT u.user_id, u.email, u.status, p.first_name, p.last_name, p.user_type
  FROM \`User\` u LEFT JOIN UserProfile p ON p.user_id = u.user_id`;

async function byGoogleId(sub: string) {
  return one(sql`${PERSON} JOIN AuthCredential a ON a.user_id = u.user_id WHERE a.google_id = ${sub} LIMIT 1`);
}
async function byEmail(email: string) {
  return one(sql`${PERSON} WHERE LOWER(u.email) = ${email} LIMIT 1`);
}
async function byGoogleEmail(email: string) {
  try {
    return await one(sql`${PERSON} JOIN AuthCredential a ON a.user_id = u.user_id WHERE LOWER(a.google_email) = ${email} LIMIT 1`);
  } catch (err) {
    if (missingColumn(err)) return undefined;
    throw err;
  }
}

async function roleNames(userId: number): Promise<string[]> {
  const list = rows(await db.execute(sql`SELECT r.name FROM UserRole ur JOIN Role r ON r.role_id = ur.role_id WHERE ur.user_id = ${userId}`));
  return list.map((r) => String(r.name));
}

/**
 * The person's credential row, created when missing (an account registered with no
 * password, e.g. no e-mail). Its password is a bcrypt hash of 32 random bytes nobody
 * knows, so the row never opens a password sign-in.
 */
async function ensureCredential(userId: number): Promise<{ auth_id: number; google_id: string | null }> {
  const existing = await one(sql`SELECT auth_id, google_id FROM AuthCredential WHERE user_id = ${userId} LIMIT 1`);
  if (existing) return existing;
  const unusable = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
  await db.execute(sql`INSERT INTO AuthCredential (user_id, password_hash) VALUES (${userId}, ${unusable})`);
  return (await one(sql`SELECT auth_id, google_id FROM AuthCredential WHERE user_id = ${userId} LIMIT 1`))!;
}

/** Store the Google account id on the person's credential row, when it is free. */
async function rememberGoogleId(userId: number, sub: string): Promise<void> {
  const cred = await ensureCredential(userId);
  if (cred.google_id) return;
  const taken = await one(sql`SELECT user_id FROM AuthCredential WHERE google_id = ${sub} LIMIT 1`);
  if (taken) return;
  await db.execute(sql`UPDATE AuthCredential SET google_id = ${sub} WHERE auth_id = ${cred.auth_id}`);
}

/** Who this Google account is in the current school, or null. */
export async function findStaffByGoogle(input: { sub: string; email: string }): Promise<StaffIdentity | null> {
  const sub = String(input.sub || "").trim();
  const email = normEmail(input.email);
  if (!sub || !email) return null;

  let matchedBy: StaffIdentity["matched_by"] = "google_id";
  let person = await byGoogleId(sub);
  if (!person) {
    matchedBy = "email";
    person = await byEmail(email);
  }
  if (!person) {
    matchedBy = "google_email";
    person = await byGoogleEmail(email);
  }
  if (!person) return null;

  const userId = Number(person.user_id);
  if (matchedBy !== "google_id") await rememberGoogleId(userId, sub);

  const roles = await roleNames(userId);
  const userType = person.user_type ? String(person.user_type).toUpperCase() : null;
  const isStudent = userType === "STUDENT" || roles.includes("STUDENT");
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ").trim() || person.email || `User ${userId}`;
  return {
    user_id: userId,
    name,
    email: person.email ?? null,
    status: String(person.status ?? ""),
    user_type: userType,
    is_student: isStudent,
    roles,
    permissions: person.status === "ACTIVE" ? await getEffectivePermissions(userId) : [],
    matched_by: matchedBy,
  };
}

export interface AttendanceGoogleLink {
  linked: boolean;
  google_email: string | null;
  /** The account id is known (someone signed in with it at least once). */
  verified: boolean;
}

export async function readAttendanceGoogle(userId: number): Promise<AttendanceGoogleLink> {
  let cred: any;
  try {
    cred = await one(sql`SELECT google_id, google_email FROM AuthCredential WHERE user_id = ${userId} LIMIT 1`);
  } catch (err) {
    if (!missingColumn(err)) throw err;
    cred = await one(sql`SELECT google_id FROM AuthCredential WHERE user_id = ${userId} LIMIT 1`);
  }
  const email = cred?.google_email ? String(cred.google_email) : null;
  return { linked: !!(cred?.google_id || email), google_email: email, verified: !!cred?.google_id };
}

export class GoogleLinkConflict extends Error {}

/** The signed-in person links the Google account they just proved (sub + verified e-mail). */
export async function linkVerifiedGoogle(userId: number, sub: string, email: string): Promise<void> {
  const other = await one(sql`SELECT user_id FROM AuthCredential WHERE google_id = ${sub} AND user_id <> ${userId} LIMIT 1`);
  if (other) throw new GoogleLinkConflict("This Google account is already linked to another person.");
  await ensureCredential(userId);
  await db.execute(sql`UPDATE AuthCredential SET google_id = ${sub} WHERE user_id = ${userId}`);
  try {
    await db.execute(sql`UPDATE AuthCredential SET google_email = ${normEmail(email)} WHERE user_id = ${userId}`);
  } catch (err) {
    if (!missingColumn(err)) throw err;
  }
}

/**
 * An admin names the Google e-mail a person uses for attendance (null clears it).
 * Changing it forgets the old account id, so only the named account matches.
 */
export async function setAttendanceGoogleEmail(userId: number, email: string | null): Promise<void> {
  const value = email ? normEmail(email) : null;
  if (value) {
    const other = await one(sql`SELECT a.user_id FROM AuthCredential a JOIN \`User\` u ON u.user_id = a.user_id
      WHERE (LOWER(a.google_email) = ${value} OR LOWER(u.email) = ${value}) AND a.user_id <> ${userId} LIMIT 1`).catch((err) => {
      if (missingColumn(err)) return undefined;
      throw err;
    });
    if (other) throw new GoogleLinkConflict("Another person already uses this e-mail.");
  }
  await ensureCredential(userId);
  const current = await readAttendanceGoogle(userId);
  try {
    await db.execute(sql`UPDATE AuthCredential SET google_email = ${value} WHERE user_id = ${userId}`);
  } catch (err) {
    if (missingColumn(err)) throw new Error("Run migration 149 first.");
    throw err;
  }
  if (normEmail(current.google_email) !== normEmail(value)) {
    await db.execute(sql`UPDATE AuthCredential SET google_id = NULL WHERE user_id = ${userId}`);
  }
}

/** The person unlinks their Google account (Google sign-in keeps working by e-mail match). */
export async function unlinkGoogle(userId: number): Promise<void> {
  await db.execute(sql`UPDATE AuthCredential SET google_id = NULL WHERE user_id = ${userId}`);
  try {
    await db.execute(sql`UPDATE AuthCredential SET google_email = NULL WHERE user_id = ${userId}`);
  } catch (err) {
    if (!missingColumn(err)) throw err;
  }
}
