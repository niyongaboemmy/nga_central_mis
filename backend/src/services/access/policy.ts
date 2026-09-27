import { sql } from "drizzle-orm";
import { db } from "../../db";
import { AccessShadowDiff } from "../../db/accessSchema";
import {
  AccessSnapshot,
  decide,
  Decision,
  Depth,
  scopeFor,
  ScopeEntry,
  Target,
} from "../../vendor/nga-access";
import { getSnapshot } from "./snapshotCache";
import { accessTablesPresent } from "./registry";
import logger from "../../utils/logger";

/**
 * How the MIS uses the v2 engine for its own routes (plan §13):
 *
 *   off      legacy checks only (v2 never consulted)
 *   shadow   legacy checks decide; v2 decides too and every disagreement is
 *            recorded in AccessShadowDiff for review            <- default
 *   enforce  v2 decides
 *
 * Tests run with "off" unless a test sets it, so existing suites behave
 * exactly as before.
 */
export type AccessMode = "off" | "shadow" | "enforce";

export function misAccessMode(): AccessMode {
  const raw = (process.env.ACCESS_V2_MIS_MODE || "").toLowerCase();
  if (raw === "off" || raw === "shadow" || raw === "enforce") return raw;
  return process.env.NODE_ENV === "test" ? "off" : "shadow";
}

let engineReadyAt = 0;
let engineReadyValue = false;
/**
 * Are migration 090's tables there? Checked at most every 5 minutes, so a
 * server running this code before the migration neither errors nor logs on
 * every request -- shadow comparisons are simply skipped.
 */
export async function engineReady(): Promise<boolean> {
  if (Date.now() - engineReadyAt < 5 * 60 * 1000) return engineReadyValue;
  try {
    engineReadyValue = await accessTablesPresent();
  } catch {
    engineReadyValue = false;
  }
  engineReadyAt = Date.now();
  return engineReadyValue;
}

/** The requesting user's MIS snapshot, memoised on the request. */
export async function requestSnapshot(req: any, app = "mis"): Promise<AccessSnapshot> {
  req._accessSnapshots ??= {};
  if (!req._accessSnapshots[app]) {
    req._accessSnapshots[app] = await getSnapshot(req.user.userId, app);
  }
  return req._accessSnapshots[app];
}

/** Any-of decision over several capabilities; deepest covering depth wins. */
export function decideAny(
  snapshot: AccessSnapshot,
  caps: string[],
  target?: Target | null,
  minDepth?: Depth | null,
): Decision {
  let best: Decision = { allowed: false, depth: null, via: [] };
  for (const cap of caps) {
    const d = decide(snapshot, cap, target, minDepth);
    if (d.allowed && (!best.allowed || (d.depth && !best.depth))) best = d;
  }
  return best;
}

const routeOf = (req: any) =>
  `${req.method} ${(req.baseUrl || "") + (req.route?.path || req.path || "")}`.slice(0, 200);

const recentDiffs = new Map<string, number>();
const DIFF_THROTTLE_MS = 60_000;

/** Count a legacy/v2 disagreement (throttled per key, never throws). */
export async function recordShadowDiff(entry: {
  userId: number;
  capability: string;
  route: string;
  legacyAllowed: boolean;
  v2: Decision;
  target?: Target | null;
}) {
  const key = `${entry.userId}|${entry.capability}|${entry.route}|${entry.legacyAllowed}|${entry.v2.allowed}`;
  const last = recentDiffs.get(key) ?? 0;
  if (Date.now() - last < DIFF_THROTTLE_MS) return;
  recentDiffs.set(key, Date.now());
  if (recentDiffs.size > 5000) recentDiffs.clear();
  try {
    await db
      .insert(AccessShadowDiff)
      .values({
        app: "mis",
        user_id: entry.userId,
        capability: entry.capability.slice(0, 150),
        route: entry.route,
        legacy_allowed: entry.legacyAllowed ? 1 : 0,
        v2_allowed: entry.v2.allowed ? 1 : 0,
        v2_depth: entry.v2.depth,
        sample_target: entry.target ? JSON.stringify(entry.target).slice(0, 500) : null,
      })
      .onDuplicateKeyUpdate({
        set: {
          hits: sql`${AccessShadowDiff.hits} + 1`,
          last_seen: sql`CURRENT_TIMESTAMP`,
          v2_depth: entry.v2.depth,
        },
      });
  } catch (err: any) {
    logger.warn(`[access] shadow diff not recorded: ${err?.message ?? err}`);
  }
}

/**
 * Shadow comparison for the legacy `authorize(...)` guard: legacy semantics
 * are global ("holds the permission"), so v2 is asked the same question with
 * no target ("holds it anywhere"). Never changes the response.
 */
export async function shadowCompareLegacy(req: any, perms: string[], legacyAllowed: boolean) {
  if (misAccessMode() !== "shadow" || !req?.user?.userId) return;
  if (!(await engineReady())) return;
  try {
    const snapshot = await getSnapshot(req.user.userId, "mis", { maxStaleMs: 60_000 });
    const v2 = decideAny(snapshot, perms);
    if (v2.allowed !== legacyAllowed) {
      await recordShadowDiff({
        userId: req.user.userId,
        capability: perms.join("|"),
        route: routeOf(req),
        legacyAllowed,
        v2,
      });
    }
  } catch (err: any) {
    logger.warn(`[access] shadow compare failed: ${err?.message ?? err}`);
  }
}

export interface AuthorizeInOptions {
  /** minimum read depth (READ capabilities) */
  minDepth?: Depth;
  /**
   * Legacy permissions that authorised this route before v2 (any-of). Default:
   * the same names. Use [] for a route that was open to every signed-in user,
   * so shadow mode records who v2 would now refuse.
   */
  legacy?: string[];
}

/**
 * Scoped guard: may the user use `cap` on the target this request is about?
 * The decision (and the snapshot) are left on req.access for the handler, so
 * list endpoints can call `req.access.scopeFor(...)` to filter rows.
 */
export const authorizeIn =
  (
    cap: string | string[],
    targetOf?: (req: any) => Target | null | undefined,
    opts: AuthorizeInOptions = {},
  ) =>
  async (req: any, res: any, next: any) => {
    const caps = Array.isArray(cap) ? cap : [cap];
    const legacyPerms = opts.legacy ?? caps;
    const legacyAllowed =
      legacyPerms.length === 0 ||
      legacyPerms.some((p) => (req.user?.permissions ?? []).includes(p));
    const mode = misAccessMode();

    if (mode === "off" || (mode === "shadow" && !(await engineReady()))) {
      return legacyAllowed ? next() : res.status(403).json({ message: "Forbidden" });
    }

    let v2: Decision = { allowed: false, depth: null, via: [] };
    let target: Target | null | undefined;
    try {
      target = targetOf ? targetOf(req) : null;
      const snapshot = await requestSnapshot(req);
      v2 = decideAny(snapshot, caps, target, opts.minDepth ?? null);
      req.access = {
        snapshot,
        decision: v2,
        scopeFor: (c: string, d?: Depth): ScopeEntry | null => scopeFor(snapshot, c, d ?? null),
      };
    } catch (err: any) {
      logger.error(`[access] v2 decision failed: ${err?.message ?? err}`);
      if (mode === "enforce") return res.status(503).json({ message: "Access check unavailable" });
    }

    if (mode === "shadow") {
      if (v2.allowed !== legacyAllowed) {
        await recordShadowDiff({
          userId: req.user.userId,
          capability: caps.join("|"),
          route: routeOf(req),
          legacyAllowed,
          v2,
          target,
        });
      }
      return legacyAllowed ? next() : res.status(403).json({ message: "Forbidden" });
    }

    return v2.allowed ? next() : res.status(403).json({ message: "Forbidden" });
  };

/**
 * Guard for the v2-only endpoints (Access Studio, grants, roles...). These
 * never existed under the legacy model, so the v2 engine always decides --
 * whatever the MIS mode.
 */
export const requireCapability =
  (
    cap: string | string[],
    targetOf?: (req: any) => Target | null | undefined,
    minDepth?: Depth,
  ) =>
  async (req: any, res: any, next: any) => {
    try {
      const caps = Array.isArray(cap) ? cap : [cap];
      const snapshot = await requestSnapshot(req);
      const d = decideAny(snapshot, caps, targetOf ? targetOf(req) : null, minDepth ?? null);
      if (!d.allowed) return res.status(403).json({ message: "Forbidden" });
      req.access = {
        snapshot,
        decision: d,
        scopeFor: (c: string, dd?: Depth) => scopeFor(snapshot, c, dd ?? null),
      };
      next();
    } catch (err) {
      next(err);
    }
  };
