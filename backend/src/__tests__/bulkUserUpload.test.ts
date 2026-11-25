/**
 * POST /users/bulk: an Excel file of people becomes accounts (temporary password, profile,
 * role), bad rows are reported by row number, and the request stays fast enough for the
 * browser (it used to hash one password at a time and run access rules per row).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import * as XLSX from "xlsx";
import { inArray, eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AuthCredential, Role, User, UserProfile, UserRole } from "../db/schema";
import emailService from "../utils/email";
import { assignRole, createRoleWithPermissions, createUser, signToken } from "../test/fixtures";

let token: string;
let teacherRoleId: number;
const stamp = Date.now().toString(36);

const sheet = (rows: Array<Record<string, string>>) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Users");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

beforeAll(async () => {
  vi.spyOn(emailService, "sendAccountCreation").mockResolvedValue(true as any);
  const admin = await createUser({ userType: "ADMIN" });
  await assignRole(admin, await createRoleWithPermissions("BULK_ADMIN", ["MANAGE_USERS"]));
  token = signToken(admin);
  const [teacher] = await db.select({ id: Role.role_id }).from(Role).where(eq(Role.name, "TEACHER")).limit(1);
  teacherRoleId = teacher?.id ?? (await createRoleWithPermissions("TEACHER_BULK", []));
});

describe("bulk user upload", () => {
  it("creates every valid row with a temporary password, profile and role, and reports the bad ones", async () => {
    const good = Array.from({ length: 12 }, (_, i) => ({
      username: `bulk_${stamp}_${i}`,
      email: `bulk_${stamp}_${i}@example.test`,
      first_name: "Bulk",
      last_name: `Teacher ${i}`,
      user_type: "TEACHER",
    }));
    const rows = [...good, { ...good[0], email: `dup_${stamp}@example.test` }, { username: `bad_${stamp}`, email: "not-an-email" }];
    const started = Date.now();
    const res = await request(app)
      .post("/users/bulk")
      .set("Authorization", `Bearer ${token}`)
      .field("role_id", String(teacherRoleId))
      .attach("file", sheet(rows), "people.xlsx");
    const took = Date.now() - started;

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(12);
    expect(res.body.data.failed).toBe(2);
    expect(res.body.data.errors.join("\n")).toMatch(/Row 14/); // duplicate username
    expect(res.body.data.errors.join("\n")).toMatch(/Row 15: Invalid email/);
    // 12 accounts in well under the browser's old 10 s limit (was ~0.35 s per row)
    expect(took).toBeLessThan(10_000);

    const users = await db.select({ id: User.user_id }).from(User).where(inArray(User.username, good.map((g) => g.username)));
    expect(users).toHaveLength(12);
    const ids = users.map((u) => u.id);
    const creds = await db.select().from(AuthCredential).where(inArray(AuthCredential.user_id, ids));
    expect(creds).toHaveLength(12);
    expect(creds.every((c) => c.force_password_change === 1 && /^\$2[aby]\$12\$/.test(c.password_hash))).toBe(true);
    expect(new Set(creds.map((c) => c.password_hash)).size).toBe(12); // every person has their own password
    const profiles = await db.select().from(UserProfile).where(inArray(UserProfile.user_id, ids));
    expect(profiles.every((p) => p.user_type === "TEACHER")).toBe(true);
    const roles = await db.select().from(UserRole).where(inArray(UserRole.user_id, ids));
    expect(roles.filter((r) => r.role_id === teacherRoleId)).toHaveLength(12);
    expect(emailService.sendAccountCreation).toHaveBeenCalledTimes(12);
  }, 60_000);
});
