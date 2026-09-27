import { Response } from "express";
import logger from "../../utils/logger";

/**
 * Who is learning right now, and what just happened — in memory, per process.
 *
 * Presence is derived from the pings the learner already sends (opening an item, then a
 * heartbeat every 30 s), so nothing new is asked of the student's device. A watcher goes
 * stale after STALE_MS without a ping, which is why the heartbeat interval must stay well
 * under it. Teachers subscribe over SSE rather than WebSockets: it survives the existing
 * nginx/pm2 setup untouched (with X-Accel-Buffering: no), reconnects on its own, and this
 * traffic is one-way by nature.
 *
 * Single-process only, like the AI job stores: pm2 runs mis-backend with instances: 1. If that
 * ever becomes a cluster, this needs Redis pub/sub behind the same two functions.
 */

const STALE_MS = 75_000; // ~2.5 missed heartbeats
/**
 * A watcher is only "on this page right now" while its pings are current. Between one
 * missed heartbeat and the stale cutoff it is still listed — the student may just have
 * switched tabs — but it is reported as away, because a teacher reading "learning now"
 * needs that to mean now. 45 s = one missed 30 s heartbeat plus slack.
 */
const ACTIVE_MS = 45_000;
const SWEEP_MS = 20_000;
const MAX_RECENT = 30;

/** Where in a page the student's viewport currently is. */
export interface ReadingPosition {
  /** 0-100 down the scrollable content. */
  scroll_pct: number;
  /** The nearest heading above the viewport, so a teacher reads a place, not a number. */
  heading: string | null;
  at: number;
}

export interface Watcher {
  user_id: number;
  name: string;
  /** Live scroll position, present once the reader has reported one. */
  position?: ReadingPosition | null;
  item_id: number | null;
  item_title: string | null;
  item_type: string | null;
  section_id: number | null;
  section_title: string | null;
  state: string;
  seconds_spent: number;
  since: number;
  last_seen: number;
  /** Pings are current — the student really is on this page. */
  active: boolean;
  /** Seconds on this item in this visit, as opposed to the lifetime total in
   *  `seconds_spent`, which counts every previous visit too. */
  dwell_seconds: number;
}

/**
 * The same watchers, rolled up by the thing they are reading.
 *
 * A flat list of names answers "who is here"; it does not answer "where is the
 * class right now", which is the question a teacher actually asks mid-lesson —
 * are they all still on the video, has anyone reached the quiz, is someone
 * stuck on one page. Grouping is done here rather than in the browser so the
 * SSE payload carries the answer and every client agrees on it.
 */
export interface TopicPresence {
  /** null = in the course but not on any item yet. */
  item_id: number | null;
  item_title: string | null;
  item_type: string | null;
  section_id: number | null;
  section_title: string | null;
  viewers: number;
  /** Of those viewers, how many are pinging right now rather than idling away. */
  active_viewers: number;
  /** Who exactly, so a teacher can see which student is on which page. */
  readers: {
    user_id: number;
    name: string;
    seconds_spent: number;
    active: boolean;
    /** Where in the page they are, once the reader has reported it. */
    position?: ReadingPosition | null;
  }[];
  /** Longest dwell on this topic right now — the "someone is stuck" signal. */
  max_seconds: number;
}

export type LiveEventType = "presence" | "progress";

export interface LiveEvent {
  type: LiveEventType;
  /** Present on "progress": what the student just did. */
  progress?: {
    user_id: number;
    name: string;
    item_id: number;
    item_title: string;
    item_type: string;
    section_id: number;
    section_title: string | null;
    verb: "started" | "completed" | "scored";
    score_pct?: number | null;
    at: number;
  };
  watchers?: Watcher[];
  /** Watchers grouped by item — see TopicPresence. */
  topics?: TopicPresence[];
  at: number;
}

/** What is actually stored. `active` and `dwell_seconds` are derived on read so a watcher
 *  decays by itself, without anything having to write to it again. */
type StoredWatcher = Omit<Watcher, "active" | "dwell_seconds">;

const watchersByCourse = new Map<number, Map<number, StoredWatcher>>();
const recentByCourse = new Map<number, NonNullable<LiveEvent["progress"]>[]>();
const subscribersByCourse = new Map<number, Set<Response>>();

const send = (res: Response, event: LiveEvent) => {
  try {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {
    /* a dead socket is cleaned up by its own close handler */
  }
};

/** Pushes to every teacher watching this course. */
export function publish(courseId: number, event: LiveEvent): void {
  const subs = subscribersByCourse.get(courseId);
  if (!subs || subs.size === 0) return;
  for (const res of subs) send(res, event);
}

const prune = (courseId: number): Watcher[] => {
  const map = watchersByCourse.get(courseId);
  if (!map) return [];
  const cutoff = Date.now() - STALE_MS;
  let changed = false;
  for (const [userId, w] of map) {
    if (w.last_seen < cutoff) {
      map.delete(userId);
      changed = true;
    }
  }
  if (map.size === 0) watchersByCourse.delete(courseId);
  void changed;
  const now = Date.now();
  return (
    [...(watchersByCourse.get(courseId)?.values() ?? [])]
      // active/dwell are derived on read, never stored: a watcher that stops pinging has to
      // decay on its own, without anything having to write to it again.
      .map((w) => ({
        ...w,
        active: now - w.last_seen <= ACTIVE_MS,
        dwell_seconds: Math.max(0, Math.round((w.last_seen - w.since) / 1000)),
      }))
      .sort(
        (a, b) =>
          Number(b.active) - Number(a.active) || b.last_seen - a.last_seen,
      )
  );
};

export function listWatchers(courseId: number): Watcher[] {
  return prune(courseId);
}

/**
 * Current watchers grouped by item, busiest first. A tie is broken by the
 * longest dwell, so of two topics with one reader each the one somebody has
 * been sitting on for twenty minutes sorts above the one just opened.
 */
export function listTopics(courseId: number): TopicPresence[] {
  const byItem = new Map<string, TopicPresence>();

  for (const w of listWatchers(courseId)) {
    const key = w.item_id === null ? "browsing" : String(w.item_id);
    const seconds = w.seconds_spent || 0;
    const existing = byItem.get(key);
    if (existing) {
      existing.viewers += 1;
      if (w.active) existing.active_viewers += 1;
      existing.readers.push({
        user_id: w.user_id,
        name: w.name,
        seconds_spent: seconds,
        active: w.active,
        position: w.position ?? null,
      });
      existing.max_seconds = Math.max(existing.max_seconds, seconds);
      continue;
    }
    byItem.set(key, {
      item_id: w.item_id,
      item_title: w.item_title,
      item_type: w.item_type,
      section_id: w.section_id,
      section_title: w.section_title,
      viewers: 1,
      active_viewers: w.active ? 1 : 0,
      readers: [
        {
          user_id: w.user_id,
          name: w.name,
          seconds_spent: seconds,
          active: w.active,
          position: w.position ?? null,
        },
      ],
      max_seconds: seconds,
    });
  }

  return [...byItem.values()]
    .map((topic) => ({
      ...topic,
      readers: topic.readers.sort((a, b) => b.seconds_spent - a.seconds_spent),
    }))
    .sort(
      (a, b) =>
        b.active_viewers - a.active_viewers ||
        b.viewers - a.viewers ||
        b.max_seconds - a.max_seconds,
    );
}

export function listRecent(courseId: number) {
  return (recentByCourse.get(courseId) || []).slice(0, MAX_RECENT);
}

/** A student is on an item right now (called from open + heartbeat). */
export function touch(
  courseId: number,
  who: { user_id: number; name: string },
  where: {
    item_id: number | null;
    item_title: string | null;
    item_type: string | null;
    section_id: number | null;
    section_title: string | null;
    state: string;
    seconds_spent: number;
  },
): void {
  if (!watchersByCourse.has(courseId))
    watchersByCourse.set(courseId, new Map());
  const map = watchersByCourse.get(courseId)!;
  const existing = map.get(who.user_id);
  const now = Date.now();
  const movedItem = existing?.item_id !== where.item_id;
  map.set(who.user_id, {
    user_id: who.user_id,
    name: who.name,
    ...where,
    // A heartbeat carries no scroll position, so keep the last one — unless the
    // student has moved to a different page, where the old position is a lie.
    position: existing && !movedItem ? (existing.position ?? null) : null,
    since: existing && !movedItem ? existing.since : now,
    last_seen: now,
  });
  // Only wake the teachers' screens when someone arrives or changes item; a plain heartbeat
  // on the same item is just a liveness renewal and the sweep already refreshes the list.
  if (!existing || movedItem)
    publish(courseId, {
      type: "presence",
      watchers: listWatchers(courseId),
      topics: listTopics(courseId),
      at: now,
    });
}

/**
 * A student left the item (navigated away, closed the tab, or backgrounded it). Without
 * this the teacher's list kept them on the page for the whole STALE_MS window — which is
 * most visible on LINK items, where reading the material *requires* leaving the tab.
 *
 * Idempotent: a beacon that arrives twice, or after the sweep already dropped the
 * watcher, is a no-op.
 */
export function leave(courseId: number, userId: number): void {
  const map = watchersByCourse.get(courseId);
  if (!map?.delete(userId)) return;
  if (map.size === 0) watchersByCourse.delete(courseId);
  publish(courseId, {
    type: "presence",
    watchers: listWatchers(courseId),
    topics: listTopics(courseId),
    at: Date.now(),
  });
}

/**
 * The student scrolled. Updates an existing watcher only — it is deliberately a
 * no-op for a user who is not already present in this course, so the cheap
 * no-DB endpoint behind it cannot be used to fabricate presence: the watcher it
 * updates was created by an authenticated, DB-verified open or heartbeat.
 *
 * Returns whether anything was updated, so the route can answer honestly.
 */
export function updatePosition(
  courseId: number,
  userId: number,
  itemId: number,
  position: { scroll_pct: number; heading: string | null },
): boolean {
  const watcher = watchersByCourse.get(courseId)?.get(userId);
  if (!watcher || watcher.item_id !== itemId) return false;
  const now = Date.now();
  watcher.position = {
    scroll_pct: Math.max(0, Math.min(100, Math.round(position.scroll_pct))),
    heading: position.heading,
    at: now,
  };
  watcher.last_seen = now;
  publish(courseId, {
    type: "presence",
    watchers: listWatchers(courseId),
    topics: listTopics(courseId),
    at: now,
  });
  return true;
}

/** A student finished or scored something — the teacher sees it land. */
export function recordProgress(
  courseId: number,
  progress: NonNullable<LiveEvent["progress"]>,
): void {
  const list = recentByCourse.get(courseId) || [];
  list.unshift(progress);
  recentByCourse.set(courseId, list.slice(0, MAX_RECENT));
  publish(courseId, {
    type: "progress",
    progress,
    watchers: listWatchers(courseId),
    topics: listTopics(courseId),
    at: progress.at,
  });
}

/** Attaches one teacher's SSE stream to a course. Returns the detach function. */
export function subscribe(courseId: number, res: Response): () => void {
  if (!subscribersByCourse.has(courseId))
    subscribersByCourse.set(courseId, new Set());
  subscribersByCourse.get(courseId)!.add(res);
  return () => {
    const subs = subscribersByCourse.get(courseId);
    subs?.delete(res);
    if (subs && subs.size === 0) subscribersByCourse.delete(courseId);
  };
}

export function subscriberCount(courseId: number): number {
  return subscribersByCourse.get(courseId)?.size ?? 0;
}

/**
 * Drops stale watchers and re-publishes, so a teacher's list empties on its own when the
 * class closes their laptops. Also doubles as the SSE keep-alive tick.
 */
let sweep: NodeJS.Timeout | null = null;
export function startLiveSweep(): void {
  if (sweep) return;
  sweep = setInterval(() => {
    for (const courseId of [...subscribersByCourse.keys()]) {
      const before = watchersByCourse.get(courseId)?.size ?? 0;
      const watchers = listWatchers(courseId);
      if (watchers.length !== before)
        publish(courseId, {
          type: "presence",
          watchers,
          topics: listTopics(courseId),
          at: Date.now(),
        });
      // Comment frame: keeps proxies and browsers from closing an idle stream.
      for (const res of subscribersByCourse.get(courseId) || []) {
        try {
          res.write(": ping\n\n");
        } catch {
          /* closed */
        }
      }
    }
  }, SWEEP_MS);
  sweep.unref();
  logger.info("[elearning] live presence sweep started");
}

/** Test helper — clears every in-memory map. */
export function __resetLive(): void {
  watchersByCourse.clear();
  recentByCourse.clear();
  subscribersByCourse.clear();
}
