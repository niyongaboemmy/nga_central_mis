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
 * Check if a user has a specific permission
 * @param userPermissions - Array of permission names assigned to the user
 * @param requiredPermission - The permission to check for
 * @returns true if user has the permission or is an admin
 */
export const hasPermission = (
  userPermissions: string[],
  requiredPermission: PermissionValue
): boolean => {
  // Admin has all permissions
  if (userPermissions.includes(Permissions.ADMIN)) {
    return true;
  }
  return userPermissions.includes(requiredPermission);
};

/**
 * Check if user has any of the specified permissions
 * @param userPermissions - Array of permission names assigned to the user
 * @param requiredPermissions - Array of permissions to check for
 * @returns true if user has any of the permissions or is an admin
 */
export const hasAnyPermission = (
  userPermissions: string[],
  requiredPermissions: PermissionValue[]
): boolean => {
  if (userPermissions.includes(Permissions.ADMIN)) {
    return true;
  }
  return requiredPermissions.some((perm) => userPermissions.includes(perm));
};

/**
 * Check if user has all of the specified permissions
 * @param userPermissions - Array of permission names assigned to the user
 * @param requiredPermissions - Array of permissions to check for
 * @returns true if user has all permissions or is an admin
 */
export const hasAllPermissions = (
  userPermissions: string[],
  requiredPermissions: PermissionValue[]
): boolean => {
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
  teachers: [Permissions.MANAGE_TEACHERS, Permissions.VIEW_TEACHERS],
  parents: [Permissions.MANAGE_PARENTS, Permissions.VIEW_PARENTS],
  grades: [Permissions.MANAGE_GRADES, Permissions.VIEW_GRADES],
  attendance: [Permissions.MANAGE_ATTENDANCE, Permissions.VIEW_ATTENDANCE],
  reports: [Permissions.VIEW_REPORTS, Permissions.GENERATE_REPORTS],
  settings: [Permissions.MANAGE_SETTINGS],
  admin: [Permissions.ADMIN],
} as const;

export type PermissionGroupKey = keyof typeof permissionGroups;
