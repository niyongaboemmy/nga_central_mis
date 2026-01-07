import { useUser } from "../contexts/UserContext";
import {
  Permissions,
  PermissionValue,
  hasPermission as checkPermission,
  hasAnyPermission as checkAnyPermission,
  hasAllPermissions as checkAllPermissions,
} from "../constants/permissions";

/**
 * Hook for easy permission-based access control in React components
 *
 * @example
 * ```tsx
 * const { hasPermission } = usePermissions();
 *
 * // Single permission check
 * if (hasPermission(Permissions.MANAGE_USERS)) {
 *   // Show admin features
 * }
 *
 * // Multiple permissions (any)
 * if (hasAnyPermission([Permissions.MANAGE_USERS, Permissions.VIEW_USERS])) {
 *   // Show user-related features
 * }
 * ```
 */
export const usePermissions = () => {
  const { permissions } = useUser();

  /**
   * Check if the current user has a specific permission
   */
  const hasPermission = (requiredPermission: PermissionValue): boolean => {
    return checkPermission(permissions, requiredPermission);
  };

  /**
   * Check if the current user has any of the specified permissions
   */
  const hasAnyPermission = (
    requiredPermissions: PermissionValue[]
  ): boolean => {
    return checkAnyPermission(permissions, requiredPermissions);
  };

  /**
   * Check if the current user has all of the specified permissions
   */
  const hasAllPermissions = (
    requiredPermissions: PermissionValue[]
  ): boolean => {
    return checkAllPermissions(permissions, requiredPermissions);
  };

  /**
   * Check if user is admin
   */
  const isAdmin = (): boolean => {
    return permissions.includes(Permissions.ADMIN);
  };

  /**
   * Get all permissions assigned to the user
   */
  const getUserPermissions = (): string[] => {
    return permissions;
  };

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin,
    getUserPermissions,
    Permissions, // Export the constants for direct use
  };
};

// Re-export Permissions for convenience
export { Permissions };

export default usePermissions;
