import React, { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { useUser } from "../../contexts/UserContext";
import { Permissions } from "../../constants/permissions";

interface SearchItem {
  label: string;
  path: string;
  requiredPermission?: string | string[];
}

const SEARCH_ITEMS: SearchItem[] = [
  { label: "Home", path: "/home" },
  { label: "Dashboard", path: "/dashboard" },
  {
    label: "Teacher Dashboard",
    path: "/teacher-dashboard",
    requiredPermission: Permissions.TEACHER_DASHBOARD,
  },
  { label: "Profile", path: "/profile" },
  {
    label: "My Subjects",
    path: "/my-subjects",
    requiredPermission: Permissions.VIEW_MY_ASSIGNED_SUBJECTS,
  },
  {
    label: "Scheme Of Work",
    path: "/scheme-of-work",
    requiredPermission: Permissions.VIEW_MY_ASSIGNED_SUBJECTS,
  },
  {
    label: "All Teachers SOW",
    path: "/all-teachers-sow",
    requiredPermission: Permissions.VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST,
  },
  {
    label: "Academic Calendar",
    path: "/calendar",
    requiredPermission: Permissions.VIEW_ACADEMIC_CALENDAR,
  },
  {
    label: "Office Hours",
    path: "/office-hours",
    requiredPermission: [Permissions.OFFICE_HOURS_MANAGE_OWN, Permissions.OFFICE_HOURS_MANAGE_ANY],
  },
  {
    label: "Office Hours Oversight",
    path: "/office-hours/admin",
    requiredPermission: [Permissions.OFFICE_HOURS_MANAGE_ANY, Permissions.OFFICE_HOURS_VIEW, Permissions.OFFICE_HOURS_CONFIGURE],
  },
  {
    label: "My Office Hours",
    path: "/my-office-hours",
    requiredPermission: Permissions.OFFICE_HOURS_VIEW_SELF,
  },
  {
    label: "Reporting",
    path: "/reporting",
    requiredPermission: Permissions.SUBMIT_REPORTING,
  },
  {
    label: "Admin Reports",
    path: "/admin/reports",
    requiredPermission: [Permissions.VIEW_REPORTS, Permissions.ALL_SUBMITTED_REPORTS],
  },
  { label: "Documents", path: "/documents" },
  {
    label: "Academics",
    path: "/academics",
    requiredPermission: Permissions.MANAGE_ACADEMICS,
  },
  {
    label: "Users",
    path: "/users",
    requiredPermission: Permissions.MANAGE_USERS,
  },
  {
    label: "Program Users",
    path: "/program-users",
    requiredPermission: Permissions.VIEW_PROGRAM_USERS,
  },
  {
    label: "Program Academics",
    path: "/program-academics",
    requiredPermission: Permissions.VIEW_PROGRAM_ACADEMICS,
  },
  {
    label: "Class Users",
    path: "/class-users",
    requiredPermission: Permissions.VIEW_USERS_BY_CLASS_TEACHER_GRADE,
  },
  {
    label: "Class Subjects",
    path: "/class-subjects",
    requiredPermission: Permissions.VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE,
  },
  {
    label: "Permissions",
    path: "/permissions",
    requiredPermission: Permissions.MANAGE_ROLES,
  },
  {
    label: "Settings",
    path: "/settings",
    requiredPermission: Permissions.MANAGE_SETTINGS,
  },
  {
    label: "Schools",
    path: "/schools",
    requiredPermission: Permissions.MANAGE_SCHOOLS,
  },
  {
    label: "Systems",
    path: "/systems",
    requiredPermission: Permissions.MANAGE_SYSTEMS,
  },
  {
    label: "Logs History",
    path: "/logs-history",
    requiredPermission: Permissions.VIEW_ALL_LOGS_HISTORY,
  },
];

const NavSearch: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user } = useUser();

  const hasPermission = (perm?: string | string[]) => {
    if (!perm) return true;
    const required = Array.isArray(perm) ? perm : [perm];
    return user?.roles?.some((role) =>
      role.permissions?.some((p) => required.includes(p.name)),
    );
  };

  const results = useMemo(() => {
    const available = SEARCH_ITEMS.filter((item) =>
      hasPermission(item.requiredPermission),
    );
    if (!query.trim()) return available;
    return available.filter((item) =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    } else {
      setQuery("");
    }
  }, [isOpen]);

  const handleSelect = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-2 rounded-xl text-text-secondary-light dark:text-text-secondary-dark/70 hover:bg-surface-light dark:hover:bg-surface-dark transition-all duration-200"
        title="Search"
        aria-label="Search"
      >
        <Search className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-border-light dark:border-gray-700/30 overflow-hidden z-[100] animate-fade-in">
          <div className="relative p-3 border-b border-border-light dark:border-gray-700/40">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages..."
              className="w-full pl-8 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {results.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">
                No pages found
              </p>
            ) : (
              results.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleSelect(item.path)}
                  className="w-full text-left px-4 py-2 text-sm text-text-secondary-light dark:text-text-secondary-dark/70 hover:bg-surface-light dark:hover:bg-surface-dark"
                >
                  {item.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NavSearch;
