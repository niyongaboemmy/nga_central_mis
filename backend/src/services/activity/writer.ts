import logger from "../../utils/logger";
import { exec } from "./db";

/**
 * Buffered writes for the activity engine (plan §5.3). Ingest never waits on the
 * database. Rows accumulate here and are flushed every 2 s as multi-row statements on
 * the dedicated activity pool. Each buffer is bounded, so a database outage costs
 * data, never memory.
 */
export interface EventRow {
  event_id: string;
  occurred_at: Date;
  received_at: Date;
  app: number;
  user_id: number | null;
  device_id: string;
  session_id: number | null;
  pv_id: string | null;
  name: string;
  route: string | null;
  feature: string | null;
  engagement_ms: number;
  ip: Buffer | null;
  geo_id: number | null;
  params: string | null;
  flags: number;
}

export interface SessionRow {
  session_id: number;
  device_id: string;
  user_id: number | null;
  stitched_at: Date | null;
  started_at: Date;
  last_activity_at: Date;
  ended_at: Date | null;
  entry_app: number;
  entry_route: string | null;
  entry_kind: string;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  exit_app: number | null;
  exit_route: string | null;
  apps_mask: number;
  app_path: string | null;
  page_views: number;
  events: number;
  engagement_ms: number;
  key_events: number;
  is_engaged: number;
  entry_ip: Buffer | null;
  last_ip: Buffer | null;
  geo_id: number | null;
  network_label: string | null;
  ua_id: number | null;
  user_type: string | null;
  is_bot: number;
}

interface DeviceDelta {
  device_id: string;
  first_seen: Date;
  last_seen: Date;
  first_ip: Buffer | null;
  last_ip: Buffer | null;
  last_geo_id: number | null;
  ua_id: number | null;
  standalone_seen: number;
  screen: string | null;
  first_user_id: number | null;
  last_user_id: number | null;
  linked_user_ids: string | null;
  guest_names: string | null;
  bot_score: number;
  sessions: number;
  page_views: number;
  precise_loc_state: string | null;
}

interface IpDelta { ip: Buffer; geo_id: number | null; network_label: string | null; first: Date; last: Date; failed: number }
interface PairDelta { a: number | string; ip: Buffer; first: Date; last: Date; hits: number }
interface UserStateDelta {
  user_id: number;
  last_seen_at: Date;
  last_seen_app: number;
  last_ip: Buffer | null;
  last_geo_id: number | null;
  first_seen_by_app: Record<string, string>;
  sessions: number;
}

const MAX_EVENTS = 50_000;
let events: EventRow[] = [];
const sessions = new Map<number, SessionRow>();
const devices = new Map<string, DeviceDelta>();
const ips = new Map<string, IpDelta>();
const userIps = new Map<string, PairDelta>();
const deviceIps = new Map<string, PairDelta>();
const userStates = new Map<number, UserStateDelta>();

export const stats = { flushed: 0, dropped: 0, failures: 0, lastFlushAt: 0, lastFlushMs: 0, lastError: null as string | null };

export const queueEvent = (row: EventRow) => {
  if (events.length >= MAX_EVENTS) {
    events.shift();
    stats.dropped++;
  }
  events.push(row);
};

export const queueSession = (row: SessionRow) => {
  sessions.set(row.session_id, { ...row });
};

export const queueDevice = (d: DeviceDelta) => {
  const cur = devices.get(d.device_id);
  if (!cur) {
    devices.set(d.device_id, { ...d });
    return;
  }
  cur.last_seen = d.last_seen > cur.last_seen ? d.last_seen : cur.last_seen;
  cur.last_ip = d.last_ip ?? cur.last_ip;
  cur.last_geo_id = d.last_geo_id ?? cur.last_geo_id;
  cur.ua_id = d.ua_id ?? cur.ua_id;
  cur.standalone_seen = cur.standalone_seen || d.standalone_seen;
  cur.screen = d.screen ?? cur.screen;
  cur.last_user_id = d.last_user_id ?? cur.last_user_id;
  cur.first_user_id = cur.first_user_id ?? d.first_user_id;
  cur.linked_user_ids = d.linked_user_ids ?? cur.linked_user_ids;
  cur.guest_names = d.guest_names ?? cur.guest_names;
  cur.bot_score = d.bot_score;
  cur.sessions += d.sessions;
  cur.page_views += d.page_views;
  cur.precise_loc_state = d.precise_loc_state ?? cur.precise_loc_state;
};

export const queueIp = (ip: Buffer, geoId: number | null, label: string | null, at: Date, failed = 0) => {
  const k = ip.toString("hex");
  const cur = ips.get(k);
  if (!cur) ips.set(k, { ip, geo_id: geoId, network_label: label, first: at, last: at, failed });
  else {
    if (at > cur.last) cur.last = at;
    if (at < cur.first) cur.first = at;
    cur.geo_id = geoId ?? cur.geo_id;
    cur.network_label = label ?? cur.network_label;
    cur.failed += failed;
  }
};

const queuePair = (m: Map<string, PairDelta>, a: number | string, ip: Buffer, at: Date) => {
  const k = `${a}|${ip.toString("hex")}`;
  const cur = m.get(k);
  if (!cur) m.set(k, { a, ip, first: at, last: at, hits: 1 });
  else {
    cur.hits++;
    if (at > cur.last) cur.last = at;
    if (at < cur.first) cur.first = at;
  }
};
export const queueUserIp = (userId: number, ip: Buffer, at: Date) => queuePair(userIps, userId, ip, at);
export const queueDeviceIp = (deviceId: string, ip: Buffer, at: Date) => queuePair(deviceIps, deviceId, ip, at);

export const queueUserState = (d: UserStateDelta) => {
  const cur = userStates.get(d.user_id);
  if (!cur) {
    userStates.set(d.user_id, { ...d, first_seen_by_app: { ...d.first_seen_by_app } });
    return;
  }
  if (d.last_seen_at >= cur.last_seen_at) {
    cur.last_seen_at = d.last_seen_at;
    cur.last_seen_app = d.last_seen_app;
    cur.last_ip = d.last_ip ?? cur.last_ip;
    cur.last_geo_id = d.last_geo_id ?? cur.last_geo_id;
  }
  for (const [k, v] of Object.entries(d.first_seen_by_app)) if (!cur.first_seen_by_app[k]) cur.first_seen_by_app[k] = v;
  cur.sessions += d.sessions;
};

const chunk = <T>(arr: T[], n: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const placeholders = (cols: number, rows: number) =>
  Array.from({ length: rows }, () => `(${Array(cols).fill("?").join(",")})`).join(",");

let flushing: Promise<void> | null = null;

/** Write everything buffered. Concurrent callers share one flush. */
export const flushActivity = async (): Promise<void> => {
  if (flushing) return flushing;
  flushing = doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
};

const doFlush = async () => {
  const started = Date.now();
  // Swap buffers first so ingest keeps appending while we write.
  const ev = events;
  events = [];
  const ss = [...sessions.values()];
  sessions.clear();
  const dv = [...devices.values()];
  devices.clear();
  const ip = [...ips.values()];
  ips.clear();
  const ui = [...userIps.values()];
  userIps.clear();
  const di = [...deviceIps.values()];
  deviceIps.clear();
  const us = [...userStates.values()];
  userStates.clear();

  try {
    // Sessions first, so a report reading an event's session_id finds it.
    for (const part of chunk(ss, 300)) {
      const cols = [
        "session_id", "device_id", "user_id", "stitched_at", "started_at", "last_activity_at", "ended_at",
        "entry_app", "entry_route", "entry_kind", "referrer_host", "utm_source", "utm_medium", "utm_campaign",
        "exit_app", "exit_route", "apps_mask", "app_path", "page_views", "events", "engagement_ms", "key_events",
        "is_engaged", "entry_ip", "last_ip", "geo_id", "network_label", "ua_id", "user_type", "is_bot",
      ];
      const mutable = cols.filter((c) => !["session_id", "device_id", "started_at", "entry_app", "entry_route", "entry_kind", "referrer_host", "utm_source", "utm_medium", "utm_campaign", "entry_ip"].includes(c));
      await exec(
        `INSERT INTO AnalyticsSession (${cols.join(",")}) VALUES ${placeholders(cols.length, part.length)}
         ON DUPLICATE KEY UPDATE ${mutable.map((c) => `${c} = VALUES(${c})`).join(", ")}`,
        part.flatMap((s) => cols.map((c) => (s as any)[c])),
      );
    }

    for (const part of chunk(ev, 1000)) {
      const cols = ["event_id", "occurred_at", "received_at", "app", "user_id", "device_id", "session_id", "pv_id", "name", "route", "feature", "engagement_ms", "ip", "geo_id", "params", "flags"];
      await exec(
        `INSERT IGNORE INTO AnalyticsEvent (${cols.join(",")}) VALUES ${part
          .map(() => `(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CAST(? AS JSON),?)`)
          .join(",")}`,
        part.flatMap((e) => cols.map((c) => (e as any)[c])),
      );
    }

    for (const part of chunk(dv, 300)) {
      await exec(
        `INSERT INTO AnalyticsDevice (device_id, first_seen, last_seen, first_ip, last_ip, last_geo_id, ua_id, standalone_seen, screen,
            first_user_id, last_user_id, linked_user_ids, guest_names, bot_score, sessions, page_views, precise_loc_state)
         VALUES ${part.map(() => "(?,?,?,?,?,?,?,?,?,?,?,CAST(? AS JSON),CAST(? AS JSON),?,?,?,COALESCE(?, 'unasked'))").join(",")}
         ON DUPLICATE KEY UPDATE
           last_seen = GREATEST(last_seen, VALUES(last_seen)),
           last_ip = COALESCE(VALUES(last_ip), last_ip),
           last_geo_id = COALESCE(VALUES(last_geo_id), last_geo_id),
           ua_id = COALESCE(VALUES(ua_id), ua_id),
           standalone_seen = GREATEST(standalone_seen, VALUES(standalone_seen)),
           screen = COALESCE(VALUES(screen), screen),
           first_user_id = COALESCE(first_user_id, VALUES(first_user_id)),
           last_user_id = COALESCE(VALUES(last_user_id), last_user_id),
           linked_user_ids = COALESCE(VALUES(linked_user_ids), linked_user_ids),
           guest_names = COALESCE(VALUES(guest_names), guest_names),
           bot_score = VALUES(bot_score),
           sessions = sessions + VALUES(sessions),
           page_views = page_views + VALUES(page_views),
           precise_loc_state = IF(VALUES(precise_loc_state) = 'unasked', precise_loc_state, VALUES(precise_loc_state))`,
        part.flatMap((d) => [
          d.device_id, d.first_seen, d.last_seen, d.first_ip, d.last_ip, d.last_geo_id, d.ua_id, d.standalone_seen, d.screen,
          d.first_user_id, d.last_user_id, d.linked_user_ids, d.guest_names, d.bot_score, d.sessions, d.page_views,
          d.precise_loc_state,
        ]),
      );
    }

    for (const part of chunk(ip, 500)) {
      await exec(
        `INSERT INTO AnalyticsIp (ip, geo_id, network_label, first_seen, last_seen, failed_logins)
         VALUES ${placeholders(6, part.length)}
         ON DUPLICATE KEY UPDATE geo_id = COALESCE(VALUES(geo_id), geo_id), network_label = VALUES(network_label),
           first_seen = LEAST(first_seen, VALUES(first_seen)), last_seen = GREATEST(last_seen, VALUES(last_seen)),
           failed_logins = failed_logins + VALUES(failed_logins)`,
        part.flatMap((r) => [r.ip, r.geo_id, r.network_label, r.first, r.last, r.failed]),
      );
    }
    for (const [table, col, rows] of [
      ["AnalyticsUserIp", "user_id", ui],
      ["AnalyticsDeviceIp", "device_id", di],
    ] as const) {
      for (const part of chunk(rows as PairDelta[], 500)) {
        await exec(
          `INSERT INTO ${table} (${col}, ip, first_seen, last_seen, hits) VALUES ${placeholders(5, part.length)}
           ON DUPLICATE KEY UPDATE first_seen = LEAST(first_seen, VALUES(first_seen)),
             last_seen = GREATEST(last_seen, VALUES(last_seen)), hits = hits + VALUES(hits)`,
          part.flatMap((r) => [r.a, r.ip, r.first, r.last, r.hits]),
        );
      }
    }

    for (const part of chunk(us, 300)) {
      await exec(
        `INSERT INTO AnalyticsUserState (user_id, first_seen_at, first_seen_by_app, last_seen_at, last_seen_app, last_ip, last_geo_id, total_sessions)
         VALUES ${part.map(() => "(?,?,CAST(? AS JSON),?,?,?,?,?)").join(",")}
         ON DUPLICATE KEY UPDATE
           first_seen_at = LEAST(COALESCE(first_seen_at, VALUES(first_seen_at)), VALUES(first_seen_at)),
           first_seen_by_app = JSON_MERGE_PATCH(VALUES(first_seen_by_app), COALESCE(first_seen_by_app, JSON_OBJECT())),
           last_ip = IF(VALUES(last_seen_at) >= COALESCE(last_seen_at, '1970-01-01'), COALESCE(VALUES(last_ip), last_ip), last_ip),
           last_geo_id = IF(VALUES(last_seen_at) >= COALESCE(last_seen_at, '1970-01-01'), COALESCE(VALUES(last_geo_id), last_geo_id), last_geo_id),
           last_seen_app = IF(VALUES(last_seen_at) >= COALESCE(last_seen_at, '1970-01-01'), VALUES(last_seen_app), last_seen_app),
           last_seen_at = GREATEST(COALESCE(last_seen_at, VALUES(last_seen_at)), VALUES(last_seen_at)),
           total_sessions = total_sessions + VALUES(total_sessions)`,
        part.flatMap((u) => {
          const firsts = Object.values(u.first_seen_by_app).sort();
          return [
            u.user_id,
            firsts.length ? new Date(firsts[0]) : u.last_seen_at,
            JSON.stringify(u.first_seen_by_app),
            u.last_seen_at,
            u.last_seen_app,
            u.last_ip,
            u.last_geo_id,
            u.sessions,
          ];
        }),
      );
    }
    stats.flushed += ev.length;
    stats.lastError = null;
  } catch (error: any) {
    stats.failures++;
    stats.lastError = String(error?.message ?? error).slice(0, 300);
    logger.error("[activity] flush failed", { error: stats.lastError });
    // Put events back once (bounded). Upserts are idempotent enough to retry as well.
    if (ev.length && events.length + ev.length <= MAX_EVENTS) events = ev.concat(events);
    else stats.dropped += ev.length;
    for (const s of ss) if (!sessions.has(s.session_id)) sessions.set(s.session_id, s);
  } finally {
    stats.lastFlushAt = Date.now();
    stats.lastFlushMs = Date.now() - started;
  }
};

export const bufferDepth = () => ({
  events: events.length,
  sessions: sessions.size,
  devices: devices.size,
  ips: ips.size,
});

/** Tests: drop everything buffered without writing. */
export const resetWriter = () => {
  events = [];
  sessions.clear();
  devices.clear();
  ips.clear();
  userIps.clear();
  deviceIps.clear();
  userStates.clear();
};
