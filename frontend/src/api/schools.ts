import api from "../services/api";

export interface School {
  school_id: number;
  name: string;
  school_code?: string;
  address?: string;
  contact_email?: string;
  contact_phone?: string;
  logo?: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  created_at?: string;
  updated_at?: string;
}

export const getSchools = async (
  onSuccess?: (schools: School[]) => void,
  onError?: (error: any) => void,
): Promise<School[] | void> => {
  try {
    const response = await api.get<School[]>("/schools");
    // Note: The backend controller returns the array directly, not wrapped in { data: ... } based on my implementation
    // But let's check standard response wrapper.
    // backend/src/controllers/schoolController.ts: res.status(200).json(schools);
    // So it is NOT wrapped in { data: ... } unlike users.
    // However, I should probably standardise it, but for now I will handle it as is.
    // Wait, users.ts expects { data: ... }.
    // Let's check api.get generic type.

    // If backend returns plain array:
    const data = response.data;
    if (onSuccess) onSuccess(data);
    return data;
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};

export const createSchool = async (
  schoolData: Partial<School>,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.post("/schools", schoolData);
    if (onSuccess) onSuccess();
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};

export const updateSchool = async (
  id: number,
  schoolData: Partial<School>,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.put(`/schools/${id}`, schoolData);
    if (onSuccess) onSuccess();
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};

export const deleteSchool = async (
  id: number,
  onSuccess?: () => void,
  onError?: (error: any) => void,
): Promise<void> => {
  try {
    await api.delete(`/schools/${id}`);
    if (onSuccess) onSuccess();
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }
};
