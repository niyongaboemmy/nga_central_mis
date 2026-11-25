import api from "../../services/api";

/** The Google account a person checks in with on the staff attendance clock (Tendo /c/<school>). */
export interface AttendanceGmail {
  linked: boolean;
  google_email: string | null;
  /** that Google account has signed in (on the check-in page or with the Google button) */
  verified: boolean;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** gmail.com / googlemail.com addresses are Google accounts: nothing to set. */
export const isGmail = (email?: string | null) => /@(gmail|googlemail)\.com$/i.test(String(email ?? "").trim());

export const readMyAttendanceGmail = async (): Promise<AttendanceGmail | null> =>
  (await api.get("/users/me/attendance-google")).data?.data ?? null;

export const saveMyAttendanceGmail = async (email: string): Promise<AttendanceGmail | null> =>
  (await api.put("/users/me/attendance-google", { email: email.trim().toLowerCase() })).data?.data ?? null;

export const linkMyGoogle = async (credential: string): Promise<AttendanceGmail | null> =>
  (await api.post("/users/me/attendance-google", { credential })).data?.data ?? null;

export const removeMyAttendanceGmail = async (): Promise<AttendanceGmail | null> =>
  (await api.delete("/users/me/attendance-google")).data?.data ?? null;

export const errorText = (err: any, fallback: string) => err?.response?.data?.message || fallback;
