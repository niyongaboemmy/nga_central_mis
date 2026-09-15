import { db } from "../db";
import {
  DocumentFolder,
  Document,
  DocumentVersion,
  DocumentPermission,
  FolderPermission,
  DocumentShareLink,
  User,
  UserProfile,
  Role,
  UserRole,
  Subject,
  Program,
  Grade,
  GradeSubject,
  TeacherSubjectAssignment,
  StudentSubjectEnrollment,
  UserGrade,
  UserProgramLead,
  AcademicTerm,
  ClassGroup,
  StudentClassGroup,
} from "../db/schema";
import {
  eq,
  and,
  desc,
  asc,
  isNull,
  gt,
  or,
  SQL,
  inArray,
  sql,
} from "drizzle-orm";
import {
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
} from "../errors/CustomError";
import { successResponse, paginatedResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import { recordActivity } from "../utils/activityLogger";
import { notifyUsers } from "../utils/notifications";
import { sanitizeString } from "../utils/sanitization";
import logger from "../utils/logger";
import storageService from "../utils/fileServer";
import fs from "fs";
import path from "path";
const mammoth = require("mammoth");

// ======================
// ACCESS RESOLUTION HELPERS
//
// Shared by every read path (direct fetch, download, folder listing, and the
// "shared with me" list) so that filter-scoped role shares are enforced
// consistently everywhere instead of only in the list endpoints.
// ======================

interface UserFilterAssociations {
  assignedSubjectIds: number[];
  enrolledSubjectIds: number[];
  programIds: number[];
  gradeIds: number[];
}

async function getUserFilterAssociations(
  userId: number,
): Promise<UserFilterAssociations> {
  const assignedSubjects = await db
    .select({ subject_id: TeacherSubjectAssignment.subject_id })
    .from(TeacherSubjectAssignment)
    .where(eq(TeacherSubjectAssignment.user_id, userId));

  const currentTerm = await db
    .select({ academic_year_id: AcademicTerm.academic_year_id })
    .from(AcademicTerm)
    .where(eq(AcademicTerm.is_current, 1))
    .limit(1);
  const currentYearId =
    currentTerm.length > 0 ? currentTerm[0].academic_year_id : null;

  let enrolledSubjects: { subject_id: number }[] = [];
  if (currentYearId) {
    enrolledSubjects = await db
      .select({ subject_id: StudentSubjectEnrollment.subject_id })
      .from(StudentSubjectEnrollment)
      .where(
        and(
          eq(StudentSubjectEnrollment.user_id, userId),
          eq(StudentSubjectEnrollment.academic_year_id, currentYearId),
        ),
      );
  }

  // Program-lead and class-teacher-of-grade roles are year-scoped; only the
  // current year's assignments should grant document access.
  const programLeads = currentYearId
    ? await db
        .select({ program_id: UserProgramLead.program_id })
        .from(UserProgramLead)
        .where(
          and(
            eq(UserProgramLead.user_id, userId),
            eq(UserProgramLead.academic_year_id, currentYearId),
          ),
        )
    : [];

  // Distinct: a class teacher may hold several class groups within one grade,
  // and document scoping only cares about the grade.
  const gradeAssignments = currentYearId
    ? await db
        .selectDistinct({ grade_id: UserGrade.grade_id })
        .from(UserGrade)
        .where(
          and(
            eq(UserGrade.user_id, userId),
            eq(UserGrade.academic_year_id, currentYearId),
          ),
        )
    : [];

  return {
    assignedSubjectIds: assignedSubjects.map((s) => s.subject_id),
    enrolledSubjectIds: enrolledSubjects.map((s) => s.subject_id),
    programIds: programLeads.map((p) => p.program_id),
    gradeIds: gradeAssignments.map((g) => g.grade_id),
  };
}

function permissionMatchesFilter(
  filterType: string | null | undefined,
  filterIds: unknown,
  associations: UserFilterAssociations,
): boolean {
  if (!filterType || !filterIds || !Array.isArray(filterIds)) {
    return true;
  }
  const ids = filterIds as number[];
  switch (filterType) {
    case "subject_assigned":
      return ids.some((id) => associations.assignedSubjectIds.includes(id));
    case "subject_enrolled":
      return ids.some((id) => associations.enrolledSubjectIds.includes(id));
    case "program_assigned":
      return ids.some((id) => associations.programIds.includes(id));
    case "grade_assigned":
      return ids.some((id) => associations.gradeIds.includes(id));
    default:
      return true;
  }
}

async function resolveDocumentAccess(
  userId: number,
  documentId: number,
): Promise<{ document: any; permissionType: string } | null> {
  const [doc] = await db
    .select()
    .from(Document)
    .where(eq(Document.document_id, documentId))
    .limit(1);

  if (!doc) return null;

  if (doc.user_id === userId) {
    return { document: doc, permissionType: "OWNER" };
  }

  const [perm] = await db
    .select()
    .from(DocumentPermission)
    .where(
      and(
        eq(DocumentPermission.document_id, documentId),
        eq(DocumentPermission.user_id, userId),
        or(
          isNull(DocumentPermission.expires_at),
          gt(DocumentPermission.expires_at, new Date()),
        ),
      ),
    )
    .limit(1);

  if (perm) {
    const associations = await getUserFilterAssociations(userId);
    if (
      permissionMatchesFilter(perm.filter_type, perm.filter_ids, associations)
    ) {
      return { document: doc, permissionType: perm.permission_type || "VIEW" };
    }
  }

  if (doc.folder_id) {
    const folderAccess = await resolveFolderAccess(userId, doc.folder_id);
    if (folderAccess) {
      return { document: doc, permissionType: folderAccess.permissionType };
    }
  }

  return null;
}

async function resolveFolderAccess(
  userId: number,
  folderId: number,
): Promise<{ folder: any; permissionType: string } | null> {
  const [targetFolder] = await db
    .select()
    .from(DocumentFolder)
    .where(eq(DocumentFolder.folder_id, folderId))
    .limit(1);

  if (!targetFolder) return null;

  if (targetFolder.user_id === userId) {
    return { folder: targetFolder, permissionType: "OWNER" };
  }

  const associations = await getUserFilterAssociations(userId);

  // Walk up the parent chain: a share on any ancestor folder grants access
  // to every descendant, not just its direct children.
  let currentFolderId: number | null = folderId;
  let depth = 0;
  while (currentFolderId !== null && depth < 50) {
    const [perm] = await db
      .select()
      .from(FolderPermission)
      .where(
        and(
          eq(FolderPermission.folder_id, currentFolderId),
          eq(FolderPermission.user_id, userId),
          or(
            isNull(FolderPermission.expires_at),
            gt(FolderPermission.expires_at, new Date()),
          ),
        ),
      )
      .limit(1);

    if (
      perm &&
      permissionMatchesFilter(perm.filter_type, perm.filter_ids, associations)
    ) {
      return {
        folder: targetFolder,
        permissionType: perm.permission_type || "VIEW",
      };
    }

    if (currentFolderId === folderId) {
      currentFolderId = targetFolder.parent_folder_id;
    } else {
      const [ancestor] = await db
        .select({ parent_folder_id: DocumentFolder.parent_folder_id })
        .from(DocumentFolder)
        .where(eq(DocumentFolder.folder_id, currentFolderId))
        .limit(1);
      currentFolderId = ancestor ? ancestor.parent_folder_id : null;
    }
    depth++;
  }

  return null;
}

// ======================
// ROLE OPERATIONS
// ======================

export const getAllRoles = asyncHandler(async (req: any, res: any) => {
  const roles = await db
    .select({
      role_id: Role.role_id,
      name: Role.name,
      description: Role.description,
      status: Role.status,
    })
    .from(Role)
    .where(eq(Role.status, "ACTIVE"))
    .orderBy(asc(Role.name));

  successResponse(res, "Roles retrieved successfully", roles);
});

// Get filter options for role-based sharing
export const getDocumentShareFilterOptions = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;

    // Get the current academic term
    const currentTerm = await db
      .select({
        academic_term_id: AcademicTerm.academic_term_id,
        academic_year_id: AcademicTerm.academic_year_id,
      })
      .from(AcademicTerm)
      .where(eq(AcademicTerm.is_current, 1))
      .limit(1);

    const currentTermId =
      currentTerm.length > 0 ? currentTerm[0].academic_term_id : null;
    const currentYearId =
      currentTerm.length > 0 ? currentTerm[0].academic_year_id : null;

    // Get user's role-based access
    const userRoles = await db
      .select({
        role_id: UserRole.role_id,
      })
      .from(UserRole)
      .where(eq(UserRole.user_id, userId));

    const roleIds = userRoles.map((r) => r.role_id);

    // Get assigned subjects (for teachers)
    const assignedSubjects = await db
      .select({
        subject_id: TeacherSubjectAssignment.subject_id,
        subject_name: Subject.name,
        subject_code: Subject.code,
      })
      .from(TeacherSubjectAssignment)
      .innerJoin(
        Subject,
        eq(TeacherSubjectAssignment.subject_id, Subject.subject_id),
      )
      .where(eq(TeacherSubjectAssignment.user_id, userId));

    // Get enrolled subjects (for students)
    let enrolledSubjects: any[] = [];
    if (currentYearId) {
      enrolledSubjects = await db
        .select({
          subject_id: StudentSubjectEnrollment.subject_id,
          subject_name: Subject.name,
          subject_code: Subject.code,
        })
        .from(StudentSubjectEnrollment)
        .innerJoin(
          Subject,
          eq(StudentSubjectEnrollment.subject_id, Subject.subject_id),
        )
        .where(
          and(
            eq(StudentSubjectEnrollment.user_id, userId),
            eq(StudentSubjectEnrollment.academic_year_id, currentYearId),
          ),
        );
    }

    // Get user's program leads, scoped to the current academic year
    const programLeads = currentYearId
      ? await db
          .select({
            program_id: UserProgramLead.program_id,
            program_name: Program.name,
          })
          .from(UserProgramLead)
          .innerJoin(
            Program,
            eq(UserProgramLead.program_id, Program.program_id),
          )
          .where(
            and(
              eq(UserProgramLead.user_id, userId),
              eq(UserProgramLead.academic_year_id, currentYearId),
            ),
          )
      : [];

    // Get user's grade assignments (class teacher), scoped to the current
    // academic year
    const gradeAssignments = currentYearId
      ? await db
          .selectDistinct({
            grade_id: UserGrade.grade_id,
            grade_name: Grade.name,
          })
          .from(UserGrade)
          .innerJoin(Grade, eq(UserGrade.grade_id, Grade.grade_id))
          .where(
            and(
              eq(UserGrade.user_id, userId),
              eq(UserGrade.academic_year_id, currentYearId),
            ),
          )
      : [];

    // Get all subjects (for SUPER_ADMIN or users with proper permissions)
    const allSubjects = await db
      .select({
        subject_id: Subject.subject_id,
        name: Subject.name,
        code: Subject.code,
      })
      .from(Subject)
      .where(eq(Subject.status, "ACTIVE"))
      .orderBy(asc(Subject.name));

    // Get all programs
    const allPrograms = await db
      .select({
        program_id: Program.program_id,
        name: Program.name,
      })
      .from(Program)
      .orderBy(asc(Program.name));

    // Get all grades
    const allGrades = await db
      .select({
        grade_id: Grade.grade_id,
        name: Grade.name,
        level_order: Grade.level_order,
      })
      .from(Grade)
      .orderBy(asc(Grade.level_order));

    // Get all academic terms
    const allTerms = await db
      .select({
        academic_term_id: AcademicTerm.academic_term_id,
        name: AcademicTerm.name,
        is_current: AcademicTerm.is_current,
      })
      .from(AcademicTerm)
      .orderBy(desc(AcademicTerm.is_current), asc(AcademicTerm.name));

    const result = {
      // Current user's associations (for filter display)
      myAssignments: {
        assignedSubjects,
        enrolledSubjects,
        programLeads,
        gradeAssignments,
      },
      // All available options (for SUPER_ADMIN or admins)
      options: {
        subjects: allSubjects,
        programs: allPrograms,
        grades: allGrades,
        academicTerms: allTerms,
      },
      currentTermId,
    };

    successResponse(res, "Filter options retrieved successfully", result);
  },
);

export const getRoleById = asyncHandler(async (req: any, res: any) => {
  const { roleId } = req.params;

  const role = await db
    .select({
      role_id: Role.role_id,
      name: Role.name,
      description: Role.description,
      status: Role.status,
    })
    .from(Role)
    .where(eq(Role.role_id, parseInt(roleId)))
    .limit(1);

  if (role.length === 0) {
    throw new NotFoundError("Role not found");
  }

  successResponse(res, "Role retrieved successfully", role[0]);
});

// Get users in a specific role with pagination and optional grade/subject filtering
export const getUsersByRole = asyncHandler(async (req: any, res: any) => {
  const { roleId } = req.params;
  const { page = 1, limit = 20, gradeId, classGroupId } = req.query;

  const parsedRoleId = Number(roleId);
  const parsedGradeId = gradeId ? Number(gradeId as string) : null;
  const parsedClassGroupId = classGroupId
    ? Number(classGroupId as string)
    : null;

  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
  const parsedLimit = Math.min(parseInt(limit as string), 100); // Cap at 100
  const parsedOffset = offset;

  // Build query based on filters
  let users: any[];
  let totalCount: number;

  if (parsedGradeId) {
    // Filter by grade - check users who have subjects in that grade
    // This includes teachers assigned to subjects in that grade AND students enrolled in subjects in that grade
    const targetGradeId = parsedGradeId;

    // Get users who have subjects assigned to this grade (teachers)
    // Join through TeacherSubjectAssignment -> ClassGroup to get the grade
    const teacherUsers = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        status: User.status,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      })
      .from(UserRole)
      .innerJoin(User, eq(UserRole.user_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .innerJoin(
        TeacherSubjectAssignment,
        eq(User.user_id, TeacherSubjectAssignment.user_id),
      )
      .innerJoin(
        ClassGroup,
        eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
      )
      .where(
        and(
          eq(UserRole.role_id, parsedRoleId),
          eq(ClassGroup.grade_id, targetGradeId),
        ),
      );

    // Get users who are enrolled in subjects in this grade (students)
    // Join through StudentSubjectEnrollment -> StudentClassGroup -> ClassGroup to get the grade
    const studentUsers = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        status: User.status,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      })
      .from(UserRole)
      .innerJoin(User, eq(UserRole.user_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .innerJoin(
        StudentSubjectEnrollment,
        eq(User.user_id, StudentSubjectEnrollment.user_id),
      )
      .innerJoin(StudentClassGroup, eq(User.user_id, StudentClassGroup.user_id))
      .innerJoin(
        ClassGroup,
        eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
      )
      .where(
        and(
          eq(UserRole.role_id, parsedRoleId),
          eq(ClassGroup.grade_id, targetGradeId),
        ),
      );

    // Combine and deduplicate users
    const userMap = new Map();
    [...teacherUsers, ...studentUsers].forEach((user) => {
      userMap.set(user.user_id, user);
    });
    const allFilteredUsers = Array.from(userMap.values());
    totalCount = allFilteredUsers.length;

    // Apply pagination
    users = allFilteredUsers.slice(parsedOffset, parsedOffset + parsedLimit);
  } else if (parsedClassGroupId) {
    // Filter by classgroup - check users who have subjects in that classgroup
    const targetClassGroupId = parsedClassGroupId;

    // Get teachers assigned to subjects in this classgroup
    const teacherUsers = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        status: User.status,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      })
      .from(UserRole)
      .innerJoin(User, eq(UserRole.user_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .innerJoin(
        TeacherSubjectAssignment,
        eq(User.user_id, TeacherSubjectAssignment.user_id),
      )
      .where(
        and(
          eq(UserRole.role_id, parsedRoleId),
          eq(TeacherSubjectAssignment.class_group_id, targetClassGroupId),
        ),
      );

    // Get students in this classgroup
    const studentUsers = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        status: User.status,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      })
      .from(UserRole)
      .innerJoin(User, eq(UserRole.user_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .innerJoin(StudentClassGroup, eq(User.user_id, StudentClassGroup.user_id))
      .where(
        and(
          eq(UserRole.role_id, parsedRoleId),
          eq(StudentClassGroup.class_group_id, targetClassGroupId),
        ),
      );

    // Combine and deduplicate users
    const userMap = new Map();
    [...teacherUsers, ...studentUsers].forEach((user) => {
      userMap.set(user.user_id, user);
    });
    const allFilteredUsers = Array.from(userMap.values());
    totalCount = allFilteredUsers.length;

    // Apply pagination
    users = allFilteredUsers.slice(parsedOffset, parsedOffset + parsedLimit);
  } else {
    // No filters - simple query
    const baseQuery = db
      .select({
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        status: User.status,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      })
      .from(UserRole)
      .innerJoin(User, eq(UserRole.user_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(eq(UserRole.role_id, parsedRoleId));

    // Get total count
    const countResult = await baseQuery;
    totalCount = countResult.length;

    // Get paginated results
    users = await baseQuery.limit(parsedLimit).offset(parsedOffset);
  }

  successResponse(res, "Users retrieved successfully", {
    users,
    pagination: {
      page: parseInt(page),
      limit: parsedLimit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / parsedLimit),
    },
  });
});
// FOLDER OPERATIONS
// ======================

export const createFolder = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { name, description, parentFolderId, color, academicYearId } =
    req.body;

  // Validate input
  if (!name || name.trim().length === 0) {
    throw new ValidationError("Folder name is required");
  }

  if (name.length > 255) {
    throw new ValidationError("Folder name must be less than 255 characters");
  }

  // Check if parent folder exists and belongs to user
  if (parentFolderId) {
    const parentFolder = await db
      .select()
      .from(DocumentFolder)
      .where(
        and(
          eq(DocumentFolder.folder_id, parentFolderId),
          eq(DocumentFolder.user_id, userId),
        ),
      )
      .limit(1);

    if (parentFolder.length === 0) {
      throw new ValidationError("Parent folder not found");
    }
  }

  const result = await db.insert(DocumentFolder).values({
    user_id: userId,
    parent_folder_id: parentFolderId || null,
    academic_year_id: academicYearId ? parseInt(academicYearId) : null,
    name: sanitizeString(name),
    description: description ? sanitizeString(description) : null,
    color: color || "#008d3b",
  });

  const folderId = result[0].insertId;

  const folder = await db
    .select()
    .from(DocumentFolder)
    .where(eq(DocumentFolder.folder_id, folderId))
    .limit(1);

  logger.info(`Folder created: ${folderId} by user ${userId}`);

  // Record activity
  await recordActivity(
    userId,
    "FOLDER_CREATE",
    `Folder created: ${name}`,
    "DocumentFolder",
    folderId,
    { name, parentFolderId, color },
    userId,
  );

  successResponse(res, "Folder created successfully", folder[0]);
});

export const getFolders = asyncHandler(async (req: any, res: any) => {
  // Validate user authentication
  if (!req.user || !req.user.userId) {
    return res.status(401).json({
      success: false,
      message: "User not authenticated",
    });
  }

  const rawUserId = req.user.userId;
  const userId = Number(rawUserId);

  // Validate userId
  if (!rawUserId || isNaN(userId) || !Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID: must be a positive integer",
    });
  }

  const { parentFolderId, academicYearId } = req.query;

  if (
    parentFolderId &&
    (isNaN(Number(parentFolderId)) || Number(parentFolderId) <= 0)
  ) {
    throw new ValidationError("Invalid parentFolderId");
  }

  if (
    academicYearId &&
    (isNaN(Number(academicYearId)) || Number(academicYearId) <= 0)
  ) {
    throw new ValidationError("Invalid academicYearId");
  }

  const parentId = parentFolderId ? parseInt(parentFolderId) : null;
  const yearId = academicYearId ? parseInt(academicYearId) : null;

  // Get folders owned by the user
  const ownedFolders = await db
    .select({
      folder: DocumentFolder,
      owner: {
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      },
    })
    .from(DocumentFolder)
    .innerJoin(User, eq(DocumentFolder.user_id, User.user_id))
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(
      and(
        eq(DocumentFolder.user_id, userId),
        parentId === null
          ? isNull(DocumentFolder.parent_folder_id)
          : eq(DocumentFolder.parent_folder_id, parentId),
        // Only scope root-level folders by academic year; folders opened by
        // navigating into a parent are already scoped by that parent.
        parentId === null && yearId !== null
          ? eq(DocumentFolder.academic_year_id, yearId)
          : undefined,
      ),
    );

  // Get folders shared with the user
  let sharedFolders: any[] = [];
  if (parentId === null) {
    // Root level shared folders
    sharedFolders = await db
      .select({
        folder: DocumentFolder,
        permission: FolderPermission,
        owner: {
          user_id: User.user_id,
          username: User.username,
          email: User.email,
          first_name: UserProfile.first_name,
          last_name: UserProfile.last_name,
        },
      })
      .from(FolderPermission)
      .innerJoin(
        DocumentFolder,
        eq(FolderPermission.folder_id, DocumentFolder.folder_id),
      )
      .innerJoin(User, eq(DocumentFolder.user_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(
        and(
          eq(FolderPermission.user_id, userId),
          or(
            isNull(FolderPermission.expires_at),
            gt(FolderPermission.expires_at, new Date()),
          ),
          yearId !== null
            ? eq(DocumentFolder.academic_year_id, yearId)
            : undefined,
        ),
      );
  } else {
    // Check if the parent folder (or any of its ancestors) is shared with the
    // user, so multi-level nested folders cascade correctly, not just direct
    // children of an explicitly-shared folder.
    const parentAccess = await resolveFolderAccess(userId, parentId);

    if (parentAccess && parentAccess.folder.user_id !== userId) {
      const subFolders = await db
        .select({
          folder: DocumentFolder,
          owner: {
            user_id: User.user_id,
            username: User.username,
            email: User.email,
            first_name: UserProfile.first_name,
            last_name: UserProfile.last_name,
          },
        })
        .from(DocumentFolder)
        .innerJoin(User, eq(DocumentFolder.user_id, User.user_id))
        .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
        .where(
          and(
            eq(DocumentFolder.parent_folder_id, parentId),
            eq(DocumentFolder.user_id, parentAccess.folder.user_id),
          ),
        );

      // Mark these as accessible due to the (possibly ancestor) permission
      sharedFolders = subFolders.map((item) => ({
        ...item,
        permission: { permission_type: parentAccess.permissionType },
      }));
    }
  }

  // How many people each owned folder is shared with — lets the owner see
  // at a glance who has access without opening the Share modal.
  let folderShareCounts = new Map<number, number>();
  if (ownedFolders.length > 0) {
    const counts = await db
      .select({
        folder_id: FolderPermission.folder_id,
        count: sql<number>`COUNT(*)`,
      })
      .from(FolderPermission)
      .where(
        and(
          inArray(
            FolderPermission.folder_id,
            ownedFolders.map((f) => f.folder.folder_id),
          ),
          or(
            isNull(FolderPermission.expires_at),
            gt(FolderPermission.expires_at, new Date()),
          ),
        ),
      )
      .groupBy(FolderPermission.folder_id);
    folderShareCounts = new Map(
      counts.map((c) => [c.folder_id, Number(c.count)]),
    );
  }

  // Combine owned and shared folders, removing duplicates
  const allFolders = [
    ...ownedFolders.map((f) => ({
      ...f,
      folder: {
        ...f.folder,
        share_count: folderShareCounts.get(f.folder.folder_id) || 0,
      },
    })),
  ];
  const ownedFolderIds = new Set(ownedFolders.map((f) => f.folder.folder_id));

  for (const shared of sharedFolders) {
    if (!ownedFolderIds.has(shared.folder.folder_id)) {
      allFolders.push({
        folder: {
          ...shared.folder,
          is_shared: true,
          permission_type: shared.permission.permission_type,
        },
        owner: shared.owner,
      });
    }
  }

  // Sort by name
  allFolders.sort((a, b) => a.folder.name.localeCompare(b.folder.name));

  successResponse(res, "Folders retrieved successfully", allFolders);
});

export const getFolderById = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { folderId } = req.params;

  // Validate folderId
  const folderIdNum = parseInt(folderId);
  if (isNaN(folderIdNum) || folderIdNum <= 0) {
    throw new ValidationError("Invalid folder ID");
  }

  const access = await resolveFolderAccess(userId, folderIdNum);
  if (!access) {
    throw new NotFoundError("Folder not found");
  }

  const folder =
    access.permissionType === "OWNER"
      ? access.folder
      : {
          ...access.folder,
          is_shared: true,
          permission_type: access.permissionType,
        };

  successResponse(res, "Folder retrieved successfully", folder);
});

export const updateFolder = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { folderId } = req.params;
  const { name, description, color } = req.body;

  // Owner or a share (direct/inherited) with EDIT can rename/restyle a folder.
  const folderAccess = await resolveFolderAccess(userId, parseInt(folderId));
  if (!folderAccess) {
    throw new NotFoundError("Folder not found");
  }
  if (
    folderAccess.permissionType !== "OWNER" &&
    folderAccess.permissionType !== "EDIT"
  ) {
    throw new AuthorizationError(
      "You do not have permission to edit this folder",
    );
  }

  const updateData: any = {};
  if (name) {
    if (name.trim().length === 0) {
      throw new ValidationError("Folder name cannot be empty");
    }
    updateData.name = sanitizeString(name);
  }
  if (description !== undefined) {
    updateData.description = sanitizeString(description);
  }
  if (color) {
    updateData.color = color;
  }

  await db
    .update(DocumentFolder)
    .set(updateData)
    .where(eq(DocumentFolder.folder_id, parseInt(folderId)));

  const updated = await db
    .select()
    .from(DocumentFolder)
    .where(eq(DocumentFolder.folder_id, parseInt(folderId)))
    .limit(1);

  logger.info(`Folder updated: ${folderId} by user ${userId}`);

  // Record activity
  await recordActivity(
    userId,
    "FOLDER_UPDATE",
    `Folder updated: ${name || updated[0].name}`,
    "DocumentFolder",
    parseInt(folderId),
    { name, description, color },
    userId,
  );

  successResponse(res, "Folder updated successfully", updated[0]);
});

export const deleteFolder = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { folderId } = req.params;
  const folderIdNum = parseInt(folderId);

  // Only the owner can delete a folder — same rationale as deleteDocument.
  const folder = await db
    .select()
    .from(DocumentFolder)
    .where(
      and(
        eq(DocumentFolder.folder_id, folderIdNum),
        eq(DocumentFolder.user_id, userId),
      ),
    )
    .limit(1);

  if (folder.length === 0) {
    throw new NotFoundError("Folder not found");
  }

  // Delete all documents in the folder
  const documents = await db
    .select()
    .from(Document)
    .where(eq(Document.folder_id, folderIdNum));

  // Delete physical files from storage
  for (const doc of documents) {
    try {
      await storageService.deleteFile(doc.file_path);
    } catch (error) {
      logger.warn(`Failed to delete file from storage: ${doc.file_path}`);
    }
  }

  // Delete documents and their versions
  await db.delete(Document).where(eq(Document.folder_id, folderIdNum));
  await db
    .delete(DocumentFolder)
    .where(eq(DocumentFolder.folder_id, folderIdNum));

  // Record activity
  await recordActivity(
    userId,
    "FOLDER_DELETE",
    `Folder deleted: ${folder[0].name}`,
    "DocumentFolder",
    folderIdNum,
    undefined,
    userId,
  );

  successResponse(res, "Folder deleted successfully");
});

// ======================
// FOLDER SHARING OPERATIONS
// ======================

// Get folder permissions
export const getFolderPermissions = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { folderId } = req.params;

  // Check if folder exists and belongs to user
  const folder = await db
    .select()
    .from(DocumentFolder)
    .where(
      and(
        eq(DocumentFolder.folder_id, parseInt(folderId)),
        eq(DocumentFolder.user_id, userId),
      ),
    )
    .limit(1);

  if (folder.length === 0) {
    throw new NotFoundError("Folder not found");
  }

  // Get user permissions with user details
  const userPermissions = await db
    .select({
      permission_id: FolderPermission.permission_id,
      user_id: FolderPermission.user_id,
      permission_type: FolderPermission.permission_type,
      expires_at: FolderPermission.expires_at,
      created_at: FolderPermission.created_at,
      shared_by: FolderPermission.shared_by,
      user: {
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      },
    })
    .from(FolderPermission)
    .innerJoin(User, eq(FolderPermission.user_id, User.user_id))
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(eq(FolderPermission.folder_id, parseInt(folderId)));

  successResponse(
    res,
    "Folder permissions retrieved successfully",
    userPermissions,
  );
});

// Share folder with users or roles
export const shareFolder = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { folderId } = req.params;
  const {
    userIds,
    roleIds,
    permissionType,
    expiresAt,
    filterType,
    filterIds,
    academicTermId,
  } = req.body;

  if (
    (!userIds || !Array.isArray(userIds) || userIds.length === 0) &&
    (!roleIds || !Array.isArray(roleIds) || roleIds.length === 0)
  ) {
    throw new ValidationError("At least one user ID or role ID is required");
  }

  // Validate filter options
  const validFilterTypes = [
    "subject_assigned",
    "subject_enrolled",
    "program_assigned",
    "grade_assigned",
  ];
  if (filterType && !validFilterTypes.includes(filterType)) {
    throw new ValidationError(
      "Invalid filter type. Must be one of: subject_assigned, subject_enrolled, program_assigned, grade_assigned",
    );
  }

  // filterType and filterIds must be provided together
  if ((filterType && !filterIds) || (!filterType && filterIds)) {
    throw new ValidationError(
      "Both filterType and filterIds must be provided together",
    );
  }

  // Check if folder exists and belongs to user
  const folder = await db
    .select()
    .from(DocumentFolder)
    .where(
      and(
        eq(DocumentFolder.folder_id, parseInt(folderId)),
        eq(DocumentFolder.user_id, userId),
      ),
    )
    .limit(1);

  if (folder.length === 0) {
    throw new NotFoundError("Folder not found");
  }

  const permissions = [];
  const alreadySharedUserIds: number[] = [];

  // Share with users
  if (userIds && userIds.length > 0) {
    for (const targetUserId of userIds) {
      // Check if permission already exists with same filter
      const existingPermQuery = db
        .select()
        .from(FolderPermission)
        .where(
          and(
            eq(FolderPermission.folder_id, parseInt(folderId)),
            eq(FolderPermission.user_id, targetUserId),
          ),
        );

      const existingPerm = await existingPermQuery.limit(1);

      if (existingPerm.length === 0) {
        // Use raw SQL to ensure AUTO_INCREMENT works properly
        await db.execute(
          sql`INSERT INTO FolderPermission (folder_id, user_id, permission_type, shared_by, filter_type, filter_ids, academic_term_id, expires_at) VALUES (${parseInt(folderId)}, ${targetUserId}, ${permissionType || "VIEW"}, ${userId}, ${filterType || null}, ${filterIds ? JSON.stringify(filterIds) : null}, ${academicTermId ? parseInt(academicTermId) : null}, ${expiresAt ? new Date(expiresAt) : null})`,
        );

        // Get the most recent permission for this folder and user
        const perm = await db
          .select()
          .from(FolderPermission)
          .where(
            and(
              eq(FolderPermission.folder_id, parseInt(folderId)),
              eq(FolderPermission.user_id, targetUserId),
            ),
          )
          .orderBy(desc(FolderPermission.permission_id))
          .limit(1);

        if (perm.length > 0) {
          permissions.push({
            ...perm[0],
            shared_with: "user",
            target_id: targetUserId,
          });
        }
      } else {
        // User is already shared
        alreadySharedUserIds.push(targetUserId);
      }
    }
  }

  // Share with roles
  if (roleIds && roleIds.length > 0) {
    // Get all users in these roles
    const usersInRoles = await db
      .select({
        user_id: UserRole.user_id,
        role_id: UserRole.role_id,
      })
      .from(UserRole)
      .where(
        inArray(
          UserRole.role_id,
          roleIds.map((id: string) => parseInt(id)),
        ),
      );

    // Get unique user IDs
    const uniqueUserIds = [...new Set(usersInRoles.map((ur) => ur.user_id))];

    for (const targetUserId of uniqueUserIds) {
      // Check if permission already exists with same filter
      const existingPerm = await db
        .select()
        .from(FolderPermission)
        .where(
          and(
            eq(FolderPermission.folder_id, parseInt(folderId)),
            eq(FolderPermission.user_id, targetUserId),
            filterType
              ? and(
                  eq(FolderPermission.filter_type, filterType),
                  eq(FolderPermission.filter_ids, filterIds),
                )
              : undefined,
          ),
        )
        .limit(1);

      if (existingPerm.length === 0) {
        const result = await db.insert(FolderPermission).values({
          folder_id: parseInt(folderId),
          user_id: targetUserId,
          permission_type: permissionType || "VIEW",
          shared_by: userId,
          filter_type: filterType || null,
          filter_ids: filterIds || null,
          academic_term_id: academicTermId ? parseInt(academicTermId) : null,
          expires_at: expiresAt ? new Date(expiresAt) : null,
        });

        const permId = result[0].insertId;
        const perm = await db
          .select()
          .from(FolderPermission)
          .where(eq(FolderPermission.permission_id, permId))
          .limit(1);

        permissions.push({
          ...perm[0],
          shared_with: "role",
          target_id: targetUserId,
        });
      }
    }
  }

  logger.info(`Folder ${folderId} shared with users/roles by user ${userId}`);

  const newlyGrantedUserIds = [
    ...new Set(permissions.map((p: any) => p.user_id).filter(Boolean)),
  ] as number[];
  if (newlyGrantedUserIds.length > 0) {
    await notifyUsers(newlyGrantedUserIds, {
      kind: "folder_shared",
      title: `"${folder[0].name}" was shared with you`,
      body: `Permission: ${permissionType || "VIEW"}`,
      link: `/documents?folder=${folderId}`,
      subjectType: "folder",
      subjectId: parseInt(folderId),
      actorId: userId,
    });
  }

  // Build response with warning if some users were already shared
  const response: any = {
    permissions,
  };

  if (alreadySharedUserIds.length > 0) {
    // Get user details for the already shared users
    const alreadySharedUsers = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        email: User.email,
      })
      .from(User)
      .where(inArray(User.user_id, alreadySharedUserIds));

    response.alreadyShared = alreadySharedUsers;
    response.message = `Some users were already shared. ${alreadySharedUsers.map((u: any) => u.username || u.email || u.user_id).join(", ")} already have access.`;
  }

  successResponse(
    res,
    alreadySharedUserIds.length > 0
      ? "Some users were already shared"
      : "Folder shared successfully",
    response,
  );
});

// Update an existing folder permission's level/expiry in place (used by the
// Share modal's inline per-person permission editor).
export const updateFolderPermission = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const { permissionId } = req.params;
    const { permissionType, expiresAt } = req.body;

    const validTypes = ["VIEW", "EDIT", "DOWNLOAD", "SHARE"];
    if (permissionType && !validTypes.includes(permissionType)) {
      throw new ValidationError(
        `Invalid permission type. Must be one of: ${validTypes.join(", ")}`,
      );
    }

    const [existingPerm] = await db
      .select()
      .from(FolderPermission)
      .where(eq(FolderPermission.permission_id, parseInt(permissionId)))
      .limit(1);
    if (!existingPerm) throw new NotFoundError("Permission not found");

    const [folder] = await db
      .select()
      .from(DocumentFolder)
      .where(eq(DocumentFolder.folder_id, existingPerm.folder_id))
      .limit(1);
    const isFolderOwner = folder && folder.user_id === userId;
    if (!isFolderOwner && existingPerm.shared_by !== userId) {
      throw new AuthorizationError(
        "You do not have permission to modify this share",
      );
    }

    const updateData: any = {};
    if (permissionType) updateData.permission_type = permissionType;
    if (expiresAt !== undefined) {
      updateData.expires_at = expiresAt ? new Date(expiresAt) : null;
    }

    await db
      .update(FolderPermission)
      .set(updateData)
      .where(eq(FolderPermission.permission_id, parseInt(permissionId)));

    const [updated] = await db
      .select()
      .from(FolderPermission)
      .where(eq(FolderPermission.permission_id, parseInt(permissionId)))
      .limit(1);

    successResponse(res, "Permission updated successfully", updated);
  },
);

// Revoke folder access
export const revokeFolderAccess = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { permissionId } = req.params;

  // Check if user is SUPER_ADMIN
  const userRoles = await db
    .select({
      role_id: Role.role_id,
      name: Role.name,
    })
    .from(UserRole)
    .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
    .where(eq(UserRole.user_id, userId));

  const isSuperAdmin = userRoles.some((r) => r.name === "SUPER_ADMIN");

  // Get the permission first to check folder ownership
  const existingPerm = await db
    .select()
    .from(FolderPermission)
    .where(eq(FolderPermission.permission_id, parseInt(permissionId)))
    .limit(1);

  if (existingPerm.length === 0) {
    throw new NotFoundError(
      "Permission not found. It may have already been removed.",
    );
  }

  // Get the folder to check ownership
  const folder = await db
    .select()
    .from(DocumentFolder)
    .where(eq(DocumentFolder.folder_id, existingPerm[0].folder_id))
    .limit(1);

  const isFolderOwner = folder.length > 0 && folder[0].user_id === userId;

  // Check if user can delete: SUPER_ADMIN, folder owner, or original sharer
  if (!isSuperAdmin && !isFolderOwner) {
    // Must be the one who shared it
    if (existingPerm[0].shared_by !== userId) {
      // Same message as the "doesn't exist" case above — don't let the
      // response distinguish "not yours" from "doesn't exist".
      throw new NotFoundError(
        "Permission not found. It may have already been removed.",
      );
    }
  }

  // Delete the permission
  await db
    .delete(FolderPermission)
    .where(eq(FolderPermission.permission_id, parseInt(permissionId)));

  logger.info(`Folder permission ${permissionId} revoked by user ${userId}`);

  await notifyUsers([existingPerm[0].user_id], {
    kind: "permission_revoked",
    title: `${folder.length > 0 ? `"${folder[0].name}"` : "A folder"}: your access was removed`,
    link: "/documents",
    subjectType: "folder",
    subjectId: existingPerm[0].folder_id,
    actorId: userId,
  });

  successResponse(res, "Access revoked successfully", null);
});

// Get folders shared with me
export const getSharedFolders = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { academicYearId } = req.query;
  const yearId =
    academicYearId && !isNaN(Number(academicYearId))
      ? parseInt(academicYearId as string)
      : null;

  const shared = await db
    .select({
      folder: DocumentFolder,
      permission: FolderPermission,
      shared_by_user: {
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      },
    })
    .from(FolderPermission)
    .innerJoin(
      DocumentFolder,
      eq(FolderPermission.folder_id, DocumentFolder.folder_id),
    )
    .innerJoin(User, eq(FolderPermission.shared_by, User.user_id))
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(
      and(
        eq(FolderPermission.user_id, userId),
        or(
          isNull(FolderPermission.expires_at),
          gt(FolderPermission.expires_at, new Date()),
        ),
        yearId !== null
          ? eq(DocumentFolder.academic_year_id, yearId)
          : undefined,
      ),
    );

  // Apply the same filter-scoping (grade/subject/program) enforced
  // everywhere else — a filter-scoped role share should only appear for
  // users who still match that filter, not every member of the role.
  const associations = await getUserFilterAssociations(userId);
  const matchingShared = shared.filter((item) =>
    permissionMatchesFilter(
      item.permission.filter_type,
      item.permission.filter_ids,
      associations,
    ),
  );

  // Add folder owner information
  const sharedWithOwners = await Promise.all(
    matchingShared.map(async (item) => {
      const owner = await db
        .select({
          user_id: User.user_id,
          username: User.username,
          email: User.email,
          first_name: UserProfile.first_name,
          last_name: UserProfile.last_name,
        })
        .from(User)
        .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
        .where(eq(User.user_id, item.folder.user_id))
        .limit(1);

      return {
        ...item,
        folder_owner: owner[0] || null,
      };
    }),
  );

  // Add content counts for each folder
  const sharedWithCounts = await Promise.all(
    sharedWithOwners.map(async (item) => {
      const [subFoldersCount, documentsCount] = await Promise.all([
        // Count subfolders
        db
          .select({ count: sql<number>`count(*)` })
          .from(DocumentFolder)
          .where(
            and(
              eq(DocumentFolder.parent_folder_id, item.folder.folder_id),
              eq(DocumentFolder.user_id, item.folder.user_id), // Only count owner's subfolders
            ),
          ),
        // Count documents
        db
          .select({ count: sql<number>`count(*)` })
          .from(Document)
          .where(eq(Document.folder_id, item.folder.folder_id)),
      ]);

      return {
        ...item,
        content_count: {
          folders: subFoldersCount[0].count,
          documents: documentsCount[0].count,
          total: subFoldersCount[0].count + documentsCount[0].count,
        },
      };
    }),
  );

  successResponse(
    res,
    "Shared folders retrieved successfully",
    sharedWithCounts,
  );
});

// ======================
// SCHEME OF WORK
// ======================

export const previewSchemeOfWork = asyncHandler(async (req: any, res: any) => {
  const file = req.file;

  if (!file) {
    throw new ValidationError("No file uploaded");
  }

  // Check file extension
  const extension = path.extname(file.originalname).toLowerCase();
  if (extension !== ".docx") {
    throw new ValidationError("Only .docx files are supported");
  }

  try {
    const result = await mammoth.convertToHtml({ buffer: file.buffer });
    const html = result.value; // The generated HTML
    const messages = result.messages; // Any messages, such as warnings during conversion

    if (messages.length > 0) {
      logger.warn(
        `Mammoth messages for uploaded file: ${JSON.stringify(messages)}`,
      );
    }

    successResponse(res, "Scheme of work preview generated successfully", {
      html,
    });
  } catch (error: any) {
    logger.error("Error converting DOCX to HTML:", error);
    throw new ValidationError("Failed to convert DOCX file to HTML");
  }
});

// ======================
// DOCUMENT OPERATIONS
// ======================

export const uploadDocument = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { folderId, description, tags, academicYearId } = req.body;
  const file = req.file;

  if (!file) {
    throw new ValidationError("No file uploaded");
  }

  // Validate file size (e.g., 50MB max)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new ValidationError("File size exceeds maximum limit of 50MB");
  }

  // Check the caller can actually upload into this folder: ownership or a
  // share (direct or inherited from an ancestor) with EDIT permission.
  // Previously this only checked raw ownership, so a folder shared with
  // EDIT would 404 as "Folder not found" instead of accepting the upload.
  if (folderId) {
    const folderAccess = await resolveFolderAccess(userId, parseInt(folderId));
    if (!folderAccess) {
      throw new NotFoundError("Folder not found");
    }
    if (
      folderAccess.permissionType !== "OWNER" &&
      folderAccess.permissionType !== "EDIT"
    ) {
      throw new AuthorizationError(
        "You only have view access to this folder and cannot upload files into it",
      );
    }
  }

  // Generate unique filename
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const fileName = `${Date.now()}-${Math.random()
    .toString(36)
    .substring(2)}${fileExtension}`;
  const remoteFilePath = `${userId}/${fileName}`;

  try {
    // Upload file buffer to storage
    await storageService.uploadFile(file.buffer, remoteFilePath);

    const result = await db.insert(Document).values({
      user_id: userId,
      folder_id: folderId ? parseInt(folderId) : null,
      academic_year_id: academicYearId ? parseInt(academicYearId) : null,
      file_name: fileName,
      original_name: file.originalname,
      file_path: remoteFilePath,
      file_size: file.size,
      mime_type: file.mimetype,
      file_extension: fileExtension.replace(".", ""),
      description: description ? sanitizeString(description) : null,
      tags: tags ? sanitizeString(tags) : null,
    });

    const documentId = result[0].insertId;

    const document = await db
      .select()
      .from(Document)
      .where(eq(Document.document_id, documentId))
      .limit(1);

    logger.info(`Document uploaded: ${documentId} by user ${userId}`);

    // Record activity
    await recordActivity(
      userId,
      "DOCUMENT_UPLOAD",
      `Document uploaded: ${file.originalname}`,
      "Document",
      documentId,
      {
        file_name: fileName,
        original_name: file.originalname,
        mime_type: file.mimetype,
        file_size: file.size,
      },
      userId,
    );

    successResponse(res, "Document uploaded successfully", document[0]);
  } catch (error) {
    logger.error("Document upload failed:", error);
    throw error;
  }
});

export const getDocuments = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const {
    folderId,
    academicYearId,
    search,
    page = 1,
    limit = 20,
    sortBy = "created_at",
    sortOrder = "desc",
  } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const offset = (pageNum - 1) * limitNum;

  // Build query conditions
  let conditions: any[] = [eq(Document.user_id, userId)];
  let isSharedFolder = false;

  if (folderId) {
    const folderIdNum = parseInt(folderId as string);

    // Resolve access (ownership, direct share, or a shared ancestor folder)
    const folderAccess = await resolveFolderAccess(userId, folderIdNum);
    if (!folderAccess) {
      throw new NotFoundError("Folder not found");
    }

    if (folderAccess.permissionType === "OWNER") {
      conditions.push(eq(Document.folder_id, folderIdNum));
    } else {
      // Shared folder (directly or via an ancestor) — list its documents
      // regardless of who uploaded them, not just the caller's own.
      conditions = [eq(Document.folder_id, folderIdNum)];
      isSharedFolder = true;
    }
  } else {
    conditions.push(isNull(Document.folder_id));

    // Only scope root-level documents by academic year; documents inside a
    // folder are already scoped by that folder.
    if (academicYearId) {
      const yearIdNum = parseInt(academicYearId as string);
      conditions.push(eq(Document.academic_year_id, yearIdNum));
    }
  }

  // Get total count
  const allDocuments = await db
    .select()
    .from(Document)
    .where(and(...conditions));

  const total = allDocuments.length;

  // Get documents with sorting - use explicit column references
  let orderByArgs;
  const sortColumn = sortBy as string;
  const sortDir = sortOrder as string;

  if (sortDir === "desc") {
    switch (sortColumn) {
      case "name":
        orderByArgs = desc(Document.original_name);
        break;
      case "size":
        orderByArgs = desc(Document.file_size);
        break;
      case "date":
        orderByArgs = desc(Document.created_at);
        break;
      case "type":
        orderByArgs = desc(Document.file_extension);
        break;
      default:
        orderByArgs = desc(Document.created_at);
    }
  } else {
    switch (sortColumn) {
      case "name":
        orderByArgs = asc(Document.original_name);
        break;
      case "size":
        orderByArgs = asc(Document.file_size);
        break;
      case "date":
        orderByArgs = asc(Document.created_at);
        break;
      case "type":
        orderByArgs = asc(Document.file_extension);
        break;
      default:
        orderByArgs = asc(Document.created_at);
    }
  }

  const documents = await db
    .select({
      document: Document,
      owner: {
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      },
    })
    .from(Document)
    .innerJoin(User, eq(Document.user_id, User.user_id))
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(and(...conditions))
    .orderBy(orderByArgs)
    .limit(limitNum)
    .offset(offset);

  // How many people each of the caller's own documents is shared with — not
  // meaningful (and not computed) when browsing someone else's shared folder.
  let documentsWithCounts = documents;
  if (!isSharedFolder && documents.length > 0) {
    const counts = await db
      .select({
        document_id: DocumentPermission.document_id,
        count: sql<number>`COUNT(*)`,
      })
      .from(DocumentPermission)
      .where(
        and(
          inArray(
            DocumentPermission.document_id,
            documents.map((d) => d.document.document_id),
          ),
          or(
            isNull(DocumentPermission.expires_at),
            gt(DocumentPermission.expires_at, new Date()),
          ),
        ),
      )
      .groupBy(DocumentPermission.document_id);
    const documentShareCounts = new Map(
      counts.map((c) => [c.document_id, Number(c.count)]),
    );
    documentsWithCounts = documents.map((d) => ({
      ...d,
      document: {
        ...d.document,
        share_count: documentShareCounts.get(d.document.document_id) || 0,
      },
    }));
  }

  paginatedResponse(res, "Documents retrieved successfully", documentsWithCounts, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
});

export const getDocumentById = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;

  // Validate documentId
  const documentIdNum = parseInt(documentId);
  if (isNaN(documentIdNum) || documentIdNum <= 0) {
    throw new ValidationError("Invalid document ID");
  }

  const access = await resolveDocumentAccess(userId, documentIdNum);
  if (!access) {
    throw new NotFoundError("Document not found");
  }

  successResponse(res, "Document retrieved successfully", access.document);
});

export const updateDocument = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;
  const { description, tags, is_public, original_name } = req.body;
  const documentIdNum = parseInt(documentId);

  // Owner or a share (direct/inherited) with EDIT can update metadata.
  const access = await resolveDocumentAccess(userId, documentIdNum);
  if (!access) {
    throw new NotFoundError("Document not found");
  }
  if (access.permissionType !== "OWNER" && access.permissionType !== "EDIT") {
    throw new AuthorizationError(
      "You do not have permission to edit this document",
    );
  }

  const updateData: any = {};
  if (description !== undefined) {
    updateData.description = sanitizeString(description);
  }
  if (tags !== undefined) {
    updateData.tags = sanitizeString(tags);
  }
  if (is_public !== undefined) {
    updateData.is_public = is_public ? 1 : 0;
  }
  if (original_name !== undefined) {
    if (original_name.trim().length === 0) {
      throw new ValidationError("Document name cannot be empty");
    }
    updateData.original_name = sanitizeString(original_name);
  }

  await db
    .update(Document)
    .set(updateData)
    .where(eq(Document.document_id, documentIdNum));

  const updated = await db
    .select()
    .from(Document)
    .where(eq(Document.document_id, documentIdNum))
    .limit(1);

  logger.info(`Document updated: ${documentId} by user ${userId}`);

  // Record activity
  await recordActivity(
    userId,
    "DOCUMENT_UPDATE",
    `Document updated: ${original_name || updated[0].original_name}`,
    "Document",
    documentIdNum,
    { description, tags, is_public, original_name },
    userId,
  );

  successResponse(res, "Document updated successfully", updated[0]);
});

export const deleteDocument = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;
  const documentIdNum = parseInt(documentId);

  // Only the owner can delete — EDIT access lets you upload/replace content
  // but not remove the document outright (mirrors Google Drive's model
  // where editors can't delete someone else's file).
  const document = await db
    .select()
    .from(Document)
    .where(
      and(
        eq(Document.document_id, documentIdNum),
        eq(Document.user_id, userId),
      ),
    )
    .limit(1);

  if (document.length === 0) {
    throw new NotFoundError("Document not found");
  }

  // Delete physical file from storage
  try {
    await storageService.deleteFile(document[0].file_path);
  } catch (error) {
    logger.warn(`Failed to delete file from storage: ${document[0].file_path}`);
  }

  // Delete document versions
  await db
    .delete(DocumentVersion)
    .where(eq(DocumentVersion.document_id, documentIdNum));

  // Delete document permissions
  await db
    .delete(DocumentPermission)
    .where(eq(DocumentPermission.document_id, documentIdNum));

  // Delete document
  await db.delete(Document).where(eq(Document.document_id, documentIdNum));

  // Record activity
  await recordActivity(
    userId,
    "DOCUMENT_DELETE",
    `Document deleted: ${document[0].original_name}`,
    "Document",
    documentIdNum,
    undefined,
    userId,
  );

  successResponse(res, "Document deleted successfully");
});

export const downloadDocument = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;

  const access = await resolveDocumentAccess(userId, Number(documentId));
  if (!access) {
    throw new NotFoundError("Document not found");
  }
  const doc = access.document;

  // Check storage file exists
  const exists = await storageService.fileExists(doc.file_path);
  if (!exists) {
    throw new NotFoundError("File not found on server");
  }

  // Download file to memory
  const buffer = await storageService.downloadToBuffer(doc.file_path);

  if (!buffer.length) {
    throw new NotFoundError("File is empty or corrupted");
  }

  // Force correct headers for PDF
  const mime =
    doc.file_extension?.toLowerCase() === "pdf"
      ? "application/pdf"
      : doc.mime_type || "application/octet-stream";

  res.setHeader("Content-Type", mime);
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${doc.original_name}"`,
  );
  res.setHeader("Content-Length", buffer.length);

  res.send(buffer);
});

// ======================
// VERSION OPERATIONS
// ======================

export const uploadNewVersion = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;
  const { changeDescription } = req.body;
  const file = req.file;

  if (!file) {
    throw new ValidationError("No file uploaded");
  }

  // Check if document exists and belongs to user
  const document = await db
    .select()
    .from(Document)
    .where(
      and(
        eq(Document.document_id, parseInt(documentId)),
        eq(Document.user_id, userId),
      ),
    )
    .limit(1);

  if (document.length === 0) {
    throw new NotFoundError("Document not found");
  }

  // Get current latest version number
  const latestVersion = await db
    .select()
    .from(DocumentVersion)
    .where(eq(DocumentVersion.document_id, parseInt(documentId)))
    .orderBy(desc(DocumentVersion.version_number))
    .limit(1);

  const newVersionNumber =
    latestVersion.length > 0 ? latestVersion[0].version_number + 1 : 1;

  // Generate unique filename
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const fileName = `${Date.now()}-v${newVersionNumber}-${Math.random()
    .toString(36)
    .substring(2)}${fileExtension}`;
  const filePath = path.join(
    userId.toString(),
    "versions",
    documentId.toString(),
    fileName,
  );

  try {
    // Upload file buffer to storage
    await storageService.uploadFile(file.buffer, filePath);

    // Save version
    const result = await db.insert(DocumentVersion).values({
      document_id: parseInt(documentId),
      user_id: userId,
      version_number: newVersionNumber,
      file_name: fileName,
      file_path: filePath,
      file_size: file.size,
      change_description: changeDescription
        ? sanitizeString(changeDescription)
        : null,
    });

    const versionId = result[0].insertId;

    const version = await db
      .select()
      .from(DocumentVersion)
      .where(eq(DocumentVersion.version_id, versionId))
      .limit(1);

    logger.info(
      `New version uploaded: ${documentId} v${newVersionNumber} by user ${userId}`,
    );

    successResponse(res, "New version uploaded successfully", version[0]);
  } catch (error) {
    logger.error("Version upload failed:", error);
    throw error;
  }
});

export const getDocumentVersions = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;

  // Validate documentId
  const documentIdNum = parseInt(documentId);
  if (isNaN(documentIdNum) || documentIdNum <= 0) {
    throw new ValidationError("Invalid document ID");
  }

  // Check if document exists and user has access
  const document = await db
    .select()
    .from(Document)
    .where(eq(Document.document_id, documentIdNum))
    .limit(1);

  if (document.length === 0) {
    throw new NotFoundError("Document not found");
  }

  if (document[0].user_id !== userId) {
    throw new AuthenticationError(
      "You don't have permission to view this document's versions",
    );
  }

  const versions = await db
    .select()
    .from(DocumentVersion)
    .where(eq(DocumentVersion.document_id, parseInt(documentId)))
    .orderBy(desc(DocumentVersion.version_number));

  successResponse(res, "Versions retrieved successfully", versions);
});

// Get document permissions (who it's shared with)
export const getDocumentPermissions = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const { documentId } = req.params;

    // Check if document exists and belongs to user
    const document = await db
      .select()
      .from(Document)
      .where(
        and(
          eq(Document.document_id, parseInt(documentId)),
          eq(Document.user_id, userId),
        ),
      )
      .limit(1);

    if (document.length === 0) {
      throw new NotFoundError("Document not found");
    }

    // Get user permissions with user details
    const userPermissions = await db
      .select({
        permission_id: DocumentPermission.permission_id,
        user_id: DocumentPermission.user_id,
        permission_type: DocumentPermission.permission_type,
        expires_at: DocumentPermission.expires_at,
        created_at: DocumentPermission.created_at,
        shared_by: DocumentPermission.shared_by,
        shared_with: DocumentPermission.shared_with,
        user: {
          user_id: User.user_id,
          username: User.username,
          email: User.email,
          first_name: UserProfile.first_name,
          last_name: UserProfile.last_name,
        },
      })
      .from(DocumentPermission)
      .innerJoin(User, eq(DocumentPermission.user_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(eq(DocumentPermission.document_id, parseInt(documentId)));

    // Get role permissions for this document
    const rolePermissions = await db
      .select({
        permission_id: DocumentPermission.permission_id,
        document_id: DocumentPermission.document_id,
        user_id: DocumentPermission.user_id,
        permission_type: DocumentPermission.permission_type,
        expires_at: DocumentPermission.expires_at,
        created_at: DocumentPermission.created_at,
        shared_by: DocumentPermission.shared_by,
        role: {
          role_id: Role.role_id,
          name: Role.name,
          description: Role.description,
        },
        user: {
          user_id: User.user_id,
          username: User.username,
          email: User.email,
          first_name: UserProfile.first_name,
          last_name: UserProfile.last_name,
        },
      })
      .from(DocumentPermission)
      .innerJoin(User, eq(DocumentPermission.user_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .innerJoin(UserRole, eq(DocumentPermission.user_id, UserRole.user_id))
      .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
      .where(
        and(
          eq(DocumentPermission.document_id, parseInt(documentId)),
          eq(DocumentPermission.shared_with, "role"),
        ),
      );

    // Group role permissions by role
    const rolePermissionsMap = new Map();
    for (const perm of rolePermissions) {
      if (!rolePermissionsMap.has(perm.role.role_id)) {
        rolePermissionsMap.set(perm.role.role_id, {
          role: perm.role,
          users: [],
          permission_type: perm.permission_type,
          permission_id: perm.permission_id,
        });
      }
      rolePermissionsMap.get(perm.role.role_id).users.push(perm.user);
    }

    const rolePermissionsList = Array.from(rolePermissionsMap.values());

    successResponse(res, "Permissions retrieved successfully", {
      userPermissions,
      rolePermissions: rolePermissionsList,
    });
  },
);

// ======================
// SHARING OPERATIONS
// ======================

export const shareDocument = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;
  const {
    userIds,
    roleIds,
    permissionType,
    expiresAt,
    filterType,
    filterIds,
    academicTermId,
  } = req.body;

  if (
    (!userIds || !Array.isArray(userIds) || userIds.length === 0) &&
    (!roleIds || !Array.isArray(roleIds) || roleIds.length === 0)
  ) {
    throw new ValidationError("At least one user ID or role ID is required");
  }

  // Validate filter options
  const validFilterTypes = [
    "subject_assigned",
    "subject_enrolled",
    "program_assigned",
    "grade_assigned",
  ];
  if (filterType && !validFilterTypes.includes(filterType)) {
    throw new ValidationError(
      "Invalid filter type. Must be one of: subject_assigned, subject_enrolled, program_assigned, grade_assigned",
    );
  }

  // filterType and filterIds must be provided together
  if (
    (filterType && (!filterIds || !Array.isArray(filterIds))) ||
    (!filterType && filterIds)
  ) {
    throw new ValidationError(
      "Both filterType and filterIds (array) must be provided together",
    );
  }

  // Check if document exists and belongs to user
  const document = await db
    .select()
    .from(Document)
    .where(
      and(
        eq(Document.document_id, parseInt(documentId)),
        eq(Document.user_id, userId),
      ),
    )
    .limit(1);

  if (document.length === 0) {
    throw new NotFoundError("Document not found");
  }

  const permissions = [];
  const alreadySharedUserIds: number[] = [];

  // Share with users
  if (userIds && userIds.length > 0) {
    for (const targetUserId of userIds) {
      // Check if permission already exists
      const existingPerm = await db
        .select()
        .from(DocumentPermission)
        .where(
          and(
            eq(DocumentPermission.document_id, parseInt(documentId)),
            eq(DocumentPermission.user_id, targetUserId),
          ),
        )
        .limit(1);

      if (existingPerm.length === 0) {
        const result = await db.insert(DocumentPermission).values({
          document_id: parseInt(documentId),
          user_id: targetUserId,
          permission_type: permissionType || "VIEW",
          shared_by: userId,
          shared_with: "user",
          filter_type: filterType || null,
          filter_ids: filterIds || null,
          academic_term_id: academicTermId ? parseInt(academicTermId) : null,
          expires_at: expiresAt ? new Date(expiresAt) : null,
        });

        const permId = result[0].insertId;
        const perm = await db
          .select()
          .from(DocumentPermission)
          .where(eq(DocumentPermission.permission_id, permId))
          .limit(1);

        if (perm.length > 0) {
          permissions.push({
            ...perm[0],
            shared_with: "user",
            target_id: targetUserId,
          });
        }
      } else {
        // User is already shared
        alreadySharedUserIds.push(targetUserId);
      }
    }
  }

  // Share with roles
  if (roleIds && roleIds.length > 0) {
    // Get all users in these roles
    const usersInRoles = await db
      .select({
        user_id: UserRole.user_id,
        role_id: UserRole.role_id,
      })
      .from(UserRole)
      .where(
        inArray(
          UserRole.role_id,
          roleIds.map((id: string) => parseInt(id)),
        ),
      );

    // Get unique user IDs
    const uniqueUserIds = [...new Set(usersInRoles.map((ur) => ur.user_id))];

    for (const targetUserId of uniqueUserIds) {
      // Check if permission already exists with same filter
      const existingPerm = await db
        .select()
        .from(DocumentPermission)
        .where(
          and(
            eq(DocumentPermission.document_id, parseInt(documentId)),
            eq(DocumentPermission.user_id, targetUserId),
            filterType
              ? and(
                  eq(DocumentPermission.filter_type, filterType),
                  eq(DocumentPermission.filter_ids, filterIds),
                )
              : undefined,
          ),
        )
        .limit(1);

      if (existingPerm.length === 0) {
        const result = await db.insert(DocumentPermission).values({
          document_id: parseInt(documentId),
          user_id: targetUserId,
          permission_type: permissionType || "VIEW",
          shared_by: userId,
          shared_with: "role",
          filter_type: filterType || null,
          filter_ids: filterIds || null,
          academic_term_id: academicTermId ? parseInt(academicTermId) : null,
          expires_at: expiresAt ? new Date(expiresAt) : null,
        });

        const permId = result[0].insertId;
        const perm = await db
          .select()
          .from(DocumentPermission)
          .where(eq(DocumentPermission.permission_id, permId))
          .limit(1);

        // Find which roles this user was shared with
        const userRoles = usersInRoles
          .filter((ur) => ur.user_id === targetUserId)
          .map((ur) => ur.role_id);

        permissions.push({
          ...perm[0],
          shared_with: "role",
          target_id: userRoles,
          role_ids: roleIds,
        });
      }
    }
  }

  logger.info(
    `Document ${documentId} shared with users/roles by user ${userId}`,
  );

  const newlyGrantedUserIds = [
    ...new Set(permissions.map((p: any) => p.user_id).filter(Boolean)),
  ] as number[];
  if (newlyGrantedUserIds.length > 0) {
    await notifyUsers(newlyGrantedUserIds, {
      kind: "document_shared",
      title: `${document[0].original_name} was shared with you`,
      body: `Permission: ${permissionType || "VIEW"}`,
      link: `/documents?doc=${documentId}`,
      subjectType: "document",
      subjectId: parseInt(documentId),
      actorId: userId,
    });
  }

  // Build response with warning if some users were already shared
  const response: any = {
    permissions,
  };

  if (alreadySharedUserIds.length > 0) {
    // Get user details for the already shared users
    const alreadySharedUsers = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        email: User.email,
      })
      .from(User)
      .where(inArray(User.user_id, alreadySharedUserIds));

    response.alreadyShared = alreadySharedUsers;
    response.message = `Some users were already shared. ${alreadySharedUsers.map((u: any) => u.username || u.email || u.user_id).join(", ")} already have access.`;
  }

  successResponse(
    res,
    alreadySharedUserIds.length > 0
      ? "Some users were already shared"
      : "Document shared successfully",
    response,
  );
});

export const getSharedDocuments = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { academicYearId } = req.query;
  const yearId =
    academicYearId && !isNaN(Number(academicYearId))
      ? parseInt(academicYearId as string)
      : null;

  // Every DocumentPermission row for this user — both direct "user" shares
  // and expanded "role" shares (one row per role member, created at share
  // time). Filter matching below applies uniformly to all of them: rows with
  // no filter_type/filter_ids always pass, so this doesn't change behavior
  // for direct user shares, only for filter-scoped role shares.
  const allPerms = await db
    .select({
      document: Document,
      permission: DocumentPermission,
      shared_by_user: {
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      },
    })
    .from(DocumentPermission)
    .innerJoin(
      Document,
      eq(DocumentPermission.document_id, Document.document_id),
    )
    .innerJoin(User, eq(DocumentPermission.shared_by, User.user_id))
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(
      and(
        eq(DocumentPermission.user_id, userId),
        or(
          isNull(DocumentPermission.expires_at),
          gt(DocumentPermission.expires_at, new Date()),
        ),
        yearId !== null ? eq(Document.academic_year_id, yearId) : undefined,
      ),
    );

  const associations = await getUserFilterAssociations(userId);
  const matchingPerms = allPerms.filter((perm) =>
    permissionMatchesFilter(
      perm.permission.filter_type,
      perm.permission.filter_ids,
      associations,
    ),
  );

  // Remove duplicates based on document_id
  const uniqueDocs = new Map();
  for (const item of matchingPerms) {
    if (!uniqueDocs.has(item.document.document_id)) {
      uniqueDocs.set(item.document.document_id, item);
    }
  }

  const shared = Array.from(uniqueDocs.values());

  successResponse(res, "Shared documents retrieved successfully", shared);
});

// Update an existing document permission's level/expiry in place (used by
// the Share modal's inline per-person permission editor).
export const updateDocumentPermission = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const { permissionId } = req.params;
    const { permissionType, expiresAt } = req.body;

    const validTypes = ["VIEW", "EDIT", "DOWNLOAD", "SHARE"];
    if (permissionType && !validTypes.includes(permissionType)) {
      throw new ValidationError(
        `Invalid permission type. Must be one of: ${validTypes.join(", ")}`,
      );
    }

    const [existingPerm] = await db
      .select()
      .from(DocumentPermission)
      .where(eq(DocumentPermission.permission_id, parseInt(permissionId)))
      .limit(1);
    if (!existingPerm) throw new NotFoundError("Permission not found");

    const [document] = await db
      .select()
      .from(Document)
      .where(eq(Document.document_id, existingPerm.document_id))
      .limit(1);
    const isDocumentOwner = document && document.user_id === userId;
    if (!isDocumentOwner && existingPerm.shared_by !== userId) {
      throw new AuthorizationError(
        "You do not have permission to modify this share",
      );
    }

    const updateData: any = {};
    if (permissionType) updateData.permission_type = permissionType;
    if (expiresAt !== undefined) {
      updateData.expires_at = expiresAt ? new Date(expiresAt) : null;
    }

    await db
      .update(DocumentPermission)
      .set(updateData)
      .where(eq(DocumentPermission.permission_id, parseInt(permissionId)));

    const [updated] = await db
      .select()
      .from(DocumentPermission)
      .where(eq(DocumentPermission.permission_id, parseInt(permissionId)))
      .limit(1);

    successResponse(res, "Permission updated successfully", updated);
  },
);

export const revokeDocumentAccess = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { permissionId } = req.params;

  // Check if permission exists first
  const existingPerm = await db
    .select()
    .from(DocumentPermission)
    .where(eq(DocumentPermission.permission_id, parseInt(permissionId)))
    .limit(1);

  if (existingPerm.length === 0) {
    throw new NotFoundError("Permission not found");
  }

  // Check if user is SUPER_ADMIN or the document owner
  const userRoles = await db
    .select({
      role_id: Role.role_id,
      name: Role.name,
    })
    .from(UserRole)
    .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
    .where(eq(UserRole.user_id, userId));

  const isSuperAdmin = userRoles.some((r) => r.name === "SUPER_ADMIN");

  // Get the document to check ownership
  const document = await db
    .select()
    .from(Document)
    .where(eq(Document.document_id, existingPerm[0].document_id))
    .limit(1);

  const isDocumentOwner = document.length > 0 && document[0].user_id === userId;

  // Check if user is the one who shared it, SUPER_ADMIN, or document owner
  const conditions = [
    eq(DocumentPermission.permission_id, parseInt(permissionId)),
  ];

  if (!isSuperAdmin && !isDocumentOwner) {
    conditions.push(eq(DocumentPermission.shared_by, userId));
  }

  const permission = await db
    .select()
    .from(DocumentPermission)
    .where(and(...conditions))
    .limit(1);

  if (permission.length === 0) {
    // Same message as the "doesn't exist" case above — don't let the response
    // distinguish "not yours" from "doesn't exist" to an ID-guessing caller.
    throw new NotFoundError("Permission not found");
  }

  await db
    .delete(DocumentPermission)
    .where(eq(DocumentPermission.permission_id, parseInt(permissionId)));

  logger.info(`Document permission ${permissionId} revoked by user ${userId}`);

  await notifyUsers([permission[0].user_id], {
    kind: "permission_revoked",
    title: `${document[0].original_name}: your access was removed`,
    link: "/documents",
    subjectType: "document",
    subjectId: permission[0].document_id,
    actorId: userId,
  });

  successResponse(res, "Access revoked successfully", null);
});

// ======================
// LINK SHARING (authenticated-only "anyone with the link")
//
// A DocumentShareLink is a bearer token scoped to exactly one document or
// folder. Unlike DocumentPermission/FolderPermission it isn't tied to a
// specific recipient — anyone signed in to this MIS who has the link can
// use it — but it never bypasses login, and access is only granted through
// the dedicated /shared-link/:token endpoints below, never implicitly via
// resolveDocumentAccess/resolveFolderAccess (which would otherwise leak
// link-gated items to anyone who can guess an id).
// ======================

const generateShareToken = () => {
  // 32 bytes -> 64 hex chars, matches DocumentShareLink.token's VARCHAR(64).
  return require("crypto").randomBytes(32).toString("hex");
};

export const getDocumentShareLink = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const documentId = parseInt(req.params.documentId);

    const [doc] = await db
      .select()
      .from(Document)
      .where(
        and(eq(Document.document_id, documentId), eq(Document.user_id, userId)),
      )
      .limit(1);
    if (!doc) throw new NotFoundError("Document not found");

    const [link] = await db
      .select()
      .from(DocumentShareLink)
      .where(
        and(
          eq(DocumentShareLink.document_id, documentId),
          isNull(DocumentShareLink.revoked_at),
        ),
      )
      .orderBy(desc(DocumentShareLink.link_id))
      .limit(1);

    successResponse(res, "Share link retrieved successfully", link || null);
  },
);

export const createDocumentShareLink = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const documentId = parseInt(req.params.documentId);
    const { permissionType, expiresAt } = req.body;

    if (permissionType && !["VIEW", "DOWNLOAD"].includes(permissionType)) {
      throw new ValidationError(
        "Link permission must be VIEW or DOWNLOAD",
      );
    }

    const [doc] = await db
      .select()
      .from(Document)
      .where(
        and(eq(Document.document_id, documentId), eq(Document.user_id, userId)),
      )
      .limit(1);
    if (!doc) throw new NotFoundError("Document not found");

    // Rotating: revoke any existing active link before minting a new one.
    await db
      .update(DocumentShareLink)
      .set({ revoked_at: sql`CURRENT_TIMESTAMP` })
      .where(
        and(
          eq(DocumentShareLink.document_id, documentId),
          isNull(DocumentShareLink.revoked_at),
        ),
      );

    const token = generateShareToken();
    await db.insert(DocumentShareLink).values({
      document_id: documentId,
      token,
      permission_type: permissionType || "VIEW",
      created_by: userId,
      expires_at: expiresAt ? new Date(expiresAt) : null,
    });

    const [link] = await db
      .select()
      .from(DocumentShareLink)
      .where(eq(DocumentShareLink.token, token))
      .limit(1);

    successResponse(res, "Share link created successfully", link);
  },
);

export const revokeDocumentShareLink = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const documentId = parseInt(req.params.documentId);

    const [doc] = await db
      .select()
      .from(Document)
      .where(
        and(eq(Document.document_id, documentId), eq(Document.user_id, userId)),
      )
      .limit(1);
    if (!doc) throw new NotFoundError("Document not found");

    await db
      .update(DocumentShareLink)
      .set({ revoked_at: sql`CURRENT_TIMESTAMP` })
      .where(
        and(
          eq(DocumentShareLink.document_id, documentId),
          isNull(DocumentShareLink.revoked_at),
        ),
      );

    successResponse(res, "Share link revoked successfully", null);
  },
);

export const getFolderShareLink = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const folderId = parseInt(req.params.folderId);

  const [folder] = await db
    .select()
    .from(DocumentFolder)
    .where(
      and(
        eq(DocumentFolder.folder_id, folderId),
        eq(DocumentFolder.user_id, userId),
      ),
    )
    .limit(1);
  if (!folder) throw new NotFoundError("Folder not found");

  const [link] = await db
    .select()
    .from(DocumentShareLink)
    .where(
      and(
        eq(DocumentShareLink.folder_id, folderId),
        isNull(DocumentShareLink.revoked_at),
      ),
    )
    .orderBy(desc(DocumentShareLink.link_id))
    .limit(1);

  successResponse(res, "Share link retrieved successfully", link || null);
});

export const createFolderShareLink = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const folderId = parseInt(req.params.folderId);
    const { permissionType, expiresAt } = req.body;

    if (permissionType && !["VIEW", "DOWNLOAD"].includes(permissionType)) {
      throw new ValidationError("Link permission must be VIEW or DOWNLOAD");
    }

    const [folder] = await db
      .select()
      .from(DocumentFolder)
      .where(
        and(
          eq(DocumentFolder.folder_id, folderId),
          eq(DocumentFolder.user_id, userId),
        ),
      )
      .limit(1);
    if (!folder) throw new NotFoundError("Folder not found");

    await db
      .update(DocumentShareLink)
      .set({ revoked_at: sql`CURRENT_TIMESTAMP` })
      .where(
        and(
          eq(DocumentShareLink.folder_id, folderId),
          isNull(DocumentShareLink.revoked_at),
        ),
      );

    const token = generateShareToken();
    await db.insert(DocumentShareLink).values({
      folder_id: folderId,
      token,
      permission_type: permissionType || "VIEW",
      created_by: userId,
      expires_at: expiresAt ? new Date(expiresAt) : null,
    });

    const [link] = await db
      .select()
      .from(DocumentShareLink)
      .where(eq(DocumentShareLink.token, token))
      .limit(1);

    successResponse(res, "Share link created successfully", link);
  },
);

export const revokeFolderShareLink = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const folderId = parseInt(req.params.folderId);

    const [folder] = await db
      .select()
      .from(DocumentFolder)
      .where(
        and(
          eq(DocumentFolder.folder_id, folderId),
          eq(DocumentFolder.user_id, userId),
        ),
      )
      .limit(1);
    if (!folder) throw new NotFoundError("Folder not found");

    await db
      .update(DocumentShareLink)
      .set({ revoked_at: sql`CURRENT_TIMESTAMP` })
      .where(
        and(
          eq(DocumentShareLink.folder_id, folderId),
          isNull(DocumentShareLink.revoked_at),
        ),
      );

    successResponse(res, "Share link revoked successfully", null);
  },
);

async function resolveActiveShareLink(token: string) {
  const [link] = await db
    .select()
    .from(DocumentShareLink)
    .where(eq(DocumentShareLink.token, token))
    .limit(1);

  if (!link) return null;
  if (link.revoked_at) return null;
  if (link.expires_at && new Date(link.expires_at) < new Date()) return null;
  return link;
}

// Resolve a share link for the signed-in caller (still requires login — see
// header comment above). Returns the target document/folder plus, for a
// folder link, the documents inside it.
export const resolveShareLink = asyncHandler(async (req: any, res: any) => {
  const { token } = req.params;

  const link = await resolveActiveShareLink(token);
  if (!link) {
    throw new NotFoundError("This link is invalid, expired, or was revoked");
  }

  if (link.document_id) {
    const [doc] = await db
      .select()
      .from(Document)
      .where(eq(Document.document_id, link.document_id))
      .limit(1);
    if (!doc) throw new NotFoundError("This link is invalid, expired, or was revoked");

    successResponse(res, "Link resolved successfully", {
      kind: "document",
      permissionType: link.permission_type,
      document: doc,
    });
    return;
  }

  const [folder] = await db
    .select()
    .from(DocumentFolder)
    .where(eq(DocumentFolder.folder_id, link.folder_id!))
    .limit(1);
  if (!folder) throw new NotFoundError("This link is invalid, expired, or was revoked");

  const documents = await db
    .select()
    .from(Document)
    .where(eq(Document.folder_id, link.folder_id!));

  successResponse(res, "Link resolved successfully", {
    kind: "folder",
    permissionType: link.permission_type,
    folder,
    documents,
  });
});

// Download a file through a share link. For a document link, documentId is
// optional and must match the link's own document; for a folder link it
// selects which file inside the folder to download. Requires the link's
// permission to be DOWNLOAD (a VIEW-only link intentionally can't be used
// to pull the raw file).
export const downloadViaShareLink = asyncHandler(
  async (req: any, res: any) => {
    const { token } = req.params;
    const documentId = req.params.documentId
      ? parseInt(req.params.documentId)
      : null;

    const link = await resolveActiveShareLink(token);
    if (!link) {
      throw new NotFoundError("This link is invalid, expired, or was revoked");
    }
    if (link.permission_type !== "DOWNLOAD") {
      throw new AuthorizationError(
        "This link only grants view access, not download",
      );
    }

    let targetDocumentId: number;
    if (link.document_id) {
      targetDocumentId = link.document_id;
    } else if (documentId) {
      const [belongs] = await db
        .select({ document_id: Document.document_id })
        .from(Document)
        .where(
          and(
            eq(Document.document_id, documentId),
            eq(Document.folder_id, link.folder_id!),
          ),
        )
        .limit(1);
      if (!belongs) throw new NotFoundError("Document not found in this folder");
      targetDocumentId = documentId;
    } else {
      throw new ValidationError("documentId is required for a folder link");
    }

    const [doc] = await db
      .select()
      .from(Document)
      .where(eq(Document.document_id, targetDocumentId))
      .limit(1);
    if (!doc) throw new NotFoundError("Document not found");

    const exists = await storageService.fileExists(doc.file_path);
    if (!exists) throw new NotFoundError("File not found on server");

    const buffer = await storageService.downloadToBuffer(doc.file_path);
    const mime =
      doc.file_extension?.toLowerCase() === "pdf"
        ? "application/pdf"
        : doc.mime_type || "application/octet-stream";

    res.setHeader("Content-Type", mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${doc.original_name}"`,
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  },
);

// Get folder tree for Quick Access
export const getFolderTree = asyncHandler(async (req: any, res: any) => {
  try {
    // Validate user authentication
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const rawUserId = req.user.userId;
    const userId = Number(rawUserId);

    // Validate userId
    if (
      !rawUserId ||
      isNaN(userId) ||
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID: must be a positive integer",
      });
    }

    // Ensure userId is valid before query
    if (isNaN(userId)) {
      throw new ValidationError("Invalid user ID");
    }

    const { academicYearId } = req.query;
    const yearId =
      academicYearId && !isNaN(Number(academicYearId))
        ? parseInt(academicYearId as string)
        : null;

    // Fetch folders from database using raw SQL to avoid NaN issues
    const result = await db.execute(sql`
      SELECT folder_id, user_id, parent_folder_id, academic_year_id, name, description, color, created_at, updated_at
      FROM DocumentFolder
      WHERE user_id = ${userId}
      ORDER BY name ASC
    `);
    const folders = (result as any)[0];

    // Build tree structure
    const buildTree = (items: any[], parentId: number | null = null): any[] => {
      return items
        .filter((item) => item.parent_folder_id === parentId)
        .map((child) => ({
          ...child,
          children: buildTree(items, child.folder_id),
        }));
    };

    // Only scope root folders by academic year — nested folders inherit
    // their root ancestor's year context, mirroring getFolders navigation.
    const rootFolders =
      yearId !== null
        ? folders.filter(
            (f: any) =>
              f.parent_folder_id === null && f.academic_year_id === yearId,
          )
        : folders.filter((f: any) => f.parent_folder_id === null);

    const tree = rootFolders.map((root: any) => ({
      ...root,
      children: buildTree(folders, root.folder_id),
    }));

    successResponse(res, "Folder tree retrieved successfully", tree);
  } catch (error: any) {
    logger.error("Error retrieving folder tree:", error);

    // Handle specific database errors
    if (
      error.code === "ER_BAD_FIELD_ERROR" ||
      error.message.includes("Unknown column")
    ) {
      throw new ValidationError(
        "Invalid query parameters or database schema issue",
      );
    }

    // Handle connection errors
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      throw new ValidationError("Database connection failed");
    }

    // Default internal server error
    throw new ValidationError("Failed to retrieve folder tree");
  }
});

// ======================
// HELPER FUNCTIONS
// ======================

async function checkDocumentPermission(
  documentId: number,
  userId: number,
  requiredPermission: "VIEW" | "EDIT" | "DOWNLOAD" | "SHARE",
): Promise<boolean> {
  const permission = await db
    .select()
    .from(DocumentPermission)
    .where(
      and(
        eq(DocumentPermission.document_id, documentId),
        eq(DocumentPermission.user_id, userId),
        eq(DocumentPermission.permission_type, requiredPermission),
      ),
    )
    .limit(1);

  return permission.length > 0;
}
