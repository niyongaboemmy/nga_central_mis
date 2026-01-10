/**
 * Static permission constants for frontend access control
 * These should match the permissions stored in the database
 */

// Core management permissions
export const Permissions = {
  // User management
  MANAGE_USERS: "MANAGE_USERS",
  VIEW_USERS: "VIEW_USERS",

  // Role & Permission management
  MANAGE_ROLES: "MANAGE_ROLES",
  MANAGE_PERMISSIONS: "MANAGE_PERMISSIONS",

  // Academic management
  MANAGE_ACADEMICS: "MANAGE_ACADEMICS",
  VIEW_ACADEMICS: "VIEW_ACADEMICS",

  // Class management
  MANAGE_CLASSES: "MANAGE_CLASSES",
  VIEW_CLASSES: "VIEW_CLASSES",

  // Student management
  MANAGE_STUDENTS: "MANAGE_STUDENTS",
  VIEW_STUDENTS: "VIEW_STUDENTS",

  // Teacher management
  MANAGE_TEACHERS: "MANAGE_TEACHERS",
  VIEW_TEACHERS: "VIEW_TEACHERS",
  VIEW_MY_ASSIGNED_SUBJECTS: "VIEW_MY_ASSIGNED_SUBJECTS",

  // Parent management
  MANAGE_PARENTS: "MANAGE_PARENTS",
  VIEW_PARENTS: "VIEW_PARENTS",

  // Grades & Results
  MANAGE_GRADES: "MANAGE_GRADES",
  VIEW_GRADES: "VIEW_GRADES",

  // Attendance
  MANAGE_ATTENDANCE: "MANAGE_ATTENDANCE",
  VIEW_ATTENDANCE: "VIEW_ATTENDANCE",

  // Reports
  VIEW_REPORTS: "VIEW_REPORTS",
  GENERATE_REPORTS: "GENERATE_REPORTS",

  // System settings
  MANAGE_SETTINGS: "MANAGE_SETTINGS",

  // Admin
  ADMIN: "ADMIN",
} as const;

export type PermissionKey = keyof typeof Permissions;
export type PermissionValue = (typeof Permissions)[PermissionKey];

/**
 * DEPRECATED: These functions are deprecated.
 * Use the role-based hasPermission from usePermissions hook instead.
 *
 * The new system checks permissions through user.roles[].permissions[]
 * instead of flat permission arrays.
 */

// Legacy functions - kept for backward compatibility but deprecated
export const hasPermission = (
  userPermissions: string[],
  requiredPermission: PermissionValue
): boolean => {
  console.warn(
    "hasPermission from constants/permissions.ts is deprecated. Use usePermissions hook instead."
  );
  // Admin has all permissions
  if (userPermissions.includes(Permissions.ADMIN)) {
    return true;
  }
  return userPermissions.includes(requiredPermission);
};

export const hasAnyPermission = (
  userPermissions: string[],
  requiredPermissions: PermissionValue[]
): boolean => {
  console.warn(
    "hasAnyPermission from constants/permissions.ts is deprecated. Use usePermissions hook instead."
  );
  if (userPermissions.includes(Permissions.ADMIN)) {
    return true;
  }
  return requiredPermissions.some((perm) => userPermissions.includes(perm));
};

export const hasAllPermissions = (
  userPermissions: string[],
  requiredPermissions: PermissionValue[]
): boolean => {
  console.warn(
    "hasAllPermissions from constants/permissions.ts is deprecated. Use usePermissions hook instead."
  );
  if (userPermissions.includes(Permissions.ADMIN)) {
    return true;
  }
  return requiredPermissions.every((perm) => userPermissions.includes(perm));
};

/**
 * Get all available permission values as an array
 */
export const getAllPermissions = (): PermissionValue[] => {
  return Object.values(Permissions);
};

/**
 * Group permissions by category
 */
export const permissionGroups = {
  users: [Permissions.MANAGE_USERS, Permissions.VIEW_USERS],
  roles: [Permissions.MANAGE_ROLES, Permissions.MANAGE_PERMISSIONS],
  academics: [Permissions.MANAGE_ACADEMICS, Permissions.VIEW_ACADEMICS],
  classes: [Permissions.MANAGE_CLASSES, Permissions.VIEW_CLASSES],
  students: [Permissions.MANAGE_STUDENTS, Permissions.VIEW_STUDENTS],
  teachers: [
    Permissions.MANAGE_TEACHERS,
    Permissions.VIEW_TEACHERS,
    Permissions.VIEW_MY_ASSIGNED_SUBJECTS,
  ],
  parents: [Permissions.MANAGE_PARENTS, Permissions.VIEW_PARENTS],
  grades: [Permissions.MANAGE_GRADES, Permissions.VIEW_GRADES],
  attendance: [Permissions.MANAGE_ATTENDANCE, Permissions.VIEW_ATTENDANCE],
  reports: [Permissions.VIEW_REPORTS, Permissions.GENERATE_REPORTS],
  settings: [Permissions.MANAGE_SETTINGS],
  admin: [Permissions.ADMIN],
} as const;

export type PermissionGroupKey = keyof typeof permissionGroups;
