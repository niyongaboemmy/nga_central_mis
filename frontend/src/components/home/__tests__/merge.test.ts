import { describe, it, expect } from "vitest";
import type { AttentionItem, TodayLesson } from "../contract";
import {
  EVERYTHING,
  groupByTier,
  itemsForLens,
  lessonState,
  nextLessonKey,
  pickHero,
  pressureByLens,
  rankItems,
  safeEntities,
  mergeApps,
  switcherLenses,
  TIER_LABEL,
} from "../merge";

const now = new Date("2026-09-25T10:00:00");

const item = (over: Partial<AttentionItem>): AttentionItem => ({
  id: over.id ?? Math.random().toString(36),
  source: "mis",
  kind: "T-04",
  tier: "slipping",
  lens: "TEACHING",
  via: [1],
  depth: "write",
  count: 1,
  title: "Something",
  entities: [],
  why: "",
  cta: { label: "Go", href: "/" },
  ...over,
});

const lesson = (start: string, end: string, key = start): TodayLesson => ({
  lesson_key: key,
  kind: "teaching",
  slot_id: 1,
  subject_id: 1,
  subject_name: "Maths",
  class_group_id: 1,
  class_group_name: "S1",
  start_time: start,
  end_time: end,
  location: null,
  color: null,
  href: "/",
});

describe("ranking", () => {
  it("puts tiers first, then whoever has waited longest", () => {
    const ranked = rankItems(
      [
        item({ id: "tidy", tier: "tidy" }),
        item({ id: "slip", tier: "slipping" }),
        item({ id: "block-new", tier: "blocking", waiting_since: "2026-09-25T09:00:00" }),
        item({ id: "block-old", tier: "blocking", waiting_since: "2026-09-20T09:00:00" }),
      ],
      now,
    );
    expect(ranked.map((i) => i.id)).toEqual(["block-old", "block-new", "slip", "tidy"]);
  });

  it("ranks something overdue above something due later in the same tier", () => {
    const ranked = rankItems(
      [item({ id: "later", due_at: "2026-09-27T00:00:00" }), item({ id: "late", due_at: "2026-09-24T00:00:00" })],
      now,
    );
    expect(ranked[0].id).toBe("late");
  });
});

describe("lenses", () => {
  const items = [
    item({ lens: "TEACHING", tier: "blocking" }),
    item({ lens: "PROGRAM:2", tier: "slipping" }),
    item({ lens: "PROGRAM:2", tier: "tidy" }),
  ];
  it("filters to one lens, or shows everything", () => {
    expect(itemsForLens(items, EVERYTHING)).toHaveLength(3);
    expect(itemsForLens(items, "PROGRAM:2")).toHaveLength(2);
  });
  it("counts pressure per lens without tidy items", () => {
    expect(pressureByLens(items)).toEqual({ EVERYTHING: 2, TEACHING: 1, "PROGRAM:2": 1 });
  });
  it("hides the switcher when there is only one lens", () => {
    expect(switcherLenses([{ key: "SELF", type: "SELF", label: "Me", reason: "", via: [] }])).toEqual([]);
  });
  it("groups by tier", () => {
    expect(groupByTier(items).blocking).toHaveLength(1);
  });
});

describe("depth guard", () => {
  it("never renders names for a summary-depth item", () => {
    expect(safeEntities(item({ depth: "summary", entities: ["Aline M."] }))).toEqual([]);
    expect(safeEntities(item({ depth: "detail", entities: ["Aline M."] }))).toEqual(["Aline M."]);
  });
});

describe("Next up", () => {
  const lessons = [lesson("08:00", "08:40", "a"), lesson("09:50", "10:30", "b"), lesson("11:00", "11:40", "c")];
  it("leads with a blocking item", () => {
    const hero = pickHero([item({ tier: "blocking", title: "Registers" })], lessons, 600, null);
    expect(hero.kind).toBe("item");
  });
  it("otherwise shows the lesson happening now", () => {
    const hero = pickHero([item({ tier: "slipping" })], lessons, 600, null);
    expect(hero).toMatchObject({ kind: "lesson", state: "now" });
  });
  it("otherwise the next lesson, with the minutes until it starts", () => {
    const hero = pickHero([], lessons, 640, null);
    expect(hero).toMatchObject({ kind: "lesson", state: "next", minutesAway: 20 });
  });
  it("says all caught up when there is nothing left", () => {
    expect(pickHero([], lessons, 800, null).kind).toBe("clear");
  });
  it("marks each lesson done / now / next / later", () => {
    const key = nextLessonKey(lessons, 600);
    expect(key).toBe("c");
    expect(lessons.map((l) => lessonState(l, 600, key))).toEqual(["done", "now", "next"]);
  });
});

describe("audience copy", () => {
  it("speaks to learners and families in their own words, not about blocking work", () => {
    expect(TIER_LABEL.learner.blocking).toBe("Do now");
    expect(TIER_LABEL.family.slipping).toBe("Worth a look");
    expect(TIER_LABEL.staff.blocking).toBe("Needs you now");
  });
});

describe("other apps", () => {
  it("takes only apps that answered, and drops register marks that aren't the viewer's", () => {
    const merged = mergeApps([
      { source: "tupo", name: "Tupo", status: "loading" },
      { source: "taskmentor", name: "Task Mentor", status: "unavailable", message: "down" },
      {
        source: "attendance",
        name: "Attendance",
        status: "ok",
        summary: {
          version: 1, source: "attendance", generated_at: "", provisioned: true,
          items: [item({ source: "attendance" })], tiles: [], updates: [], comms: null, app_url: null,
          today_marks: [
            { lesson_key: "a", status: "done", href: null },
            { lesson_key: "b", status: "not_yours", href: null },
          ],
        },
      },
    ]);
    expect(merged.items).toHaveLength(1);
    expect(merged.registerMarks).toEqual({ a: "done" });
    expect(merged.comms).toBeNull();
  });
});
