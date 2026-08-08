import api from "../services/api";

export interface InstructorReport {
  report_id: number;
  user_id: number;
  academic_term_id?: number;
  class_group_id?: number;
  week_number?: number;
  start_date: string;
  end_date: string;
  submission_date: string;
  progress_status: "ON_TRACK" | "SLIGHTLY_BEHIND" | "AHEAD";
  key_highlights?: string;
  challenges_encountered?: string;
  lessons_delivered_count: number;
  mentorship_sessions_count: number;
  active_students_count: number;
  struggling_students_count: number;
  first_name?: string;
  last_name?: string;
}

export interface ReportDetails extends InstructorReport {
  topics: any[];
  lessons: any[];
  mentorship: any[];
  projectUpdates: any[];
  reflections: any;
}

// ─── Decoupled Lesson Reporting types ────────────────────────────────────────

export interface LearningOutcomeSummary {
  code: string | null;
  title: string | null;
  description: string | null;
}

export interface LessonReportSummary {
  lesson_report_id: number;
  status: "DELIVERED" | "PARTIAL" | "MISSED";
  attendance_count: number | null;
  completion_rate: number | null;
  schedule_flag: "ON_TIME" | "AHEAD" | "BEHIND";
}

export interface ReportableLesson {
  slot_id: number;
  date: string; // yyyy-MM-dd
  start_time: string | null;
  end_time: string | null;
  subject_name: string | null;
  subject_code: string | null;
  subject_color: string | null;
  module_code: string | null;
  module_name: string | null;
  big_question: string | null;
  topic: string | null;
  sub_topic: string | null;
  objective: string | null;
  learning_outcomes: LearningOutcomeSummary[];
  lesson_id: number | null;
  entry_id: number | null;
  subject_id?: number | null;
  class_group_id?: number | null;
  is_ad_hoc?: boolean;
  reporting_status: "REPORTED" | "PENDING" | "UPCOMING";
  lesson_report: LessonReportSummary | null;
}

export interface LessonReportDetail {
  lesson_report_id: number;
  lesson_id: number | null;
  entry_id: number | null;
  subject_id: number | null;
  class_group_id: number | null;
  delivery_date: string;
  status: "DELIVERED" | "PARTIAL" | "MISSED" | "UNPLANNED";
  attendance_count: number | null;
  completion_rate: number | null;
  reflection_notes: string | null;
  evidence_url: string | null;
  schedule_flag: "ON_TIME" | "AHEAD" | "BEHIND";
  is_ad_hoc: boolean;
  support_request_category_ids: number[];
  challenge_category_ids: number[];
}

export interface UpdateLessonReportPayload {
  status?: "DELIVERED" | "PARTIAL" | "MISSED";
  attendance_count?: number;
  completion_rate?: number;
  reflection_notes?: string;
  evidence_url?: string;
  support_request_category_ids?: number[];
  challenge_category_ids?: number[];
}

// A synthetic "occurrence" used to open LessonReportModal in ad-hoc mode for
// a day with no scheduled lesson — same shape as ReportableLesson so the
// modal doesn't need a second, parallel prop type, but every scheme-derived
// field is null and lesson_id/entry_id stay null on submit.
export const buildAdHocOccurrence = (date: string): ReportableLesson => ({
  slot_id: -1,
  date,
  start_time: null,
  end_time: null,
  subject_name: null,
  subject_code: null,
  subject_color: null,
  module_code: null,
  module_name: null,
  big_question: null,
  topic: null,
  sub_topic: null,
  objective: null,
  learning_outcomes: [],
  lesson_id: null,
  entry_id: null,
  reporting_status: "PENDING",
  lesson_report: null,
});

export interface SubmitLessonReportPayload {
  lesson_id?: number | null;
  entry_id?: number | null;
  delivery_date: string;
  status?: "DELIVERED" | "PARTIAL" | "MISSED";
  attendance_count?: number;
  completion_rate?: number;
  reflection_notes?: string;
  evidence_url?: string;
  academic_term_id?: number;
  // Ad-hoc/unscheduled reporting (Phase 2) — required together when
  // lesson_id/entry_id are omitted; ignored (and status forced to
  // UNPLANNED) by the backend otherwise.
  subject_id?: number;
  class_group_id?: number;
  // True when this occurrence is a real scheduled CalendarSlot that simply
  // has no LO_Lesson plan entry yet for this date (so lesson_id/entry_id
  // are both omitted, same as a true ad-hoc submission) — distinguishes it
  // from an actual unscheduled-activity report so the backend knows to
  // honor `status` instead of forcing UNPLANNED. Never set by the ad-hoc
  // picker flow.
  is_scheduled_slot?: boolean;
  // Categorized Support Needed / Challenges (Phase 4) — additive alongside
  // reflection_notes, not a replacement for it.
  support_request_category_ids?: number[];
  challenge_category_ids?: number[];
}

export interface ReportCategory {
  category_id: number;
  label: string;
  is_active: number;
}

export interface CategorySummaryItem {
  category_id: number;
  label: string;
  total: number;
}

export interface WeeklySummary {
  week_number: number;
  week_start: string;
  week_end: string;
  lessons_delivered: number;
  mentorship_count: number;
  project_updates: number;
  lesson_details: any[];
  mentorship_details: any[];
  project_details: any[];
}

// ─── Admin Analytics types ────────────────────────────────────────────────────

export interface AdminDashboardStats {
  total_lesson_reports:      number;
  total_mentorship_sessions: number;
  curriculum_coverage_pct:   number;
  total_sow_entries:         number;
  delivered_entries:         number;
  status_breakdown:  { status: "DELIVERED" | "PARTIAL" | "MISSED"; total: number }[];
  schedule_breakdown: { schedule_flag: "ON_TIME" | "AHEAD" | "BEHIND"; total: number }[];
  trend_data: { date: string; total: number }[];
}

export interface InstructorCompliance {
  user_id:          number;
  instructor_name:  string;
  expected_lessons: number;
  reported_lessons: number;
  non_delivered:    number;
  compliance_pct:   number;
}

export type ValidationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AdminLessonReport {
  lesson_report_id: number;
  reported_by:      number;
  instructor_name:  string;
  delivery_date:    string;
  status:           "DELIVERED" | "PARTIAL" | "MISSED" | "UNPLANNED";
  schedule_flag:    "ON_TIME" | "AHEAD" | "BEHIND";
  validation_status:  ValidationStatus;
  validation_comment: string | null;
  attendance_count: number | null;
  completion_rate:  number | null;
  reflection_notes: string | null;
  module_code:      string | null;
  module_name:      string | null;
  big_question:     string | null;
  topic:            string | null;
  sub_topic:        string | null;
  objective:        string | null;
  subject_id:       number | null;
  subject_name:     string | null;
  class_group_id:   number | null;
  class_group_name: string | null;
}

// ─── Subject × Class Group × Week rollup (Phase 3) ───────────────────────────

export interface LessonRollupEntry {
  lesson_report_id: number;
  delivery_date:    string;
  status:           "DELIVERED" | "PARTIAL" | "MISSED" | "UNPLANNED";
  schedule_flag:    "ON_TIME" | "AHEAD" | "BEHIND";
  attendance_count: number | null;
  completion_rate:  number | null;
  reflection_notes: string | null;
  instructor_name:  string;
  topic:            string | null;
}

export interface LessonRollupWeek {
  week_number: number;
  entries: LessonRollupEntry[];
}

export interface LessonRollupClassGroup {
  class_group_id: number;
  class_group_name: string;
  weeks: LessonRollupWeek[];
}

export interface LessonRollupSubject {
  subject_id: number;
  subject_name: string;
  subject_code: string | null;
  class_groups: LessonRollupClassGroup[];
}

export interface LessonReportsRollup {
  period: { start_date: string; end_date: string; academic_term_id: number };
  subjects: LessonRollupSubject[];
}

export interface SubjectCoverageItem {
  subject_id:    number;
  subject_name:  string;
  subject_code:  string | null;
  total_entries: number;
  delivered:     number;
  pending:       number;
  coverage_pct:  number;
}

export interface AdminMentorshipLog {
  mentorship_id:    number;
  user_id:          number;
  instructor_name:  string;
  session_date:     string;
  student_id:       number | null;
  student_name:     string | null;
  topic:            string | null;
  duration_minutes: number | null;
  wellbeing_status: string | null;
  session_status:   string | null;
  validation_status:  ValidationStatus;
  validation_comment: string | null;
  notes:            string | null;
  action_items:     string | null;
  follow_up_required: number;
}

export interface WellbeingTrendPoint {
  date:  string;
  score: number;
  label: string;
}

export interface AdminStudentTimelineSession {
  mentorship_id:         number;
  session_date:          string | null;
  topic:                 string | null;
  duration_minutes:      number | null;
  wellbeing_status:      string | null;
  session_status:        string;
  follow_up_required:    boolean;
  action_items:          string | null;
  next_steps:            string | null;
  notes:                 string | null;
  challenges_identified: string | null;
  academic_planning:     string | null;
  instructor_name:       string;
}

export interface AdminStudentTimeline {
  sessions:         AdminStudentTimelineSession[];
  wellbeing_trend:  WellbeingTrendPoint[];
}

export interface AdminProjectUpdate {
  project_update_id: number;
  user_id:           number;
  instructor_name:   string;
  project_name:      string | null;
  role:              string | null;
  status:            string | null;
  work_completed:    string | null;
  key_outputs:       string | null;
  challenges:        string | null;
}

export type ExportCategory = "lessons" | "mentorship" | "projects" | "unified";
export type ExportFormat   = "csv" | "html";

export interface UpdateApprovalPayload {
  validation_status: ValidationStatus;
  validation_comment?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export const reportsApi = {
  submit: (data: any) => api.post("/reports/submit", data),
  getAutoFill: (params: { start_date: string; end_date: string; class_group_id?: number; academic_term_id?: number }) => 
    api.get("/reports/autofill", { params }),
  getAll: (params?: any) => api.get("/reports", { params }),
  getById: (id: number) => api.get(`/reports/${id}`),
  getByDate: (date: string) => api.get("/reports/by-date", { params: { date } }),
  getDashboardStats: (params?: any) => api.get("/reports/dashboard-stats", { params }),
  update: (id: number, data: any) => api.put(`/reports/${id}`, data),
  getAllAdminReports: (params: {
    start_date?: string;
    end_date?: string;
    academic_year_id?: number;
    academic_term_id?: number;
    program_id?: number;
    grade_id?: number;
  }) => api.get("/reports/admin/all", { params }),
  getMissingAdminReports: (params: {
    start_date: string;
    end_date: string;
    academic_year_id?: number;
    academic_term_id?: number;
    program_id?: number;
    grade_id?: number;
  }) => api.get("/reports/admin/missing", { params }),

  // Decoupled lesson reporting
  getReportableLessons: (params?: {
    academic_term_id?: number;
    from_date?: string;
    to_date?: string;
  }) => api.get<{ success: boolean; data: ReportableLesson[] }>(
    "/reports/lessons/reportable",
    { params },
  ),

  submitLessonReport: (data: SubmitLessonReportPayload) =>
    api.post<{ success: boolean; data: { lesson_report_id: number } }>(
      "/reports/lessons",
      data,
    ),

  getLessonReportById: (id: number) =>
    api.get<{ success: boolean; data: LessonReportDetail }>(`/reports/lessons/${id}`),

  updateLessonReport: (id: number, data: UpdateLessonReportPayload) =>
    api.put<{ success: boolean; data: { lesson_report_id: number } }>(
      `/reports/lessons/${id}`,
      data,
    ),

  getWeeklySummary: (params: {
    week_number: number;
    academic_term_id: number;
  }) => api.get<{ success: boolean; data: WeeklySummary }>(
    "/reports/weekly-summary",
    { params },
  ),

  // Self-scoped Subject x Class Group x Week rollup for the "Download Report"
  // button on the instructor's own Dashboard tab (reuses the admin rollup's
  // shape/grouping, restricted server-side to the authenticated instructor).
  getMyLessonReportsRollup: (params: {
    start_date: string;
    end_date: string;
    academic_term_id: number;
    subject_id?: number;
    class_group_id?: number;
  }) =>
    api.get<{ success: boolean; data: LessonReportsRollup }>(
      "/reports/lessons/rollup",
      { params },
    ),

  // ─── Admin aggregated analytics ────────────────────────────────────────────

  getAdminDashboardStats: (params?: {
    start_date?: string;
    end_date?: string;
    academic_term_id?: number;
    instructor_id?: number;
    subject_id?: number;
    class_group_id?: number;
  }) =>
    api.get<{ success: boolean; data: AdminDashboardStats }>(
      "/reports/admin/dashboard",
      { params },
    ),

  getComplianceReport: (params: {
    start_date: string;
    end_date: string;
    academic_term_id?: number;
    subject_id?: number;
    class_group_id?: number;
  }) =>
    api.get<{ success: boolean; data: InstructorCompliance[] }>(
      "/reports/admin/compliance",
      { params },
    ),

  getAdminLessonReports: (params?: {
    start_date?: string;
    end_date?: string;
    instructor_id?: number;
    schedule_flag?: string;
    status?: string;
    subject_id?: number;
    class_group_id?: number;
    program_id?: number;
    grade_id?: number;
  }) =>
    api.get<{ success: boolean; data: AdminLessonReport[] }>(
      "/reports/admin/lesson-reports",
      { params },
    ),

  getLessonReportsRollup: (params: {
    start_date: string;
    end_date: string;
    academic_term_id: number;
    subject_id?: number;
    class_group_id?: number;
  }) =>
    api.get<{ success: boolean; data: LessonReportsRollup }>(
      "/reports/admin/lesson-reports/rollup",
      { params },
    ),

  getSubjectCoverage: (params?: {
    academic_term_id?: number;
    start_date?: string;
    end_date?: string;
    subject_id?: number;
    class_group_id?: number;
  }) =>
    api.get<{ success: boolean; data: SubjectCoverageItem[] }>(
      "/reports/admin/coverage",
      { params },
    ),

  // ─── Support Needed / Challenges categorization (Phase 4) ─────────────────

  getSupportRequestCategories: () =>
    api.get<{ success: boolean; data: ReportCategory[] }>("/reports/categories/support-request"),

  getChallengeCategories: () =>
    api.get<{ success: boolean; data: ReportCategory[] }>("/reports/categories/challenge"),

  getSupportRequestSummary: (params?: {
    start_date?: string;
    end_date?: string;
    subject_id?: number;
    class_group_id?: number;
  }) =>
    api.get<{ success: boolean; data: CategorySummaryItem[] }>(
      "/reports/admin/support-requests/summary",
      { params },
    ),

  getChallengeSummary: (params?: {
    start_date?: string;
    end_date?: string;
    subject_id?: number;
    class_group_id?: number;
  }) =>
    api.get<{ success: boolean; data: CategorySummaryItem[] }>(
      "/reports/admin/challenges/summary",
      { params },
    ),

  getAdminMentorshipLogs: (params?: {
    start_date?: string;
    end_date?: string;
    instructor_id?: number;
    subject_id?: number;
    class_group_id?: number;
    program_id?: number;
    grade_id?: number;
  }) =>
    api.get<{ success: boolean; data: AdminMentorshipLog[] }>(
      "/reports/admin/mentorship-logs",
      { params },
    ),

  getAdminProjectUpdates: (params?: { instructor_id?: number }) =>
    api.get<{ success: boolean; data: AdminProjectUpdate[] }>(
      "/reports/admin/project-updates",
      { params },
    ),

  getAdminStudentTimeline: (studentId: number) =>
    api.get<{ success: boolean; data: AdminStudentTimeline }>(
      `/reports/admin/student-timeline/${studentId}`,
    ),

  adminUpdateLessonReportApproval: (id: number, data: UpdateApprovalPayload) =>
    api.patch<{ success: boolean; data: { lesson_report_id: number; validation_status: ValidationStatus } }>(
      `/reports/admin/lesson-reports/${id}/approval`,
      data,
    ),

  adminUpdateMentorshipSessionApproval: (id: number, data: UpdateApprovalPayload) =>
    api.patch<{ success: boolean; data: { mentorship_id: number; validation_status: ValidationStatus } }>(
      `/reports/admin/mentorship-logs/${id}/approval`,
      data,
    ),

  /**
   * Fetches the export file as a blob through the authenticated axios
   * instance — plain <a href>/window.open navigation can't attach the
   * Bearer token (it lives in localStorage, not a cookie), so the backend
   * would reject it with 401/"Access denied".
   */
  exportBlob: (params: {
    category: ExportCategory;
    format?: ExportFormat;
    start_date?: string;
    end_date?: string;
    instructor_id?: number;
  }) =>
    api.get<Blob>("/reports/admin/export", {
      params,
      responseType: "blob",
    }),
};
