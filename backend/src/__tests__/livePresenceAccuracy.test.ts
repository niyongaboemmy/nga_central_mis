import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  leave,
  listTopics,
  listWatchers,
  touch,
} from "../services/elearning/livePresence";

/**
 * "Learning right now" has to mean right now. Two things used to make it lie:
 *  - nothing told the server a student had left, so a watcher lingered for the whole
 *    stale window (worst on LINK items, which are read by leaving the tab);
 *  - the dwell label came from the lifetime seconds on the item, so a first visit always
 *    read "just arrived" no matter how long ago the pings stopped.
 */
describe("live presence accuracy", () => {
  const COURSE = 987_001;
  const where = (itemId: number | null, seconds = 0) => ({
    item_id: itemId,
    item_title: itemId ? `Item ${itemId}` : null,
    item_type: itemId ? "PAGE" : null,
    section_id: 5,
    section_title: "Week 3 — Data Types",
    state: "IN_PROGRESS",
    seconds_spent: seconds,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    // Clear any watcher left by a previous case.
    for (const w of listWatchers(COURSE)) leave(COURSE, w.user_id);
  });
  afterEach(() => vi.useRealTimers());

  it("reports a student who is pinging as active", () => {
    touch(COURSE, { user_id: 1, name: "Test Student" }, where(11));

    const [w] = listWatchers(COURSE);
    expect(w.active).toBe(true);
    expect(w.item_id).toBe(11);
  });

  it("stops calling a student active once the pings stop, while still listing them", () => {
    touch(COURSE, { user_id: 1, name: "Test Student" }, where(11));

    // One missed heartbeat plus slack: still listed, but no longer "learning right now".
    vi.advanceTimersByTime(50_000);
    const [away] = listWatchers(COURSE);
    expect(away.active).toBe(false);
    expect(listTopics(COURSE)[0].active_viewers).toBe(0);
    expect(listTopics(COURSE)[0].viewers).toBe(1);
  });

  it("drops the student entirely once they go stale", () => {
    touch(COURSE, { user_id: 1, name: "Test Student" }, where(11));
    vi.advanceTimersByTime(80_000);
    expect(listWatchers(COURSE)).toHaveLength(0);
  });

  it("removes a student the moment they leave, not a stale window later", () => {
    touch(COURSE, { user_id: 1, name: "Test Student" }, where(11));
    expect(listWatchers(COURSE)).toHaveLength(1);

    leave(COURSE, 1);
    expect(listWatchers(COURSE)).toHaveLength(0);
    expect(listTopics(COURSE)).toHaveLength(0);
  });

  it("is a no-op when a departure arrives twice, or after the sweep", () => {
    touch(COURSE, { user_id: 1, name: "Test Student" }, where(11));
    leave(COURSE, 1);
    expect(() => leave(COURSE, 1)).not.toThrow();
    expect(() => leave(COURSE, 999)).not.toThrow();
    expect(listWatchers(COURSE)).toHaveLength(0);
  });

  it("measures dwell from this visit, not from the lifetime total on the item", () => {
    // A student returning to an item they already spent 40 minutes in.
    touch(COURSE, { user_id: 1, name: "Test Student" }, where(11, 2400));
    vi.advanceTimersByTime(30_000);
    touch(COURSE, { user_id: 1, name: "Test Student" }, where(11, 2430));

    const [w] = listWatchers(COURSE);
    expect(w.seconds_spent).toBe(2430); // lifetime, unchanged
    expect(w.dwell_seconds).toBe(30); // this visit
  });

  it("restarts the visit clock when the student moves to another item", () => {
    touch(COURSE, { user_id: 1, name: "Test Student" }, where(11));
    vi.advanceTimersByTime(30_000);
    touch(COURSE, { user_id: 1, name: "Test Student" }, where(11));
    expect(listWatchers(COURSE)[0].dwell_seconds).toBe(30);

    touch(COURSE, { user_id: 1, name: "Test Student" }, where(12));
    expect(listWatchers(COURSE)[0].item_id).toBe(12);
    expect(listWatchers(COURSE)[0].dwell_seconds).toBe(0);
  });

  it("sorts students who are really here above ones who have wandered off", () => {
    touch(COURSE, { user_id: 1, name: "Away Student" }, where(11));
    vi.advanceTimersByTime(50_000);
    touch(COURSE, { user_id: 2, name: "Here Student" }, where(12));

    const names = listWatchers(COURSE).map((w) => w.name);
    expect(names[0]).toBe("Here Student");
    expect(listTopics(COURSE)[0].item_id).toBe(12);
  });
});
