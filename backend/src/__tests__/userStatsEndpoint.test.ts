import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { User } from "../db/schema";
import {
  createUser,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// The Users Management chips and the Users Dashboard used to derive their
// counts by firing `3 + 2 * roles` requests at
// `/users?page=1&limit=1&userRole=<n>[&status=ACTIVE]` and reading
// X-Total-Count off each response — 27 requests for a 12-role install, each
// running the full per-user role/permission/profile fan-out server side.
// `/users/stats` answers all of it in two aggregate queries.
describe("GET /users/stats — role and status counts in one request", () => {
  let viewerToken: string;
  let countedRoleId: number;
  let emptyRoleId: number;
  let disabledUserId: number;

  beforeAll(async () => {
    const viewerId = await createUser({ userType: "ADMIN" });
    const viewerRoleId = await createRoleWithPermissions("STATS_VIEWER", [
      Permissions.VIEW_USERS,
    ]);
    await assignRole(viewerId, viewerRoleId);
    viewerToken = signToken(viewerId);

    countedRoleId = await createRoleWithPermissions("COUNTED_ROLE", []);
    emptyRoleId = await createRoleWithPermissions("EMPTY_ROLE", []);

    // Two active holders and one disabled holder of the counted role.
    for (let i = 0; i < 2; i++) {
      const userId = await createUser({ userType: "STUDENT" });
      await assignRole(userId, countedRoleId);
    }
    disabledUserId = await createUser({ userType: "STUDENT" });
    await assignRole(disabledUserId, countedRoleId);
    await db
      .update(User)
      .set({ status: "INACTIVE" })
      .where(eq(User.user_id, disabledUserId));
  });

  it("splits each role into active and disabled holders", async () => {
    const res = await request(app)
      .get("/users/stats")
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    const counted = res.body.data.roles.find(
      (r: any) => r.role_id === countedRoleId,
    );
    expect(counted).toBeDefined();
    expect(counted.total).toBe(3);
    expect(counted.active).toBe(2);
    expect(counted.disabled).toBe(1);
  });

  it("reports zeros for a role nobody holds, rather than omitting it", async () => {
    const res = await request(app)
      .get("/users/stats")
      .set("Authorization", `Bearer ${viewerToken}`);

    const empty = res.body.data.roles.find(
      (r: any) => r.role_id === emptyRoleId,
    );
    expect(empty).toBeDefined();
    expect(empty).toMatchObject({ total: 0, active: 0, disabled: 0 });
  });

  it("returns overall totals whose active/disabled split adds up", async () => {
    const res = await request(app)
      .get("/users/stats")
      .set("Authorization", `Bearer ${viewerToken}`);

    const { total, active, disabled } = res.body.data.overall;
    expect(total).toBeGreaterThanOrEqual(4);
    expect(active + disabled).toBe(total);
    expect(disabled).toBeGreaterThanOrEqual(1);
  });

  it("rejects a caller without VIEW_USERS", async () => {
    const outsiderId = await createUser({ userType: "STUDENT" });
    const res = await request(app)
      .get("/users/stats")
      .set("Authorization", `Bearer ${signToken(outsiderId)}`);

    expect(res.status).toBe(403);
  });
});
