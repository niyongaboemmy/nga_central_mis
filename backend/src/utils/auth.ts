import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { UserRole, Role, RolePermission, Permission } from "../db/schema";

export const getUserPermissions = async (userId: number): Promise<string[]> => {
  const permissions = await db
    .select({ name: Permission.name })
    .from(UserRole)
    .innerJoin(
      Role,
      and(eq(UserRole.role_id, Role.role_id), eq(Role.status, "ACTIVE"))
    )
    .innerJoin(
      RolePermission,
      and(
        eq(Role.role_id, RolePermission.role_id),
        eq(RolePermission.role_id, Role.role_id)
      )
    )
    .innerJoin(
      Permission,
      and(
        eq(RolePermission.perm_id, Permission.perm_id),
        eq(Permission.status, "ACTIVE")
      )
    )
    .where(eq(UserRole.user_id, userId));

  return permissions.map((p) => p.name);
};
