import logger from "../../utils/logger";
import { exec, q } from "./db";
import { cidrContains, ipToBuffer, ipToString, parseCidr } from "./ip";
import { notifyPerson } from "./notify";
import { cachedUser, loadUsers } from "./people";
import { personByKey } from "./presence";
import { activityBus, ActivitySignal, clock, TZ_OFFSET_MS } from "./runtime";
import { getSettings } from "./settings";
import { visitorCode } from "./tokens";
import { holdersOf } from "./userMonitor";
import { lookupGeo } from "./geoip";

/**
 * Watchlist and alerts (plan §10.4).
 *
 * Decision D2: a watched person is ALWAYS told. Creating a watch notifies them (in the
 * app and by push) with who set it, why and until when. Revoking or expiring it notifies
 * them again. There is no covert mode. Watches on a visitor device or an IP have no
 * account to tell, and the UI says so.
 *
 * Matching runs on the in-process activity bus, so alerts fire within seconds. Each
 * (watch, rule) fires at most once per 10 minutes.
 */
export type RuleType =
  | "comes_online"
  | "opens_app"
  | "opens_feature"
  | "key_event"
  | "login_failed"
  | "new_device"
  | "new_ip"
  | "new_country"
  | "off_hours"
  | "concurrent_sessions"
  | "ip_activity";

export interface Rule {
  type: RuleType;
  app?: string;
  feature?: string;
  name?: string;
  n?: number;
  window_min?: number;
  from?: string;
  to?: string;
}

export interface WatchRow {
  id: number;
  target_kind: "user" | "device" | "ip";
  target_user_id: number | null;
  target_device_id: string | null;
  target_cidr: string | null;
  created_by: number;
  reason: string;
  rules: Rule[];
  channels: string[];
  starts_at: Date;
  expires_at: Date;
  status: "active" | "revoked" | "expired";
}

const RULE_TYPES: RuleType[] = ["comes_online", "opens_app", "opens_feature", "key_event", "login_failed", "new_device", "new_ip", "new_country", "off_hours", "concurrent_sessions", "ip_activity"];
const MAX_DAYS = 90;

const parse = (r: any): WatchRow => ({
  ...r,
  target_user_id: r.target_user_id === null ? null : Number(r.target_user_id),
  rules: typeof r.rules === "string" ? JSON.parse(r.rules) : r.rules,
  channels: typeof r.channels === "string" ? JSON.parse(r.channels) : r.channels,
});

const nameOf = async (userId: number) => (await loadUsers([userId])).get(userId)?.name ?? `User ${userId}`;
const fmtDate = (d: Date) => new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");

// ---------------------------------------------------------------------------
// In-memory index of active watches (refreshed on every change and every minute)
// ---------------------------------------------------------------------------
let active: WatchRow[] = [];
let loadedAt = 0;
export const refreshWatches = async (force = false) => {
  if (!force && clock.now() - loadedAt < 60_000) return active;
  try {
    const rows = await q<any>(`SELECT * FROM AnalyticsWatch WHERE status = 'active' AND expires_at > ?`, [new Date(clock.now())]);
    active = rows.map(parse);
  } catch {
    active = [];
  }
  loadedAt = clock.now();
  return active;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export interface CreateWatchInput {
  target: { kind: "user"; userId: number } | { kind: "device"; deviceId: string } | { kind: "ip"; cidr: string };
  reason: string;
  rules: Rule[];
  channels?: string[];
  days?: number;
  actorId: number;
}

export const validateRules = (rules: unknown): Rule[] => {
  if (!Array.isArray(rules) || !rules.length) throw new Error("Choose at least one thing to watch for");
  return rules.slice(0, 12).map((r: any) => {
    if (!RULE_TYPES.includes(r?.type)) throw new Error(`Unknown rule: ${r?.type}`);
    const out: Rule = { type: r.type };
    if (r.app) out.app = String(r.app).slice(0, 10);
    if (r.feature) out.feature = String(r.feature).slice(0, 80);
    if (r.name) out.name = String(r.name).slice(0, 64);
    if (r.n !== undefined) out.n = Math.max(1, Math.min(100, Number(r.n) || 1));
    if (r.window_min !== undefined) out.window_min = Math.max(1, Math.min(1440, Number(r.window_min) || 15));
    if (/^\d{2}:\d{2}$/.test(r.from ?? "")) out.from = r.from;
    if (/^\d{2}:\d{2}$/.test(r.to ?? "")) out.to = r.to;
    return out;
  });
};

export const createWatch = async (input: CreateWatchInput) => {
  const reason = input.reason.trim();
  if (reason.length < 5) throw new Error("A reason is required");
  const rules = validateRules(input.rules);
  const days = Math.max(1, Math.min(MAX_DAYS, Math.round(input.days ?? 14)));
  const channels = (input.channels?.length ? input.channels : ["in_app", "push"]).filter((c) => ["in_app", "push"].includes(c));
  const now = clock.now();
  const expires = new Date(now + days * 86_400_000);
  const t = input.target;
  if (t.kind === "ip" && !parseCidr(t.cidr)) throw new Error("Not a valid IP or range");
  const res = await exec(
    `INSERT INTO AnalyticsWatch (target_kind, target_user_id, target_device_id, target_cidr, created_by, reason, rules, channels, starts_at, expires_at, status)
     VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, 'active')`,
    [
      t.kind,
      t.kind === "user" ? t.userId : null,
      t.kind === "device" ? t.deviceId : null,
      t.kind === "ip" ? t.cidr.trim() : null,
      input.actorId,
      reason.slice(0, 2000),
      JSON.stringify(rules),
      JSON.stringify(channels),
      new Date(now),
      expires,
    ],
  );
  const id = res.insertId;
  // D2: tell the person, with who, why and until when.
  if (t.kind === "user") {
    const by = await nameOf(input.actorId);
    await notifyPerson({
      userId: t.userId,
      kind: "monitor_watch",
      title: "Your account activity is being monitored",
      body: `${by} is monitoring your account activity until ${fmtDate(expires)} (Kigali). Reason: ${reason}`,
      link: "/me/activity",
      subjectType: "watch",
      subjectId: id,
      actorId: input.actorId,
    });
    await exec(`UPDATE AnalyticsWatch SET target_notified_at = ? WHERE id = ?`, [new Date(clock.now()), id]);
  }
  await refreshWatches(true);
  return id;
};

const endWatch = async (w: WatchRow, status: "revoked" | "expired", by: number | null, reason: string | null) => {
  await exec(
    `UPDATE AnalyticsWatch SET status = ?, revoked_by = ?, revoked_at = ?, revoke_reason = ? WHERE id = ? AND status = 'active'`,
    [status, by, new Date(clock.now()), reason, w.id],
  );
  if (w.target_kind === "user" && w.target_user_id) {
    await notifyPerson({
      userId: w.target_user_id,
      kind: "monitor_watch",
      title: "Monitoring of your account has ended",
      body: status === "expired" ? "The monitoring period has ended." : "An administrator ended the monitoring of your account activity.",
      link: "/me/activity",
      subjectType: "watch",
      subjectId: w.id,
      push: false,
    });
  }
};

export const revokeWatch = async (id: number, actorId: number, reason: string) => {
  const [r] = await q<any>(`SELECT * FROM AnalyticsWatch WHERE id = ?`, [id]);
  if (!r) throw new Error("Watch not found");
  const w = parse(r);
  if (w.status !== "active") return w;
  await endWatch(w, "revoked", actorId, reason.slice(0, 2000));
  await refreshWatches(true);
  return { ...w, status: "revoked" as const };
};

/** Nightly: expire watches past their end date, telling the person. */
export const expireWatches = async () => {
  const rows = await q<any>(`SELECT * FROM AnalyticsWatch WHERE status = 'active' AND expires_at <= ?`, [new Date(clock.now())]);
  for (const r of rows) await endWatch(parse(r), "expired", null, null);
  if (rows.length) await refreshWatches(true);
  return rows.length;
};

export const listWatches = async (filter: { status?: string; userId?: number } = {}) => {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status) {
    where.push("w.status = ?");
    params.push(filter.status);
  }
  if (filter.userId) {
    where.push("w.target_user_id = ?");
    params.push(filter.userId);
  }
  const rows = await q<any>(
    `SELECT w.*, CONCAT_WS(' ', tp.first_name, tp.last_name) AS target_name, tp.user_type AS target_type,
            CONCAT_WS(' ', cp.first_name, cp.last_name) AS created_by_name,
            (SELECT COUNT(*) FROM AnalyticsAlert a WHERE a.watch_id = w.id) AS alerts
       FROM AnalyticsWatch w
       LEFT JOIN UserProfile tp ON tp.user_id = w.target_user_id
       LEFT JOIN UserProfile cp ON cp.user_id = w.created_by
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY (w.status = 'active') DESC, w.starts_at DESC LIMIT 500`,
    params,
  );
  return rows.map((r) => ({
    ...parse(r),
    target_name: r.target_name,
    target_type: r.target_type,
    target_visitor_code: r.target_device_id ? visitorCode(r.target_device_id) : null,
    created_by_name: r.created_by_name,
    alerts: Number(r.alerts),
  }));
};

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
const lastFired = new Map<string, number>();
const COOLDOWN_MS = 10 * 60_000;

export interface AlertInput {
  watch?: WatchRow | null;
  rule: string;
  severity: "info" | "warning" | "critical";
  title: string;
  targetUserId?: number | null;
  targetDeviceId?: string | null;
  ip?: string | null;
  payload?: Record<string, unknown>;
  recipients: number[];
  dedupeKey: string;
}

export const fireAlert = async (a: AlertInput) => {
  const now = clock.now();
  const last = lastFired.get(a.dedupeKey);
  if (last && now - last < COOLDOWN_MS) return null;
  lastFired.set(a.dedupeKey, now);
  if (lastFired.size > 20_000) for (const [k, t] of lastFired) if (now - t > COOLDOWN_MS) lastFired.delete(k);
  const res = await exec(
    `INSERT INTO AnalyticsAlert (watch_id, rule, severity, title, target_user_id, target_device_id, ip, fired_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
    [a.watch?.id ?? null, a.rule, a.severity, a.title.slice(0, 255), a.targetUserId ?? null, a.targetDeviceId ?? null, ipToBuffer(a.ip ?? null), new Date(now), JSON.stringify(a.payload ?? {})],
  );
  const id = res.insertId;
  const push = !a.watch || a.watch.channels.includes("push");
  const delivered: Record<string, string[]> = {};
  for (const uid of [...new Set(a.recipients)]) {
    delivered[uid] = await notifyPerson({
      userId: uid,
      kind: "monitor_alert",
      title: a.title,
      body: describe(a),
      link: a.targetUserId ? `/analytics/users/${a.targetUserId}` : a.targetDeviceId ? `/analytics/visitors/${a.targetDeviceId}` : a.ip ? `/analytics/ip/${a.ip}` : "/analytics/watchlist",
      subjectType: "alert",
      subjectId: id,
      push,
    });
  }
  await exec(`UPDATE AnalyticsAlert SET delivered = CAST(? AS JSON) WHERE id = ?`, [JSON.stringify(delivered), id]);
  // Same who / where as every other live event, so the console can say whose alert it is.
  if (a.targetUserId) await loadUsers([a.targetUserId]).catch(() => undefined);
  const who = cachedUser(a.targetUserId);
  const geo = lookupGeo(a.ip ?? null);
  activityBus.emitSignal({
    type: "live_event",
    event: {
      at: new Date(now).toISOString(),
      kind: "alert",
      app: (a.payload?.app as string) ?? "mis",
      user_id: a.targetUserId ?? null,
      user_name: who?.name ?? null,
      user_type: who?.userType ?? null,
      device_id: a.targetDeviceId ?? null,
      visitor_code: a.targetDeviceId ? visitorCode(a.targetDeviceId) : null,
      ip: a.ip ?? null,
      place: [geo.city, geo.country_code].filter(Boolean).join(", ") || null,
      isp: geo.isp,
      detail: { title: a.title, severity: a.severity, rule: a.rule, alert_id: id },
    },
  });
  return id;
};

const describe = (a: AlertInput) => {
  const p = a.payload ?? {};
  const bits = [p.app ? `in ${p.app}` : null, p.feature ? `on ${p.feature}` : null, a.ip ? `from ${a.ip}` : null, p.place ? `(≈ ${p.place})` : null].filter(Boolean);
  return bits.join(" ") || "See Usage & Monitoring.";
};

export const listAlerts = async (opts: { unacked?: boolean; limit?: number } = {}) => {
  const rows = await q<any>(
    `SELECT a.*, CONCAT_WS(' ', p.first_name, p.last_name) AS target_name, CONCAT_WS(' ', k.first_name, k.last_name) AS ack_by_name
       FROM AnalyticsAlert a
       LEFT JOIN UserProfile p ON p.user_id = a.target_user_id
       LEFT JOIN UserProfile k ON k.user_id = a.ack_by
      ${opts.unacked ? "WHERE a.ack_at IS NULL" : ""}
      ORDER BY a.fired_at DESC LIMIT ?`,
    [Math.min(500, opts.limit ?? 200)],
  );
  return rows.map((r) => ({
    ...r,
    ip: ipToString(r.ip),
    payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
    delivered: typeof r.delivered === "string" ? JSON.parse(r.delivered) : r.delivered,
    target_visitor_code: r.target_device_id ? visitorCode(r.target_device_id) : null,
  }));
};

export const ackAlert = async (id: number, actorId: number) =>
  exec(`UPDATE AnalyticsAlert SET ack_by = ?, ack_at = ? WHERE id = ? AND ack_at IS NULL`, [actorId, new Date(clock.now()), id]);

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------
const failures = new Map<string, number[]>(); // key → failure timestamps
const noteFailure = (key: string, at: number, windowMs: number) => {
  const list = (failures.get(key) ?? []).filter((t) => at - t < windowMs);
  list.push(at);
  failures.set(key, list);
  if (failures.size > 50_000) failures.delete(failures.keys().next().value as string);
  return list.length;
};
const usernamesByIp = new Map<string, Map<string, number>>();

const inOffHours = async (at: number, rule: Rule) => {
  const s = await getSettings();
  const from = rule.from ?? s.school_hours.from;
  const to = rule.to ?? s.school_hours.to;
  const local = new Date(at + TZ_OFFSET_MS);
  const hm = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  const dow = local.getUTCDay();
  const schoolDay = s.school_hours.days.includes(dow);
  return !schoolDay || hm < from || hm >= to;
};

const matchesTarget = (w: WatchRow, userId: number | null, deviceId: string | null, ip: string | null) => {
  if (w.target_kind === "user") return !!userId && w.target_user_id === userId;
  if (w.target_kind === "device") return !!deviceId && w.target_device_id === deviceId;
  const c = parseCidr(w.target_cidr ?? "");
  return !!c && cidrContains(c, ipToBuffer(ip));
};

const watchTitle = async (w: WatchRow, what: string) => {
  const who =
    w.target_kind === "user" && w.target_user_id
      ? cachedUser(w.target_user_id)?.name ?? (await nameOf(w.target_user_id))
      : w.target_kind === "device"
        ? `Visitor ${visitorCode(w.target_device_id ?? "")}`
        : `IP ${w.target_cidr}`;
  return `${who} ${what}`;
};

export const handleSignal = async (s: ActivitySignal) => {
  if (s.type === "live_event") return;
  await refreshWatches();
  const now = "at" in s ? s.at : clock.now();
  const userId = "userId" in s ? s.userId : null;
  const deviceId = "deviceId" in s ? s.deviceId : null;
  const ip = "ip" in s ? (s.ip as string | null) : null;

  for (const w of active) {
    if (new Date(w.expires_at).getTime() < now) continue;
    if (!matchesTarget(w, userId, deviceId, ip)) continue;
    for (const rule of w.rules) {
      const key = `${w.id}:${rule.type}:${rule.app ?? ""}:${rule.feature ?? ""}:${rule.name ?? ""}`;
      const fire = async (what: string, payload: Record<string, unknown> = {}, severity: "info" | "warning" = "info") =>
        fireAlert({ watch: w, rule: rule.type, severity, title: await watchTitle(w, what), targetUserId: userId, targetDeviceId: deviceId, ip, payload, recipients: [w.created_by], dedupeKey: key });
      switch (rule.type) {
        case "comes_online":
          if (s.type === "presence" && s.from === "offline" && (s.to === "active" || s.to === "idle")) await fire("came online");
          break;
        case "ip_activity":
          if (s.type === "presence" && s.from === "offline" && s.to !== "offline") await fire("is active", { key: s.key });
          if (s.type === "session_start") await fire("started a visit", { app: s.app });
          break;
        case "opens_app":
          if (s.type === "page_view" && s.firstInSessionForApp && (!rule.app || rule.app === s.app)) await fire(`opened ${s.app}`, { app: s.app, feature: s.feature });
          break;
        case "opens_feature":
          if (s.type === "page_view" && rule.feature && s.feature === rule.feature) await fire(`opened ${rule.feature}`, { app: s.app, feature: s.feature });
          break;
        case "key_event":
          if (s.type === "key_event" && (!rule.name || rule.name === s.name)) await fire(`did ${s.name}`, { app: s.app, name: s.name });
          break;
        case "login_failed":
          if (s.type === "auth" && s.outcome === "failure") {
            const n = noteFailure(`w${w.id}`, now, (rule.window_min ?? 15) * 60_000);
            if (n >= (rule.n ?? 3)) await fire(`had ${n} failed sign-ins`, { reason: s.reason }, "warning");
          }
          break;
        case "new_device":
          if (s.type === "session_start" && s.isNewDevice) await fire("signed in from a new device", { app: s.app }, "warning");
          break;
        case "new_ip":
          if (s.type === "session_start" && s.isNewIpForUser) await fire(`connected from a new IP (${s.ip})`, { app: s.app, place: s.country, isp: s.isp });
          break;
        case "new_country":
          if (s.type === "session_start" && s.country && userId && s.isNewIpForUser) {
            // A new IP can still be in a known country: check their history before this session.
            const seen = await q<any>(
              `SELECT 1 FROM AnalyticsUserIp ui JOIN AnalyticsIp i ON i.ip = ui.ip JOIN AnalyticsGeo g ON g.geo_id = i.geo_id
                WHERE ui.user_id = ? AND g.country_code = ? AND ui.first_seen < ? LIMIT 1`,
              [userId, s.country, new Date(now - 60_000)],
            );
            if (!seen.length) await fire(`connected from a new country (${s.country})`, { place: s.country, isp: s.isp }, "warning");
          }
          break;
        case "off_hours":
          if ((s.type === "session_start" || (s.type === "presence" && s.from === "offline")) && (await inOffHours(now, rule))) await fire("is active outside school hours");
          break;
        case "concurrent_sessions":
          if (s.type === "presence" && userId) {
            const p = personByKey(`u:${userId}`);
            const devices = p ? new Set([...p.tabs.values()].map((t) => t.deviceId)).size : 0;
            if (devices >= (rule.n ?? 2)) await fire(`is online on ${devices} devices at once`, {}, "warning");
          }
          break;
      }
    }
  }

  // ---- platform-wide security alerts (no watch needed) ----------------------------
  if (s.type === "auth" && s.outcome === "failure") {
    const recipients = await securityRecipients();
    if (!recipients.length) return;
    if (s.usernameAttempted) {
      const n = noteFailure(`u:${s.usernameAttempted.toLowerCase()}`, now, 15 * 60_000);
      if (n >= 10)
        await fireAlert({ rule: "brute_force", severity: "critical", title: `${n} failed sign-ins for “${s.usernameAttempted}” in 15 minutes`, targetUserId: s.userId, targetDeviceId: s.deviceId, ip: s.ip, payload: { username: s.usernameAttempted }, recipients, dedupeKey: `bf:${s.usernameAttempted.toLowerCase()}` });
      if (s.ip) {
        const m = usernamesByIp.get(s.ip) ?? new Map<string, number>();
        m.set(s.usernameAttempted.toLowerCase(), now);
        for (const [k, t] of m) if (now - t > 15 * 60_000) m.delete(k);
        usernamesByIp.set(s.ip, m);
        if (usernamesByIp.size > 20_000) usernamesByIp.delete(usernamesByIp.keys().next().value as string);
        if (m.size >= 5)
          await fireAlert({ rule: "credential_stuffing", severity: "critical", title: `${m.size} different usernames tried from ${s.ip} in 15 minutes`, targetDeviceId: s.deviceId, ip: s.ip, payload: { usernames: m.size }, recipients, dedupeKey: `cs:${s.ip}` });
      }
    }
    if (s.reason === "inactive" && s.userId)
      await fireAlert({ rule: "suspended_login", severity: "warning", title: `Sign-in attempt on a suspended or inactive account`, targetUserId: s.userId, targetDeviceId: s.deviceId, ip: s.ip, recipients, dedupeKey: `sl:${s.userId}` });
  }
  if (s.type === "session_start" && s.userId && (s.isNewDevice || s.isNewIpForUser)) {
    // An administrator signing in from somewhere new is worth a look.
    const admins = await adminIds();
    if (admins.includes(s.userId)) {
      const recipients = (await securityRecipients()).filter((r) => r !== s.userId);
      if (recipients.length)
        await fireAlert({
          rule: "admin_new_device",
          severity: "warning",
          title: `${cachedUser(s.userId)?.name ?? "An administrator"} signed in from a new ${s.isNewDevice ? "device" : "IP address"}`,
          targetUserId: s.userId,
          targetDeviceId: s.deviceId,
          ip: s.ip,
          payload: { place: s.country, isp: s.isp },
          recipients,
          dedupeKey: `an:${s.userId}:${s.deviceId}:${s.ip}`,
        });
    }
  }
};

let recipientsCache: { at: number; ids: number[] } | null = null;
const securityRecipients = async () => {
  if (recipientsCache && clock.now() - recipientsCache.at < 5 * 60_000) return recipientsCache.ids;
  const ids = await holdersOf("ANALYTICS_CONFIGURE").catch(() => []);
  recipientsCache = { at: clock.now(), ids };
  return ids;
};
let adminCache: { at: number; ids: number[] } | null = null;
const adminIds = async () => {
  if (adminCache && clock.now() - adminCache.at < 5 * 60_000) return adminCache.ids;
  const rows = await q<any>(`SELECT user_id FROM UserProfile WHERE user_type = 'ADMIN'`).catch(() => []);
  adminCache = { at: clock.now(), ids: rows.map((r) => Number(r.user_id)) };
  return adminCache.ids;
};

export const resetWatchState = () => {
  lastFired.clear();
  failures.clear();
  usernamesByIp.clear();
  recipientsCache = null;
  adminCache = null;
  loadedAt = 0;
};

/** Subscribe the matcher to the activity bus (once per process). */
let started = false;
export const startWatchMatcher = () => {
  if (started) return;
  started = true;
  activityBus.on("signal", (s: ActivitySignal) => {
    void handleSignal(s).catch((error) => logger.error("[activity] watch matcher failed", { error: error?.message ?? error }));
  });
};

