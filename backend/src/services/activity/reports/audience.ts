import { APP_BY_CODE } from "../apps";
import { q } from "../db";
import { ipToString } from "../ip";
import { visitorCode } from "../tokens";
import { addDays } from "../rollup";
import { clock, kigaliDay } from "../runtime";
import { getSettings } from "../settings";
import { appSql, bucketOf, bucketsIn, EXCLUDED, pct, ReportQuery, segmentSql, suppress, toDay } from "./common";

/**
 * Audience (plan §14 page 4): the whole roster with usage columns, and the lists GA
 * can't produce because it doesn't know who *should* be there: dormant users and people
 * who never signed in.
 */
export type AudienceFilter = "all" | "dormant" | "never" | "power" | "new" | "new_country";

export const audience = async (
  rq: ReportQuery,
  o: { filter?: AudienceFilter; search?: string; page?: number; limit?: number; sort?: string; dir?: string } = {},
) => {
  const s = await getSettings();
  const seg = segmentSql("u.user_id", rq.seg);
  const app = appSql("d.app", rq);
  const limit = Math.min(500, Math.max(1, o.limit ?? 50));
  const page = Math.max(1, o.page ?? 1);
  const search = o.search?.trim();
  const today = kigaliDay(clock.now());
  const dormantSince = addDays(today, -s.dormant_days);

  const having: string[] = [];
  const where: string[] = [];
  const whereParams: any[] = [];
  switch (o.filter) {
    case "dormant":
      // Active before, nothing since the dormancy threshold.
      where.push("st.last_seen_at IS NOT NULL AND st.last_seen_at < ?");
      whereParams.push(new Date(new Date(`${dormantSince}T00:00:00Z`).getTime() - 2 * 3600_000));
      break;
    case "never":
      where.push("st.last_login_at IS NULL AND st.first_seen_at IS NULL");
      break;
    case "new":
      where.push("st.first_seen_at >= ? AND st.first_seen_at < ?");
      whereParams.push(rq.fromAt, rq.toAt);
      break;
    case "power":
      having.push("days_active >= GREATEST(3, ? * 0.6)");
      break;
    case "new_country":
      where.push(
        `u.user_id IN (SELECT ui.user_id FROM AnalyticsUserIp ui JOIN AnalyticsIp i ON i.ip = ui.ip JOIN AnalyticsGeo g ON g.geo_id = i.geo_id
                        WHERE ui.first_seen >= ? AND g.country_code IS NOT NULL AND g.country_code NOT IN (
                          SELECT g2.country_code FROM AnalyticsUserIp ui2 JOIN AnalyticsIp i2 ON i2.ip = ui2.ip JOIN AnalyticsGeo g2 ON g2.geo_id = i2.geo_id
                           WHERE ui2.user_id = ui.user_id AND ui2.first_seen < ? AND g2.country_code IS NOT NULL))`,
      );
      whereParams.push(new Date(clock.now() - 30 * 86_400_000), new Date(clock.now() - 30 * 86_400_000));
      break;
  }
  if (search) {
    where.push("(CONCAT_WS(' ', p.first_name, p.last_name) LIKE ? OR u.username LIKE ? OR u.email LIKE ?)");
    whereParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const sortCol = ({ name: "name", last_seen: "last_seen_at", days: "days_active", sessions: "sessions", engagement: "engagement_ms" } as Record<string, string>)[o.sort ?? "last_seen"] ?? "last_seen_at";
  const dir = o.dir === "asc" ? "ASC" : "DESC";

  const from = `
      FROM User u
      JOIN UserProfile p ON p.user_id = u.user_id
      LEFT JOIN AnalyticsUserState st ON st.user_id = u.user_id
      LEFT JOIN AnalyticsGeo g ON g.geo_id = st.last_geo_id
      LEFT JOIN AnalyticsUserDay d ON d.user_id = u.user_id AND d.day BETWEEN ? AND ?${app.sql}
     WHERE u.status = 'ACTIVE' AND COALESCE(st.excluded, 0) = 0${seg.sql}${where.length ? ` AND ${where.join(" AND ")}` : ""}`;
  const params = [rq.from, rq.to, ...app.params, ...seg.params, ...whereParams];
  const group = " GROUP BY u.user_id";
  const havingSql = having.length ? ` HAVING ${having.join(" AND ")}` : "";
  const havingParams = o.filter === "power" ? [rq.days] : [];
  const [cnt] = await q<any>(
    `SELECT COUNT(*) AS n FROM (SELECT u.user_id, COUNT(DISTINCT IF(d.is_active = 1, d.day, NULL)) AS days_active ${from}${group}${havingSql}) t`,
    [...params, ...havingParams],
  );
  const rows = await q<any>(
    `SELECT u.user_id, MAX(u.username) AS username, MAX(CONCAT_WS(' ', p.first_name, p.last_name)) AS name, MAX(p.user_type) AS user_type,
            MAX(st.last_seen_at) AS last_seen_at, MAX(st.last_seen_app) AS last_seen_app, MAX(st.last_login_at) AS last_login_at,
            MAX(st.first_seen_at) AS first_seen_at, MAX(st.last_ip) AS last_ip, MAX(g.city) AS city, MAX(g.country_code) AS country_code, MAX(g.isp) AS isp,
            COUNT(DISTINCT IF(d.is_active = 1, d.day, NULL)) AS days_active, COALESCE(SUM(d.sessions), 0) AS sessions,
            COALESCE(SUM(d.engagement_ms), 0) AS engagement_ms, COALESCE(SUM(d.page_views), 0) AS views,
            GROUP_CONCAT(DISTINCT d.app) AS apps
       ${from}${group}${havingSql}
      ORDER BY ${sortCol} ${dir}, u.user_id LIMIT ? OFFSET ?`,
    [...params, ...havingParams, limit, (page - 1) * limit],
  );
  return {
    total: Number(cnt.n),
    page,
    limit,
    dormant_days: s.dormant_days,
    rows: rows.map((r) => ({
      user_id: Number(r.user_id),
      name: (r.name || "").trim() || r.username,
      user_type: r.user_type,
      last_seen_at: r.last_seen_at,
      last_seen_app: r.last_seen_app ? APP_BY_CODE[r.last_seen_app] : null,
      last_login_at: r.last_login_at,
      first_seen_at: r.first_seen_at,
      last_ip: ipToString(r.last_ip),
      last_place: { city: r.city, country_code: r.country_code, isp: r.isp },
      days_active: Number(r.days_active),
      sessions: Number(r.sessions),
      engagement_ms: Number(r.engagement_ms),
      views: Number(r.views),
      apps: String(r.apps || "").split(",").filter(Boolean).map((c) => APP_BY_CODE[Number(c)]),
    })),
  };
};

/** Adoption by a placement dimension: programme, grade or class group. */
export const adoptionBy = async (rq: ReportQuery, by: "program" | "grade" | "class_group" | "role", suppressSmall: boolean) => {
  const app = appSql("d.app", rq);
  const cur = "JOIN AcademicYear ay ON ay.academic_year_id = m.academic_year_id AND ay.is_current = 1";
  // Members of each node: students (class group), class teachers, subject teachers, programme leads.
  const membership =
    by === "role"
      ? `SELECT r.name AS node_id, r.name AS node, ur.user_id FROM UserRole ur JOIN Role r ON r.role_id = ur.role_id`
      : by === "class_group"
        ? `SELECT cg.class_group_id AS node_id, cg.name AS node, m.user_id FROM StudentClassGroup m ${cur} JOIN ClassGroup cg ON cg.class_group_id = m.class_group_id WHERE m.status = 'ACTIVE'
           UNION SELECT cg.class_group_id, cg.name, m.user_id FROM UserGrade m ${cur} JOIN ClassGroup cg ON cg.class_group_id = m.class_group_id
           UNION SELECT cg.class_group_id, cg.name, m.user_id FROM TeacherSubjectAssignment m ${cur} JOIN ClassGroup cg ON cg.class_group_id = m.class_group_id`
        : by === "grade"
          ? `SELECT g.grade_id AS node_id, g.name AS node, m.user_id FROM StudentClassGroup m ${cur} JOIN ClassGroup cg ON cg.class_group_id = m.class_group_id JOIN Grade g ON g.grade_id = cg.grade_id WHERE m.status = 'ACTIVE'
             UNION SELECT g.grade_id, g.name, m.user_id FROM UserGrade m ${cur} JOIN Grade g ON g.grade_id = m.grade_id
             UNION SELECT g.grade_id, g.name, m.user_id FROM TeacherSubjectAssignment m ${cur} JOIN ClassGroup cg ON cg.class_group_id = m.class_group_id JOIN Grade g ON g.grade_id = cg.grade_id`
          : `SELECT pr.program_id AS node_id, pr.name AS node, m.user_id FROM StudentClassGroup m ${cur} JOIN ClassGroup cg ON cg.class_group_id = m.class_group_id JOIN Grade g ON g.grade_id = cg.grade_id JOIN Program pr ON pr.program_id = g.program_id WHERE m.status = 'ACTIVE'
             UNION SELECT pr.program_id, pr.name, m.user_id FROM UserProgramLead m ${cur} JOIN Program pr ON pr.program_id = m.program_id
             UNION SELECT pr.program_id, pr.name, m.user_id FROM TeacherSubjectAssignment m ${cur} JOIN ClassGroup cg ON cg.class_group_id = m.class_group_id JOIN Grade g ON g.grade_id = cg.grade_id JOIN Program pr ON pr.program_id = g.program_id`;
  const rows = await q<any>(
    `SELECT mem.node_id, mem.node, COUNT(DISTINCT mem.user_id) AS eligible, COUNT(DISTINCT a.user_id) AS active
       FROM (${membership}) mem
       JOIN User u ON u.user_id = mem.user_id AND u.status = 'ACTIVE'
       LEFT JOIN (SELECT DISTINCT d.user_id FROM AnalyticsUserDay d WHERE d.day BETWEEN ? AND ? AND d.is_active = 1${app.sql}) a ON a.user_id = mem.user_id
      WHERE mem.user_id NOT IN ${EXCLUDED}
      GROUP BY mem.node_id, mem.node ORDER BY mem.node`,
    [rq.from, rq.to, ...app.params],
  );
  return rows.map((r) => {
    const eligible = Number(r.eligible);
    const hidden = suppressSmall && eligible < 5;
    const active = Number(r.active);
    return { id: r.node_id, name: r.node, eligible, active: hidden ? null : suppress(active, suppressSmall), adoption: hidden ? null : pct(active, eligible) };
  });
};

// ---------------------------------------------------------------------------
// Visitors (public, not signed in) — plan §6, §14 page 5
// ---------------------------------------------------------------------------
export const visitors = async (
  rq: ReportQuery,
  o: { tab?: "humans" | "bots" | "converted"; search?: string; page?: number; limit?: number } = {},
) => {
  const s = await getSettings();
  const limit = Math.min(500, Math.max(1, o.limit ?? 50));
  const page = Math.max(1, o.page ?? 1);
  const isBot = `(d.bot_override = 'bot' OR (d.bot_override <> 'human' AND d.bot_score >= ${Number(s.bot_threshold)}))`;
  const tabSql =
    o.tab === "bots" ? ` AND ${isBot}` : o.tab === "converted" ? ` AND NOT ${isBot} AND d.first_user_id IS NOT NULL` : ` AND NOT ${isBot}`;
  const search = o.search?.trim();
  const searchSql = search ? " AND (INET6_NTOA(d.last_ip) LIKE ? OR g.city LIKE ? OR g.isp LIKE ? OR JSON_SEARCH(d.guest_names, 'one', ?) IS NOT NULL)" : "";
  const searchParams = search ? [`${search}%`, `%${search}%`, `%${search}%`, `%${search}%`] : [];
  const base = `
      FROM AnalyticsDevice d
      LEFT JOIN AnalyticsGeo g ON g.geo_id = d.last_geo_id
      LEFT JOIN AnalyticsUa ua ON ua.ua_id = d.ua_id
     WHERE d.last_seen >= ? AND d.first_seen < ?
       AND d.device_id <> 'server0000000000000000'
       AND (d.first_user_id IS NULL OR EXISTS (SELECT 1 FROM AnalyticsDeviceDay dd WHERE dd.device_id = d.device_id AND dd.day BETWEEN ? AND ?))${tabSql}${searchSql}`;
  const params = [rq.fromAt, rq.toAt, rq.from, rq.to, ...searchParams];
  const [cnt] = await q<any>(`SELECT COUNT(*) AS n ${base}`, params);
  const rows = await q<any>(
    `SELECT d.device_id, d.first_seen, d.last_seen, d.last_ip, d.page_views, d.sessions, d.bot_score, d.bot_override,
            d.first_user_id, d.linked_user_ids, d.guest_names, d.standalone_seen,
            g.city, g.region, g.country_code, g.isp, g.conn_type, ua.browser, ua.os, ua.device_type,
            (SELECT COUNT(*) FROM AuthEvent a WHERE a.device_id = d.device_id AND a.outcome = 'failure') AS failed_logins,
            (SELECT CONCAT_WS(' ', p.first_name, p.last_name) FROM UserProfile p WHERE p.user_id = d.first_user_id) AS linked_name
       ${base} ORDER BY d.last_seen DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  return {
    total: Number(cnt.n),
    page,
    limit,
    rows: rows.map((r) => ({
      code: visitorCode(r.device_id),
      device_id: r.device_id,
      first_seen: r.first_seen,
      last_seen: r.last_seen,
      ip: ipToString(r.last_ip),
      place: { city: r.city, region: r.region, country_code: r.country_code, isp: r.isp, conn_type: r.conn_type },
      device: { browser: r.browser, os: r.os, type: r.device_type, pwa: !!r.standalone_seen },
      page_views: Number(r.page_views),
      sessions: Number(r.sessions),
      failed_logins: Number(r.failed_logins),
      bot_score: Number(r.bot_score),
      bot_override: r.bot_override,
      linked_user: r.first_user_id ? { id: Number(r.first_user_id), name: (r.linked_name || "").trim() || null } : null,
      guest_names: typeof r.guest_names === "string" ? JSON.parse(r.guest_names) : r.guest_names ?? [],
    })),
  };
};

export const visitorSeries = async (rq: ReportQuery) => {
  const app = appSql("d.app", rq);
  const rows = await q<any>(
    `SELECT d.day, d.device_id, d.is_bot FROM AnalyticsDeviceDay d WHERE d.day BETWEEN ? AND ?${app.sql}`,
    [rq.from, rq.to, ...app.params],
  );
  const buckets = new Map(bucketsIn(rq).map((b) => [b, { humans: new Set<string>(), bots: new Set<string>() }]));
  for (const r of rows) (r.is_bot ? buckets.get(bucketOf(toDay(r.day), rq.gran))?.bots : buckets.get(bucketOf(toDay(r.day), rq.gran))?.humans)?.add(r.device_id);
  const entries = await q<any>(
    `SELECT value, SUM(sessions) AS sessions, SUM(users) AS people FROM AnalyticsDimDay
      WHERE day BETWEEN ? AND ? AND audience = 'visitor' AND dim = ?${appSql("app", rq).sql}
      GROUP BY value ORDER BY sessions DESC LIMIT 15`,
    [rq.from, rq.to, "landing", ...app.params],
  );
  const referrers = await q<any>(
    `SELECT value, SUM(sessions) AS sessions FROM AnalyticsDimDay
      WHERE day BETWEEN ? AND ? AND audience = 'visitor' AND dim = 'referrer_host'${appSql("app", rq).sql}
      GROUP BY value ORDER BY sessions DESC LIMIT 15`,
    [rq.from, rq.to, ...app.params],
  );
  // Conversion: visitor devices first seen in range that later signed in.
  const [conv] = await q<any>(
    `SELECT COUNT(*) AS seen, SUM(first_user_id IS NOT NULL) AS converted FROM AnalyticsDevice
      WHERE first_seen >= ? AND first_seen < ? AND device_id <> 'server0000000000000000'
        AND NOT (bot_override = 'bot' OR (bot_override <> 'human' AND bot_score >= 60))`,
    [rq.fromAt, rq.toAt],
  );
  return {
    series: [...buckets].map(([bucket, b]) => ({ bucket, humans: b.humans.size, bots: b.bots.size })),
    entry_pages: entries.map((e) => ({ route: e.value, sessions: Number(e.sessions), people: Number(e.people) })),
    referrers: referrers.map((e) => ({ host: e.value, sessions: Number(e.sessions) })),
    conversion: { new_devices: Number(conv.seen), signed_in_later: Number(conv.converted ?? 0), rate: pct(Number(conv.converted ?? 0), Number(conv.seen)) },
  };
};
