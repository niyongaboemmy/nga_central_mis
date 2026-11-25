/**
 * Automatic strict tenancy mode (TENANT_SWITCHING_PLAN.md Appendix A.6).
 *
 *  - Every app reports its daily fallback counts (POST /platform/tenancy/fallbacks;
 *    MIS writes its own directly). A report is also the app's heartbeat.
 *  - evaluateStrictMode(): an app with 7 consecutive UTC days (the 7 days before
 *    today), each reported and all counts 0, is switched to strict -- it stops
 *    guessing school 1. Platform staff are told.
 *  - After the switch, any fallback (today or yesterday) alerts platform staff
 *    once per app per day.
 *  - The flags reach the spokes in GET /platform/tenants/active (`tenancy.strict`),
 *    which they already poll every 30 s; MIS applies its own (setStrictMode).
 *  - Undo: set `tenancy.strict.<app>.on = false` (platform settings) or env
 *    TENANCY_STRICT=off in that app.
 */
import { RowDataPacket } from "mysql2/promise";
import { controlPool, isControlPlaneMissing } from "../../db/platform";
import { getPlatformSetting, setPlatformSetting } from "../tenantMgmt/settings";
import { fallbackSnapshot } from "../../tenancy/fallbacks";
import { setStrictMode } from "../../tenancy/context";
import logger from "../../utils/logger";

export const TENANCY_APPS = ["mis", "taskmentor", "tendo", "tupo"] as const;
export type TenancyApp = (typeof TENANCY_APPS)[number];
export const CLEAN_DAYS = 7;
const KINDS = ["no_context", "legacy_tid", "payload_no_tid"] as const;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));

export function isTenancyApp(v: unknown): v is TenancyApp {
  return typeof v === "string" && (TENANCY_APPS as readonly string[]).includes(v);
}

/** Store one report (cumulative counts for `day`). Validates; throws on bad input. */
export async function recordFallbackReport(input: { app: unknown; day: unknown; counts: unknown; sites?: unknown }, now = new Date()): Promise<void> {
  if (!isTenancyApp(input.app)) throw Object.assign(new Error("Unknown app"), { status: 400 });
  const day = typeof input.day === "string" && DAY_RE.test(input.day) ? input.day : null;
  if (!day) throw Object.assign(new Error("day must be YYYY-MM-DD"), { status: 400 });
  // A report for the future, or older than 2 days, is ignored (clock skew / replays).
  const today = utcDay(now);
  if (day > addDays(today, 1) || day < addDays(today, -2)) return;
  const counts = (input.counts && typeof input.counts === "object" ? input.counts : {}) as Record<string, unknown>;
  const sites = Array.isArray(input.sites) ? input.sites.slice(0, 10).map((s) => String(s).slice(0, 120)) : null;
  const rows: Array<[string, number]> = [["_heartbeat", 0]];
  for (const k of KINDS) {
    const n = Math.max(0, Math.min(1e9, Math.floor(Number(counts[k]) || 0)));
    rows.push([k, n]);
  }
  for (const [kind, n] of rows) {
    await controlPool().query(
      `INSERT INTO TenancyFallbackDaily (app, day, kind, count, sites, updated_at) VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE count = GREATEST(count, VALUES(count)), sites = COALESCE(VALUES(sites), sites), updated_at = NOW()`,
      [input.app, day, kind, n, kind !== "_heartbeat" && n > 0 && sites ? JSON.stringify(sites) : null],
    );
  }
}

/** MIS's own counts, written straight to the control plane. */
export async function reportMisFallbacks(now = new Date()): Promise<void> {
  const snap = fallbackSnapshot();
  await recordFallbackReport({ app: "mis", day: snap.day, counts: snap.counts, sites: snap.sites }, now);
}

export async function strictFlags(): Promise<Record<TenancyApp, boolean>> {
  const out = Object.fromEntries(TENANCY_APPS.map((a) => [a, false])) as Record<TenancyApp, boolean>;
  try {
    const s = await getPlatformSetting("tenancy.strict");
    for (const a of TENANCY_APPS) out[a] = !!s?.[a]?.on;
  } catch {
    /* no control plane: never strict */
  }
  return out;
}

async function daysOf(app: TenancyApp, from: string, to: string): Promise<Map<string, { heartbeat: boolean; total: number }>> {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT DATE_FORMAT(day, '%Y-%m-%d') AS d, kind, count FROM TenancyFallbackDaily WHERE app = ? AND day BETWEEN ? AND ?",
    [app, from, to],
  );
  const out = new Map<string, { heartbeat: boolean; total: number }>();
  for (const r of rows) {
    const e = out.get(String(r.d)) ?? { heartbeat: false, total: 0 };
    if (r.kind === "_heartbeat") e.heartbeat = true;
    else e.total += Number(r.count);
    out.set(String(r.d), e);
  }
  return out;
}

export interface StrictEvaluation {
  turnedOn: TenancyApp[];
  alerts: Array<{ app: TenancyApp; day: string; total: number }>;
}

/** The daily decision (idempotent; run hourly). */
export async function evaluateStrictMode(now = new Date()): Promise<StrictEvaluation> {
  const result: StrictEvaluation = { turnedOn: [], alerts: [] };
  const today = utcDay(now);
  const state = { ...(await getPlatformSetting("tenancy.strict")) };
  let changed = false;
  for (const app of TENANCY_APPS) {
    const cur = state[app] ?? { on: false, since: null };
    if (!cur.on) {
      const from = addDays(today, -CLEAN_DAYS);
      const to = addDays(today, -1);
      const days = await daysOf(app, from, to);
      let clean = true;
      for (let i = 1; i <= CLEAN_DAYS; i++) {
        const d = days.get(addDays(today, -i));
        if (!d || !d.heartbeat || d.total > 0) clean = false;
      }
      if (clean) {
        state[app] = { on: true, since: now.toISOString(), lastAlertDay: null };
        result.turnedOn.push(app);
        changed = true;
      }
    } else {
      const days = await daysOf(app, addDays(today, -1), today);
      for (const d of [today, addDays(today, -1)]) {
        const e = days.get(d);
        if (e && e.total > 0 && cur.lastAlertDay !== today) {
          result.alerts.push({ app, day: d, total: e.total });
          state[app] = { ...cur, lastAlertDay: today };
          changed = true;
          break;
        }
      }
    }
  }
  if (changed) await setPlatformSetting("tenancy.strict", state);
  if (result.turnedOn.length || result.alerts.length) {
    try {
      const { notifyPlatformStaff } = await import("../tenantMgmt/notify");
      const { PLATFORM_CAPS } = await import("../tenantMgmt/catalog");
      for (const app of result.turnedOn) {
        await notifyPlatformStaff({
          event: "tenancy.strict_on",
          caps: [PLATFORM_CAPS.view],
          title: `${app}: strict school mode is on`,
          body: `${CLEAN_DAYS} days without guessing the school. Requests that don't name one are now refused.`,
          link: "/platform",
          subjectType: "tenant",
          subjectId: 1,
        }).catch(() => 0);
      }
      for (const a of result.alerts) {
        await notifyPlatformStaff({
          event: "tenancy.fallback_alert",
          caps: [PLATFORM_CAPS.view],
          title: `${a.app}: ${a.total} request(s) without a school`,
          body: `On ${a.day}, in strict mode. They were refused; check the app's logs.`,
          link: "/platform",
          subjectType: "tenant",
          subjectId: 1,
        }).catch(() => 0);
      }
    } catch (err) {
      logger.warn("[tenancy] strict-mode notice failed", { error: (err as Error)?.message });
    }
  }
  return result;
}

/** Hourly tick: report MIS's own counts, decide, apply MIS's own flag. Never throws. */
export async function tenancyStrictTick(now = new Date()): Promise<void> {
  try {
    await reportMisFallbacks(now);
    await evaluateStrictMode(now);
    setStrictMode((await strictFlags()).mis);
  } catch (err) {
    if (!isControlPlaneMissing(err)) logger.warn("[tenancy] strict-mode tick failed", { error: (err as Error)?.message });
  }
}

/** For the platform Overview: last 7 days per app + the flags. */
export async function tenancyHealth(now = new Date()) {
  const today = utcDay(now);
  const flags = await getPlatformSetting("tenancy.strict");
  const out = [];
  for (const app of TENANCY_APPS) {
    const days = await daysOf(app, addDays(today, -CLEAN_DAYS), today).catch(() => new Map());
    const series = [];
    for (let i = CLEAN_DAYS; i >= 0; i--) {
      const d = addDays(today, -i);
      const e = days.get(d);
      series.push({ day: d, reported: !!e?.heartbeat, fallbacks: e?.total ?? 0 });
    }
    out.push({ app, strict: !!flags?.[app]?.on, since: flags?.[app]?.since ?? null, days: series });
  }
  return out;
}
