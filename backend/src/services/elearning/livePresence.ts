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
const SWEEP_MS = 20_000;
const MAX_RECENT = 30;

export interface Watcher {
  user_id: number;
  name: string;
  item_id: number | null;
  item_title: string | null;
  item_type: string | null;
  section_id: number | null;
  section_title: string | null;
  state: string;
  seconds_spent: number;
  since: number;
  last_seen: number;
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
  at: number;
}

const watchersByCourse = new Map<number, Map<number, Watcher>>();
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
  return [...(watchersByCourse.get(courseId)?.values() ?? [])].sort((a, b) => b.last_seen - a.last_seen);
};

export function listWatchers(courseId: number): Watcher[] {
  return prune(courseId);
}

export function listRecent(courseId: number) {
  return (recentByCourse.get(courseId) || []).slice(0, MAX_RECENT);
}

/** A student is on an item right now (called from open + heartbeat). */
export function touch(
  courseId: number,
  who: { user_id: number; name: string },
  where: { item_id: number | null; item_title: string | null; item_type: string | null; section_id: number | null; section_title: string | null; state: string; seconds_spent: number },
): void {
  if (!watchersByCourse.has(courseId)) watchersByCourse.set(courseId, new Map());
  const map = watchersByCourse.get(courseId)!;
  const existing = map.get(who.user_id);
  const now = Date.now();
  const movedItem = existing?.item_id !== where.item_id;
  map.set(who.user_id, {
    user_id: who.user_id,
    name: who.name,
    ...where,
    since: existing && !movedItem ? existing.since : now,
    last_seen: now,
  });
  // Only wake the teachers' screens when someone arrives or changes item; a plain heartbeat
  // on the same item is just a liveness renewal and the sweep already refreshes the list.
  if (!existing || movedItem) publish(courseId, { type: "presence", watchers: listWatchers(courseId), at: now });
}

/** A student finished or scored something — the teacher sees it land. */
export function recordProgress(courseId: number, progress: NonNullable<LiveEvent["progress"]>): void {
  const list = recentByCourse.get(courseId) || [];
  list.unshift(progress);
  recentByCourse.set(courseId, list.slice(0, MAX_RECENT));
  publish(courseId, { type: "progress", progress, watchers: listWatchers(courseId), at: progress.at });
}

/** Attaches one teacher's SSE stream to a course. Returns the detach function. */
export function subscribe(courseId: number, res: Response): () => void {
  if (!subscribersByCourse.has(courseId)) subscribersByCourse.set(courseId, new Set());
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
      if (watchers.length !== before) publish(courseId, { type: "presence", watchers, at: Date.now() });
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
