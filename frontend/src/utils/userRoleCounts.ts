import { getUserStats, Role } from "../api/users";

export interface RoleCount {
  role: Role;
  active: number;
  disabled: number;
  total: number;
}

export interface UserBreakdown {
  roleCounts: RoleCount[];
  overallTotal: number;
  overallActive: number;
  overallDisabled: number;
}

const CACHE_TTL_MS = 30_000;
let cache: { ts: number; data: UserBreakdown } | null = null;
let inFlight: Promise<UserBreakdown> | null = null;

export const invalidateUserBreakdownCache = () => {
  cache = null;
};

/**
 * Role and status counts for Users Management (chips, stat cards) and the Users
 * Dashboard tab.
 *
 * This used to fan out into `3 + 2 * roles` requests — a `/users?page=1&limit=1`
 * call per role per status, purely to read `X-Total-Count` off each response
 * (27 requests on a 12-role install, each running the full per-user
 * role/permission/profile expansion server side). `/users/stats` answers all of
 * it in one request backed by two GROUP BY queries.
 *
 * The `roles` argument is kept only to order and label the result the way the
 * caller already knows the roles; the counts themselves come from the server.
 */
export const fetchUserBreakdown = async (
  roles: Role[],
  force = false,
): Promise<UserBreakdown> => {
  if (!force && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }
  // Two components mounting in the same tick share one request, `force` or not
  // — a forced refresh still has nothing to gain from a second identical call.
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    const stats = await getUserStats();
    const byRoleId = new Map(stats.roles.map((r) => [r.role_id, r]));

    // Prefer the caller's role list for ordering/labels; fall back to whatever
    // the server reported for roles the caller has not loaded.
    const source: Role[] =
      roles.length > 0
        ? roles
        : (stats.roles as unknown as Role[]);

    const roleCounts: RoleCount[] = source.map((role) => {
      const counts = byRoleId.get(role.role_id);
      return {
        role,
        active: counts?.active ?? 0,
        disabled: counts?.disabled ?? 0,
        total: counts?.total ?? 0,
      };
    });

    const data: UserBreakdown = {
      roleCounts,
      overallTotal: stats.overall.total,
      overallActive: stats.overall.active,
      overallDisabled: stats.overall.disabled,
    };
    cache = { ts: Date.now(), data };
    return data;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
};
