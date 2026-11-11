/**
 * Tenant management M8: consented, time-boxed, double-audited support access
 * (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.9).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../app";
import { controlPool } from "../db/platform";
import { poolFor } from "../db/pools";
import { clearSupportCache } from "../services/tenantMgmt/support";
import { ensurePlatform, platformUser, provisionSchool, removeSchool, sessionToken } from "../test/tenantMgmtFixtures";

let school: Awaited<ReturnType<typeof provisionSchool>>;
let support: { id: number; token: string };
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  await ensurePlatform();
  delete process.env.TENANCY_PROVISION_SECRET;
  school = await provisionSchool({ pkg: "starter" });
  support = await platformUser(["PLATFORM_TENANTS_VIEW", "PLATFORM_SUPPORT_ACCESS"]);
}, 240_000);

afterAll(async () => {
  await removeSchool(school?.tid, school?.applicationId);
});

describe("support sessions", () => {
  it("grant -> open -> reads work, writes refused in READ mode, audited twice", async () => {
    const ownerTok = await sessionToken(school.ownerId, school.tid);
    const tooLong = await request(app).post("/tenant/support-sessions").set(auth(ownerTok)).send({ hours: 48, mode: "READ" });
    expect(tooLong.status).toBe(400);
    const g = await request(app).post("/tenant/support-sessions").set(auth(ownerTok)).send({ hours: 2, mode: "READ", reason: "help with timetable" });
    expect(g.status, JSON.stringify(g.body)).toBe(200);
    expect(g.body.data).toMatchObject({ mode: "READ", active: true, openedBy: null });
    const sid = g.body.data.id;

    const list = await request(app).get("/platform/support-sessions").set(auth(support.token));
    expect(list.status).toBe(200);
    expect(list.body.data.find((x: any) => x.id === sid)).toMatchObject({ tid: school.tid, schoolName: school.name });

    // A platform user without PLATFORM_SUPPORT_ACCESS can't open it.
    const viewer = await platformUser(["PLATFORM_TENANTS_VIEW"]);
    expect((await request(app).post(`/platform/support-sessions/${sid}/open`).set(auth(viewer.token))).status).toBe(403);

    const open = await request(app).post(`/platform/support-sessions/${sid}/open`).set(auth(support.token));
    expect(open.status, JSON.stringify(open.body)).toBe(200);
    expect(open.body.data.tid).toBe(school.tid);
    const claims: any = jwt.decode(open.body.data.token);
    expect(claims).toMatchObject({ userId: school.ownerId, tid: school.tid, act: { sub: String(support.id), tid: 1 }, support: { sid, mode: "READ" } });
    expect(claims.exp * 1000).toBeLessThanOrEqual(new Date(open.body.data.expiresAt).getTime() + 1000);

    const tok = open.body.data.token;
    const read = await request(app).get("/tenant/status").set(auth(tok));
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    const write = await request(app).post("/tenant/setup/dismiss").set(auth(tok));
    expect(write.status).toBe(403);
    expect(write.body.code).toBe("SUPPORT_READ_ONLY");

    // The school sees who opened it.
    const mine = await request(app).get("/tenant/support-sessions").set(auth(ownerTok));
    expect(mine.body.data.find((x: any) => x.id === sid)).toMatchObject({ active: true });
    expect(mine.body.data.find((x: any) => x.id === sid).openedAt).toBeTruthy();

    const [pa] = await controlPool().query<any[]>("SELECT action FROM PlatformAudit WHERE target_tid = ? AND action LIKE 'support.%'", [school.tid]);
    expect(pa.map((r) => r.action)).toEqual(expect.arrayContaining(["support.grant", "support.open"]));
    const [aa] = await poolFor(school.tid).query<any[]>("SELECT action FROM AccessAudit WHERE action LIKE 'support.%'");
    expect(aa.map((r) => r.action)).toEqual(expect.arrayContaining(["support.grant", "support.open"]));

    // Revoked: the token stops working at once.
    const rev = await request(app).delete(`/tenant/support-sessions/${sid}`).set(auth(ownerTok));
    expect(rev.status).toBe(200);
    expect(rev.body.data.active).toBe(false);
    const after = await request(app).get("/tenant/status").set(auth(tok));
    expect(after.status).toBe(401);
    expect(after.body.code).toBe("SUPPORT_SESSION_ENDED");
    expect((await request(app).post(`/platform/support-sessions/${sid}/open`).set(auth(support.token))).status).toBe(410);
  });

  it("WRITE mode allows writes and audits each one; an expired session is refused", async () => {
    const ownerTok = await sessionToken(school.ownerId, school.tid);
    const g = await request(app).post("/tenant/support-sessions").set(auth(ownerTok)).send({ hours: 1, mode: "WRITE" });
    const sid = g.body.data.id;
    const tok = (await request(app).post(`/platform/support-sessions/${sid}/open`).set(auth(support.token))).body.data.token;
    const w = await request(app).post("/tenant/setup/dismiss").set(auth(tok));
    expect(w.status, JSON.stringify(w.body)).toBe(200);
    // A support session can't hand out support access.
    expect((await request(app).post("/tenant/support-sessions").set(auth(tok)).send({ hours: 1 })).status).toBe(403);
    await new Promise((r) => setTimeout(r, 50));
    const [pa] = await controlPool().query<any[]>("SELECT payload FROM PlatformAudit WHERE target_tid = ? AND action = 'support.write'", [school.tid]);
    expect(pa.length).toBeGreaterThanOrEqual(1);
    const [aa] = await poolFor(school.tid).query<any[]>("SELECT action FROM AccessAudit WHERE action = 'support.write'");
    expect(aa.length).toBeGreaterThanOrEqual(1);

    // Expired (the token's own exp is still in the future: the session row decides).
    await controlPool().query("UPDATE SupportSession SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE session_id = ?", [sid]);
    clearSupportCache();
    const r = await request(app).get("/tenant/status").set(auth(tok));
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("SUPPORT_SESSION_ENDED");
  });
});
