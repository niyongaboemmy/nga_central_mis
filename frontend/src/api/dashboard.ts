import api from "../services/api";

// Dashboard statistics interface
export interface DashboardStats {
  // Academic information
  currentAcademicYear: string | null;
  currentAcademicTerm: string | null;
  totalPrograms: number;
  totalGrades: number;
  totalSubjects: number;
  activeClassGroups: number;
  // User statistics
  totalStudents: number;
  totalTeachers: number;
  totalAdmins: number;
  totalStaff: number;
  // Document management stats
  totalDocuments: number;
  totalFolders: number;
  totalStorageUsed: number; // in bytes
  documentsUploadedToday: number;
  documentsUploadedThisWeek: number;
  // Role statistics
  roleStats: { roleName: string; count: number }[];
  // System health
  systemHealth: number; // percentage
  databaseStatus: "healthy" | "warning" | "error";
}

// Teacher dashboard statistics interface
export interface TeacherDashboardStats {
  assignedSubjects: number;
  totalStudents: number;
  assignedClassGroups: number;
  currentAcademicTerm: string | null;
}

// Basic dashboard statistics interface
export interface BasicDashboardStats {
  currentAcademicYear: string;
  currentAcademicTerm: string;
  currentUserRole: string | null;
}

// Dashboard API
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const response = await api.get<{ data: DashboardStats }>("/dashboard/stats");
  return response.data.data;
};

// Teacher dashboard API
export const getTeacherDashboardStats = async (params?: {
  academic_year_id?: number;
  academic_term_id?: number;
}): Promise<TeacherDashboardStats> => {
  const response = await api.get<{ data: TeacherDashboardStats }>(
    "/dashboard/teacher-stats",
    { params },
  );
  return response.data.data;
};

// Basic dashboard API
export const getBasicDashboardStats = async (params?: {
  academic_year_id?: number;
  academic_term_id?: number;
}): Promise<BasicDashboardStats> => {
  const response = await api.get<{ data: BasicDashboardStats }>(
    "/dashboard/basic-stats",
    { params },
  );
  return response.data.data;
};

// ============================================================================
// Teacher overview — the Teacher Dashboard's single payload. Mirrors
// backend/src/controllers/teacherOverviewController.ts.
// ============================================================================

export interface TeacherLesson {
  slot_id: number;
  subject_id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_group_name: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  color: string | null;
}

export interface TeacherOverviewActivity {
  activity_id: number;
  activity_name: string;
  activity_type: string;
  day_of_week?: number | null;
  start_time: string;
  end_time: string;
  location?: string | null;
  color?: string | null;
}

export interface TeacherSchemeRow {
  subject_id: number;
  subject_name: string;
  subject_code: string | null;
  subject_color: string | null;
  class_group_id: number;
  class_group_name: string;
  scheme_id: number | null;
  status: "submitted" | "pending";
  entries_count: number;
  validation_status: "PENDING" | "APPROVED" | "REJECTED";
  validation_comment: string | null;
  updated_at: string | null;
}

export interface TeacherOverview {
  teacher: { first_name: string | null; last_name: string | null };
  period: {
    academic_year_id: number | null;
    academic_year_name: string | null;
    academic_term_id: number | null;
    academic_term_name: string | null;
    term_start_date: string | null;
    term_end_date: string | null;
    days_remaining_in_term: number | null;
  };
  kpis: {
    assignedSubjects: number;
    totalStudents: number;
    assignedClassGroups: number;
    weeklyPeriods: number;
    weeklyMinutes: number;
  };
  schedule: {
    server_day_of_week: number;
    today: TeacherLesson[];
    today_activities: TeacherOverviewActivity[];
    current_lesson: TeacherLesson | null;
    next_lesson_today: TeacherLesson | null;
    next_teaching_day: {
      day_of_week: number;
      lessons: TeacherLesson[];
    } | null;
    week_load: { day_of_week: number; periods: number }[];
  };
  classes: {
    subject_id: number;
    subject_name: string;
    subject_code: string | null;
    subject_color: string | null;
    class_group_id: number;
    class_group_name: string;
    grade_name: string | null;
    periods_per_week: number;
  }[];
  schemes: {
    total: number;
    submitted: number;
    pending: number;
    approved: number;
    rejected: number;
    awaiting_validation: number;
    rows: TeacherSchemeRow[];
  };
  lessonNotes: {
    total: number;
    drafts: number;
    published: number;
    recent_drafts: {
      note_id: number;
      title: string;
      status: string;
      updated_at: string | null;
      subject_name: string | null;
      class_group_name: string | null;
    }[];
  };
  courses: {
    total: number;
    drafts: number;
    published: number;
    recent: {
      course_id: number;
      title: string;
      status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
      updated_at: string | null;
      subject_name: string | null;
      class_group_name: string | null;
    }[];
  };
}

/**
 * The whole board in one request. It aggregates six modules, so it is
 * legitimately heavier than the 10s the shared axios client allows by default
 * — the same reason the scheme upload sets its own budget. Ten seconds was
 * enough on an idle server and not on a busy one, which showed up as a
 * dashboard that simply refused to load.
 */
export const TEACHER_OVERVIEW_TIMEOUT_MS = 30000;

export const getTeacherOverview = async (params?: {
  academic_year_id?: number;
  academic_term_id?: number;
}): Promise<TeacherOverview> => {
  const response = await api.get<{ data: TeacherOverview }>(
    "/dashboard/teacher-overview",
    { params, timeout: TEACHER_OVERVIEW_TIMEOUT_MS },
  );
  return response.data.data;
};
