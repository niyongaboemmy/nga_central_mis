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
    { params }
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
    { params }
  );
  return response.data.data;
};
