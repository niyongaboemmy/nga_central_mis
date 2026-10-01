import { APP_BIT, APP_CODE, AppKey, APP_BY_CODE } from "./apps";
import { q } from "./db";
import { clock } from "./runtime";
import { cachedSettings } from "./settings";
import { queueSession, SessionRow } from "./writer";

/**
 * Sessions are built on the server, keyed by device (plan §9.1), with GA4's rules:
 *   - a new session starts after `session_timeout_min` without activity;
 *   - there is no midnight split, and no split on a campaign change;
 *   - a session is engaged when it has ≥ engaged_seconds of engagement, ≥ 2 page views
 *     or a key event.
 * Additions for a platform of known users:
 *   - because the device cookie is shared by all four apps, one session can span apps
 *     (app_path "mis>tm>tupo");
 *   - a visitor who signs in is stitched: the session continues under the user;
 *   - a DIFFERENT user on the same device (shared lab PC) starts a new session.
 *
 * Session ids are allocated in-process (ms × 1024 + counter), so no insert round-trip
 * is needed before events can reference them. Ids keep increasing across restarts
 * because they are time-based.
 */
export interface OpenSession extends SessionRow {
  appPath: AppKey[];
  lastActivityMs: number;
  startedMs: number;
  engagedNotified: boolean;
}

const open = new Map<string, OpenSession>();
let counter = 0;
let lastMs = 0;
const nextId = () => {
  const now = Date.now();
  if (now !== lastMs) {
    lastMs = now;
    counter = 0;
  }
  counter = (counter + 1) % 1024;
  return now * 1024 + counter;
};

export interface TouchInput {
  deviceId: string;
  userId: number | null;
  app: AppKey;
  at: number;
  kind: "event" | "beat";
  name?: string;
  route?: string | null;
  isPageView?: boolean;
  engagementMs?: number;
  isKeyEvent?: boolean;
  visible?: boolean;
  idle?: boolean;
  ip: Buffer | null;
  geoId: number | null;
  network: string | null;
  uaId: number | null;
  userType: string | null;
  isBot: boolean;
  entry?: { kind: SessionRow["entry_kind"]; referrer_host?: string | null; utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null };
}

export interface TouchResult {
  session: OpenSession | null;
  started: boolean;
  stitched: boolean;
  appChanged: boolean;
}

const timeoutMs = () => cachedSettings().session_timeout_min * 60_000;

const close = (s: OpenSession) => {
  s.ended_at = new Date(s.lastActivityMs);
  queueSession(toRow(s));
  open.delete(s.device_id);
};

const toRow = (s: OpenSession): SessionRow => {
  const { appPath, lastActivityMs, startedMs, engagedNotified, ...row } = s;
  return { ...row, app_path: appPath.join(">").slice(0, 100), last_activity_at: new Date(lastActivityMs) };
};

/**
 * Late events (an offline queue flushed hours later, or a backdated relay batch) belong
 * to a session of their own time, not to whatever session is open now. They get their
 * own session chain per device, timed out like any other.
 */
const late = new Map<string, OpenSession>();

export const touchSession = (t: TouchInput): TouchResult => {
  const current = open.get(t.deviceId) ?? null;
  if (current && t.kind === "event" && t.at < current.startedMs - timeoutMs()) return touchLate(t);
  let s = current;
  const res: TouchResult = { session: null, started: false, stitched: false, appChanged: false };

  if (s && (t.at - s.lastActivityMs > timeoutMs() || (t.userId && s.user_id && t.userId !== s.user_id))) {
    close(s);
    s = null;
  }
  return applyTouch(t, s, open, res);
};

const touchLate = (t: TouchInput): TouchResult => {
  let s = late.get(t.deviceId) ?? null;
  const res: TouchResult = { session: null, started: false, stitched: false, appChanged: false };
  if (s && (Math.abs(t.at - s.lastActivityMs) > timeoutMs() || (t.userId && s.user_id && t.userId !== s.user_id))) {
    closeIn(s, late);
    s = null;
  }
  return applyTouch(t, s, late, res);
};

const closeIn = (s: OpenSession, map: Map<string, OpenSession>) => {
  s.ended_at = new Date(s.lastActivityMs);
  queueSession(toRow(s));
  map.delete(s.device_id);
};

const applyTouch = (t: TouchInput, s: OpenSession | null, map: Map<string, OpenSession>, res: TouchResult): TouchResult => {

  if (!s) {
    // A beat alone never opens a session (an idle open tab is not a visit).
    if (t.kind === "beat") return res;
    const id = nextId();
    s = {
      session_id: id,
      device_id: t.deviceId,
      user_id: t.userId,
      stitched_at: null,
      started_at: new Date(t.at),
      last_activity_at: new Date(t.at),
      ended_at: null,
      entry_app: APP_CODE[t.app],
      entry_route: t.route ?? null,
      entry_kind: t.entry?.kind ?? "direct",
      referrer_host: t.entry?.referrer_host ?? null,
      utm_source: t.entry?.utm_source ?? null,
      utm_medium: t.entry?.utm_medium ?? null,
      utm_campaign: t.entry?.utm_campaign ?? null,
      exit_app: APP_CODE[t.app],
      exit_route: t.route ?? null,
      apps_mask: APP_BIT[t.app],
      app_path: t.app,
      page_views: 0,
      events: 0,
      engagement_ms: 0,
      key_events: 0,
      is_engaged: 0,
      entry_ip: t.ip,
      last_ip: t.ip,
      geo_id: t.geoId,
      network_label: t.network,
      ua_id: t.uaId,
      user_type: t.userType,
      is_bot: t.isBot ? 1 : 0,
      appPath: [t.app],
      lastActivityMs: t.at,
      startedMs: t.at,
      engagedNotified: false,
    };
    map.set(t.deviceId, s);
    res.started = true;
  }

  if (t.userId && !s.user_id) {
    s.user_id = t.userId;
    s.stitched_at = new Date(t.at);
    s.user_type = t.userType ?? s.user_type;
    res.stitched = true;
  }

  if (t.kind === "beat") {
    // Only a visible, non-idle tab keeps a session alive.
    if (t.visible && !t.idle) s.lastActivityMs = Math.max(s.lastActivityMs, t.at);
  } else {
    s.lastActivityMs = Math.max(s.lastActivityMs, t.at);
    if (t.at < s.startedMs) {
      s.startedMs = t.at;
      s.started_at = new Date(t.at);
    }
    s.events++;
    if (t.isPageView) {
      s.page_views++;
      if (t.route) {
        s.exit_route = t.route;
        s.exit_app = APP_CODE[t.app];
      }
    }
    if (t.engagementMs) s.engagement_ms = Math.min(4_000_000_000, s.engagement_ms + t.engagementMs);
    if (t.isKeyEvent) s.key_events++;
    if (s.appPath[s.appPath.length - 1] !== t.app && s.appPath.length < 16) {
      s.appPath.push(t.app);
      res.appChanged = true;
    }
    s.apps_mask |= APP_BIT[t.app];
  }
  if (t.ip) s.last_ip = t.ip;
  if (t.geoId) s.geo_id = t.geoId;
  if (t.network) s.network_label = t.network;
  if (t.isBot) s.is_bot = 1;

  const engagedSec = cachedSettings().engaged_seconds;
  if (!s.is_engaged && (s.engagement_ms >= engagedSec * 1000 || s.page_views >= 2 || s.key_events > 0)) s.is_engaged = 1;

  queueSession(toRow(s));
  res.session = s;
  return res;
};

export const getOpenSession = (deviceId: string) => open.get(deviceId) ?? null;

/** End a device's session now (logout, "gone" beat with no other tab, sign-out everywhere). */
export const endSession = (deviceId: string) => {
  const s = open.get(deviceId);
  if (s) close(s);
};

export const endUserSessions = (userId: number) => {
  for (const s of [...open.values()]) if (s.user_id === userId) close(s);
  for (const s of [...late.values()]) if (s.user_id === userId) closeIn(s, late);
};

/** Close sessions that timed out. Runs every 60 s. */
export const sweepSessions = () => {
  const now = clock.now();
  const limit = timeoutMs();
  let closed = 0;
  for (const s of [...open.values()]) {
    if (now - s.lastActivityMs > limit) {
      close(s);
      closed++;
    }
  }
  // Late chains close as soon as nothing has been added to them for a minute.
  for (const s of [...late.values()]) {
    closeIn(s, late);
    closed++;
  }
  return closed;
};

/** After a restart, reload sessions that are still within the timeout. */
export const reloadOpenSessions = async () => {
  const rows = await q<any>(
    `SELECT * FROM AnalyticsSession WHERE ended_at IS NULL AND last_activity_at > ? LIMIT 20000`,
    [new Date(clock.now() - timeoutMs())],
  );
  for (const r of rows) {
    const path = String(r.app_path || APP_BY_CODE[r.entry_app]).split(">").filter(Boolean) as AppKey[];
    open.set(r.device_id, {
      ...r,
      session_id: Number(r.session_id),
      user_id: r.user_id === null ? null : Number(r.user_id),
      appPath: path,
      lastActivityMs: new Date(r.last_activity_at).getTime(),
      startedMs: new Date(r.started_at).getTime(),
      engagedNotified: !!r.is_engaged,
    });
  }
  // Sessions that went stale while we were down are closed in the database directly.
  await q(
    `UPDATE AnalyticsSession SET ended_at = last_activity_at WHERE ended_at IS NULL AND last_activity_at <= ?`,
    [new Date(clock.now() - timeoutMs())],
  );
  return rows.length;
};

export const openSessionCount = () => open.size;
export const resetSessions = () => {
  open.clear();
  late.clear();
};

