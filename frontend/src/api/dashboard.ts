import api from "../services/api";

// Dashboard statistics interface
export interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  totalAdmins: number;
  totalStaff: number;
  totalPrograms: number;
  totalGrades: number;
  totalSubjects: number;
  activeClassGroups: number;
  currentAcademicTerms: number;
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

// Dashboard API
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const response = await api.get<{ data: DashboardStats }>("/dashboard/stats");
  return response.data.data;
};
