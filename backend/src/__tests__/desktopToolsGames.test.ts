import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { createUser } from "../test/fixtures";
import { cleanUsage, DEFAULT_GAME_SETTINGS, gamesBlock, loadGameSettings, mergeSettings, playedToday, recordUsage, weightedMinutes } from "../services/desktop/games";
import { desktopToolsRouter } from "../routes/desktopTools";
import { kigaliParts } from "../services/reminders/time";

describe("desktop games: settings and budgets", () => {
  it("merges stored settings over the defaults, dropping junk", () => {
    const s = mergeSettings({ dailyBudgetMin: 45, disabled: ["snake", "not-a-game"], quietHours: ["22:00", "07:00"], sessionCapMin: 9999, extra: 1 });
    expect(s.dailyBudgetMin).toBe(45);
    expect(s.disabled).toEqual(["snake"]);
    expect(s.quietHours).toEqual(["22:00", "07:00"]);
    expect(s.sessionCapMin).toBe(120);
    expect(mergeSettings({ quietHours: ["25:00", "x"] }).quietHours).toEqual(DEFAULT_GAME_SETTINGS.quietHours);
    expect(mergeSettings({ quietHours: null }).quietHours).toBeNull();
    expect(mergeSettings(null)).toEqual(DEFAULT_GAME_SETTINGS);
  });

  it("weights learning games half and resets not at all", () => {
    expect(weightedMinutes([{ game: "snake", seconds: 600 }, { game: "math-sprint", seconds: 600 }, { game: "breathe", seconds: 600 }])).toBe(15);
  });

  it("keeps Igisoro off until a super admin approves it; staff have no budget by default", () => {
    const student = gamesBlock(DEFAULT_GAME_SETTINGS, "student", []);
    expect(student.allowed).not.toContain("igisoro");
    expect(student.dailyBudgetMin).toBe(30);
    const approved = gamesBlock({ ...DEFAULT_GAME_SETTINGS, igisoro: { approved: true, variant: "standard", approvedBy: 1, approvedAt: "x" } }, "teacher", []);
    expect(approved.allowed).toContain("igisoro");
    expect(approved.dailyBudgetMin).toBeNull();
    expect(gamesBlock({ ...DEFAULT_GAME_SETTINGS, enabled: false }, "student", []).allowed).toEqual([]);
    expect(gamesBlock(DEFAULT_GAME_SETTINGS, "parent", []).enabled).toBe(false);
  });

  it("accepts only sane usage entries", () => {
    const now = new Date("2026-10-06T08:00:00Z");
    expect(cleanUsage([
      { day: "2026-10-06", game: "snake", seconds: 61.7 },
      { day: "2026-10-05", game: "pairs", seconds: 10 },
      { day: "2026-10-01", game: "snake", seconds: 10 },
      { day: "2026-10-06", game: "doom", seconds: 10 },
      { day: "2026-10-06", game: "snake", seconds: -5 },
      { day: "2026-10-06", game: "echo", seconds: 999_999 },
    ], now)).toEqual([
      { day: "2026-10-06", game: "snake", seconds: 61 },
      { day: "2026-10-05", game: "pairs", seconds: 10 },
      { day: "2026-10-06", game: "echo", seconds: 86_400 },
    ]);
    expect(cleanUsage("nope", now)).toEqual([]);
  });
});

describe("desktop games: play time in the database", () => {
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM DesktopGameUsage`);
    await db.execute(sql`DELETE FROM DesktopToolSetting`);
  });

  it("keeps the largest total per device (retries never double count) and adds devices", async () => {
    const u = await createUser({ userType: "STUDENT" });
    const day = kigaliParts(new Date()).ymd;
    await recordUsage(u, "deviceaaaa", [{ day, game: "snake", seconds: 120 }]);
    await recordUsage(u, "deviceaaaa", [{ day, game: "snake", seconds: 120 }]);
    await recordUsage(u, "deviceaaaa", [{ day, game: "snake", seconds: 90 }]);
    await recordUsage(u, "devicebbbb", [{ day, game: "snake", seconds: 60 }]);
    expect(await playedToday(u)).toEqual([{ game: "snake", seconds: 180 }]);
  });

  it("reads settings saved by admins", async () => {
    await db.execute(sql`INSERT INTO DesktopToolSetting (setting_key, value) VALUES ('games', ${JSON.stringify({ dailyBudgetMin: 20, disabled: ["mines"] })})`);
    const s = await loadGameSettings();
    expect([s.dailyBudgetMin, s.disabled]).toEqual([20, ["mines"]]);
  });

  it("routes: usage needs a device id; the policy carries the games block", async () => {
    const u = await createUser({ userType: "STUDENT" });
    const app = express();
    app.use(express.json());
    app.use("/desktop/tools", desktopToolsRouter((req: any, _res, next) => ((req.user = { userId: u }), next()), { collect: async () => [] }));
    expect((await request(app).post("/desktop/tools/games/usage").send({ device: "x", entries: [] })).status).toBe(400);
    const day = kigaliParts(new Date()).ymd;
    const ok = await request(app).post("/desktop/tools/games/usage").send({ device: "abcdef1234", entries: [{ day, game: "snake", seconds: 300 }, { day, game: "math-sprint", seconds: 600 }] });
    expect(ok.body.data.saved).toBe(2);
    const policy = await request(app).get("/desktop/tools/policy");
    expect(policy.body.data.games).toMatchObject({ enabled: true, dailyBudgetMin: 30, usedTodayMin: 10, sessionCapMin: 10 });
    expect(policy.body.data.games.allowed).not.toContain("igisoro");
  });
});
