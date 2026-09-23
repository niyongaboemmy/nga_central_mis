import { describe, it, expect, beforeEach } from "vitest";
import {
  listTopics,
  listWatchers,
  touch,
  updatePosition,
} from "../services/elearning/livePresence";

// A flat watcher list answers "who is here". The topic rollup answers "where is
// the class right now" — which page each student is actually reading, and which
// page the class has bunched up on.
describe("live topic presence", () => {
  // vitest.config.ts sets `isolate: false`, so every test file shares one
  // module registry — and therefore this module's in-memory presence maps.
  // Calling __resetLive() here would wipe the presence the e-learning suites
  // build up while they run. Each test gets its own course id instead, which
  // isolates it without touching anything else.
  let COURSE = 900_000;

  const arrive = (
    userId: number,
    name: string,
    item: {
      item_id: number | null;
      item_title?: string | null;
      section_title?: string | null;
      seconds?: number;
    },
  ) =>
    touch(
      COURSE,
      { user_id: userId, name },
      {
        item_id: item.item_id,
        item_title: item.item_title ?? null,
        item_type: "VIDEO",
        section_id: item.item_id === null ? null : 5,
        section_title: item.section_title ?? "Week 3 — Data Types",
        state: "IN_PROGRESS",
        seconds_spent: item.seconds ?? 0,
      },
    );

  beforeEach(() => {
    COURSE += 1;
  });

  it("groups readers by the page they are on", () => {
    arrive(1, "Ada", { item_id: 10, item_title: "Video" });
    arrive(2, "Grace", { item_id: 10, item_title: "Video" });
    arrive(3, "Alan", { item_id: 11, item_title: "Quiz" });

    const topics = listTopics(COURSE);
    expect(topics).toHaveLength(2);
    expect(topics[0]).toMatchObject({
      item_id: 10,
      item_title: "Video",
      viewers: 2,
    });
    expect(topics[0].readers.map((r) => r.name).sort()).toEqual([
      "Ada",
      "Grace",
    ]);
    expect(topics[1]).toMatchObject({ item_id: 11, viewers: 1 });
  });

  it("puts the busiest topic first, breaking ties on the longest dwell", () => {
    // Two topics with one reader each: the one somebody has been stuck on for
    // twenty minutes outranks the one just opened.
    arrive(1, "Ada", { item_id: 10, item_title: "Just opened", seconds: 5 });
    arrive(2, "Grace", {
      item_id: 11,
      item_title: "Stuck here",
      seconds: 1200,
    });

    expect(listTopics(COURSE).map((t) => t.item_title)).toEqual([
      "Stuck here",
      "Just opened",
    ]);

    // A third reader on the freshly opened page flips the order — count wins
    // over dwell.
    arrive(3, "Alan", { item_id: 10, item_title: "Just opened", seconds: 2 });
    arrive(4, "Edsger", { item_id: 10, item_title: "Just opened", seconds: 2 });
    expect(listTopics(COURSE)[0].item_title).toBe("Just opened");
  });

  it("reports the longest dwell on a topic, not the average", () => {
    arrive(1, "Ada", { item_id: 10, seconds: 30 });
    arrive(2, "Grace", { item_id: 10, seconds: 900 });
    const [topic] = listTopics(COURSE);
    expect(topic.max_seconds).toBe(900);
    // Readers are ordered by dwell so the stuck one is named first.
    expect(topic.readers[0].name).toBe("Grace");
  });

  it("keeps students who are in the course but not on any item in their own bucket", () => {
    arrive(1, "Ada", { item_id: null });
    arrive(2, "Grace", { item_id: 10, item_title: "Video" });

    const browsing = listTopics(COURSE).find((t) => t.item_id === null);
    expect(browsing?.viewers).toBe(1);
    expect(browsing?.readers[0].name).toBe("Ada");
  });

  it("follows a student who moves to another page", () => {
    arrive(1, "Ada", { item_id: 10, item_title: "Video" });
    expect(listTopics(COURSE)[0].item_id).toBe(10);

    arrive(1, "Ada", { item_id: 11, item_title: "Quiz" });
    const topics = listTopics(COURSE);
    // One student can only be in one place — the old topic goes away entirely.
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({ item_id: 11, viewers: 1 });
    expect(listWatchers(COURSE)).toHaveLength(1);
  });

  it("is empty for a course nobody is in", () => {
    expect(listTopics(COURSE + 500)).toEqual([]);
  });
});

describe("live reading position", () => {
  // Own course-id range again — the suite shares one module registry.
  let COURSE = 910_000;
  beforeEach(() => {
    COURSE += 1;
  });

  const arriveOn = (userId: number, itemId: number, seconds = 0) =>
    touch(
      COURSE,
      { user_id: userId, name: `User ${userId}` },
      {
        item_id: itemId,
        item_title: "Page",
        item_type: "PAGE",
        section_id: 5,
        section_title: "Week 3 — Data Types",
        state: "IN_PROGRESS",
        seconds_spent: seconds,
      },
    );

  it("records where in the page a student has scrolled to", () => {
    arriveOn(1, 10);
    expect(
      updatePosition(COURSE, 1, 10, {
        scroll_pct: 42,
        heading: "1.2 JS in HTML",
      }),
    ).toBe(true);

    const [topic] = listTopics(COURSE);
    expect(topic.readers[0].position).toMatchObject({
      scroll_pct: 42,
      heading: "1.2 JS in HTML",
    });
  });

  it("clamps a nonsense percentage instead of trusting the client", () => {
    arriveOn(1, 10);
    updatePosition(COURSE, 1, 10, { scroll_pct: 999, heading: null });
    expect(listWatchers(COURSE)[0].position?.scroll_pct).toBe(100);
    updatePosition(COURSE, 1, 10, { scroll_pct: -50, heading: null });
    expect(listWatchers(COURSE)[0].position?.scroll_pct).toBe(0);
  });

  it("cannot fabricate presence for someone who is not in the course", () => {
    // The endpoint behind this does no DB lookup, so refusing to create a
    // watcher is the whole of its authorisation.
    expect(
      updatePosition(COURSE, 99, 10, { scroll_pct: 50, heading: null }),
    ).toBe(false);
    expect(listWatchers(COURSE)).toHaveLength(0);
  });

  it("refuses a position for a page the student is not actually on", () => {
    arriveOn(1, 10);
    expect(
      updatePosition(COURSE, 1, 11, { scroll_pct: 50, heading: null }),
    ).toBe(false);
    expect(listWatchers(COURSE)[0].position).toBeNull();
  });

  it("keeps the position across a heartbeat on the same page", () => {
    arriveOn(1, 10);
    updatePosition(COURSE, 1, 10, { scroll_pct: 60, heading: "Section 2" });
    arriveOn(1, 10, 120); // a later heartbeat carries no position
    expect(listWatchers(COURSE)[0].position?.scroll_pct).toBe(60);
  });

  it("drops the position when the student moves to another page", () => {
    // Keeping it would report them 60% down a page they are no longer reading.
    arriveOn(1, 10);
    updatePosition(COURSE, 1, 10, { scroll_pct: 60, heading: "Section 2" });
    arriveOn(1, 11);
    expect(listWatchers(COURSE)[0].position).toBeNull();
  });
});
