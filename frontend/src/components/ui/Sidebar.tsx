import React from "react";
import { School, Server, Activity, Database } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../../contexts/UserContext";
import { Permissions } from "../../constants/permissions";
import { getToken } from "../../utils/auth";

interface SidebarProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
  onMenuClick?: () => void;
}

interface NavItem {
  label: string;
  path?: string;
  externalUrl?: string;
  icon: React.ReactNode;
  requiredPermission?: string | string[];
}

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed = false,
  onToggle,
  onMenuClick,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();

  const hasPermission = (perm?: string | string[]) => {
    if (!perm) return true;
    const required = Array.isArray(perm) ? perm : [perm];
    return user?.roles?.some((role) =>
      role.permissions?.some((permission) => required.includes(permission.name)),
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
      label: "My Students",
      path: "/my-students",
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
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
      requiredPermission: Permissions.VIEW_MY_STUDENTS,
    },
    {
      label: "My Subjects",
      path: "/my-enrolled-subjects",
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
      requiredPermission: Permissions.VIEW_MY_ENROLLED_SUBJECTS,
    },
    {
      label: "Scheme Of Work",
      path: "/scheme-of-work",
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
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      ),
      requiredPermission: Permissions.VIEW_MY_ASSIGNED_SUBJECTS,
    },
    {
      label: "Lesson Notes",
      path: "/lesson-notes",
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
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      ),
      requiredPermission: Permissions.MANAGE_LESSON_NOTES,
    },
    {
      label: "Shared Notes",
      path: "/shared-lesson-notes",
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
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      ),
      requiredPermission: Permissions.VIEW_SHARED_LESSON_NOTES,
    },
    {
      label: "All Teachers SOW",
      path: "/all-teachers-sow",
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
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      ),
      requiredPermission: Permissions.VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST,
    },
    {
      label: "Academic Calendar",
      path: "/calendar",
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
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      ),
      requiredPermission: Permissions.VIEW_ACADEMIC_CALENDAR,
    },
    {
      label: "Reporting",
      path: "/reporting",
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
            d="M9 17v-2a4 4 0 00-4-4H5m14 0h-2a4 4 0 00-4 4v2m-3-3l3-3m0 0l3 3m-3-3v8"
          />
        </svg>
      ),
      requiredPermission: Permissions.SUBMIT_REPORTING,
    },
    {
      label: "My Mentor",
      path: "/my-mentor",
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
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      ),
      requiredPermission: Permissions.SUBMIT_MENTEE_CHECKIN,
    },
    {
      label: "Admin Reports",
      path: "/admin/reports",
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
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
      ),
      requiredPermission: [Permissions.VIEW_REPORTS, Permissions.ALL_SUBMITTED_REPORTS],
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
    // {
    //   label: "Report Card",
    //   externalUrl:
    //     "https://nga.ac.rw/public/report_card/auto_login.php?token=xxxxxxx",
    //   icon: (
    //     <svg
    //       className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`}
    //       fill="none"
    //       stroke="currentColor"
    //       viewBox="0 0 24 24"
    //     >
    //       <path
    //         strokeLinecap="round"
    //         strokeLinejoin="round"
    //         strokeWidth={2}
    //         d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    //       />
    //     </svg>
    //   ),
    //   requiredPermission: Permissions.ACCESS_REPORT_CARD_MODULE,
    // },
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
      label: "Enrollment",
      path: "/enrollment",
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
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      requiredPermission: Permissions.ASSIGN_STUDENT_CLASS_GROUPS,
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
      label: "Class Calendar",
      path: "/class-calendar",
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
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      ),
      requiredPermission: Permissions.VIEW_CALENDAR_BY_CLASS_TEACHER_GRADE,
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
    {
      label: "Schools",
      path: "/schools",
      icon: <School className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: Permissions.MANAGE_SCHOOLS,
    },
    {
      label: "Systems",
      path: "/systems",
      icon: <Server className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: Permissions.MANAGE_SYSTEMS,
    },
    {
      label: "Logs History",
      path: "/logs-history",
      icon: <Activity className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: Permissions.VIEW_ALL_LOGS_HISTORY,
    },
    {
      label: "Database Management",
      path: "/database-management",
      icon: <Database className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: Permissions.DATABASE_MANAGEMENT,
    },
  ];

  const isActive = (path?: string) =>
    path ? location.pathname === path : false;

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
      <nav className="flex-1 py-3 overflow-y-auto text-sm">
        <ul className="space-y-0.5 px-2.5">
          {navItems
            .filter((item) => hasPermission(item.requiredPermission))
            .map((item, index) => (
              <li key={item.path || item.label || `nav-${index}`}>
                <button
                  onClick={() => {
                    if (item.externalUrl) {
                      const token = getToken();
                      const url = item.externalUrl.replace(
                        "xxxxxxx",
                        token || "",
                      );
                      window.open(url, "_blank");
                    } else if (item.path) {
                      navigate(item.path);
                    }
                    onMenuClick?.();
                  }}
                  className={`w-full flex items-center ${
                    isCollapsed ? "justify-center" : ""
                  } space-x-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
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
