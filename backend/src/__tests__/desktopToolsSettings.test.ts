import { describe, it, expect, beforeEach, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { createUser } from "../test/fixtures";
import { applySettingsUpdate, DEFAULT_GAME_SETTINGS, loadGameSettings } from "../services/desktop/games";
import { desktopToolsRouter } from "../routes/desktopTools";
import { MIS_MANIFEST } from "../access/manifest";
import { PRESETS } from "../access/presets";
import { isV2OnlyCapability } from "../access/v2Only";
import { ALL_PERMISSIONS } from "../utils/permissions";

const NOW = new Date("2026-10-06T08:00:00Z");

describe("desktop tools settings: who changes what", () => {
  it("lets admins change switches but only a super admin approve Igisoro", () => {
    const input = { enabled: false, disabled: ["snake"], dailyBudgetMin: 20, igisoro: { approved: true, variant: "beginner" } };
    const admin = applySettingsUpdate(DEFAULT_GAME_SETTINGS, input, { userId: 5, superAdmin: false }, NOW);
    expect([admin.enabled, admin.disabled, admin.dailyBudgetMin]).toEqual([false, ["snake"], 20]);
    expect(admin.igisoro).toEqual(DEFAULT_GAME_SETTINGS.igisoro);
    const sa = applySettingsUpdate(DEFAULT_GAME_SETTINGS, input, { userId: 1, superAdmin: true }, NOW);
    expect(sa.igisoro).toEqual({ approved: true, variant: "beginner", approvedBy: 1, approvedAt: NOW.toISOString() });
  });

  it("keeps the original approval when nothing about Igisoro changes, and records revocation", () => {
    const approved = applySettingsUpdate(DEFAULT_GAME_SETTINGS, { igisoro: { approved: true } }, { userId: 1, superAdmin: true }, NOW);
    expect(approved.igisoro.variant).toBe("standard");
    const later = applySettingsUpdate(approved, { dailyBudgetMin: 40, igisoro: { approved: true, variant: "standard" } }, { userId: 2, superAdmin: true }, new Date("2026-10-07T08:00:00Z"));
    expect(later.igisoro).toEqual(approved.igisoro);
    // An admin's save never touches it, whatever they send.
    expect(applySettingsUpdate(approved, { igisoro: { approved: false } }, { userId: 5, superAdmin: false }).igisoro).toEqual(approved.igisoro);
    const off = applySettingsUpdate(approved, { igisoro: { approved: false } }, { userId: 1, superAdmin: true });
    expect(off.igisoro).toMatchObject({ approved: false, approvedBy: null, approvedAt: null });
    // Unknown variants fall back to the standard rules.
    expect(applySettingsUpdate(DEFAULT_GAME_SETTINGS, { igisoro: { approved: true, variant: "x" } }, { userId: 1, superAdmin: true }).igisoro.variant).toBe("standard");
  });

  it("declares DESKTOP_TOOLS_CONFIGURE: manifest, legacy-visible, keyword-free, on the admin presets", () => {
    const cap = "DESKTOP_TOOLS_CONFIGURE";
    expect((MIS_MANIFEST.capabilities as Record<string, unknown>)[cap]).toBeTruthy();
    expect(isV2OnlyCapability(cap)).toBe(false);
    expect(ALL_PERMISSIONS).toContain(cap);
    for (const k of ["MANAGE_USER", "MANAGE_ROLE", "MANAGE_STAFF", "MANAGE_SYSTEM", "MANAGE_SCHOOL", "ADMIN", "STUDENT", "VIEW_ATTENDANCE", "TEACHER"]) expect(cap.includes(k)).toBe(false);
    const capsOf = (key: string) => (PRESETS.find((p) => p.key === key)?.caps ?? []).map((c) => (Array.isArray(c) ? c[0] : c));
    for (const p of ["platform_owner", "head_teacher", "school_administrator"]) expect(capsOf(p), p).toContain(cap);
    expect(capsOf("student")).not.toContain(cap);
  });
});

describe("desktop tools settings routes", () => {
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM DesktopToolSetting WHERE setting_key = 'games'`);
  });
  afterAll(async () => {
    await db.execute(sql`DELETE FROM DesktopToolSetting WHERE setting_key = 'games'`);
  });

  const appFor = (userId: number, permissions: string[], superAdmin: boolean) => {
    const app = express();
    app.use(express.json());
    app.use(
      "/desktop/tools",
      desktopToolsRouter((req: any, _res, next) => ((req.user = { userId, permissions }), next()), { collect: async () => [], superAdmin: async () => superAdmin }),
    );
    return app;
  };

  it("needs DESKTOP_TOOLS_CONFIGURE", async () => {
    const u = await createUser({ userType: "STAFF" });
    const app = appFor(u, [], false);
    expect((await request(app).get("/desktop/tools/settings/games")).status).toBe(403);
    expect((await request(app).put("/desktop/tools/settings/games").send({ enabled: false })).status).toBe(403);
  });

  it("shows and saves settings; an admin can't approve Igisoro; a super admin can", async () => {
    const admin = await createUser({ userType: "STAFF" });
    const a = appFor(admin, ["DESKTOP_TOOLS_CONFIGURE"], false);
    const got = await request(a).get("/desktop/tools/settings/games");
    expect(got.status).toBe(200);
    expect(got.body.data).toMatchObject({ settings: DEFAULT_GAME_SETTINGS, canApproveIgisoro: false });
    expect(got.body.data.games).toContain("igisoro");
    expect(got.body.data.usage).toHaveProperty("games");

    const saved = await request(a).put("/desktop/tools/settings/games").send({ ...DEFAULT_GAME_SETTINGS, disabled: ["mines"], dailyBudgetMin: 25 });
    expect(saved.status).toBe(200);
    expect((await loadGameSettings()).disabled).toEqual(["mines"]);

    const denied = await request(a).put("/desktop/tools/settings/games").send({ ...DEFAULT_GAME_SETTINGS, igisoro: { approved: true, variant: "standard" } });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("SUPER_ADMIN_ONLY");
    expect((await loadGameSettings()).igisoro.approved).toBe(false);

    const owner = await createUser({ userType: "STAFF" });
    const s = appFor(owner, ["DESKTOP_TOOLS_CONFIGURE"], true);
    const ok = await request(s).put("/desktop/tools/settings/games").send({ ...(await loadGameSettings()), igisoro: { approved: true, variant: "beginner" } });
    expect(ok.status).toBe(200);
    const now = await loadGameSettings();
    expect(now.igisoro).toMatchObject({ approved: true, variant: "beginner", approvedBy: owner });
    expect(now.disabled).toEqual(["mines"]);
    const log = await db.execute(sql`SELECT action_type FROM ActivityLog WHERE user_id = ${owner} ORDER BY 1`);
    expect(((log as any)[0] as any[]).map((r) => r.action_type)).toEqual(["DESKTOP_GAMES_SETTINGS", "DESKTOP_IGISORO_APPROVE"]);

    // Approved Igisoro now reaches the policy.
    const student = await createUser({ userType: "STUDENT" });
    const policy = await request(appFor(student, [], false)).get("/desktop/tools/policy");
    expect(policy.body.data.games.allowed).toContain("igisoro");
    expect(policy.body.data.games.igisoroVariant).toBe("beginner");
    // And a later admin save (sending the approved block back unchanged) keeps it.
    expect((await request(a).put("/desktop/tools/settings/games").send({ ...now, dailyBudgetMin: 35 })).status).toBe(200);
    expect((await loadGameSettings()).igisoro.approved).toBe(true);
  });
});
