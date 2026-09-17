import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { createUser, createRoleWithPermissions, assignRole, signToken } from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// Phase 6: VIEW_REPORTS / EXPORT_REPORTS / MANAGE_REPORTS replace the single
// ALL_SUBMITTED_REPORTS permission. Matrix-tested across representative
// view/export/manage endpoints, plus confirmation that the legacy
// ALL_SUBMITTED_REPORTS permission still works as an OR-fallback so no
// existing admin role loses access on cutover.
describe("Reporting permission split — view/export/manage matrix", () => {
  let viewOnlyToken: string;
  let exportOnlyToken: string;
  let manageOnlyToken: string;
  let noPermsToken: string;
  let legacyOnlyToken: string;

  beforeAll(async () => {
    const viewUserId = await createUser({ userType: "ADMIN" });
    const viewRoleId = await createRoleWithPermissions("VIEW_ONLY_ROLE", [Permissions.VIEW_REPORTS]);
    await assignRole(viewUserId, viewRoleId);
    viewOnlyToken = signToken(viewUserId);

    const exportUserId = await createUser({ userType: "ADMIN" });
    const exportRoleId = await createRoleWithPermissions("EXPORT_ONLY_ROLE", [Permissions.EXPORT_REPORTS]);
    await assignRole(exportUserId, exportRoleId);
    exportOnlyToken = signToken(exportUserId);

    const manageUserId = await createUser({ userType: "ADMIN" });
    const manageRoleId = await createRoleWithPermissions("MANAGE_ONLY_ROLE", [Permissions.MANAGE_REPORTS]);
    await assignRole(manageUserId, manageRoleId);
    manageOnlyToken = signToken(manageUserId);

    const noPermsUserId = await createUser({ userType: "ADMIN" });
    noPermsToken = signToken(noPermsUserId);

    const legacyUserId = await createUser({ userType: "ADMIN" });
    const legacyRoleId = await createRoleWithPermissions("LEGACY_ROLE", [Permissions.ALL_SUBMITTED_REPORTS]);
    await assignRole(legacyUserId, legacyRoleId);
    legacyOnlyToken = signToken(legacyUserId);
  });

  const asToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  it("VIEW_REPORTS holder can read the lesson-reports list but cannot export or manage categories", async () => {
    const view = await request(app).get("/reports/admin/lesson-reports").set(asToken(viewOnlyToken));
    expect(view.status).toBe(200);

    const exportRes = await request(app).get("/reports/admin/export").set(asToken(viewOnlyToken));
    expect(exportRes.status).toBe(403);

    const manageRes = await request(app)
      .post("/reports/admin/categories/challenge")
      .set(asToken(viewOnlyToken))
      .send({ label: "Should not be created" });
    expect(manageRes.status).toBe(403);
  });

  it("EXPORT_REPORTS holder can export but cannot read the view-gated list or manage categories", async () => {
    const view = await request(app).get("/reports/admin/lesson-reports").set(asToken(exportOnlyToken));
    expect(view.status).toBe(403);

    const exportRes = await request(app).get("/reports/admin/export").set(asToken(exportOnlyToken));
    expect(exportRes.status).toBe(200);

    const manageRes = await request(app)
      .post("/reports/admin/categories/challenge")
      .set(asToken(exportOnlyToken))
      .send({ label: "Should not be created either" });
    expect(manageRes.status).toBe(403);
  });

  it("MANAGE_REPORTS holder can manage categories but cannot view or export", async () => {
    const view = await request(app).get("/reports/admin/lesson-reports").set(asToken(manageOnlyToken));
    expect(view.status).toBe(403);

    const exportRes = await request(app).get("/reports/admin/export").set(asToken(manageOnlyToken));
    expect(exportRes.status).toBe(403);

    const manageRes = await request(app)
      .post("/reports/admin/categories/challenge")
      .set(asToken(manageOnlyToken))
      .send({ label: `Matrix Test Category ${Date.now()}` });
    expect(manageRes.status).toBe(201);
  });

  it("a user with none of the three permissions is blocked everywhere", async () => {
    const view = await request(app).get("/reports/admin/lesson-reports").set(asToken(noPermsToken));
    expect(view.status).toBe(403);

    const exportRes = await request(app).get("/reports/admin/export").set(asToken(noPermsToken));
    expect(exportRes.status).toBe(403);

    const manageRes = await request(app)
      .post("/reports/admin/categories/challenge")
      .set(asToken(noPermsToken))
      .send({ label: "Should not be created" });
    expect(manageRes.status).toBe(403);
  });

  it("a role holding only the legacy ALL_SUBMITTED_REPORTS permission retains full access via the OR-fallback", async () => {
    const view = await request(app).get("/reports/admin/lesson-reports").set(asToken(legacyOnlyToken));
    expect(view.status).toBe(200);

    const exportRes = await request(app).get("/reports/admin/export").set(asToken(legacyOnlyToken));
    expect(exportRes.status).toBe(200);

    const manageRes = await request(app)
      .post("/reports/admin/categories/challenge")
      .set(asToken(legacyOnlyToken))
      .send({ label: `Legacy Fallback Category ${Date.now()}` });
    expect(manageRes.status).toBe(201);
  });
});
