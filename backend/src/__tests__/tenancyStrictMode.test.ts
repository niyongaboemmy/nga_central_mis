/**
 * Automatic strict tenancy (TENANT_SWITCHING_PLAN.md Appendix A.6): reports,
 * the 7-clean-days switch, alerts after it, MIS applying its own flag.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { controlPool } from "../db/platform";
import { CLEAN_DAYS, evaluateStrictMode, recordFallbackReport, strictFlags, tenancyHealth, tenancyStrictTick } from "../services/tenancy/strictMode";
import { setPlatformSetting } from "../services/tenantMgmt/settings";
import { countFallback, resetFallbacks } from "../tenancy/fallbacks";
import { legacyDefaultTid, resolveDataTid, setStrictMode, strictActive, tenancyMode } from "../tenancy/context";
import { ensurePlatform } from "../test/tenantMgmtFixtures";

const NOW = new Date("2031-03-20T10:00:00Z"); // far from any real report
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

async function clearReports() {
  await controlPool().query("DELETE FROM TenancyFallbackDaily WHERE day BETWEEN ? AND ?", [day(-20), day(2)]);
}

beforeAll(async () => {
  await ensurePlatform();
});
beforeEach(async () => {
  await clearReports();
  await setPlatformSetting("tenancy.strict", {});
  setStrictMode(false);
  resetFallbacks();
});
afterAll(async () => {
  await clearReports();
  await setPlatformSetting("tenancy.strict", {});
  setStrictMode(false);
});

const cleanWeek = async (app: string, skip?: number) => {
  for (let i = 1; i <= CLEAN_DAYS; i++) if (i !== skip) await recordFallbackReport({ app, day: day(-i), counts: { no_context: 0 } }, new Date(`${day(-i)}T12:00:00Z`));
};

describe("reports", () => {
  it("keeps the highest cumulative count of the day and validates input", async () => {
    await recordFallbackReport({ app: "taskmentor", day: day(0), counts: { no_context: 3 }, sites: ["a"] }, NOW);
    await recordFallbackReport({ app: "taskmentor", day: day(0), counts: { no_context: 1 } }, NOW);
    const [rows] = await controlPool().query<any[]>("SELECT kind, count FROM TenancyFallbackDaily WHERE app = 'taskmentor' AND day = ? ORDER BY kind", [day(0)]);
    expect(Object.fromEntries(rows.map((r: any) => [r.kind, r.count]))).toEqual({ _heartbeat: 0, legacy_tid: 0, no_context: 3, payload_no_tid: 0 });
    await expect(recordFallbackReport({ app: "nope", day: day(0), counts: {} }, NOW)).rejects.toThrow(/Unknown app/);
    await expect(recordFallbackReport({ app: "tupo", day: "yesterday", counts: {} }, NOW)).rejects.toThrow(/YYYY-MM-DD/);
    // Out-of-window days are ignored silently.
    await recordFallbackReport({ app: "tupo", day: day(-10), counts: { no_context: 9 } }, NOW);
    const [old] = await controlPool().query<any[]>("SELECT 1 FROM TenancyFallbackDaily WHERE app = 'tupo' AND day = ?", [day(-10)]);
    expect(old).toHaveLength(0);
  });
});

describe("the switch", () => {
  it("turns an app strict after 7 reported clean days, not before", async () => {
    await cleanWeek("tendo", 3); // one day missing
    expect((await evaluateStrictMode(NOW)).turnedOn).not.toContain("tendo");
    await recordFallbackReport({ app: "tendo", day: day(-3), counts: { legacy_tid: 1 } }, new Date(`${day(-3)}T12:00:00Z`));
    expect((await evaluateStrictMode(NOW)).turnedOn).not.toContain("tendo"); // a dirty day
    await clearReports();
    await cleanWeek("tendo");
    const r = await evaluateStrictMode(NOW);
    expect(r.turnedOn).toEqual(["tendo"]);
    expect((await strictFlags()).tendo).toBe(true);
    expect((await evaluateStrictMode(NOW)).turnedOn).toEqual([]); // idempotent
  });

  it("alerts once a day per app on a fallback after the switch", async () => {
    await cleanWeek("tupo");
    await evaluateStrictMode(NOW);
    await recordFallbackReport({ app: "tupo", day: day(0), counts: { payload_no_tid: 2 } }, NOW);
    const first = await evaluateStrictMode(NOW);
    expect(first.alerts).toEqual([{ app: "tupo", day: day(0), total: 2 }]);
    expect((await evaluateStrictMode(NOW)).alerts).toEqual([]);
  });

  it("health lists every app with 8 days", async () => {
    await cleanWeek("mis");
    const h = await tenancyHealth(NOW);
    expect(h.map((a) => a.app)).toEqual(["mis", "taskmentor", "tendo", "tupo"]);
    expect(h[0].days).toHaveLength(CLEAN_DAYS + 1);
    expect(h[0].days.slice(0, CLEAN_DAYS).every((d) => d.reported && d.fallbacks === 0)).toBe(true);
  });
});

describe("MIS itself", () => {
  it("counts its own fallbacks, and in strict mode refuses instead of guessing school 1", async () => {
    expect(resolveDataTid("test access")).toBe(1); // shadow: guessed
    countFallback("legacy_tid", "test");
    setStrictMode(true);
    expect(strictActive()).toBe(true);
    expect(tenancyMode()).toBe("enforce");
    expect(legacyDefaultTid()).toBeNull();
    expect(() => resolveDataTid("test access")).toThrow();
    process.env.TENANCY_STRICT = "off";
    expect(strictActive()).toBe(false);
    expect(legacyDefaultTid()).toBe(1);
    delete process.env.TENANCY_STRICT;
    setStrictMode(false);
  });

  it("the hourly tick reports MIS's counts and applies MIS's flag", async () => {
    countFallback("no_context", "tick test");
    await tenancyStrictTick();
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await controlPool().query<any[]>("SELECT kind, count FROM TenancyFallbackDaily WHERE app = 'mis' AND day = ?", [today]);
    expect(rows.find((r: any) => r.kind === "_heartbeat")).toBeTruthy();
    expect(rows.find((r: any) => r.kind === "no_context").count).toBeGreaterThanOrEqual(1);
    expect(strictActive()).toBe(false);
    await controlPool().query("DELETE FROM TenancyFallbackDaily WHERE app = 'mis' AND day = ?", [today]);
  });
});
