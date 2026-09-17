import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createRoleWithPermissions,
  assignRole,
  signToken,
  createInstructorReport,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

describe("Report ownership & access control (Phase 0)", () => {
  let ownerId: number;
  let ownerToken: string;
  let otherUserId: number;
  let otherToken: string;
  let adminUserId: number;
  let adminToken: string;
  let reportId: number;

  beforeAll(async () => {
    ownerId = await createUser();
    ownerToken = signToken(ownerId);

    otherUserId = await createUser();
    otherToken = signToken(otherUserId);

    adminUserId = await createUser({ userType: "ADMIN" });
    const adminRoleId = await createRoleWithPermissions("ADMIN_ROLE", [
      Permissions.ALL_SUBMITTED_REPORTS,
    ]);
    await assignRole(adminUserId, adminRoleId);
    adminToken = signToken(adminUserId);

    reportId = await createInstructorReport({ userId: ownerId });
  });

  it("lets the owner read their own report", async () => {
    const res = await request(app)
      .get(`/reports/${reportId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.report_id).toBe(reportId);
  });

  it("returns 403 when a different, unprivileged user reads someone else's report by ID", async () => {
    const res = await request(app)
      .get(`/reports/${reportId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("lets a user holding ALL_SUBMITTED_REPORTS read any report", async () => {
    const res = await request(app)
      .get(`/reports/${reportId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.report_id).toBe(reportId);
  });

  // PUT /reports/:id (updateReport) was retired in the Phase 5 follow-up —
  // it had no remaining frontend caller once ReportForm.tsx was dropped from
  // active navigation. The ownership-guard regression coverage that used to
  // live here is superseded by legacyReportRoutesRetirement.test.ts, which
  // asserts the endpoint now returns 410 for everyone, owner included.
  it("PUT /reports/:id is retired (410) even for the report's own owner", async () => {
    const res = await request(app)
      .put(`/reports/${reportId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ start_date: "2026-01-05", end_date: "2026-01-09", key_highlights: "Updated" });
    expect(res.status).toBe(410);
  });

  it("rejects requests with no auth token", async () => {
    const res = await request(app).get(`/reports/${reportId}`);
    expect(res.status).toBe(401);
  });
});
