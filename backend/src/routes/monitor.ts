import express from "express";
import { authenticate } from "../middleware/auth";
import { requireServiceToken } from "../middleware/serviceAuth";
import { decideAny, requireCapability } from "../services/access/policy";
import { APPS, AppKey, activitySourceClients, isAppKey } from "../services/activity/apps";
import { saveCatalog, loadCatalog } from "../services/activity/catalog";
import { activityTablesPresent, q } from "../services/activity/db";
import { liveListenerCount, recentLiveEvents, subscribeLive } from "../services/activity/engine";
import { geoDbStatus } from "../services/activity/geoip";
import { ingestStats } from "../services/activity/ingest";
import { loadUsers } from "../services/activity/people";
import * as presence from "../services/activity/presence";
import { clock } from "../services/activity/runtime";
import { getSettings, updateSettings } from "../services/activity/settings";
import { openSessionCount } from "../services/activity/sessionizer";
import { consumeStreamTicket, issueStreamTicket } from "../services/activity/tokens";
import { bufferDepth, stats as writerStats } from "../services/activity/writer";
import { logFromReq } from "../services/activity/accessLog";
import { asyncHandler } from "../middleware/asyncHandler";
import { ValidationError } from "../errors/CustomError";
import { parseQuery } from "../services/activity/reports/common";
import { overview } from "../services/activity/reports/overview";
import { accessSeries, accessUsers, failedLogins, heatmap, loginSeries } from "../services/activity/reports/access";
import { adoptionBy, audience, visitors, visitorSeries } from "../services/activity/reports/audience";
import { apps as appsReport, dimension, features, flows, keyEvents, retention, technology } from "../services/activity/reports/engagement";
import { ipLookup, locations } from "../services/activity/reports/locations";
import {
  accessLogFor, beforeSignIn, deleteDeviceData, deleteUserData, deviceProfile, exportUserData, setBotOverride, timeline,
  userDevices, userFeatures, userHoldsCapability, userNetwork, userProfile, userSecurity, userSummary,
} from "../services/activity/userMonitor";
import { adminSignOutEverywhere, messageUser, setAccountStatus, setExcluded, signOutDevice } from "../services/activity/control";
import { ackAlert, createWatch, listAlerts, listWatches, revokeWatch } from "../services/activity/watches";
import { addBlock, listBlocks, revokeBlock } from "../services/activity/blocklist";
import { recordAuthEvent } from "../services/activity/authEvents";
import { DEVICE_ID_RE } from "../services/activity/tokens";
import { ipToString } from "../services/activity/ip";

/**
 * Admin console API (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §15).
 * Every route is guarded by an ANALYTICS_* capability through requireCapability, which is
 * always decided by access v2 whatever ACCESS_V2_MIS_MODE is set to.
 */
const router = express.Router();
const SCHOOL = () => ({ type: "SCHOOL" as const });
const can = (cap: string | string[]) => requireCapability(cap, SCHOOL as any);

/** After a requireCapability guard ran: does the viewer also hold `cap`? */
export const hasCap = (req: any, cap: string) => {
  try {
    return !!req.access?.snapshot && decideAny(req.access.snapshot, [cap], { type: "SCHOOL" } as any, null).allowed;
  } catch {
    return false;
  }
};

/** Parse the shared filter query (?app=tm,tupo&aud=user|visitor|both&type=TEACHER&feature=). */
export const presenceFilterOf = (req: any): presence.PresenceFilter => {
  const apps = String(req.query.app || "")
    .split(",")
    .map((s) => s.trim())
    .filter(isAppKey) as AppKey[];
  const aud = String(req.query.aud || "both");
  const types = String(req.query.type || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return {
    apps: apps.length ? apps : undefined,
    audience: aud === "user" || aud === "visitor" ? aud : "both",
    userTypes: types.length ? types : undefined,
    feature: req.query.feature ? String(req.query.feature) : undefined,
  };
};

// ---------------------------------------------------------------------------
// Catalog push from the apps (service auth)
// ---------------------------------------------------------------------------
router.put(
  "/catalog/:app",
  express.json({ limit: "512kb" }),
  requireServiceToken("activity:write"),
  asyncHandler(async (req: any, res: any) => {
    const app = req.params.app;
    const allowed = activitySourceClients().get(req.service?.clientId ?? "");
    if (!isAppKey(app) || allowed !== app) return res.status(403).json({ success: false, message: "This client may not publish that app's catalog" });
    if (!(await activityTablesPresent())) return res.status(202).json({ success: true, saved: 0 });
    const features = Array.isArray(req.body?.features) ? req.body.features : [];
    const saved = await saveCatalog(app, req.body?.version ?? null, features);
    res.json({ success: true, saved });
  }),
);

router.use(express.json({ limit: "256kb" }));

// ---------------------------------------------------------------------------
// Live (Realtime)
// ---------------------------------------------------------------------------
const liveSnapshot = async (req: any, named: boolean) => {
  const f = presenceFilterOf(req);
  const people = presence.listPeople(f);
  // Make sure names/types are loaded for everyone on screen.
  const ids = people.filter((p) => p.user).map((p) => p.user!.id);
  if (ids.length) await loadUsers(ids);
  const counts = presence.presenceCounts(f);
  return {
    at: new Date(clock.now()).toISOString(),
    counts,
    last5: presence.activeInLast(5, f.apps),
    last30: presence.activeInLast(30, f.apps),
    minutes: presence.minuteSeries(f.apps),
    top_features: presence.topFeaturesNow(f),
    people: named ? presence.listPeople(f) : [],
    events: named ? recentLiveEvents().filter((e: any) => !f.apps?.length || f.apps.includes(e.app)) : [],
    named,
  };
};

router.get(
  "/live",
  authenticate,
  can(["ANALYTICS_VIEW", "ANALYTICS_LIVE_VIEW"]),
  asyncHandler(async (req: any, res: any) => {
    const named = hasCap(req, "ANALYTICS_LIVE_VIEW");
    res.json({ success: true, data: await liveSnapshot(req, named) });
  }),
);

router.post(
  "/live/ticket",
  authenticate,
  can(["ANALYTICS_VIEW", "ANALYTICS_LIVE_VIEW"]),
  (req: any, res: any) => {
    res.json({ success: true, data: { ticket: issueStreamTicket(req.user.userId) } });
  },
);

/**
 * SSE: snapshot on connect, then presence diffs every 2 s and events as they happen.
 * EventSource cannot send headers, so it authenticates with a single-use 60 s ticket
 * from POST /live/ticket. The 24 h JWT never appears in a URL.
 */
router.get(
  "/live/stream",
  asyncHandler(async (req: any, res: any, next: any) => {
    const userId = consumeStreamTicket(req.query.ticket);
    if (!userId) return res.status(401).json({ message: "Invalid or expired stream ticket" });
    // Re-use the normal capability check with a synthetic user on the request.
    req.user = { userId, permissions: [] };
    next();
  }),
  can(["ANALYTICS_VIEW", "ANALYTICS_LIVE_VIEW"]),
  asyncHandler(async (req: any, res: any) => {
    const named = hasCap(req, "ANALYTICS_LIVE_VIEW");
    const f = presenceFilterOf(req);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    res.write("retry: 5000\n\n");
    send({ type: "snapshot", ...(await liveSnapshot(req, named)) });

    let lastCounts = 0;
    const detach = subscribeLive((msg) => {
      if (msg.type === "diff") {
        if (named) {
          const upsert = (msg.upsert as presence.PersonView[]).filter((p) => matchesView(p, f));
          const remove = msg.remove as string[];
          if (upsert.length || remove.length) send({ type: "diff", upsert, remove, at: msg.at });
        }
        // Counts at most every 2 s, piggy-backed on diffs.
        if (Date.now() - lastCounts > 1_900) {
          lastCounts = Date.now();
          send({ type: "counts", counts: presence.presenceCounts(f), last5: presence.activeInLast(5, f.apps), top_features: presence.topFeaturesNow(f), minutes: presence.minuteSeries(f.apps) });
        }
      } else if (msg.type === "event") {
        if (named) send(msg);
      } else if (msg.type === "ping") {
        send({ type: "counts", counts: presence.presenceCounts(f), last5: presence.activeInLast(5, f.apps), top_features: presence.topFeaturesNow(f), minutes: presence.minuteSeries(f.apps) });
      }
    });
    req.on("close", () => {
      detach();
      res.end();
    });
  }),
);

const matchesView = (p: presence.PersonView, f: presence.PresenceFilter) => {
  if (f.audience === "user" && !p.user) return false;
  if (f.audience === "visitor" && p.user) return false;
  if (f.apps?.length && !p.tabs.some((t) => f.apps!.includes(t.app))) return false;
  if (f.userTypes?.length && !(p.user?.type && f.userTypes.includes(p.user.type))) return false;
  if (f.feature && !p.tabs.some((t) => t.feature === f.feature)) return false;
  return true;
};


// ---------------------------------------------------------------------------
// Reports (plan §14). Aggregates need ANALYTICS_VIEW; anything naming people, IPs or
// usernames tried also needs ANALYTICS_USER_VIEW. Without it, small groups are hidden.
// ---------------------------------------------------------------------------
const VIEW = can(["ANALYTICS_VIEW", "ANALYTICS_USER_VIEW"]);
const NAMED = can("ANALYTICS_USER_VIEW");
const suppressFor = (req: any) => !hasCap(req, "ANALYTICS_USER_VIEW");

/** CSV for list endpoints (?format=csv). Exports that carry names are access-logged. */
const csvOf = (rows: Record<string, any>[]) => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: any) => {
    const t = v === null || v === undefined ? "" : typeof v === "object" ? (v instanceof Date ? v.toISOString() : JSON.stringify(v)) : String(v);
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
};
const sendList = async (req: any, res: any, report: string, data: { rows: any[] } & Record<string, any>, named: boolean) => {
  if (req.query.format === "csv") {
    if (named) await logFromReq(req, "export", { detail: { report, filters: req.query, rows: data.rows.length } });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${report}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csvOf(data.rows));
  }
  res.json({ success: true, data });
};

router.get("/overview", authenticate, VIEW, asyncHandler(async (req: any, res: any) => {
  res.json({ success: true, data: await overview(parseQuery(req.query), suppressFor(req)) });
}));

router.get("/access/series", authenticate, VIEW, asyncHandler(async (req: any, res: any) => {
  const rq = parseQuery(req.query);
  const [access, logins] = await Promise.all([accessSeries(rq), loginSeries(rq)]);
  res.json({ success: true, data: { access, ...logins } });
}));
router.get("/access/heatmap", authenticate, VIEW, asyncHandler(async (req: any, res: any) => {
  res.json({ success: true, data: await heatmap(parseQuery(req.query)) });
}));
router.get("/access/users", authenticate, NAMED, asyncHandler(async (req: any, res: any) => {
  const rq = parseQuery(req.query);
  const full = req.query.format === "csv";
  const data = await accessUsers(rq, {
    search: req.query.search ? String(req.query.search) : undefined,
    sort: req.query.sort as any,
    dir: req.query.dir as any,
    page: Number(req.query.page) || 1,
    limit: full ? 500 : Number(req.query.limit) || 50,
  });
  await sendList(req, res, "accessed-users", data, true);
}));
router.get("/access/failed", authenticate, NAMED, asyncHandler(async (req: any, res: any) => {
  const rows = await failedLogins(parseQuery(req.query));
  await sendList(req, res, "failed-sign-ins", { rows }, true);
}));

router.get("/audience", authenticate, NAMED, asyncHandler(async (req: any, res: any) => {
  const rq = parseQuery(req.query);
  const data = await audience(rq, {
    filter: req.query.filter as any,
    search: req.query.search ? String(req.query.search) : undefined,
    page: Number(req.query.page) || 1,
    limit: req.query.format === "csv" ? 500 : Number(req.query.limit) || 50,
    sort: req.query.sort ? String(req.query.sort) : undefined,
    dir: req.query.dir ? String(req.query.dir) : undefined,
  });
  await sendList(req, res, "audience", data, true);
}));
router.get("/audience/adoption", authenticate, VIEW, asyncHandler(async (req: any, res: any) => {
  const by = ["program", "grade", "class_group", "role"].includes(String(req.query.by)) ? (String(req.query.by) as any) : "program";
  res.json({ success: true, data: await adoptionBy(parseQuery(req.query), by, suppressFor(req)) });
}));

router.get("/visitors", authenticate, NAMED, asyncHandler(async (req: any, res: any) => {
  const rq = parseQuery(req.query);
  const data = await visitors(rq, {
    tab: ["bots", "converted"].includes(String(req.query.tab)) ? (req.query.tab as any) : "humans",
    search: req.query.search ? String(req.query.search) : undefined,
    page: Number(req.query.page) || 1,
    limit: req.query.format === "csv" ? 500 : Number(req.query.limit) || 50,
  });
  await sendList(req, res, "visitors", data, true);
}));
router.get("/visitors/summary", authenticate, VIEW, asyncHandler(async (req: any, res: any) => {
  res.json({ success: true, data: await visitorSeries(parseQuery(req.query)) });
}));

router.get("/engagement/features", authenticate, VIEW, asyncHandler(async (req: any, res: any) => {
  const rows = await features(parseQuery(req.query));
  await sendList(req, res, "features", { rows }, false);
}));
router.get("/engagement/dimension", authenticate, VIEW, asyncHandler(async (req: any, res: any) => {
  const dim = String(req.query.dim || "");
  if (!["event", "landing", "exit", "referrer_host", "entry_kind", "user_type", "network"].includes(dim)) return res.status(400).json({ success: false, message: "Unknown dimension" });
  res.json({ success: true, data: await dimension(parseQuery(req.query), dim) });
}));
router.get("/engagement/key-events", authenticate, VIEW, asyncHandler(async (req: any, res: any) => {
  res.json({ success: true, data: await keyEvents(parseQuery(req.query)) });
}));
router.get("/apps", authenticate, VIEW, asyncHandler(async (req: any, res: any) => {
  const rq = parseQuery(req.query);
  const [cards, flow] = await Promise.all([appsReport(rq), flows(rq)]);
  res.json({ success: true, data: { ...cards, flows: flow } });
}));
router.get("/retention", authenticate, VIEW, asyncHandler(async (req: any, res: any) => {
  res.json({ success: true, data: await retention(parseQuery(req.query, 84)) });
}));
router.get("/technology", authenticate, VIEW, asyncHandler(async (req: any, res: any) => {
  res.json({ success: true, data: await technology(parseQuery(req.query)) });
}));
router.get("/locations", authenticate, VIEW, asyncHandler(async (req: any, res: any) => {
  const data = await locations(parseQuery(req.query));
  // IP addresses are personal data: only with per-person access.
  if (!hasCap(req, "ANALYTICS_USER_VIEW")) data.top_ips = [];
  res.json({ success: true, data });
}));
router.get("/ip/:ip", authenticate, NAMED, asyncHandler(async (req: any, res: any) => {
  const data = await ipLookup(String(req.params.ip));
  if (!data) return res.status(400).json({ success: false, message: "Not a valid IP address" });
  await logFromReq(req, "ip_lookup", { targetIp: data.ip });
  res.json({ success: true, data });
}));


// ---------------------------------------------------------------------------
// User 360 / Visitor 360 (plan §10). Every call is written to MonitorAccessLog.
// ---------------------------------------------------------------------------
const CONTROL = can("ANALYTICS_USER_CONTROL");
const CONFIGURE = can("ANALYTICS_CONFIGURE");

const reasonOf = (req: any, min = 5) => {
  const r = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  return r.length >= min ? r.slice(0, 2000) : null;
};

/**
 * Admin-on-admin rule and self rule: nobody opens their own 360 here (they use My activity),
 * and only holders of ANALYTICS_CONFIGURE may open the 360 of someone who holds it.
 */
const userTarget = asyncHandler(async (req: any, res: any, next: any) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: "Invalid user id" });
  if (id === req.user.userId) return res.status(403).json({ success: false, code: "SELF", message: "Use My activity to see your own activity." });
  if ((await userHoldsCapability(id, "ANALYTICS_CONFIGURE")) && !hasCap(req, "ANALYTICS_CONFIGURE"))
    return res.status(403).json({ success: false, code: "PROTECTED", message: "Only analytics administrators can monitor another analytics administrator." });
  req.targetUserId = id;
  next();
});

router.get("/users/:id", authenticate, NAMED, userTarget, asyncHandler(async (req: any, res: any) => {
  const rq = parseQuery(req.query);
  const profile = await userProfile(req.targetUserId);
  if (!profile) return res.status(404).json({ success: false, message: "User not found" });
  const [summary, features] = await Promise.all([userSummary(req.targetUserId, rq.from, rq.to), userFeatures(req.targetUserId, rq.fromAt, rq.toAt)]);
  await logFromReq(req, "view_user", { targetUserId: req.targetUserId });
  res.json({
    success: true,
    data: {
      profile,
      summary,
      features,
      watches: await listWatches({ userId: req.targetUserId }),
      can: { control: hasCap(req, "ANALYTICS_USER_CONTROL"), configure: hasCap(req, "ANALYTICS_CONFIGURE"), location: hasCap(req, "ANALYTICS_LOCATION_VIEW") },
    },
  });
}));
router.get("/users/:id/timeline", authenticate, NAMED, userTarget, asyncHandler(async (req: any, res: any) => {
  const data = await timeline({ userId: req.targetUserId }, { before: req.query.before ? String(req.query.before) : undefined });
  if (!req.query.before) await logFromReq(req, "view_timeline", { targetUserId: req.targetUserId });
  res.json({ success: true, data: { ...data, before_sign_in: req.query.before ? [] : await beforeSignIn(req.targetUserId) } });
}));
router.get("/users/:id/devices", authenticate, NAMED, userTarget, asyncHandler(async (req: any, res: any) => {
  res.json({ success: true, data: await userDevices(req.targetUserId) });
}));
router.get("/users/:id/network", authenticate, NAMED, userTarget, asyncHandler(async (req: any, res: any) => {
  const withFixes = hasCap(req, "ANALYTICS_LOCATION_VIEW");
  if (withFixes) await logFromReq(req, "view_locations", { targetUserId: req.targetUserId });
  res.json({ success: true, data: await userNetwork(req.targetUserId, withFixes) });
}));
router.get("/users/:id/security", authenticate, NAMED, userTarget, asyncHandler(async (req: any, res: any) => {
  res.json({ success: true, data: await userSecurity(req.targetUserId) });
}));
router.get("/users/:id/access-log", authenticate, CONFIGURE, userTarget, asyncHandler(async (req: any, res: any) => {
  res.json({ success: true, data: await accessLogFor({ userId: req.targetUserId }) });
}));
router.get("/users/:id/export", authenticate, NAMED, userTarget, asyncHandler(async (req: any, res: any) => {
  await logFromReq(req, "export_user", { targetUserId: req.targetUserId });
  res.setHeader("Content-Disposition", `attachment; filename="user-${req.targetUserId}-activity.json"`);
  res.json(await exportUserData(req.targetUserId));
}));

const control = (action: string, run: (req: any) => Promise<unknown>) =>
  asyncHandler(async (req: any, res: any) => {
    const reason = reasonOf(req);
    if (!reason) return res.status(400).json({ success: false, message: "A reason is required (at least 5 characters)." });
    const result = await run(req);
    await logFromReq(req, action, { targetUserId: req.targetUserId ?? null, targetDeviceId: req.targetDeviceId ?? null, reason, detail: { result } as any });
    res.json({ success: true, data: result ?? null });
  });

router.post("/users/:id/signout", authenticate, CONTROL, userTarget, control("signout_everywhere", async (req) => {
  const r = await adminSignOutEverywhere(req.targetUserId);
  await recordAuthEvent(req, { kind: "logout", outcome: "info", initiator: "admin", userId: req.targetUserId, actorId: req.user.userId });
  return { apps: (r.apps as any[]).map((a) => ({ app: a.name ?? a.client_id, status: a.status })) };
}));
router.post("/users/:id/suspend", authenticate, CONTROL, userTarget, control("suspend", async (req) => {
  const r = await setAccountStatus(req.targetUserId, "SUSPENDED");
  await recordAuthEvent(req, { kind: "suspend", outcome: "info", initiator: "admin", userId: req.targetUserId, actorId: req.user.userId });
  return { previous: r.previous };
}));
router.post("/users/:id/reactivate", authenticate, CONTROL, userTarget, control("reactivate", async (req) => {
  const r = await setAccountStatus(req.targetUserId, "ACTIVE");
  await recordAuthEvent(req, { kind: "reactivate", outcome: "info", initiator: "admin", userId: req.targetUserId, actorId: req.user.userId });
  return { previous: r.previous };
}));
router.post("/users/:id/message", authenticate, CONTROL, userTarget, control("message", async (req) => {
  const body = String(req.body?.message ?? "").trim();
  if (!body) throw new ValidationError("Write a message");
  return { delivered: await messageUser(req.targetUserId, req.user.userId, String(req.body?.title ?? ""), body) };
}));
router.post("/users/:id/exclude", authenticate, CONFIGURE, userTarget, control("exclude", async (req) => {
  await setExcluded(req.targetUserId, req.body?.excluded !== false);
  return { excluded: req.body?.excluded !== false };
}));
router.delete("/users/:id/data", authenticate, CONFIGURE, userTarget, control("delete_user_data", async (req) => deleteUserData(req.targetUserId)));

// Visitors (devices) — addressed by device id.
const deviceTarget = (req: any, res: any, next: any) => {
  if (!DEVICE_ID_RE.test(String(req.params.deviceId))) return res.status(400).json({ success: false, message: "Invalid device id" });
  req.targetDeviceId = String(req.params.deviceId);
  next();
};
router.get("/visitors/device/:deviceId", authenticate, NAMED, deviceTarget, asyncHandler(async (req: any, res: any) => {
  const profile = await deviceProfile(req.targetDeviceId);
  if (!profile) return res.status(404).json({ success: false, message: "Device not found" });
  await logFromReq(req, "view_device", { targetDeviceId: req.targetDeviceId });
  res.json({
    success: true,
    data: {
      profile,
      watches: (await listWatches({})).filter((w: any) => w.target_device_id === req.targetDeviceId),
      can: { control: hasCap(req, "ANALYTICS_USER_CONTROL"), configure: hasCap(req, "ANALYTICS_CONFIGURE") },
    },
  });
}));
router.get("/visitors/device/:deviceId/timeline", authenticate, NAMED, deviceTarget, asyncHandler(async (req: any, res: any) => {
  res.json({ success: true, data: await timeline({ deviceId: req.targetDeviceId }, { before: req.query.before ? String(req.query.before) : undefined }) });
}));
router.post("/visitors/device/:deviceId/block", authenticate, CONTROL, deviceTarget, control("block_device", async (req) => {
  const id = await addBlock({ kind: "device", value: req.targetDeviceId, reason: reasonOf(req)!, days: Number(req.body?.days) || 7, actorId: req.user.userId });
  signOutDevice(req.targetDeviceId);
  return { block_id: id };
}));
router.post("/visitors/device/:deviceId/bot", authenticate, CONTROL, deviceTarget, control("bot_override", async (req) => {
  const v = ["none", "human", "bot"].includes(req.body?.override) ? req.body.override : "none";
  await setBotOverride(req.targetDeviceId, v);
  const { cachedDevice } = await import("../services/activity/people");
  const d = cachedDevice(req.targetDeviceId);
  if (d) d.botOverride = v;
  return { override: v };
}));
router.post("/visitors/device/:deviceId/signout", authenticate, CONTROL, deviceTarget, control("signout_device", async (req) => {
  signOutDevice(req.targetDeviceId);
  return { queued: true };
}));
router.delete("/visitors/device/:deviceId/data", authenticate, CONFIGURE, deviceTarget, control("delete_device_data", async (req) => deleteDeviceData(req.targetDeviceId)));

// ---------------------------------------------------------------------------
// Watches, alerts, blocks
// ---------------------------------------------------------------------------
router.get("/watches", authenticate, CONTROL, asyncHandler(async (req: any, res: any) => {
  res.json({ success: true, data: await listWatches({ status: req.query.status ? String(req.query.status) : undefined }) });
}));
router.post("/watches", authenticate, CONTROL, asyncHandler(async (req: any, res: any) => {
  const b = req.body ?? {};
  const reason = reasonOf(req);
  if (!reason) return res.status(400).json({ success: false, message: "A reason is required (at least 5 characters)." });
  let target: any;
  if (b.target?.kind === "user") {
    const uid = Number(b.target.userId);
    if (!Number.isInteger(uid) || uid <= 0) return res.status(400).json({ success: false, message: "Choose a person" });
    if (uid === req.user.userId) return res.status(400).json({ success: false, message: "You can't watch yourself." });
    if ((await userHoldsCapability(uid, "ANALYTICS_CONFIGURE")) && !hasCap(req, "ANALYTICS_CONFIGURE"))
      return res.status(403).json({ success: false, message: "Only analytics administrators can watch another analytics administrator." });
    target = { kind: "user", userId: uid };
  } else if (b.target?.kind === "device" && DEVICE_ID_RE.test(String(b.target.deviceId))) target = { kind: "device", deviceId: String(b.target.deviceId) };
  else if (b.target?.kind === "ip" && b.target.cidr) target = { kind: "ip", cidr: String(b.target.cidr) };
  else return res.status(400).json({ success: false, message: "Choose who or what to watch" });
  try {
    const id = await createWatch({ target, reason, rules: b.rules, channels: b.channels, days: Number(b.days) || 14, actorId: req.user.userId });
    await logFromReq(req, "watch_create", { targetUserId: target.userId ?? null, targetDeviceId: target.deviceId ?? null, targetIp: target.kind === "ip" ? String(target.cidr).split("/")[0] : null, reason, detail: { watch_id: id, rules: b.rules, days: b.days } });
    res.status(201).json({ success: true, data: { id } });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e?.message ?? "Invalid watch" });
  }
}));
router.delete("/watches/:id", authenticate, CONTROL, asyncHandler(async (req: any, res: any) => {
  const reason = reasonOf(req, 3) ?? "Ended by an administrator";
  try {
    const w: any = await revokeWatch(Number(req.params.id), req.user.userId, reason);
    await logFromReq(req, "watch_revoke", { targetUserId: w.target_user_id ?? null, targetDeviceId: w.target_device_id ?? null, reason, detail: { watch_id: w.id } });
    res.json({ success: true, data: { id: w.id, status: "revoked" } });
  } catch (e: any) {
    res.status(404).json({ success: false, message: e?.message ?? "Not found" });
  }
}));
router.get("/alerts", authenticate, CONTROL, asyncHandler(async (req: any, res: any) => {
  res.json({ success: true, data: await listAlerts({ unacked: req.query.unacked === "1" }) });
}));
router.post("/alerts/:id/ack", authenticate, CONTROL, asyncHandler(async (req: any, res: any) => {
  await ackAlert(Number(req.params.id), req.user.userId);
  res.json({ success: true });
}));
router.get("/blocks", authenticate, CONTROL, asyncHandler(async (_req: any, res: any) => {
  res.json({ success: true, data: await listBlocks() });
}));
router.post("/blocks", authenticate, CONTROL, asyncHandler(async (req: any, res: any) => {
  const reason = reasonOf(req);
  if (!reason) return res.status(400).json({ success: false, message: "A reason is required (at least 5 characters)." });
  const kind = ["ip", "cidr", "device"].includes(req.body?.kind) ? req.body.kind : "ip";
  try {
    const id = await addBlock({ kind, value: String(req.body?.value ?? ""), reason, days: Number(req.body?.days) || 7, actorId: req.user.userId });
    await logFromReq(req, "block", { targetIp: kind !== "device" ? String(req.body?.value).split("/")[0] : null, targetDeviceId: kind === "device" ? String(req.body?.value) : null, reason, detail: { block_id: id, kind, days: req.body?.days } });
    res.status(201).json({ success: true, data: { id } });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e?.message ?? "Invalid block" });
  }
}));
router.delete("/blocks/:id", authenticate, CONTROL, asyncHandler(async (req: any, res: any) => {
  await revokeBlock(Number(req.params.id));
  await logFromReq(req, "unblock", { detail: { block_id: Number(req.params.id) } });
  res.json({ success: true });
}));

// ---------------------------------------------------------------------------
// Accountability: who looked at whom (append-only log, plan §13.7)
// ---------------------------------------------------------------------------
router.get("/access-log", authenticate, CONFIGURE, asyncHandler(async (req: any, res: any) => {
  const where: string[] = [];
  const params: any[] = [];
  if (req.query.viewer) { where.push("l.viewer_id = ?"); params.push(Number(req.query.viewer)); }
  if (req.query.target) { where.push("l.target_user_id = ?"); params.push(Number(req.query.target)); }
  if (req.query.action) { where.push("l.action = ?"); params.push(String(req.query.action)); }
  const rows = await q<any>(
    `SELECT l.id, l.at, l.viewer_id, l.action, l.target_user_id, l.target_device_id, l.target_ip, l.reason, l.detail, l.viewer_ip,
            CONCAT_WS(' ', vp.first_name, vp.last_name) AS viewer_name, CONCAT_WS(' ', tp.first_name, tp.last_name) AS target_name
       FROM MonitorAccessLog l
       LEFT JOIN UserProfile vp ON vp.user_id = l.viewer_id
       LEFT JOIN UserProfile tp ON tp.user_id = l.target_user_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY l.id DESC LIMIT 500`,
    params,
  );
  res.json({ success: true, data: rows.map((r) => ({ ...r, target_ip: ipToString(r.target_ip), viewer_ip: ipToString(r.viewer_ip), detail: typeof r.detail === "string" ? JSON.parse(r.detail) : r.detail })) });
}));

// ---------------------------------------------------------------------------
// My activity (every signed-in user, plan §10.5): what is recorded about me, and who
// is watching me (decision D2).
// ---------------------------------------------------------------------------
router.get("/me/activity", authenticate, asyncHandler(async (req: any, res: any) => {
  const me = req.user.userId;
  const [profile, devices, network, security, tl] = await Promise.all([
    userProfile(me),
    userDevices(me),
    userNetwork(me, false),
    userSecurity(me),
    timeline({ userId: me }, { limit: 20 }),
  ]);
  const watches = (await listWatches({ userId: me })).filter((w: any) => w.status === "active").map((w: any) => ({
    id: w.id, created_by_name: w.created_by_name, reason: w.reason, rules: w.rules, starts_at: w.starts_at, expires_at: w.expires_at,
  }));
  res.json({ success: true, data: { profile, devices, network, security: security.events.slice(0, 100), sessions: tl.sessions.map((s: any) => ({ ...s, items: undefined, item_count: s.items.length })), watches } });
}));
router.post("/me/notice-ack", authenticate, asyncHandler(async (req: any, res: any) => {
  await recordAuthEvent(req, { kind: "notice_ack", outcome: "info", userId: req.user.userId, method: String(req.body?.version ?? "").slice(0, 20) || null });
  res.json({ success: true });
}));
router.post("/me/signout-everywhere", authenticate, asyncHandler(async (req: any, res: any) => {
  await adminSignOutEverywhere(req.user.userId);
  await recordAuthEvent(req, { kind: "logout", outcome: "info", initiator: "user", userId: req.user.userId, method: "everywhere" });
  res.json({ success: true });
}));

/** Programmes / grades / classes for the segment pickers. */
router.get("/nodes", authenticate, VIEW, asyncHandler(async (_req: any, res: any) => {
  const { hierarchyNodes } = await import("../services/access/admin");
  res.json({ success: true, data: await hierarchyNodes() });
}));

/** Feature labels for every app (the console shows names, not keys). */
router.get(
  "/catalog",
  authenticate,
  can(["ANALYTICS_VIEW", "ANALYTICS_LIVE_VIEW"]),
  asyncHandler(async (_req: any, res: any) => {
    const rows = await q<any>("SELECT app, feature_key, label, module, is_event, key_event, is_public FROM AnalyticsFeature ORDER BY app, module, label");
    res.json({ success: true, data: rows });
  }),
);

// ---------------------------------------------------------------------------
// Settings & health
// ---------------------------------------------------------------------------
router.get(
  "/settings",
  authenticate,
  can("ANALYTICS_CONFIGURE"),
  asyncHandler(async (_req: any, res: any) => {
    res.json({ success: true, data: { settings: await getSettings(), geoip: geoDbStatus() } });
  }),
);

router.put(
  "/settings",
  authenticate,
  can("ANALYTICS_CONFIGURE"),
  asyncHandler(async (req: any, res: any) => {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const patch = req.body?.settings ?? {};
    if (patch.precise_location && patch.precise_location !== "off" && reason.length < 5) {
      return res.status(400).json({ success: false, message: "Enabling precise location needs a reason." });
    }
    try {
      const before = await getSettings();
      const after = await updateSettings(patch, req.user.userId);
      const changed = Object.keys(patch).filter((k) => JSON.stringify((before as any)[k]) !== JSON.stringify((after as any)[k]));
      if (changed.length) await logFromReq(req, "settings_update", { reason: reason || null, detail: { changed, after: Object.fromEntries(changed.map((k) => [k, (after as any)[k]])) } });
      res.json({ success: true, data: { settings: after } });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message ?? "Invalid settings" });
    }
  }),
);

router.get(
  "/ingest/health",
  authenticate,
  can(["ANALYTICS_CONFIGURE", "ANALYTICS_VIEW"]),
  asyncHandler(async (_req: any, res: any) => {
    const nowMin = Math.floor(clock.now() / 60_000);
    const perApp: Record<string, number[]> = {};
    for (const app of APPS) {
      perApp[app] = [];
      for (let m = nowMin - 29; m <= nowMin; m++) perApp[app].push(ingestStats.byAppMinute.get(`${app}|${m}`) ?? 0);
    }
    const catalog = await loadCatalog();
    res.json({
      success: true,
      data: {
        events_per_minute: perApp,
        last_event_at: Object.fromEntries(Object.entries(ingestStats.lastEventAt).map(([k, v]) => [k, new Date(v).toISOString()])),
        rejected: ingestStats.rejected,
        duplicates: ingestStats.duplicates,
        blocked: ingestStats.blocked,
        buffer: bufferDepth(),
        writer: { ...writerStats, lastFlushAt: writerStats.lastFlushAt ? new Date(writerStats.lastFlushAt).toISOString() : null },
        open_sessions: openSessionCount(),
        live_streams: liveListenerCount(),
        catalog: Object.fromEntries(APPS.map((a) => [a, catalog.get(a)?.size ?? 0])),
        geoip: geoDbStatus(),
      },
    });
  }),
);

/** Routes seen in the last 7 days whose feature resolved to "<app>.other" (catalog gaps). */
router.get(
  "/catalog/health",
  authenticate,
  can("ANALYTICS_CONFIGURE"),
  asyncHandler(async (_req: any, res: any) => {
    const rows = await q<any>(
      `SELECT app, route, COUNT(*) AS views, MAX(occurred_at) AS last_seen
         FROM AnalyticsEvent
        WHERE occurred_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY AND name = 'page_view'
          AND (feature IS NULL OR feature LIKE '%.other')
        GROUP BY app, route ORDER BY views DESC LIMIT 200`,
    );
    res.json({ success: true, data: rows });
  }),
);

export default router;
