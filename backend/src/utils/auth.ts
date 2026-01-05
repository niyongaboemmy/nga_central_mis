import { db } from "../db";
import { eq } from "drizzle-orm";
import { UserRole, Role, RolePermission, Permission } from "../db/schema";

export const getUserPermissions = async (userId: number): Promise<string[]> => {
  const permissions = await db
    .select({ name: Permission.name })
    .from(UserRole)
    .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
    .innerJoin(RolePermission, eq(Role.role_id, RolePermission.role_id))
    .innerJoin(Permission, eq(RolePermission.perm_id, Permission.perm_id))
    .where(eq(UserRole.user_id, userId));

  return permissions.map((p) => p.name);
};
