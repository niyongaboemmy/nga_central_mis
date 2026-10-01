import { AppKey, APPS } from "./apps";
import { GeoInfo } from "./geoip";
import { activityBus, clock } from "./runtime";
import { cachedSettings } from "./settings";
import { visitorCode } from "./tokens";
import { cachedUser } from "./people";

/**
 * Who is online right now, across every app (plan §9.4). It lives in memory in the
 * single MIS process, following the same design as services/elearning/livePresence.ts.
 *
 * A person is a signed-in user ("u:<id>") or a public visitor device ("d:<did>"), and
 * each has one entry per open browser tab. Tab status:
 *   active      visible, recent input, beat within offline_after_s
 *   idle        visible, no input for idle_after_s (the SDK reports it), beat current
 *   background  last beat said "hidden", within background_ttl_s; hidden tabs are
 *               throttled, so no beats are expected
 *   offline     anything else; the tab is dropped
 * A person takes the best status of their tabs. "Online" = active or idle.
 */
export type TabStatus = "active" | "idle" | "background";
const RANK: Record<TabStatus, number> = { active: 3, idle: 2, background: 1 };

export interface DeviceSummary {
  browser: string | null;
  os: string | null;
  type: string;
}

export interface Tab {
  tabKey: string;
  app: AppKey;
  deviceId: string;
  route: string | null;
  feature: string | null;
  title: string | null;
  vis: "visible" | "hidden";
  idle: boolean;
  standalone: boolean;
  net: string | null;
  ip: string | null;
  geo: GeoInfo | null;
  network: string | null;
  device: DeviceSummary;
  since: number;
  lastBeat: number;
  sessionId: number | null;
  clientAt: number;
}

export interface Person {
  key: string;
  userId: number | null;
  deviceId: string;
  since: number;
  tabs: Map<string, Tab>;
  status: TabStatus | "offline";
}

const people = new Map<string, Person>();
const dirty = new Set<string>();
const removed = new Set<string>();

// ---------------------------------------------------------------------------
// Per-minute history for the "last 30 minutes" chart.
// ---------------------------------------------------------------------------
type MinuteBucket = Map<AppKey, { users: Set<string>; visitors: Set<string> }>;
const minutes = new Map<number, MinuteBucket>();
const minuteOf = (ms: number) => Math.floor(ms / 60_000);

export const noteMinute = (app: AppKey, key: string, at: number) => {
  const m = minuteOf(at);
  if (m < minuteOf(clock.now()) - 30) return;
  let b = minutes.get(m);
  if (!b) {
    b = new Map();
    minutes.set(m, b);
    for (const k of [...minutes.keys()]) if (k < m - 31) minutes.delete(k);
  }
  let a = b.get(app);
  if (!a) {
    a = { users: new Set(), visitors: new Set() };
    b.set(app, a);
  }
  (key.startsWith("u:") ? a.users : a.visitors).add(key);
};

/** Seed the history from the database after a restart, so the chart isn't empty. */
export const seedMinutes = (rows: { minute: number; app: AppKey; key: string }[]) => {
  for (const r of rows) noteMinute(r.app, r.key, r.minute * 60_000);
};

export const minuteSeries = (apps?: AppKey[]) => {
  const now = minuteOf(clock.now());
  const out: { minute: string; total: number; users: number; visitors: number; by_app: Record<string, number> }[] = [];
  for (let m = now - 29; m <= now; m++) {
    const b = minutes.get(m);
    const users = new Set<string>();
    const visitors = new Set<string>();
    const byApp: Record<string, number> = {};
    for (const app of APPS) {
      if (apps && !apps.includes(app)) continue;
      const a = b?.get(app);
      byApp[app] = a ? a.users.size + a.visitors.size : 0;
      a?.users.forEach((k) => users.add(k));
      a?.visitors.forEach((k) => visitors.add(k));
    }
    out.push({ minute: new Date(m * 60_000).toISOString(), total: users.size + visitors.size, users: users.size, visitors: visitors.size, by_app: byApp });
  }
  return out;
};

/** Distinct people with any activity in the last N minutes (GA's "last 5 minutes"). */
export const activeInLast = (mins: number, apps?: AppKey[]) => {
  const now = minuteOf(clock.now());
  const keys = new Set<string>();
  for (let m = now - mins + 1; m <= now; m++)
    minutes.get(m)?.forEach((a, app) => {
      if (apps && !apps.includes(app)) return;
      a.users.forEach((k) => keys.add(k));
      a.visitors.forEach((k) => keys.add(k));
    });
  return keys.size;
};

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------
export interface BeatInput {
  app: AppKey;
  userId: number | null;
  deviceId: string;
  tab: string;
  vis: "visible" | "hidden" | "gone";
  idle?: boolean;
  route?: string | null;
  feature?: string | null;
  title?: string | null;
  standalone?: boolean;
  net?: string | null;
  ip: string | null;
  geo: GeoInfo | null;
  network: string | null;
  device: DeviceSummary;
  sessionId: number | null;
  at: number;
  /** The browser's send time. Beats from one tab can arrive out of order (an unload
   *  sends "hidden" and "gone" a millisecond apart), so order is decided by this. */
  clientAt?: number;
}

/** Tabs that said "gone": a late beat sent BEFORE the goodbye must not resurrect them. */
const gone = new Map<string, number>();
const GONE_TTL_MS = 5 * 60_000;

export const personKey = (userId: number | null, deviceId: string) => (userId ? `u:${userId}` : `d:${deviceId}`);

const statusOfTab = (t: Tab, now: number): TabStatus | null => {
  const s = cachedSettings();
  if (t.vis === "hidden") return now - t.lastBeat <= s.background_ttl_s * 1000 ? "background" : null;
  if (now - t.lastBeat > s.offline_after_s * 1000) return null;
  return t.idle ? "idle" : "active";
};

const recompute = (p: Person, now: number) => {
  let best: TabStatus | null = null;
  for (const [k, t] of p.tabs) {
    const st = statusOfTab(t, now);
    if (!st) {
      p.tabs.delete(k);
      continue;
    }
    if (!best || RANK[st] > RANK[best]) best = st;
  }
  const before = p.status;
  p.status = best ?? "offline";
  if (before !== p.status) {
    dirty.add(p.key);
    activityBus.emitSignal({
      type: "presence",
      key: p.key,
      userId: p.userId,
      deviceId: p.deviceId,
      from: before,
      to: p.status,
      at: now,
      ip: [...p.tabs.values()][0]?.ip ?? null,
    });
  }
  if (p.status === "offline") {
    people.delete(p.key);
    dirty.delete(p.key);
    removed.add(p.key);
  }
};

export const beat = (b: BeatInput) => {
  const key = personKey(b.userId, b.deviceId);
  // A device that signs in stops being a visitor, so drop its visitor entry.
  if (b.userId) {
    const v = people.get(`d:${b.deviceId}`);
    if (v) {
      people.delete(v.key);
      removed.add(v.key);
    }
  }
  const tabKey = `${b.deviceId}:${b.tab}`;
  const clientAt = b.clientAt ?? b.at;
  let p = people.get(key);
  if (b.vis === "gone") {
    gone.set(tabKey, clientAt);
    if (gone.size > 20_000) for (const [k, t] of gone) if (t < clientAt - GONE_TTL_MS) gone.delete(k);
    if (p) {
      p.tabs.delete(tabKey);
      recompute(p, b.at);
    }
    return;
  }
  const goneAt = gone.get(tabKey);
  if (goneAt !== undefined) {
    // Only a newer VISIBLE beat brings a tab back (bfcache restore, reload). A "hidden"
    // beat after goodbye is the unload's own visibilitychange, in whatever order it came.
    if (clientAt <= goneAt || b.vis !== "visible") return;
    gone.delete(tabKey);
  }
  const existing = p?.tabs.get(tabKey);
  if (existing && clientAt < existing.clientAt) return; // stale, out-of-order beat
  if (!p) {
    p = { key, userId: b.userId, deviceId: b.deviceId, since: b.at, tabs: new Map(), status: "offline" };
    people.set(key, p);
    removed.delete(key);
  }
  const prev = p.tabs.get(tabKey);
  const t: Tab = {
    tabKey,
    app: b.app,
    deviceId: b.deviceId,
    route: b.route ?? prev?.route ?? null,
    feature: b.feature ?? prev?.feature ?? null,
    title: b.title ?? prev?.title ?? null,
    vis: b.vis,
    idle: !!b.idle,
    standalone: b.standalone ?? prev?.standalone ?? false,
    net: b.net ?? prev?.net ?? null,
    ip: b.ip ?? prev?.ip ?? null,
    geo: b.geo ?? prev?.geo ?? null,
    network: b.network ?? prev?.network ?? null,
    device: b.device,
    since: prev && prev.app === b.app ? prev.since : b.at,
    lastBeat: Math.max(prev?.lastBeat ?? 0, b.at),
    sessionId: b.sessionId ?? prev?.sessionId ?? null,
    clientAt: Math.max(clientAt, prev?.clientAt ?? 0),
  };
  if (prev && (prev.route !== t.route || prev.feature !== t.feature || prev.vis !== t.vis || prev.idle !== t.idle || prev.app !== t.app))
    dirty.add(key);
  if (!prev) dirty.add(key);
  p.tabs.set(tabKey, t);
  p.deviceId = b.deviceId;
  if (b.vis === "visible") noteMinute(b.app, key, b.at);
  recompute(p, clock.now());
};

/** Sign-out everywhere / suspension: the person disappears at once. */
export const dropUser = (userId: number) => {
  const p = people.get(`u:${userId}`);
  if (!p) return;
  p.tabs.clear();
  recompute(p, clock.now());
};

export const dropDevice = (deviceId: string) => {
  for (const p of [...people.values()]) {
    let changed = false;
    for (const [k, t] of p.tabs) if (t.deviceId === deviceId) {
      p.tabs.delete(k);
      changed = true;
    }
    if (changed) recompute(p, clock.now());
  }
};

export const sweepPresence = () => {
  const now = clock.now();
  for (const p of [...people.values()]) recompute(p, now);
};

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
export interface PersonView {
  key: string;
  user: { id: number; name: string; type: string | null } | null;
  visitor: { code: string; device_id: string } | null;
  status: TabStatus | "offline";
  since: string;
  last_beat: string;
  tabs: {
    app: AppKey;
    feature: string | null;
    route: string | null;
    title: string | null;
    status: TabStatus;
    standalone: boolean;
    device: DeviceSummary;
    ip: string | null;
    geo: { country_code: string | null; country: string | null; region: string | null; city: string | null; isp: string | null; conn_type: string; lat: number | null; lon: number | null } | null;
    network: string | null;
    since: string;
  }[];
}

export const viewPerson = (p: Person, now = clock.now()): PersonView => {
  const u = cachedUser(p.userId);
  const tabs = [...p.tabs.values()]
    .map((t) => ({ t, st: statusOfTab(t, now) }))
    .filter((x): x is { t: Tab; st: TabStatus } => !!x.st)
    .sort((a, b) => RANK[b.st] - RANK[a.st] || b.t.lastBeat - a.t.lastBeat);
  return {
    key: p.key,
    user: p.userId ? { id: p.userId, name: u?.name ?? `User ${p.userId}`, type: u?.userType ?? null } : null,
    visitor: p.userId ? null : { code: visitorCode(p.deviceId), device_id: p.deviceId },
    status: p.status,
    since: new Date(p.since).toISOString(),
    last_beat: new Date(Math.max(0, ...tabs.map((x) => x.t.lastBeat))).toISOString(),
    tabs: tabs.map(({ t, st }) => ({
      app: t.app,
      feature: t.feature,
      route: t.route,
      title: t.title,
      status: st,
      standalone: t.standalone,
      device: t.device,
      ip: t.ip,
      geo: t.geo
        ? { country_code: t.geo.country_code, country: t.geo.country, region: t.geo.region, city: t.geo.city, isp: t.geo.isp, conn_type: t.geo.conn_type, lat: t.geo.lat, lon: t.geo.lon }
        : null,
      network: t.network,
      since: new Date(t.since).toISOString(),
    })),
  };
};

export interface PresenceFilter {
  apps?: AppKey[];
  audience?: "user" | "visitor" | "both";
  userTypes?: string[];
  feature?: string;
}

const matches = (p: Person, f: PresenceFilter) => {
  if (f.audience === "user" && !p.userId) return false;
  if (f.audience === "visitor" && p.userId) return false;
  const tabs = [...p.tabs.values()];
  if (f.apps?.length && !tabs.some((t) => f.apps!.includes(t.app))) return false;
  if (f.feature && !tabs.some((t) => t.feature === f.feature)) return false;
  if (f.userTypes?.length) {
    const ut = cachedUser(p.userId)?.userType;
    if (!ut || !f.userTypes.includes(ut)) return false;
  }
  return true;
};

export const listPeople = (f: PresenceFilter = {}) =>
  [...people.values()].filter((p) => p.status !== "offline" && matches(p, f)).map((p) => viewPerson(p));

export const presenceCounts = (f: PresenceFilter = {}) => {
  const c = { active: 0, idle: 0, background: 0, online: 0, users: 0, visitors: 0, by_app: {} as Record<string, number>, by_type: {} as Record<string, number> };
  for (const app of APPS) c.by_app[app] = 0;
  for (const p of people.values()) {
    if (p.status === "offline" || !matches(p, f)) continue;
    c[p.status]++;
    if (p.status !== "background") {
      c.online++;
      if (p.userId) c.users++;
      else c.visitors++;
      const ut = p.userId ? cachedUser(p.userId)?.userType ?? "UNKNOWN" : "VISITOR";
      c.by_type[ut] = (c.by_type[ut] ?? 0) + 1;
    }
    const appsSeen = new Set([...p.tabs.values()].map((t) => t.app));
    for (const a of appsSeen) if (!f.apps?.length || f.apps.includes(a)) c.by_app[a] = (c.by_app[a] ?? 0) + 1;
  }
  return c;
};

/** Top features open right now (by people, not tabs). */
export const topFeaturesNow = (f: PresenceFilter = {}, limit = 10) => {
  const counts = new Map<string, { app: AppKey; feature: string; people: Set<string> }>();
  for (const p of people.values()) {
    if (p.status === "offline" || !matches(p, f)) continue;
    for (const t of p.tabs.values()) {
      if (!t.feature || t.vis !== "visible") continue;
      if (f.apps?.length && !f.apps.includes(t.app)) continue;
      const k = `${t.app}|${t.feature}`;
      let e = counts.get(k);
      if (!e) counts.set(k, (e = { app: t.app, feature: t.feature, people: new Set() }));
      e.people.add(p.key);
    }
  }
  return [...counts.values()]
    .map((e) => ({ app: e.app, feature: e.feature, people: e.people.size }))
    .sort((a, b) => b.people - a.people)
    .slice(0, limit);
};

export const personByKey = (key: string) => people.get(key) ?? null;
export const isOnline = (userId: number) => {
  const p = people.get(`u:${userId}`);
  return !!p && p.status !== "offline";
};

/** Pending diffs since the last call: changed people (views) and removed keys. */
export const takeDiffs = () => {
  const upsert = [...dirty].map((k) => people.get(k)).filter(Boolean).map((p) => viewPerson(p!));
  const remove = [...removed];
  dirty.clear();
  removed.clear();
  return { upsert, remove };
};

export const resetPresence = () => {
  people.clear();
  gone.clear();
  dirty.clear();
  removed.clear();
  minutes.clear();
};
