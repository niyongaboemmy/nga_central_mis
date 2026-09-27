import { AccessSnapshot } from "../../vendor/nga-access";
import { compileSnapshot, currentAccessVersion } from "./compile";

/**
 * In-process snapshot cache keyed by (user, access_version, app, year).
 *
 * Correctness does not depend on the TTL: every change that alters access
 * bumps User.access_version, and a lookup always reads the current version
 * first (one indexed PK read), so a stale entry is never served after a
 * change. The TTL only bounds memory and picks up day-boundary effects
 * (valid_from / valid_until).
 */

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 2000;

interface Entry {
  at: number;
  snapshot: AccessSnapshot;
}
const cache = new Map<string, Entry>();
/** (user, app, year) -> most recent entry, for callers that accept staleness. */
const latest = new Map<string, Entry>();

export async function getSnapshot(
  userId: number,
  app: string,
  opts: { yearId?: number | null; maxStaleMs?: number } = {},
): Promise<AccessSnapshot> {
  const slot = `${userId}|${app}|${opts.yearId === undefined ? "cur" : opts.yearId}`;
  // Shadow-mode comparisons only feed a review log, so they may reuse a
  // recent snapshot without the version read -- production's pool has a
  // single connection and this runs on every guarded request.
  if (opts.maxStaleMs) {
    const recent = latest.get(slot);
    if (recent && Date.now() - recent.at < opts.maxStaleMs) return recent.snapshot;
  }

  const v = await currentAccessVersion(userId);
  const key = `${userId}|${v}|${app}|${opts.yearId === undefined ? "cur" : opts.yearId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    latest.set(slot, hit);
    return hit.snapshot;
  }

  const snapshot = await compileSnapshot(userId, app, opts);
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  if (latest.size >= MAX_ENTRIES) latest.clear();
  const entry = { at: Date.now(), snapshot };
  cache.set(key, entry);
  latest.set(slot, entry);
  return snapshot;
}

/** Tests and bulk operations. */
export function clearSnapshotCache() {
  cache.clear();
  latest.clear();
}
