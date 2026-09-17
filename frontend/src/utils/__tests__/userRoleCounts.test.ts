import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserStatsMock = vi.fn();
vi.mock("../../api/users", () => ({
  getUserStats: (...args: any[]) => getUserStatsMock(...args),
}));

import {
  fetchUserBreakdown,
  invalidateUserBreakdownCache,
} from "../userRoleCounts";

const ROLES = Array.from({ length: 12 }, (_, i) => ({
  role_id: i + 1,
  name: `ROLE_${i + 1}`,
  status: "ACTIVE" as const,
}));

const STATS = {
  overall: { total: 100, active: 90, disabled: 10 },
  roles: ROLES.map((r) => ({
    ...r,
    total: r.role_id,
    active: r.role_id - 1,
    disabled: 1,
  })),
};

describe("fetchUserBreakdown", () => {
  beforeEach(() => {
    getUserStatsMock.mockReset();
    getUserStatsMock.mockResolvedValue(STATS);
    invalidateUserBreakdownCache();
  });

  it("makes exactly one request for a 12-role install", async () => {
    // The old implementation issued `3 + 2 * roles` = 27 requests here, one
    // `/users?page=1&limit=1&userRole=...` per role per status.
    await fetchUserBreakdown(ROLES as any, true);
    expect(getUserStatsMock).toHaveBeenCalledTimes(1);
  });

  it("maps server counts onto the caller's role list, preserving order", async () => {
    const breakdown = await fetchUserBreakdown(ROLES as any, true);

    expect(breakdown.roleCounts).toHaveLength(12);
    expect(breakdown.roleCounts[0].role.role_id).toBe(1);
    expect(breakdown.roleCounts[0]).toMatchObject({
      total: 1,
      active: 0,
      disabled: 1,
    });
    expect(breakdown.overallTotal).toBe(100);
    expect(breakdown.overallActive).toBe(90);
    expect(breakdown.overallDisabled).toBe(10);
  });

  it("reports zeros for a role the server did not count", async () => {
    const breakdown = await fetchUserBreakdown(
      [...ROLES, { role_id: 999, name: "GHOST", status: "ACTIVE" }] as any,
      true,
    );
    const ghost = breakdown.roleCounts.find((rc) => rc.role.role_id === 999);
    expect(ghost).toMatchObject({ total: 0, active: 0, disabled: 0 });
  });

  it("serves a second call from cache within the TTL", async () => {
    await fetchUserBreakdown(ROLES as any, true);
    await fetchUserBreakdown(ROLES as any);
    expect(getUserStatsMock).toHaveBeenCalledTimes(1);
  });

  it("shares one request between components that mount in the same tick", async () => {
    // Users Management and the Users Dashboard both ask on mount; the second
    // must join the in-flight request rather than start its own.
    await Promise.all([
      fetchUserBreakdown(ROLES as any, true),
      fetchUserBreakdown(ROLES as any, true),
    ]);
    expect(getUserStatsMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after the cache is invalidated", async () => {
    await fetchUserBreakdown(ROLES as any, true);
    invalidateUserBreakdownCache();
    await fetchUserBreakdown(ROLES as any);
    expect(getUserStatsMock).toHaveBeenCalledTimes(2);
  });
});
