import api from "../services/api";

/** Families (backend routes/families.ts). */
export interface ChildSummary {
  studentId: number;
  name: string;
  firstName: string;
  className: string | null;
  asOf: string | null;
  attendance: string | null;
  conduct: string | null;
  schoolwork: string | null;
  attention: boolean;
  /** Learning-outcome progress, when something was assessed. */
  skills?: string | null;
}
export interface FamilyPrefs {
  weeklyDigest: boolean;
  digestEmail: boolean;
}
export interface ImportRow {
  student: string;
  parentName: string;
  email: string;
  phone?: string;
  relationship?: string;
}
export interface ImportResult {
  row: number;
  outcome: "created" | "linked" | "already_linked" | "error";
  message?: string;
}

export const familiesApi = {
  competences: (studentId: number) => api.get<{ data: import("./competency").MyCompetences }>(`/families/children/${studentId}/competences`),
  me: () => api.get<{ data: { children: ChildSummary[]; preferences: FamilyPrefs; telegramLinked: boolean } }>("/families/me"),
  savePrefs: (p: Partial<FamilyPrefs>) => api.put<{ data: FamilyPrefs }>("/families/me/preferences", p),
  importParents: (rows: ImportRow[]) => api.post<{ data: ImportResult[] }>("/families/import", { rows }),
};

/**
 * Pasted rows: "student, parent name, email, phone, relationship" per line
 * (comma, semicolon or tab). A header line is skipped. Pure.
 */
export function parseImport(text: string): ImportRow[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\t|;|,/).map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((c) => !(c[0] && /^(student|élève|registration)/i.test(c[0]) && /mail/i.test(c.join(" "))))
    .map((c) => ({ student: c[0] ?? "", parentName: c[1] ?? "", email: c[2] ?? "", phone: c[3] || undefined, relationship: c[4] || undefined }));
}
