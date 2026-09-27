import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import type { Server } from "http";
import app from "../app";
import { createUser, signToken } from "../test/fixtures";
import { sanitiseSummary } from "../services/home/apps";

/**
 * Home <- other apps (plan §9, H3): the MIS relays each app's summary with the
 * user's own token and never passes an app's answer through unchecked.
 */

describe("sanitiseSummary", () => {
  const lenses = new Set(["SELF", "TEACHING", "CLASS_GROUP:9"]);
  const good = {
    version: 1,
    provisioned: true,
    generated_at: "2026-09-27T08:00:00Z",
    items: [
      {
        id: "T-07:TEACHING",
        kind: "T-07",
        tier: "slipping",
        lens: "TEACHING",
        depth: "detail",
        count: 3,
        title: "3 submissions to grade",
        entities: ["Aline M."],
        why: "Students are waiting",
        cta: { label: "Grade", href: "https://tm.example/grading", external: true },
      },
    ],
    tiles: [],
    updates: [],
    app_url: "https://tm.example",
  };

  it("keeps a well-formed answer and namespaces its ids", () => {
    const s = sanitiseSummary("taskmentor", good, lenses)!;
    expect(s.items[0]).toMatchObject({ id: "taskmentor:T-07:TEACHING", source: "taskmentor", lens: "TEACHING", entities: ["Aline M."] });
  });

  it("namespaces an id once even when the app already prefixed it", () => {
    const s = sanitiseSummary("tupo", { ...good, items: [{ ...good.items[0], id: "tupo:M-01:SELF" }] }, lenses)!;
    expect(s.items[0].id).toBe("tupo:M-01:SELF");
  });

  it("drops items with unsafe links and never lets an app pick an unknown lens", () => {
    const s = sanitiseSummary(
      "taskmentor",
      {
        ...good,
        items: [
          { ...good.items[0], cta: { label: "x", href: "javascript:alert(1)" } },
          { ...good.items[0], id: "b", lens: "SCHOOL" },
        ],
      },
      lenses,
    )!;
    expect(s.items).toHaveLength(1);
    expect(s.items[0].lens).toBe("SELF");
  });

  it("strips names from summary-depth items whatever the app sent", () => {
    const s = sanitiseSummary("attendance", { ...good, items: [{ ...good.items[0], depth: "summary" }] }, lenses)!;
    expect(s.items[0].entities).toEqual([]);
  });

  it("rejects an answer in an unknown contract version", () => {
    expect(sanitiseSummary("tupo", { ...good, version: 2 }, lenses)).toBeNull();
  });
});

describe("POST /home/apps/:source/summary", () => {
  let stub: Server;
  let seenAuth: string | undefined;
  let seenBody: any;
  let mode: "ok" | "401" | "slow" = "ok";
  let userId: number;
  const prev = { url: process.env.HOME_APP_TASKMENTOR_URL, timeout: process.env.HOME_APP_TIMEOUT_MS };

  beforeAll(async () => {
    const fake = express();
    fake.use(express.json());
    fake.post("/api/integration/home-summary", (req, res) => {
      seenAuth = req.headers.authorization;
      seenBody = req.body;
      if (mode === "401") return res.status(401).json({ code: "MIS_TOKEN_INVALID" });
      const send = () =>
        res.json({
          version: 1,
          source: "taskmentor",
          provisioned: true,
          generated_at: new Date().toISOString(),
          items: [
            {
              id: "S-01:SELF",
              kind: "S-01",
              tier: "blocking",
              lens: "SELF",
              depth: "detail",
              count: 2,
              title: "2 assignments overdue",
              entities: [],
              why: "Past their due date",
              cta: { label: "Submit", href: "https://tm.example/assignments", external: true },
            },
          ],
          tiles: [],
          updates: [],
          app_url: "https://tm.example",
        });
      if (mode === "slow") setTimeout(send, 1500);
      else send();
    });
    await new Promise<void>((resolve) => {
      stub = fake.listen(0, () => resolve());
    });
    const port = (stub.address() as any).port;
    process.env.HOME_APP_TASKMENTOR_URL = `http://127.0.0.1:${port}`;
    process.env.HOME_APP_TIMEOUT_MS = "1000";
    userId = await createUser({ userType: "STUDENT" });
  });

  afterAll(async () => {
    process.env.HOME_APP_TASKMENTOR_URL = prev.url;
    if (prev.timeout === undefined) delete process.env.HOME_APP_TIMEOUT_MS;
    else process.env.HOME_APP_TIMEOUT_MS = prev.timeout;
    await new Promise((r) => stub.close(r));
  });

  let sentAuth = "";
  const relay = (source: string, body: any = {}) => {
    sentAuth = `Bearer ${signToken(userId)}`;
    return request(app).post(`/home/apps/${source}/summary`).send(body).set("Authorization", sentAuth);
  };

  it("requires a session", async () => {
    expect((await request(app).post("/home/apps/taskmentor/summary")).status).toBe(401);
  });

  it("relays the user's own token and returns the checked summary", async () => {
    mode = "ok";
    const res = await relay("taskmentor", { date: "2026-09-27", lessons: [{ lesson_key: "x" }] });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.summary.items[0]).toMatchObject({ source: "taskmentor", kind: "S-01", tier: "blocking" });
    // The app receives exactly the token the user signed in with.
    expect(seenAuth).toBe(sentAuth);
    // Lens hints come from the MIS, not the browser.
    expect(seenBody.lenses.some((l: any) => l.key === "SELF")).toBe(true);
    expect(seenBody.lessons).toHaveLength(1);
  });

  it("reports an app that refuses the session without failing Home", async () => {
    mode = "401";
    const res = await relay("taskmentor");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("unauthorized");
  });

  it("gives up on a slow app and says so", async () => {
    mode = "slow";
    const res = await relay("taskmentor");
    expect(res.body.data).toMatchObject({ status: "unavailable" });
    expect(res.body.data.message).toMatch(/too long/);
  });

  it("answers calmly for an app that isn't connected", async () => {
    const res = await relay("tupo");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("unavailable");
  });
});
