import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ANALYTICS_TABS } from "../analytics/nav";
import { School, Server, Activity, Database, GraduationCap, LayoutGrid, MonitorCheck, LayoutDashboard } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../../contexts/UserContext";
import { Permissions } from "../../constants/permissions";
import { getToken } from "../../utils/auth";
import { useAccess } from "../../hooks/useAccess";
import { useMentorshipRole } from "../../hooks/useMentorshipRole";
import { useOptionalAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { BarChart3, CalendarOff, HeartHandshake, Radar, ShieldAlert, ShieldCheck, UserPlus, Baby } from "lucide-react";
import { BellRing, Bot, CalendarDays, Clock4, Gamepad2, House, Users2 } from "lucide-react";

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
  /** Access control v2 capability (any of) -- see hooks/useAccess. */
  requiredCapability?: string | string[];
  /** Submenu. The group shows when any child is visible. */
  children?: NavItem[];
  /** Legacy permissions that open the item even without `requiredCapability`. */
  orPermission?: string[];
  /** Only for these user types (e.g. PARENT). */
  userTypes?: string[];
  /** Extra runtime condition (e.g. "has mentees"); hidden when false. */
  when?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed = false,
  onToggle,
  onMenuClick,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();
  const access = useAccess();
  const selectedYearId = useOptionalAcademicPeriod()?.selectedYearId;
  const mentorship = useMentorshipRole(user?.user?.user_id, selectedYearId);

  const hasPermission = (perm?: string | string[]) => {
    if (!perm) return true;
    const required = Array.isArray(perm) ? perm : [perm];
    return user?.roles?.some((role) =>
      role.permissions?.some((permission) => required.includes(permission.name)),
    );
  };

  // For a teacher, /dashboard is the welcome page (greeting + weekly
  // timetable) and the figures live on /teacher-dashboard, so the menu says
  // so. Every other role still lands on a dashboard there.
  const isTeacher = hasPermission(Permissions.TEACHER_DASHBOARD);

  const navItems: NavItem[] = [
    {
      // Home: what needs me across every module (HOME_OVERVIEW_IMPLEMENTATION_PLAN.md).
      label: "Home",
      path: "/home",
      icon: <House className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
    },
    {
      label: isTeacher ? "My Timetable" : "Dashboard",
      path: "/dashboard",
      // Not a house: Home above already is one, and the two read as duplicates.
      icon: isTeacher ? (
        <CalendarDays className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />
      ) : (
        <LayoutDashboard className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />
      ),
    },
    {
      // The teacher's working board. "Dashboard" above it is the welcome page
      // (greeting + weekly timetable); this is where the figures and reminders
      // moved to.
      label: "Teacher Dashboard",
      path: "/teacher-dashboard",
      icon: (
        <LayoutDashboard className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />
      ),
      requiredPermission: Permissions.TEACHER_DASHBOARD,
    },
    {
      // Reminder Hub: set up this device, Now & Next, reminder preferences.
      label: "Reminders",
      path: "/reminders",
      icon: <BellRing className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
    },
    {
      // Install every NGA app on this device from one place.
      label: "Get the apps",
      path: "/apps",
      icon: <LayoutGrid className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
    },
    {
      // Transparency (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §10.5): everyone can see what
      // is recorded about them, and whether anyone is monitoring their account.
      label: "My activity",
      path: "/me/activity",
      icon: <Activity className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
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
      label: "My Learning",
      path: "/my-learning",
      icon: <GraduationCap className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: Permissions.VIEW_MY_COURSES,
    },
    {
      label: "E-Learning",
      path: "/elearning/courses",
      icon: <LayoutGrid className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: Permissions.MANAGE_COURSE_CONTENT,
    },
    {
      label: "E-Learning Oversight",
      path: "/admin/elearning",
      icon: <MonitorCheck className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: Permissions.VIEW_ALL_COURSES,
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
      // Mandatory office hours (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §9-11).
      label: "Office Hours",
      path: "/office-hours",
      icon: <Clock4 className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: [Permissions.OFFICE_HOURS_MANAGE_OWN, Permissions.OFFICE_HOURS_MANAGE_ANY],
    },
    {
      label: "Office Hours Oversight",
      path: "/office-hours/admin",
      icon: <Clock4 className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: [Permissions.OFFICE_HOURS_MANAGE_ANY, Permissions.OFFICE_HOURS_VIEW, Permissions.OFFICE_HOURS_CONFIGURE],
    },
    {
      label: "My Office Hours",
      path: "/my-office-hours",
      icon: <Clock4 className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: Permissions.OFFICE_HOURS_VIEW_SELF,
    },
    {
      // Anyone holding mentees this year — teacher, staff or admin.
      label: "My Mentees",
      path: "/my-mentees",
      icon: <Users2 className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      when: !!mentorship?.is_mentor,
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
      label: "Insights",
      path: "/insights",
      icon: <BarChart3 className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      // Anyone holding an insight capability somewhere (the page lists what they can open).
      requiredCapability: ["VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST", "VIEW_REPORTS", "VIEW_ALL_COURSES"],
    },
    {
      // One group for every Usage & Monitoring page; each entry carries the
      // capability its page needs (same list as the in-page tabs).
      label: "Usage & Monitoring",
      path: "/analytics",
      icon: <Activity className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      // No gate of its own: the group shows when any page in it is open to the viewer.
      children: ANALYTICS_TABS.map((t) => ({
        label: t.label,
        path: t.to,
        icon: <t.icon className="w-3.5 h-3.5" />,
        requiredCapability: t.caps,
        orPermission: t.perms,
      })),
    },
    {
      label: "Leadership & Access",
      path: "/access-studio",
      icon: <ShieldCheck className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredCapability: ["ACCESS_STUDIO_VIEW", "VIEW_LEADERSHIP_STRUCTURE"],
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
      label: "Wellbeing",
      path: "/wellbeing",
      icon: <HeartHandshake className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      userTypes: ["STUDENT"],
    },
    {
      label: "Staff cover",
      path: "/cover",
      icon: <CalendarOff className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      userTypes: ["TEACHER", "STAFF", "ADMIN"],
    },
    {
      label: "Early warning",
      path: "/early-warning",
      icon: <Radar className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredCapability: "EARLY_WARNING_VIEW",
    },
    {
      label: "Safeguarding",
      path: "/safeguarding",
      icon: <ShieldAlert className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: Permissions.SAFEGUARDING_MANAGE,
    },
    {
      label: "My children",
      path: "/family",
      icon: <Baby className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      userTypes: ["PARENT"],
    },
    {
      label: "Import parents",
      path: "/families/import",
      icon: <UserPlus className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: Permissions.MANAGE_USERS,
    },
    {
      label: "AI Tutor for my children",
      path: "/family/ai-tutor",
      icon: <Bot className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      userTypes: ["PARENT"],
    },
    {
      label: "Desktop tools",
      path: "/desktop-tools",
      icon: <Gamepad2 className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: Permissions.DESKTOP_TOOLS_CONFIGURE,
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
      label: "Database Management",
      path: "/database-management",
      icon: <Database className={`${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />,
      requiredPermission: Permissions.DATABASE_MANAGEMENT,
    },
  ];

  // Nested learner/builder routes keep their sidebar entry lit (e.g. /my-learning/courses/3).
  const isActive = (path?: string) =>
    path
      ? location.pathname === path ||
        ((path === "/my-learning" || path === "/elearning/courses") && location.pathname.startsWith(path))
      : false;

  /** Profile is an account action, not a destination alongside Academics or
   *  Documents — it sits at the foot of the rail where account controls live. */
  const PROFILE_LABEL = "Profile";
  const mainNavItems = navItems.filter((item) => item.label !== PROFILE_LABEL);
  const profileItem = navItems.find((item) => item.label === PROFILE_LABEL);

  /** Both gates: the v1 permission and, where set, an access-control v2 capability. */
  const isVisible = (item: NavItem): boolean =>
    item.when !== false &&
    (!item.userTypes || item.userTypes.includes(String(user?.profile?.user_type ?? "").toUpperCase())) &&
    !!hasPermission(item.requiredPermission) &&
    (!item.requiredCapability || access.can(item.requiredCapability) || (!!item.orPermission?.length && !!hasPermission(item.orPermission))) &&
    (!item.children || item.children.some(isVisible));

  /** A group is "in" when the current page is one of its children (or below one). */
  const groupHas = (item: NavItem) =>
    !!item.path && (location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
  const childActive = (child: NavItem, group: NavItem) =>
    child.path === group.path ? location.pathname === child.path : !!child.path && (location.pathname === child.path || location.pathname.startsWith(`${child.path}/`));

  const OPEN_KEY = "nga.sidebar.openGroups";
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || "[]"));
    } catch {
      return new Set();
    }
  });
  const setGroupOpen = (label: string, open: boolean) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (open) next.add(label);
      else next.delete(label);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {
        /* private mode: open state is just not remembered */
      }
      return next;
    });
  // Landing on a page inside a group opens that group.
  useEffect(() => {
    for (const item of navItems) {
      if (item.children && groupHas(item) && !openGroups.has(item.label)) setGroupOpen(item.label, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const renderGroup = (item: NavItem) => {
    const kids = item.children!.filter(isVisible);
    const open = openGroups.has(item.label);
    const inGroup = groupHas(item);
    const panelId = `nav-group-${item.label.replace(/\W+/g, "-").toLowerCase()}`;
    if (isCollapsed) {
      // Rail mode: the icon opens the group's first page; the in-page tabs do the rest.
      return (
        <button
          onClick={() => {
            if (kids[0]?.path) navigate(kids[0].path);
            onMenuClick?.();
          }}
          className={`w-full flex items-center justify-center px-3 py-2.5 rounded-xl transition-all duration-200 ${
            inGroup
              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
              : "font-light text-text-secondary-light dark:text-slate-300 hover:bg-surface-light dark:hover:bg-surface-dark hover:text-text-primary-light dark:hover:text-text-primary-dark"
          }`}
          title={item.label}
          aria-label={item.label}
        >
          <span className="flex-shrink-0">{item.icon}</span>
        </button>
      );
    }
    return (
      <div>
        <button
          onClick={() => setGroupOpen(item.label, !open)}
          aria-expanded={open}
          aria-controls={panelId}
          className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
            inGroup
              ? "text-blue-600 dark:text-blue-400 font-medium"
              : "font-light text-text-secondary-light dark:text-slate-300 hover:bg-surface-light dark:hover:bg-surface-dark hover:text-text-primary-light dark:hover:text-text-primary-dark"
          }`}
          title={item.label}
        >
          <span className="flex-shrink-0">{item.icon}</span>
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        <div
          id={panelId}
          className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
        >
          <ul className="overflow-hidden ml-5 pl-2 border-l border-border-light dark:border-gray-700/40 space-y-0.5 mt-0.5" aria-label={item.label} hidden={!open}>
            {kids.map((child) => {
              const active = childActive(child, item);
              return (
                <li key={child.path || child.label}>
                  <button
                    onClick={() => {
                      if (child.path) navigate(child.path);
                      onMenuClick?.();
                    }}
                    aria-current={active ? "page" : undefined}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
                      active
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium"
                        : "font-light text-text-secondary-light dark:text-slate-300 hover:bg-surface-light dark:hover:bg-surface-dark hover:text-text-primary-light dark:hover:text-text-primary-dark"
                    }`}
                  >
                    <span className="flex-shrink-0 opacity-80">{child.icon}</span>
                    <span className="truncate">{child.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  };

  const renderNavItem = (item: (typeof navItems)[number]) => (
    <button
      onClick={() => {
        if (item.externalUrl) {
          const token = getToken();
          const url = item.externalUrl.replace("xxxxxxx", token || "");
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
          : "font-light text-text-secondary-light dark:text-slate-300 hover:bg-surface-light dark:hover:bg-surface-dark hover:text-text-primary-light dark:hover:text-text-primary-dark"
      }`}
      title={item.label}
    >
      <span className="flex-shrink-0">{item.icon}</span>
      {!isCollapsed && <span>{item.label}</span>}
    </button>
  );

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
          aria-label={isCollapsed ? "Expand menu" : "Collapse menu"}
          aria-expanded={!isCollapsed}
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
          {mainNavItems
            .filter(isVisible)
            .map((item, index) => (
              <li key={item.path || item.label || `nav-${index}`}>{item.children ? renderGroup(item) : renderNavItem(item)}</li>
            ))}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border-light dark:border-gray-700/30 px-2.5 pt-2 pb-3 text-sm">
        {profileItem && isVisible(profileItem) && renderNavItem(profileItem)}
        {!isCollapsed && (
          <div className="mt-2 text-xs text-text-secondary-light dark:text-slate-300 text-center">
            NGA MIS v1.0
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
