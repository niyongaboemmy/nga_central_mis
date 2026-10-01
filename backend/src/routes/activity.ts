import express from "express";
import zlib from "zlib";
import logger from "../utils/logger";
import { requireServiceToken } from "../middleware/serviceAuth";
import { resolveActivityUser } from "../middleware/activityAuth";
import { perMinute } from "../middleware/rateLimit";
import { activityOrigins, activitySourceClients } from "../services/activity/apps";
import { activityTablesPresent, q } from "../services/activity/db";
import { ingestEnvelope, ingestServerEvent } from "../services/activity/ingest";
import { normalizeIp } from "../services/activity/ip";
import { clock } from "../services/activity/runtime";
import { envelopeSchema, relayBatchSchema } from "../services/activity/schema";
import { getSettings } from "../services/activity/settings";
import { deviceToken, issueBeaconTicket, newDeviceId, verifyBeaconTicket, verifyDeviceToken } from "../services/activity/tokens";

/**
 * Activity collection (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §5).
 *
 * Mounted BEFORE the app-wide 30 MB JSON parser, with its own small parsers:
 *   - JSON up to 256 kB (relays send gzip);
 *   - text/plain up to 64 kB (navigator.sendBeacon cannot send application/json without
 *     a CORS preflight).
 * Every response is 202/204. A client must never retry because analytics refused something.
 */
const router = express.Router();

const anonPerIp = perMinute(30);
const anonEventsPerIp = perMinute(300);
const userPerMinute = perMinute(60);
const relayPerMinute = perMinute(240);

const parseBody = (req: any): any => {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  let raw: Buffer | string | undefined = req.body;
  if (Buffer.isBuffer(raw)) {
    if (req.get("Content-Encoding") === "gzip") raw = zlib.gunzipSync(raw, { maxOutputLength: 4 * 1024 * 1024 });
    raw = raw.toString("utf8");
  }
  if (typeof raw !== "string" || !raw) return null;
  return JSON.parse(raw);
};

const bodyParsers = [
  express.raw({ type: ["application/json", "text/plain"], limit: "256kb" }),
];

const originAllowed = (req: any) => {
  const origin = (req.get("Origin") || "").replace(/\/$/, "");
  return !!origin && activityOrigins().includes(origin);
};

const accepted = (res: any, body: Record<string, unknown>) => res.status(202).json(body);

/**
 * GET /activity/config — switches for the SDK, plus a device token for `did`
 * (a new device id when the presented one is missing or forged).
 */
router.get("/config", async (req: any, res) => {
  const s = await getSettings();
  const did = String(req.query.did || "");
  const dt = String(req.query.dt || "");
  // A device id the browser made up itself is accepted only while it has no history;
  // an existing device can only be resumed with its token.
  let valid = verifyDeviceToken(did, dt);
  if (!valid && /^[A-Za-z0-9_-]{22}$/.test(did) && (await activityTablesPresent())) {
    const rows = await q("SELECT 1 FROM AnalyticsDevice WHERE device_id = ? LIMIT 1", [did]);
    valid = rows.length === 0;
  }
  const outDid = valid ? did : newDeviceId();
  res.set("Cache-Control", "no-store");
  res.json({
    enabled: s.collect_enabled,
    heartbeat_s: 30,
    flush_s: 5,
    idle_after_s: s.idle_after_s,
    precise_location: s.precise_location,
    did: outDid,
    dt: deviceToken(outDid),
    v: 1,
  });
});

/** POST /activity/sync — the MIS SPA's own batches (signed in or anonymous). */
router.post("/sync", ...bodyParsers, async (req: any, res) => {
  const now = clock.now();
  if (!(await activityTablesPresent())) return res.status(202).json({ ok: false });
  let body: any;
  try {
    body = parseBody(req);
  } catch {
    return accepted(res, { ok: false, error: "bad_json" });
  }
  const parsed = envelopeSchema.safeParse(body);
  if (!parsed.success) return accepted(res, { ok: false, error: "invalid", issues: parsed.error.issues.slice(0, 3).map((i) => i.path.join(".")) });
  const env = parsed.data;

  let userId = await resolveActivityUser(req);
  if (!userId && env.ticket) userId = verifyBeaconTicket(env.ticket, env.did);

  const ip = normalizeIp(req.ip);
  const out: Record<string, unknown> = { ok: true };
  if (!userId) {
    // Anonymous (public pages): origin allowlist, per-IP limits, device token.
    if (!originAllowed(req)) return accepted(res, { ok: false, error: "origin" });
    if (!anonPerIp.take(`a:${ip}`) || !anonEventsPerIp.take(`e:${ip}`, Math.max(1, env.events.length))) {
      return accepted(res, { ok: false, error: "rate_limited" });
    }
    if (!verifyDeviceToken(env.did, env.dt)) {
      // Unknown or forged device id: these events start a fresh device.
      env.did = newDeviceId();
      out.did = env.did;
      out.dt = deviceToken(env.did);
    }
  } else if (!userPerMinute.take(`u:${userId}`)) {
    return accepted(res, { ok: false, error: "rate_limited" });
  }

  try {
    const r = await ingestEnvelope(env, { app: "mis", userId, ip, ua: req.get("User-Agent") ?? null, receivedAt: now });
    if (userId) out.ticket = issueBeaconTicket(userId, env.did);
    if (!verifyDeviceToken(env.did, env.dt) && !out.dt) out.dt = deviceToken(env.did);
    return accepted(res, { ...out, accepted: r.accepted, rejected: r.rejected, disabled: r.disabled, cmd: r.cmd });
  } catch (error: any) {
    logger.error("[activity] sync failed", { error: error?.message ?? error });
    return accepted(res, { ok: false });
  }
});

/**
 * POST /activity/ingest — coalesced batches from a satellite relay (HTTP Basic SSO
 * client credentials). The writing app is decided by the client id, never the body.
 */
router.post("/ingest", ...bodyParsers, requireServiceToken("activity:write"), async (req: any, res) => {
  const now = clock.now();
  const clientId = req.service?.clientId;
  const app = clientId ? activitySourceClients().get(clientId) : undefined;
  if (!app) return res.status(403).json({ success: false, message: "This client may not write activity" });
  if (!relayPerMinute.take(`r:${clientId}`)) return res.status(429).json({ success: false, message: "Too many batches" });
  if (!(await activityTablesPresent())) return res.status(202).json({ accepted: 0 });

  let body: any;
  try {
    body = parseBody(req);
  } catch {
    return res.status(400).json({ success: false, message: "Bad JSON" });
  }
  const parsed = relayBatchSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid batch" });

  let acceptedN = 0;
  let rejected = 0;
  const commands: { user_id: number | null; did: string; cmd: unknown }[] = [];
  for (const b of parsed.data.batches) {
    const env = envelopeSchema.safeParse(b.envelope);
    if (!env.success) {
      rejected++;
      continue;
    }
    const e = env.data;
    if (!b.user_id && !verifyDeviceToken(e.did, e.dt)) e.did = newDeviceId();
    try {
      const r = await ingestEnvelope(e, { app, userId: b.user_id ?? null, ip: normalizeIp(b.ip ?? null), ua: b.ua ?? null, receivedAt: now });
      acceptedN += r.accepted;
      rejected += r.rejected;
      if (r.cmd) commands.push({ user_id: b.user_id ?? null, did: e.did, cmd: r.cmd });
    } catch (error: any) {
      rejected++;
      logger.error("[activity] relay batch failed", { app, error: error?.message ?? error });
    }
  }
  for (const se of parsed.data.server_events) {
    try {
      if (await ingestServerEvent({ app, name: se.n, at: Math.min(now, se.t), id: se.id, userId: se.user_id ?? null, deviceId: se.did ?? null, ip: se.ip ?? null, params: se.p })) acceptedN++;
    } catch {
      rejected++;
    }
  }
  return res.status(202).json({ accepted: acceptedN, rejected, commands });
});

export default router;
export const _testing = { anonPerIp, anonEventsPerIp, userPerMinute, relayPerMinute };
