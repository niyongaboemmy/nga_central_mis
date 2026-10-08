import api from "../services/api";

/** Competency map (backend routes/competency.ts). */
export type CompState = "NOT_COVERED" | "COVERED" | "DEMONSTRATED";

export interface CompOptions {
  oversight: boolean;
  subjects: { subject_id: number; name: string; code: string | null; criteria: number; classes: { class_group_id: number; name: string }[] }[];
}
export interface CompCriterion {
  criteria_id: number;
  criteria_number: string;
  description: string;
  elearning_items: number;
  tasks: number;
  assessed_pct: number;
  demonstrated_pct: number;
}
export interface CompOutcome {
  competency_id: number;
  element_number: number;
  title: string;
  criteria: CompCriterion[];
}
export interface CompStudent {
  user_id: number;
  name: string;
  states: Record<number, CompState>;
  best: Record<number, number | null>;
  outcomes: Record<number, { demonstrated: number; assessed: number; total: number }>;
  demonstrated: number;
  assessed: number;
}
export interface CompMap {
  subject: { subject_id: number; name: string; code: string | null };
  class_group: { class_group_id: number; name: string };
  competent_pct: number;
  outcomes: CompOutcome[];
  criteria_total: number;
  criteria_without_evidence: number;
  students: CompStudent[];
}
export interface CompEvidence {
  kind: "quiz" | "assignment" | "elearning";
  source: string;
  ref: number;
  title: string;
  score_pct: number | null;
  at: string | null;
}
export interface CompStudentDetail {
  student: { user_id: number; name: string };
  competent_pct: number;
  outcomes: { competency_id: number; element_number: number; title: string; criteria: { criteria_id: number; criteria_number: string; description: string; state: CompState; evidence: CompEvidence[] }[] }[];
}

export const competencyApi = {
  options: () => api.get<{ data: CompOptions }>("/competency/options"),
  map: (subjectId: number, classGroupId: number) => api.get<{ data: CompMap }>("/competency/map", { params: { subjectId, classGroupId } }),
  student: (id: number, subjectId: number, classGroupId: number) =>
    api.get<{ data: CompStudentDetail }>(`/competency/map/students/${id}`, { params: { subjectId, classGroupId } }),
};
