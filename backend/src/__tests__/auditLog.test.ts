import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { ActivityLog } from "../db/schema";
import { assignRole, createRoleWithPermissions, createUser, signToken } from "../test/fixtures";
import { verbOf } from "../services/auditLog";

/**
 * Audit log (GET /systems/logs, /logs/summary, /logs/export.csv): figures cover the
 * whole filtered range (not the visible page), the total is a real COUNT, and
 * filters (action, entity, kind, person, text) narrow every view the same way.
 */
const DAY = "2031-03-10"; // far from real data, so the range only holds this test's rows
let viewer: number, alice: number, bob: number, outsider: number;
const ids: number[] = [];
const get = (u: number, p: string) => request(app).get(`/systems${p}`).set("Authorization", `Bearer ${signToken(u)}`);

beforeAll(async () => {
  viewer = await createUser({ userType: "ADMIN" });
  await assignRole(viewer, await createRoleWithPermissions("audit_viewer", ["VIEW_ALL_LOGS_HISTORY"]));
  alice = await createUser({ userType: "TEACHER" });
  bob = await createUser({ userType: "TEACHER" });
  outsider = await createUser({ userType: "TEACHER" });
  const row = (user: number, action: string, hour: number, entity: string | null, desc: string) => ({
    user_id: user,
    action_type: action,
    description: desc,
    entity_type: entity,
    entity_id: entity ? 7 : null,
    // Wall-clock string, like DEFAULT CURRENT_TIMESTAMP writes (a JS Date would be sent as UTC).
    created_at: sql`${`${DAY} ${String(hour).padStart(2, "0")}:15:00`}` as any,
  });
  // Leftovers from an earlier run on this fixed day would skew the counts.
  await db.delete(ActivityLog).where(sql`${ActivityLog.created_at} BETWEEN ${`${DAY} 00:00:00`} AND ${`${DAY} 23:59:59`}`);
  const rows = [
    ...Array.from({ length: 25 }, (_, i) => row(alice, "LESSON_NOTE_CREATE", 8 + (i % 4), "LessonNote", `Created note ${i}`)),
    ...Array.from({ length: 6 }, () => row(bob, "LESSON_NOTE_DELETE", 14, "LessonNote", "Deleted a note")),
    row(bob, "ROLE_PERMISSIONS_ASSIGN", 15, "Role", "Changed role permissions"),
    row(alice, "LOGIN_SUCCESS", 7, null, "Signed in"),
    row(alice, "LOGIN_SUCCESS", 7, null, "Signed in"),
  ];
  for (const r of rows) {
    const [res] = (await db.insert(ActivityLog).values(r)) as any;
    ids.push(Number(res.insertId));
  }
}, 60_000);

const range = `from=${DAY}&to=${DAY}`;
const mine = (body: any) => body.logs.filter((l: any) => ids.includes(l.activity_id));

describe("audit log", () => {
  it("is refused without the permission", async () => {
    expect((await get(outsider, `/logs?${range}`)).status).toBe(403);
    expect((await get(outsider, `/logs/summary?${range}`)).status).toBe(403);
  });

  it("returns a real total and pages through it", async () => {
    const r = await get(viewer, `/logs?${range}&user_id=${alice}&limit=10`);
    expect(r.status).toBe(200);
    expect(r.body.pagination.total).toBe(27);
    expect(r.body.logs).toHaveLength(10);
    expect(r.body.pagination.hasMore).toBe(true);
    expect(r.body.logs[0]).toMatchObject({ user_name: expect.any(String), verb: expect.any(String) });
    const last = await get(viewer, `/logs?${range}&user_id=${alice}&limit=10&offset=20`);
    expect(last.body.logs).toHaveLength(7);
    expect(last.body.pagination.hasMore).toBe(false);
  });

  it("summarises the whole range, not the page", async () => {
    const r = await get(viewer, `/logs/summary?${range}&user_id=${bob}`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(7);
    expect(r.body.gran).toBe("hour");
    expect(r.body.series).toHaveLength(24);
    expect(r.body.series.find((p: any) => p.bucket === `${DAY} 14:00`).count).toBe(6);
    expect(r.body.actions[0]).toEqual({ action: "LESSON_NOTE_DELETE", verb: "DELETE", count: 6 });
    expect(r.body.verbs).toEqual(expect.arrayContaining([{ verb: "DELETE", count: 6 }, { verb: "SECURITY", count: 1 }]));
    expect(r.body.users[0]).toMatchObject({ user_id: bob, count: 7 });
    expect(r.body.heatmap[0][14]).toBe(6); // 2031-03-10 is a Monday
    // Picker options follow the other filters (here: Bob), not the action filter itself.
    expect(r.body.facets.actions.map((a: any) => a.value).sort()).toEqual(["LESSON_NOTE_DELETE", "ROLE_PERMISSIONS_ASSIGN"]);
  });

  it("filters by action, entity, kind and text the same way everywhere", async () => {
    const byAction = await get(viewer, `/logs/summary?${range}&action=LOGIN_SUCCESS,ROLE_PERMISSIONS_ASSIGN`);
    expect(byAction.body.total).toBeGreaterThanOrEqual(3);
    expect(byAction.body.actions.every((a: any) => ["LOGIN_SUCCESS", "ROLE_PERMISSIONS_ASSIGN"].includes(a.action))).toBe(true);
    const byVerb = await get(viewer, `/logs?${range}&verb=DELETE&limit=50`);
    expect(mine(byVerb.body).length).toBe(6);
    expect(mine(byVerb.body).every((l: any) => l.verb === "DELETE")).toBe(true);
    const byEntity = await get(viewer, `/logs/summary?${range}&entity=Role`);
    expect(byEntity.body.entities).toEqual([{ entity: "Role", count: expect.any(Number) }]);
    const byText = await get(viewer, `/logs?${range}&q=${encodeURIComponent("Changed role")}`);
    expect(mine(byText.body).map((l: any) => l.action_type)).toEqual(["ROLE_PERMISSIONS_ASSIGN"]);
  });

  it("exports the filtered range as CSV", async () => {
    const r = await get(viewer, `/logs/export.csv?${range}&user_id=${bob}`);
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/csv/);
    const lines = r.text.trim().split("\n");
    expect(lines[0]).toMatch(/^when,action,kind,description/);
    expect(lines).toHaveLength(1 + 7);
  });

  it("names each action's kind", () => {
    expect(verbOf("LESSON_NOTE_AI_GENERATE")).toBe("AI");
    expect(verbOf("LOGIN_SUCCESS")).toBe("LOGIN");
    expect(verbOf("FOLDER_CREATE")).toBe("CREATE");
    expect(verbOf("LESSON_NOTE_PUBLISH")).toBe("PUBLISH");
    expect(verbOf("SUBJECT_UPDATE")).toBe("UPDATE");
  });
});
