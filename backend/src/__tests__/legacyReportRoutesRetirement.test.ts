import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { createUser, signToken, createInstructorReport } from "../test/fixtures";

// Phase 5 follow-up: five endpoints with zero remaining frontend callers
// (confirmed via a grep of every reportsApi.* call site — ReportForm.tsx,
// SubmittedReports.tsx, and ReportingCalendar.tsx are all unreachable since
// ReportingModule.tsx dropped their tabs) now return a controlled 410, not a
// silent 404 or a working-but-orphaned endpoint. GET /dashboard-stats and
// GET /:id are intentionally NOT retired — both still have live callers
// (the instructor's own Dashboard tab, and the admin's legacy report-detail
// view, respectively) — confirmed still functioning here too.
describe("Legacy reporting routes — retirement", () => {
  let userId: number;
  let token: string;
  let reportId: number;

  beforeAll(async () => {
    userId = await createUser();
    token = signToken(userId);
    reportId = await createInstructorReport({ userId });
  });

  it("returns 410 for the five retired endpoints", async () => {
    const auth = { Authorization: `Bearer ${token}` };

    const submitRes = await request(app).post("/reports/submit").set(auth).send({});
    expect(submitRes.status).toBe(410);

    const autofillRes = await request(app).get("/reports/autofill").set(auth);
    expect(autofillRes.status).toBe(410);

    const listRes = await request(app).get("/reports").set(auth);
    expect(listRes.status).toBe(410);

    const updateRes = await request(app).put(`/reports/${reportId}`).set(auth).send({});
    expect(updateRes.status).toBe(410);

    const byDateRes = await request(app).get("/reports/by-date").query({ date: "2026-01-01" }).set(auth);
    expect(byDateRes.status).toBe(410);
  });

  it("keeps GET /dashboard-stats and GET /:id working (still have live callers)", async () => {
    const auth = { Authorization: `Bearer ${token}` };

    const dashboardRes = await request(app).get("/reports/dashboard-stats").set(auth);
    expect(dashboardRes.status).toBe(200);

    const byIdRes = await request(app).get(`/reports/${reportId}`).set(auth);
    expect(byIdRes.status).toBe(200);
  });
});
