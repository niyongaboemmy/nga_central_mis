// Contract with NGA Desktop (nga-desktop src-tauri/src/bridge.js WATCHERS): if this fails,
// update the desktop watcher in the same release.
//
// The desktop app intercepts the web app's own `GET /notifications?limit=20` poll
// (NotificationContext, every 45 s) and turns new rows into OS notifications. It reads
// `json.data[]` and, on each item, `x.notification.{notification_id,title,body,link,read_at,created_at}`.
// Renaming any of those, unwrapping `notification`, or changing the path silently stops
// desktop notifications for MIS — this test pins that shape.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { Notification, User, UserProfile } from "../db/schema";
import { createUser, signToken } from "../test/fixtures";

// Copied verbatim from bridge.js WATCHERS.mis[0].match.
const MIS_WATCHER_MATCH = /^(?:https?:\/\/[^/]+)?\/notifications\/?(\?|$)/;
// The exact request the web app makes (frontend NotificationContext).
const WATCHED_PATH = "/notifications?limit=20";

describe("NGA Desktop watcher contract: MIS notifications", () => {
  let userId: number;
  let token: string;

  beforeAll(async () => {
    userId = await createUser({ userType: "TEACHER" });
    token = signToken(userId);
    await db.insert(Notification).values([
      {
        user_id: userId,
        kind: "desktop_contract",
        title: "Unread contract notification",
        body: "Body the desktop shows",
        link: "/office-hours",
      },
      {
        user_id: userId,
        kind: "desktop_contract",
        title: "Read contract notification",
        body: null,
        link: null,
        read_at: new Date(),
      },
    ] as any);
  });

  afterAll(async () => {
    await db.delete(Notification).where(eq(Notification.user_id, userId));
    try {
      await db.delete(UserProfile).where(eq(UserProfile.user_id, userId));
      await db.delete(User).where(eq(User.user_id, userId));
    } catch {
      // Request-side logging may reference the user; leaving a uniquely named test user is harmless.
    }
  });

  it("the path the web app polls is the one the watcher matches", () => {
    expect(MIS_WATCHER_MATCH.test(WATCHED_PATH)).toBe(true);
    // Only the top-level path: the calendar's notification settings must not look like the poll.
    expect(MIS_WATCHER_MATCH.test("/calendar/notifications")).toBe(false);
    expect(MIS_WATCHER_MATCH.test("https://api.amashuri.com/calendar/notifications")).toBe(false);
    expect(MIS_WATCHER_MATCH.test("/notifications")).toBe(true);
    // Sibling endpoints must NOT be picked up as notification lists.
    expect(MIS_WATCHER_MATCH.test("/notifications/unread-count")).toBe(false);
  });

  it("returns json.data[].notification with the fields the watcher reads", async () => {
    const res = await request(app).get(WATCHED_PATH).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const items = (res.body.data as any[]).filter((x) => x?.notification?.kind === "desktop_contract");
    expect(items).toHaveLength(2);

    for (const x of items) {
      const n = x.notification;
      expect(n && typeof n).toBe("object");
      expect(typeof n.notification_id).toBe("number");
      expect(Number.isFinite(n.notification_id)).toBe(true);
      expect(typeof n.title).toBe("string");
      expect(n.title.length).toBeGreaterThan(0);
      expect("body" in n).toBe(true);
      expect(n.body === null || typeof n.body === "string").toBe(true);
      expect("link" in n).toBe(true);
      expect(n.link === null || typeof n.link === "string").toBe(true);
      expect("read_at" in n).toBe(true);
      expect(n.created_at).toBeTruthy();
      expect(Number.isFinite(Date.parse(n.created_at))).toBe(true);
    }

    const unread = items.find((x) => x.notification.title === "Unread contract notification").notification;
    const read = items.find((x) => x.notification.title === "Read contract notification").notification;
    // The watcher computes unread as !read_at.
    expect(unread.read_at).toBeNull();
    expect(read.read_at).toBeTruthy();
    expect(Number.isFinite(Date.parse(read.read_at))).toBe(true);
    expect(unread.body).toBe("Body the desktop shows");
    expect(unread.link).toBe("/office-hours");
  });

  it("the bridge's pick() logic yields usable desktop notifications from the response", async () => {
    const res = await request(app).get(WATCHED_PATH).set("Authorization", `Bearer ${token}`);
    const str = (v: unknown) => (v == null ? "" : String(v));
    // Mirror of WATCHERS.mis[0].pick in bridge.js.
    const picked = ((res.body && res.body.data) || []).map((x: any) => {
      const n = x.notification || {};
      return { id: "n" + n.notification_id, title: str(n.title), body: str(n.body), link: n.link, unread: !n.read_at, at: Date.parse(n.created_at) };
    });
    const mine = picked.filter((p: any) => p.title.endsWith("contract notification"));
    expect(mine).toHaveLength(2);
    for (const p of mine) {
      expect(p.id).toMatch(/^n\d+$/);
      expect(Number.isFinite(p.at)).toBe(true);
    }
    expect(mine.filter((p: any) => p.unread)).toHaveLength(1);
  });
});
