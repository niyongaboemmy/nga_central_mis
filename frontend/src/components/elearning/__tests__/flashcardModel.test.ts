import { describe, it, expect } from "vitest";
import { humanInterval, previewIntervals, review, sessionQueue } from "../learner/flashcardModel";

describe("flashcards (FSRS on the device)", () => {
  const now = new Date("2026-10-01T08:00:00Z");

  it("schedules harder answers sooner than easier ones", () => {
    const again = review(null, "again", now).due.getTime();
    const good = review(null, "good", now).due.getTime();
    const easy = review(null, "easy", now).due.getTime();
    expect(again).toBeLessThan(good);
    expect(good).toBeLessThan(easy);
  });

  it("round-trips its state through JSON (what the server stores) and keeps growing intervals", () => {
    const first = review(null, "good", now);
    const stored = JSON.parse(JSON.stringify(first.state));
    const later = new Date(first.due.getTime() + 60_000);
    const second = review(stored, "good", later);
    expect(second.due.getTime() - later.getTime()).toBeGreaterThan(first.due.getTime() - now.getTime());
    expect(second.rating).toBe(3);
  });

  it("previews each button's interval in plain words", () => {
    const p = previewIntervals(null, now);
    expect(Object.keys(p)).toEqual(["again", "hard", "good", "easy"]);
    expect(humanInterval(90 * 60_000)).toBe("2 h");
    expect(humanInterval(3 * 86_400_000)).toBe("3 days");
  });

  it("queues due cards (oldest first), then new ones, never cards due later", () => {
    const cards = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const reviews = [
      { card_id: "a", due_at: "2026-09-30T08:00:00Z" },
      { card_id: "b", due_at: "2026-09-29T08:00:00Z" },
      { card_id: "c", due_at: "2026-10-05T08:00:00Z" },
    ];
    expect(sessionQueue(cards, reviews, now)).toEqual(["b", "a", "d"]);
  });
});
