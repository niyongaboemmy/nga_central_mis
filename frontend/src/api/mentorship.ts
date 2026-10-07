import api from "../services/api";

export interface AssignedStudent {
  user_id: number;
  first_name: string | null;
  last_name: string | null;
  registration_number: string | null;
  class_group_name: string | null;
  assigned_at?: string | null;
  session_count?: number;
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

// Fields shared between creating and editing a session — session_date is
// the only always-required field once a student is already known (create
// needs student_id too; edit resolves it from the existing row).
export interface SessionFieldsPayload {
  session_date: string;
  topic?: string;
  academic_year_id?: number;
  academic_term_id?: number;
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

export interface SubmitSessionPayload extends SessionFieldsPayload {
  student_id: number;
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
  mentor_name: string | null;
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

// Mentor assignments (Phase 1)
export type AssignmentStatus = "ACTIVE" | "ENDED";

export interface MentorAssignmentRecord {
  assignment_id: number;
  mentor_id: number;
  mentor_name: string | null;
  mentor_user_type?: string | null;
  student_id: number;
  student_name: string | null;
  student_registration_number?: string | null;
  academic_year_id: number;
  academic_year_name: string | null;
  status: AssignmentStatus;
  assigned_at: string | null;
  ended_at: string | null;
  notes: string | null;
}

// Mentee check-ins (Phase 2) / mentee reports with approval workflow (Phase 4)
export type CheckInCategory =
  | "GENERAL"
  | "APPRECIATION"
  | "ACADEMIC"
  | "BEHAVIORAL"
  | "ATTENDANCE"
  | "WELLBEING"
  | "CONCERN"
  | "REQUEST_MEETING"
  | "OTHER";
export type CheckInStatus = "NEW" | "ACKNOWLEDGED" | "ADDRESSED";
export type ValidationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface MenteeCheckInRecord {
  checkin_id: number;
  student_id: number;
  student_name?: string | null;
  mentor_id: number;
  academic_year_id: number;
  submitted_at: string | null;
  category: CheckInCategory;
  title: string | null;
  subject_id?: number | null;
  subject_name?: string | null;
  message: string;
  linked_session_id: number | null;
  status: CheckInStatus;
  validation_status: ValidationStatus;
  mentor_response: string | null;
  responded_at: string | null;
}

// My mentor (student-facing)
export interface MyMentorInfo {
  mentor_id: number;
  mentor_name: string | null;
  mentor_email: string;
  mentor_phone?: string | null;
  /** UserProfile.user_type of the mentor (TEACHER, STAFF, ADMIN...). */
  mentor_role?: string | null;
  /** Subjects this mentor teaches the student this year. */
  teaches_you?: string[];
  assigned_at: string | null;
  session_count?: number;
  last_session_date?: string | null;
}

/** A person offered by the Assign Mentor pickers. */
export interface MentorCandidate {
  user_id: number;
  username: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  user_type: string | null;
  name: string;
  /** mentor role only: active mentees in the year. */
  mentee_count?: number;
  /** student role only. */
  registration_number?: string | null;
  class_group_name?: string | null;
  current_mentor_id?: number | null;
  current_mentor_name?: string | null;
}

export interface AssignOutcome {
  assigned: number;
  moved: number;
  unchanged: number;
  assignment_ids: number[];
}

export interface MyMentorshipRole {
  is_mentor: boolean;
  mentee_count: number;
  has_mentor: boolean;
}

// Consolidated periodic report (Phase 3)
export interface ConsolidatedMenteeSection {
  student_id: number;
  name: string;
  date_of_birth: string | null;
  scores: {
    subject_name: string | null;
    score: string | number;
    max_score: string | number;
    assessment_type: string;
  }[];
  sessions: {
    mentorship_id: number;
    session_date: string | null;
    topic: string | null;
    next_steps: string | null;
    guidance_notes: string | null;
    notes: string | null;
    follow_up_required: boolean;
    dishonesty_flagged: boolean;
    stress_flag: boolean;
  }[];
  comments: {
    checkin_id: number;
    category: CheckInCategory;
    message: string;
    submitted_at: string | null;
  }[];
  recommend_follow_up: boolean;
}

export interface ConsolidatedReport {
  mentor_name: string;
  academic_year_id: number;
  mentees: ConsolidatedMenteeSection[];
}

// Mentor-wide period report ("view all reports by selected period range")
export interface MySessionsReportSession {
  mentorship_id: number;
  student_id: number | null;
  student_name: string | null;
  session_date: string | null;
  topic: string | null;
  subject_name: string | null;
  duration_minutes: number | null;
  wellbeing_status: string | null;
  follow_up_required: boolean;
  dishonesty_flagged: boolean;
  stress_flag: boolean;
  session_status: SessionStatus;
  notes: string | null;
}

export interface MySessionsReportCheckin {
  checkin_id: number;
  student_id: number | null;
  student_name: string | null;
  submitted_at: string | null;
  category: CheckInCategory;
  title: string | null;
  message: string;
  status: CheckInStatus;
  validation_status: ValidationStatus;
}

export interface MySessionsReport {
  period: { start_date: string | null; end_date: string | null };
  sessions: MySessionsReportSession[];
  checkins: MySessionsReportCheckin[];
  summary: {
    total_sessions: number;
    total_checkins: number;
    pending_checkins: number;
    flagged_sessions: number;
  };
}

// School-wide mentorship dashboard (admin)
export interface AdminMentorshipDashboardData {
  period: { start_date: string | null; end_date: string | null };
  totals: {
    total_mentees: number;
    total_mentors: number;
    total_sessions: number;
    flagged_sessions: number;
    follow_ups_open: number;
    overdue_mentees: number;
    total_checkins: number;
    pending_checkins: number;
    approved_checkins: number;
    rejected_checkins: number;
  };
  wellbeing_distribution: { status: string | null; count: number }[];
  top_mentors: { mentor_id: number; mentor_name: string | null; session_count: number }[];
}

// AI-generated mentee insights
export interface MenteeAIInsights {
  student_id: number;
  generated_at: string;
  summary: string;
  strengths: string[];
  concerns: string[];
  recommended_focus: string | null;
  based_on_sessions: number;
}

export const mentorshipApi = {
  getAssignedStudents: (academicYearId?: number) =>
    api.get<{ success: boolean; data: AssignedStudent[] }>(
      "/mentorship/students",
      { params: academicYearId ? { academic_year_id: academicYearId } : undefined },
    ),

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

  getSessionById: (sessionId: number) =>
    api.get<{ success: boolean; data: MentorshipSessionRecord }>(
      `/mentorship/sessions/${sessionId}`,
    ),

  updateSession: (sessionId: number, data: SessionFieldsPayload) =>
    api.put<{ success: boolean; data: { mentorship_id: number } }>(
      `/mentorship/sessions/${sessionId}`,
      data,
    ),

  updateStatus: (sessionId: number, status: SessionStatus) =>
    api.patch<{ success: boolean; data: { mentorship_id: number; status: SessionStatus } }>(
      `/mentorship/sessions/${sessionId}/status`,
      { status },
    ),

  getPendingFollowUps: () =>
    api.get<{ success: boolean; data: PendingFollowUp[] }>("/mentorship/follow-ups"),

  getAdminLog: (params?: {
    student_id?: number;
    mentor_id?: number;
    academic_year_id?: number;
    limit?: number;
  }) =>
    api.get<{ success: boolean; data: AdminLogEntry[] }>("/mentorship/admin/log", {
      params,
    }),

  getAdminCheckIns: (params?: {
    mentor_id?: number;
    student_id?: number;
    academic_year_id?: number;
    status?: CheckInStatus;
    limit?: number;
  }) =>
    api.get<{ success: boolean; data: (MenteeCheckInRecord & { mentor_name: string | null })[] }>(
      "/mentorship/admin/checkins",
      { params },
    ),

  // Mentor assignments (admin)
  listAssignments: (params?: {
    academic_year_id?: number;
    mentor_id?: number;
    student_id?: number;
    status?: AssignmentStatus;
  }) =>
    api.get<{ success: boolean; data: MentorAssignmentRecord[] }>(
      "/mentorship/admin/assignments",
      { params },
    ),

  getUnassignedStudents: (academicYearId?: number) =>
    api.get<{
      success: boolean;
      data: {
        student_id: number;
        student_name: string | null;
        registration_number: string | null;
        class_group_name: string | null;
      }[];
    }>("/mentorship/admin/unassigned-students", {
      params: academicYearId ? { academic_year_id: academicYearId } : undefined,
    }),

  createAssignment: (data: {
    mentor_id: number;
    student_id: number;
    academic_year_id?: number;
    notes?: string;
    reassign?: boolean;
  }) =>
    api.post<{ success: boolean; data: AssignOutcome & { assignment_id: number | null } }>(
      "/mentorship/assignments",
      data,
    ),

  bulkAssignMentor: (data: {
    mentor_id: number;
    student_ids: number[];
    academic_year_id?: number;
    reassign?: boolean;
    notes?: string;
  }) =>
    api.post<{ success: boolean; data: AssignOutcome }>(
      "/mentorship/assignments/bulk",
      data,
    ),

  searchCandidates: (params: {
    role: "mentor" | "student";
    q?: string;
    academic_year_id?: number;
    unassigned_only?: 1;
  }) =>
    api.get<{ success: boolean; data: MentorCandidate[] }>("/mentorship/admin/candidates", { params }),

  getMyRole: (academicYearId?: number) =>
    api.get<{ success: boolean; data: MyMentorshipRole }>("/mentorship/me", {
      params: academicYearId ? { academic_year_id: academicYearId } : undefined,
    }),

  endAssignment: (assignmentId: number) =>
    api.delete<{ success: boolean; data: { assignment_id: number } }>(
      `/mentorship/assignments/${assignmentId}`,
    ),

  // Mentee check-ins — student side
  submitCheckIn: (data: { category: CheckInCategory; title?: string; subject_id?: number; academic_year_id?: number; message: string }) =>
    api.post<{ success: boolean; data: { checkin_id: number } }>(
      "/mentorship/checkins",
      data,
    ),

  getMyCheckIns: () =>
    api.get<{ success: boolean; data: MenteeCheckInRecord[] }>("/mentorship/checkins/mine"),

  getMyMentor: (academicYearId?: number) =>
    api.get<{ success: boolean; data: MyMentorInfo | null }>("/mentorship/my-mentor", {
      params: academicYearId ? { academic_year_id: academicYearId } : undefined,
    }),

  // Mentee check-ins — mentor side
  getCheckInInbox: (status?: CheckInStatus) =>
    api.get<{ success: boolean; data: MenteeCheckInRecord[] }>("/mentorship/checkins/inbox", {
      params: status ? { status } : undefined,
    }),

  getCheckInDetail: (checkinId: number) =>
    api.get<{ success: boolean; data: MenteeCheckInRecord }>(`/mentorship/checkins/${checkinId}`),

  updateCheckIn: (
    checkinId: number,
    data: {
      status?: CheckInStatus;
      validation_status?: ValidationStatus;
      mentor_response?: string;
      linked_session_id?: number | null;
    },
  ) =>
    api.patch<{ success: boolean; data: { checkin_id: number } }>(
      `/mentorship/checkins/${checkinId}`,
      data,
    ),

  // Consolidated periodic report
  getConsolidatedReport: (params?: {
    mentor_id?: number;
    academic_year_id?: number;
    start_date?: string;
    end_date?: string;
  }) =>
    api.get<{ success: boolean; data: ConsolidatedReport }>(
      "/mentorship/reports/consolidated",
      { params },
    ),

  // Mentor-wide, period-scoped report (all mentees, not just one)
  getMySessionsReport: (params?: { start_date?: string; end_date?: string }) =>
    api.get<{ success: boolean; data: MySessionsReport }>(
      "/mentorship/reports/my-sessions",
      { params },
    ),

  // Admin-level approval (acts on any mentor's check-in)
  adminUpdateCheckIn: (
    checkinId: number,
    data: { validation_status?: ValidationStatus; status?: CheckInStatus; mentor_response?: string },
  ) =>
    api.patch<{ success: boolean; data: { checkin_id: number } }>(
      `/mentorship/admin/checkins/${checkinId}`,
      data,
    ),

  // School-wide mentorship dashboard (admin)
  getAdminMentorshipDashboard: (params?: {
    academic_year_id?: number;
    start_date?: string;
    end_date?: string;
  }) =>
    api.get<{ success: boolean; data: AdminMentorshipDashboardData }>(
      "/mentorship/admin/dashboard",
      { params },
    ),

  // AI-generated insights for a single mentee
  generateMenteeAIInsights: (studentId: number) =>
    api.post<{ success: boolean; data: MenteeAIInsights }>(
      `/mentorship/students/${studentId}/ai-insights`,
      {},
    ),
};
