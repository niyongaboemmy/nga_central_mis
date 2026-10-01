import logger from "../../utils/logger";
import { APP_BY_CODE } from "./apps";
import { activityTablesPresent, q } from "./db";
import { refreshBlocks } from "./blocklist";
import { loadCatalog, saveCatalog } from "./catalog";
import misCatalog from "./catalogs/mis.json";
import * as presence from "./presence";
import { activityBus, clock } from "./runtime";
import { reloadOpenSessions, sweepSessions } from "./sessionizer";
import { getSettings } from "./settings";
import { flushActivity } from "./writer";
import { activityNightlyHooks, rollupTick } from "./rollup";
import { expireWatches, refreshWatches, startWatchMatcher } from "./watches";

/**
 * Starts the activity engine's timers (plan §9): buffered flush every 2 s, presence
 * sweep every 15 s, session sweep every 60 s, and SSE diff fan-out every 2 s.
 * Rollups and retention are started by rollup.ts. Under test nothing starts; tests
 * call flushActivity() / sweepPresence() themselves.
 */
type LiveListener = (msg: { type: string; [k: string]: unknown }) => void;
const listeners = new Set<LiveListener>();

export const subscribeLive = (fn: LiveListener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const liveListenerCount = () => listeners.size;

const broadcast = (msg: { type: string; [k: string]: unknown }) => {
  for (const fn of listeners) {
    try {
      fn(msg);
    } catch {
      /* a broken stream is cleaned up by its own close handler */
    }
  }
};

/** Push presence diffs (and the live event stream) to every open console. */
export const pushLiveDiffs = () => {
  const { upsert, remove } = presence.takeDiffs();
  if (upsert.length || remove.length) broadcast({ type: "diff", upsert, remove, at: new Date(clock.now()).toISOString() });
};

// Logins, failed logins, launches and key events go straight to the live event stream,
// and the last 50 are kept so a console opened now isn't empty.
const recent: Record<string, unknown>[] = [];
export const recentLiveEvents = () => [...recent];
activityBus.on("signal", (s: any) => {
  if (s.type !== "live_event") return;
  recent.unshift(s.event);
  if (recent.length > 50) recent.pop();
  broadcast({ type: "event", event: s.event });
});

let timers: NodeJS.Timeout[] = [];
let started = false;

export const startActivityEngine = async () => {
  if (started) return;
  started = true;
  try {
    if (!(await activityTablesPresent())) {
      logger.warn("[activity] migration 095 not applied; activity engine idle");
      started = false;
      return;
    }
    await getSettings();
    // The MIS publishes its own feature catalog; the other apps push theirs via the relay.
    await saveCatalog("mis", misCatalog.version, misCatalog.features as any);
    await loadCatalog(true);
    await refreshBlocks(true);
    await refreshWatches(true);
    startWatchMatcher();
    activityNightlyHooks.push(expireWatches);
    const reloaded = await reloadOpenSessions();
    await seedPresenceHistory();
    logger.info(`[activity] engine started (${reloaded} open sessions reloaded)`);
  } catch (error) {
    logger.error("[activity] engine start failed", { error });
  }
  const every = (ms: number, fn: () => unknown) => {
    const t = setInterval(() => {
      Promise.resolve()
        .then(fn)
        .catch((error) => logger.error("[activity] timer failed", { error }));
    }, ms);
    t.unref();
    timers.push(t);
  };
  every(2_000, flushActivity);
  every(2_000, pushLiveDiffs);
  every(15_000, () => {
    presence.sweepPresence();
  });
  every(60_000, () => {
    sweepSessions();
  });
  every(30_000, () => getSettings());
  every(30_000, () => refreshBlocks());
  every(10_000, () => broadcast({ type: "ping", at: new Date(clock.now()).toISOString() }));
  // Rollups for today every 5 min (+ the nightly maintenance run inside rollupTick).
  every(5 * 60_000, rollupTick);
  setTimeout(() => void rollupTick().catch((error) => logger.error("[activity] rollup failed", { error })), 20_000).unref();
};

export const stopActivityEngine = async () => {
  for (const t of timers) clearInterval(t);
  timers = [];
  started = false;
  await flushActivity();
};

/** Rebuild the last-30-minutes chart after a restart. */
const seedPresenceHistory = async () => {
  const since = new Date(clock.now() - 30 * 60_000);
  const rows = await q<any>(
    `SELECT DISTINCT app, FLOOR(UNIX_TIMESTAMP(occurred_at) / 60) AS minute,
            IF(user_id IS NULL, CONCAT('d:', device_id), CONCAT('u:', user_id)) AS pkey
       FROM AnalyticsEvent
      WHERE occurred_at >= ? AND (flags & 12) = 0 AND name NOT IN ('session_start','first_visit')
      LIMIT 50000`,
    [since],
  );
  presence.seedMinutes(rows.map((r) => ({ minute: Number(r.minute), app: APP_BY_CODE[r.app], key: r.pkey })).filter((r) => r.app));
};

/** Graceful shutdown: flush what is buffered (pm2 kill_timeout must allow ~2-5 s). */
export const flushOnShutdown = async () => {
  try {
    await flushActivity();
  } catch {
    /* best effort */
  }
};
