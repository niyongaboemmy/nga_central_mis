/**
 * The school's timezone (MIS-S7). Every "what day / what hour is it at school"
 * question reads the current tenant's timezone; outside a tenant context (or
 * for a tenant without one) it falls back to SCHOOL_TIMEZONE, then
 * Africa/Kigali -- what the code hard-coded before tenancy.
 *
 * Africa/Kigali is UTC+2 all year, so it keeps the exact fixed offset; any
 * other zone gets its real (DST-aware) offset from Intl.
 */
import { currentRealTenantOrNull } from "./context";

export const DEFAULT_TIMEZONE = "Africa/Kigali";

const valid = new Map<string, boolean>();
function isValidZone(tz: string): boolean {
  let ok = valid.get(tz);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      ok = true;
    } catch {
      ok = false;
    }
    valid.set(tz, ok);
  }
  return ok;
}

/** The IANA timezone of the current school. */
export function tenantTimezone(): string {
  const candidates = [currentRealTenantOrNull()?.timezone, process.env.SCHOOL_TIMEZONE, DEFAULT_TIMEZONE];
  for (const c of candidates) {
    const tz = String(c ?? "").trim();
    if (tz && isValidZone(tz)) return tz;
  }
  return DEFAULT_TIMEZONE;
}

const FIXED: Record<string, number> = { "Africa/Kigali": 120, UTC: 0, "Etc/UTC": 0 };
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Offset of `tz` from UTC at instant `at`, in milliseconds (local = utc + offset). */
export function tzOffsetMs(at: number | Date = Date.now(), tz: string = tenantTimezone()): number {
  const fixed = FIXED[tz];
  if (fixed !== undefined) return fixed * 60_000;
  const ms = typeof at === "number" ? at : at.getTime();
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(ms))) if (part.type !== "literal") p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The UTC instant of a wall-clock time (ms since the local epoch) in `tz`. */
export function localToUtcMs(localMs: number, tz: string = tenantTimezone()): number {
  const fixed = FIXED[tz];
  if (fixed !== undefined) return localMs - fixed * 60_000;
  // Two passes settle DST edges (the offset at the guess, then at the answer).
  let guess = localMs - tzOffsetMs(localMs, tz);
  guess = localMs - tzOffsetMs(guess, tz);
  return guess;
}
