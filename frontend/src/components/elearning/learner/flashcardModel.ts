import { createEmptyCard, fsrs, Rating, type Card } from "ts-fsrs";

/**
 * Spaced repetition for flashcards (LESSON_STUDIO plan §11) with FSRS (ts-fsrs, MIT). The
 * schedule is computed here on the device, so a review session works offline; the server only
 * stores the resulting state. Pure functions — tested without a browser.
 */

export type Grade = "again" | "hard" | "good" | "easy";
export const GRADE_RATING: Record<Grade, Rating> = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };
export const GRADE_LABEL: Record<Grade, string> = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

const scheduler = fsrs({ enable_fuzz: false, maximum_interval: 365 });

/** A stored state (JSON from the server) back into an FSRS card. */
export function cardFromState(state: any, now = new Date()): Card {
  if (!state || typeof state !== "object") return createEmptyCard(now);
  return {
    ...createEmptyCard(now),
    ...state,
    due: new Date(state.due ?? now),
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  } as Card;
}

/** One review: the next state, when it's due, and a friendly "see it again in …". */
export function review(state: any, grade: Grade, now = new Date()) {
  const card = cardFromState(state, now);
  const next = scheduler.next(card, now, GRADE_RATING[grade] as any).card;
  return { state: { ...next, due: next.due.toISOString(), last_review: next.last_review ? new Date(next.last_review).toISOString() : now.toISOString() }, due: next.due, rating: GRADE_RATING[grade] as number };
}

/** What each button would schedule — shown under the buttons so students see the effect. */
export function previewIntervals(state: any, now = new Date()): Record<Grade, string> {
  const out = {} as Record<Grade, string>;
  for (const g of Object.keys(GRADE_RATING) as Grade[]) out[g] = humanInterval(review(state, g, now).due.getTime() - now.getTime());
  return out;
}

export function humanInterval(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} day${d === 1 ? "" : "s"}`;
  const mo = Math.round(d / 30);
  return `${mo} month${mo === 1 ? "" : "s"}`;
}

/**
 * Today's queue for one deck: cards due now first (oldest first), then cards never seen. A
 * card marked "Again" comes back within the same session.
 */
export function sessionQueue(cards: { id: string }[], reviews: { card_id: string; due_at: string | Date }[], now = new Date()): string[] {
  const byId = new Map(reviews.map((r) => [r.card_id, new Date(r.due_at).getTime()]));
  const due = cards.filter((c) => byId.has(c.id) && byId.get(c.id)! <= now.getTime()).sort((a, b) => byId.get(a.id)! - byId.get(b.id)!);
  const fresh = cards.filter((c) => !byId.has(c.id));
  return [...due, ...fresh].map((c) => c.id);
}
