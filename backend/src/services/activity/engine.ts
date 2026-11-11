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
import { TenantScopedSet, tenantLocal } from "../../tenancy/scoped";
import { tenantJob } from "../../tenancy/jobs";

/**
 * Starts the activity engine's timers (plan §9): buffered flush every 2 s, presence
 * sweep every 15 s, session sweep every 60 s, and SSE diff fan-out every 2 s.
 * Rollups and retention are started by rollup.ts. Under test nothing starts; tests
 * call flushActivity() / sweepPresence() themselves.
 */
type LiveListener = (msg: { type: string; [k: string]: unknown }) => void;
// Per school: a console only ever sees its own school's live stream.
const listeners = new TenantScopedSet<LiveListener>();

export const subscribeLive = (fn: LiveListener) => {
  // Captured now: the detach runs from a socket close handler, maybe outside the context.
  const mine = listeners.current();
  mine.add(fn);
  return () => mine.delete(fn);
};
export const liveListenerCount = () => listeners.size;

const broadcast = (msg: { type: string; [k: string]: unknown }) => {
  for (const fn of [...listeners]) {
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
const recentOf = tenantLocal(() => [] as Record<string, unknown>[]);
export const recentLiveEvents = () => [...recentOf()];
activityBus.on("signal", (s: any) => {
  if (s.type !== "live_event") return;
  const recent = recentOf();
  recent.unshift(s.event);
  if (recent.length > 50) recent.pop();
  broadcast({ type: "event", event: s.event });
});

let timers: NodeJS.Timeout[] = [];
let started = false;

/**
 * Per-school start-up (once per tenant, retried each minute while migration 095 is
 * missing there): settings, catalog, blocks, watches, open sessions, presence history.
 */
const tenantStart = tenantLocal(() => ({ ready: false, checkedAt: 0 }));
const ensureTenantStarted = async (): Promise<boolean> => {
  const st = tenantStart();
  if (st.ready) return true;
  if (Date.now() - st.checkedAt < 60_000 && st.checkedAt) return false;
  st.checkedAt = Date.now();
  if (!(await activityTablesPresent())) {
    logger.warn("[activity] migration 095 not applied; activity engine idle for this school");
    return false;
  }
  try {
    await getSettings();
    // The MIS publishes its own feature catalog; the other apps push theirs via the relay.
    await saveCatalog("mis", misCatalog.version, misCatalog.features as any);
    await loadCatalog(true);
    await refreshBlocks(true);
    await refreshWatches(true);
    const reloaded = await reloadOpenSessions();
    await seedPresenceHistory();
    logger.info(`[activity] engine started for this school (${reloaded} open sessions reloaded)`);
  } catch (error) {
    logger.error("[activity] engine start failed", { error });
  }
  st.ready = true;
  return true;
};

export const startActivityEngine = async () => {
  if (started) return;
  started = true;
  startWatchMatcher();
  activityNightlyHooks.push(expireWatches);
  await tenantJob("activity-start", () => ensureTenantStarted())();
  // Each timer visits every active school in its own context (tenantJob); the
  // per-(job, tid) lock keeps a slow school from overlapping itself.
  const every = (name: string, ms: number, fn: () => unknown, jitterMs?: number) => {
    const tick = tenantJob(`activity-${name}`, async () => {
      if (!(await ensureTenantStarted())) return;
      await fn();
    }, jitterMs === undefined ? {} : { jitterMs });
    const t = setInterval(() => void tick(), ms);
    t.unref();
    timers.push(t);
    return tick;
  };
  // flushActivity writes every school's buffers itself (each inside its tenant).
  const flushTimer = setInterval(() => {
    Promise.resolve()
      .then(flushActivity)
      .catch((error) => logger.error("[activity] timer failed", { error }));
  }, 2_000);
  flushTimer.unref();
  timers.push(flushTimer);
  every("diffs", 2_000, pushLiveDiffs, 0);
  every("presence", 15_000, () => {
    presence.sweepPresence();
  }, 0);
  every("sessions", 60_000, () => {
    sweepSessions();
  });
  every("settings", 30_000, () => getSettings());
  every("blocks", 30_000, () => refreshBlocks());
  every("ping", 10_000, () => broadcast({ type: "ping", at: new Date(clock.now()).toISOString() }), 0);
  // Rollups for today every 5 min (+ the nightly maintenance run inside rollupTick).
  const rollups = every("rollup", 5 * 60_000, rollupTick);
  setTimeout(() => void rollups(), 20_000).unref();
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
