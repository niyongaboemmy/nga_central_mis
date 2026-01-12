import api from "../services/api";

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

export interface UserWithProfile {
  user: User;
  profile: UserProfile | null;
  roles?: UserRole[];
  permissions?: string[];
  forcePasswordChange?: boolean;
}

export interface UserRole {
  role_id: number;
  name: string;
  description?: string;
  status: "ACTIVE" | "DISABLED";
  permissions?: Permission[];
}

export const getUsers = async (
  onSuccess?: (users: UserWithProfile[]) => void,
  onError?: (error: any) => void
): Promise<UserWithProfile[] | void> => {
  try {
    const response = await api.get<BackendResponse<UserWithProfile[]>>(
      "/users"
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

export const getCurrentUser = async (
  onSuccess?: (user: UserWithProfile) => void,
  onError?: (error: any) => void
): Promise<UserWithProfile | void> => {
  try {
    const response = await api.get<BackendResponse<UserWithProfile>>(
      "/users/me"
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

export const getUser = async (
  id: number,
  onSuccess?: (user: UserWithProfile) => void,
  onError?: (error: any) => void
): Promise<UserWithProfile | void> => {
  try {
    const response = await api.get<BackendResponse<UserWithProfile>>(
      `/users/${id}`
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
  onError?: (error: any) => void
): Promise<UserProfile | void> => {
  try {
    const response = await api.put<BackendResponse<UserProfile>>(
      "/users/me/profile",
      profileData
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
  onError?: (error: any) => void
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
  roleId?: number
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
  onError?: (error: any) => void
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
  onError?: (error: any) => void
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
  onError?: (error: any) => void
): Promise<Role[] | void> => {
  try {
    const params = status ? { status } : {};
    const response = await api.get<BackendResponse<Role[]>>(
      "/permissions/roles",
      { params }
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
  onError?: (error: any) => void
): Promise<UserRole[] | void> => {
  try {
    const response = await api.get<BackendResponse<UserRole[]>>(
      `/users/${userId}/roles`
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
  onError?: (error: any) => void
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
  onError?: (error: any) => void
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
  onError?: (error: any) => void
): Promise<Role | void> => {
  try {
    const response = await api.get<BackendResponse<Role>>(
      `/permissions/roles/${id}`
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
  onError?: (error: any) => void
): Promise<Role | void> => {
  try {
    const response = await api.post<BackendResponse<Role>>(
      "/permissions/roles",
      data
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
  onError?: (error: any) => void
): Promise<Role | void> => {
  try {
    const response = await api.put<BackendResponse<Role>>(
      `/permissions/roles/${id}`,
      data
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
  onError?: (error: any) => void
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
  onError?: (error: any) => void
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
  onError?: (error: any) => void
): Promise<Permission[] | void> => {
  try {
    const params = status ? { status } : {};
    const response = await api.get<BackendResponse<Permission[]>>(
      "/permissions/permissions",
      { params }
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
  onError?: (error: any) => void
): Promise<Permission | void> => {
  try {
    const response = await api.get<BackendResponse<Permission>>(
      `/permissions/permissions/${id}`
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
  onError?: (error: any) => void
): Promise<Permission | void> => {
  try {
    const response = await api.post<BackendResponse<Permission>>(
      "/permissions/permissions",
      data
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
  onError?: (error: any) => void
): Promise<Permission | void> => {
  try {
    const response = await api.put<BackendResponse<Permission>>(
      `/permissions/permissions/${id}`,
      data
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
  onError?: (error: any) => void
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
  onError?: (error: any) => void
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
  onError?: (error: any) => void
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
  onError?: (error: any) => void
): Promise<Permission[] | void> => {
  try {
    const response = await api.get<BackendResponse<Permission[]>>(
      `/permissions/roles/${roleId}/permissions`
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
