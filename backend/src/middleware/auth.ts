import jwt from "jsonwebtoken";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { UserRole, Role } from "../db/schema";

const SUPER_ADMIN_ROLE = "SUPER_ADMIN";

const getUserRoles = async (userId: number): Promise<string[]> => {
  const roles = await db
    .select({ name: Role.name })
    .from(UserRole)
    .innerJoin(
      Role,
      and(eq(UserRole.role_id, Role.role_id), eq(Role.status, "ACTIVE"))
    )
    .where(eq(UserRole.user_id, userId));
  return roles.map((r) => r.name);
};

export const authenticate = async (req: any, res: any, next: any) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }
  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
    req.user = decoded;

    // Check if user has SUPER_ADMIN role - grant all permissions
    const userRoles = await getUserRoles(decoded.userId);
    if (userRoles.includes(SUPER_ADMIN_ROLE)) {
      // SUPER_ADMIN gets all permissions
      req.user.permissions = [
        "MANAGE_USERS",
        "MANAGE_ROLES",
        "MANAGE_PERMISSIONS",
        "MANAGE_ACADEMICS",
        "MANAGE_CLASSES",
        "MANAGE_STUDENTS",
        "MANAGE_TEACHERS",
        "MANAGE_PARENTS",
        "MANAGE_FEES",
        "VIEW_FINANCE",
        "MARK_ATTENDANCE",
        "VIEW_ATTENDANCE",
        "ENTER_MARKS",
        "VIEW_RESULTS",
        "SEND_ANNOUNCEMENTS",
        "UPLOAD_DOCUMENTS",
        "VIEW_REPORTS",
        "GENERATE_REPORTS",
        "MANAGE_SETTINGS",
        "ADMIN",
      ];
    } else {
      // Regular users get permissions from their roles
      const { getUserPermissions } = await import("../utils/auth");
      req.user.permissions = await getUserPermissions(decoded.userId);
    }

    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

export const authorize =
  (requiredPerm: string) => (req: any, res: any, next: any) => {
    if (!req.user.permissions.includes(requiredPerm)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
