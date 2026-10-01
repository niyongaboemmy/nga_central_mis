import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { UserRole } from "../db/schema";
import { AccessGrant, AccessRole } from "../db/accessSchema";
import { createUser, signToken } from "../test/fixtures";
import { ensureAccessRegistry } from "../services/access/registry";
import { ensureLegacyAdminGrants } from "../services/access/backfill";

/**
 * Migration 099 / self-heal: administrators holding the legacy SUPER_ADMIN or
 * ADMIN role always reach Usage & Monitoring, including the live monitor and a
 * person's page; a grant an operator ended stays ended.
 */
const roleOf = async (key: string) =>
  (await db.select().from(AccessRole).where(eq(AccessRole.preset_key, key)).limit(1))[0].role_id;
const get = (u: number, p: string) => request(app).get(p).set("Authorization", `Bearer ${signToken(u)}`);

let owner: number, admin: number, revoked: number, teacher: number;

beforeAll(async () => {
  await ensureAccessRegistry();
  const ownerRole = await roleOf("platform_owner");
  const adminRole = await roleOf("school_administrator");
  // Legacy holders with no v2 grant at all -- the production failure.
  owner = await createUser({ userType: "ADMIN" });
  await db.insert(UserRole).values({ user_id: owner, role_id: ownerRole } as any);
  admin = await createUser({ userType: "ADMIN" });
  await db.insert(UserRole).values({ user_id: admin, role_id: adminRole } as any);
  // An administrator whose grant was ended on purpose in Access Studio.
  revoked = await createUser({ userType: "ADMIN" });
  await db.insert(UserRole).values({ user_id: revoked, role_id: adminRole } as any);
  await db.insert(AccessGrant).values({ user_id: revoked, role_id: adminRole, scope_type: "SCHOOL" as any, source: "MANUAL", status: "ENDED" });
  teacher = await createUser({ userType: "TEACHER" });
}, 60_000);

describe("analytics access for administrators", () => {
  it("heals missing grants for legacy SUPER_ADMIN / ADMIN holders only", async () => {
    const healed = await ensureLegacyAdminGrants();
    const ids = healed.map((h) => h.userId);
    expect(ids).toEqual(expect.arrayContaining([owner, admin]));
    expect(ids).not.toContain(revoked);
    const [g] = await db.select().from(AccessGrant).where(and(eq(AccessGrant.user_id, owner), eq(AccessGrant.status, "ACTIVE")));
    expect(g).toMatchObject({ scope_type: "PLATFORM", source: "MIGRATION" });
    // Idempotent.
    expect((await ensureLegacyAdminGrants()).map((h) => h.userId)).not.toContain(owner);
  });

  it("lets the platform owner open the live monitor and a person", async () => {
    expect((await get(owner, "/monitor/live")).status).toBe(200);
    expect((await get(owner, `/monitor/users/${teacher}`)).status).toBe(200);
    const me = await get(owner, "/access/me?app=mis");
    expect(Object.keys(me.body.data?.caps ?? me.body.caps ?? {})).toEqual(
      expect.arrayContaining(["ANALYTICS_VIEW", "ANALYTICS_LIVE_VIEW", "ANALYTICS_USER_VIEW", "ANALYTICS_USER_CONTROL", "ANALYTICS_CONFIGURE"]),
    );
  });

  it("lets a school administrator watch people live but not control them", async () => {
    expect((await get(admin, "/monitor/live")).status).toBe(200);
    expect((await get(admin, `/monitor/users/${teacher}`)).status).toBe(200);
    const r = await request(app).post(`/monitor/users/${teacher}/signout`).set("Authorization", `Bearer ${signToken(admin)}`).send({ reason: "test" });
    expect(r.status).toBe(403);
  });

  it("keeps an ended grant ended and the teacher out", async () => {
    expect((await get(revoked, "/monitor/live")).status).toBe(403);
    expect((await get(teacher, "/monitor/live")).status).toBe(403);
  });
});

describe("watch alerts on the live stream", () => {
  it("carry the person's name and the IP's place, not just the alert", async () => {
    const { fireAlert } = await import("../services/activity/watches");
    const { activityBus } = await import("../services/activity/runtime");
    const { setGeoProvider, UNKNOWN_GEO } = await import("../services/activity/geoip");
    setGeoProvider(() => ({ ...UNKNOWN_GEO, country_code: "RW", city: "Kigali", isp: "MTN Rwandacell", conn_type: "mobile" }));
    const seen: any[] = [];
    const on = (s: any) => s.type === "live_event" && seen.push(s.event);
    activityBus.on("signal", on);
    try {
      await fireAlert({ rule: "admin_new_device", severity: "warning", title: "Signed in from a new device", targetUserId: teacher, ip: "102.22.9.9", recipients: [], dedupeKey: `t-${Date.now()}` });
    } finally {
      activityBus.off("signal", on);
      setGeoProvider(null);
    }
    const e = seen.find((x) => x.kind === "alert");
    expect(e).toMatchObject({ user_id: teacher, user_name: expect.any(String), place: "Kigali, RW", isp: "MTN Rwandacell", detail: { title: "Signed in from a new device", severity: "warning" } });
    expect(e.user_name).not.toBe("");
  });
});
