import { APP_CODE, AppKey } from "./apps";
import { checkBlocked } from "./blocklist";
import { isBot, scoreBot } from "./bot";
import { isKeyEvent, loadCatalog, normalizeFeature } from "./catalog";
import { exec } from "./db";
import { resolveGeo, resolveUa } from "./dims";
import { GeoInfo } from "./geoip";
import { cidrContains, ipToBuffer, normalizeIp } from "./ip";
import { cachedDevice, DeviceInfo, loadDevice, loadUsers, UserInfo } from "./people";
import * as presence from "./presence";
import { activityBus, clock } from "./runtime";
import { ANONYMOUS_EVENTS, ANONYMOUS_MAX_EVENTS, Envelope, sanitizeRoute, WireEvent } from "./schema";
import { touchSession } from "./sessionizer";
import { ActivitySettings, campusRanges, getSettings } from "./settings";
import { ulid } from "./tokens";
import { queueDevice, queueDeviceIp, queueEvent, queueIp, queueUserIp, queueUserState } from "./writer";

/**
 * The ingest pipeline (plan §5.3): validate → enrich → dedupe → sessionize →
 * presence → buffered write. Identity comes only from `ctx` (attested by the
 * route or the relay), never from the envelope.
 */
export interface IngestContext {
  app: AppKey;
  userId: number | null;
  ip: string | null;
  ua: string | null;
  receivedAt: number;
}

export interface IngestResult {
  accepted: number;
  rejected: number;
  duplicates: number;
  disabled?: boolean;
  blocked?: boolean;
  bot?: boolean;
  cmd?: { type: "end" } | null;
}

/** Placeholder device for server events with no browser behind them (22 chars like a real id). */
export const SERVER_DEVICE = "server0000000000000000";

export const FLAG = { debug: 1, key: 2, bot: 4, excluded: 8, server: 16 } as const;
const MAX_ENGAGEMENT_PER_EVENT = 30 * 60_000;
const BACKDATE_LIMIT = 72 * 3600_000;

// ---------------------------------------------------------------------------
// Dedupe: 48 h of event ids. The PK (event_id, occurred_at) catches what this misses.
// ---------------------------------------------------------------------------
const seen = new Map<string, number>();
const DEDUPE_TTL = 48 * 3600_000;
let lastPrune = 0;
const isDuplicate = (id: string, now: number) => {
  if (now - lastPrune > 60_000 || seen.size > 300_000) {
    lastPrune = now;
    for (const [k, exp] of seen) if (exp < now) seen.delete(k);
  }
  if (seen.has(id)) return true;
  seen.set(id, now + DEDUPE_TTL);
  return false;
};
export const resetDedupe = () => seen.clear();

/** Deterministic event time: a retry of the same event lands on the same instant. */
export const occurredAt = (t: number, sentAt: number, receivedAt: number) => {
  const skew = receivedAt - sentAt;
  const adj = Math.abs(skew) <= 120_000 ? 0 : Math.round(skew / 60_000) * 60_000;
  return Math.min(receivedAt, Math.max(receivedAt - BACKDATE_LIMIT, t + adj));
};

// ---------------------------------------------------------------------------
// Ingest health (Settings → ingest health)
// ---------------------------------------------------------------------------
export const ingestStats = {
  byAppMinute: new Map<string, number>(),
  rejected: 0,
  duplicates: 0,
  blocked: 0,
  lastEventAt: {} as Record<string, number>,
};
const noteHealth = (app: AppKey, n: number, now: number) => {
  const k = `${app}|${Math.floor(now / 60_000)}`;
  ingestStats.byAppMinute.set(k, (ingestStats.byAppMinute.get(k) ?? 0) + n);
  ingestStats.lastEventAt[app] = now;
  if (ingestStats.byAppMinute.size > 4 * 120) {
    const cutoff = Math.floor(now / 60_000) - 60;
    for (const key of ingestStats.byAppMinute.keys()) if (Number(key.split("|")[1]) < cutoff) ingestStats.byAppMinute.delete(key);
  }
};

// ---------------------------------------------------------------------------
// Pending commands for a user's / device's next sync (best-effort "sign out this device").
// ---------------------------------------------------------------------------
const commands = new Map<string, { type: "end"; until: number }>();
export const queueCommand = (target: { userId?: number; deviceId?: string }, ttlMs = 10 * 60_000) => {
  const until = clock.now() + ttlMs;
  if (target.userId) commands.set(`u:${target.userId}`, { type: "end", until });
  if (target.deviceId) commands.set(`d:${target.deviceId}`, { type: "end", until });
};
const takeCommand = (userId: number | null, deviceId: string) => {
  for (const k of [`d:${deviceId}`, userId ? `u:${userId}` : ""]) {
    const c = k && commands.get(k);
    if (c) {
      commands.delete(k);
      if (c.until > clock.now()) return { type: c.type };
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// Enrichment shared by browser batches and server events
// ---------------------------------------------------------------------------
interface Enriched {
  ip: string | null;
  ipBuf: Buffer | null;
  geo: GeoInfo;
  geoId: number | null;
  uaId: number | null;
  ua: Awaited<ReturnType<typeof resolveUa>>["parsed"];
  network: string | null;
}

const enrich = async (rawIp: string | null, ua: string | null, s: ActivitySettings): Promise<Enriched> => {
  const ip = normalizeIp(rawIp ?? "");
  const ipBuf = ipToBuffer(ip);
  const [{ id: geoId, geo }, { id: uaId, parsed }] = await Promise.all([resolveGeo(ip), resolveUa(ua)]);
  let network: string | null = null;
  if (ipBuf) for (const r of campusRanges(s)) if (cidrContains(r.m, ipBuf)) {
    network = r.label;
    break;
  }
  return { ip, ipBuf, geo, geoId, uaId, ua: parsed, network };
};

const preciseAllowed = (s: ActivitySettings, user: UserInfo | null) => {
  switch (s.precise_location) {
    case "everyone":
      return true;
    case "known_users":
      return !!user;
    case "staff":
      return !!user && ["TEACHER", "STAFF", "ADMIN"].includes(user.userType ?? "");
    default:
      return false;
  }
};

const entryFrom = (e: WireEvent | undefined, standalone: boolean) => {
  const p = (e?.p ?? {}) as Record<string, any>;
  const utm_source = typeof p.utm_source === "string" ? p.utm_source.slice(0, 100) : null;
  const referrer_host = typeof p.ref_host === "string" ? p.ref_host.slice(0, 191).toLowerCase() : null;
  let kind: "direct" | "sso_launch" | "pwa" | "push_click" | "referral" | "campaign" = "direct";
  if (p.entry === "sso" || (e?.r ?? "").startsWith("/sso/callback")) kind = "sso_launch";
  else if (p.entry === "push") kind = "push_click";
  else if (utm_source) kind = "campaign";
  else if (referrer_host) kind = "referral";
  else if (standalone) kind = "pwa";
  return {
    kind,
    referrer_host,
    utm_source,
    utm_medium: typeof p.utm_medium === "string" ? p.utm_medium.slice(0, 100) : null,
    utm_campaign: typeof p.utm_campaign === "string" ? p.utm_campaign.slice(0, 100) : null,
  };
};

const INPUT_EVENTS = new Set(["click", "scroll", "form_submit", "file_download"]);

// ---------------------------------------------------------------------------
// Browser batch
// ---------------------------------------------------------------------------
export const ingestEnvelope = async (env: Envelope, ctx: IngestContext): Promise<IngestResult> => {
  const res: IngestResult = { accepted: 0, rejected: 0, duplicates: 0, cmd: null };
  const s = await getSettings();
  if (!s.collect_enabled) return { ...res, disabled: true };

  const block = await checkBlocked(env.did, ctx.ip);
  if (block && !ctx.userId) {
    ingestStats.blocked++;
    return { ...res, blocked: true, rejected: env.events.length };
  }

  let events = [...env.events];
  if (!ctx.userId) {
    const allowed = events.filter((e) => ANONYMOUS_EVENTS.has(e.n)).slice(0, ANONYMOUS_MAX_EVENTS);
    res.rejected += events.length - allowed.length;
    events = allowed;
  }
  events.sort((a, b) => a.t - b.t);

  await loadCatalog();
  const now = clock.now();
  const e = await enrich(ctx.ip, ctx.ua, s);
  const user = ctx.userId ? (await loadUsers([ctx.userId])).get(ctx.userId) ?? null : null;
  if (ctx.userId && !user) return { ...res, rejected: env.events.length }; // unknown account
  const device = await loadDevice(env.did);
  const wasNewDevice = device.isNew;

  // Device ↔ account linking (visitor → user stitching, shared devices).
  if (ctx.userId) {
    if (!device.firstUserId) device.firstUserId = ctx.userId;
    device.lastUserId = ctx.userId;
    device.linkedUserIds.add(ctx.userId);
  }
  if (events.some((ev) => INPUT_EVENTS.has(ev.n) || (ev.n === "user_engagement" && Number(ev.p?.ms) > 0))) device.inputSeen = true;
  device.pageViews += events.filter((ev) => ev.n === "page_view").length;
  const score = scoreBot({ ua: e.ua, automation: env.env?.auto === 1, geo: e.geo, signedIn: !!ctx.userId, device });
  device.botScore = ctx.userId ? score : Math.max(device.botScore, score);
  const bot = isBot(device, s.bot_threshold);
  const excluded = !!user?.excluded;
  const standalone = !!(env.beat?.standalone ?? env.env?.standalone);

  const devSummary = { browser: e.ua.browser, os: e.ua.os, type: e.ua.device_type };
  const baseFlags = (bot ? FLAG.bot : 0) | (excluded ? FLAG.excluded : 0);
  let sessionsStarted = 0;
  let lastSessionId: number | null = null;
  const firstSeen: Record<string, string> = {};
  const firstPageView = events.find((ev) => ev.n === "page_view");

  for (const ev of events) {
    if (isDuplicate(ev.id, now)) {
      res.duplicates++;
      ingestStats.duplicates++;
      continue;
    }
    const at = occurredAt(ev.t, env.sent_at, ctx.receivedAt);
    const route = sanitizeRoute(ev.r);
    const feature = normalizeFeature(ctx.app, ev.f);
    const p: Record<string, any> = { ...(ev.p ?? {}) };
    let engagement = 0;
    if (ev.n === "user_engagement") engagement = Math.max(0, Math.min(MAX_ENGAGEMENT_PER_EVENT, Math.round(Number(p.ms) || 0)));

    if (ev.n === "location_fix") {
      const lat = Number(p.lat), lon = Number(p.lon);
      if (preciseAllowed(s, user) && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        device.preciseLocState = "granted";
        void exec(
          `INSERT INTO AnalyticsLocationFix (device_id, user_id, session_id, lat, lon, accuracy_m, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [env.did, ctx.userId, lastSessionId, lat.toFixed(5), lon.toFixed(5), Math.round(Number(p.accuracy_m) || 0) || null, new Date(at)],
        ).catch(() => undefined);
      }
      delete p.lat;
      delete p.lon;
    }
    if (ev.n === "location_denied") device.preciseLocState = "denied";

    const key = isKeyEvent(ctx.app, ev.n);
    const t = touchSession({
      deviceId: env.did,
      userId: ctx.userId,
      app: ctx.app,
      at,
      kind: "event",
      name: ev.n,
      route,
      isPageView: ev.n === "page_view",
      engagementMs: engagement,
      isKeyEvent: key,
      ip: e.ipBuf,
      geoId: e.geoId,
      network: e.network,
      uaId: e.uaId,
      userType: user?.userType ?? null,
      isBot: bot,
      entry: entryFrom(firstPageView ?? ev, standalone),
    });
    const session = t.session;
    lastSessionId = session?.session_id ?? null;

    if (t.started && session) {
      sessionsStarted++;
      const ipHex = e.ipBuf?.toString("hex") ?? null;
      activityBus.emitSignal({
        type: "session_start",
        sessionId: session.session_id,
        userId: ctx.userId,
        deviceId: env.did,
        app: ctx.app,
        at,
        ip: e.ip,
        geoId: e.geoId,
        isNewDevice: !!user && !user.knownDevices.has(env.did),
        isNewIpForUser: !!user && !!ipHex && !user.knownIps.has(ipHex),
        country: e.geo.country_code,
        isp: e.geo.isp,
      });
      if (user) {
        user.knownDevices.add(env.did);
        if (ipHex) user.knownIps.add(ipHex);
        if (e.geo.country_code) user.knownCountries.add(e.geo.country_code);
      }
      queueEvent(row(ulid(at), at, ctx, env.did, session.session_id, null, "session_start", route, feature, 0, e, null, baseFlags | FLAG.server, now));
    }

    // first_visit: per user per app, or once per brand-new visitor device.
    if (user && !user.firstSeenApps.has(ctx.app)) {
      user.firstSeenApps.add(ctx.app);
      firstSeen[ctx.app] = new Date(at).toISOString();
      queueEvent(row(ulid(at), at, ctx, env.did, lastSessionId, null, "first_visit", route, feature, 0, e, null, baseFlags | FLAG.server, now));
    } else if (!user && device.isNew) {
      device.isNew = false;
      queueEvent(row(ulid(at), at, ctx, env.did, lastSessionId, null, "first_visit", route, feature, 0, e, null, baseFlags | FLAG.server, now));
    }

    const flags = baseFlags | (key ? FLAG.key : 0) | (p.debug ? FLAG.debug : 0);
    delete p.debug;
    queueEvent(row(ev.id, at, ctx, env.did, lastSessionId, ev.pv ?? null, ev.n, route, feature, engagement, e, Object.keys(p).length ? JSON.stringify(p) : null, flags, now));
    res.accepted++;

    if (!bot && !excluded) {
      if (ev.n === "page_view") {
        activityBus.emitSignal({ type: "page_view", userId: ctx.userId, deviceId: env.did, app: ctx.app, feature, route, at, firstInSessionForApp: t.started || t.appChanged });
        // A page view proves the tab is open and visible on that page.
        presence.beat({
          app: ctx.app, userId: ctx.userId, deviceId: env.did, tab: env.tab ?? "t0", vis: "visible", idle: false,
          route, feature, standalone, ip: e.ip, geo: e.geo, network: e.network, device: devSummary,
          sessionId: lastSessionId, at,
        });
      }
      if (key) activityBus.emitSignal({ type: "key_event", userId: ctx.userId, deviceId: env.did, app: ctx.app, name: ev.n, at });
      presence.noteMinute(ctx.app, presence.personKey(ctx.userId, env.did), at);
    }
  }

  // Heartbeat → presence (+ keeps a visible session alive).
  if (env.beat && !bot && !excluded) {
    const b = env.beat;
    const route = sanitizeRoute(b.r);
    const t = touchSession({
      deviceId: env.did, userId: ctx.userId, app: ctx.app, at: now, kind: "beat",
      visible: b.vis === "visible", idle: b.idle, ip: e.ipBuf, geoId: e.geoId, network: e.network,
      uaId: e.uaId, userType: user?.userType ?? null, isBot: bot,
    });
    presence.beat({
      app: ctx.app, userId: ctx.userId, deviceId: env.did, tab: env.tab ?? "t0", vis: b.vis, idle: b.idle,
      route, feature: normalizeFeature(ctx.app, b.f), title: b.title ?? null, standalone: b.standalone,
      net: b.net ?? null, ip: e.ip, geo: e.geo, network: e.network, device: devSummary,
      sessionId: t.session?.session_id ?? lastSessionId, at: now,
    });
  }

  // Durable side tables.
  const seenAt = new Date(now);
  if (res.accepted > 0 || env.beat) {
    queueDevice({
      device_id: env.did,
      first_seen: seenAt,
      last_seen: seenAt,
      first_ip: wasNewDevice ? e.ipBuf : null,
      last_ip: e.ipBuf,
      last_geo_id: e.geoId,
      ua_id: e.uaId,
      standalone_seen: standalone ? 1 : 0,
      screen: env.scr ?? null,
      first_user_id: device.firstUserId,
      last_user_id: device.lastUserId,
      linked_user_ids: device.linkedUserIds.size ? JSON.stringify([...device.linkedUserIds].slice(-50)) : null,
      guest_names: null,
      bot_score: device.botScore,
      sessions: sessionsStarted,
      page_views: events.filter((x) => x.n === "page_view").length,
      precise_loc_state: device.preciseLocState === "unasked" ? null : device.preciseLocState,
    });
    if (e.ipBuf) {
      queueIp(e.ipBuf, e.geoId, e.network, seenAt);
      queueDeviceIp(env.did, e.ipBuf, seenAt);
      if (ctx.userId) queueUserIp(ctx.userId, e.ipBuf, seenAt);
    }
    if (ctx.userId) {
      queueUserState({
        user_id: ctx.userId,
        last_seen_at: seenAt,
        last_seen_app: APP_CODE[ctx.app],
        last_ip: e.ipBuf,
        last_geo_id: e.geoId,
        first_seen_by_app: firstSeen,
        sessions: sessionsStarted,
      });
    }
  }

  noteHealth(ctx.app, res.accepted, now);
  ingestStats.rejected += res.rejected;
  res.bot = bot;
  res.cmd = takeCommand(ctx.userId, env.did);
  return res;
};

const row = (
  id: string, at: number, ctx: IngestContext, did: string, sessionId: number | null, pv: string | null,
  name: string, route: string | null, feature: string | null, engagement: number, e: Enriched,
  params: string | null, flags: number, now: number,
) => ({
  event_id: id,
  occurred_at: new Date(at),
  received_at: new Date(now),
  app: APP_CODE[ctx.app],
  user_id: ctx.userId,
  device_id: did,
  session_id: sessionId,
  pv_id: pv,
  name,
  route,
  feature,
  engagement_ms: engagement,
  ip: e.ipBuf,
  geo_id: e.geoId,
  params,
  flags,
});

// ---------------------------------------------------------------------------
// Server-side events (relay `track()`, MIS auth hooks)
// ---------------------------------------------------------------------------
export interface ServerEventInput {
  app: AppKey;
  name: string;
  at?: number;
  id?: string;
  userId?: number | null;
  deviceId?: string | null;
  ip?: string | null;
  ua?: string | null;
  params?: Record<string, unknown>;
}

export const ingestServerEvent = async (input: ServerEventInput) => {
  const s = await getSettings();
  if (!s.collect_enabled) return false;
  await loadCatalog();
  const now = clock.now();
  const at = Math.min(now, input.at ?? now);
  const id = input.id ?? ulid(at);
  if (isDuplicate(id, now)) return false;
  const e = await enrich(input.ip ?? null, input.ua ?? null, s);
  const userId = input.userId ?? null;
  const user = userId ? (await loadUsers([userId])).get(userId) ?? null : null;
  const deviceId = input.deviceId ?? null;
  const p: Record<string, any> = { ...(input.params ?? {}) };
  let sessionId: number | null = null;
  const key = isKeyEvent(input.app, input.name);

  if (deviceId) {
    const device = cachedDevice(deviceId) ?? (await loadDevice(deviceId));
    // Tupo guest names: the only "identity" a public visitor gives us (self-declared).
    if (typeof p.display_name === "string" && p.display_name.trim()) {
      device.guestNames.add(p.display_name.trim().slice(0, 80));
      queueDevice(deviceDelta(device, now, e));
    }
    const t = touchSession({
      deviceId, userId, app: input.app, at, kind: "event", name: input.name, isKeyEvent: key,
      ip: e.ipBuf, geoId: e.geoId, network: e.network, uaId: e.uaId, userType: user?.userType ?? null,
      isBot: isBot(device, s.bot_threshold),
    });
    sessionId = t.session?.session_id ?? null;
  }
  const ctx: IngestContext = { app: input.app, userId, ip: e.ip, ua: input.ua ?? null, receivedAt: now };
  const flags = FLAG.server | (key ? FLAG.key : 0) | (user?.excluded ? FLAG.excluded : 0);
  queueEvent(row(id, at, ctx, deviceId ?? SERVER_DEVICE, sessionId, null, input.name, null, null, 0, e,
    Object.keys(p).length ? JSON.stringify(p).slice(0, 4000) : null, flags, now));
  if (e.ipBuf) {
    queueIp(e.ipBuf, e.geoId, e.network, new Date(at));
    if (userId) queueUserIp(userId, e.ipBuf, new Date(at));
  }
  if (key) activityBus.emitSignal({ type: "key_event", userId, deviceId: deviceId ?? "", app: input.app, name: input.name, at });
  activityBus.emitSignal({ type: "live_event", event: { at: new Date(at).toISOString(), kind: input.name, app: input.app, user_id: userId, device_id: deviceId, ip: e.ip } });
  noteHealth(input.app, 1, now);
  return true;
};

const deviceDelta = (d: DeviceInfo, now: number, e: Enriched) => ({
  device_id: d.deviceId,
  first_seen: new Date(now),
  last_seen: new Date(now),
  first_ip: null,
  last_ip: e.ipBuf,
  last_geo_id: e.geoId,
  ua_id: e.uaId,
  standalone_seen: 0,
  screen: null,
  first_user_id: d.firstUserId,
  last_user_id: d.lastUserId,
  linked_user_ids: d.linkedUserIds.size ? JSON.stringify([...d.linkedUserIds].slice(-50)) : null,
  guest_names: d.guestNames.size ? JSON.stringify([...d.guestNames].slice(-20)) : null,
  bot_score: d.botScore,
  sessions: 0,
  page_views: 0,
  precise_loc_state: null,
});

export { enrich as enrichRequest };
