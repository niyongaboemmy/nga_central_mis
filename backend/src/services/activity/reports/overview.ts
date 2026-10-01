import { APP_BY_CODE } from "../apps";
import { q } from "../db";
import { addDays } from "../rollup";
import {
  appSql, bucketOf, bucketsIn, comparisonOf, daysIn, delta, EXCLUDED, pct, ReportQuery, segmentSql, suppress, toDay,
} from "./common";

/**
 * Overview (plan §14 page 1) with GA4 definitions (§9.2):
 *  accessed users = any session that day; active users = an engaged session;
 *  DAU/WAU/MAU = rolling 1/7/28 days ending each day; stickiness = DAU/MAU.
 */
export interface Totals {
  accessed_users: number;
  active_users: number;
  new_users: number;
  visitors: number;
  sessions: number;
  engaged_sessions: number;
  engagement_rate: number | null;
  avg_engagement_s_per_user: number | null;
  avg_engagement_s_per_session: number | null;
  views: number;
  views_per_user: number | null;
  key_events: number;
  logins: number;
  failed_logins: number;
  login_success_rate: number | null;
}

export const totals = async (rq: ReportQuery): Promise<Totals> => {
  const seg = segmentSql("d.user_id", rq.seg);
  const app = appSql("d.app", rq);
  const wantUsers = rq.aud !== "visitor";
  const wantVisitors = rq.aud !== "user";

  const [u] = wantUsers
    ? await q<any>(
        `SELECT COUNT(DISTINCT d.user_id) AS accessed,
                COUNT(DISTINCT IF(d.is_active = 1, d.user_id, NULL)) AS active,
                COALESCE(SUM(d.engagement_ms), 0) AS eng,
                COALESCE(SUM(d.page_views), 0) AS views,
                COALESCE(SUM(d.key_events), 0) AS key_events
           FROM AnalyticsUserDay d
          WHERE d.day BETWEEN ? AND ? AND d.user_id NOT IN ${EXCLUDED}${app.sql}${seg.sql}`,
        [rq.from, rq.to, ...app.params, ...seg.params],
      )
    : [{ accessed: 0, active: 0, eng: 0, views: 0, key_events: 0 }];

  const [v] = wantVisitors && !rq.seg.types?.length
    ? await q<any>(
        `SELECT COUNT(DISTINCT d.device_id) AS visitors, COALESCE(SUM(d.page_views), 0) AS views, COALESCE(SUM(d.engagement_ms), 0) AS eng
           FROM AnalyticsDeviceDay d WHERE d.day BETWEEN ? AND ? AND d.is_bot = 0${app.sql}`,
        [rq.from, rq.to, ...app.params],
      )
    : [{ visitors: 0, views: 0, eng: 0 }];

  // Sessions: by the app they started in (entry_app) when filtering by app.
  const sSeg = segmentSql("s.user_id", rq.seg);
  const sApp = appSql("s.entry_app", rq);
  const audSql = rq.aud === "user" ? " AND s.user_id IS NOT NULL" : rq.aud === "visitor" ? " AND s.user_id IS NULL" : "";
  const [s] = await q<any>(
    `SELECT COUNT(*) AS sessions, COALESCE(SUM(s.is_engaged), 0) AS engaged, COALESCE(SUM(s.engagement_ms), 0) AS eng
       FROM AnalyticsSession s
      WHERE s.started_at >= ? AND s.started_at < ? AND s.is_bot = 0
        AND (s.user_id IS NULL OR s.user_id NOT IN ${EXCLUDED})${audSql}${sApp.sql}${hasSeg(rq) ? sSeg.sql : ""}`,
    [rq.fromAt, rq.toAt, ...sApp.params, ...(hasSeg(rq) ? sSeg.params : [])],
  );

  // New users: first seen on the platform (or in the filtered app) inside the range.
  const nSeg = segmentSql("st.user_id", rq.seg);
  let newUsers = 0;
  if (wantUsers) {
    if (rq.appKeys.length) {
      const conds = rq.appKeys.map(() => `JSON_UNQUOTE(JSON_EXTRACT(st.first_seen_by_app, CONCAT('$.', ?))) BETWEEN ? AND ?`);
      const params: any[] = [];
      for (const a of rq.appKeys) params.push(a, rq.fromAt.toISOString(), rq.toAt.toISOString());
      const [n] = await q<any>(
        `SELECT COUNT(*) AS n FROM AnalyticsUserState st WHERE st.excluded = 0 AND (${conds.join(" OR ")})${nSeg.sql}`,
        [...params, ...nSeg.params],
      );
      newUsers = Number(n.n);
    } else {
      const [n] = await q<any>(
        `SELECT COUNT(*) AS n FROM AnalyticsUserState st WHERE st.excluded = 0 AND st.first_seen_at >= ? AND st.first_seen_at < ?${nSeg.sql}`,
        [rq.fromAt, rq.toAt, ...nSeg.params],
      );
      newUsers = Number(n.n);
    }
  }

  const aSeg = segmentSql("a.user_id", rq.seg);
  const [a] = await q<any>(
    `SELECT COALESCE(SUM(a.outcome = 'success' AND a.kind IN ('login','google')), 0) AS ok,
            COALESCE(SUM(a.outcome = 'failure' AND a.kind IN ('login','google','otp')), 0) AS failed
       FROM AuthEvent a WHERE a.occurred_at >= ? AND a.occurred_at < ?${hasSeg(rq) ? aSeg.sql : ""}`,
    [rq.fromAt, rq.toAt, ...(hasSeg(rq) ? aSeg.params : [])],
  );

  const active = Number(u.active);
  const sessions = Number(s.sessions);
  const views = Number(u.views) + Number(v.views);
  const people = active + Number(v.visitors);
  return {
    accessed_users: Number(u.accessed),
    active_users: active,
    new_users: newUsers,
    visitors: Number(v.visitors),
    sessions,
    engaged_sessions: Number(s.engaged),
    engagement_rate: pct(Number(s.engaged), sessions),
    avg_engagement_s_per_user: active ? Math.round(Number(u.eng) / active / 1000) : null,
    avg_engagement_s_per_session: sessions ? Math.round(Number(s.eng) / sessions / 1000) : null,
    views,
    views_per_user: people ? Math.round((views / people) * 10) / 10 : null,
    key_events: Number(u.key_events),
    logins: Number(a.ok),
    failed_logins: Number(a.failed),
    login_success_rate: pct(Number(a.ok), Number(a.ok) + Number(a.failed)),
  };
};
const hasSeg = (rq: ReportQuery) =>
  !!(rq.seg.types?.length || rq.seg.roles?.length || rq.seg.programIds?.length || rq.seg.gradeIds?.length || rq.seg.classGroupIds?.length);

/** DAU / WAU / MAU (rolling 1/7/28 days) for every day in range, plus per-app active users. */
export const activeSeries = async (rq: ReportQuery) => {
  const seg = segmentSql("d.user_id", rq.seg);
  const app = appSql("d.app", rq);
  const rows = await q<any>(
    `SELECT d.day, d.user_id, d.app, d.is_active
       FROM AnalyticsUserDay d
      WHERE d.day BETWEEN ? AND ? AND d.user_id NOT IN ${EXCLUDED}${app.sql}${seg.sql}`,
    [addDays(rq.from, -27), rq.to, ...app.params, ...seg.params],
  );
  const activeByDay = new Map<string, Set<number>>();
  const accessedByDay = new Map<string, Set<number>>();
  const byAppDay = new Map<string, Map<string, Set<number>>>();
  for (const r of rows) {
    const day = toDay(r.day);
    const uid = Number(r.user_id);
    if (!accessedByDay.has(day)) accessedByDay.set(day, new Set());
    accessedByDay.get(day)!.add(uid);
    if (!r.is_active) continue;
    if (!activeByDay.has(day)) activeByDay.set(day, new Set());
    activeByDay.get(day)!.add(uid);
    const appKey = APP_BY_CODE[r.app];
    if (!byAppDay.has(day)) byAppDay.set(day, new Map());
    const m = byAppDay.get(day)!;
    if (!m.has(appKey)) m.set(appKey, new Set());
    m.get(appKey)!.add(uid);
  }
  const windowCount = (end: string, len: number) => {
    const s = new Set<number>();
    for (let i = 0; i < len; i++) activeByDay.get(addDays(end, -i))?.forEach((u) => s.add(u));
    return s.size;
  };
  const daily = daysIn(rq.from, rq.to).map((day) => {
    const dau = activeByDay.get(day)?.size ?? 0;
    const wau = windowCount(day, 7);
    const mau = windowCount(day, 28);
    const apps: Record<string, number> = {};
    byAppDay.get(day)?.forEach((set, k) => (apps[k] = set.size));
    return { day, dau, wau, mau, accessed: accessedByDay.get(day)?.size ?? 0, stickiness: mau ? Math.round((dau / mau) * 1000) / 10 : null, apps };
  });
  // Bucketed: distinct users per bucket (week/month) — not a sum of days.
  const buckets = bucketsIn(rq).map((b) => {
    const users = new Set<number>();
    const accessed = new Set<number>();
    const apps = new Map<string, Set<number>>();
    for (const day of daysIn(rq.from, rq.to)) {
      if (bucketOf(day, rq.gran) !== b) continue;
      activeByDay.get(day)?.forEach((u) => users.add(u));
      accessedByDay.get(day)?.forEach((u) => accessed.add(u));
      byAppDay.get(day)?.forEach((set, k) => {
        if (!apps.has(k)) apps.set(k, new Set());
        set.forEach((u) => apps.get(k)!.add(u));
      });
    }
    return { bucket: b, active: users.size, accessed: accessed.size, apps: Object.fromEntries([...apps].map(([k, s]) => [k, s.size])) };
  });
  return { daily, buckets };
};

/** Active users ÷ eligible accounts, per user type (GA cannot do this: we know the roster). */
export const adoptionByType = async (rq: ReportQuery, suppressSmall: boolean) => {
  const app = appSql("d.app", rq);
  const seg = segmentSql("p.user_id", { ...rq.seg, types: undefined });
  const rows = await q<any>(
    `SELECT p.user_type AS type,
            COUNT(DISTINCT p.user_id) AS eligible,
            COUNT(DISTINCT a.user_id) AS active,
            COUNT(DISTINCT x.user_id) AS accessed
       FROM UserProfile p
       JOIN User u ON u.user_id = p.user_id AND u.status = 'ACTIVE'
       LEFT JOIN (SELECT DISTINCT d.user_id FROM AnalyticsUserDay d WHERE d.day BETWEEN ? AND ? AND d.is_active = 1${app.sql}) a ON a.user_id = p.user_id
       LEFT JOIN (SELECT DISTINCT d.user_id FROM AnalyticsUserDay d WHERE d.day BETWEEN ? AND ?${app.sql}) x ON x.user_id = p.user_id
      WHERE p.user_id NOT IN ${EXCLUDED}${seg.sql}
      GROUP BY p.user_type ORDER BY eligible DESC`,
    [rq.from, rq.to, ...app.params, rq.from, rq.to, ...app.params, ...seg.params],
  );
  return rows.map((r) => {
    const eligible = Number(r.eligible);
    const active = Number(r.active);
    const hidden = suppressSmall && eligible > 0 && eligible < 5;
    return {
      type: r.type ?? "UNKNOWN",
      eligible,
      active: hidden ? null : suppress(active, suppressSmall),
      accessed: hidden ? null : suppress(Number(r.accessed), suppressSmall),
      adoption: hidden ? null : pct(active, eligible),
    };
  });
};

export const topFeatures = async (rq: ReportQuery, limit = 10) => {
  const app = appSql("f.app", rq);
  const aud = rq.aud === "both" ? "" : " AND f.audience = ?";
  return (
    await q<any>(
      `SELECT f.app, f.feature, SUM(f.views) AS views, SUM(f.users) AS user_days, SUM(f.engagement_ms) AS engagement_ms
         FROM AnalyticsFeatureDay f
        WHERE f.day BETWEEN ? AND ?${app.sql}${aud} AND f.feature NOT LIKE '%.other'
        GROUP BY f.app, f.feature HAVING views > 0 ORDER BY views DESC LIMIT ?`,
      [rq.from, rq.to, ...app.params, ...(aud ? [rq.aud] : []), limit],
    )
  ).map((r) => ({ app: APP_BY_CODE[r.app], feature: r.feature, views: Number(r.views), user_days: Number(r.user_days), engagement_ms: Number(r.engagement_ms) }));
};

/** Plain-language callouts when this week moved sharply against last week. */
export const callouts = async (rq: ReportQuery) => {
  const end = rq.to;
  const cur = [addDays(end, -6), end];
  const prev = [addDays(end, -13), addDays(end, -7)];
  const app = appSql("d.app", rq);
  const byType = async ([a, b]: string[]) =>
    q<any>(
      `SELECT p.user_type AS type, COUNT(DISTINCT d.user_id) AS n FROM AnalyticsUserDay d
         JOIN UserProfile p ON p.user_id = d.user_id
        WHERE d.day BETWEEN ? AND ? AND d.is_active = 1 AND d.user_id NOT IN ${EXCLUDED}${app.sql}
        GROUP BY p.user_type`,
      [a, b, ...app.params],
    );
  const [c, p] = await Promise.all([byType(cur), byType(prev)]);
  const out: { kind: "up" | "down"; text: string; change: number }[] = [];
  const prevMap = new Map(p.map((r) => [r.type, Number(r.n)]));
  for (const r of c) {
    const before = prevMap.get(r.type) ?? 0;
    const now = Number(r.n);
    if (Math.max(before, now) < 5) continue;
    const change = delta(now, before);
    if (change !== null && Math.abs(change) >= 15)
      out.push({ kind: change > 0 ? "up" : "down", change, text: `${label(r.type)} active this week: ${now} (${change > 0 ? "+" : ""}${change}% on last week)` });
  }
  for (const [type, before] of prevMap)
    if (!c.some((r) => r.type === type) && before >= 5)
      out.push({ kind: "down", change: -100, text: `No ${label(type).toLowerCase()} active this week (${before} last week)` });
  return out.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5);
};
const label = (t: string | null) => (t ? t.charAt(0) + t.slice(1).toLowerCase() + "s" : "Users");

export const overview = async (rq: ReportQuery, suppressSmall: boolean) => {
  const cmp = comparisonOf(rq);
  const [cur, prev, series, adoption, features, notes] = await Promise.all([
    totals(rq),
    cmp ? totals(cmp) : Promise.resolve(null),
    activeSeries(rq),
    adoptionByType(rq, suppressSmall),
    topFeatures(rq),
    callouts(rq),
  ]);
  const deltas: Record<string, number | null> = {};
  if (prev) for (const k of Object.keys(cur) as (keyof Totals)[]) deltas[k] = delta(cur[k] as number | null, prev[k] as number | null);
  return { range: { from: rq.from, to: rq.to, gran: rq.gran }, compare: cmp ? { from: cmp.from, to: cmp.to } : null, totals: cur, previous: prev, deltas, series, adoption, top_features: features, callouts: notes };
};
