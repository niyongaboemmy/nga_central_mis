import { useUser } from "../contexts/UserContext";

/**
 * Hook for easy permission-based access control in React components
 * Uses role-based permission checking through user.roles structure
 *
 * @example
 */
export const usePermissions = () => {
  const { user } = useUser();

  /**
   * Check if the current user has a specific permission
   * Traverses user.roles[].permissions[] to find matching permission name
   */
  const hasPermission = (perm?: string): boolean => {
    if (!perm) return true;
    return (
      user?.roles?.some((role: any) =>
        role.permissions?.some((permission: any) => permission.name === perm)
      ) ?? false
    );
  };

  /**
   * Check if the current user has any of the specified permissions
   */
  const hasAnyPermission = (perms: string[]): boolean => {
    return perms.some((perm) => hasPermission(perm));
  };

  /**
   * Check if the current user has all of the specified permissions
   */
  const hasAllPermissions = (perms: string[]): boolean => {
    return perms.every((perm) => hasPermission(perm));
  };

  /**
   * Check if user has admin role or admin permissions
   */
  const isAdmin = (): boolean => {
    return (
      hasPermission("ADMIN") ||
      (user?.roles?.some((role: any) => role.name === "SUPER_ADMIN") ?? false)
    );
  };

  /**
   * Get all permissions assigned to the user
   */
  const getUserPermissions = (): string[] => {
    const permissions: string[] = [];
    user?.roles?.forEach((role: any) => {
      role.permissions?.forEach((permission: any) => {
        if (!permissions.includes(permission.name)) {
          permissions.push(permission.name);
        }
      });
    });
    return permissions;
  };

  return {
    user,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin,
    getUserPermissions,
  };
};

export default usePermissions;
