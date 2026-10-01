import type { Depth, ScopeType } from "../vendor/nga-access";
import { SATELLITE_PRESET_CAPS } from "./presetsSatellite";

/**
 * Seeded role presets and default auto-assignment rules
 * (ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md §5.1, §10).
 *
 * Presets are a STARTING POINT: every role is editable in Access Studio.
 * Seeding is insert-only and each (preset, capability) link is applied at most
 * once (AccessPresetLink), so a link leadership removes is never re-added.
 *
 * `existingName` maps a preset onto a role that already exists. Nothing is
 * ever removed from such a role, and while the role HAS HOLDERS it only gains
 * v2-only capabilities (see V2_ONLY_CAPABILITIES in registry.ts) -- names no
 * legacy route guard and no spoke-app keyword heuristic recognises -- so
 * nobody's current access changes. A mapped role nobody holds yet
 * (HEAD_TEACHER, ADMIN, ACCOUNTANT today) receives its full preset bundle.
 *
 * Capabilities are referenced by registry name: MIS names as-is, satellite
 * capabilities as "<app>:<KEY>". A link to a capability that is not
 * registered yet is simply deferred until that app publishes its manifest.
 *
 * READ links without an explicit depth mean "detail" (legacy meaning: full).
 *
 * Delegation (services/access/delegation.ts) only lets someone grant what they
 * hold themselves, so a leadership preset must contain the roles it appoints:
 * Head Teacher ⊇ deputies, DOS, HOD, grade coordinator, discipline lead,
 * counsellor, insights viewer, communications officer; Deputy Head (Academics)
 * ⊇ DOS, HOD. accessPhase2Engine.test.ts checks these chains.
 */

export type PresetCap = string | [string, Depth];

export interface PresetDef {
  key: string;
  name: string;
  existingName?: string;
  description: string;
  category:
    | "Platform"
    | "Leadership"
    | "Teaching"
    | "Operations"
    | "Welfare"
    | "Learner"
    | "Family";
  scopes: ScopeType[];
  maxHolders?: number;
  platformOnly?: boolean;
  caps: PresetCap[];
}

const ACCESS_ADMIN: PresetCap[] = [
  "ACCESS_STUDIO_VIEW",
  "ACCESS_GRANTS_MANAGE",
  "VIEW_LEADERSHIP_STRUCTURE",
];

const MIS_PRESETS: PresetDef[] = [
  {
    key: "platform_owner",
    name: "Platform Owner",
    existingName: "SUPER_ADMIN",
    description: "Runs the platform. No default access to marks, discipline or welfare content.",
    category: "Platform",
    scopes: ["PLATFORM"],
    maxHolders: 2,
    platformOnly: true,
    caps: [
      ...ACCESS_ADMIN,
      "ACCESS_ROLES_MANAGE",
      "ACCESS_RULES_MANAGE",
      "ACCESS_GRANTS_RESTRICTED",
      "ACCESS_PREVIEW_AS",
      "ACCESS_AUDIT_VIEW",
      "MANAGE_DEPARTMENTS",
      "ANALYTICS_VIEW",
      "ANALYTICS_LIVE_VIEW",
      "ANALYTICS_USER_VIEW",
      "ANALYTICS_LOCATION_VIEW",
      "ANALYTICS_USER_CONTROL",
      "ANALYTICS_CONFIGURE",
    ],
  },
  {
    key: "head_teacher",
    name: "Head Teacher",
    existingName: "HEAD_TEACHER",
    description: "Leads the school: reads everything academic, approves and publishes.",
    category: "Leadership",
    scopes: ["SCHOOL"],
    maxHolders: 1,
    caps: [
      ...ACCESS_ADMIN,
      "ACCESS_ROLES_MANAGE",
      "ACCESS_RULES_MANAGE",
      "ACCESS_GRANTS_RESTRICTED",
      "ACCESS_AUDIT_VIEW",
      "MANAGE_DEPARTMENTS",
      "VIEW_ACADEMICS",
      "VIEW_ACADEMIC_CALENDAR",
      "MANAGE_ACADEMIC_CALENDAR",
      "ASSIGN_TEACHER_SUBJECTS",
      "ASSIGN_GRADE_TO_CLASS_TEACHER",
      "MANAGE_MENTOR_ASSIGNMENTS",
      "VIEW_PROGRAM_USERS",
      "VIEW_PROGRAM_ACADEMICS",
      "VIEW_SUBJECT_DOCUMENTS",
      "VALIDATE_SCHEME_OF_WORK",
      "VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST",
      "VIEW_LESSON_PLANS",
      "VIEW_CALENDAR_SUBJECT_LESSON_PLAN",
      "VIEW_ALL_COURSES",
      ["VIEW_RESULTS", "detail"],
      ["VIEW_ATTENDANCE", "detail"],
      ["VIEW_REPORTS", "detail"],
      "EXPORT_REPORTS",
      "SUPER_ADMIN_DASHBOARD",
      "SEND_ANNOUNCEMENTS",
      ["VIEW_FINANCE", "summary"],
    ],
  },
  {
    key: "deputy_head_academics",
    name: "Deputy Head — Academics",
    description: "School-wide Director of Studies: timetable, curriculum quality, results.",
    category: "Leadership",
    scopes: ["SCHOOL"],
    maxHolders: 1,
    caps: [
      ...ACCESS_ADMIN,
      "MANAGE_DEPARTMENTS",
      "VIEW_ACADEMICS",
      "VIEW_PROGRAM_USERS",
      "VIEW_PROGRAM_ACADEMICS",
      "VIEW_SUBJECT_DOCUMENTS",
      "MANAGE_ACADEMIC_CALENDAR",
      "VIEW_ACADEMIC_CALENDAR",
      "ASSIGN_TEACHER_SUBJECTS",
      "ASSIGN_GRADE_TO_CLASS_TEACHER",
      "MANAGE_MENTOR_ASSIGNMENTS",
      "VALIDATE_SCHEME_OF_WORK",
      "VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST",
      "VIEW_LESSON_PLANS",
      "VIEW_CALENDAR_SUBJECT_LESSON_PLAN",
      "VIEW_ALL_COURSES",
      ["VIEW_RESULTS", "detail"],
      ["VIEW_ATTENDANCE", "summary"],
      ["VIEW_REPORTS", "detail"],
      "EXPORT_REPORTS",
      "SEND_ANNOUNCEMENTS",
    ],
  },
  {
    key: "director_of_studies",
    name: "Director of Studies",
    description: "Academic lead for one or more programmes.",
    category: "Leadership",
    scopes: ["PROGRAM", "SCHOOL"],
    caps: [
      ...ACCESS_ADMIN,
      "VIEW_ACADEMICS",
      "VIEW_PROGRAM_USERS",
      "VIEW_PROGRAM_ACADEMICS",
      "VIEW_SUBJECT_DOCUMENTS",
      "MANAGE_ACADEMIC_CALENDAR",
      "VIEW_ACADEMIC_CALENDAR",
      "ASSIGN_TEACHER_SUBJECTS",
      "ASSIGN_GRADE_TO_CLASS_TEACHER",
      "MANAGE_MENTOR_ASSIGNMENTS",
      "VALIDATE_SCHEME_OF_WORK",
      "VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST",
      "VIEW_LESSON_PLANS",
      "VIEW_CALENDAR_SUBJECT_LESSON_PLAN",
      "VIEW_ALL_COURSES",
      ["VIEW_RESULTS", "detail"],
      ["VIEW_ATTENDANCE", "summary"],
      ["VIEW_REPORTS", "detail"],
      "EXPORT_REPORTS",
      "SEND_ANNOUNCEMENTS",
    ],
  },
  {
    key: "programme_coordinator",
    name: "Programme Coordinator",
    existingName: "PROGRAM_MANAGER",
    description: "Coordinates a programme; granted automatically from programme-lead assignments.",
    category: "Leadership",
    scopes: ["PROGRAM"],
    caps: [...ACCESS_ADMIN, ["VIEW_ATTENDANCE", "summary"], ["VIEW_RESULTS", "summary"]],
  },
  {
    key: "deputy_head_discipline",
    name: "Deputy Head — Discipline",
    description: "School-wide discipline and attendance lead.",
    category: "Leadership",
    scopes: ["SCHOOL"],
    maxHolders: 1,
    caps: [
      ...ACCESS_ADMIN,
      "VIEW_PROGRAM_USERS",
      "VIEW_ACADEMIC_CALENDAR",
      ["VIEW_ATTENDANCE", "detail"],
      "SEND_ANNOUNCEMENTS",
    ],
  },
  {
    key: "discipline_lead",
    name: "Discipline Lead",
    description: "Discipline and attendance for a programme or grade.",
    category: "Leadership",
    scopes: ["PROGRAM", "GRADE"],
    caps: ["VIEW_LEADERSHIP_STRUCTURE", "VIEW_PROGRAM_USERS", "VIEW_ACADEMIC_CALENDAR", ["VIEW_ATTENDANCE", "detail"]],
  },
  {
    key: "head_of_department",
    name: "Head of Department",
    description: "Curriculum quality and assessment moderation for a department's subjects.",
    category: "Leadership",
    scopes: ["DEPARTMENT"],
    caps: [
      "VIEW_LEADERSHIP_STRUCTURE",
      "VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST",
      "VIEW_LESSON_PLANS",
      "VIEW_CALENDAR_SUBJECT_LESSON_PLAN",
      "VIEW_SUBJECT_DOCUMENTS",
      "VIEW_ALL_COURSES",
      ["VIEW_RESULTS", "detail"],
      ["VIEW_REPORTS", "detail"],
    ],
  },
  {
    key: "grade_coordinator",
    name: "Grade Coordinator",
    description: "Year-group lead: attendance and first-line discipline across a grade.",
    category: "Leadership",
    scopes: ["GRADE"],
    caps: [
      "VIEW_LEADERSHIP_STRUCTURE",
      "VIEW_PROGRAM_USERS",
      "VIEW_ACADEMIC_CALENDAR",
      ["VIEW_ATTENDANCE", "detail"],
      ["VIEW_RESULTS", "summary"],
    ],
  },
  {
    key: "class_teacher",
    name: "Class Teacher",
    existingName: "CLASS_TEACHER",
    description: "Homeroom teacher of a class group; granted automatically from class-teacher assignments.",
    category: "Teaching",
    scopes: ["CLASS_GROUP", "GRADE"],
    caps: ["VIEW_LEADERSHIP_STRUCTURE", ["VIEW_ATTENDANCE", "detail"], ["VIEW_RESULTS", "detail"]],
  },
  {
    key: "subject_teacher",
    name: "Subject Teacher",
    description: "Teaches one subject in one class; granted automatically from subject assignments.",
    category: "Teaching",
    scopes: ["SUBJECT_CLASS"],
    caps: [
      "ENTER_MARKS",
      "MARK_ATTENDANCE",
      ["VIEW_ATTENDANCE", "detail"],
      ["VIEW_RESULTS", "detail"],
      "VIEW_MY_STUDENTS",
      "VIEW_LESSON_PLANS",
      "MANAGE_LESSON_NOTES",
      "MANAGE_COURSE_CONTENT",
      "OVERRIDE_COURSE_PROGRESS",
      "UPLOAD_SUBJECT_DOCUMENTS",
      "VIEW_SUBJECT_DOCUMENTS",
      "SUBMIT_REPORTING",
    ],
  },
  {
    key: "mentor",
    name: "Mentor",
    description: "Mentors a list of students; granted automatically from mentor assignments.",
    category: "Welfare",
    scopes: ["MENTEES"],
    caps: [["VIEW_RESULTS", "detail"], ["VIEW_ATTENDANCE", "detail"]],
  },
  {
    key: "school_administrator",
    name: "School Administrator",
    existingName: "ADMIN",
    description: "Runs school operations. No marks or discipline access by default.",
    category: "Operations",
    scopes: ["SCHOOL"],
    caps: [...ACCESS_ADMIN, "VIEW_ACADEMICS", "VIEW_ACADEMIC_CALENDAR"],
  },
  {
    key: "academic_insights_viewer",
    name: "Academic Insights Viewer",
    description:
      "Add-on: programme dashboards and grade/class summaries (results, attendance, discipline trends) with no individual records.",
    category: "Leadership",
    scopes: ["SCHOOL", "PROGRAM"],
    caps: [
      ["VIEW_RESULTS", "summary"],
      ["VIEW_ATTENDANCE", "summary"],
      ["VIEW_REPORTS", "summary"],
      ["VIEW_ALL_COURSES", "summary"],
      ["VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST", "summary"],
      ["VIEW_ACADEMICS", "summary"],
    ],
  },
  {
    key: "registrar",
    name: "Registrar",
    description: "Admissions, enrolment and student/parent accounts.",
    category: "Operations",
    scopes: ["SCHOOL"],
    caps: [
      "MANAGE_USERS",
      "MANAGE_STUDENT_ENROLLMENTS",
      "ASSIGN_STUDENT_CLASS_GROUPS",
      "VIEW_ACADEMICS",
      "VIEW_LEADERSHIP_STRUCTURE",
    ],
  },
  {
    key: "bursar",
    name: "Bursar",
    existingName: "ACCOUNTANT",
    description: "Fees and finance.",
    category: "Operations",
    scopes: ["SCHOOL"],
    caps: ["MANAGE_FEES", ["VIEW_FINANCE", "detail"], "VIEW_LEADERSHIP_STRUCTURE"],
  },
  {
    key: "counsellor",
    name: "Counsellor",
    description: "Student welfare; case files are restricted and granted with justification.",
    category: "Welfare",
    scopes: ["SCHOOL", "PROGRAM"],
    caps: ["VIEW_LEADERSHIP_STRUCTURE", ["VIEW_ATTENDANCE", "summary"], ["VIEW_RESULTS", "summary"]],
  },
  {
    key: "safeguarding_lead",
    name: "Safeguarding Lead",
    description: "Safeguarding and communication oversight (restricted, audited).",
    category: "Welfare",
    scopes: ["SCHOOL"],
    caps: ["VIEW_LEADERSHIP_STRUCTURE", ["VIEW_ATTENDANCE", "summary"]],
  },
  {
    key: "communications_officer",
    name: "Communications Officer",
    description: "Announcements, feed pages and bulk communication.",
    category: "Operations",
    scopes: ["SCHOOL"],
    caps: ["SEND_ANNOUNCEMENTS", "VIEW_LEADERSHIP_STRUCTURE"],
  },
  {
    key: "it_support",
    name: "IT Support",
    description: "Accounts, systems and SSO. No academic, welfare or finance content.",
    category: "Platform",
    scopes: ["SCHOOL"],
    platformOnly: true,
    caps: [
      "MANAGE_USERS",
      "ENABLE_DISABLE_USERS",
      "MANAGE_SYSTEMS",
      "MANAGE_SSO_CLIENTS",
      "VIEW_ALL_LOGS_HISTORY",
      "ACCESS_STUDIO_VIEW",
      "ACCESS_PREVIEW_AS",
      "ACCESS_AUDIT_VIEW",
      "ANALYTICS_VIEW",
      "ANALYTICS_LIVE_VIEW",
    ],
  },
  // Personas -- baseline self-service, granted by rules at SELF / CHILDREN.
  {
    key: "teaching_staff",
    name: "Teaching Staff",
    existingName: "TEACHER",
    description: "Baseline for every teacher (own calendar, own records). Teaching power comes from Subject/Class Teacher grants.",
    category: "Teaching",
    scopes: ["SELF"],
    caps: ["VIEW_LEADERSHIP_STRUCTURE"],
  },
  {
    key: "support_staff",
    name: "Staff Member",
    existingName: "STAFF",
    description: "Baseline for non-teaching staff.",
    category: "Operations",
    scopes: ["SELF"],
    caps: ["VIEW_LEADERSHIP_STRUCTURE"],
  },
  {
    key: "student",
    name: "Student",
    existingName: "STUDENT",
    description: "Learner self-service.",
    category: "Learner",
    scopes: ["SELF"],
    caps: [],
  },
  {
    key: "parent",
    name: "Parent",
    existingName: "PARENT",
    description: "Parent/guardian: their children's records.",
    category: "Family",
    scopes: ["CHILDREN", "SELF"],
    caps: [],
  },
];

const DEPTH_RANK: Record<string, number> = { summary: 1, detail: 2, sensitive: 3 };

/**
 * One entry per capability, keeping the deepest: presets are assembled from
 * shared blocks, so e.g. the Head Teacher lists attendance at "summary"
 * (insights) and at "detail" (discipline lead). A plain entry means "detail".
 */
export function mergePresetCaps(caps: PresetCap[]): PresetCap[] {
  const byName = new Map<string, PresetCap>();
  for (const c of caps) {
    const name = Array.isArray(c) ? c[0] : c;
    const rank = Array.isArray(c) ? DEPTH_RANK[c[1]] : DEPTH_RANK.detail;
    const prev = byName.get(name);
    const prevRank = prev === undefined ? 0 : Array.isArray(prev) ? DEPTH_RANK[prev[1]] : DEPTH_RANK.detail;
    if (prev === undefined || rank > prevRank) byName.set(name, c);
  }
  return [...byName.values()];
}

/** MIS presets plus their capabilities in the other apps (presetsSatellite.ts). */
export const PRESETS: PresetDef[] = MIS_PRESETS.map((p) => ({
  ...p,
  caps: mergePresetCaps([...p.caps, ...(SATELLITE_PRESET_CAPS[p.key] ?? [])]),
}));

export interface RuleDef {
  key: string;
  name: string;
  trigger: "PERSONA" | "CLASS_TEACHER" | "SUBJECT_TEACHER" | "PROGRAM_LEAD" | "MENTOR" | "PARENT";
  filter?: { user_type?: string };
  preset: string;
}

export const DEFAULT_RULES: RuleDef[] = [
  { key: "persona_student", name: "Students get the Student baseline", trigger: "PERSONA", filter: { user_type: "STUDENT" }, preset: "student" },
  { key: "persona_parent", name: "Parents get the Parent baseline", trigger: "PERSONA", filter: { user_type: "PARENT" }, preset: "parent" },
  { key: "persona_teacher", name: "Teachers get the Teaching Staff baseline", trigger: "PERSONA", filter: { user_type: "TEACHER" }, preset: "teaching_staff" },
  { key: "persona_staff", name: "Staff get the Staff Member baseline", trigger: "PERSONA", filter: { user_type: "STAFF" }, preset: "support_staff" },
  { key: "persona_admin", name: "Administrators get the Staff Member baseline", trigger: "PERSONA", filter: { user_type: "ADMIN" }, preset: "support_staff" },
  { key: "parent_children", name: "Parents see their children", trigger: "PARENT", preset: "parent" },
  { key: "class_teacher", name: "Class teachers lead their class", trigger: "CLASS_TEACHER", preset: "class_teacher" },
  { key: "subject_teacher", name: "Subject teachers teach their subject in their class", trigger: "SUBJECT_TEACHER", preset: "subject_teacher" },
  { key: "programme_lead", name: "Programme leads coordinate their programme", trigger: "PROGRAM_LEAD", preset: "programme_coordinator" },
  { key: "mentor", name: "Mentors follow their mentees", trigger: "MENTOR", preset: "mentor" },
];

/** Legacy UserRole -> grant scope during the one-off backfill (§11 Phase 1). */
export const LEGACY_ROLE_BACKFILL: Record<string, ScopeType | "RULE"> = {
  platform_owner: "PLATFORM",
  head_teacher: "SCHOOL",
  school_administrator: "SCHOOL",
  bursar: "SCHOOL",
  // Scoped roles come from their placements through the rules; a holder with
  // no placement is reported, never widened to the whole school.
  class_teacher: "RULE",
  programme_coordinator: "RULE",
  // Personas come from UserProfile.user_type through the persona rules.
  teaching_staff: "RULE",
  support_staff: "RULE",
  student: "RULE",
  parent: "RULE",
};
