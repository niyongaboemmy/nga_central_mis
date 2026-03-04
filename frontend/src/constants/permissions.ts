/**
 * Static permission constants for frontend access control
 * These should match the permissions stored in the database
 */

// Core management permissions
export const Permissions = {
  // User management
  MANAGE_USERS: "MANAGE_USERS",
  VIEW_USERS: "VIEW_USERS",
  ENABLE_DISABLE_USERS: "ENABLE_DISABLE_USERS",
  CHANGE_USER_ROLES: "CHANGE_USER_ROLES",
  MANAGE_PROGRAM_LEADS: "MANAGE_PROGRAM_LEADS",
  UPDATE_USER_PROFILE_INFO: "UPDATE_USER_PROFILE_INFO",

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
  MANAGE_STUDENT_ENROLLMENTS: "MANAGE_STUDENT_ENROLLMENTS",
  ASSIGN_STUDENT_CLASS_GROUPS: "ASSIGN_STUDENT_CLASS_GROUPS",

  // Teacher management
  MANAGE_TEACHERS: "MANAGE_TEACHERS",
  VIEW_TEACHERS: "VIEW_TEACHERS",
  VIEW_MY_ASSIGNED_SUBJECTS: "VIEW_MY_ASSIGNED_SUBJECTS",
  TEACHER_DASHBOARD: "TEACHER_DASHBOARD",
  ASSIGN_TEACHER_SUBJECTS: "ASSIGN_TEACHER_SUBJECTS",

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
  ACCESS_REPORT_CARD_MODULE: "ACCESS_REPORT_CARD_MODULE",

  // System settings
  MANAGE_SETTINGS: "MANAGE_SETTINGS",

  // Multi-Tenancy
  MANAGE_SCHOOLS: "MANAGE_SCHOOLS",
  MANAGE_SYSTEMS: "MANAGE_SYSTEMS",
  ASSIGN_SCHOOL_SYSTEMS: "ASSIGN_SCHOOL_SYSTEMS",

  // Admin
  ADMIN: "ADMIN",

  // Program Management
  VIEW_PROGRAM_USERS: "VIEW_PROGRAM_USERS",
  VIEW_PROGRAM_ACADEMICS: "VIEW_PROGRAM_ACADEMICS",

  // Class Teacher Management
  ASSIGN_GRADE_TO_CLASS_TEACHER: "ASSIGN_GRADE_TO_CLASS_TEACHER",
  VIEW_USERS_BY_CLASS_TEACHER_GRADE: "VIEW_USERS_BY_CLASS_TEACHER_GRADE",
  VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE: "VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE",

  // Academic Calendar Management
  MANAGE_ACADEMIC_CALENDAR: "MANAGE_ACADEMIC_CALENDAR",
  VIEW_ACADEMIC_CALENDAR: "VIEW_ACADEMIC_CALENDAR",
  MANAGE_CALENDAR_NOTIFICATIONS: "MANAGE_CALENDAR_NOTIFICATIONS",
  VIEW_CALENDAR_NOTIFICATIONS: "VIEW_CALENDAR_NOTIFICATIONS",
  VIEW_MY_CALENDAR: "VIEW_MY_CALENDAR",
  VIEW_LESSON_PLANS: "VIEW_LESSON_PLANS",
  VIEW_STUDENT_CALENDAR: "VIEW_STUDENT_CALENDAR",
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
  requiredPermission: PermissionValue,
): boolean => {
  console.warn(
    "hasPermission from constants/permissions.ts is deprecated. Use usePermissions hook instead.",
  );
  // Admin has all permissions
  if (userPermissions.includes(Permissions.ADMIN)) {
    return true;
  }
  return userPermissions.includes(requiredPermission);
};

export const hasAnyPermission = (
  userPermissions: string[],
  requiredPermissions: PermissionValue[],
): boolean => {
  console.warn(
    "hasAnyPermission from constants/permissions.ts is deprecated. Use usePermissions hook instead.",
  );
  if (userPermissions.includes(Permissions.ADMIN)) {
    return true;
  }
  return requiredPermissions.some((perm) => userPermissions.includes(perm));
};

export const hasAllPermissions = (
  userPermissions: string[],
  requiredPermissions: PermissionValue[],
): boolean => {
  console.warn(
    "hasAllPermissions from constants/permissions.ts is deprecated. Use usePermissions hook instead.",
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
  users: [
    Permissions.MANAGE_USERS,
    Permissions.VIEW_USERS,
    Permissions.ENABLE_DISABLE_USERS,
    Permissions.CHANGE_USER_ROLES,
    Permissions.MANAGE_PROGRAM_LEADS,
    Permissions.UPDATE_USER_PROFILE_INFO,
  ],
  roles: [Permissions.MANAGE_ROLES, Permissions.MANAGE_PERMISSIONS],
  academics: [Permissions.MANAGE_ACADEMICS, Permissions.VIEW_ACADEMICS],
  classes: [Permissions.MANAGE_CLASSES, Permissions.VIEW_CLASSES],
  students: [
    Permissions.MANAGE_STUDENTS,
    Permissions.VIEW_STUDENTS,
    Permissions.MANAGE_STUDENT_ENROLLMENTS,
    Permissions.ASSIGN_STUDENT_CLASS_GROUPS,
  ],
  teachers: [
    Permissions.MANAGE_TEACHERS,
    Permissions.VIEW_TEACHERS,
    Permissions.VIEW_MY_ASSIGNED_SUBJECTS,
    Permissions.TEACHER_DASHBOARD,
    Permissions.ASSIGN_TEACHER_SUBJECTS,
    Permissions.ASSIGN_GRADE_TO_CLASS_TEACHER,
    Permissions.VIEW_USERS_BY_CLASS_TEACHER_GRADE,
    Permissions.VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE,
  ],
  parents: [Permissions.MANAGE_PARENTS, Permissions.VIEW_PARENTS],
  grades: [Permissions.MANAGE_GRADES, Permissions.VIEW_GRADES],
  attendance: [Permissions.MANAGE_ATTENDANCE, Permissions.VIEW_ATTENDANCE],
  reports: [
    Permissions.VIEW_REPORTS,
    Permissions.GENERATE_REPORTS,
    Permissions.ACCESS_REPORT_CARD_MODULE,
  ],
  settings: [Permissions.MANAGE_SETTINGS],
  admin: [Permissions.ADMIN],
  calendar: [
    Permissions.MANAGE_ACADEMIC_CALENDAR,
    Permissions.VIEW_ACADEMIC_CALENDAR,
    Permissions.MANAGE_CALENDAR_NOTIFICATIONS,
    Permissions.VIEW_CALENDAR_NOTIFICATIONS,
    Permissions.VIEW_MY_CALENDAR,
    Permissions.VIEW_LESSON_PLANS,
  ],
} as const;

export type PermissionGroupKey = keyof typeof permissionGroups;
