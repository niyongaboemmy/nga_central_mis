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
import { parseQuery } from "../services/activity/reports/common";
import { overview } from "../services/activity/reports/overview";
import { accessSeries, accessUsers, failedLogins, heatmap, loginSeries } from "../services/activity/reports/access";
import { adoptionBy, audience, visitors, visitorSeries } from "../services/activity/reports/audience";
import { apps as appsReport, dimension, features, flows, keyEvents, retention, technology } from "../services/activity/reports/engagement";
import { ipLookup, locations } from "../services/activity/reports/locations";

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
