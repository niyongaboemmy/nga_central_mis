/**
 * Fallbacks to the primary tenant, counted (TENANT_SWITCHING_PLAN.md Appendix A.6).
 *
 * Every time MIS runs something as school 1 only because nothing named a school
 * -- data access without a tenant context (`no_context`), a token without `tid`
 * read with the legacy default (`legacy_tid`), a payload without `tid`
 * (`payload_no_tid`) -- it is counted here, per UTC day. The counts feed the
 * automatic strict mode (services/tenancy/strictMode.ts): seven clean days and the
 * app stops guessing; a fallback after that alerts platform staff.
 */
export type FallbackKind = "no_context" | "legacy_tid" | "payload_no_tid";

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

let day = utcDay();
let counts: Record<FallbackKind, number> = { no_context: 0, legacy_tid: 0, payload_no_tid: 0 };
let sites = new Set<string>();

function roll(): void {
  const now = utcDay();
  if (now !== day) {
    day = now;
    counts = { no_context: 0, legacy_tid: 0, payload_no_tid: 0 };
    sites = new Set();
  }
}

export function countFallback(kind: FallbackKind, site?: string): void {
  roll();
  counts[kind]++;
  if (site && sites.size < 10) sites.add(String(site).slice(0, 120));
}

/** Today's cumulative counts (the report body). */
export function fallbackSnapshot(): { day: string; counts: Record<FallbackKind, number>; sites: string[] } {
  roll();
  return { day, counts: { ...counts }, sites: Array.from(sites) };
}

/** Tests only. */
export function resetFallbacks(): void {
  day = utcDay();
  counts = { no_context: 0, legacy_tid: 0, payload_no_tid: 0 };
  sites = new Set();
}
