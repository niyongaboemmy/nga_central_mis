import api from "../services/api";

export interface System {
  system_id: number;
  name: string;
  description?: string;
  client_id?: string;
  client_secret?: string;
  allowed_redirect_uris?: string;
  icon_url: string;
  home_url: string;
  status: "ACTIVE" | "DISABLED";
  created_at?: string;
}

export const getSystems = async (
  onSuccess?: (systems: System[]) => void,
  onError?: (error: any) => void,
): Promise<System[] | void> => {
  try {
    const response = await api.get<System[]>("/systems");
    const data = response.data;
    if (onSuccess) onSuccess(data);
    return data;
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};

export const createSystem = async (
  systemData: Partial<System>,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<any> => {
  try {
    const response = await api.post("/systems", systemData);
    if (onSuccess) onSuccess();
    return response.data;
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};

export const updateSystem = async (
  id: number,
  systemData: Partial<System>,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.put(`/systems/${id}`, systemData);
    if (onSuccess) onSuccess();
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};

export const deleteSystem = async (
  id: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.delete(`/systems/${id}`);
    if (onSuccess) onSuccess();
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};

// Assignments support
export const assignSystemToSchool = async (
  schoolId: number,
  systemId: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.post("/systems/assign/school", {
      school_id: schoolId,
      system_id: systemId,
    });
    if (onSuccess) onSuccess();
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};

export const removeSystemFromSchool = async (
  schoolId: number,
  systemId: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.post("/systems/remove/school", {
      school_id: schoolId,
      system_id: systemId,
    });
    if (onSuccess) onSuccess();
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};

export const assignSystemToRoleInSchool = async (
  schoolId: number,
  roleId: number,
  systemId: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.post("/systems/assign/role", {
      school_id: schoolId,
      role_id: roleId,
      system_id: systemId,
    });
    if (onSuccess) onSuccess();
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};

export const getSchoolSystems = async (
  schoolId: number,
  onSuccess?: (systems: System[]) => void,
  onError?: (error: any) => void,
): Promise<System[] | void> => {
  try {
    const response = await api.get<System[]>(`/systems/school/${schoolId}`);
    const data = response.data;
    if (onSuccess) onSuccess(data);
    return data;
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};

export interface RoleAssignment {
  fragment_id: number;
  school_id: number;
  role_id: number;
  system_id: number;
  role_name: string;
  system_name: string;
  assigned_at: string;
}

export const getSchoolRoleAssignments = async (
  schoolId: number,
  onSuccess?: (assignments: RoleAssignment[]) => void,
  onError?: (error: any) => void,
): Promise<RoleAssignment[] | void> => {
  try {
    const response = await api.get<RoleAssignment[]>(
      `/systems/school/${schoolId}/roles`,
    );
    const data = response.data;
    if (onSuccess) onSuccess(data);
    return data;
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};

export const removeSystemFromRoleInSchool = async (
  schoolId: number,
  roleId: number,
  systemId: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.post("/systems/remove/role", {
      school_id: schoolId,
      role_id: roleId,
      system_id: systemId,
    });
    if (onSuccess) onSuccess();
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};

// Logs History Types
export interface ActivityLog {
  activity_id: number;
  user_id: number;
  actor_id: number | null;
  action_type: string;
  description: string;
  entity_type: string | null;
  entity_id: number | null;
  metadata: string | null;
  created_at: string;
}

export interface LogsResponse {
  logs: ActivityLog[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  dateRange: {
    start_date: string;
    end_date: string;
  };
}

export const getLogsHistory = async (
  params?: {
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  },
  onSuccess?: (data: LogsResponse) => void,
  onError?: (error: any) => void,
): Promise<LogsResponse | void> => {
  try {
    const response = await api.get<LogsResponse>("/systems/logs", { params });
    const data = response.data;
    if (onSuccess) onSuccess(data);
    return data;
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};
