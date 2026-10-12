import api from "../services/api";

/** Safeguarding and wellbeing (backend routes/safeguarding.ts). */
export type Severity = "high" | "medium" | "low";
export type ConcernStatus = "new" | "acknowledged" | "in_progress" | "closed";
export type ConcernSource = "ai_tutor" | "check_in" | "student" | "staff";

export interface ConcernRow {
  id: number;
  studentId: number;
  student: string;
  source: ConcernSource;
  category: string;
  severity: Severity;
  status: ConcernStatus;
  summary: string;
  assignedTo: number | null;
  assignee: string;
  createdAt: string;
  updatedAt: string;
  notes: number;
}

export interface ConcernNote {
  id: number;
  action: "note" | "status" | "assign" | "again";
  text: string | null;
  authorId: number | null;
  author: string;
  at: string;
}

export interface Concern extends Omit<ConcernRow, "notes"> {
  className: string | null;
  detail: string | null;
  ref: string | null;
  reportedBy: number | null;
  reporter: string;
  closedAt: string | null;
  notes: ConcernNote[];
  history: Array<{ id: number; category: string; severity: Severity; status: ConcernStatus; createdAt: string }>;
}

export interface SafeguardingSummary {
  week: string;
  students: number;
  concerns: { open: number; new: number; high: number };
  weeks: Array<{ week: string; checkIns: number; mood: number; safe: number; wantsTalk: number }>;
}

export interface MyCheckIn {
  applies: boolean;
  week?: string;
  done?: boolean;
  checkIn?: { mood: number; safe: number; wantsTalk: boolean; at: string } | null;
}

export const safeguardingApi = {
  checkIn: () => api.get<{ data: MyCheckIn }>("/safeguarding/check-in"),
  submitCheckIn: (body: { mood: number; safe: number; wantsTalk: boolean; comment?: string }) =>
    api.post<{ data: MyCheckIn }>("/safeguarding/check-in", body),
  report: (body: { category: string; text: string }) => api.post("/safeguarding/report", body),
  summary: () => api.get<{ data: SafeguardingSummary }>("/safeguarding/summary"),
  concerns: (status: string) => api.get<{ data: ConcernRow[] }>("/safeguarding/concerns", { params: { status } }),
  concern: (id: number) => api.get<{ data: Concern }>(`/safeguarding/concerns/${id}`),
  act: (id: number, body: { text?: string; status?: ConcernStatus; assignTo?: number | null }) =>
    api.post<{ data: Concern }>(`/safeguarding/concerns/${id}`, body),
  team: () => api.get<{ data: Array<{ id: number; name: string }> }>("/safeguarding/team"),
};

export const CATEGORY_LABEL: Record<string, string> = {
  "self-harm": "Self-harm",
  abuse: "Abuse",
  bullying: "Bullying",
  unsafe: "Feels unsafe",
  someone_else: "Worried about someone else",
  health: "Health",
  home: "Home",
  other: "Other",
  wants_talk: "Wants to talk",
  low_mood: "Low mood",
};

export const SOURCE_LABEL: Record<ConcernSource, string> = {
  ai_tutor: "AI Tutor",
  check_in: "Weekly check-in",
  student: "Student's own report",
  staff: "Staff",
};

export const STATUS_LABEL: Record<ConcernStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  closed: "Closed",
};
