import api from "../services/api";

/** Early warning (backend routes/earlyWarning.ts). */
export type Level = "none" | "watch" | "at_risk";
export interface Reason {
  source: "tendo" | "taskmentor" | "mis";
  text: string;
  points: number;
}
export interface EwStudent {
  studentId: number;
  name: string;
  classGroupId: number | null;
  className: string | null;
  level: Level;
  score: number;
  reasons: Reason[];
  asOf: Partial<Record<"tendo" | "taskmentor", string>>;
  openInterventions: number;
  nextReview: string | null;
}
export interface Intervention {
  id: number;
  action: string;
  notes: string | null;
  ownerId: number;
  owner: string;
  reviewDate: string | null;
  status: "open" | "done";
  outcome: string | null;
  createdAt: string;
}
export interface EwDetail extends EwStudent {
  signals: Partial<Record<"tendo" | "taskmentor", Record<string, number | null>>>;
  officeHoursAbsent30d: number;
  interventions: Intervention[];
}
export interface EwList {
  students: EwStudent[];
  counts: { at_risk: number; watch: number; none: number; withSignals: number };
  classes: Array<{ id: number; name: string }>;
}

export const earlyWarningApi = {
  list: (params: { level?: string; classGroupId?: number | null }) =>
    api.get<{ data: EwList }>("/early-warning", { params: { level: params.level || "any", classGroupId: params.classGroupId || undefined } }),
  student: (id: number) => api.get<{ data: EwDetail }>(`/early-warning/students/${id}`),
  addIntervention: (id: number, body: { action: string; notes?: string; reviewDate?: string }) =>
    api.post<{ data: EwDetail }>(`/early-warning/students/${id}/interventions`, body),
  close: (interventionId: number, outcome: string) => api.post<{ data: EwDetail }>(`/early-warning/interventions/${interventionId}/close`, { outcome }),
};

export const ACTION_LABEL: Record<string, string> = {
  talk_student: "Talk with the student",
  call_parent: "Call the parent or guardian",
  extra_support: "Extra support / catch-up",
  counsellor: "Refer to the counsellor",
  mentor: "Mentor check-in",
  seat_change: "Change seating or group",
  other: "Something else",
};

export const SOURCE_LABEL: Record<Reason["source"], string> = {
  tendo: "Tendo",
  taskmentor: "Task Mentor",
  mis: "MIS",
};
