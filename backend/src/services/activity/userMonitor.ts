import { APP_BY_CODE } from "./apps";
import { exec, q } from "./db";
import { ipToString } from "./ip";
import { personKey, personByKey, viewPerson } from "./presence";
import { addDays } from "./rollup";
import { clock, kigaliDay } from "./runtime";
import { visitorCode } from "./tokens";

/**
 * Per-person monitoring (plan §10): User 360, Visitor 360 and My activity read from here.
 * Callers enforce the capability, the admin-on-admin rule and the access log.
 */
const parseJson = (v: unknown) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

/** Does this user hold a capability (through any active grant)? Used for the admin-on-admin rule. */
export const userHoldsCapability = async (userId: number, cap: string) => {
  const rows = await q<any>(
    `SELECT 1 FROM AccessGrant g
       JOIN RolePermission rp ON rp.role_id = g.role_id
       JOIN Permission p ON p.perm_id = rp.perm_id
      WHERE g.user_id = ? AND g.status = 'ACTIVE' AND p.name = ? LIMIT 1`,
    [userId, cap],
  );
  return rows.length > 0;
};

export const holdersOf = async (cap: string) =>
  (
    await q<any>(
      `SELECT DISTINCT g.user_id FROM AccessGrant g
         JOIN RolePermission rp ON rp.role_id = g.role_id
         JOIN Permission p ON p.perm_id = rp.perm_id
         JOIN User u ON u.user_id = g.user_id AND u.status = 'ACTIVE'
        WHERE g.status = 'ACTIVE' AND p.name = ?`,
      [cap],
    )
  ).map((r) => Number(r.user_id));

export const userProfile = async (userId: number) => {
  const [u] = await q<any>(
    `SELECT u.user_id, u.username, u.email, u.status, u.created_at, p.first_name, p.last_name, p.user_type,
            st.first_seen_at, st.first_seen_by_app, st.last_seen_at, st.last_seen_app, st.last_ip, st.last_login_at,
            st.last_login_method, st.total_sessions, st.excluded,
            g.city, g.region, g.country_code, g.isp, g.conn_type
       FROM User u
       LEFT JOIN UserProfile p ON p.user_id = u.user_id
       LEFT JOIN AnalyticsUserState st ON st.user_id = u.user_id
       LEFT JOIN AnalyticsGeo g ON g.geo_id = st.last_geo_id
      WHERE u.user_id = ?`,
    [userId],
  );
  if (!u) return null;
  const roles = await q<any>(`SELECT r.name FROM UserRole ur JOIN Role r ON r.role_id = ur.role_id WHERE ur.user_id = ?`, [userId]);
  const cur = "JOIN AcademicYear ay ON ay.academic_year_id = x.academic_year_id AND ay.is_current = 1";
  const placements = await q<any>(
    `SELECT 'Class' AS kind, cg.name FROM StudentClassGroup x ${cur} JOIN ClassGroup cg ON cg.class_group_id = x.class_group_id WHERE x.user_id = ? AND x.status = 'ACTIVE'
     UNION SELECT 'Class teacher', cg.name FROM UserGrade x ${cur} JOIN ClassGroup cg ON cg.class_group_id = x.class_group_id WHERE x.user_id = ?
     UNION SELECT 'Programme lead', pr.name FROM UserProgramLead x ${cur} JOIN Program pr ON pr.program_id = x.program_id WHERE x.user_id = ?`,
    [userId, userId, userId],
  );
  const live = personByKey(personKey(userId, ""));
  const fs = (parseJson(u.first_seen_by_app) ?? {}) as Record<string, string>;
  return {
    user_id: Number(u.user_id),
    name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.username,
    username: u.username,
    email: u.email,
    status: u.status,
    user_type: u.user_type,
    account_created: u.created_at,
    roles: roles.map((r) => r.name),
    placements: placements.map((p) => `${p.kind}: ${p.name}`),
    first_seen_at: u.first_seen_at,
    first_seen_by_app: fs,
    last_seen_at: u.last_seen_at,
    last_seen_app: u.last_seen_app ? APP_BY_CODE[u.last_seen_app] : null,
    last_ip: ipToString(u.last_ip),
    last_place: { city: u.city, region: u.region, country_code: u.country_code, isp: u.isp, conn_type: u.conn_type },
    last_login_at: u.last_login_at,
    last_login_method: u.last_login_method,
    total_sessions: Number(u.total_sessions ?? 0),
    excluded: !!u.excluded,
    live: live && live.status !== "offline" ? viewPerson(live) : null,
  };
};

/** Range KPIs and a 12-month activity calendar. */
export const userSummary = async (userId: number, from: string, to: string) => {
  const [k] = await q<any>(
    `SELECT COUNT(DISTINCT IF(is_active = 1, day, NULL)) AS active_days, COUNT(DISTINCT day) AS days,
            COALESCE(SUM(sessions), 0) AS sessions, COALESCE(SUM(page_views), 0) AS views,
            COALESCE(SUM(engagement_ms), 0) AS engagement_ms, COALESCE(SUM(key_events), 0) AS key_events,
            COALESCE(SUM(logins), 0) AS logins
       FROM AnalyticsUserDay WHERE user_id = ? AND day BETWEEN ? AND ?`,
    [userId, from, to],
  );
  const byApp = await q<any>(
    `SELECT app, COALESCE(SUM(engagement_ms), 0) AS engagement_ms, COALESCE(SUM(page_views), 0) AS views, COUNT(DISTINCT day) AS days
       FROM AnalyticsUserDay WHERE user_id = ? AND day BETWEEN ? AND ? GROUP BY app`,
    [userId, from, to],
  );
  const today = kigaliDay(clock.now());
  const cal = await q<any>(
    `SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, SUM(engagement_ms) AS ms, SUM(page_views) AS views, MAX(is_active) AS active
       FROM AnalyticsUserDay WHERE user_id = ? AND day BETWEEN ? AND ? GROUP BY day`,
    [userId, addDays(today, -364), today],
  );
  return {
    active_days: Number(k.active_days),
    days: Number(k.days),
    sessions: Number(k.sessions),
    views: Number(k.views),
    engagement_ms: Number(k.engagement_ms),
    key_events: Number(k.key_events),
    logins: Number(k.logins),
    by_app: byApp.map((r) => ({ app: APP_BY_CODE[r.app], engagement_ms: Number(r.engagement_ms), views: Number(r.views), days: Number(r.days) })),
    calendar: cal.map((c) => ({ day: c.day, engagement_ms: Number(c.ms), views: Number(c.views), active: !!c.active })),
  };
};

/**
 * The User Explorer timeline: sessions (newest first) with their events, interleaved with
 * sign-in activity. Paginate with `before` (an ISO time). Also used for visitor devices.
 */
export const timeline = async (who: { userId?: number; deviceId?: string }, opts: { before?: string; limit?: number; app?: number[] } = {}) => {
  const limit = Math.min(30, Math.max(1, opts.limit ?? 15));
  const before = opts.before ? new Date(opts.before) : new Date(clock.now() + 60_000);
  const whereWho = who.userId ? "s.user_id = ?" : "s.device_id = ?";
  const sessions = await q<any>(
    `SELECT s.session_id, s.device_id, s.user_id, s.started_at, s.last_activity_at, s.ended_at, s.app_path, s.page_views, s.events,
            s.engagement_ms, s.is_engaged, s.entry_kind, s.referrer_host, s.utm_source, s.network_label, s.is_bot, s.stitched_at,
            s.entry_ip, s.last_ip, g.city, g.country_code, g.isp, g.conn_type, ua.browser, ua.os, ua.device_type
       FROM AnalyticsSession s
       LEFT JOIN AnalyticsGeo g ON g.geo_id = s.geo_id
       LEFT JOIN AnalyticsUa ua ON ua.ua_id = s.ua_id
      WHERE ${whereWho} AND s.started_at < ?
      ORDER BY s.started_at DESC LIMIT ?`,
    [who.userId ?? who.deviceId, before, limit],
  );
  const ids = sessions.map((s) => s.session_id);
  const events = ids.length
    ? await q<any>(
        `SELECT session_id, occurred_at, app, name, route, feature, engagement_ms, ip, params, flags
           FROM AnalyticsEvent WHERE session_id IN (?) AND name <> 'user_engagement'
          ORDER BY occurred_at LIMIT 5000`,
        [ids],
      )
    : [];
  const oldest = sessions.length ? sessions[sessions.length - 1].started_at : null;
  const auth = await q<any>(
    `SELECT a.occurred_at, a.kind, a.outcome, a.reason, a.method, a.app, a.initiator, a.username_attempted, a.ip, a.device_id,
            g.city, g.country_code, g.isp
       FROM AuthEvent a LEFT JOIN AnalyticsGeo g ON g.geo_id = a.geo_id
      WHERE ${who.userId ? "a.user_id = ?" : "a.device_id = ?"} AND a.occurred_at < ? ${oldest ? "AND a.occurred_at >= ?" : ""}
      ORDER BY a.occurred_at DESC LIMIT 200`,
    [who.userId ?? who.deviceId, before, ...(oldest ? [oldest] : [])],
  );
  const bySession = new Map<number, any[]>();
  for (const e of events) {
    const sid = Number(e.session_id);
    if (!bySession.has(sid)) bySession.set(sid, []);
    const p = parseJson(e.params) ?? {};
    delete p.rel;
    bySession.get(sid)!.push({
      at: e.occurred_at,
      app: APP_BY_CODE[e.app],
      name: e.name,
      route: e.route,
      feature: e.feature,
      ip: ipToString(e.ip),
      params: Object.keys(p).length ? p : null,
      key_event: (e.flags & 2) > 0,
    });
  }
  return {
    sessions: sessions.map((s) => ({
      session_id: Number(s.session_id),
      device_id: s.device_id,
      visitor_code: visitorCode(s.device_id),
      user_id: s.user_id === null ? null : Number(s.user_id),
      started_at: s.started_at,
      last_activity_at: s.last_activity_at,
      ended_at: s.ended_at,
      app_path: s.app_path ? String(s.app_path).split(">") : [],
      page_views: Number(s.page_views),
      events: Number(s.events),
      engagement_ms: Number(s.engagement_ms),
      engaged: !!s.is_engaged,
      entry_kind: s.entry_kind,
      referrer_host: s.referrer_host,
      stitched_at: s.stitched_at,
      ip: ipToString(s.last_ip ?? s.entry_ip),
      entry_ip: ipToString(s.entry_ip),
      place: { city: s.city, country_code: s.country_code, isp: s.isp, conn_type: s.conn_type },
      network: s.network_label,
      device: { browser: s.browser, os: s.os, type: s.device_type },
      bot: !!s.is_bot,
      items: bySession.get(Number(s.session_id)) ?? [],
    })),
    auth: auth.map((a) => ({
      at: a.occurred_at,
      kind: a.kind,
      outcome: a.outcome,
      reason: a.reason,
      method: a.method,
      app: a.app ? APP_BY_CODE[a.app] : null,
      initiator: a.initiator,
      username_attempted: a.username_attempted,
      ip: ipToString(a.ip),
      place: { city: a.city, country_code: a.country_code, isp: a.isp },
      visitor_code: a.device_id ? visitorCode(a.device_id) : null,
    })),
    next_before: sessions.length === limit && oldest ? new Date(oldest).toISOString() : null,
  };
};

/** Anonymous activity on this user's devices before they signed in (plan §6.4). */
export const beforeSignIn = async (userId: number) => {
  const rows = await q<any>(
    `SELECT s.session_id, s.device_id, s.started_at, s.page_views, s.app_path, s.entry_ip
       FROM AnalyticsSession s
      WHERE s.user_id IS NULL AND s.device_id IN (SELECT DISTINCT device_id FROM AnalyticsSession WHERE user_id = ?)
      ORDER BY s.started_at DESC LIMIT 50`,
    [userId],
  );
  return rows.map((r) => ({
    session_id: Number(r.session_id),
    device_id: r.device_id,
    visitor_code: visitorCode(r.device_id),
    started_at: r.started_at,
    page_views: Number(r.page_views),
    app_path: r.app_path ? String(r.app_path).split(">") : [],
    ip: ipToString(r.entry_ip),
  }));
};

export const userDevices = async (userId: number) => {
  const rows = await q<any>(
    `SELECT s.device_id, MIN(s.started_at) AS first_seen, MAX(s.last_activity_at) AS last_seen, COUNT(*) AS sessions,
            MAX(d.standalone_seen) AS pwa, MAX(d.linked_user_ids) AS linked, MAX(ua.browser) AS browser, MAX(ua.os) AS os, MAX(ua.device_type) AS device_type
       FROM AnalyticsSession s
       LEFT JOIN AnalyticsDevice d ON d.device_id = s.device_id
       LEFT JOIN AnalyticsUa ua ON ua.ua_id = d.ua_id
      WHERE s.user_id = ?
      GROUP BY s.device_id ORDER BY last_seen DESC LIMIT 100`,
    [userId],
  );
  const others = new Set<number>();
  for (const r of rows) for (const id of (parseJson(r.linked) ?? []) as number[]) if (Number(id) !== userId) others.add(Number(id));
  const names = others.size
    ? await q<any>(`SELECT user_id, CONCAT_WS(' ', first_name, last_name) AS name FROM UserProfile WHERE user_id IN (?)`, [[...others]])
    : [];
  const nameOf = new Map(names.map((n) => [Number(n.user_id), n.name]));
  return rows.map((r) => ({
    device_id: r.device_id,
    visitor_code: visitorCode(r.device_id),
    first_seen: r.first_seen,
    last_seen: r.last_seen,
    sessions: Number(r.sessions),
    pwa: !!r.pwa,
    device: { browser: r.browser, os: r.os, type: r.device_type },
    other_accounts: ((parseJson(r.linked) ?? []) as number[])
      .map(Number)
      .filter((id) => id !== userId)
      .map((id) => ({ user_id: id, name: nameOf.get(id) ?? `User ${id}` })),
  }));
};

export const userNetwork = async (userId: number, withFixes: boolean) => {
  const ips = await q<any>(
    `SELECT ui.ip, ui.first_seen, ui.last_seen, ui.hits, i.network_label, i.users_count, g.city, g.region, g.country_code, g.isp, g.conn_type, g.lat, g.lon
       FROM AnalyticsUserIp ui LEFT JOIN AnalyticsIp i ON i.ip = ui.ip LEFT JOIN AnalyticsGeo g ON g.geo_id = i.geo_id
      WHERE ui.user_id = ? ORDER BY ui.last_seen DESC LIMIT 300`,
    [userId],
  );
  // "New" markers: the first time each country / provider appears for this person.
  const firstOf = new Map<string, number>();
  for (const r of [...ips].sort((a, b) => new Date(a.first_seen).getTime() - new Date(b.first_seen).getTime())) {
    for (const k of [`c:${r.country_code}`, `i:${r.isp}`]) if (!firstOf.has(k)) firstOf.set(k, new Date(r.first_seen).getTime());
  }
  const fixes = withFixes
    ? await q<any>(`SELECT lat, lon, accuracy_m, captured_at, device_id FROM AnalyticsLocationFix WHERE user_id = ? ORDER BY captured_at DESC LIMIT 200`, [userId])
    : [];
  return {
    ips: ips.map((r) => ({
      ip: ipToString(r.ip),
      first_seen: r.first_seen,
      last_seen: r.last_seen,
      hits: Number(r.hits),
      shared_with: Math.max(0, Number(r.users_count ?? 1) - 1),
      network_label: r.network_label,
      place: { city: r.city, region: r.region, country_code: r.country_code, isp: r.isp, conn_type: r.conn_type, lat: r.lat === null ? null : Number(r.lat), lon: r.lon === null ? null : Number(r.lon) },
      new_country: firstOf.get(`c:${r.country_code}`) === new Date(r.first_seen).getTime() && ips.length > 1,
      new_isp: firstOf.get(`i:${r.isp}`) === new Date(r.first_seen).getTime() && ips.length > 1,
    })),
    fixes: fixes.map((f) => ({ lat: Number(f.lat), lon: Number(f.lon), accuracy_m: f.accuracy_m, at: f.captured_at, visitor_code: visitorCode(f.device_id) })),
  };
};

export const userSecurity = async (userId: number) => {
  const [u] = await q<any>("SELECT username, email FROM User WHERE user_id = ?", [userId]);
  const auth = await q<any>(
    `SELECT a.occurred_at, a.kind, a.outcome, a.reason, a.method, a.app, a.initiator, a.username_attempted, a.ip, a.device_id, g.city, g.country_code, g.isp
       FROM AuthEvent a LEFT JOIN AnalyticsGeo g ON g.geo_id = a.geo_id
      WHERE a.user_id = ? OR a.username_attempted IN (?, ?)
      ORDER BY a.occurred_at DESC LIMIT 300`,
    [userId, u?.username ?? "", u?.email ?? ""],
  );
  const live = personByKey(personKey(userId, ""));
  return {
    events: auth.map((a) => ({
      at: a.occurred_at,
      kind: a.kind,
      outcome: a.outcome,
      reason: a.reason,
      method: a.method,
      app: a.app ? APP_BY_CODE[a.app] : null,
      initiator: a.initiator,
      username_attempted: a.username_attempted,
      ip: ipToString(a.ip),
      place: { city: a.city, country_code: a.country_code, isp: a.isp },
      visitor_code: a.device_id ? visitorCode(a.device_id) : null,
      device_id: a.device_id,
    })),
    online_devices: live ? new Set([...live.tabs.values()].map((t) => t.deviceId)).size : 0,
  };
};

export const accessLogFor = async (target: { userId?: number; deviceId?: string; ip?: Buffer }, limit = 100) =>
  (
    await q<any>(
      `SELECT l.id, l.at, l.viewer_id, l.action, l.reason, l.detail, CONCAT_WS(' ', p.first_name, p.last_name) AS viewer_name
         FROM MonitorAccessLog l LEFT JOIN UserProfile p ON p.user_id = l.viewer_id
        WHERE ${target.userId ? "l.target_user_id = ?" : target.deviceId ? "l.target_device_id = ?" : "l.target_ip = ?"}
        ORDER BY l.at DESC LIMIT ?`,
      [target.userId ?? target.deviceId ?? target.ip, limit],
    )
  ).map((r) => ({ ...r, detail: parseJson(r.detail) }));

// ---------------------------------------------------------------------------
// Visitors (devices)
// ---------------------------------------------------------------------------
export const deviceProfile = async (deviceId: string) => {
  const [d] = await q<any>(
    `SELECT d.*, ua.browser, ua.os, ua.device_type, ua.ua, g.city, g.region, g.country_code, g.isp, g.conn_type
       FROM AnalyticsDevice d LEFT JOIN AnalyticsUa ua ON ua.ua_id = d.ua_id LEFT JOIN AnalyticsGeo g ON g.geo_id = d.last_geo_id
      WHERE d.device_id = ?`,
    [deviceId],
  );
  if (!d) return null;
  const linked = ((parseJson(d.linked_user_ids) ?? []) as number[]).map(Number);
  const names = linked.length ? await q<any>(`SELECT user_id, CONCAT_WS(' ', first_name, last_name) AS name FROM UserProfile WHERE user_id IN (?)`, [linked]) : [];
  const ips = await q<any>(
    `SELECT di.ip, di.first_seen, di.last_seen, di.hits, g.city, g.country_code, g.isp, g.conn_type
       FROM AnalyticsDeviceIp di LEFT JOIN AnalyticsIp i ON i.ip = di.ip LEFT JOIN AnalyticsGeo g ON g.geo_id = i.geo_id
      WHERE di.device_id = ? ORDER BY di.last_seen DESC LIMIT 100`,
    [deviceId],
  );
  const [fails] = await q<any>(`SELECT COUNT(*) AS n FROM AuthEvent WHERE device_id = ? AND outcome = 'failure'`, [deviceId]);
  const blocks = await q<any>(
    `SELECT id, kind, value, reason, expires_at FROM AnalyticsBlock WHERE revoked_at IS NULL AND expires_at > ? AND kind = 'device' AND value = ?`,
    [new Date(clock.now()), deviceId],
  );
  const live = personByKey(personKey(null, deviceId));
  return {
    device_id: d.device_id,
    visitor_code: visitorCode(d.device_id),
    first_seen: d.first_seen,
    last_seen: d.last_seen,
    first_ip: ipToString(d.first_ip),
    last_ip: ipToString(d.last_ip),
    place: { city: d.city, region: d.region, country_code: d.country_code, isp: d.isp, conn_type: d.conn_type },
    device: { browser: d.browser, os: d.os, type: d.device_type, ua: d.ua, pwa: !!d.standalone_seen, screen: d.screen },
    bot_score: Number(d.bot_score),
    bot_override: d.bot_override,
    sessions: Number(d.sessions),
    page_views: Number(d.page_views),
    guest_names: parseJson(d.guest_names) ?? [],
    linked_users: linked.map((id) => ({ user_id: id, name: names.find((n) => Number(n.user_id) === id)?.name ?? `User ${id}` })),
    failed_logins: Number(fails.n),
    precise_location: d.precise_loc_state,
    blocked: blocks[0] ?? null,
    ips: ips.map((r) => ({ ip: ipToString(r.ip), first_seen: r.first_seen, last_seen: r.last_seen, hits: Number(r.hits), place: { city: r.city, country_code: r.country_code, isp: r.isp, conn_type: r.conn_type } })),
    live: live && live.status !== "offline" ? viewPerson(live) : null,
  };
};

export const setBotOverride = async (deviceId: string, override: "none" | "human" | "bot") => {
  await exec(`UPDATE AnalyticsDevice SET bot_override = ? WHERE device_id = ?`, [override, deviceId]);
};

// ---------------------------------------------------------------------------
// Export and deletion (subject-access requests, plan §10.3)
// ---------------------------------------------------------------------------
export const exportUserData = async (userId: number) => ({
  exported_at: new Date(clock.now()).toISOString(),
  profile: await userProfile(userId),
  devices: await userDevices(userId),
  network: await userNetwork(userId, true),
  security: (await userSecurity(userId)).events,
  sessions: await q<any>(`SELECT * FROM AnalyticsSession WHERE user_id = ? ORDER BY started_at`, [userId]).then((r) =>
    r.map((s) => ({ ...s, entry_ip: ipToString(s.entry_ip), last_ip: ipToString(s.last_ip) })),
  ),
  events: await q<any>(
    `SELECT occurred_at, app, name, route, feature, engagement_ms, ip, params FROM AnalyticsEvent WHERE user_id = ? ORDER BY occurred_at LIMIT 200000`,
    [userId],
  ).then((r) => r.map((e) => ({ ...e, app: APP_BY_CODE[e.app], ip: ipToString(e.ip), params: parseJson(e.params) }))),
  days: await q<any>(`SELECT * FROM AnalyticsUserDay WHERE user_id = ? ORDER BY day`, [userId]),
});

export const deleteUserData = async (userId: number) => {
  const out: Record<string, number> = {};
  const del = async (name: string, sql: string, params: any[]) => {
    let n = 0;
    for (let i = 0; i < 1000; i++) {
      const r = await exec(`${sql} LIMIT 5000`, params);
      n += r.affectedRows;
      if (r.affectedRows < 5000) break;
    }
    out[name] = n;
  };
  await del("events", "DELETE FROM AnalyticsEvent WHERE user_id = ?", [userId]);
  await del("sessions", "DELETE FROM AnalyticsSession WHERE user_id = ?", [userId]);
  await del("days", "DELETE FROM AnalyticsUserDay WHERE user_id = ?", [userId]);
  await del("ips", "DELETE FROM AnalyticsUserIp WHERE user_id = ?", [userId]);
  await del("fixes", "DELETE FROM AnalyticsLocationFix WHERE user_id = ?", [userId]);
  await del("auth", "DELETE FROM AuthEvent WHERE user_id = ?", [userId]);
  await exec("DELETE FROM AnalyticsUserState WHERE user_id = ?", [userId]);
  return out;
};

export const deleteDeviceData = async (deviceId: string) => {
  const out: Record<string, number> = {};
  for (const [name, sql] of [
    ["events", "DELETE FROM AnalyticsEvent WHERE device_id = ? AND user_id IS NULL"],
    ["sessions", "DELETE FROM AnalyticsSession WHERE device_id = ? AND user_id IS NULL"],
    ["days", "DELETE FROM AnalyticsDeviceDay WHERE device_id = ?"],
    ["ips", "DELETE FROM AnalyticsDeviceIp WHERE device_id = ?"],
    ["fixes", "DELETE FROM AnalyticsLocationFix WHERE device_id = ? AND user_id IS NULL"],
  ] as const) {
    let n = 0;
    for (let i = 0; i < 1000; i++) {
      const r = await exec(`${sql} LIMIT 5000`, [deviceId]);
      n += r.affectedRows;
      if (r.affectedRows < 5000) break;
    }
    out[name] = n;
  }
  await exec("DELETE FROM AnalyticsDevice WHERE device_id = ? AND first_user_id IS NULL", [deviceId]);
  return out;
};

/** This person's most used features, against the average for people of the same type. */
export const userFeatures = async (userId: number, from: Date, to: Date) => {
  const mine = await q<any>(
    `SELECT app, feature, COUNT(*) AS views FROM AnalyticsEvent
      WHERE user_id = ? AND occurred_at >= ? AND occurred_at < ? AND name = 'page_view' AND feature IS NOT NULL
      GROUP BY app, feature ORDER BY views DESC LIMIT 15`,
    [userId, from, to],
  );
  if (!mine.length) return [];
  const [t] = await q<any>("SELECT user_type FROM UserProfile WHERE user_id = ?", [userId]);
  const cohort = await q<any>(
    `SELECT e.app, e.feature, COUNT(*) / COUNT(DISTINCT e.user_id) AS avg_views, COUNT(DISTINCT e.user_id) AS people
       FROM AnalyticsEvent e JOIN UserProfile p ON p.user_id = e.user_id
      WHERE e.occurred_at >= ? AND e.occurred_at < ? AND e.name = 'page_view' AND p.user_type <=> ?
        AND (e.flags & 13) = 0 AND e.feature IN (?)
      GROUP BY e.app, e.feature`,
    [from, to, t?.user_type ?? null, mine.map((m) => m.feature)],
  );
  const avg = new Map(cohort.map((c) => [`${c.app}|${c.feature}`, { avg: Number(c.avg_views), people: Number(c.people) }]));
  return mine.map((m) => {
    const a = avg.get(`${m.app}|${m.feature}`);
    return { app: APP_BY_CODE[m.app], feature: m.feature, views: Number(m.views), type_avg: a ? Math.round(a.avg * 10) / 10 : null, type_people: a?.people ?? 0 };
  });
};
