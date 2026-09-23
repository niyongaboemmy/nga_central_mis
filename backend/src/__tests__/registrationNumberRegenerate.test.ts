import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { School, UserProfile } from "../db/schema";
import {
  createUser,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";

// POST /users/students/generate-registration-numbers backfills numbers for
// students with none; force:true additionally overwrites students that
// already have one -- e.g. after changing the number format/school code.
describe("Generate/regenerate student registration numbers", () => {
  let token: string;

  beforeAll(async () => {
    const adminId = await createUser({ userType: "ADMIN" });
    const roleId = await createRoleWithPermissions("regnum-admin", [
      "MANAGE_USERS",
    ]);
    await assignRole(adminId, roleId);
    token = signToken(adminId);

    const existing = await db
      .select({ school_id: School.school_id })
      .from(School)
      .where(eq(School.school_id, 1));
    if (existing.length === 0) {
      await db.insert(School).values({
        school_id: 1,
        name: "Test School",
        school_code: "120823",
        status: "ACTIVE",
      });
    } else {
      await db
        .update(School)
        .set({ school_code: "120823", status: "ACTIVE" })
        .where(eq(School.school_id, 1));
    }
  });

  const regNumberOf = async (userId: number) => {
    const [row] = await db
      .select({ registration_number: UserProfile.registration_number })
      .from(UserProfile)
      .where(eq(UserProfile.user_id, userId));
    return row?.registration_number ?? null;
  };

  it("only fills students that have no registration number yet", async () => {
    const studentId = await createUser({ userType: "STUDENT" });
    expect(await regNumberOf(studentId)).toBeNull();

    const res = await request(app)
      .post("/users/students/generate-registration-numbers")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    const assigned = await regNumberOf(studentId);
    expect(assigned).toMatch(/^120823-\d{4,}$/);

    // Running again with no new students leaves it untouched.
    await request(app)
      .post("/users/students/generate-registration-numbers")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(await regNumberOf(studentId)).toBe(assigned);
  });

  it("force:true rewrites a number a student already has, instead of skipping them", async () => {
    const studentId = await createUser({ userType: "STUDENT" });

    const backfill = await request(app)
      .post("/users/students/generate-registration-numbers")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(backfill.status).toBe(200);
    expect(await regNumberOf(studentId)).toMatch(/^120823-\d{4,}$/);

    // Stand in for the thing force exists for: a number left over from an old school code.
    await db
      .update(UserProfile)
      .set({ registration_number: "OLD-9999" })
      .where(eq(UserProfile.user_id, studentId));

    const res = await request(app)
      .post("/users/students/generate-registration-numbers")
      .set("Authorization", `Bearer ${token}`)
      .send({ force: true });
    expect(res.status).toBe(200);

    // The point of force is that it does not skip students who already have a number.
    // Asserting the *value* changed would be wrong: a stable oldest-first sequence is
    // supposed to hand the same student the same number when nothing else moved.
    expect(await regNumberOf(studentId)).toMatch(/^120823-\d{4,}$/);
    expect(res.body.data.updated).toBe(res.body.data.total);
    expect(res.body.data.updated).toBeGreaterThan(backfill.body.data.updated);
  });

  it("backfills after numbers were imported without the counter knowing", async () => {
    // A restored database or an imported roster leaves numbers on disk that the counter
    // has never seen; the next backfill used to re-issue one and die on the UNIQUE index.
    const importedId = await createUser({ userType: "STUDENT" });
    await db
      .update(UserProfile)
      .set({ registration_number: "120823-9001" })
      .where(eq(UserProfile.user_id, importedId));

    const freshId = await createUser({ userType: "STUDENT" });
    const res = await request(app)
      .post("/users/students/generate-registration-numbers")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    const assigned = await regNumberOf(freshId);
    expect(assigned).toBe("120823-9002");
    // The imported number is left exactly as it was.
    expect(await regNumberOf(importedId)).toBe("120823-9001");
  });
});
