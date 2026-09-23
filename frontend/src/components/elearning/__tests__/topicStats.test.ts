import { describe, it, expect } from "vitest";
import {
  buildTopicStats,
  sortTopics,
  summariseTopics,
  type AnalyticsSection,
} from "../builder/topicStats";

const item = (over: Partial<any> = {}): any => ({
  item_id: 1,
  title: "Video",
  item_type: "VIDEO",
  is_required: true,
  viewed: 10,
  completed: 5,
  avg_seconds: 300,
  avg_score: null,
  viewed_pct: 50,
  completed_pct: 25,
  ...over,
});

const section = (over: Partial<AnalyticsSection> = {}): AnalyticsSection => ({
  section_id: 5,
  title: "Week 3 — Data Types",
  items: [item()],
  ...over,
});

describe("buildTopicStats", () => {
  it("flattens every week onto one comparable list", () => {
    const stats = buildTopicStats([
      section(),
      section({
        section_id: 6,
        title: "Week 4 — Functions",
        items: [item({ item_id: 2, title: "Quiz" })],
      }),
    ]);
    expect(stats.map((s) => s.title)).toEqual(["Video", "Quiz"]);
    expect(stats[1].week_label).toBe("Week 4");
    expect(stats[1].section_title).toBe("Week 4 — Functions");
  });

  it("measures drop-off against who opened it, not the whole class", () => {
    const [stat] = buildTopicStats([
      section({ items: [item({ viewed: 10, completed: 4 })] }),
    ]);
    expect(stat.dropoff_pct).toBe(60);
  });

  it("does not invent a problem for a topic nobody has opened", () => {
    // 0 opened, 0 finished is an absence of data, not a 100% drop-off.
    const [stat] = buildTopicStats([
      section({ items: [item({ viewed: 0, completed: 0 })] }),
    ]);
    expect(stat.dropoff_pct).toBe(0);
  });

  it("folds the live reader count onto the matching topic", () => {
    const stats = buildTopicStats(
      [
        section({
          items: [item({ item_id: 1 }), item({ item_id: 2, title: "Quiz" })],
        }),
      ],
      [
        {
          item_id: 2,
          item_title: "Quiz",
          item_type: "KNOWLEDGE_CHECK",
          section_id: 5,
          section_title: "Week 3 — Data Types",
          viewers: 3,
          readers: [],
          max_seconds: 60,
        },
        // A student browsing with no item must not attach to anything.
        {
          item_id: null,
          item_title: null,
          item_type: null,
          section_id: null,
          section_title: null,
          viewers: 1,
          readers: [],
          max_seconds: 10,
        },
      ],
    );
    expect(stats.find((s) => s.item_id === 2)?.live_viewers).toBe(3);
    expect(stats.find((s) => s.item_id === 1)?.live_viewers).toBe(0);
  });
});

describe("sortTopics", () => {
  const stats = buildTopicStats([
    section({
      items: [
        // Big wall: many opened it, few finished.
        item({
          item_id: 1,
          title: "Wall",
          viewed: 20,
          completed: 2,
          completed_pct: 10,
          avg_seconds: 100,
        }),
        // Small wall: same ratio, far fewer students hit it.
        item({
          item_id: 2,
          title: "Small wall",
          viewed: 2,
          completed: 0,
          completed_pct: 0,
          avg_seconds: 900,
        }),
        item({
          item_id: 3,
          title: "Fine",
          viewed: 18,
          completed: 18,
          completed_pct: 100,
          avg_seconds: 60,
        }),
      ],
    }),
  ]);

  it("ranks by the size of the wall, not the ratio alone", () => {
    // "Small wall" has a worse ratio but only two students met it.
    expect(sortTopics(stats, "attention")[0].title).toBe("Wall");
  });

  it("sorts by visits, completion and time on request", () => {
    expect(sortTopics(stats, "visits")[0].title).toBe("Wall");
    expect(sortTopics(stats, "completion")[0].title).toBe("Small wall");
    expect(sortTopics(stats, "time")[0].title).toBe("Small wall");
  });

  it("leaves course order untouched and never mutates the input", () => {
    const before = stats.map((s) => s.title);
    expect(sortTopics(stats, "order").map((s) => s.title)).toEqual(before);
    sortTopics(stats, "visits");
    expect(stats.map((s) => s.title)).toEqual(before);
  });
});

describe("summariseTopics", () => {
  it("names the worst offender and averages only topics anyone opened", () => {
    const stats = buildTopicStats([
      section({
        items: [
          item({
            item_id: 1,
            title: "Wall",
            viewed: 20,
            completed: 2,
            completed_pct: 10,
          }),
          item({
            item_id: 2,
            title: "Fine",
            viewed: 10,
            completed: 10,
            completed_pct: 100,
          }),
          // Never opened — must not drag the average to 0.
          item({
            item_id: 3,
            title: "Unseen",
            viewed: 0,
            completed: 0,
            completed_pct: 0,
          }),
        ],
      }),
    ]);
    const summary = summariseTopics(stats);
    expect(summary.worst?.title).toBe("Wall");
    expect(summary.avgCompletion).toBe(55);
    expect(summary.totalVisits).toBe(30);
    expect(summary.topics).toBe(3);
  });

  it("reports no worst topic when nothing is dropping off", () => {
    const stats = buildTopicStats([
      section({
        items: [item({ viewed: 5, completed: 5, completed_pct: 100 })],
      }),
    ]);
    expect(summariseTopics(stats).worst).toBeNull();
  });
});
