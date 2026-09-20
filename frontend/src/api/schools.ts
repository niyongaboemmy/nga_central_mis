import api, { API_BASE_URL } from "../services/api";

export interface School {
  school_id: number;
  name: string;
  school_code?: string;
  address?: string;
  contact_email?: string;
  contact_phone?: string;
  logo?: string;
  partner_logo?: string;
  // Dedicated logo for reports/documents (e.g. the Scheme of Work PDF's running header on every
  // page) -- distinct from logo/partner_logo, which are the two cover-page slots.
  documents_logo?: string;
  // Scheme of Work PDF cover-page fields, shared by every scheme this school produces.
  sector?: string;
  trade?: string;
  qualification_title?: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  created_at?: string;
  updated_at?: string;
}

export type SchoolLogoSlot = "primary" | "partner" | "documents";

/** Public, unauthenticated image URL for a school's logo -- safe to use directly in <img src>.
 * Appends a cache-busting param since a re-upload keeps the same URL shape otherwise. */
export const getSchoolLogoUrl = (
  schoolId: number,
  slot: SchoolLogoSlot = "primary",
  cacheBust?: string | number,
): string =>
  `${API_BASE_URL}/schools/${schoolId}/logo/${slot}${cacheBust ? `?t=${cacheBust}` : ""}`;

export const uploadSchoolLogo = async (
  schoolId: number,
  file: File,
  slot: SchoolLogoSlot = "primary",
): Promise<void> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("slot", slot);
  await api.post(`/schools/${schoolId}/logo`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

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
