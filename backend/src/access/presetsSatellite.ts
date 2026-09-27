import type { PresetCap } from "./presets";

/**
 * What each preset may do in the other apps (plan §10), by the apps'
 * capability keys (their manifests: nga-task-mentor/server/src/access,
 * nga-discipline-attendance/server/src/access,
 * nga-communication-module/apps/api/src/access).
 *
 * Merged into PRESETS (presets.ts). Links stay deferred until the app has
 * published its manifest, and -- like every preset link -- are applied once
 * and never re-added after leadership removes them.
 *
 * READ links without a depth mean "detail".
 */

const tm = (...caps: PresetCap[]): PresetCap[] =>
  caps.map((c) => (Array.isArray(c) ? [`tm:${c[0]}`, c[1]] : `tm:${c}`));
const da = (...caps: PresetCap[]): PresetCap[] =>
  caps.map((c) => (Array.isArray(c) ? [`da:${c[0]}`, c[1]] : `da:${c}`));
const tupo = (...caps: PresetCap[]): PresetCap[] =>
  caps.map((c) => (Array.isArray(c) ? [`tupo:${c[0]}`, c[1]] : `tupo:${c}`));

/** Everyone who talks in Tupo (Tupo's old BASELINE). */
const TUPO_BASELINE = tupo(
  "MESSAGE_SEND", "MESSAGE_READ", "MESSAGE_EDIT_OWN", "MESSAGE_DELETE_OWN",
  "CHANNEL_VIEW", "CHANNEL_JOIN", "MEET_JOIN", "FILE_UPLOAD", "FILE_DOWNLOAD",
  "FILE_DELETE_OWN", "FEED_VIEW", "FEED_COMMENT", "FEED_STORY_POST", "FEED_REEL_POST",
  "MAIL_READ", "DIRECTORY_VIEW", "PRESENCE_VIEW", "REPORT_SUBMIT",
  "NOTIFICATIONS_MANAGE", "SETTINGS_MANAGE",
);
/** Staff communication (Tupo's old Staff role). */
const TUPO_STAFF = [
  ...TUPO_BASELINE,
  ...tupo(
    "MESSAGE_PIN", "MESSAGE_FORWARD", "MESSAGE_SCHEDULE", "DM_START", "CHANNEL_CREATE",
    "MEET_START", "MEET_SCHEDULE", "MEET_HOST_CONTROLS", "MEET_SCREENSHARE", "MEET_RECORD",
    "MEET_TRANSCRIBE", "MEET_AI_USE", "FEED_POST", "MAIL_SEND", "MAIL_TEMPLATE_MANAGE",
    "MAIL_AI_USE", ["DASHBOARD_VIEW", "detail"],
  ),
];

/** Teaching one subject in one class. */
const TEACHING = [
  ...tm(
    "COURSES_VIEW", "COURSES_VIEW_STUDENTS", ["COURSES_VIEW_GRADES", "detail"],
    "ASSIGNMENTS_VIEW", "ASSIGNMENTS_CREATE", "ASSIGNMENTS_EDIT", "ASSIGNMENTS_DELETE",
    ["ASSIGNMENTS_VIEW_SUBMISSIONS", "detail"], ["SUBMISSIONS_VIEW_ALL", "detail"], "SUBMISSIONS_GRADE",
    "QUIZZES_VIEW", "QUIZZES_CREATE", "QUIZZES_EDIT", "QUIZZES_DELETE",
    ["QUIZZES_VIEW_RESULTS_ALL", "detail"], "QUIZZES_GRADE", "QUIZ_QUESTIONS_VIEW_WITH_ANSWERS",
    "QUESTION_BANK_VIEW", "QUESTION_BANK_CREATE", "QUESTION_BANK_EDIT", "QUESTION_BANK_DELETE",
    "QUESTION_BANK_HUB_VIEW", "GRADING_MANUAL_ASSESS", "PROCTORING_MANAGE_SETTINGS", "PROCTORING_START_SESSION",
    ["PROCTORING_VIEW_SESSIONS", "detail"], "PROCTORING_JOIN_LIVE_STREAM", ["PROCTORING_VIEW_ANALYTICS", "detail"],
    ["MANUAL_ASSESSMENTS_VIEW", "detail"], "MANUAL_ASSESSMENTS_CREATE", "MANUAL_ASSESSMENTS_EDIT",
    "MANUAL_ASSESSMENTS_DELETE", "REPORT_CARDS_EDIT", ["REPORT_CARDS_VIEW_ALL", "detail"], "USERS_VIEW_ALL",
  ),
  ...da(
    "ATTENDANCE_MARK", ["ATTENDANCE_VIEW_ALL", "detail"], "EXCUSES_REVIEW", "DISCIPLINE_LOG",
    ["DISCIPLINE_VIEW_ALL", "detail"], ["ROSTER_VIEW", "detail"], ["REPORTS_VIEW", "detail"],
  ),
  ...tupo("CHANNEL_MANAGE", "CHANNEL_MEMBERS_MANAGE"),
];

/** Academic oversight (DOS / Deputy Head Academics). */
const ACADEMIC_LEAD = [
  ...tm(
    "COURSES_VIEW", ["COURSES_VIEW_GRADES", "detail"], ["SUBMISSIONS_VIEW_ALL", "detail"],
    ["QUIZZES_VIEW_RESULTS_ALL", "detail"], ["REPORT_CARDS_VIEW_ALL", "detail"], "REPORT_CARDS_APPROVE",
    "REPORT_CARDS_EXPORT_PDF", ["MANUAL_ASSESSMENTS_VIEW", "detail"], "GRADING_OVERRIDE_SCORE",
    "QUESTION_BANK_VIEW", "QUESTION_BANK_MANAGE_ANY", ["PROCTORING_VIEW_ANALYTICS", "summary"], "DASHBOARD_VIEW_ADMIN",
    "USERS_VIEW_ALL", "ACADEMICS_VIEW",
  ),
  ...da(["ATTENDANCE_VIEW_ALL", "summary"], ["REPORTS_VIEW", "summary"], ["STAFF_ATTENDANCE_VIEW_ALL", "detail"]),
  ...tupo("CHANNEL_ANNOUNCE", ["DASHBOARD_VIEW", "summary"]),
];

/** Discipline & attendance leadership. */
const DISCIPLINE_LEAD = [
  ...da(
    ["ATTENDANCE_VIEW_ALL", "detail"], "ATTENDANCE_MARK", "EXCUSES_REVIEW", "DISCIPLINE_LOG",
    ["DISCIPLINE_VIEW_ALL", "detail"], "DISCIPLINE_REVIEW", "DISCIPLINE_EDIT",
    "DISCIPLINE_SANCTION_MINOR", "DISCIPLINE_SANCTION_MAJOR", ["ROSTER_VIEW", "detail"], ["REPORTS_VIEW", "detail"],
  ),
];

/** Aggregates only -- the "admin sees summaries" add-on. */
const INSIGHTS = [
  ...tm(["COURSES_VIEW_GRADES", "summary"], ["SUBMISSIONS_VIEW_ALL", "summary"], ["REPORT_CARDS_VIEW_ALL", "summary"], ["PROCTORING_VIEW_ANALYTICS", "summary"]),
  ...da(["ATTENDANCE_VIEW_ALL", "summary"], ["DISCIPLINE_VIEW_ALL", "summary"], ["REPORTS_VIEW", "summary"], ["STAFF_ATTENDANCE_VIEW_ALL", "summary"]),
  ...tupo(["DASHBOARD_VIEW", "summary"]),
];

export const SATELLITE_PRESET_CAPS: Record<string, PresetCap[]> = {
  platform_owner: [
    ...tm("ROLES_PERMISSIONS_VIEW", "ROLES_PERMISSIONS_MANAGE", "DATABASE_ADMIN_ACCESS", "ACADEMICS_MANAGE_PERIODS", "USERS_CREATE", "USERS_EDIT", "USERS_DELETE"),
    ...da("ROLES_PERMISSIONS_VIEW", "ROLES_PERMISSIONS_MANAGE", "USERS_VIEW", "USERS_MANAGE", "AUDIT_VIEW", "ROSTER_SYNC", "ACADEMIC_PERIOD_SWITCH", "NOTIFICATIONS_MANAGE"),
    ...tupo(
      "USERS_VIEW", "USERS_MANAGE", "SPACE_MANAGE", "RETENTION_MANAGE", "AUDIT_VIEW", ["ANALYTICS_VIEW", "summary"],
      ["SYSTEM_HEALTH_VIEW", "summary"], "INTEGRATIONS_MANAGE", "COMPLIANCE_EXPORT", "ROLES_PERMISSIONS_VIEW",
      "ROLES_PERMISSIONS_MANAGE", "DIRECTORY_SYNC", "FILE_QUOTA_MANAGE", "FILE_DELETE_ANY", "MESSAGE_DELETE_ANY",
      "CHANNEL_ARCHIVE", "CONTACT_POLICY_MANAGE", "MODERATION_QUEUE_VIEW", "MODERATION_ACT",
    ),
  ],
  head_teacher: [
    ...ACADEMIC_LEAD,
    ...DISCIPLINE_LEAD,
    ...INSIGHTS,
    ...tm("REPORT_CARDS_PUBLISH"),
    ...da(
      "DISCIPLINE_ADJUST", "DISCIPLINE_RULES_MANAGE", "DISCIPLINE_SUSPEND_RECOMMEND", "DISCIPLINE_SUSPEND_APPROVE",
      "USERS_VIEW", "ACADEMIC_PERIOD_VIEW", "AUDIT_VIEW",
    ),
    ...tupo("FEED_PAGE_MANAGE", "FEED_POST", ["FEED_ANALYTICS_VIEW", "summary"], "MAIL_BULK_SEND", "MAIL_APPROVE", "MAIL_LIST_MANAGE", "MAIL_TEMPLATE_MANAGE", ["ANALYTICS_VIEW", "summary"], "USERS_VIEW", "AUDIT_VIEW"),
  ],
  deputy_head_academics: [...ACADEMIC_LEAD],
  director_of_studies: [...ACADEMIC_LEAD],
  programme_coordinator: [
    ...tm(["COURSES_VIEW_GRADES", "summary"], ["REPORT_CARDS_VIEW_ALL", "summary"], ["SUBMISSIONS_VIEW_ALL", "summary"]),
    ...da(["ATTENDANCE_VIEW_ALL", "summary"], ["DISCIPLINE_VIEW_ALL", "summary"], ["REPORTS_VIEW", "summary"]),
    ...tupo("CHANNEL_ANNOUNCE", ["DASHBOARD_VIEW", "summary"]),
  ],
  deputy_head_discipline: [
    ...DISCIPLINE_LEAD,
    ...da("DISCIPLINE_ADJUST", "DISCIPLINE_RULES_MANAGE", "DISCIPLINE_SUSPEND_RECOMMEND", ["STAFF_ATTENDANCE_VIEW_ALL", "detail"]),
    ...tupo("CHANNEL_ANNOUNCE", ["DASHBOARD_VIEW", "summary"]),
  ],
  discipline_lead: [...DISCIPLINE_LEAD],
  head_of_department: [
    ...tm(
      "COURSES_VIEW", ["COURSES_VIEW_GRADES", "detail"], ["SUBMISSIONS_VIEW_ALL", "detail"],
      ["QUIZZES_VIEW_RESULTS_ALL", "detail"], "QUESTION_BANK_VIEW", "QUESTION_BANK_MANAGE_ANY",
      ["MANUAL_ASSESSMENTS_VIEW", "detail"], ["REPORT_CARDS_VIEW_ALL", "summary"], ["PROCTORING_VIEW_ANALYTICS", "summary"],
    ),
  ],
  grade_coordinator: [
    ...da(
      ["ATTENDANCE_VIEW_ALL", "detail"], "ATTENDANCE_MARK", "EXCUSES_REVIEW", "DISCIPLINE_LOG",
      ["DISCIPLINE_VIEW_ALL", "detail"], "DISCIPLINE_REVIEW", "DISCIPLINE_SANCTION_MINOR",
      ["ROSTER_VIEW", "detail"], ["REPORTS_VIEW", "detail"],
    ),
    ...tm(["COURSES_VIEW_GRADES", "summary"], ["REPORT_CARDS_VIEW_ALL", "summary"]),
  ],
  class_teacher: [
    ...da(
      "ATTENDANCE_MARK", ["ATTENDANCE_VIEW_ALL", "detail"], "EXCUSES_REVIEW", "DISCIPLINE_LOG",
      ["DISCIPLINE_VIEW_ALL", "detail"], "DISCIPLINE_REVIEW", "DISCIPLINE_SANCTION_MINOR",
      ["ROSTER_VIEW", "detail"], ["REPORTS_VIEW", "detail"],
    ),
    ...tm(
      // Found by shadow mode on real data: a class teacher whose MIS profile is
      // STAFF (no teaching-staff baseline) must still see their class's work.
      "COURSES_VIEW", "QUIZZES_VIEW", "ASSIGNMENTS_VIEW",
      "REPORT_CARDS_COMMENT", ["REPORT_CARDS_VIEW_ALL", "detail"], ["COURSES_VIEW_GRADES", "detail"],
      ["MANUAL_ASSESSMENTS_VIEW", "detail"], "USERS_VIEW_ALL", ["SUBMISSIONS_VIEW_ALL", "summary"],
    ),
    ...tupo("CHANNEL_ANNOUNCE", "MAIL_BULK_SEND", ["DASHBOARD_VIEW", "detail"]),
  ],
  subject_teacher: [...TEACHING],
  mentor: [
    ...da(["ATTENDANCE_VIEW_ALL", "detail"], ["DISCIPLINE_VIEW_ALL", "detail"]),
    ...tm(["COURSES_VIEW_GRADES", "detail"], ["REPORT_CARDS_VIEW_ALL", "detail"]),
  ],
  school_administrator: [
    ...da("ACADEMIC_PERIOD_VIEW", ["STAFF_ATTENDANCE_VIEW_ALL", "detail"]),
    ...tupo("CHANNEL_ANNOUNCE", "USERS_VIEW"),
  ],
  academic_insights_viewer: [...INSIGHTS],
  registrar: [...tm("USERS_MANAGE_ENROLLMENT"), ...da(["ROSTER_VIEW", "detail"], "ROSTER_SYNC")],
  bursar: [],
  counsellor: [
    ...da(["ATTENDANCE_VIEW_ALL", "summary"], ["DISCIPLINE_VIEW_ALL", "detail"]),
    ...tm(["COURSES_VIEW_GRADES", "summary"]),
  ],
  safeguarding_lead: [
    ...da(["ATTENDANCE_VIEW_ALL", "summary"], ["DISCIPLINE_VIEW_ALL", "sensitive"]),
    ...tupo(
      ["OVERSIGHT_VIEW_ALL", "sensitive"], "OVERSIGHT_MESSAGE_DELETE", "MODERATION_QUEUE_VIEW",
      "MODERATION_ACT", "CONTACT_POLICY_MANAGE", ["DASHBOARD_VIEW", "summary"],
    ),
  ],
  communications_officer: [
    ...tupo(
      "FEED_PAGE_MANAGE", "FEED_POST", ["FEED_ANALYTICS_VIEW", "summary"], "MAIL_BULK_SEND",
      "MAIL_LIST_MANAGE", "MAIL_TEMPLATE_MANAGE", "CHANNEL_ANNOUNCE", ["DASHBOARD_VIEW", "summary"],
    ),
  ],
  it_support: [
    ...tm("USERS_CREATE", "USERS_EDIT", "ROLES_PERMISSIONS_VIEW"),
    ...da("USERS_VIEW", "USERS_MANAGE", "ROSTER_SYNC", "ROLES_PERMISSIONS_VIEW", "AUDIT_VIEW", "NOTIFICATIONS_MANAGE"),
    ...tupo(
      "USERS_VIEW", "USERS_MANAGE", ["SYSTEM_HEALTH_VIEW", "summary"], "INTEGRATIONS_MANAGE", "AUDIT_VIEW",
      "DIRECTORY_SYNC", "RETENTION_MANAGE", "FILE_QUOTA_MANAGE", "ROLES_PERMISSIONS_VIEW",
    ),
  ],
  teaching_staff: [
    ...tm("USERS_VIEW_SELF", "DASHBOARD_VIEW_INSTRUCTOR", "ACADEMICS_VIEW", "QUIZZES_VIEW", "COURSES_VIEW"),
    ...da("STAFF_ATTENDANCE_CLOCK", "STAFF_ATTENDANCE_VIEW_OWN", "ACADEMIC_PERIOD_VIEW", "ACADEMIC_PERIOD_SWITCH", "ROSTER_VIEW", "SETTINGS_MANAGE", "NOTIFICATIONS_MANAGE"),
    ...TUPO_STAFF,
  ],
  support_staff: [
    ...da("STAFF_ATTENDANCE_CLOCK", "STAFF_ATTENDANCE_VIEW_OWN", "ACADEMIC_PERIOD_VIEW", "ACADEMIC_PERIOD_SWITCH", "SETTINGS_MANAGE", "NOTIFICATIONS_MANAGE"),
    ...TUPO_STAFF,
  ],
  student: [
    ...tm(
      "USERS_VIEW_SELF", "COURSES_VIEW", "COURSES_VIEW_OWN_GRADES", "ASSIGNMENTS_VIEW", "SUBMISSIONS_VIEW_OWN",
      "SUBMISSIONS_CREATE", "QUIZZES_VIEW", "QUIZZES_ATTEMPT", "QUIZZES_VIEW_RESULTS_OWN",
      "QUIZ_QUESTIONS_USE_AI_HINT", "QUIZ_QUESTIONS_RUN_CODE", "PROCTORING_VIEW_OWN_SESSIONS",
      "PROCTORING_LOG_EVENTS", "REPORT_CARDS_VIEW_OWN", "DASHBOARD_VIEW_STUDENT", "ACADEMICS_VIEW",
    ),
    ...da(
      "ATTENDANCE_VIEW_OWN", "ATTENDANCE_CALENDAR_VIEW_OWN", "ATTENDANCE_DASHBOARD_VIEW_OWN",
      "ATTENDANCE_REPORT_VIEW_OWN", "EXCUSES_SUBMIT", "EXCUSES_VIEW_OWN", "DISCIPLINE_VIEW_OWN",
      "ACADEMIC_PERIOD_VIEW", "ACADEMIC_PERIOD_SWITCH", "ROSTER_VIEW", "NOTIFICATIONS_MANAGE", "SETTINGS_MANAGE",
    ),
    ...TUPO_BASELINE,
  ],
  parent: [
    ...da(["ATTENDANCE_VIEW_ALL", "detail"], ["DISCIPLINE_VIEW_ALL", "detail"], "EXCUSES_SUBMIT", "ACADEMIC_PERIOD_VIEW", "NOTIFICATIONS_MANAGE", "SETTINGS_MANAGE"),
    ...tm(["REPORT_CARDS_VIEW_ALL", "detail"], ["COURSES_VIEW_GRADES", "detail"]),
    ...TUPO_BASELINE,
    ...tupo("DM_START"),
  ],
};
