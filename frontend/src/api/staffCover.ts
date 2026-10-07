import api from "../services/api";

/** Staff absence and cover (backend routes/staffCover.ts). */
export interface MyAbsence {
  id: number;
  from: string;
  to: string;
  reason: string;
  note: string | null;
  status: "pending" | "approved" | "declined" | "cancelled";
  lessons: number;
  covered: number;
}
export interface MyCover {
  id: number;
  date: string;
  start: string;
  end: string | null;
  subject: string | null;
  className: string | null;
  location: string | null;
  note: string | null;
  forTeacher: string;
}
export interface PendingAbsence {
  id: number;
  teacherId: number;
  teacher: string;
  from: string;
  to: string;
  reason: string;
  note: string | null;
  lessons: number;
}
export interface CoverLesson {
  id: number;
  absenceId: number;
  date: string;
  start: string;
  end: string | null;
  subject: string | null;
  className: string | null;
  location: string | null;
  status: "open" | "assigned";
  note: string | null;
  absentTeacher: string;
  coverTeacherId: number | null;
  coverTeacher: string;
}
export interface Suggestion {
  teacherId: number;
  name: string;
  score: number;
  reasons: string[];
}

export const coverApi = {
  mine: () => api.get<{ data: { absences: MyAbsence[]; covers: MyCover[]; canManage: boolean } }>("/cover/mine"),
  report: (body: { from: string; to: string; reason: string; note?: string; teacherId?: number }) => api.post("/cover/absences", body),
  cancel: (id: number) => api.post(`/cover/absences/${id}/cancel`),
  board: (from?: string) => api.get<{ data: { from: string; to: string; pending: PendingAbsence[]; lessons: CoverLesson[]; open: number } }>("/cover/board", { params: { from } }),
  decide: (id: number, approve: boolean) => api.post(`/cover/absences/${id}/decision`, { approve }),
  suggestions: (coverId: number) => api.get<{ data: Suggestion[] }>(`/cover/lessons/${coverId}/suggestions`),
  assign: (coverId: number, teacherId: number | null, note?: string) => api.post(`/cover/lessons/${coverId}/assign`, { teacherId, note }),
  teachers: () => api.get<{ data: Array<{ id: number; name: string }> }>("/cover/teachers"),
};

export const REASON_LABEL: Record<string, string> = {
  sick: "Sick",
  family: "Family",
  training: "Training / workshop",
  official: "Official duty",
  other: "Other",
};

export const STATUS_LABEL: Record<MyAbsence["status"], string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Withdrawn",
};
