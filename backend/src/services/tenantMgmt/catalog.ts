/**
 * Package catalog vocabulary (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §3).
 *
 * Packages themselves are data (control plane Package / PackageEntitlement,
 * seeded by migrations/platform/002). This file names the keys and maps every
 * capability that belongs to a paid feature onto that feature, so the snapshot
 * compiler can drop it for a tenant whose package lacks the feature -- the spokes
 * keep calling can(cap) and simply get false (no spoke code change).
 */

export type EntKind = "APP" | "FEATURE" | "LIMIT";

/** APP entitlement key -> access app key ("mis", "tm", "da", "tupo") or a non-access app. */
export const APP_KEYS: Record<string, { label: string; accessApp: string | null; client: string | null }> = {
  "app.mis": { label: "Central MIS", accessApp: "mis", client: null },
  "app.taskmentor": { label: "Task Mentor", accessApp: "tm", client: "taskmentor_app" },
  "app.tendo": { label: "Tendo", accessApp: "da", client: "discipline_attendance" },
  "app.tupo": { label: "Tupo", accessApp: "tupo", client: "tupo" },
  "app.desktop": { label: "NGA Desktop", accessApp: null, client: null },
  "app.tmcode": { label: "TMCode", accessApp: null, client: null },
};

export const FEATURES: Record<string, string> = {
  "feature.elearning": "E-learning courses",
  "feature.ai_lesson_studio": "AI Lesson Studio, AI tutor and question generator",
  "feature.office_hours": "Office hours",
  "feature.safeguarding": "Safeguarding",
  "feature.mentorship": "Mentorship",
  "feature.competency_map": "Competency map",
  "feature.reminders.push": "Push reminders",
  "feature.reminders.telegram": "Telegram reminders",
  "feature.reminders.google_calendar": "Google Calendar reminders",
  "feature.analytics.advanced": "Advanced usage analytics",
  "feature.tupo.meetings": "Tupo meetings",
  "feature.tupo.feed": "Tupo feed",
  "feature.tm.proctoring": "Proctoring",
  "feature.tm.code_runner": "Code runner, TMCode and Code Playground",
  "feature.tm.paper_sheets": "Paper answer sheets and practical grading",
  "feature.tendo.rfid": "RFID attendance",
  "feature.integration_api": "Integration API tokens",
  "feature.mcp": "MCP connector",
  "feature.custom_branding": "Custom branding",
  "feature.custom_branding.pdf": "Logo on PDFs",
};

export const LIMITS: Record<string, { label: string; unit: string; consumable: "day" | "month" | null }> = {
  "limit.students": { label: "Students", unit: "", consumable: null },
  "limit.staff": { label: "Staff", unit: "", consumable: null },
  "limit.storage_gb": { label: "Storage", unit: "GB", consumable: null },
  "limit.ai_requests_day": { label: "AI requests", unit: "/day", consumable: "day" },
  "limit.code_runs_day": { label: "Code runs", unit: "/day", consumable: "day" },
  "limit.tupo_meeting_minutes_month": { label: "Meeting minutes", unit: "/month", consumable: "month" },
};

export const PACKAGE_CODES = ["starter", "gold", "premium", "max"] as const;

export function kindOfKey(key: string): EntKind | null {
  if (key in APP_KEYS) return "APP";
  if (key in FEATURES) return "FEATURE";
  if (key in LIMITS) return "LIMIT";
  return null;
}

/**
 * Capability -> the feature it needs, per access app. A capability not listed
 * here is core (every package). Patterns end in "*" (prefix match).
 */
export const CAPABILITY_FEATURES: Record<string, Record<string, string>> = {
  mis: {
    MANAGE_COURSE_CONTENT: "feature.elearning",
    VIEW_MY_COURSES: "feature.elearning",
    VIEW_ALL_COURSES: "feature.elearning",
    OVERRIDE_COURSE_PROGRESS: "feature.elearning",
    "OFFICE_HOURS_*": "feature.office_hours",
    SAFEGUARDING_MANAGE: "feature.safeguarding",
    MANAGE_MENTOR_ASSIGNMENTS: "feature.mentorship",
    SUBMIT_MENTEE_CHECKIN: "feature.mentorship",
    CODE_PLAYGROUND_USE: "feature.tm.code_runner",
    ANALYTICS_LIVE_VIEW: "feature.analytics.advanced",
    ANALYTICS_USER_VIEW: "feature.analytics.advanced",
    ANALYTICS_LOCATION_VIEW: "feature.analytics.advanced",
    ANALYTICS_USER_CONTROL: "feature.analytics.advanced",
    AI_PERSONAL_PROVIDERS: "feature.ai_lesson_studio",
    AI_PERSONAL_PROVIDERS_STUDENT: "feature.ai_lesson_studio",
    AI_EXTERNAL_CONNECT: "feature.mcp",
  },
  tm: {
    "PROCTORING_*": "feature.tm.proctoring",
    QUIZ_QUESTIONS_RUN_CODE: "feature.tm.code_runner",
    "TMCODE_*": "feature.tm.code_runner",
    "PROJECTS_*": "feature.tm.code_runner",
    CODE_RUNNER_ADMIN: "feature.tm.code_runner",
    GRADING_MANUAL_ASSESS: "feature.tm.paper_sheets",
    QUIZ_QUESTIONS_USE_AI_HINT: "feature.ai_lesson_studio",
    AI_PREMIUM: "feature.ai_lesson_studio",
  },
  da: {},
  tupo: {
    "MEET_*": "feature.tupo.meetings",
    "FEED_*": "feature.tupo.feed",
  },
};

/** The feature `cap` (of access app `app`) needs, or null when it is core. */
export function featureOfCapability(app: string, cap: string): string | null {
  const map = CAPABILITY_FEATURES[app];
  if (!map) return null;
  if (map[cap]) return map[cap];
  for (const [pattern, feature] of Object.entries(map)) {
    if (pattern.endsWith("*") && cap.startsWith(pattern.slice(0, -1))) return feature;
  }
  return null;
}

/**
 * Platform capabilities (§4). Honoured only inside the primary tenant and never
 * part of a package. Named in the MIS style (upper snake, no "platform." dots).
 */
export const PLATFORM_CAPS = {
  view: "PLATFORM_TENANTS_VIEW",
  review: "PLATFORM_APPLICATIONS_REVIEW",
  decide: "PLATFORM_APPLICATIONS_DECIDE",
  invoice: "PLATFORM_BILLING_INVOICE",
  confirm: "PLATFORM_BILLING_CONFIRM",
  waive: "PLATFORM_BILLING_WAIVE",
  lifecycle: "PLATFORM_TENANTS_LIFECYCLE",
  entitlements: "PLATFORM_TENANTS_ENTITLEMENTS",
  packages: "PLATFORM_PACKAGES_MANAGE",
  support: "PLATFORM_SUPPORT_ACCESS",
  audit: "PLATFORM_AUDIT_VIEW",
} as const;

export type PlatformCap = (typeof PLATFORM_CAPS)[keyof typeof PLATFORM_CAPS];
export const PLATFORM_CAP_LIST: string[] = Object.values(PLATFORM_CAPS);
export const isPlatformCap = (cap: string) => cap.startsWith("PLATFORM_");

/** Tenant-side capabilities (§6.7 / §7): the school's own settings and billing. */
export const TENANT_CAPS = {
  settings: "SCHOOL_SETTINGS_MANAGE",
  billing: "SCHOOL_BILLING_MANAGE",
} as const;
