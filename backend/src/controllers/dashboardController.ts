import { db } from "../db";
import { eq, sql, count, sum, gte, inArray, and } from "drizzle-orm";
import {
  User,
  UserProfile,
  Program,
  Grade,
  Subject,
  ClassGroup,
  AcademicYear,
  AcademicTerm,
  Document,
  DocumentFolder,
  DocumentVersion,
  Role,
  UserRole,
  TeacherSubjectAssignment,
  StudentSubjectEnrollment,
  StudentClassGroup,
} from "../db/schema";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";

// Dashboard statistics interface
interface DashboardStats {
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
interface TeacherDashboardStats {
  assignedSubjects: number;
  totalStudents: number;
  assignedClassGroups: number;
  currentAcademicTerm: string | null;
  // Recent activities could be added later
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

  // Get current academic year and term
  const [currentYearResult] = await db
    .select({ name: AcademicYear.name })
    .from(AcademicYear)
    .where(eq(AcademicYear.is_current, 1))
    .limit(1);

  const [currentTermResult] = await db
    .select({ name: AcademicTerm.name })
    .from(AcademicTerm)
    .where(eq(AcademicTerm.is_current, 1))
    .limit(1);

  // Get academic data counts
  const [programsResult] = await db.select({ count: count() }).from(Program);
  const [gradesResult] = await db.select({ count: count() }).from(Grade);
  const [subjectsResult] = await db.select({ count: count() }).from(Subject);
  const [classGroupsResult] = await db
    .select({ count: count() })
    .from(ClassGroup);

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
    // Academic information
    currentAcademicYear: currentYearResult?.name || null,
    currentAcademicTerm: currentTermResult?.name || null,
    totalPrograms: programsResult.count,
    totalGrades: gradesResult.count,
    totalSubjects: subjectsResult.count,
    activeClassGroups: classGroupsResult.count,
    // User statistics
    totalStudents,
    totalTeachers,
    totalAdmins,
    totalStaff,
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

// Get teacher dashboard statistics
export const getTeacherDashboardStats = asyncHandler(
  async (req: any, res: any) => {
    const teacherId = req.user.userId;

    // Get current academic term
    const [currentTermResult] = await db
      .select({
        academic_term_id: AcademicTerm.academic_term_id,
        name: AcademicTerm.name,
      })
      .from(AcademicTerm)
      .where(eq(AcademicTerm.is_current, 1))
      .limit(1);

    // Get assigned subjects count (all assignments, not filtered by term)
    const assignedSubjectsResult = await db
      .select()
      .from(TeacherSubjectAssignment)
      .where(eq(TeacherSubjectAssignment.user_id, teacherId));
    const assignedSubjects = assignedSubjectsResult.length;

    // Get unique class groups assigned to teacher
    const assignedClassGroupsResult = await db
      .select({ class_group_id: TeacherSubjectAssignment.class_group_id })
      .from(TeacherSubjectAssignment)
      .where(eq(TeacherSubjectAssignment.user_id, teacherId));
    const uniqueClassGroups = [
      ...new Set(assignedClassGroupsResult.map((r) => r.class_group_id)),
    ];
    const assignedClassGroups = uniqueClassGroups.length;

    // Get total students in teacher's assigned subjects
    let totalStudents = 0;
    if (assignedSubjectsResult.length > 0) {
      // Get all subject IDs assigned to this teacher
      const subjectIds = [
        ...new Set(assignedSubjectsResult.map((r) => r.subject_id)),
      ];

      // Count students enrolled in these subjects (all terms)
      const [studentsResult] = await db
        .select({ count: count(StudentSubjectEnrollment.user_id) })
        .from(StudentSubjectEnrollment)
        .where(inArray(StudentSubjectEnrollment.subject_id, subjectIds));
      totalStudents = studentsResult?.count || 0;
    }

    const stats: TeacherDashboardStats = {
      assignedSubjects,
      totalStudents,
      assignedClassGroups,
      currentAcademicTerm: currentTermResult?.name || null,
    };

    successResponse(
      res,
      "Teacher dashboard statistics retrieved successfully",
      stats
    );
  }
);

// Get basic dashboard stats for default dashboard
export const getBasicDashboardStats = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;

    // Get current academic year
    const [currentYearResult] = await db
      .select({ name: AcademicYear.name })
      .from(AcademicYear)
      .where(eq(AcademicYear.is_current, 1))
      .limit(1);

    // Get current academic term
    const [currentTermResult] = await db
      .select({ name: AcademicTerm.name })
      .from(AcademicTerm)
      .where(eq(AcademicTerm.is_current, 1))
      .limit(1);

    // Get current user role
    const [userRoleResult] = await db
      .select({ roleName: Role.name })
      .from(UserRole)
      .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
      .where(eq(UserRole.user_id, userId))
      .limit(1);

    const stats = {
      currentAcademicYear: currentYearResult?.name || "2024-2025",
      currentAcademicTerm: currentTermResult?.name || "Term 2",
      currentUserRole: userRoleResult?.roleName || null,
    };

    successResponse(
      res,
      "Basic dashboard statistics retrieved successfully",
      stats
    );
  }
);
