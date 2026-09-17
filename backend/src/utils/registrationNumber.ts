/**
 * Student registration numbers.
 *
 * Format: "NGA-<admission year>-<5-digit sequence>" (e.g. NGA-2026-00001).
 * The year segment records when a student actually registered -- for a
 * brand-new student that's "now", but for backfilling existing students it's
 * their real `User.created_at` year, so a student admitted in 2025 gets
 * NGA-2025-xxxxx even if the backfill runs in 2026.
 *
 * The sequence itself is global and never resets per year: it comes from
 * `RegistrationSequence`, a single-row counter claimed under a row lock
 * (inside a transaction) rather than derived from MAX() over UserProfile, so
 * concurrent student creations can never race each other into issuing the
 * same number.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { RegistrationSequence } from "../db/schema";

const PREFIX = "NGA";
const SEQUENCE_PAD = 5;
const SEQUENCE_ROW_ID = 1;

export const formatRegistrationNumber = (year: number, seq: number): string =>
  `${PREFIX}-${year}-${String(seq).padStart(SEQUENCE_PAD, "0")}`;

const REGISTRATION_NUMBER_RE = /^[A-Z]+-(\d{4})-(\d+)$/;

export const parseRegistrationNumber = (
  value?: string | null,
): { year: number; seq: number } | null => {
  if (!value) return null;
  const match = REGISTRATION_NUMBER_RE.exec(value.trim());
  if (!match) return null;
  return { year: parseInt(match[1], 10), seq: parseInt(match[2], 10) };
};

/** Atomically claims and returns the next value of the global sequence. */
export const nextRegistrationSequence = async (): Promise<number> => {
  return await db.transaction(async (tx) => {
    await tx
      .update(RegistrationSequence)
      .set({ current_value: sql`${RegistrationSequence.current_value} + 1` })
      .where(eq(RegistrationSequence.id, SEQUENCE_ROW_ID));

    const [row] = await tx
      .select({ value: RegistrationSequence.current_value })
      .from(RegistrationSequence)
      .where(eq(RegistrationSequence.id, SEQUENCE_ROW_ID));

    return row.value;
  });
};

/** The registration number a student admitted at `admittedAt` should get. */
export const generateStudentRegistrationNumber = async (
  admittedAt: Date = new Date(),
): Promise<string> => {
  const seq = await nextRegistrationSequence();
  return formatRegistrationNumber(admittedAt.getFullYear(), seq);
};
