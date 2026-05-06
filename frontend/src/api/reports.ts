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
  reporting_status: "REPORTED" | "PENDING" | "UPCOMING";
  lesson_report: LessonReportSummary | null;
}

export interface SubmitLessonReportPayload {
  lesson_id?: number | null;
  entry_id?: number | null;
  delivery_date: string;
  status: "DELIVERED" | "PARTIAL" | "MISSED";
  attendance_count?: number;
  completion_rate?: number;
  reflection_notes?: string;
  evidence_url?: string;
  academic_term_id?: number;
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

export interface AdminLessonReport {
  lesson_report_id: number;
  reported_by:      number;
  instructor_name:  string;
  delivery_date:    string;
  status:           "DELIVERED" | "PARTIAL" | "MISSED";
  schedule_flag:    "ON_TIME" | "AHEAD" | "BEHIND";
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

  getWeeklySummary: (params: {
    week_number: number;
    academic_term_id: number;
  }) => api.get<{ success: boolean; data: WeeklySummary }>(
    "/reports/weekly-summary",
    { params },
  ),

  // ─── Admin aggregated analytics ────────────────────────────────────────────

  getAdminDashboardStats: (params?: {
    start_date?: string;
    end_date?: string;
    academic_term_id?: number;
    instructor_id?: number;
  }) =>
    api.get<{ success: boolean; data: AdminDashboardStats }>(
      "/reports/admin/dashboard",
      { params },
    ),

  getComplianceReport: (params: {
    start_date: string;
    end_date: string;
    academic_term_id?: number;
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
  }) =>
    api.get<{ success: boolean; data: AdminLessonReport[] }>(
      "/reports/admin/lesson-reports",
      { params },
    ),

  getSubjectCoverage: (params?: {
    academic_term_id?: number;
    start_date?: string;
    end_date?: string;
  }) =>
    api.get<{ success: boolean; data: SubjectCoverageItem[] }>(
      "/reports/admin/coverage",
      { params },
    ),

  getAdminMentorshipLogs: (params?: {
    start_date?: string;
    end_date?: string;
    instructor_id?: number;
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

  /** Returns the base URL string for export — use with <a href> or window.open */
  getExportUrl: (params: {
    category: ExportCategory;
    format?: ExportFormat;
    start_date?: string;
    end_date?: string;
    instructor_id?: number;
  }): string => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return `/api/reports/admin/export${qs ? `?${qs}` : ""}`;
  },
};
