import { APP_BY_CODE } from "../apps";
import { q } from "../db";
import { addDays } from "../rollup";
import { appSql, bucketOf, bucketsIn, EXCLUDED, pct, ReportQuery, segmentSql, toDay } from "./common";

/**
 * Engagement, Apps, Retention and Technology reports (plan §14 pages 6–8, 11).
 */
const audSql = (rq: ReportQuery, col = "audience") => (rq.aud === "both" ? { sql: "", params: [] as any[] } : { sql: ` AND ${col} = ?`, params: [rq.aud] });

export const features = async (rq: ReportQuery) => {
  const app = appSql("f.app", rq);
  const aud = audSql(rq, "f.audience");
  const rows = await q<any>(
    `SELECT f.app, f.feature, SUM(f.views) AS views, SUM(f.users) AS user_days, SUM(f.engaged_users) AS engaged_user_days,
            SUM(f.engagement_ms) AS engagement_ms, SUM(f.events) AS events, SUM(f.key_events) AS key_events
       FROM AnalyticsFeatureDay f WHERE f.day BETWEEN ? AND ?${app.sql}${aud.sql}
      GROUP BY f.app, f.feature ORDER BY views DESC LIMIT 500`,
    [rq.from, rq.to, ...app.params, ...aud.params],
  );
  // Distinct people per feature over the whole range (not a sum of days).
  const people = await q<any>(
    `SELECT e.app, e.feature, COUNT(DISTINCT COALESCE(CONCAT('u', e.user_id), e.device_id)) AS people
       FROM AnalyticsEvent e
      WHERE e.occurred_at >= ? AND e.occurred_at < ? AND e.name = 'page_view' AND (e.flags & 13) = 0
        ${rq.apps.length ? "AND e.app IN (?)" : ""} ${rq.aud === "user" ? "AND e.user_id IS NOT NULL" : rq.aud === "visitor" ? "AND e.user_id IS NULL" : ""}
      GROUP BY e.app, e.feature`,
    [rq.fromAt, rq.toAt, ...(rq.apps.length ? [rq.apps] : [])],
  );
  const pm = new Map(people.map((p) => [`${p.app}|${p.feature}`, Number(p.people)]));
  const activeByApp = await q<any>(
    `SELECT d.app, COUNT(DISTINCT d.user_id) AS n FROM AnalyticsUserDay d WHERE d.day BETWEEN ? AND ? AND d.is_active = 1 GROUP BY d.app`,
    [rq.from, rq.to],
  );
  const appActive = new Map(activeByApp.map((r) => [Number(r.app), Number(r.n)]));
  return rows.map((r) => {
    const ppl = pm.get(`${r.app}|${r.feature}`) ?? 0;
    const views = Number(r.views);
    return {
      app: APP_BY_CODE[r.app],
      feature: r.feature,
      views,
      people: ppl,
      views_per_person: ppl ? Math.round((views / ppl) * 10) / 10 : null,
      avg_engagement_s: ppl ? Math.round(Number(r.engagement_ms) / ppl / 1000) : null,
      engagement_ms: Number(r.engagement_ms),
      events: Number(r.events),
      key_events: Number(r.key_events),
      reach: pct(ppl, appActive.get(Number(r.app)) ?? 0),
    };
  });
};

export const dimension = async (rq: ReportQuery, dim: string, limit = 50) => {
  const app = appSql("app", rq);
  const aud = audSql(rq);
  const rows = await q<any>(
    `SELECT value, SUM(users) AS people_days, SUM(sessions) AS sessions, SUM(views) AS views
       FROM AnalyticsDimDay WHERE day BETWEEN ? AND ? AND dim = ?${app.sql}${aud.sql}
      GROUP BY value ORDER BY sessions DESC, views DESC LIMIT ?`,
    [rq.from, rq.to, dim, ...app.params, ...aud.params, limit],
  );
  const total = rows.reduce((s, r) => s + Number(r.sessions), 0);
  return rows.map((r) => ({ value: r.value, sessions: Number(r.sessions), views: Number(r.views), people_days: Number(r.people_days), share: pct(Number(r.sessions), total) }));
};

/** Key events over time (count and conversion = sessions with it ÷ sessions). */
export const keyEvents = async (rq: ReportQuery) => {
  const rows = await q<any>(
    `SELECT DATE(e.occurred_at + INTERVAL 2 HOUR) AS day, e.app, e.name, COUNT(*) AS n, COUNT(DISTINCT e.session_id) AS sessions
       FROM AnalyticsEvent e
      WHERE e.occurred_at >= ? AND e.occurred_at < ? AND (e.flags & 2) > 0 AND (e.flags & 13) = 0 ${rq.apps.length ? "AND e.app IN (?)" : ""}
      GROUP BY day, e.app, e.name`,
    [rq.fromAt, rq.toAt, ...(rq.apps.length ? [rq.apps] : [])],
  );
  const [s] = await q<any>(
    `SELECT COUNT(*) AS n FROM AnalyticsSession WHERE started_at >= ? AND started_at < ? AND is_bot = 0 ${rq.apps.length ? "AND entry_app IN (?)" : ""}`,
    [rq.fromAt, rq.toAt, ...(rq.apps.length ? [rq.apps] : [])],
  );
  const byName = new Map<string, { app: string; name: string; count: number; sessions: number; series: Map<string, number> }>();
  for (const r of rows) {
    const k = `${r.app}|${r.name}`;
    if (!byName.has(k)) byName.set(k, { app: APP_BY_CODE[r.app], name: r.name, count: 0, sessions: 0, series: new Map() });
    const e = byName.get(k)!;
    e.count += Number(r.n);
    e.sessions += Number(r.sessions);
    const b = bucketOf(toDay(r.day), rq.gran);
    e.series.set(b, (e.series.get(b) ?? 0) + Number(r.n));
  }
  const buckets = bucketsIn(rq);
  return [...byName.values()]
    .map((e) => ({ app: e.app, name: e.name, count: e.count, conversion: pct(e.sessions, Number(s.n)), series: buckets.map((b) => ({ bucket: b, count: e.series.get(b) ?? 0 })) }))
    .sort((a, b) => b.count - a.count);
};

/** Side-by-side app scorecards. */
export const apps = async (rq: ReportQuery) => {
  const users = await q<any>(
    `SELECT d.app, COUNT(DISTINCT d.user_id) AS accessed, COUNT(DISTINCT IF(d.is_active = 1, d.user_id, NULL)) AS active,
            SUM(d.page_views) AS views, SUM(d.engagement_ms) AS engagement_ms, SUM(d.key_events) AS key_events
       FROM AnalyticsUserDay d WHERE d.day BETWEEN ? AND ? AND d.user_id NOT IN ${EXCLUDED} GROUP BY d.app`,
    [rq.from, rq.to],
  );
  const visitors = await q<any>(
    `SELECT app, COUNT(DISTINCT device_id) AS n FROM AnalyticsDeviceDay WHERE day BETWEEN ? AND ? AND is_bot = 0 GROUP BY app`,
    [rq.from, rq.to],
  );
  // Sessions touching each app (apps_mask), not just starting in it.
  const sessions = await q<any>(
    `SELECT SUM(apps_mask & 1 > 0) AS mis, SUM(apps_mask & 2 > 0) AS tm, SUM(apps_mask & 4 > 0) AS tendo, SUM(apps_mask & 8 > 0) AS tupo,
            SUM(BIT_COUNT(apps_mask) >= 2) AS multi, COUNT(*) AS total
       FROM AnalyticsSession WHERE started_at >= ? AND started_at < ? AND is_bot = 0`,
    [rq.fromAt, rq.toAt],
  );
  const v = new Map(visitors.map((r) => [Number(r.app), Number(r.n)]));
  const s = sessions[0] ?? {};
  return {
    apps: users.map((r) => ({
      app: APP_BY_CODE[r.app],
      accessed: Number(r.accessed),
      active: Number(r.active),
      visitors: v.get(Number(r.app)) ?? 0,
      sessions: Number(s[APP_BY_CODE[r.app]] ?? 0),
      views: Number(r.views),
      avg_engagement_s: Number(r.active) ? Math.round(Number(r.engagement_ms) / Number(r.active) / 1000) : null,
      key_events: Number(r.key_events),
    })),
    multi_app_sessions: Number(s.multi ?? 0),
    total_sessions: Number(s.total ?? 0),
    multi_app_share: pct(Number(s.multi ?? 0), Number(s.total ?? 0)),
  };
};

/** Cross-app flows: how sessions move between apps (Sankey input). */
export const flows = async (rq: ReportQuery) => {
  const rows = await q<any>(
    `SELECT value AS path, SUM(sessions) AS sessions FROM AnalyticsDimDay
      WHERE day BETWEEN ? AND ? AND dim = 'app_path' AND value LIKE '%>%' GROUP BY value ORDER BY sessions DESC LIMIT 100`,
    [rq.from, rq.to],
  );
  const links = new Map<string, number>();
  for (const r of rows) {
    const hops = String(r.path).split(">");
    for (let i = 0; i < hops.length - 1; i++) {
      const k = `${hops[i]}>${hops[i + 1]}`;
      links.set(k, (links.get(k) ?? 0) + Number(r.sessions));
    }
  }
  return {
    paths: rows.map((r) => ({ path: String(r.path).split(">"), sessions: Number(r.sessions) })),
    links: [...links].map(([k, n]) => ({ from: k.split(">")[0], to: k.split(">")[1], sessions: n })).sort((a, b) => b.sessions - a.sessions),
    entry_kinds: await dimension(rq, "entry_kind"),
  };
};

/**
 * Cohort retention: people grouped by the week (or month) they were first active,
 * then the share active in each following period. Built from AnalyticsUserDay.
 */
export const retention = async (rq: ReportQuery, periods = 8) => {
  const gran = rq.gran === "month" ? "month" : "week";
  const seg = segmentSql("d.user_id", rq.seg);
  const app = appSql("d.app", rq);
  const firsts = await q<any>(
    `SELECT d.user_id, MIN(d.day) AS first_day FROM AnalyticsUserDay d
      WHERE d.is_active = 1 AND d.user_id NOT IN ${EXCLUDED}${app.sql}${seg.sql} GROUP BY d.user_id HAVING first_day BETWEEN ? AND ?`,
    [...app.params, ...seg.params, rq.from, rq.to],
  );
  if (!firsts.length) return { gran, cohorts: [] as any[], new_vs_returning: [] as any[] };
  const userCohort = new Map<number, string>(firsts.map((f) => [Number(f.user_id), bucketOf(toDay(f.first_day), gran)]));
  const acts = await q<any>(
    `SELECT DISTINCT d.user_id, d.day FROM AnalyticsUserDay d WHERE d.is_active = 1 AND d.day >= ? AND d.user_id IN (?)${app.sql}`,
    [rq.from, [...userCohort.keys()], ...app.params],
  );
  const step = (b: string, n: number) =>
    gran === "week" ? addDays(b, 7 * n) : new Date(Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 10);
  const cohorts = new Map<string, { size: number; periods: Set<number>[] }>();
  for (const [uid, c] of userCohort) {
    if (!cohorts.has(c)) cohorts.set(c, { size: 0, periods: Array.from({ length: periods }, () => new Set<number>()) });
    cohorts.get(c)!.size++;
  }
  for (const a of acts) {
    const uid = Number(a.user_id);
    const c = userCohort.get(uid);
    if (!c) continue;
    const b = bucketOf(toDay(a.day), gran);
    for (let n = 0; n < periods; n++)
      if (step(c, n) === b) {
        cohorts.get(c)!.periods[n].add(uid);
        break;
      }
  }
  // New vs returning active users per bucket.
  const nvr = await q<any>(
    `SELECT d.day, d.user_id, (st.first_seen_at < ?) AS returning_user
       FROM AnalyticsUserDay d LEFT JOIN AnalyticsUserState st ON st.user_id = d.user_id
      WHERE d.day BETWEEN ? AND ? AND d.is_active = 1 AND d.user_id NOT IN ${EXCLUDED}${app.sql}${seg.sql}`,
    [rq.fromAt, rq.from, rq.to, ...app.params, ...seg.params],
  );
  const nb = new Map(bucketsIn(rq).map((b) => [b, { fresh: new Set<number>(), back: new Set<number>() }]));
  for (const r of nvr) {
    const e = nb.get(bucketOf(toDay(r.day), rq.gran));
    if (!e) continue;
    (r.returning_user ? e.back : e.fresh).add(Number(r.user_id));
  }
  return {
    gran,
    cohorts: [...cohorts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([start, c]) => ({ start, size: c.size, periods: c.periods.map((p) => ({ active: p.size, rate: pct(p.size, c.size) })) })),
    new_vs_returning: [...nb].map(([bucket, e]) => ({ bucket, new: e.fresh.size, returning: e.back.size })),
  };
};

/** Browser / OS / device / PWA vs tab / release (sessions), web vitals p75 and JS errors. */
export const technology = async (rq: ReportQuery) => {
  const [browser, os, deviceType, standalone, release, conn] = await Promise.all([
    dimension(rq, "browser", 15),
    dimension(rq, "os", 15),
    dimension(rq, "device_type", 10),
    dimension(rq, "standalone", 5),
    dimension(rq, "release", 15),
    dimension(rq, "conn_type", 10),
  ]);
  const vitalsRaw = await q<any>(
    `SELECT e.app, e.feature, JSON_UNQUOTE(JSON_EXTRACT(e.params, '$.name')) AS metric, JSON_EXTRACT(e.params, '$.value') AS value
       FROM AnalyticsEvent e
      WHERE e.occurred_at >= ? AND e.occurred_at < ? AND e.name = 'web_vital' AND (e.flags & 13) = 0 ${rq.apps.length ? "AND e.app IN (?)" : ""}
      LIMIT 200000`,
    [rq.fromAt, rq.toAt, ...(rq.apps.length ? [rq.apps] : [])],
  );
  const groups = new Map<string, number[]>();
  for (const v of vitalsRaw) {
    const k = `${APP_BY_CODE[v.app]}|${v.metric}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(Number(v.value));
  }
  const p75 = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * 0.75))];
  };
  const T: Record<string, [number, number]> = { LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], TTFB: [800, 1800] };
  const vitals = [...groups].map(([k, vals]) => {
    const [app, metric] = k.split("|");
    const v = p75(vals);
    const [good, poor] = T[metric] ?? [0, 0];
    return { app, metric, p75: Math.round(v * (metric === "CLS" ? 1000 : 1)) / (metric === "CLS" ? 1000 : 1), samples: vals.length, rating: v <= good ? "good" : v <= poor ? "needs-improvement" : "poor" };
  });
  const errors = await q<any>(
    `SELECT e.app, JSON_UNQUOTE(JSON_EXTRACT(e.params, '$.msg')) AS msg, MAX(e.feature) AS feature, COUNT(*) AS n,
            COUNT(DISTINCT COALESCE(CONCAT('u', e.user_id), e.device_id)) AS people, MAX(e.occurred_at) AS last_at
       FROM AnalyticsEvent e
      WHERE e.occurred_at >= ? AND e.occurred_at < ? AND e.name = 'js_error' AND (e.flags & 13) = 0 ${rq.apps.length ? "AND e.app IN (?)" : ""}
      GROUP BY e.app, msg ORDER BY n DESC LIMIT 100`,
    [rq.fromAt, rq.toAt, ...(rq.apps.length ? [rq.apps] : [])],
  );
  return {
    browser,
    os,
    device_type: deviceType,
    standalone,
    release,
    connection: conn,
    vitals,
    errors: errors.map((e) => ({ app: APP_BY_CODE[e.app], message: e.msg, feature: e.feature, count: Number(e.n), people: Number(e.people), last_at: e.last_at })),
  };
};
