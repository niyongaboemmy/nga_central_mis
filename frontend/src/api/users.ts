import api from "../services/api";
import { System } from "./systems";

// Backend response wrapper
interface BackendResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

export interface User {
  user_id: number;
  username: string;
  email: string;
  phone_number?: string;
  status: string;
  created_at: string;
  updated_at: string;
  roles?: number[];
  preferred_theme?: "light" | "dark";
}

export interface UserProfile {
  profile_id: number;
  user_id: number;
  first_name?: string;
  last_name?: string;
  gender?: string;
  date_of_birth?: string;
  address?: string;
  user_type?: string;
  external_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AcademicYear {
  academic_year_id: number;
  name: string;
  start_date?: string;
  end_date?: string;
  is_current?: number;
}

export interface AcademicTerm {
  academic_term_id: number;
  academic_year_id: number;
  name?: string;
  start_date?: string;
  end_date?: string;
  is_current?: number;
}

export interface Grade {
  grade_id: number;
  name: string;
  level_order: number;
  program_id: number;
  program_name: string;
}

export interface UserWithProfile {
  user: User;
  profile: UserProfile | null;
  roles?: UserRole[];
  permissions?: string[];
  assignedPrograms?: Program[];
  assignedGrades?: UserGrade[];
  forcePasswordChange?: boolean;
  academicYears?: AcademicYear[];
  currentAcademicYear?: AcademicYear | null;
  currentAcademicTerms?: AcademicTerm[];
  allPrograms?: Program[];
  allGrades?: Grade[];
  systems?: System[];
}

export interface Program {
  program_id: number;
  name: string;
  description?: string;
}

export interface UserRole {
  role_id: number;
  name: string;
  description?: string;
  status: "ACTIVE" | "DISABLED";
  permissions?: Permission[];
}

// ==================== User Types (for user_type-based filters) ====================

export const getUserTypes = async (
  onSuccess?: (types: string[]) => void,
  onError?: (error: any) => void,
): Promise<string[] | void> => {
  try {
    const response = await api.get<BackendResponse<string[]>>("/users/types");
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const getUsers = async (
  params?: {
    userRole?: string;
    page?: number;
    limit?: number;
    search?: string;
  },
  onSuccess?: (users: UserWithProfile[]) => void,
  onError?: (error: any) => void,
): Promise<UserWithProfile[] | void> => {
  try {
    const response = await api.get<BackendResponse<UserWithProfile[]>>(
      "/users",
      { params },
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const getUsersByRole = async (
  userRole: string,
  page: number = 1,
  limit: number = 10,
  onSuccess?: (users: UserWithProfile[]) => void,
  onError?: (error: any) => void,
): Promise<UserWithProfile[] | void> => {
  try {
    const response = await api.get<BackendResponse<UserWithProfile[]>>(
      "/users",
      {
        params: { userRole, page, limit },
      },
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const getUsersWithPagination = async (
  page: number = 1,
  limit: number = 10,
  userRole?: string,
  searchTerm?: string,
  status?: string,
  onSuccess?: (users: {
    users: UserWithProfile[];
    total: number;
    page: number;
    totalPages: number;
  }) => void,
  onError?: (error: any) => void,
): Promise<{
  users: UserWithProfile[];
  total: number;
  page: number;
  totalPages: number;
} | void> => {
  try {
    const params: any = { page, limit };
    if (userRole) params.userRole = userRole;
    if (searchTerm) params.search = searchTerm;
    if (status) params.status = status;

    const response = await api.get<BackendResponse<UserWithProfile[]>>(
      "/users",
      { params },
    );

    const total = parseInt(response.headers["x-total-count"] || "0");
    const totalPages = Math.ceil(total / limit);

    const result = {
      users: response.data.data || [],
      total,
      page,
      totalPages,
    };

    if (onSuccess) {
      onSuccess(result);
    }
    return result;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

// ==================== User Activity API ====================

export interface Activity {
  id: number;
  user_id: number;
  action_type: string;
  description: string;
  entity_type?: string;
  entity_id?: number;
  metadata?: string;
  actor_first_name?: string;
  actor_last_name?: string;
  actor_role?: string;
  created_at: string;
}

export interface ActivityResponse {
  activities: Activity[];
  pagination: {
    total: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
}

export const getUserActivities = async (
  userId: number,
  params?: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  },
  onSuccess?: (data: ActivityResponse) => void,
  onError?: (error: any) => void,
): Promise<ActivityResponse | void> => {
  try {
    const response = await api.get<BackendResponse<ActivityResponse>>(
      `/users/${userId}/activities`,
      { params },
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

// ==================== Grade Assignment for Class Teachers ====================

export interface UserGrade {
  grade_id: number;
  name: string;
  level_order: number;
  program_id: number;
  program_name: string;
  class_group_id: number;
  class_group_name: string;
  academic_year_id: number;
  academic_year_name: string;
  academic_year_is_current: number;
  assigned_at: string;
}

export const getUserGrades = async (
  userId: number,
  onSuccess?: (grades: UserGrade[]) => void,
  onError?: (error: any) => void,
): Promise<UserGrade[] | void> => {
  try {
    const response = await api.get<BackendResponse<UserGrade[]>>(
      `/users/${userId}/grades`,
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const assignGradeToUser = async (
  userId: number,
  gradeId: number,
  classGroupId: number,
  academicYearId: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.post(`/users/${userId}/grades`, {
      grade_id: gradeId,
      class_group_id: classGroupId,
      academic_year_id: academicYearId,
    });
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const removeGradeFromUser = async (
  userId: number,
  gradeId: number,
  classGroupId: number,
  academicYearId: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.delete(
      `/users/${userId}/grades/${gradeId}/class-groups/${classGroupId}/years/${academicYearId}`,
    );
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

// Edit an existing class-teacher assignment. Every field of the assignment is
// part of its key, so the current values address the row and the body carries
// the new ones.
export const updateGradeAssignment = async (
  current: {
    userId: number;
    gradeId: number;
    classGroupId: number;
    academicYearId: number;
  },
  next: {
    user_id: number;
    grade_id: number;
    class_group_id: number;
    academic_year_id: number;
  },
): Promise<void> => {
  await api.put(
    `/users/${current.userId}/grades/${current.gradeId}/class-groups/${current.classGroupId}/years/${current.academicYearId}`,
    next,
  );
};

export interface AllGradeAssignment {
  grade_assignment_id: string;
  user_id: number;
  user_name: string;
  username: string;
  email: string;
  grade_id: number;
  grade_name: string;
  class_group_id: number;
  class_group_name: string;
  program_name: string;
  academic_year_id: number;
  academic_year_name: string;
  academic_year_is_current: number;
  assigned_at: string;
}

export const getAllGradeAssignments = async (
  academicYearId?: number,
  onSuccess?: (assignments: AllGradeAssignment[]) => void,
  onError?: (error: any) => void,
): Promise<AllGradeAssignment[] | void> => {
  try {
    const response = await api.get<BackendResponse<AllGradeAssignment[]>>(
      "/users/grade-assignments",
      { params: academicYearId ? { academic_year_id: academicYearId } : undefined },
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const copyGradeAssignments = async (
  sourceAcademicYearId: number,
  targetAcademicYearId: number,
): Promise<{ copied: number; skipped: number; total: number }> => {
  const response = await api.post<
    BackendResponse<{ copied: number; skipped: number; total: number }>
  >("/users/grade-assignments/copy", {
    source_academic_year_id: sourceAcademicYearId,
    target_academic_year_id: targetAcademicYearId,
  });
  return response.data.data as {
    copied: number;
    skipped: number;
    total: number;
  };
};

export interface GradeUser {
  user_id: number;
  username: string;
  email: string;
  phone_number?: string;
  status: string;
  first_name?: string;
  last_name?: string;
  user_type?: string;
  role_name?: string;
}

export const getUsersByGrade = async (
  gradeId: number,
  params?: {
    page?: number;
    limit?: number;
    search?: string;
  },
  onSuccess?: (users: {
    users: GradeUser[];
    total: number;
    page: number;
    totalPages: number;
  }) => void,
  onError?: (error: any) => void,
): Promise<{
  users: GradeUser[];
  total: number;
  page: number;
  totalPages: number;
} | void> => {
  try {
    const response = await api.get<BackendResponse<GradeUser[]>>(
      `/users/grades/${gradeId}/users`,
      { params },
    );

    const total = parseInt(response.headers["x-total-count"] || "0");
    const totalPages = Math.ceil(total / (params?.limit || 10));

    const result = {
      users: response.data.data || [],
      total,
      page: params?.page || 1,
      totalPages,
    };

    if (onSuccess) {
      onSuccess(result);
    }
    return result;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export interface GradeSubject {
  subject_id: number;
  code?: string;
  name: string;
  description?: string;
  status: string;
  teachers?: Array<{
    user_id: number;
    username: string;
    first_name?: string;
    last_name?: string;
  }>;
}

export const getSubjectsByGrade = async (
  gradeId: number,
  params?: {
    page?: number;
    limit?: number;
    search?: string;
  },
  onSuccess?: (subjects: {
    subjects: GradeSubject[];
    total: number;
    page: number;
    totalPages: number;
  }) => void,
  onError?: (error: any) => void,
): Promise<{
  subjects: GradeSubject[];
  total: number;
  page: number;
  totalPages: number;
} | void> => {
  try {
    const response = await api.get<BackendResponse<GradeSubject[]>>(
      `/users/grades/${gradeId}/subjects`,
      { params },
    );

    const total = parseInt(response.headers["x-total-count"] || "0");
    const totalPages = Math.ceil(total / (params?.limit || 10));

    const result = {
      subjects: response.data.data || [],
      total,
      page: params?.page || 1,
      totalPages,
    };

    if (onSuccess) {
      onSuccess(result);
    }
    return result;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

// ==================== Grade/Program-Scoped Reads ====================
//
// A class teacher (assignedGrades) or program lead (assignedPrograms) sees a
// slice of the school. These endpoints answer for the caller's *whole* scope in
// one request; the pages used to loop one request per assigned grade and merge
// client-side, which broke server-side pagination and hid the duplicate-row
// fan-outs the backend now collapses.

export interface ScopedTeacher {
  user_id: number;
  username: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export interface ScopedSubject {
  subject_id: number;
  code?: string | null;
  name: string;
  description?: string | null;
  status: string;
  color?: string | null;
  teachers: ScopedTeacher[];
  grades: { grade_id: number; name: string | null }[];
  class_groups: { class_group_id: number; name: string | null }[];
}

export interface SubjectDetail {
  subject: {
    subject_id: number;
    code?: string | null;
    name: string;
    description?: string | null;
    status: string;
    color?: string | null;
    max_marks?: number | null;
    category_name?: string | null;
  };
  classGroups: {
    class_group_id: number;
    name: string;
    grade_id?: number | null;
    grade_name?: string | null;
  }[];
  teachers: (ScopedTeacher & {
    email?: string | null;
    phone_number?: string | null;
    class_groups: { class_group_id: number; name: string }[];
  })[];
  students: {
    user_id: number;
    username: string;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    full_name: string;
    status: string;
    class_group_id: number;
    class_group_name?: string | null;
  }[];
  schedule: {
    slot_id: number;
    day_of_week: number;
    start_time: string;
    end_time: string;
    location?: string | null;
    class_group_id?: number | null;
    class_group_name?: string | null;
    teacher_name?: string | null;
  }[];
  schemes: {
    scheme_id: number;
    class_group_id: number;
    class_group_name?: string | null;
    validation_status: "PENDING" | "APPROVED" | "REJECTED";
    term_name?: string | null;
    teacher_name?: string | null;
  }[];
}

export const getScopedSubjectDetail = async (
  subjectId: number,
  query?: Pick<ScopeQuery, "gradeIds" | "academicYearId" | "academicTermId">,
): Promise<SubjectDetail> => {
  const params: Record<string, string | number> = {};
  if (query?.gradeIds && query.gradeIds.length > 0) {
    params.grade_ids = query.gradeIds.join(",");
  }
  if (query?.academicYearId) params.academic_year_id = query.academicYearId;
  // The timetable and the scheme of work are both per-term, so the panel must
  // ask for the term the user currently has selected in the top bar.
  if (query?.academicTermId) params.academic_term_id = query.academicTermId;

  const response = await api.get<BackendResponse<SubjectDetail>>(
    `/users/scope/subjects/${subjectId}`,
    { params },
  );
  return response.data.data as SubjectDetail;
};

export interface ScopedUser {
  user_id: number;
  username: string;
  email: string;
  phone_number?: string | null;
  status: string;
  first_name?: string | null;
  last_name?: string | null;
  user_type?: string | null;
  gender?: string | null;
  roles: { role_id: number; name: string; description?: string | null }[];
  role_name?: string | null;
  grades: { grade_id: number; name: string | null }[];
  class_groups: { class_group_id: number; name: string | null }[];
}

export interface ScopedRoleGroup {
  role_id: number;
  name: string;
  count: number;
}

export interface ScopeQuery {
  gradeIds?: number[];
  academicYearId?: number | null;
  academicTermId?: number | null;
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
}

const scopeParams = (query?: ScopeQuery) => {
  const params: Record<string, string | number> = {
    page: query?.page ?? 1,
    limit: query?.limit ?? 100,
  };
  if (query?.gradeIds && query.gradeIds.length > 0) {
    params.grade_ids = query.gradeIds.join(",");
  }
  if (query?.academicYearId) params.academic_year_id = query.academicYearId;
  if (query?.academicTermId) params.academic_term_id = query.academicTermId;
  if (query?.search) params.search = query.search;
  if (query?.role) params.role = query.role;
  return params;
};

export interface Paged<T> {
  total: number;
  page: number;
  totalPages: number;
  items: T;
}

export const getScopedSubjects = async (
  query?: ScopeQuery,
): Promise<Paged<ScopedSubject[]>> => {
  const params = scopeParams(query);
  const response = await api.get<BackendResponse<ScopedSubject[]>>(
    "/users/scope/subjects",
    { params },
  );
  const total = parseInt(response.headers["x-total-count"] || "0", 10);
  const limit = Number(params.limit) || 100;
  return {
    items: response.data.data || [],
    total,
    page: Number(params.page) || 1,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

export const getScopedUsers = async (
  query?: ScopeQuery,
): Promise<Paged<ScopedUser[]> & { roleGroups: ScopedRoleGroup[] }> => {
  const params = scopeParams(query);
  const response = await api.get<
    BackendResponse<{ users: ScopedUser[]; roleGroups: ScopedRoleGroup[] }>
  >("/users/scope/users", { params });
  const total = parseInt(response.headers["x-total-count"] || "0", 10);
  const limit = Number(params.limit) || 100;
  return {
    items: response.data.data?.users || [],
    roleGroups: response.data.data?.roleGroups || [],
    total,
    page: Number(params.page) || 1,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

export interface ScopedUserSubject {
  subject_id: number;
  name: string;
  code?: string | null;
  class_groups: { class_group_id: number; name: string }[];
}

export interface ScopedUserDetail {
  user: User;
  profile: UserProfile | null;
  roles: UserRole[];
  permissions: string[];
  assignedGrades: {
    grade_id: number;
    name: string;
    program_name?: string | null;
    class_group_id: number;
    class_group_name?: string | null;
  }[];
  classGroups: {
    class_group_id: number;
    name: string;
    grade_id?: number | null;
    grade_name?: string | null;
    program_name?: string | null;
  }[];
  assignedPrograms: { program_id: number; name: string }[];
  subjectsTaught: ScopedUserSubject[];
  subjectsEnrolled: ScopedUserSubject[];
}

export const getScopedUserDetail = async (
  userId: number,
  academicYearId?: number | null,
): Promise<ScopedUserDetail> => {
  const response = await api.get<BackendResponse<ScopedUserDetail>>(
    `/users/scope/users/${userId}`,
    { params: academicYearId ? { academic_year_id: academicYearId } : undefined },
  );
  return response.data.data as ScopedUserDetail;
};

// ==================== User Statistics ====================

export interface UserStatsRole {
  role_id: number;
  name: string;
  description?: string | null;
  status: string;
  total: number;
  active: number;
  disabled: number;
}

export interface UserStats {
  overall: { total: number; active: number; disabled: number };
  roles: UserStatsRole[];
}

/**
 * One request for every count the Users screens need. Previously the same
 * numbers cost `3 + 2 * roles` requests to `/users?page=1&limit=1&userRole=...`.
 */
export const getUserStats = async (search?: string): Promise<UserStats> => {
  const response = await api.get<BackendResponse<UserStats>>("/users/stats", {
    params: search ? { search } : undefined,
  });
  return (
    response.data.data ?? {
      overall: { total: 0, active: 0, disabled: 0 },
      roles: [],
    }
  );
};

export const getCurrentUser = async (
  onSuccess?: (user: UserWithProfile) => void,
  onError?: (error: any) => void,
): Promise<UserWithProfile | void> => {
  try {
    const response =
      await api.get<BackendResponse<UserWithProfile>>("/users/me");
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const getUser = async (
  id: number,
  onSuccess?: (user: UserWithProfile) => void,
  onError?: (error: any) => void,
): Promise<UserWithProfile | void> => {
  try {
    const response = await api.get<BackendResponse<UserWithProfile>>(
      `/users/${id}`,
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export interface UserProgram {
  program_id: number;
  name: string;
  description?: string;
  relationship: string;
  academic_year_id: number;
  academic_year_name: string;
  academic_year_is_current: number;
}

export const getUserPrograms = async (
  userId: number,
  onSuccess?: (programs: UserProgram[]) => void,
  onError?: (error: any) => void,
): Promise<UserProgram[] | void> => {
  try {
    const response = await api.get<BackendResponse<UserProgram[]>>(
      `/users/${userId}/programs`,
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const updateProfile = async (
  profileData: Partial<UserProfile>,
  onSuccess?: (profile: UserProfile) => void,
  onError?: (error: any) => void,
): Promise<UserProfile | void> => {
  try {
    const response = await api.put<BackendResponse<UserProfile>>(
      "/users/me/profile",
      profileData,
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const createUser = async (
  userData: Partial<User> & {
    roles?: number[];
    first_name?: string;
    last_name?: string;
    gender?: string;
    date_of_birth?: string;
    address?: string;
    user_type?: string;
  },
  onSuccess?: (user: User) => void,
  onError?: (error: any) => void,
): Promise<User | void> => {
  try {
    const response = await api.post<BackendResponse<User>>("/users", userData);
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const bulkCreateUsers = async (
  file: File,
  roleId?: number,
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const formData = new FormData();
  formData.append("file", file);
  if (roleId) {
    formData.append("role_id", roleId.toString());
  }

  try {
    const response = await api.post<
      BackendResponse<{
        success: number;
        failed: number;
        errors: string[];
      }>
    >("/users/bulk", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data.data || { success: 0, failed: 0, errors: [] };
  } catch (error: any) {
    throw error;
  }
};

export const downloadUserTemplate = async (): Promise<void> => {
  try {
    const response = await api.get("/users/template", {
      responseType: "blob",
    });

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "user_template.xlsx");
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error: any) {
    throw error;
  }
};

export const updateUser = async (
  id: number,
  userData: Partial<User>,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.put(`/users/${id}`, userData);
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const deleteUser = async (
  id: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.delete(`/users/${id}`);
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const enableUser = async (
  id: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.put(`/users/${id}/enable`);
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const disableUser = async (
  id: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.put(`/users/${id}/disable`);
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

// ==================== Role Types ====================

export interface Role {
  role_id: number;
  name: string;
  description?: string;
  status: "ACTIVE" | "DISABLED";
  permissions?: Permission[];
}

export interface Permission {
  perm_id: number;
  name: string;
  description?: string;
  status: "ACTIVE" | "DISABLED";
}

// ==================== Role API ====================

export const getRoles = async (
  status?: string,
  onSuccess?: (roles: Role[]) => void,
  onError?: (error: any) => void,
): Promise<Role[] | void> => {
  try {
    const params = status ? { status } : {};
    const response = await api.get<BackendResponse<Role[]>>(
      "/permissions/roles",
      { params },
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

// ==================== User Role Management ====================

export const getUserRoles = async (
  userId: number,
  onSuccess?: (roles: UserRole[]) => void,
  onError?: (error: any) => void,
): Promise<UserRole[] | void> => {
  try {
    const response = await api.get<BackendResponse<UserRole[]>>(
      `/users/${userId}/roles`,
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const assignRoleToUser = async (
  userId: number,
  roleId: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.post(`/users/${userId}/roles`, { role_id: roleId });
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const removeRoleFromUser = async (
  userId: number,
  roleId: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.delete(`/users/${userId}/roles/${roleId}`);
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const getRole = async (
  id: number,
  onSuccess?: (role: Role) => void,
  onError?: (error: any) => void,
): Promise<Role | void> => {
  try {
    const response = await api.get<BackendResponse<Role>>(
      `/permissions/roles/${id}`,
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const createRole = async (
  data: { name: string; description?: string },
  onSuccess?: (role: Role) => void,
  onError?: (error: any) => void,
): Promise<Role | void> => {
  try {
    const response = await api.post<BackendResponse<Role>>(
      "/permissions/roles",
      data,
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const updateRole = async (
  id: number,
  data: Partial<{ name: string; description: string; status: string }>,
  onSuccess?: (role: Role) => void,
  onError?: (error: any) => void,
): Promise<Role | void> => {
  try {
    const response = await api.put<BackendResponse<Role>>(
      `/permissions/roles/${id}`,
      data,
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const disableRole = async (
  id: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.put(`/permissions/roles/${id}/disable`);
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const enableRole = async (
  id: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.put(`/permissions/roles/${id}/enable`);
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

// ==================== Permission API ====================

export const getPermissions = async (
  status?: string,
  onSuccess?: (permissions: Permission[]) => void,
  onError?: (error: any) => void,
): Promise<Permission[] | void> => {
  try {
    const params = status ? { status } : {};
    const response = await api.get<BackendResponse<Permission[]>>(
      "/permissions/permissions",
      { params },
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const getPermission = async (
  id: number,
  onSuccess?: (permission: Permission) => void,
  onError?: (error: any) => void,
): Promise<Permission | void> => {
  try {
    const response = await api.get<BackendResponse<Permission>>(
      `/permissions/permissions/${id}`,
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const createPermission = async (
  data: { name: string; description?: string },
  onSuccess?: (permission: Permission) => void,
  onError?: (error: any) => void,
): Promise<Permission | void> => {
  try {
    const response = await api.post<BackendResponse<Permission>>(
      "/permissions/permissions",
      data,
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const updatePermission = async (
  id: number,
  data: Partial<{ name: string; description: string; status: string }>,
  onSuccess?: (permission: Permission) => void,
  onError?: (error: any) => void,
): Promise<Permission | void> => {
  try {
    const response = await api.put<BackendResponse<Permission>>(
      `/permissions/permissions/${id}`,
      data,
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const disablePermission = async (
  id: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.put(`/permissions/permissions/${id}/disable`);
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const enablePermission = async (
  id: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.put(`/permissions/permissions/${id}/enable`);
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

// ==================== Role-Permission Assignment ====================

export const assignPermissionsToRole = async (
  roleId: number,
  permissionIds: number[],
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.post(`/permissions/roles/${roleId}/permissions`, {
      permissionIds,
    });
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const getRolePermissions = async (
  roleId: number,
  onSuccess?: (permissions: Permission[]) => void,
  onError?: (error: any) => void,
): Promise<Permission[] | void> => {
  try {
    const response = await api.get<BackendResponse<Permission[]>>(
      `/permissions/roles/${roleId}/permissions`,
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

// ==================== Program-based User Management ====================

export const getProgramRoles = async (
  programId: number,
  onSuccess?: (roles: Role[]) => void,
  onError?: (error: any) => void,
): Promise<Role[] | void> => {
  try {
    const response = await api.get<BackendResponse<Role[]>>(
      `/users/programs/${programId}/roles`,
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export interface ProgramUser {
  user_id: number;
  username: string;
  email: string;
  phone_number?: string;
  status: string;
  first_name?: string;
  last_name?: string;
  user_type?: string;
}

export const getProgramUsersByRole = async (
  programId: number,
  roleId: number,
  params?: {
    page?: number;
    limit?: number;
    search?: string;
  },
  onSuccess?: (users: {
    users: ProgramUser[];
    total: number;
    page: number;
    totalPages: number;
  }) => void,
  onError?: (error: any) => void,
): Promise<{
  users: ProgramUser[];
  total: number;
  page: number;
  totalPages: number;
} | void> => {
  try {
    const response = await api.get<BackendResponse<ProgramUser[]>>(
      `/users/programs/${programId}/roles/${roleId}/users`,
      { params },
    );

    const total = parseInt(response.headers["x-total-count"] || "0");
    const totalPages = Math.ceil(total / (params?.limit || 10));

    const result = {
      users: response.data.data || [],
      total,
      page: params?.page || 1,
      totalPages,
    };

    if (onSuccess) {
      onSuccess(result);
    }
    return result;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export interface ProgramUserWithRole extends ProgramUser {
  role_name?: string;
}

export const getProgramUsers = async (
  programId: number,
  params?: {
    page?: number;
    limit?: number;
    search?: string;
  },
  onSuccess?: (users: {
    users: ProgramUserWithRole[];
    total: number;
    page: number;
    totalPages: number;
  }) => void,
  onError?: (error: any) => void,
): Promise<{
  users: ProgramUserWithRole[];
  total: number;
  page: number;
  totalPages: number;
} | void> => {
  try {
    const response = await api.get<BackendResponse<ProgramUserWithRole[]>>(
      `/users/programs/${programId}/users`,
      { params },
    );

    const total = parseInt(response.headers["x-total-count"] || "0");
    const totalPages = Math.ceil(total / (params?.limit || 10));

    const result = {
      users: response.data.data || [],
      total,
      page: params?.page || 1,
      totalPages,
    };

    if (onSuccess) {
      onSuccess(result);
    }
    return result;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const updateUserProfile = async (
  userId: number,
  data: Partial<UserProfile>,
) => {
  const response = await api.put<BackendResponse<UserProfile>>(
    `/users/${userId}/profile`,
    data,
  );
  return response.data;
};

// ==================== Parenting API ====================

export interface ParentingRelation {
  parenting_id: number;
  user_id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  relationship: string;
  created_at: string;
  user_type?: string;
}

export const parentingApi = {
  getParents: async (studentId: number) => {
    const response = await api.get<BackendResponse<ParentingRelation[]>>(
      `/parenting/student/${studentId}/parents`,
    );
    return response.data;
  },

  getStudents: async (parentId: number) => {
    const response = await api.get<BackendResponse<ParentingRelation[]>>(
      `/parenting/parent/${parentId}/students`,
    );
    return response.data;
  },

  assign: async (data: {
    student_id: number;
    parent_id: number;
    relationship?: string;
  }) => {
    const response = await api.post<BackendResponse<any>>(
      "/parenting/assign",
      data,
    );
    return response.data;
  },

  remove: async (data: { student_id: number; parent_id: number }) => {
    const response = await api.post<BackendResponse<any>>(
      "/parenting/remove",
      data,
    );
    return response.data;
  },

  search: async (params: {
    query: string;
    excludeIds?: string;
    type?: "parent" | "student";
  }) => {
    const response = await api.get<BackendResponse<User[]>>(
      "/parenting/search",
      { params },
    );
    return response.data;
  },
};

export const updateUserTheme = async (theme: "light" | "dark") => {
  const response = await api.patch<BackendResponse<void>>("/users/me/theme", {
    theme,
  });
  return response.data;
};
