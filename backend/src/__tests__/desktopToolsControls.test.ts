import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { createAcademicPeriod, createProgramGradeClassGroup, createStudentClassGroup, createUser } from "../test/fixtures";
import { DEFAULT_GAME_SETTINGS, gamesBlock } from "../services/desktop/games";
import { cleanGames } from "../services/desktop/gameControls";
import { desktopToolsRouter } from "../routes/desktopTools";

const appFor = (userId: number, permissions: string[], classIds: number[] = []) => {
  const app = express();
  app.use(express.json());
  app.use(
    "/desktop/tools",
    desktopToolsRouter((req: any, _res, next) => ((req.user = { userId, permissions }), next()), {
      collect: async () => [],
      classes: async () => classIds.map((id) => ({ classGroupId: id, name: `C${id}`, grade: "S1", students: [] })),
      superAdmin: async () => false,
    }),
  );
  return app;
};

describe("games block: class game time and exceptions", () => {
  const settings = { ...DEFAULT_GAME_SETTINGS, disabled: ["snake"] };
  it("opens only games the school allows, for students", () => {
    const g = gamesBlock(settings, "student", [], { classGameTime: { until: "2026-10-06T10:00:00Z", games: ["mines", "snake", "igisoro"], by: "Ms U", className: "S4" } });
    expect(g.classGameTime).toMatchObject({ games: ["mines"], className: "S4" });
    expect(gamesBlock(settings, "teacher", [], { classGameTime: { until: "x", games: ["mines"], by: "", className: "" } }).classGameTime).toBeNull();
    expect(gamesBlock(settings, "student", [], { classGameTime: { until: "x", games: ["snake"], by: "", className: "" } }).classGameTime).toBeNull();
  });
  it("an extension adds daily minutes; a block is passed through", () => {
    expect(gamesBlock(settings, "student", [], { override: { kind: "extend", until: "x", reason: "IEP", extraMin: 20 } }).dailyBudgetMin).toBe(50);
    const b = gamesBlock(settings, "student", [], { override: { kind: "block", until: "x", reason: "parent request", extraMin: null } });
    expect([b.dailyBudgetMin, b.override?.kind]).toEqual([30, "block"]);
    expect(gamesBlock(settings, "teacher", [], { override: { kind: "block", until: "x", reason: "r", extraMin: null } }).override).toBeNull();
  });
  it("class game time never opens the resets or unknown games", () => {
    expect(cleanGames(["mines", "breathe", "nope", "mines", 3])).toEqual(["mines"]);
  });
});

describe("class game time routes", () => {
  it("a teacher opens games for their own class; the class's students see it in the policy; ending it closes it", async () => {
    const { academicYearId } = await createAcademicPeriod();
    const cg = await createProgramGradeClassGroup();
    const other = await createProgramGradeClassGroup();
    const teacher = await createUser({ userType: "TEACHER" });
    const student = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({ userId: student, classGroupId: cg, academicYearId });
    const t = appFor(teacher, [], [cg]);

    const denied = await request(t).post("/desktop/tools/class-game-time").send({ classGroupId: other, games: ["mines"], minutes: 10 });
    expect(denied.status).toBe(403);
    expect((await request(t).post("/desktop/tools/class-game-time").send({ classGroupId: cg, games: ["mines"], minutes: 45 })).body.code).toBe("BAD_MINUTES");
    expect((await request(t).post("/desktop/tools/class-game-time").send({ classGroupId: cg, games: [], minutes: 10 })).body.code).toBe("NO_GAMES");

    const started = await request(t).post("/desktop/tools/class-game-time").send({ classGroupId: cg, games: ["mines", "pairs"], minutes: 10 });
    expect(started.status).toBe(200);
    expect(started.body.data).toMatchObject({ classGroupId: cg, games: ["mines", "pairs"] });
    const mins = (Date.parse(started.body.data.endsAt) - Date.now()) / 60_000;
    expect(mins).toBeGreaterThan(8.9);
    expect(mins).toBeLessThan(10.1);
    expect((await request(t).get("/desktop/tools/class-game-time")).body.data.active).toHaveLength(1);

    const policy = await request(appFor(student, [])).get("/desktop/tools/policy");
    expect(policy.body.data.games.classGameTime).toMatchObject({ games: ["mines", "pairs"], until: started.body.data.endsAt });

    // A second start replaces the first (one at a time per class).
    const again = await request(t).post("/desktop/tools/class-game-time").send({ classGroupId: cg, games: ["echo"], minutes: 5 });
    expect((await request(t).get("/desktop/tools/class-game-time")).body.data.active.map((x: any) => x.id)).toEqual([again.body.data.id]);

    expect((await request(appFor(await createUser(), [], [other])).post(`/desktop/tools/class-game-time/${again.body.data.id}/end`)).status).toBe(403);
    expect((await request(t).post(`/desktop/tools/class-game-time/${again.body.data.id}/end`)).status).toBe(200);
    expect((await request(appFor(student, [])).get("/desktop/tools/policy")).body.data.games.classGameTime).toBeNull();
    await db.execute(sql`DELETE FROM DesktopClassGameTime WHERE class_group_id = ${cg}`);
  });
});

describe("exceptions routes", () => {
  it("only DESKTOP_TOOLS_CONFIGURE; students only; reason required; block reaches the policy; revoke ends it", async () => {
    const admin = await createUser({ userType: "ADMIN" });
    const student = await createUser({ userType: "STUDENT" });
    const a = appFor(admin, ["DESKTOP_TOOLS_CONFIGURE"]);
    expect((await request(appFor(admin, [])).post("/desktop/tools/settings/games/overrides").send({})).status).toBe(403);
    expect((await request(a).post("/desktop/tools/settings/games/overrides").send({ userId: student, kind: "block", reason: "", days: 7 })).body.code).toBe("NO_REASON");
    expect((await request(a).post("/desktop/tools/settings/games/overrides").send({ userId: admin, kind: "block", reason: "test", days: 7 })).body.code).toBe("NOT_STUDENT");
    expect((await request(a).post("/desktop/tools/settings/games/overrides").send({ userId: student, kind: "extend", extraMin: 500, reason: "IEP", days: 7 })).body.code).toBe("BAD_EXTRA");

    const ext = await request(a).post("/desktop/tools/settings/games/overrides").send({ userId: student, kind: "extend", extraMin: 15, reason: "Learning plan", days: 30 });
    expect(ext.status).toBe(200);
    let policy = await request(appFor(student, [])).get("/desktop/tools/policy");
    expect(policy.body.data.games.dailyBudgetMin).toBe(45);

    const blk = await request(a).post("/desktop/tools/settings/games/overrides").send({ userId: student, kind: "block", reason: "Parent request", days: 7 });
    policy = await request(appFor(student, [])).get("/desktop/tools/policy");
    expect(policy.body.data.games.override).toMatchObject({ kind: "block", reason: "Parent request" });
    expect((await request(a).get("/desktop/tools/settings/games/overrides")).body.data.overrides.filter((o: any) => o.userId === student)).toHaveLength(2);

    expect((await request(a).post(`/desktop/tools/settings/games/overrides/${blk.body.data.id}/revoke`)).status).toBe(200);
    expect((await request(a).post(`/desktop/tools/settings/games/overrides/${blk.body.data.id}/revoke`)).status).toBe(404);
    policy = await request(appFor(student, [])).get("/desktop/tools/policy");
    expect(policy.body.data.games.override).toMatchObject({ kind: "extend" });
    const log = await db.execute(sql`SELECT action_type FROM ActivityLog WHERE user_id = ${admin} ORDER BY 1`);
    expect(((log as any)[0] as any[]).map((r) => r.action_type)).toEqual(["DESKTOP_GAMES_BLOCK", "DESKTOP_GAMES_EXTEND", "DESKTOP_GAMES_OVERRIDE_REVOKE"]);
    await db.execute(sql`DELETE FROM DesktopGameOverride WHERE user_id = ${student}`);
  });

  it("finds students by name for the picker", async () => {
    const student = await createUser({ userType: "STUDENT" });
    const [p] = ((await db.execute(sql`SELECT last_name AS first_name FROM UserProfile WHERE user_id = ${student}`)) as any)[0];
    const r = await request(appFor(1, ["DESKTOP_TOOLS_CONFIGURE"])).get(`/desktop/tools/settings/games/students?q=${encodeURIComponent(p.first_name)}`);
    expect(r.body.data.students.map((s: any) => s.id)).toContain(student);
    expect((await request(appFor(1, ["DESKTOP_TOOLS_CONFIGURE"])).get("/desktop/tools/settings/games/students?q=a")).body.data.students).toEqual([]);
  });
});
