import { describe, it, expect } from "vitest";
import { buildQueue } from "../queue";

const NOW = new Date(2026, 8, 23, 10, 0, 0); // Wed 23 Sep 2026

const iso = (daysFromNow: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
};

const card = (over: Partial<any> = {}): any => ({
  course_id: 1,
  subject_name: "JavaScript",
  cover_color: "#a3c93a",
  overdue_count: 0,
  due_soon: [],
  current_section: null,
  next_item: null,
  near_goal: [],
  ...over,
});

const dueItem = (over: Partial<any> = {}) => ({
  item_id: 1,
  title: "Quiz 1",
  item_type: "KNOWLEDGE_CHECK",
  due_at: iso(2),
  ...over,
});

describe("buildQueue", () => {
  it("ranks overdue above dated work above the open week above near-goal", () => {
    const queue = buildQueue(
      [
        card({
          course_id: 1,
          current_section: { section_id: 5, title: "Week 3 — Types" },
          next_item: {
            item_id: 7,
            title: "Type conversion",
            item_type: "LESSON_NOTE",
          },
        }),
        card({
          course_id: 2,
          subject_name: "PHP",
          due_soon: [dueItem({ item_id: 2, title: "Essay" })],
        }),
        card({ course_id: 3, subject_name: "CSS", overdue_count: 2 }),
        card({
          course_id: 4,
          subject_name: "HTML",
          near_goal: [{ section_id: 9, title: "Week 2 — Forms", remaining: 1 }],
        }),
      ],
      { now: NOW },
    );

    expect(queue.map((e) => e.kind)).toEqual([
      "overdue",
      "due",
      "week",
      "goal",
    ]);
  });

  it("orders dated work by how soon it is actually due", () => {
    const queue = buildQueue(
      [
        card({
          due_soon: [
            dueItem({ item_id: 1, title: "Later", due_at: iso(5) }),
            dueItem({ item_id: 2, title: "Sooner", due_at: iso(1) }),
          ],
        }),
      ],
      { now: NOW },
    );
    expect(queue.map((e) => e.title)).toEqual(["Sooner", "Later"]);
  });

  it("writes due dates the way a student reads them", () => {
    const queue = buildQueue(
      [
        card({
          due_soon: [
            dueItem({ item_id: 1, due_at: iso(0) }),
            dueItem({ item_id: 2, due_at: iso(1) }),
            dueItem({ item_id: 3, due_at: iso(3) }),
            dueItem({ item_id: 4, due_at: iso(20) }),
            dueItem({ item_id: 5, due_at: iso(-2) }),
          ],
        }),
      ],
      { now: NOW },
    );
    const meta = Object.fromEntries(queue.map((e) => [e.id, e.meta]));
    expect(meta["due-5"]).toBe("2d late");
    expect(meta["due-1"]).toBe("Today");
    expect(meta["due-2"]).toBe("Tomorrow");
    expect(meta["due-3"]).toBe("Sat");
    expect(meta["due-4"]).toBe("13 Oct");
  });

  it("does not repeat the course already shown in the hero", () => {
    const cards = [
      card({
        course_id: 1,
        current_section: { section_id: 5, title: "Week 3 — Types" },
        next_item: {
          item_id: 7,
          title: "Type conversion",
          item_type: "LESSON_NOTE",
        },
      }),
    ];
    expect(buildQueue(cards, { now: NOW, excludeCourseId: 1 })).toHaveLength(0);
    expect(buildQueue(cards, { now: NOW })).toHaveLength(1);
  });

  it("still lists the hero's course when it is overdue or has a deadline", () => {
    // Excluding the hero is about not repeating its "next item" beside itself;
    // it must never hide work that is actually late.
    const queue = buildQueue(
      [
        card({
          course_id: 1,
          overdue_count: 1,
          due_soon: [dueItem()],
          current_section: { section_id: 5, title: "Week 3 — Types" },
          next_item: {
            item_id: 7,
            title: "Type conversion",
            item_type: "LESSON_NOTE",
          },
        }),
      ],
      { now: NOW, excludeCourseId: 1 },
    );
    expect(queue.map((e) => e.kind)).toEqual(["overdue", "due"]);
  });

  it("caps the list so the panel cannot grow without bound", () => {
    const queue = buildQueue(
      [
        card({
          due_soon: Array.from({ length: 12 }, (_, i) =>
            dueItem({ item_id: i + 1, due_at: iso(i) }),
          ),
        }),
      ],
      { now: NOW, limit: 4 },
    );
    expect(queue).toHaveLength(4);
  });

  it("survives a card with no optional collections at all", () => {
    expect(
      buildQueue(
        [{ course_id: 1, subject_name: "X", overdue_count: 0 } as any],
        {
          now: NOW,
        },
      ),
    ).toEqual([]);
  });

  it("strips the week suffix so a row reads as a label, not a heading", () => {
    const [entry] = buildQueue(
      [
        card({
          current_section: { section_id: 5, title: "Week 3 — Data Types" },
          next_item: { item_id: 7, title: "Types", item_type: "LESSON_NOTE" },
        }),
      ],
      { now: NOW },
    );
    expect(entry.subtitle).toBe("JavaScript · Week 3");
  });
});
