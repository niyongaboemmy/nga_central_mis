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

import { eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { RegistrationSequence, School, UserProfile } from "../db/schema";

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

/**
 * Resets the global sequence back to 0 -- used before a full regeneration
 * so the renumbered students come out as a clean 0001, 0002, ... run rather
 * than continuing from whatever value the counter was already at.
 */
export const resetRegistrationSequence = async (): Promise<void> => {
  await db
    .update(RegistrationSequence)
    .set({ current_value: 0 })
    .where(eq(RegistrationSequence.id, SEQUENCE_ROW_ID));
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

/**
 * Pulls the counter up to the highest number already issued for this school code.
 *
 * The counter is the only source of new numbers, but it is not the only way numbers get
 * into UserProfile: a restored database, an imported roster, or a `force` regeneration that
 * reset the counter all leave numbers on disk that the counter knows nothing about. The next
 * backfill then re-issues one of them and dies on the UNIQUE index — surfacing to an admin
 * as a bare 409 with nothing to act on.
 *
 * Never moves the counter down, so it can't hand out a number twice.
 */
export const syncRegistrationSequenceToIssued = async (
  schoolCode: string,
): Promise<number> => {
  const rows = await db
    .select({ registration_number: UserProfile.registration_number })
    .from(UserProfile)
    .where(isNotNull(UserProfile.registration_number));

  let highest = 0;
  for (const row of rows) {
    const parsed = parseRegistrationNumber(row.registration_number);
    if (parsed && parsed.schoolCode === schoolCode && parsed.seq > highest) {
      highest = parsed.seq;
    }
  }

  const [current] = await db
    .select({ value: RegistrationSequence.current_value })
    .from(RegistrationSequence)
    .where(eq(RegistrationSequence.id, SEQUENCE_ROW_ID));

  if (highest > (current?.value ?? 0)) {
    await db
      .update(RegistrationSequence)
      .set({ current_value: highest })
      .where(eq(RegistrationSequence.id, SEQUENCE_ROW_ID));
  }
  return highest;
};

/** The registration number the next registered student should get. */
export const generateStudentRegistrationNumber = async (): Promise<string> => {
  const schoolCode = await getSchoolCode();
  const seq = await nextRegistrationSequence();
  return formatRegistrationNumber(schoolCode, seq);
};
