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
};
