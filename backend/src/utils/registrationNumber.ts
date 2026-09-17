/**
 * Student registration numbers.
 *
 * Format: "<school code>-<4-digit sequence>" (e.g. 120823-0001). The school
 * code comes from School (school details) rather than being hardcoded, so
 * each deployment can set its own without a code change.
 *
 * The sequence itself is global and never resets: it comes from
 * `RegistrationSequence`, a single-row counter claimed under a row lock
 * (inside a transaction) rather than derived from MAX() over UserProfile, so
 * concurrent student creations can never race each other into issuing the
 * same number.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { RegistrationSequence, School } from "../db/schema";

const SEQUENCE_PAD = 4;
const SEQUENCE_ROW_ID = 1;

export const formatRegistrationNumber = (
  schoolCode: string,
  seq: number,
): string => `${schoolCode}-${String(seq).padStart(SEQUENCE_PAD, "0")}`;

const REGISTRATION_NUMBER_RE = /^([A-Za-z0-9]+)-(\d+)$/;

export const parseRegistrationNumber = (
  value?: string | null,
): { schoolCode: string; seq: number } | null => {
  if (!value) return null;
  const match = REGISTRATION_NUMBER_RE.exec(value.trim());
  if (!match) return null;
  return { schoolCode: match[1], seq: parseInt(match[2], 10) };
};

/**
 * The active school's registration-number prefix, as set in School details.
 * Throws if no school is configured with a code yet -- better to fail loudly
 * than silently issue a malformed registration number.
 */
export const getSchoolCode = async (): Promise<string> => {
  const [school] = await db
    .select({ school_code: School.school_code })
    .from(School)
    .where(eq(School.status, "ACTIVE"))
    .orderBy(School.school_id)
    .limit(1);

  if (!school?.school_code) {
    throw new Error(
      "No school code is set. Set one in School details before registering students.",
    );
  }
  return school.school_code;
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

/** The registration number the next registered student should get. */
export const generateStudentRegistrationNumber = async (): Promise<string> => {
  const schoolCode = await getSchoolCode();
  const seq = await nextRegistrationSequence();
  return formatRegistrationNumber(schoolCode, seq);
};
