import { describe, it, expect, beforeEach } from "vitest";
import {
  listTopics,
  listWatchers,
  touch,
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
    arrive(2, "Grace", { item_id: 11, item_title: "Stuck here", seconds: 1200 });

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
