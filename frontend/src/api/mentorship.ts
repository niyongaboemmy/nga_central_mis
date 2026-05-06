import api from "../services/api";

export interface AssignedStudent {
  user_id: number;
  first_name: string | null;
  last_name: string | null;
  class_group_name: string;
  last_session_date: string | null;
  days_since_last_session: number | null;
  wellbeing_status: string | null;
  follow_up_required: boolean;
  dishonesty_flagged: boolean;
  stress_flag: boolean;
  overdue: boolean;
}

export type SessionStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";
export type DisciplineProgress = "IMPROVED" | "CONSISTENT" | "DECLINED";

export interface MentorshipSessionRecord {
  mentorship_id: number;
  session_date: string | null;
  topic: string | null;
  subject_id: number | null;
  previous_session_id: number | null;
  duration_minutes: number | null;
  assignment_completion: string | null;
  assignment_notes: string | null;
  punctuality_attendance: string | null;
  discipline_notes: string | null;
  discipline_progress: DisciplineProgress | null;
  academic_planning: string | null;
  academic_personal_notes: string | null;
  dishonesty_flagged: boolean;
  stress_flag: boolean;
  next_steps: string | null;
  action_items: string | null;
  challenges_identified: string | null;
  guidance_notes: string | null;
  wellbeing_status: string | null;
  wellbeing_score: number | null;
  wellbeing_notes: string | null;
  follow_up_required: boolean;
  is_completed: boolean;
  session_status: SessionStatus;
  notes: string | null;
  created_at: string;
}

export interface PendingFollowUp {
  mentorship_id: number;
  student_id: number | null;
  first_name: string | null;
  last_name: string | null;
  student_name: string | null;
  session_date: string | null;
  topic: string | null;
  action_items: string | null;
  session_status: SessionStatus;
  wellbeing_status: string | null;
  dishonesty_flagged: boolean;
  stress_flag: boolean;
  notes: string | null;
}

export interface SubmitSessionPayload {
  student_id: number;
  session_date: string;
  topic?: string;
  subject_id?: number;
  previous_session_id?: number;
  duration_minutes?: number;
  assignment_completion?: string;
  assignment_notes?: string;
  punctuality_attendance?: string;
  discipline_notes?: string;
  discipline_progress?: DisciplineProgress;
  academic_planning?: string;
  academic_personal_notes?: string;
  dishonesty_flagged?: boolean;
  stress_flag?: boolean;
  next_steps?: string;
  action_items?: string;
  challenges_identified?: string;
  guidance_notes?: string;
  wellbeing_status?: string;
  wellbeing_notes?: string;
  follow_up_required?: boolean;
  is_completed?: boolean;
  session_status?: SessionStatus;
  notes?: string;
}

// Intelligence layer (G-01, G-02)
export interface AssessmentScoreEntry {
  score_id: number;
  subject_id: number;
  subject_name: string | null;
  assessment_type: string;
  title: string | null;
  score: number;
  max_score: number;
  percentage: number | null;
  assessed_at: string | null;
  term: string | null;
}

export interface OpenChallenge {
  mentorship_id: number;
  session_date: string | null;
  topic: string | null;
  challenges_identified: string | null;
  action_items: string | null;
  session_status: SessionStatus;
}

export interface InstructorSubject {
  subject_id: number;
  name: string;
  code: string | null;
}

export interface MenteeIntelligence {
  recent_scores: AssessmentScoreEntry[];
  open_challenges: OpenChallenge[];
  flag_history: { dishonesty_count: number; stress_count: number };
  instructor_subjects: InstructorSubject[];
}

// Admin log (G-04)
export interface AdminLogEntry {
  mentorship_id: number;
  student_id: number | null;
  student_name: string | null;
  mentor_id: number;
  session_date: string | null;
  topic: string | null;
  subject_name: string | null;
  duration_minutes: number | null;
  assignment_completion: string | null;
  assignment_notes: string | null;
  punctuality_attendance: string | null;
  discipline_notes: string | null;
  discipline_progress: DisciplineProgress | null;
  academic_planning: string | null;
  academic_personal_notes: string | null;
  dishonesty_flagged: boolean;
  stress_flag: boolean;
  challenges_identified: string | null;
  guidance_notes: string | null;
  wellbeing_status: string | null;
  wellbeing_score: number | null;
  wellbeing_notes: string | null;
  action_items: string | null;
  next_steps: string | null;
  follow_up_required: boolean;
  is_completed: boolean;
  session_status: SessionStatus;
  notes: string | null;
}

export const mentorshipApi = {
  getAssignedStudents: () =>
    api.get<{ success: boolean; data: AssignedStudent[] }>("/mentorship/students"),

  getStudentHistory: (studentId: number) =>
    api.get<{ success: boolean; data: MentorshipSessionRecord[] }>(
      `/mentorship/students/${studentId}/history`,
    ),

  getMenteeIntelligence: (studentId: number) =>
    api.get<{ success: boolean; data: MenteeIntelligence }>(
      `/mentorship/students/${studentId}/intelligence`,
    ),

  submitSession: (data: SubmitSessionPayload) =>
    api.post<{ success: boolean; data: { mentorship_id: number } }>(
      "/mentorship/sessions",
      data,
    ),

  updateStatus: (sessionId: number, status: SessionStatus) =>
    api.patch<{ success: boolean; data: { mentorship_id: number; status: SessionStatus } }>(
      `/mentorship/sessions/${sessionId}/status`,
      { status },
    ),

  getPendingFollowUps: () =>
    api.get<{ success: boolean; data: PendingFollowUp[] }>("/mentorship/follow-ups"),

  getAdminLog: (params?: { student_id?: number; limit?: number }) =>
    api.get<{ success: boolean; data: AdminLogEntry[] }>("/mentorship/admin/log", {
      params,
    }),
};
