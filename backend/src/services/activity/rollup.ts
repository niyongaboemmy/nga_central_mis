import logger from "../../utils/logger";
import { activityPool, exec, q } from "./db";
import { clock, kigaliDay, TZ_OFFSET_MS } from "./runtime";
import { getSettings } from "./settings";

/**
 * Daily rollups and data maintenance (plan §9.3).
 *
 * Every rollup row is recomputed idempotently from raw events and sessions with DELETE +
 * INSERT…SELECT for one Kigali day, so re-running is always safe. Late events (offline
 * queues ≤24 h, backdating ≤72 h) are absorbed by recomputing D-1..D-3 every night.
 * MySQL 5.7-compatible SQL only (no CTEs, no window functions).
 */

/** UTC bounds of a Kigali calendar day ("2026-10-01" → [2026-09-30T22:00Z, 2026-10-01T22:00Z)). */
export const dayBounds = (day: string): [Date, Date] => {
  const start = new Date(`${day}T00:00:00.000Z`).getTime() - TZ_OFFSET_MS;
  return [new Date(start), new Date(start + 86_400_000)];
};
export const addDays = (day: string, n: number) =>
  new Date(new Date(`${day}T00:00:00.000Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

const NOT_DERIVED = "e.name NOT IN ('session_start','first_visit')";
// flags: 4 = bot, 8 = excluded account, 1 = debug
const CLEAN = "(e.flags & 13) = 0";

export const rollupDay = async (day: string) => {
  const [from, to] = dayBounds(day);
  const conn = await activityPool().getConnection();
  try {
    const [[lock]]: any = await conn.query("SELECT GET_LOCK('activity_rollup', 30) AS ok");
    if (!lock?.ok) throw new Error("rollup lock busy");
    try {
      // --- per user per app ------------------------------------------------------------
      await conn.query("DELETE FROM AnalyticsUserDay WHERE day = ? AND source = 'live'", [day]);
      await conn.query(
        `INSERT INTO AnalyticsUserDay (day, user_id, app, sessions, page_views, events, engagement_ms, key_events, logins, is_active, first_at, last_at, source)
         SELECT ?, e.user_id, e.app,
                COUNT(DISTINCT e.session_id),
                SUM(e.name = 'page_view'),
                SUM(${NOT_DERIVED}),
                SUM(e.engagement_ms),
                SUM((e.flags & 2) > 0),
                SUM(e.name = 'login_success'),
                MAX(COALESCE(s.is_engaged, 0)),
                MIN(e.occurred_at), MAX(e.occurred_at), 'live'
           FROM AnalyticsEvent e
           LEFT JOIN AnalyticsSession s ON s.session_id = e.session_id
          WHERE e.occurred_at >= ? AND e.occurred_at < ? AND e.user_id IS NOT NULL AND ${CLEAN}
          GROUP BY e.user_id, e.app
         ON DUPLICATE KEY UPDATE sessions = VALUES(sessions), page_views = VALUES(page_views), events = VALUES(events),
           engagement_ms = VALUES(engagement_ms), key_events = VALUES(key_events), logins = VALUES(logins),
           is_active = VALUES(is_active), first_at = VALUES(first_at), last_at = VALUES(last_at), source = 'live'`,
        [day, from, to],
      );

      // --- visitors (devices with no signed-in activity that day) ------------------------
      await conn.query("DELETE FROM AnalyticsDeviceDay WHERE day = ?", [day]);
      await conn.query(
        `INSERT INTO AnalyticsDeviceDay (day, device_id, app, sessions, page_views, engagement_ms, is_active, is_bot, geo_id)
         SELECT ?, e.device_id, e.app, COUNT(DISTINCT e.session_id), SUM(e.name = 'page_view'), SUM(e.engagement_ms),
                MAX(COALESCE(s.is_engaged, 0)), MAX((e.flags & 4) > 0), MAX(e.geo_id)
           FROM AnalyticsEvent e
           LEFT JOIN AnalyticsSession s ON s.session_id = e.session_id
          WHERE e.occurred_at >= ? AND e.occurred_at < ? AND e.user_id IS NULL AND (e.flags & 9) = 0
            AND e.device_id <> 'server0000000000000000'
            AND NOT EXISTS (SELECT 1 FROM AnalyticsEvent u WHERE u.device_id = e.device_id AND u.user_id IS NOT NULL
                              AND u.occurred_at >= ? AND u.occurred_at < ?)
          GROUP BY e.device_id, e.app`,
        [day, from, to, from, to],
      );

      // --- features (pages) --------------------------------------------------------------
      await conn.query("DELETE FROM AnalyticsFeatureDay WHERE day = ?", [day]);
      await conn.query(
        `INSERT INTO AnalyticsFeatureDay (day, app, feature, audience, views, users, engaged_users, engagement_ms, events, key_events)
         SELECT ?, e.app, e.feature, IF(e.user_id IS NULL, 'visitor', 'user'),
                SUM(e.name = 'page_view'),
                COUNT(DISTINCT COALESCE(CONCAT('u', e.user_id), e.device_id)),
                COUNT(DISTINCT IF(e.engagement_ms > 0, COALESCE(CONCAT('u', e.user_id), e.device_id), NULL)),
                SUM(e.engagement_ms),
                SUM(${NOT_DERIVED}),
                SUM((e.flags & 2) > 0)
           FROM AnalyticsEvent e
          WHERE e.occurred_at >= ? AND e.occurred_at < ? AND ${CLEAN} AND e.feature IS NOT NULL
          GROUP BY e.app, e.feature, IF(e.user_id IS NULL, 'visitor', 'user')`,
        [day, from, to],
      );

      // --- dimensions (sessions started that day) -----------------------------------------
      await conn.query("DELETE FROM AnalyticsDimDay WHERE day = ?", [day]);
      const sessionDims: [string, string, string][] = [
        ["browser", "COALESCE(ua.browser, 'Unknown')", "LEFT JOIN AnalyticsUa ua ON ua.ua_id = s.ua_id"],
        ["os", "COALESCE(ua.os, 'Unknown')", "LEFT JOIN AnalyticsUa ua ON ua.ua_id = s.ua_id"],
        ["device_type", "COALESCE(ua.device_type, 'unknown')", "LEFT JOIN AnalyticsUa ua ON ua.ua_id = s.ua_id"],
        ["entry_kind", "s.entry_kind", ""],
        ["referrer_host", "COALESCE(s.referrer_host, '(direct)')", ""],
        ["landing", "COALESCE(s.entry_route, '(none)')", ""],
        ["exit", "COALESCE(s.exit_route, '(none)')", ""],
        ["network", "COALESCE(s.network_label, 'other')", ""],
        ["user_type", "COALESCE(s.user_type, 'VISITOR')", ""],
        ["app_path", "COALESCE(s.app_path, '')", ""],
        ["conn_type", "COALESCE(g.conn_type, 'unknown')", "LEFT JOIN AnalyticsGeo g ON g.geo_id = s.geo_id"],
      ];
      for (const [dim, expr, join] of sessionDims) {
        await conn.query(
          `INSERT INTO AnalyticsDimDay (day, app, dim, value, audience, users, sessions, views)
           SELECT ?, s.entry_app, ?, LEFT(${expr}, 191), IF(s.user_id IS NULL, 'visitor', 'user'),
                  COUNT(DISTINCT COALESCE(CONCAT('u', s.user_id), s.device_id)), COUNT(*), SUM(s.page_views)
             FROM AnalyticsSession s ${join}
            WHERE s.started_at >= ? AND s.started_at < ? AND s.is_bot = 0
              AND (s.user_id IS NULL OR s.user_id NOT IN (SELECT user_id FROM AnalyticsUserState WHERE excluded = 1))
            GROUP BY s.entry_app, LEFT(${expr}, 191), IF(s.user_id IS NULL, 'visitor', 'user')`,
          [day, dim, from, to],
        );
      }
      // Event-level dimensions: named events, PWA vs tab, release.
      await conn.query(
        `INSERT INTO AnalyticsDimDay (day, app, dim, value, audience, users, sessions, views)
         SELECT ?, e.app, 'event', e.name, IF(e.user_id IS NULL, 'visitor', 'user'),
                COUNT(DISTINCT COALESCE(CONCAT('u', e.user_id), e.device_id)), COUNT(DISTINCT e.session_id), COUNT(*)
           FROM AnalyticsEvent e
          WHERE e.occurred_at >= ? AND e.occurred_at < ? AND ${CLEAN} AND ${NOT_DERIVED}
          GROUP BY e.app, e.name, IF(e.user_id IS NULL, 'visitor', 'user')`,
        [day, from, to],
      );
      await conn.query(
        `INSERT INTO AnalyticsDimDay (day, app, dim, value, audience, users, sessions, views)
         SELECT ?, e.app, 'release', LEFT(JSON_UNQUOTE(JSON_EXTRACT(e.params, '$.rel')), 191), IF(e.user_id IS NULL, 'visitor', 'user'),
                COUNT(DISTINCT COALESCE(CONCAT('u', e.user_id), e.device_id)), COUNT(DISTINCT e.session_id), COUNT(*)
           FROM AnalyticsEvent e
          WHERE e.occurred_at >= ? AND e.occurred_at < ? AND ${CLEAN} AND e.name = 'page_view'
            AND JSON_EXTRACT(e.params, '$.rel') IS NOT NULL
          GROUP BY e.app, LEFT(JSON_UNQUOTE(JSON_EXTRACT(e.params, '$.rel')), 191), IF(e.user_id IS NULL, 'visitor', 'user')`,
        [day, from, to],
      );
      await conn.query(
        `INSERT INTO AnalyticsDimDay (day, app, dim, value, audience, users, sessions, views)
         SELECT ?, e.app, 'standalone', IF(JSON_EXTRACT(e.params, '$.standalone') = TRUE, 'Installed app', 'Browser tab'),
                IF(e.user_id IS NULL, 'visitor', 'user'),
                COUNT(DISTINCT COALESCE(CONCAT('u', e.user_id), e.device_id)), COUNT(DISTINCT e.session_id), COUNT(*)
           FROM AnalyticsEvent e
          WHERE e.occurred_at >= ? AND e.occurred_at < ? AND ${CLEAN} AND e.name = 'page_view'
          GROUP BY e.app, IF(JSON_EXTRACT(e.params, '$.standalone') = TRUE, 'Installed app', 'Browser tab'), IF(e.user_id IS NULL, 'visitor', 'user')`,
        [day, from, to],
      );

      // --- places ----------------------------------------------------------------------
      await conn.query("DELETE FROM AnalyticsGeoDay WHERE day = ?", [day]);
      await conn.query(
        `INSERT INTO AnalyticsGeoDay (day, app, geo_id, audience, users, sessions, views)
         SELECT ?, s.entry_app, s.geo_id, IF(s.user_id IS NULL, 'visitor', 'user'),
                COUNT(DISTINCT COALESCE(CONCAT('u', s.user_id), s.device_id)), COUNT(*), SUM(s.page_views)
           FROM AnalyticsSession s
          WHERE s.started_at >= ? AND s.started_at < ? AND s.is_bot = 0 AND s.geo_id IS NOT NULL
          GROUP BY s.entry_app, s.geo_id, IF(s.user_id IS NULL, 'visitor', 'user')`,
        [day, from, to],
      );
      await conn.query(
        `INSERT INTO AnalyticsGeoDay (day, app, geo_id, audience, failed_logins)
         SELECT ?, COALESCE(a.app, 1), a.geo_id, IF(a.user_id IS NULL, 'visitor', 'user'), COUNT(*)
           FROM AuthEvent a
          WHERE a.occurred_at >= ? AND a.occurred_at < ? AND a.outcome = 'failure' AND a.geo_id IS NOT NULL
          GROUP BY COALESCE(a.app, 1), a.geo_id, IF(a.user_id IS NULL, 'visitor', 'user')
         ON DUPLICATE KEY UPDATE failed_logins = VALUES(failed_logins)`,
        [day, from, to],
      );

      // --- hours (heatmap) ----------------------------------------------------------------
      await conn.query("DELETE FROM AnalyticsHourly WHERE day = ?", [day]);
      await conn.query(
        `INSERT INTO AnalyticsHourly (day, hour, app, users, visitors, sessions, views, logins)
         SELECT ?, HOUR(e.occurred_at + INTERVAL 2 HOUR), e.app,
                COUNT(DISTINCT e.user_id), COUNT(DISTINCT IF(e.user_id IS NULL, e.device_id, NULL)),
                COUNT(DISTINCT e.session_id), SUM(e.name = 'page_view'), SUM(e.name = 'login_success')
           FROM AnalyticsEvent e
          WHERE e.occurred_at >= ? AND e.occurred_at < ? AND ${CLEAN}
          GROUP BY HOUR(e.occurred_at + INTERVAL 2 HOUR), e.app`,
        [day, from, to],
      );
      await conn.query(
        `INSERT INTO AnalyticsHourly (day, hour, app, failed_logins)
         SELECT ?, HOUR(a.occurred_at + INTERVAL 2 HOUR), COALESCE(a.app, 1), COUNT(*)
           FROM AuthEvent a
          WHERE a.occurred_at >= ? AND a.occurred_at < ? AND a.outcome = 'failure'
          GROUP BY HOUR(a.occurred_at + INTERVAL 2 HOUR), COALESCE(a.app, 1)
         ON DUPLICATE KEY UPDATE failed_logins = VALUES(failed_logins)`,
        [day, from, to],
      );
    } finally {
      await conn.query("SELECT RELEASE_LOCK('activity_rollup')");
    }
  } finally {
    conn.release();
  }
};

export const todayKigali = () => kigaliDay(clock.now());

// ---------------------------------------------------------------------------
// Partitions & retention
// ---------------------------------------------------------------------------
const monthName = (d: Date) => `p${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m, 1));

/** Keep two future months split out of pmax, and drop months past raw retention. */
export const maintainPartitions = async () => {
  const rows = await q<{ name: string; descr: string }>(
    `SELECT PARTITION_NAME AS name, PARTITION_DESCRIPTION AS descr FROM information_schema.PARTITIONS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AnalyticsEvent' AND PARTITION_NAME IS NOT NULL
      ORDER BY PARTITION_ORDINAL_POSITION`,
  );
  if (!rows.length) return { added: [], dropped: [] };
  const names = new Set(rows.map((r) => r.name));
  const now = new Date(clock.now());
  const added: string[] = [];
  for (let i = 0; i <= 2; i++) {
    const start = monthStart(now.getUTCFullYear(), now.getUTCMonth() + i);
    const name = monthName(start);
    if (names.has(name)) continue;
    const end = monthStart(start.getUTCFullYear(), start.getUTCMonth() + 1);
    // Months must be added in order, and only by splitting pmax (it holds nothing future yet).
    await exec(
      `ALTER TABLE AnalyticsEvent REORGANIZE PARTITION pmax INTO (
         PARTITION ${name} VALUES LESS THAN ('${end.toISOString().slice(0, 10)}'),
         PARTITION pmax VALUES LESS THAN (MAXVALUE))`,
    );
    names.add(name);
    added.push(name);
  }
  const s = await getSettings();
  const cutoff = monthStart(now.getUTCFullYear(), now.getUTCMonth() - s.raw_retention_months + 1);
  const dropped: string[] = [];
  for (const r of rows) {
    if (r.name === "pmax") continue;
    const upper = new Date(String(r.descr).replace(/'/g, "").slice(0, 10) + "T00:00:00Z");
    if (upper <= cutoff) {
      await exec(`ALTER TABLE AnalyticsEvent DROP PARTITION ${r.name}`);
      dropped.push(r.name);
    }
  }
  if (added.length || dropped.length) logger.info(`[activity] partitions: +${added.join(",") || "-"} -${dropped.join(",") || "-"}`);
  return { added, dropped };
};

const deleteInChunks = async (sql: string, params: any[]) => {
  let total = 0;
  for (let i = 0; i < 200; i++) {
    const r = await exec(`${sql} LIMIT 5000`, params);
    total += r.affectedRows;
    if (r.affectedRows < 5000) break;
  }
  return total;
};

/** Retention for everything outside the partitioned raw table (plan §13.5). */
export const pruneRetention = async () => {
  const s = await getSettings();
  const now = clock.now();
  const months = (m: number) => new Date(now - m * 30.4375 * 86_400_000);
  const out: Record<string, number> = {};
  out.sessions = await deleteInChunks("DELETE FROM AnalyticsSession WHERE started_at < ?", [months(s.session_retention_months)]);
  out.auth = await deleteInChunks("DELETE FROM AuthEvent WHERE occurred_at < ?", [months(24)]);
  out.alerts = await deleteInChunks("DELETE FROM AnalyticsAlert WHERE fired_at < ?", [months(12)]);
  out.fixes = await deleteInChunks("DELETE FROM AnalyticsLocationFix WHERE captured_at < ?", [months(s.session_retention_months)]);
  out.userIps = await deleteInChunks("DELETE FROM AnalyticsUserIp WHERE last_seen < ?", [months(s.session_retention_months)]);
  out.deviceIps = await deleteInChunks("DELETE FROM AnalyticsDeviceIp WHERE last_seen < ?", [months(s.session_retention_months)]);
  out.ips = await deleteInChunks("DELETE FROM AnalyticsIp WHERE last_seen < ?", [months(s.session_retention_months)]);
  // Visitor devices that never signed in and went quiet past raw retention.
  out.devices = await deleteInChunks(
    "DELETE FROM AnalyticsDevice WHERE last_seen < ? AND first_user_id IS NULL",
    [months(s.raw_retention_months)],
  );
  return out;
};

/** How many distinct users / devices each IP has seen (shared NAT / school egress flag). */
export const refreshIpCounts = async () => {
  await exec(
    `UPDATE AnalyticsIp i
        LEFT JOIN (SELECT ip, COUNT(*) AS n FROM AnalyticsUserIp GROUP BY ip) u ON u.ip = i.ip
        LEFT JOIN (SELECT ip, COUNT(*) AS n FROM AnalyticsDeviceIp GROUP BY ip) d ON d.ip = i.ip
        SET i.users_count = COALESCE(u.n, 0), i.devices_count = COALESCE(d.n, 0)`,
  );
};

// ---------------------------------------------------------------------------
// Scheduling (started by engine.ts)
// ---------------------------------------------------------------------------
let lastNightly = "";
export const rollupTick = async () => {
  const today = todayKigali();
  await rollupDay(today);
  // Just after midnight, finish yesterday too.
  const kigaliMinutes = Math.floor(((clock.now() + TZ_OFFSET_MS) % 86_400_000) / 60_000);
  if (kigaliMinutes < 15) await rollupDay(addDays(today, -1));
  // Nightly at 01:30 Kigali: late events, partitions, retention, IP counts.
  if (kigaliMinutes >= 90 && lastNightly !== today) {
    lastNightly = today;
    for (let d = 1; d <= 3; d++) await rollupDay(addDays(today, -d));
    await maintainPartitions().catch((error) => logger.error("[activity] partition maintenance failed", { error }));
    const pruned = await pruneRetention();
    await refreshIpCounts();
    logger.info(`[activity] nightly done ${JSON.stringify(pruned)}`);
    activityNightlyHooks.forEach((fn) => void Promise.resolve(fn()).catch(() => undefined));
  }
};

/** Other modules (watches: expiry) hook into the nightly run. */
export const activityNightlyHooks: (() => unknown)[] = [];

/** Rebuild a date range (backfill, admin "recompute"). */
export const rollupRange = async (from: string, to: string) => {
  for (let d = from; d <= to; d = addDays(d, 1)) await rollupDay(d);
};
