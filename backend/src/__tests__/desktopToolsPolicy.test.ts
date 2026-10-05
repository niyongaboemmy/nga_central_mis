import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { buildPolicy, examWindows, EXAM_MAX_MS, policyRange } from "../services/desktop/policy";
import { desktopToolsRouter } from "../routes/desktopTools";
import type { Occurrence } from "../services/reminders/occurrences";

const at = (iso: string) => new Date(iso);
const occ = (p: Partial<Occurrence> & Pick<Occurrence, "kind" | "start">): Occurrence => ({
  key: `${p.kind}:${p.start.toISOString()}`,
  sourceRef: "",
  title: "x",
  detail: null,
  link: null,
  location: null,
  end: null,
  critical: false,
  color: null,
  role: "attending",
  ...p,
});
// Kigali is UTC+2: 08:00 Kigali = 06:00Z.
const lesson = (from: string, to: string, title = "Physics") => occ({ kind: "lesson" as any, start: at(from), end: at(to), title });
const quiz = (id: number, open: string, close: string) => [
  occ({ kind: "quiz_open" as any, start: at(open), title: "Maths CAT opens", sourceRef: `taskmentor:quiz_open:quiz-${id}-open`, role: "other" }),
  occ({ kind: "quiz_close" as any, start: at(close), title: "Maths CAT closes", sourceRef: `taskmentor:quiz_close:quiz-${id}-close`, role: "other" }),
];

describe("desktop tools policy", () => {
  it("turns lessons into lock windows", () => {
    const p = buildPolicy([lesson("2026-10-06T06:00:00Z", "2026-10-06T07:40:00Z")], at("2026-10-06T05:00:00Z"));
    expect(p.windows).toEqual([{ from: "2026-10-06T06:00:00.000Z", to: "2026-10-06T07:40:00.000Z", kind: "lesson", label: "Physics", role: "attending" }]);
    expect(p.exam.active).toBe(false);
    expect(p.timezone).toBe("Africa/Kigali");
    expect(p.validUntil).toBe("2026-10-06T22:00:00.000Z"); // midnight Kigali
  });

  it("treats a short quiz as an exam window, and says when it is active", () => {
    const occs = quiz(7, "2026-10-06T08:00:00Z", "2026-10-06T09:30:00Z");
    expect(examWindows(occs)).toEqual([{ from: "2026-10-06T08:00:00.000Z", to: "2026-10-06T09:30:00.000Z", kind: "exam", label: "Maths CAT" }]);
    const during = buildPolicy(occs, at("2026-10-06T08:10:00Z"));
    expect(during.exam).toEqual({ active: true, until: "2026-10-06T09:30:00.000Z", label: "Maths CAT" });
    expect(buildPolicy(occs, at("2026-10-06T09:30:00Z")).exam.active).toBe(false);
  });

  it("ignores long homework quizzes and unpaired events", () => {
    const long = quiz(8, "2026-10-06T06:00:00Z", new Date(at("2026-10-06T06:00:00Z").getTime() + EXAM_MAX_MS + 1).toISOString());
    expect(examWindows(long)).toEqual([]);
    expect(examWindows([quiz(9, "2026-10-06T06:00:00Z", "2026-10-06T07:00:00Z")[0]])).toEqual([]);
  });

  it("loads all of the Kigali day plus the next morning", () => {
    const r = policyRange(at("2026-10-06T21:30:00Z")); // 23:30 Kigali
    expect(r.from.toISOString()).toBe("2026-10-05T22:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-07T04:00:00.000Z");
  });
});

describe("desktop tools agenda and policy routes", () => {
  const calls: Array<[number, Date, Date]> = [];
  const app = express();
  app.use(
    "/desktop/tools",
    desktopToolsRouter(
      (req: any, res, next) => (req.headers.authorization === "Bearer ok" ? ((req.user = { userId: 5 }), next()) : res.status(401).json({})),
      {
        collect: async (userId, from, to) => {
          calls.push([userId, from, to]);
          return [lesson("2026-10-06T06:00:00Z", "2026-10-06T07:40:00Z"), ...quiz(1, "2026-10-06T08:00:00Z", "2026-10-06T09:00:00Z")];
        },
      },
    ),
  );

  it("needs sign-in", async () => {
    expect((await request(app).get("/desktop/tools/agenda")).status).toBe(401);
    expect((await request(app).get("/desktop/tools/policy")).status).toBe(401);
  });

  it("returns My Day items for the signed-in person, 1–7 days", async () => {
    const res = await request(app).get("/desktop/tools/agenda?days=99").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.body.data.days).toBe(7);
    expect(res.body.data.items).toHaveLength(3);
    expect(res.body.data.items[0]).toMatchObject({ kind: "lesson", title: "Physics", start: "2026-10-06T06:00:00.000Z", end: "2026-10-06T07:40:00.000Z" });
    const [userId, from, to] = calls[calls.length - 1];
    expect(userId).toBe(5);
    expect((to.getTime() - from.getTime()) / 86_400_000).toBe(7);
  });

  it("returns the policy with lesson and exam windows", async () => {
    const res = await request(app).get("/desktop/tools/policy").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body.data.windows.map((w: any) => w.kind)).toEqual(["lesson", "exam"]);
  });
});
