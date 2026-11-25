import {
  Activity,
  Baby,
  BarChart3,
  BellRing,
  BookCopy,
  BookMarked,
  BookOpen,
  Bot,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Clock4,
  Database,
  Eye,
  FileText,
  FileUp,
  Folder,
  FolderKanban,
  Gamepad2,
  Gem,
  Globe2,
  GraduationCap,
  Grid3x3,
  HeartHandshake,
  House,
  KeyRound,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Library,
  Lightbulb,
  LockKeyhole,
  MessageCircle,
  MonitorCheck,
  MonitorPlay,
  NotebookPen,
  Presentation,
  Radar,
  School,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SquareTerminal,
  Target,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  Users2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { ANALYTICS_TABS } from "../../analytics/nav";
import { Permissions } from "../../../constants/permissions";

/**
 * The MIS menu as data: area (rail icon) › group (heading in the panel) › page.
 * Every page keeps the gate it had in the flat sidebar, so regrouping never shows
 * anyone a page they could not open before. A group shows when any page in it is
 * visible, an area when any group is.
 */
export interface NavLink {
  label: string;
  path?: string;
  /** Done on click instead of navigating (e.g. open the apps dialog). */
  action?: () => void;
  icon: LucideIcon;
  requiredPermission?: string | string[];
  /** Access control v2 capability (any of) -- see hooks/useAccess. */
  requiredCapability?: string | string[];
  /** Legacy permissions that open the page even without `requiredCapability`. */
  orPermission?: string[];
  /** Only for these user types (e.g. PARENT). */
  userTypes?: string[];
  /** Extra runtime condition (e.g. "has mentees"); hidden when false. */
  when?: boolean;
  /** Count shown next to the label (e.g. unread mentee check-ins). */
  badge?: number;
}

export interface NavGroup {
  label: string;
  items: NavLink[];
  /** Folds under its heading (long groups like Usage & Monitoring). */
  collapsible?: boolean;
}

export interface NavArea {
  id: string;
  label: string;
  icon: LucideIcon;
  /** A direct page (Home, Schedule): the rail icon navigates instead of opening a panel. */
  link?: NavLink;
  groups?: NavGroup[];
}

export interface NavContext {
  isMentor: boolean;
  menteeCheckins: number;
  hasMentor: boolean;
  supervising: number;
  hasPermission: (perm?: string | string[]) => boolean;
  openApps: () => void;
}

const STAFF = ["TEACHER", "STAFF", "ADMIN"];

export function buildNavAreas(ctx: NavContext): NavArea[] {
  return [
    { id: "home", label: "Home", icon: House, link: { label: "Home", path: "/home", icon: House } },
    // /dashboard is the week's timetable for everyone, so it is named for what it shows.
    { id: "schedule", label: "Schedule", icon: CalendarDays, link: { label: "Schedule", path: "/dashboard", icon: CalendarDays } },
    {
      id: "teaching",
      label: "Teaching",
      icon: Presentation,
      groups: [
        {
          label: "Overview",
          items: [
            { label: "Teacher Dashboard", path: "/teacher-dashboard", icon: LayoutDashboard, requiredPermission: Permissions.TEACHER_DASHBOARD },
            { label: "Reporting", path: "/reporting", icon: FileUp, requiredPermission: Permissions.SUBMIT_REPORTING },
          ],
        },
        {
          label: "Planning",
          items: [
            { label: "Scheme Of Work", path: "/scheme-of-work", icon: CalendarRange, requiredPermission: Permissions.VIEW_MY_ASSIGNED_SUBJECTS },
            { label: "Lesson Notes", path: "/lesson-notes", icon: NotebookPen, requiredPermission: Permissions.MANAGE_LESSON_NOTES },
            { label: "E-Learning", path: "/elearning/courses", icon: MonitorPlay, requiredPermission: Permissions.MANAGE_COURSE_CONTENT },
          ],
        },
        {
          label: "My classes",
          items: [
            { label: "My Subjects", path: "/my-subjects", icon: BookOpen, requiredPermission: Permissions.VIEW_MY_ASSIGNED_SUBJECTS },
            { label: "My Students", path: "/my-students", icon: Users, requiredPermission: Permissions.VIEW_MY_STUDENTS },
            { label: "Competency map", path: "/competency-map", icon: Grid3x3, userTypes: STAFF },
          ],
        },
        {
          label: "Student support",
          items: [
            // Mandatory office hours (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §9-11).
            { label: "Office Hours", path: "/office-hours", icon: Clock4, requiredPermission: [Permissions.OFFICE_HOURS_MANAGE_OWN, Permissions.OFFICE_HOURS_MANAGE_ANY] },
            // Anyone holding mentees this year -- teacher, staff or admin.
            { label: "My Mentees", path: "/my-mentees", icon: Users2, when: ctx.isMentor, badge: ctx.menteeCheckins },
          ],
        },
        {
          label: "Class teacher",
          items: [
            { label: "Class Users", path: "/class-users", icon: UsersRound, requiredPermission: Permissions.VIEW_USERS_BY_CLASS_TEACHER_GRADE },
            { label: "Class Subjects", path: "/class-subjects", icon: BookCopy, requiredPermission: Permissions.VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE },
            { label: "Class Calendar", path: "/class-calendar", icon: CalendarCheck, requiredPermission: Permissions.VIEW_CALENDAR_BY_CLASS_TEACHER_GRADE },
          ],
        },
      ],
    },
    {
      id: "learning",
      label: "Learning",
      icon: GraduationCap,
      groups: [
        {
          label: "Study",
          items: [
            { label: "My Subjects", path: "/my-enrolled-subjects", icon: BookOpen, requiredPermission: Permissions.VIEW_MY_ENROLLED_SUBJECTS },
            { label: "My Learning", path: "/my-learning", icon: GraduationCap, requiredPermission: Permissions.VIEW_MY_COURSES },
            { label: "Shared Notes", path: "/shared-lesson-notes", icon: FileText, requiredPermission: Permissions.VIEW_SHARED_LESSON_NOTES },
            { label: "My competences", path: "/my-competences", icon: Target, userTypes: ["STUDENT"] },
            // Write and run code in any language, full screen (CODE_PLAYGROUND_USE: every role).
            { label: "Code Playground", path: "/code-playground", icon: SquareTerminal, requiredPermission: Permissions.CODE_PLAYGROUND_USE },
          ],
        },
        {
          label: "Support",
          items: [
            // Any student with a live mentor, even where no admin ever granted the
            // check-in permission (migration 047 left it ungranted).
            { label: "My Mentor", path: "/my-mentor", icon: MessageCircle, when: ctx.hasMentor || ctx.hasPermission(Permissions.SUBMIT_MENTEE_CHECKIN) },
            { label: "My Office Hours", path: "/my-office-hours", icon: Clock4, requiredPermission: Permissions.OFFICE_HOURS_VIEW_SELF },
            { label: "Wellbeing", path: "/wellbeing", icon: HeartHandshake, userTypes: ["STUDENT"] },
          ],
        },
      ],
    },
    {
      id: "family",
      label: "Family",
      icon: Baby,
      groups: [
        {
          label: "Family",
          items: [
            { label: "My children", path: "/family", icon: Baby, userTypes: ["PARENT"] },
            { label: "AI Tutor for my children", path: "/family/ai-tutor", icon: Bot, userTypes: ["PARENT"] },
          ],
        },
      ],
    },
    {
      id: "workspace",
      label: "Workspace",
      icon: Briefcase,
      groups: [
        {
          label: "Calendar & cover",
          items: [
            // Where the timetable is built; everyone else reads theirs under Schedule.
            {
              label: "Academic Calendar",
              path: "/calendar",
              icon: CalendarDays,
              requiredPermission: [Permissions.MANAGE_ACADEMIC_CALENDAR, Permissions.CREATE_ACADEMIC_CALENDAR, Permissions.UPDATE_CALENDAR_SLOT],
            },
            { label: "Staff cover", path: "/cover", icon: CalendarOff, userTypes: STAFF },
          ],
        },
        { label: "Files", items: [{ label: "Documents", path: "/documents", icon: Folder }] },
        {
          // Side projects (STUDENT_PROJECTS_IMPLEMENTATION_PLAN.md §6, §13).
          label: "Projects",
          items: [
            { label: "My projects", path: "/my-projects", icon: Lightbulb, requiredPermission: Permissions.SIDE_PROJECTS_MANAGE_OWN },
            {
              label: "Assigned projects",
              path: "/assigned-projects",
              icon: ClipboardCheck,
              requiredPermission: Permissions.SIDE_PROJECTS_ASSIGNED,
              userTypes: STAFF,
              badge: ctx.supervising || undefined,
            },
            { label: "Customers", path: "/project-customers", icon: Briefcase, requiredPermission: Permissions.SIDE_PROJECTS_MANAGE_OWN },
            { label: "All projects", path: "/projects-monitor", icon: FolderKanban, requiredCapability: "SIDE_PROJECTS_VIEW" },
          ],
        },
      ],
    },
    {
      id: "oversight",
      label: "Oversight",
      icon: Eye,
      groups: [
        {
          label: "Teaching quality",
          items: [
            { label: "All Teachers SOW", path: "/all-teachers-sow", icon: Layers, requiredPermission: Permissions.VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST },
            { label: "E-Learning Oversight", path: "/admin/elearning", icon: MonitorCheck, requiredPermission: Permissions.VIEW_ALL_COURSES },
            {
              label: "Office Hours Oversight",
              path: "/office-hours/admin",
              icon: Clock4,
              requiredPermission: [Permissions.OFFICE_HOURS_MANAGE_ANY, Permissions.OFFICE_HOURS_VIEW, Permissions.OFFICE_HOURS_CONFIGURE],
            },
          ],
        },
        {
          label: "Programmes",
          items: [
            { label: "Program Users", path: "/program-users", icon: UsersRound, requiredPermission: Permissions.VIEW_PROGRAM_USERS },
            { label: "Program Academics", path: "/program-academics", icon: Library, requiredPermission: Permissions.VIEW_PROGRAM_ACADEMICS },
          ],
        },
        {
          label: "Student welfare",
          items: [
            { label: "Early warning", path: "/early-warning", icon: Radar, requiredCapability: "EARLY_WARNING_VIEW" },
            { label: "Safeguarding", path: "/safeguarding", icon: ShieldAlert, requiredPermission: Permissions.SAFEGUARDING_MANAGE },
          ],
        },
        {
          label: "Reports & insights",
          items: [
            { label: "Admin Reports", path: "/admin/reports", icon: ClipboardList, requiredPermission: [Permissions.VIEW_REPORTS, Permissions.ALL_SUBMITTED_REPORTS] },
            // Anyone holding an insight capability somewhere (the page lists what they can open).
            { label: "Insights", path: "/insights", icon: BarChart3, requiredCapability: ["VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST", "VIEW_REPORTS", "VIEW_ALL_COURSES"] },
          ],
        },
        {
          // Same list as the in-page tabs, so the two never disagree.
          label: "Usage & Monitoring",
          collapsible: true,
          items: ANALYTICS_TABS.map((t) => ({ label: t.label, path: t.to, icon: t.icon, requiredCapability: t.caps, orPermission: t.perms })),
        },
      ],
    },
    {
      id: "admin",
      label: "Administration",
      icon: Building2,
      groups: [
        {
          label: "People",
          items: [
            { label: "Users", path: "/users", icon: Users, requiredPermission: Permissions.MANAGE_USERS },
            { label: "Enrollment", path: "/enrollment", icon: UserCheck, requiredPermission: Permissions.ASSIGN_STUDENT_CLASS_GROUPS },
            { label: "Import parents", path: "/families/import", icon: UserPlus, requiredPermission: Permissions.MANAGE_USERS },
          ],
        },
        { label: "Academics", items: [{ label: "Academics", path: "/academics", icon: BookMarked, requiredPermission: Permissions.MANAGE_ACADEMICS }] },
        {
          label: "Access",
          items: [
            { label: "Leadership & Access", path: "/access-studio", icon: ShieldCheck, requiredCapability: ["ACCESS_STUDIO_VIEW", "VIEW_LEADERSHIP_STRUCTURE"] },
            { label: "Permissions", path: "/permissions", icon: LockKeyhole, requiredPermission: Permissions.MANAGE_ROLES },
          ],
        },
        {
          label: "School",
          items: [
            { label: "Settings", path: "/settings", icon: Settings, requiredPermission: Permissions.MANAGE_SETTINGS },
            { label: "Subscription", path: "/settings/subscription", icon: Gem, requiredCapability: "SCHOOL_BILLING_MANAGE" },
            { label: "Desktop tools", path: "/desktop-tools", icon: Gamepad2, requiredPermission: Permissions.DESKTOP_TOOLS_CONFIGURE },
          ],
        },
        {
          label: "Platform",
          items: [
            {
              label: "Platform",
              path: "/platform",
              icon: Globe2,
              requiredCapability: ["PLATFORM_TENANTS_VIEW", "PLATFORM_APPLICATIONS_REVIEW", "PLATFORM_BILLING_INVOICE", "PLATFORM_SUPPORT_ACCESS"],
            },
            { label: "School profile", path: "/schools", icon: School, requiredPermission: Permissions.MANAGE_SCHOOLS },
            { label: "Systems", path: "/systems", icon: Server, requiredPermission: Permissions.MANAGE_SYSTEMS },
            // Platform-owner tool, primary school only (MIS-ISO-1): PLATFORM_* caps never exist elsewhere.
            { label: "Database Management", path: "/database-management", icon: Database, requiredPermission: Permissions.DATABASE_MANAGEMENT, requiredCapability: "PLATFORM_PACKAGES_MANAGE" },
          ],
        },
      ],
    },
  ];
}

/** About you, not a destination: these live in the account menu at the foot of the rail. */
export function buildAccountLinks(ctx: NavContext): NavLink[] {
  return [
    { label: "Profile", path: "/profile", icon: UserRound },
    // Transparency (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §10.5).
    { label: "My activity", path: "/me/activity", icon: Activity },
    // My AI (PERSONAL_AI_PROVIDERS_PLAN.md §9.1): staff AI_PERSONAL_PROVIDERS, students _STUDENT.
    {
      label: "My AI",
      path: "/my-ai",
      icon: KeyRound,
      requiredCapability: [Permissions.AI_PERSONAL_PROVIDERS, Permissions.AI_PERSONAL_PROVIDERS_STUDENT],
      orPermission: [Permissions.AI_PERSONAL_PROVIDERS, Permissions.AI_PERSONAL_PROVIDERS_STUDENT],
    },
    { label: "Reminders", path: "/reminders", icon: BellRing },
    // Install every NGA app, in a dialog over the current page.
    { label: "Get the apps", action: ctx.openApps, icon: LayoutGrid },
  ];
}

/** A page with the area and group it sits in, for search, pins and recents. */
export interface PlacedLink {
  link: NavLink;
  area: NavArea;
  group: NavGroup | null;
}

export function placeLinks(areas: NavArea[]): PlacedLink[] {
  return areas.flatMap((area): PlacedLink[] =>
    area.link ? [{ link: area.link, area, group: null }] : (area.groups ?? []).flatMap((group) => group.items.map((link) => ({ link, area, group }))),
  );
}

/**
 * The page the current URL belongs to: an exact match, else the longest path the URL
 * sits under (/office-hours/admin lights Office Hours Oversight, not Office Hours).
 */
export function matchPath<T extends { link: NavLink }>(placed: T[], pathname: string): T | null {
  let best: T | null = null;
  for (const p of placed) {
    const path = p.link.path;
    if (!path) continue;
    if (pathname === path) return p;
    if (pathname.startsWith(`${path}/`) && (!best || path.length > (best.link.path?.length ?? 0))) best = p;
  }
  return best;
}
