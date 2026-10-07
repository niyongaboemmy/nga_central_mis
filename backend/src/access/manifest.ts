import {
  CapabilityDef,
  defineManifest,
  Depth,
  Domain,
} from "../vendor/nga-access";

/**
 * Central MIS capability manifest -- every permission the MIS checks, with the
 * metadata Access Studio needs (domain, READ/WRITE, supported read depths).
 *
 * MIS capabilities keep their historic names (no "mis:" prefix) so every
 * existing `authorize("...")` call and every spoke app reading the SSO
 * `permissions` array keeps working. Adding a capability = add it here and
 * check it in code; the registry sync on boot does the rest.
 */

const R = (
  label: string,
  domain: Domain,
  depths: Depth[] = ["detail"],
  extra: Partial<CapabilityDef> = {},
): CapabilityDef => ({ label, domain, kind: "READ", depths, ...extra });
const W = (
  label: string,
  domain: Domain,
  extra: Partial<CapabilityDef> = {},
): CapabilityDef => ({ label, domain, kind: "WRITE", ...extra });
const SCHOOL_ONLY = { scopeable: false };

export const MIS_MANIFEST = defineManifest({
  app: "mis",
  name: "Central MIS",
  version: "2026.10.06",
  capabilities: {
    // People & accounts
    MANAGE_USERS: W("Create, update and deactivate users", "PEOPLE"),
    VIEW_USERS: R("View user statistics", "PEOPLE", ["summary", "detail"]),
    ENABLE_DISABLE_USERS: W("Enable or disable user accounts", "PEOPLE"),
    CHANGE_USER_ROLES: W("Change the roles assigned to users", "ACCESS", SCHOOL_ONLY),
    UPDATE_USER_PROFILE_INFO: W("Update user profile information", "PEOPLE"),
    VIEW_PROGRAM_USERS: R("View people in led programmes", "PEOPLE"),
    VIEW_USERS_BY_CLASS_TEACHER_GRADE: R("View people in own class", "PEOPLE"),
    VIEW_SUBJECT_ENROLLED_STUDENTS: R("View students enrolled in a subject", "PEOPLE"),
    VIEW_MY_STUDENTS: R("View own students", "PEOPLE"),

    // Access administration
    MANAGE_ROLES: W("Manage roles (legacy screen)", "ACCESS", SCHOOL_ONLY),
    MANAGE_PERMISSIONS: W("Manage permissions (legacy screen)", "ACCESS", SCHOOL_ONLY),
    ACCESS_STUDIO_VIEW: R("Open Access Studio", "ACCESS", ["detail"]),
    ACCESS_ROLES_MANAGE: W("Create and edit roles in Access Studio", "ACCESS", SCHOOL_ONLY),
    ACCESS_RULES_MANAGE: W("Edit auto-assignment rules", "ACCESS", SCHOOL_ONLY),
    ACCESS_GRANTS_MANAGE: W("Assign and end positions (within own scope)", "ACCESS"),
    ACCESS_GRANTS_RESTRICTED: W("Grant restricted (sensitive) access", "ACCESS"),
    ACCESS_PREVIEW_AS: R("Preview another user's access", "ACCESS", ["detail"], SCHOOL_ONLY),
    ACCESS_AUDIT_VIEW: R("View the access audit log", "ACCESS", ["detail"], SCHOOL_ONLY),
    VIEW_LEADERSHIP_STRUCTURE: R("View the leadership structure", "ACCESS", ["summary"]),

    // Academic structure
    MANAGE_ACADEMICS: W("Manage academic structures", "ACADEMICS"),
    VIEW_ACADEMICS: R("View the academic structure overview", "ACADEMICS", ["summary", "detail"]),
    MANAGE_CLASSES: W("Manage classes and groups", "ACADEMICS"),
    MANAGE_DEPARTMENTS: W("Manage departments and their subjects", "ACADEMICS", SCHOOL_ONLY),
    VIEW_PROGRAM_ACADEMICS: R("View academics of led programmes", "ACADEMICS"),
    VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE: R("View subjects of own class", "ACADEMICS"),
    VIEW_MY_ASSIGNED_SUBJECTS: R("View own assigned subjects", "ACADEMICS"),
    VIEW_MY_ENROLLED_SUBJECTS: R("View own enrolled subjects", "ACADEMICS"),
    ASSIGN_TEACHER_SUBJECTS: W("Assign subjects to teachers", "ACADEMICS"),
    ASSIGN_GRADE_TO_CLASS_TEACHER: W("Assign class teachers", "ACADEMICS"),
    MANAGE_PROGRAM_LEADS: W("Assign programme leads", "ACADEMICS"),
    MANAGE_STUDENT_ENROLLMENTS: W("Enrol students in subjects", "ACADEMICS"),
    ASSIGN_STUDENT_CLASS_GROUPS: W("Place students in class groups", "ACADEMICS"),

    // Timetable / calendar
    MANAGE_ACADEMIC_CALENDAR: W("Manage calendar slots and activities", "ACADEMICS"),
    CREATE_ACADEMIC_CALENDAR: W("Create academic calendars", "ACADEMICS"),
    UPDATE_CALENDAR_SLOT: W("Update calendar slot details", "ACADEMICS"),
    VIEW_ACADEMIC_CALENDAR: R("View the academic calendar", "ACADEMICS"),
    VIEW_CALENDAR_BY_CLASS_TEACHER_GRADE: R("View own class calendar", "ACADEMICS"),
    VIEW_MY_CALENDAR: R("View own teaching calendar", "ACADEMICS"),
    VIEW_STUDENT_CALENDAR: R("View own student calendar", "ACADEMICS"),
    MANAGE_CALENDAR_NOTIFICATIONS: W("Manage calendar notification settings", "ACADEMICS"),
    VIEW_CALENDAR_NOTIFICATIONS: R("View calendar notification settings", "ACADEMICS"),

    // Curriculum & teaching content
    MANAGE_CURRICULUM: W("Manage competencies, criteria and document categories", "CURRICULUM"),
    VALIDATE_SCHEME_OF_WORK: W("Approve or reject schemes of work", "CURRICULUM"),
    VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST: R("View teachers' schemes of work", "CURRICULUM", ["summary", "detail"]),
    VIEW_LESSON_PLANS: R("View lesson plans from the calendar", "CURRICULUM"),
    VIEW_CALENDAR_SUBJECT_LESSON_PLAN: R("View full lesson plans from the calendar", "CURRICULUM"),
    STUDENT_VIEW_LESSON_PLAN_SUMMARY: R("View lesson plan summaries (students)", "CURRICULUM", ["summary"]),
    MANAGE_LESSON_NOTES: W("Create and share lesson notes", "CURRICULUM"),
    VIEW_SHARED_LESSON_NOTES: R("View lesson notes shared with me", "CURRICULUM"),
    UPLOAD_SUBJECT_DOCUMENTS: W("Upload subject materials", "CURRICULUM"),
    VIEW_SUBJECT_DOCUMENTS: R("View subject materials", "CURRICULUM"),
    DOWNLOAD_SUBJECT_DOCUMENTS: R("Download subject materials", "CURRICULUM"),
    UPLOAD_DOCUMENTS: W("Upload documents", "CURRICULUM"),
    MANAGE_COURSE_CONTENT: W("Build and publish e-learning courses", "CURRICULUM"),
    VIEW_MY_COURSES: R("Open My Learning", "CURRICULUM"),
    VIEW_ALL_COURSES: R("Oversee e-learning courses", "CURRICULUM", ["summary", "detail"]),
    OVERRIDE_COURSE_PROGRESS: W("Mark course items complete for a student", "CURRICULUM"),

    // Assessment, attendance
    ENTER_MARKS: W("Enter assessment marks", "ASSESSMENT"),
    VIEW_RESULTS: R("View results", "ASSESSMENT", ["summary", "detail"]),
    ACCESS_REPORT_CARD_MODULE: R("Open the report card module", "ASSESSMENT"),
    MARK_ATTENDANCE: W("Mark student attendance", "ATTENDANCE"),
    VIEW_ATTENDANCE: R("View attendance", "ATTENDANCE", ["summary", "detail"]),

    // Reporting & dashboards
    SUBMIT_REPORTING: W("Submit lesson / instructor reports", "REPORTING"),
    VIEW_REPORTS: R("View lesson, mentorship and project reports", "REPORTING", ["summary", "detail"]),
    ALL_SUBMITTED_REPORTS: R("View all submitted reports (legacy)", "REPORTING", ["detail"]),
    EXPORT_REPORTS: W("Export reporting data", "REPORTING"),
    MANAGE_REPORTS: W("Manage reporting lookup lists", "REPORTING", SCHOOL_ONLY),
    GENERATE_REPORTS: W("Generate reports", "REPORTING"),
    SUPER_ADMIN_DASHBOARD: R("School overview dashboard", "REPORTING", ["summary"]),
    TEACHER_DASHBOARD: R("Teacher dashboard", "REPORTING", ["detail"]),

    // Welfare / mentorship
    MANAGE_MENTOR_ASSIGNMENTS: W("Assign mentors to students", "WELFARE"),
    SUBMIT_MENTEE_CHECKIN: W("Submit a check-in to my mentor", "WELFARE"),

    // Communication, finance
    SEND_ANNOUNCEMENTS: W("Publish announcements", "COMMS"),
    MANAGE_FEES: W("Manage fee structures and payments", "FINANCE"),
    VIEW_FINANCE: R("View finance reports", "FINANCE", ["summary", "detail"]),

    // Platform
    MANAGE_SCHOOLS: W("Manage schools", "SYSTEM", SCHOOL_ONLY),
    MANAGE_SYSTEMS: W("Manage connected systems", "SYSTEM", SCHOOL_ONLY),
    ASSIGN_SCHOOL_SYSTEMS: W("Assign systems to schools and roles", "SYSTEM", SCHOOL_ONLY),
    MANAGE_SSO_CLIENTS: W("Manage SSO clients", "SYSTEM", SCHOOL_ONLY),
    MANAGE_SETTINGS: W("Manage system settings", "SYSTEM", SCHOOL_ONLY),
    DATABASE_MANAGEMENT: W("Database management tool", "SYSTEM", SCHOOL_ONLY),
    VIEW_ALL_LOGS_HISTORY: R("View system activity logs", "SYSTEM", ["detail"], SCHOOL_ONLY),

    // Platform usage analytics & monitoring (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §11).
    // All v2-only (access/v2Only.ts), and named so that none contains a spoke-app role keyword
    // ("ADMIN", "MANAGE_USER", ...), which accessPhase1Model.test.ts checks.
    ANALYTICS_VIEW: R("View platform usage reports (aggregates)", "SYSTEM", ["summary", "detail"], SCHOOL_ONLY),
    ANALYTICS_LIVE_VIEW: R("See who is online right now (named)", "SYSTEM", ["detail"], SCHOOL_ONLY),
    ANALYTICS_USER_VIEW: R("Open a person's or visitor's activity, IPs and devices", "SYSTEM", ["detail"], SCHOOL_ONLY),
    ANALYTICS_LOCATION_VIEW: R("See precise (browser) location fixes", "SYSTEM", ["detail"], SCHOOL_ONLY),
    ANALYTICS_USER_CONTROL: W("Sign out, suspend, message, watch or block people and devices", "SYSTEM", SCHOOL_ONLY),
    // Leadership view of usage (plan §11, decision D5): adoption for the viewer's own
    // programme / grade / class, aggregates only, small groups suppressed. Scopeable.
    USAGE_INSIGHTS_VIEW: R("See how much the platform is used in your area (aggregates)", "REPORTING", ["summary"]),
    ANALYTICS_CONFIGURE: W("Configure analytics, retention, exclusions and data deletion", "SYSTEM", SCHOOL_ONLY),

    // Mandatory office hours (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §15). Legacy-visible on
    // purpose -- teachers, students and parents still reach routes through legacy roles --
    // and named so none contains a spoke-app role keyword.
    OFFICE_HOURS_MANAGE_OWN: W("Run your own office hours (schedule, assign students, take the register)", "ACADEMICS", SCHOOL_ONLY),
    OFFICE_HOURS_MANAGE_ANY: W("Manage anyone's office hours (override, substitute, closures)", "ACADEMICS"),
    OFFICE_HOURS_VIEW: R("See office-hours attendance and reports in your area", "ATTENDANCE", ["summary", "detail"]),
    OFFICE_HOURS_VIEW_SELF: R("See your own (or your children's) office hours", "ATTENDANCE", ["detail"]),
    OFFICE_HOURS_CONFIGURE: W("Configure office-hours policy", "SYSTEM", SCHOOL_ONLY),
    // NGA Desktop tools: game switches, budgets and hours (nga-desktop TOOLS_HUB plan §6.7.5).
    DESKTOP_TOOLS_CONFIGURE: W("Configure NGA Desktop tools and games", "SYSTEM", SCHOOL_ONLY),
    // Review and publish the desktop tools' French/Kinyarwanda texts (TOOLS_HUB plan §6.3.1).
    TOOLS_TRANSLATIONS_MANAGE: W("Review and publish NGA Desktop tool translations", "SYSTEM", SCHOOL_ONLY),
    // Safeguarding concerns and wellbeing check-ins (nga-desktop NEXT_FEATURES_ANALYSIS §3 #5).
    // Restricted and audited; holders are alerted to every new concern.
    SAFEGUARDING_MANAGE: W("See and act on safeguarding concerns", "WELFARE", { ...SCHOOL_ONLY, restricted: true }),
    // Early warning: risk signals from Tendo/Task Mentor and interventions, in your scope.
    EARLY_WARNING_VIEW: R("See early-warning signals and log interventions", "WELFARE", ["detail"]),
    // Staff absence and cover: approve absences, assign cover teachers.
    STAFF_COVER_MANAGE: W("Approve staff absences and assign cover", "ACADEMICS", SCHOOL_ONLY),
  },
});

export type MisCapability = keyof typeof MIS_MANIFEST.capabilities;
