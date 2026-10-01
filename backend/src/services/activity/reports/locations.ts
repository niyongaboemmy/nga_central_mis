import { APP_BY_CODE } from "../apps";
import { q } from "../db";
import { lookupGeo } from "../geoip";
import { ipToBuffer, ipToString, normalizeIp } from "../ip";
import { campusRanges, getSettings } from "../settings";
import { cidrContains } from "../ip";
import { visitorCode } from "../tokens";
import { appSql, ReportQuery } from "./common";

/**
 * Locations and IP lookup (plan §7.4). Country and ISP are reliable; city is
 * approximate (mobile carriers use CGNAT) and is labelled "≈" in the UI.
 */
export const locations = async (rq: ReportQuery) => {
  const app = appSql("d.app", rq);
  const aud = rq.aud === "both" ? "" : " AND d.audience = ?";
  const audP = rq.aud === "both" ? [] : [rq.aud];
  const rows = await q<any>(
    `SELECT g.geo_id, g.country_code, g.country, g.region, g.city, g.lat, g.lon, g.isp, g.asn, g.conn_type,
            SUM(d.users) AS people_days, SUM(d.sessions) AS sessions, SUM(d.views) AS views, SUM(d.failed_logins) AS failed
       FROM AnalyticsGeoDay d JOIN AnalyticsGeo g ON g.geo_id = d.geo_id
      WHERE d.day BETWEEN ? AND ?${app.sql}${aud}
      GROUP BY g.geo_id ORDER BY sessions DESC LIMIT 2000`,
    [rq.from, rq.to, ...app.params, ...audP],
  );
  const by = (key: (r: any) => string, label: (r: any) => any) => {
    const m = new Map<string, any>();
    for (const r of rows) {
      const k = key(r);
      const e = m.get(k) ?? { ...label(r), sessions: 0, views: 0, failed_logins: 0 };
      e.sessions += Number(r.sessions);
      e.views += Number(r.views);
      e.failed_logins += Number(r.failed);
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.sessions - a.sessions);
  };
  // Map points: one per city (sessions-weighted centroid from the GeoIP database).
  const points = by(
    (r) => `${r.country_code}|${r.region}|${r.city}`,
    (r) => ({ country_code: r.country_code, region: r.region, city: r.city, lat: r.lat === null ? null : Number(r.lat), lon: r.lon === null ? null : Number(r.lon) }),
  ).filter((p) => p.lat !== null && p.lon !== null);
  const networks = await q<any>(
    `SELECT value AS label, SUM(sessions) AS sessions, SUM(users) AS people_days FROM AnalyticsDimDay
      WHERE day BETWEEN ? AND ? AND dim = 'network'${appSql("app", rq).sql} GROUP BY value ORDER BY sessions DESC`,
    [rq.from, rq.to, ...app.params],
  );
  const topIps = await q<any>(
    `SELECT i.ip, i.network_label, i.users_count, i.devices_count, i.failed_logins, i.first_seen, i.last_seen,
            g.city, g.country_code, g.isp, g.conn_type
       FROM AnalyticsIp i LEFT JOIN AnalyticsGeo g ON g.geo_id = i.geo_id
      WHERE i.last_seen >= ? AND i.first_seen < ?
      ORDER BY i.users_count DESC, i.devices_count DESC, i.last_seen DESC LIMIT 50`,
    [rq.fromAt, rq.toAt],
  );
  return {
    countries: by((r) => r.country_code ?? "??", (r) => ({ country_code: r.country_code, country: r.country })),
    regions: by((r) => `${r.country_code}|${r.region}`, (r) => ({ country_code: r.country_code, region: r.region })),
    cities: by((r) => `${r.country_code}|${r.region}|${r.city}`, (r) => ({ country_code: r.country_code, region: r.region, city: r.city })),
    isps: by((r) => `${r.asn}|${r.isp}`, (r) => ({ asn: r.asn, isp: r.isp, conn_type: r.conn_type })),
    connection: by((r) => r.conn_type, (r) => ({ conn_type: r.conn_type })),
    points,
    networks: networks.map((n) => ({ label: n.label, sessions: Number(n.sessions) })),
    top_ips: topIps.map((r) => ({
      ip: ipToString(r.ip),
      network_label: r.network_label,
      users: Number(r.users_count),
      devices: Number(r.devices_count),
      failed_logins: Number(r.failed_logins),
      first_seen: r.first_seen,
      last_seen: r.last_seen,
      place: { city: r.city, country_code: r.country_code, isp: r.isp, conn_type: r.conn_type },
    })),
  };
};

/** Everything known about one IP: place, ISP, every user and visitor seen on it, failed sign-ins. */
export const ipLookup = async (rawIp: string) => {
  const ip = normalizeIp(rawIp);
  const buf = ipToBuffer(ip);
  if (!ip || !buf) return null;
  const s = await getSettings();
  const [rec] = await q<any>(
    `SELECT i.*, g.country_code, g.country, g.region, g.city, g.lat, g.lon, g.isp, g.asn, g.conn_type
       FROM AnalyticsIp i LEFT JOIN AnalyticsGeo g ON g.geo_id = i.geo_id WHERE i.ip = ?`,
    [buf],
  );
  const geo = rec
    ? { country_code: rec.country_code, country: rec.country, region: rec.region, city: rec.city, lat: rec.lat, lon: rec.lon, isp: rec.isp, asn: rec.asn, conn_type: rec.conn_type }
    : lookupGeo(ip);
  let network: string | null = rec?.network_label ?? null;
  if (!network) for (const r of campusRanges(s)) if (cidrContains(r.m, buf)) network = r.label;
  const users = await q<any>(
    `SELECT ui.user_id, ui.first_seen, ui.last_seen, ui.hits, CONCAT_WS(' ', p.first_name, p.last_name) AS name, p.user_type
       FROM AnalyticsUserIp ui LEFT JOIN UserProfile p ON p.user_id = ui.user_id
      WHERE ui.ip = ? ORDER BY ui.last_seen DESC LIMIT 500`,
    [buf],
  );
  const devices = await q<any>(
    `SELECT di.device_id, di.first_seen, di.last_seen, di.hits, d.first_user_id, d.bot_score, ua.browser, ua.os, ua.device_type
       FROM AnalyticsDeviceIp di LEFT JOIN AnalyticsDevice d ON d.device_id = di.device_id LEFT JOIN AnalyticsUa ua ON ua.ua_id = d.ua_id
      WHERE di.ip = ? ORDER BY di.last_seen DESC LIMIT 500`,
    [buf],
  );
  const auth = await q<any>(
    `SELECT a.occurred_at, a.kind, a.outcome, a.reason, a.username_attempted, a.user_id, a.device_id, a.app
       FROM AuthEvent a WHERE a.ip = ? ORDER BY a.occurred_at DESC LIMIT 200`,
    [buf],
  );
  const sessions = await q<any>(
    `SELECT s.session_id, s.user_id, s.device_id, s.started_at, s.last_activity_at, s.app_path, s.page_views
       FROM AnalyticsSession s WHERE s.entry_ip = ? OR s.last_ip = ? ORDER BY s.started_at DESC LIMIT 100`,
    [buf, buf],
  );
  return {
    ip,
    first_seen: rec?.first_seen ?? null,
    last_seen: rec?.last_seen ?? null,
    network_label: network,
    geo,
    users: users.map((u) => ({ user_id: Number(u.user_id), name: (u.name || "").trim() || null, user_type: u.user_type, first_seen: u.first_seen, last_seen: u.last_seen, hits: Number(u.hits) })),
    devices: devices.map((d) => ({
      device_id: d.device_id,
      visitor_code: visitorCode(d.device_id),
      first_seen: d.first_seen,
      last_seen: d.last_seen,
      hits: Number(d.hits),
      signed_in_as: d.first_user_id ? Number(d.first_user_id) : null,
      bot_score: d.bot_score === null ? null : Number(d.bot_score),
      device: { browser: d.browser, os: d.os, type: d.device_type },
    })),
    auth: auth.map((a) => ({ ...a, app: a.app ? APP_BY_CODE[a.app] : null, visitor_code: a.device_id ? visitorCode(a.device_id) : null })),
    sessions: sessions.map((s2) => ({ ...s2, session_id: Number(s2.session_id), user_id: s2.user_id === null ? null : Number(s2.user_id), app_path: s2.app_path ? String(s2.app_path).split(">") : [] })),
  };
};
