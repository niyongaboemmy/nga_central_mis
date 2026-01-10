import { db } from "../db";
import { eq, sql, count, sum, gte } from "drizzle-orm";
import {
  User,
  UserProfile,
  Program,
  Grade,
  Subject,
  ClassGroup,
  AcademicTerm,
  Document,
  DocumentFolder,
  DocumentVersion,
  Role,
  UserRole,
} from "../db/schema";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";

// Dashboard statistics interface
interface DashboardStats {
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

// Get dashboard statistics
export const getDashboardStats = asyncHandler(async (req: any, res: any) => {
  // Get user counts by type
  const userStats = await db
    .select({
      user_type: UserProfile.user_type,
      count: count(UserProfile.user_id),
    })
    .from(UserProfile)
    .innerJoin(User, eq(UserProfile.user_id, User.user_id))
    .where(eq(User.status, "ACTIVE"))
    .groupBy(UserProfile.user_type);

  // Get academic data counts
  const [programsResult] = await db.select({ count: count() }).from(Program);
  const [gradesResult] = await db.select({ count: count() }).from(Grade);
  const [subjectsResult] = await db.select({ count: count() }).from(Subject);
  const [classGroupsResult] = await db
    .select({ count: count() })
    .from(ClassGroup);
  const [currentTermsResult] = await db
    .select({ count: count() })
    .from(AcademicTerm)
    .where(eq(AcademicTerm.is_current, 1));

  // Get document management stats
  const [documentsResult] = await db.select({ count: count() }).from(Document);
  const [foldersResult] = await db
    .select({ count: count() })
    .from(DocumentFolder);

  // Calculate total storage used
  const [storageResult] = await db
    .select({ total: sum(Document.file_size) })
    .from(Document);

  // Get recent document uploads (today and this week)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [documentsTodayResult] = await db
    .select({ count: count() })
    .from(Document)
    .where(gte(Document.created_at, today));

  const [documentsWeekResult] = await db
    .select({ count: count() })
    .from(Document)
    .where(gte(Document.created_at, weekAgo));

  // Get role statistics
  const roleStats = await db
    .select({
      roleName: Role.name,
      count: count(UserRole.user_id),
    })
    .from(Role)
    .leftJoin(UserRole, eq(Role.role_id, UserRole.role_id))
    .innerJoin(User, eq(UserRole.user_id, User.user_id))
    .where(eq(User.status, "ACTIVE"))
    .groupBy(Role.role_id, Role.name)
    .orderBy(Role.name);

  // Extract counts from results
  const totalStudents =
    userStats.find((stat) => stat.user_type === "STUDENT")?.count || 0;
  const totalTeachers =
    userStats.find((stat) => stat.user_type === "TEACHER")?.count || 0;
  const totalAdmins =
    userStats.find((stat) => stat.user_type === "ADMIN")?.count || 0;
  const totalStaff =
    userStats.find((stat) => stat.user_type === "STAFF")?.count || 0;

  // System health check - basic database connectivity test
  let databaseStatus: "healthy" | "warning" | "error" = "healthy";
  let systemHealth = 100;

  try {
    // Test database connectivity with a simple query
    await db.select({ count: count() }).from(User).limit(1);
  } catch (error) {
    databaseStatus = "error";
    systemHealth = 0;
  }

  // Calculate system health based on various factors
  // For now, just based on database status, but could include more checks
  if (databaseStatus === "error") {
    systemHealth = 25;
  }

  const stats: DashboardStats = {
    totalStudents,
    totalTeachers,
    totalAdmins,
    totalStaff,
    totalPrograms: programsResult.count,
    totalGrades: gradesResult.count,
    totalSubjects: subjectsResult.count,
    activeClassGroups: classGroupsResult.count,
    currentAcademicTerms: currentTermsResult.count,
    // Document stats
    totalDocuments: documentsResult.count,
    totalFolders: foldersResult.count,
    totalStorageUsed: Number(storageResult?.total || 0),
    documentsUploadedToday: documentsTodayResult.count,
    documentsUploadedThisWeek: documentsWeekResult.count,
    // Role stats
    roleStats,
    // System health
    systemHealth,
    databaseStatus,
  };

  successResponse(res, "Dashboard statistics retrieved successfully", stats);
});
