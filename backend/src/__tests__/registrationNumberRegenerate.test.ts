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

  it("force:true regenerates a number a student already has", async () => {
    const studentId = await createUser({ userType: "STUDENT" });

    await request(app)
      .post("/users/students/generate-registration-numbers")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const original = await regNumberOf(studentId);
    expect(original).toMatch(/^120823-\d{4,}$/);

    const res = await request(app)
      .post("/users/students/generate-registration-numbers")
      .set("Authorization", `Bearer ${token}`)
      .send({ force: true });

    expect(res.status).toBe(200);
    const regenerated = await regNumberOf(studentId);
    expect(regenerated).toMatch(/^120823-\d{4,}$/);
    expect(regenerated).not.toBe(original);
  });
});
