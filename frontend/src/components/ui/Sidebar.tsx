import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../../contexts/UserContext";
import { Permissions } from "../../constants/permissions";

interface SidebarProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
  onMenuClick?: () => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  requiredPermission?: string;
}

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed = false,
  onToggle,
  onMenuClick,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();

  const hasPermission = (perm?: string) => {
    if (!perm) return true;
    return user?.roles?.some((role) =>
      role.permissions?.some((permission) => permission.name === perm)
    );
  };

  const navItems: NavItem[] = [
    {
      label: "Dashboard",
      path: "/dashboard",
      icon: (
        <svg
          className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      ),
    },
    {
      label: "Profile",
      path: "/profile",
      icon: (
        <svg
          className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      ),
    },
    {
      label: "My Subjects",
      path: "/my-subjects",
      icon: (
        <svg
          className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      ),
      requiredPermission: Permissions.VIEW_MY_ASSIGNED_SUBJECTS,
    },
    {
      label: "Documents",
      path: "/documents",
      icon: (
        <svg
          className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
      ),
    },
    {
      label: "Academics",
      path: "/academics",
      icon: (
        <svg
          className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      ),
      requiredPermission: Permissions.MANAGE_ACADEMICS,
    },
    {
      label: "Users",
      path: "/users",
      icon: (
        <svg
          className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
      requiredPermission: Permissions.MANAGE_USERS,
    },
    {
      label: "Program Users",
      path: "/program-users",
      icon: (
        <svg
          className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
      requiredPermission: Permissions.VIEW_PROGRAM_USERS,
    },
    {
      label: "Program Academics",
      path: "/program-academics",
      icon: (
        <svg
          className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      ),
      requiredPermission: Permissions.VIEW_PROGRAM_ACADEMICS,
    },
    {
      label: "Class Users",
      path: "/class-users",
      icon: (
        <svg
          className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
      requiredPermission: Permissions.VIEW_USERS_BY_CLASS_TEACHER_GRADE,
    },
    {
      label: "Class Subjects",
      path: "/class-subjects",
      icon: (
        <svg
          className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      ),
      requiredPermission: Permissions.VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE,
    },
    {
      label: "Permissions",
      path: "/permissions",
      icon: (
        <svg
          className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      ),
      requiredPermission: Permissions.MANAGE_ROLES,
    },
    {
      label: "Settings",
      path: "/settings",
      icon: (
        <svg
          className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
      requiredPermission: Permissions.MANAGE_SETTINGS,
    },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside
      className={`fixed left-0 top-16 bg-white dark:bg-gray-800/30 border-r border-border-light dark:border-gray-700/20 transition-all duration-300 z-50 flex flex-col ${
        isCollapsed ? "w-20" : "w-64"
      }`}
      style={{ height: "calc(100vh - 4rem)" }}
    >
      {/* Logo */}
      <div
        className={`flex items-center ${
          isCollapsed ? "justify-center" : "justify-between"
        } p-4 border-b border-border-light dark:border-gray-700/30`}
      >
        {!isCollapsed && (
          <div className="flex items-center space-x-3">
            <span className="text-lg font-bold text-text-primary-light dark:text-text-primary-dark">
              Menus
            </span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
        >
          <svg
            className={`text-text-secondary-light dark:text-text-secondary-dark/70 transition-transform ${
              isCollapsed ? "rotate-180 w-5 h-5" : "w-4 h-4"
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto text-sm">
        <ul className="space-y-1 px-3">
          {navItems
            .filter((item) => hasPermission(item.requiredPermission))
            .map((item) => (
              <li key={item.path}>
                <button
                  onClick={() => {
                    navigate(item.path);
                    onMenuClick?.();
                  }}
                  className={`w-full flex items-center ${
                    isCollapsed ? "justify-center" : ""
                  } space-x-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                    isActive(item.path)
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                      : "font-light text-text-secondary-light dark:text-text-secondary-dark/70 hover:bg-surface-light dark:hover:bg-surface-dark hover:text-text-primary-light dark:hover:text-text-primary-dark"
                  }`}
                  title={item.label}
                >
                  <span className={`flex-shrink-0`}>{item.icon}</span>
                  {!isCollapsed && <span className="">{item.label}</span>}
                </button>
              </li>
            ))}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-border-light dark:border-gray-700/30">
        {!isCollapsed && (
          <div className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 text-center">
            NGA MIS v1.0
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
