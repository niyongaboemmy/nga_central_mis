import { describe, it, expect } from "vitest";
import request from "supertest";
import { sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { createUser, createRoleWithPermissions, assignRole, signToken } from "../test/fixtures";
import { loadOfficeHourOccurrences } from "../services/officeHours/reminders";
import { tick } from "../services/officeHours/scheduler";

// Deployed before migration 102 (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §21): the Reminder Hub,
// Home and the scheduler skip office hours; the API says it is being set up. Runs only
// against a database without the office-hours tables.
const hasTables = async () => {
  const rows = (await db.execute(sql`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'OfficeHourSession'`)) as any;
  return Number(rows[0][0].n) > 0;
};

describe("office hours before migration 102", () => {
  it("degrades quietly everywhere", async () => {
    if (await hasTables()) return; // the normal test clones have 102 applied
    expect(await loadOfficeHourOccurrences(1, new Date(), new Date(Date.now() + 86_400_000))).toEqual([]);
    await expect(tick()).resolves.toBeUndefined();
    const u = await createUser({ userType: "TEACHER" });
    await assignRole(u, await createRoleWithPermissions("OH_NOMIG", ["OFFICE_HOURS_MANAGE_OWN"]));
    const res = await request(app).get("/office-hours/my").set("Authorization", `Bearer ${signToken(u)}`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("OFFICE_HOURS_NOT_SET_UP");
    const home = await request(app).get("/home/overview").set("Authorization", `Bearer ${signToken(u)}`);
    expect(home.status).toBe(200);
    expect(JSON.stringify(home.body)).not.toMatch(/office_hours/);
  });
});
