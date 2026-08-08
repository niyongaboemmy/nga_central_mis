import { getUsersWithPagination, Role } from "../api/users";

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

// Shared across Users Management (role chip counts, stat cards) and the
// Users Dashboard tab so switching between them doesn't re-issue the same
// per-role count requests within the cache TTL.
export const fetchUserBreakdown = async (
  roles: Role[],
  force = false,
): Promise<UserBreakdown> => {
  if (!force && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }
  if (!force && inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    const [overallTotalRes, overallActiveRes, overallDisabledRes, ...perRole] =
      await Promise.all([
        getUsersWithPagination(1, 1),
        getUsersWithPagination(1, 1, undefined, undefined, "ACTIVE"),
        getUsersWithPagination(1, 1, undefined, undefined, "INACTIVE"),
        ...roles.map((role) =>
          Promise.all([
            getUsersWithPagination(1, 1, role.role_id.toString()),
            getUsersWithPagination(
              1,
              1,
              role.role_id.toString(),
              undefined,
              "ACTIVE",
            ),
          ]),
        ),
      ]);

    const roleCounts: RoleCount[] = roles.map((role, i) => {
      const [totalRes, activeRes] = perRole[i] as [
        Awaited<ReturnType<typeof getUsersWithPagination>>,
        Awaited<ReturnType<typeof getUsersWithPagination>>,
      ];
      const total = totalRes?.total ?? 0;
      const active = activeRes?.total ?? 0;
      return { role, active, disabled: Math.max(0, total - active), total };
    });

    const data: UserBreakdown = {
      roleCounts,
      overallTotal: overallTotalRes?.total ?? 0,
      overallActive: overallActiveRes?.total ?? 0,
      overallDisabled: overallDisabledRes?.total ?? 0,
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
