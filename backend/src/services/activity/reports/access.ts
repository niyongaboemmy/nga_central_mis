import { APP_BY_CODE, APP_CODE } from "../apps";
import { q } from "../db";
import { ipToString } from "../ip";
import { visitorCode } from "../tokens";
import { appSql, bucketOf, bucketsIn, EXCLUDED, ReportQuery, segmentSql, toDay } from "./common";

/**
 * Access & Logins (plan §14 page 3): who accessed the platform by day / week / month,
 * sign-ins over time, the hour × weekday heatmap, failed sign-ins, and app launches.
 */
export interface AccessUsersOpts {
  search?: string;
  sort?: "last" | "first" | "days" | "sessions" | "name" | "engagement";
  dir?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export const accessUsers = async (rq: ReportQuery, o: AccessUsersOpts = {}) => {
  const seg = segmentSql("d.user_id", rq.seg);
  const app = appSql("d.app", rq);
  const limit = Math.min(500, Math.max(1, o.limit ?? 50));
  const page = Math.max(1, o.page ?? 1);
  const sortCol = { last: "last_at", first: "first_at", days: "days_active", sessions: "sessions", name: "name", engagement: "engagement_ms" }[o.sort ?? "last"];
  const dir = o.dir === "asc" ? "ASC" : "DESC";
  const search = o.search?.trim();
  const searchSql = search ? " AND (CONCAT_WS(' ', p.first_name, p.last_name) LIKE ? OR u.username LIKE ? OR u.email LIKE ?)" : "";
  const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
  const base = `
      FROM AnalyticsUserDay d
      JOIN User u ON u.user_id = d.user_id
      LEFT JOIN UserProfile p ON p.user_id = d.user_id
     WHERE d.day BETWEEN ? AND ? AND d.user_id NOT IN ${EXCLUDED}${app.sql}${seg.sql}${searchSql}`;
  const params = [rq.from, rq.to, ...app.params, ...seg.params, ...searchParams];
  const [cnt] = await q<any>(`SELECT COUNT(DISTINCT d.user_id) AS n ${base}`, params);
  const rows = await q<any>(
    `SELECT d.user_id, CONCAT_WS(' ', p.first_name, p.last_name) AS name, u.username, p.user_type,
            MIN(d.first_at) AS first_at, MAX(d.last_at) AS last_at, COUNT(DISTINCT d.day) AS days_active,
            COALESCE(SUM(d.sessions), 0) AS sessions, SUM(d.page_views) AS views, SUM(d.engagement_ms) AS engagement_ms,
            SUM(d.logins) AS logins, GROUP_CONCAT(DISTINCT d.app ORDER BY d.app) AS apps,
            MAX(d.source = 'backfill') AS from_backfill
       ${base}
      GROUP BY d.user_id, name, u.username, p.user_type
      ORDER BY ${sortCol} ${dir}, d.user_id
      LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  const ids = rows.map((r) => r.user_id);
  const state = ids.length
    ? await q<any>(
        `SELECT s.user_id, s.last_ip, s.last_seen_app, s.last_login_at, s.last_login_method, g.city, g.country_code, g.isp, g.conn_type
           FROM AnalyticsUserState s LEFT JOIN AnalyticsGeo g ON g.geo_id = s.last_geo_id WHERE s.user_id IN (?)`,
        [ids],
      )
    : [];
  const st = new Map(state.map((s) => [Number(s.user_id), s]));
  return {
    total: Number(cnt.n),
    page,
    limit,
    rows: rows.map((r) => {
      const s: any = st.get(Number(r.user_id));
      return {
        user_id: Number(r.user_id),
        name: (r.name || "").trim() || r.username,
        user_type: r.user_type,
        first_at: r.first_at,
        last_at: r.last_at,
        days_active: Number(r.days_active),
        sessions: Number(r.sessions),
        views: Number(r.views),
        engagement_ms: Number(r.engagement_ms),
        logins: Number(r.logins),
        apps: String(r.apps || "").split(",").filter(Boolean).map((c) => APP_BY_CODE[Number(c)]),
        last_ip: s ? ipToString(s.last_ip) : null,
        last_place: s ? { city: s.city, country_code: s.country_code, isp: s.isp, conn_type: s.conn_type } : null,
        last_login_at: s?.last_login_at ?? null,
        last_login_method: s?.last_login_method ?? null,
        partial: !!r.from_backfill,
      };
    }),
  };
};

/** Accessed / active people per bucket (distinct within the bucket). */
export const accessSeries = async (rq: ReportQuery) => {
  const seg = segmentSql("d.user_id", rq.seg);
  const app = appSql("d.app", rq);
  const rows = await q<any>(
    `SELECT d.day, d.user_id, d.is_active FROM AnalyticsUserDay d
      WHERE d.day BETWEEN ? AND ? AND d.user_id NOT IN ${EXCLUDED}${app.sql}${seg.sql}`,
    [rq.from, rq.to, ...app.params, ...seg.params],
  );
  const visitors = await q<any>(
    `SELECT d.day, d.device_id FROM AnalyticsDeviceDay d WHERE d.day BETWEEN ? AND ? AND d.is_bot = 0${appSql("d.app", rq).sql}`,
    [rq.from, rq.to, ...app.params],
  );
  const buckets = new Map(bucketsIn(rq).map((b) => [b, { accessed: new Set<number>(), active: new Set<number>(), visitors: new Set<string>() }]));
  for (const r of rows) {
    const b = buckets.get(bucketOf(toDay(r.day), rq.gran));
    if (!b) continue;
    b.accessed.add(Number(r.user_id));
    if (r.is_active) b.active.add(Number(r.user_id));
  }
  for (const r of visitors) buckets.get(bucketOf(toDay(r.day), rq.gran))?.visitors.add(r.device_id);
  return [...buckets].map(([bucket, b]) => ({ bucket, accessed: b.accessed.size, active: b.active.size, visitors: b.visitors.size }));
};

export const loginSeries = async (rq: ReportQuery) => {
  const rows = await q<any>(
    `SELECT DATE(a.occurred_at + INTERVAL 2 HOUR) AS day, a.kind, a.outcome, a.method, a.app, COUNT(*) AS n
       FROM AuthEvent a
      WHERE a.occurred_at >= ? AND a.occurred_at < ? AND a.kind IN ('login','google','otp','app_launch')
      GROUP BY day, a.kind, a.outcome, a.method, a.app`,
    [rq.fromAt, rq.toAt],
  );
  const buckets = new Map(bucketsIn(rq).map((b) => [b, { success: 0, failed: 0, launches: {} as Record<string, number> }]));
  const methods: Record<string, number> = {};
  const launches: Record<string, number> = {};
  for (const r of rows) {
    const b = buckets.get(bucketOf(toDay(r.day), rq.gran));
    const n = Number(r.n);
    if (r.kind === "app_launch") {
      const app = r.app ? APP_BY_CODE[r.app] : null;
      const key = app && app !== "mis" ? app : r.method || "other";
      launches[key] = (launches[key] ?? 0) + n;
      if (b) b.launches[key] = (b.launches[key] ?? 0) + n;
    } else if (r.outcome === "success" && (r.kind === "login" || r.kind === "google")) {
      if (b) b.success += n;
      const m = r.method || r.kind;
      methods[m] = (methods[m] ?? 0) + n;
    } else if (r.outcome === "failure") {
      if (b) b.failed += n;
    }
  }
  return { series: [...buckets].map(([bucket, v]) => ({ bucket, ...v })), methods, launches };
};

/** People active per Kigali hour × weekday (0 = Monday), summed over the range. */
export const heatmap = async (rq: ReportQuery) => {
  const app = appSql("h.app", rq);
  const rows = await q<any>(
    `SELECT h.day, h.hour, SUM(h.users) AS users, SUM(h.visitors) AS visitors, SUM(h.logins) AS logins, SUM(h.failed_logins) AS failed
       FROM AnalyticsHourly h WHERE h.day BETWEEN ? AND ?${app.sql} GROUP BY h.day, h.hour`,
    [rq.from, rq.to, ...app.params],
  );
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ users: 0, visitors: 0, logins: 0, failed: 0 })));
  for (const r of rows) {
    const dow = (new Date(`${toDay(r.day)}T00:00:00Z`).getUTCDay() + 6) % 7;
    const c = grid[dow][Number(r.hour)];
    c.users += Number(r.users);
    c.visitors += Number(r.visitors);
    c.logins += Number(r.logins);
    c.failed += Number(r.failed);
  }
  return grid;
};

/**
 * Failed sign-ins grouped by (username tried, IP), with brute-force and credential-
 * stuffing flags (plan §8): ≥10 failures for one username within 15 minutes, or one IP
 * trying ≥5 usernames.
 */
export const failedLogins = async (rq: ReportQuery, limit = 200) => {
  const rows = await q<any>(
    `SELECT a.username_attempted, a.user_id, a.ip, a.reason, a.kind, COUNT(*) AS n, MIN(a.occurred_at) AS first_at, MAX(a.occurred_at) AS last_at,
            MAX(a.device_id) AS device_id, MAX(g.city) AS city, MAX(g.country_code) AS country_code, MAX(g.isp) AS isp, MAX(g.conn_type) AS conn_type,
            CONCAT_WS(' ', MAX(p.first_name), MAX(p.last_name)) AS user_name
       FROM AuthEvent a
       LEFT JOIN AnalyticsGeo g ON g.geo_id = a.geo_id
       LEFT JOIN UserProfile p ON p.user_id = a.user_id
      WHERE a.occurred_at >= ? AND a.occurred_at < ? AND a.outcome = 'failure'
      GROUP BY a.username_attempted, a.user_id, a.ip, a.reason, a.kind
      ORDER BY last_at DESC LIMIT ?`,
    [rq.fromAt, rq.toAt, limit],
  );
  // Burst detection over the same window.
  const bursts = await q<any>(
    `SELECT a.username_attempted AS u, FLOOR(UNIX_TIMESTAMP(a.occurred_at) / 900) AS slot, COUNT(*) AS n
       FROM AuthEvent a WHERE a.occurred_at >= ? AND a.occurred_at < ? AND a.outcome = 'failure' AND a.username_attempted IS NOT NULL
      GROUP BY u, slot HAVING n >= 10`,
    [rq.fromAt, rq.toAt],
  );
  const stuffing = await q<any>(
    `SELECT HEX(a.ip) AS ip, COUNT(DISTINCT a.username_attempted) AS names FROM AuthEvent a
      WHERE a.occurred_at >= ? AND a.occurred_at < ? AND a.outcome = 'failure' AND a.ip IS NOT NULL
      GROUP BY a.ip HAVING names >= 5`,
    [rq.fromAt, rq.toAt],
  );
  const brute = new Set(bursts.map((b) => b.u));
  const stuff = new Map(stuffing.map((s) => [String(s.ip).toLowerCase(), Number(s.names)]));
  return rows.map((r) => {
    const ipHex = r.ip ? Buffer.from(r.ip).toString("hex") : null;
    return {
      username_attempted: r.username_attempted,
      user: r.user_id ? { id: Number(r.user_id), name: (r.user_name || "").trim() || null } : null,
      ip: ipToString(r.ip),
      place: { city: r.city, country_code: r.country_code, isp: r.isp, conn_type: r.conn_type },
      device_id: r.device_id,
      visitor_code: r.device_id ? visitorCode(r.device_id) : null,
      reason: r.reason,
      kind: r.kind,
      count: Number(r.n),
      first_at: r.first_at,
      last_at: r.last_at,
      brute_force: brute.has(r.username_attempted),
      stuffing_ip: ipHex ? stuff.get(ipHex) ?? null : null,
    };
  });
};

export const appCodes = APP_CODE;
