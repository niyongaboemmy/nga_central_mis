import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface SidebarProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed = false, onToggle }) => {
  const location = useLocation();
  const navigate = useNavigate();

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
            className={`text-text-secondary-light dark:text-text-secondary-dark transition-transform ${
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
          {navItems.map((item) => (
            <li key={item.path}>
              <button
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center ${
                  isCollapsed ? "justify-center" : ""
                } space-x-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                  isActive(item.path)
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    : "font-light text-text-secondary-light dark:text-text-secondary-dark hover:bg-surface-light dark:hover:bg-surface-dark hover:text-text-primary-light dark:hover:text-text-primary-dark"
                }`}
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
          <div className="text-xs text-text-secondary-light dark:text-text-secondary-dark text-center">
            NGA MIS v1.0
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
