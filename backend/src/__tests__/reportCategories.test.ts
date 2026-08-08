import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// Phase 4: admin-managed lookup lists for the "Support Needed"/"Challenges"
// multi-selects, and confirmation that any authenticated (non-admin) user
// can still read the active list to populate their own picker.
describe("Support Request / Challenge category CRUD", () => {
  let adminToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    const adminId = await createUser({ userType: "ADMIN" });
    const roleId = await createRoleWithPermissions("CATEGORY_ADMIN", [
      Permissions.ALL_SUBMITTED_REPORTS,
    ]);
    await assignRole(adminId, roleId);
    adminToken = signToken(adminId);

    const teacherId = await createUser();
    teacherToken = signToken(teacherId);
  });

  it("lets any authenticated user read the active support-request category list", async () => {
    const res = await request(app)
      .get("/reports/categories/support-request")
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Seeded by migration 045
    expect(res.body.data.some((c: any) => c.label.includes("Technical"))).toBe(true);
  });

  it("blocks a non-admin from creating a category", async () => {
    const res = await request(app)
      .post("/reports/admin/categories/challenge")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ label: "Weather Disruption" });
    expect(res.status).toBe(403);
  });

  it("lets an admin create, update, and deactivate a challenge category", async () => {
    const label = `Weather Disruption ${Date.now()}`;
    const createRes = await request(app)
      .post("/reports/admin/categories/challenge")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label });
    expect(createRes.status).toBe(201);
    const categoryId = createRes.body.data.category_id;

    const listAfterCreate = await request(app)
      .get("/reports/categories/challenge")
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(listAfterCreate.body.data.some((c: any) => c.category_id === categoryId)).toBe(true);

    const updateRes = await request(app)
      .put(`/reports/admin/categories/challenge/${categoryId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: `Severe ${label}` });
    expect(updateRes.status).toBe(200);

    const deactivateRes = await request(app)
      .delete(`/reports/admin/categories/challenge/${categoryId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deactivateRes.status).toBe(200);

    const listAfterDeactivate = await request(app)
      .get("/reports/categories/challenge")
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(listAfterDeactivate.body.data.some((c: any) => c.category_id === categoryId)).toBe(false);
  });
});
