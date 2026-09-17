import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { School, RegistrationSequence } from "../db/schema";
import {
  formatRegistrationNumber,
  parseRegistrationNumber,
  getSchoolCode,
  generateStudentRegistrationNumber,
} from "./registrationNumber";

const SCHOOL_ID = 1;
const SEQUENCE_ROW_ID = 1;

async function setSchoolCode(code: string | null) {
  const existing = await db
    .select({ school_id: School.school_id })
    .from(School)
    .where(eq(School.school_id, SCHOOL_ID));

  if (existing.length === 0) {
    await db.insert(School).values({
      school_id: SCHOOL_ID,
      name: "Test School",
      school_code: code,
      status: "ACTIVE",
    });
  } else {
    await db
      .update(School)
      .set({ school_code: code, status: "ACTIVE" })
      .where(eq(School.school_id, SCHOOL_ID));
  }
}

async function resetSequence(value = 0) {
  await db
    .insert(RegistrationSequence)
    .values({ id: SEQUENCE_ROW_ID, current_value: value })
    .onDuplicateKeyUpdate({ set: { current_value: value } });
}

describe("registration number formatting", () => {
  it("pads the sequence to 4 digits and joins with the school code", () => {
    expect(formatRegistrationNumber("120823", 1)).toBe("120823-0001");
    expect(formatRegistrationNumber("120823", 42)).toBe("120823-0042");
    expect(formatRegistrationNumber("120823", 10000)).toBe("120823-10000");
  });

  it("parses a well-formed registration number back apart", () => {
    expect(parseRegistrationNumber("120823-0001")).toEqual({
      schoolCode: "120823",
      seq: 1,
    });
  });

  it("returns null for malformed input", () => {
    expect(parseRegistrationNumber(null)).toBeNull();
    expect(parseRegistrationNumber("")).toBeNull();
    expect(parseRegistrationNumber("not-a-number")).toBeNull();
  });
});

describe("getSchoolCode", () => {
  it("throws when the active school has no code set", async () => {
    await setSchoolCode(null);
    await expect(getSchoolCode()).rejects.toThrow(/no school code/i);
  });

  it("returns the active school's code once set", async () => {
    await setSchoolCode("120823");
    await expect(getSchoolCode()).resolves.toBe("120823");
  });
});

describe("generateStudentRegistrationNumber", () => {
  beforeEach(async () => {
    await setSchoolCode("120823");
    await resetSequence(0);
  });

  it("issues 120823-0001 for the first student", async () => {
    await expect(generateStudentRegistrationNumber()).resolves.toBe(
      "120823-0001",
    );
  });

  it("increments the sequence on each subsequent call", async () => {
    const first = await generateStudentRegistrationNumber();
    const second = await generateStudentRegistrationNumber();
    const third = await generateStudentRegistrationNumber();

    expect([first, second, third]).toEqual([
      "120823-0001",
      "120823-0002",
      "120823-0003",
    ]);
  });

  it("issues unique numbers under concurrent calls", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => generateStudentRegistrationNumber()),
    );
    expect(new Set(results).size).toBe(10);
  });
});
