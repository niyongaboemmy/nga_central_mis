import { describe, expect, it } from "vitest";
import { defaultPlan, periodView, provisionalPlan } from "../services/sideProjects/stages";

describe("side projects: provisional stage plan", () => {
  const base = { start_date: null, target_date: "2026-12-06", created_at: "2026-11-18T08:00:00Z" };

  it("draws a plan from the creation day when there is no start date", () => {
    const { plan, assumedStart } = provisionalPlan(base, []);
    expect(assumedStart).toBe("2026-11-18");
    expect(plan).toHaveLength(4);
    expect(plan[0].start).toBe("2026-11-18");
    const view = periodView({ ...base, status: "IDEA", paused_from: null }, plan, [], new Date("2026-11-18T12:00:00Z"), assumedStart);
    expect(view.assumedStart).toBe("2026-11-18");
    expect(view.stages.every((s) => s.plannedStart && s.plannedEnd)).toBe(true);
  });

  it("prefers the work start date over the creation day", () => {
    expect(provisionalPlan({ ...base, started_at: "2026-11-20T09:00:00Z" }, []).assumedStart).toBe("2026-11-20");
  });

  it("keeps a real start date and stored plan untouched", () => {
    const stored = defaultPlan("2026-11-10", "2026-12-06");
    expect(provisionalPlan({ ...base, start_date: "2026-11-10" }, stored)).toEqual({ plan: stored, assumedStart: null });
    expect(provisionalPlan({ ...base, start_date: "2026-11-10" }, []).plan).toEqual([]);
  });

  it("gives up when there is no closing date or the window is too short", () => {
    expect(provisionalPlan({ ...base, target_date: null }, []).plan).toEqual([]);
    expect(provisionalPlan({ ...base, target_date: "2026-11-19" }, []).plan).toEqual([]);
  });
});
