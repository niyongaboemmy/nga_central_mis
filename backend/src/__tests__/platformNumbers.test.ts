/**
 * The platform console's numbers (dashboard, schools list, school dashboard, billing):
 * live from the school's own database rather than the nightly snapshot, "active" = used
 * an app OR signed in, a real per-day series, effective limits, and billing totals that
 * the database computes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { controlPool } from "../db/platform";
import { poolFor } from "../db/pools";
import { forgetLiveUsage, tenantUsage } from "../services/tenantMgmt/usage";
import { addOverride } from "../services/tenantMgmt/lifecycle";
import { overview } from "../services/tenantMgmt/overview";
import { ensurePlatform, platformUser, provisionSchool, removeSchool } from "../test/tenantMgmtFixtures";

let school: Awaited<ReturnType<typeof provisionSchool>>;
let owner: { id: number; token: string };
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const listItem = async () => {
  forgetLiveUsage();
  const res = await request(app).get("/platform/tenants").set(auth(owner.token));
  expect(res.status).toBe(200);
  return res.body.data.find((t: any) => t.tid === school.tid);
};
const today = () => new Date().toISOString().slice(0, 10);

async function addPerson(type: "STUDENT" | "TEACHER"): Promise<number> {
  const pool = poolFor(school.tid);
  const stamp = `${Date.now()}${Math.round(Math.random() * 1e4)}`;
  const [u]: any = await pool.query("INSERT INTO `User` (username, email, status) VALUES (?, ?, 'ACTIVE')", [`p${stamp}`, `p${stamp}@school.test`]);
  await pool.query("INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (?, 'Test', 'Person', ?)", [u.insertId, type]);
  return Number(u.insertId);
}

beforeAll(async () => {
  await ensurePlatform();
  delete process.env.TENANCY_PROVISION_SECRET;
  school = await provisionSchool({ pkg: "gold" });
  owner = await platformUser(["PLATFORM_TENANTS_VIEW", "PLATFORM_TENANTS_LIFECYCLE", "PLATFORM_TENANTS_ENTITLEMENTS"]);
}, 300_000);

afterAll(async () => {
  await removeSchool(school?.tid, school?.applicationId);
});

describe("schools list numbers are live", () => {
  it("counts a new student at once, with no snapshot row for today", async () => {
    await controlPool().query("DELETE FROM TenantUsageDaily WHERE tenant_id = ?", [school.tid]);
    const before = await listItem();
    expect(before.usageLive).toBe(true);
    await addPerson("STUDENT");
    await addPerson("TEACHER");
    const after = await listItem();
    expect(after.students).toBe(before.students + 1);
    expect(after.staff).toBe(before.staff + 1);
  });

  it("counts a person who used an app this week without signing in again", async () => {
    const before = await listItem();
    const uid = await addPerson("TEACHER");
    await poolFor(school.tid).query(
      "INSERT INTO AnalyticsSession (device_id, user_id, started_at, last_activity_at, entry_app, is_bot) VALUES (?, ?, ?, ?, 1, 0)",
      [`dev${uid}`.padEnd(22, "x").slice(0, 22), uid, new Date(Date.now() - 3 * 86_400_000), new Date()],
    );
    const after = await listItem();
    expect(after.activeUsers7d).toBe(before.activeUsers7d + 1);
    expect(new Date(after.lastActivityAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("reports the school's effective limits (overrides included)", async () => {
    await addOverride(school.tid, { key: "limit.students", value: 1234, reason: "test override" }, { userId: owner.id });
    const item = await listItem();
    expect(item.limits.students).toBe(1234);
  });
});

describe("school dashboard series", () => {
  it("returns 30 consecutive days, oldest first, with real daily actives and full-day counters", async () => {
    const uid = await addPerson("STUDENT");
    await poolFor(school.tid).query(
      "INSERT INTO AuthEvent (occurred_at, kind, outcome, user_id) VALUES (?, 'login', 'success', ?)",
      [new Date(), uid],
    );
    await controlPool().query(
      "INSERT INTO TenantUsageCounter (tenant_id, ent_key, period, used) VALUES (?, 'limit.ai_requests_day', ?, 7) ON DUPLICATE KEY UPDATE used = 7",
      [school.tid, today()],
    );
    const usage = await tenantUsage(school.tid);
    expect(usage.daily).toHaveLength(30);
    const days = usage.daily.map((d) => d.day);
    expect([...days].sort()).toEqual(days);
    expect(days[29]).toBe(today());
    expect(new Set(days).size).toBe(30);
    const last = usage.daily[29];
    expect(last.activeUsers).toBeGreaterThanOrEqual(1);
    expect(last.aiRequests).toBe(7);
  });
});

describe("billing totals", () => {
  it("open invoices and their ageing come from the database and add up", async () => {
    const o: any = await overview([]);
    const [[sql]]: any = await controlPool().query("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM Invoice WHERE status IN ('ISSUED','OVERDUE')");
    expect(o.billing.openInvoices).toBe(Number(sql.n));
    expect(o.billing.outstanding).toBe(Number(sql.total));
    const a = o.billing.ageing;
    expect(a.notDue + a.d30 + a.d60 + a.d61).toBe(o.billing.openInvoices);
    expect(o.collectedMonthly).toHaveLength(6);
    expect(o.collectedMonthly[5].month).toBe(today().slice(0, 7));
  });
});
