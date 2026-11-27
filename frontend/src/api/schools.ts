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
  /** Report card identity block (migration 142). */
  district?: string;
  head_teacher_name?: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  created_at?: string;
  updated_at?: string;
  /** Changes with every logo upload (School.updated_at in ms); the logo URL's cache key. */
  logo_version?: number | null;
  /**
   * The address of each logo that is set, built by the server for THIS school.
   * Use these in <img src>: the address names the school, which the public image
   * endpoint needs (school ids repeat across schools).
   */
  logo_urls?: Partial<Record<"primary" | "partner" | "documents", string | null>>;
}

/** Field rules shared with the server (schoolController readSchoolBody). */
export const SCHOOL_LIMITS = {
  name: 150,
  school_code: 20,
  address: 255,
  district: 100,
  contact_email: 150,
  contact_phone: 50,
  sector: 100,
  trade: 150,
  qualification_title: 255,
  head_teacher_name: 150,
} as const;
export type SchoolTextField = keyof typeof SCHOOL_LIMITS;

export function validateSchool(values: Partial<School>): Partial<Record<SchoolTextField, string>> {
  const errors: Partial<Record<SchoolTextField, string>> = {};
  for (const [field, max] of Object.entries(SCHOOL_LIMITS) as [SchoolTextField, number][]) {
    const v = String(values[field] ?? "").trim();
    if (v.length > max) errors[field] = `At most ${max} characters`;
  }
  const name = String(values.name ?? "").trim();
  if (!name) errors.name = "The school needs a name";
  else if (name.length < 2) errors.name = "Too short";
  const code = String(values.school_code ?? "").trim();
  if (code && !/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/.test(code)) errors.school_code = "2-20 letters, digits or dashes";
  const email = String(values.contact_email ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.contact_email = "Doesn't look like an email address";
  const phone = String(values.contact_phone ?? "").trim();
  const digits = phone.replace(/\D/g, "").length;
  if (phone && (!/^\+?[0-9][0-9 ()-]{5,24}$/.test(phone) || digits < 7 || digits > 15)) errors.contact_phone = "Use a phone number such as +250 788 000 000";
  return errors;
}

/** Only the editable text fields and status -- never the logo paths (those change only by upload). */
export function schoolPayload(values: Partial<School>): Partial<School> {
  const out: Record<string, unknown> = {};
  for (const field of Object.keys(SCHOOL_LIMITS)) out[field] = String((values as any)[field] ?? "").trim();
  if (values.status) out.status = values.status;
  return out as Partial<School>;
}

export const LOGO_MAX_BYTES = 5 * 1024 * 1024;

export type SchoolLogoSlot = "primary" | "partner" | "documents";

/**
 * Public, unauthenticated image URL for a school's logo -- safe to use directly in <img src>.
 *
 * `tenant` (the school's slug or number) is required for any school but the
 * first: the image request carries no sign-in, so the address must say which
 * school's records to read. Prefer `school.logo_urls[slot]`, which the server
 * builds; this is the fallback for an API that does not send it yet.
 */
export const getSchoolLogoUrl = (
  schoolId: number,
  slot: SchoolLogoSlot = "primary",
  cacheBust?: string | number | null,
  tenant?: string | number | null,
): string => {
  const params = new URLSearchParams();
  if (tenant !== null && tenant !== undefined && tenant !== "" && String(tenant) !== "1") params.set("tenant", String(tenant));
  if (cacheBust) params.set("v", String(cacheBust));
  const q = params.toString();
  return `${API_BASE_URL}/schools/${schoolId}/logo/${slot}${q ? `?${q}` : ""}`;
};

/** Uploads one logo slot; resolves with the school as saved. */
export const uploadSchoolLogo = async (
  schoolId: number,
  file: File,
  slot: SchoolLogoSlot = "primary",
): Promise<School | null> => {
  const formData = new FormData();
  // "slot" before "file": multer reads fields in order (see the file-server upload-order trap).
  formData.append("slot", slot);
  formData.append("file", file);
  const res = await api.post(`/schools/${schoolId}/logo`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return (res.data?.data as School) ?? null;
};

export const removeSchoolLogo = async (schoolId: number, slot: SchoolLogoSlot): Promise<School | null> => {
  const res = await api.delete(`/schools/${schoolId}/logo/${slot}`);
  return (res.data?.data as School) ?? null;
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
): Promise<School | null> => {
  try {
    const res = await api.post("/schools", schoolData);
    if (onSuccess) onSuccess();
    return (res.data?.data as School) ?? null;
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
