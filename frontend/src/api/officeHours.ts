import api from "../services/api";

/**
 * Mandatory office hours (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §7.2).
 * day_of_week uses the timetable's backend encoding: 1 = Monday ... 5 = Friday.
 */

type Envelope<T> = { success: boolean; message?: string; data: T };

export type ScheduleStatus = "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";
export type SessionState = "upcoming" | "running" | "unmarked" | "held" | "cancelled";
export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";

export interface OfficeHoursConfig {
  band_start: string;
  band_end: string;
  allowed_window_start: string;
  allowed_window_end: string;
  default_capacity: number;
  max_capacity: number;
  roster_cutoff_time: string;
  student_lock_mode: "TERM" | "WEEKDAY";
  allow_any_student: boolean;
  late_after_minutes: number;
  register_edit_days: number;
  qr_checkin_enabled: boolean;
  rate_band_consistent: number;
  rate_band_watch: number;
  min_sessions_for_rate: number;
  purposes: string[];
  reason_codes: string[];
  end_reason_codes: string[];
  cancel_reasons: string[];
  term: { termId: number; yearId: number; name: string | null; startYmd: string; endYmd: string } | null;
  today: string;
  capabilities: { manage_own: boolean; manage_any: boolean; view: boolean; view_self: boolean; configure: boolean };
}

export interface OfficeHourSchedule {
  schedule_id: number;
  academic_year_id: number;
  academic_term_id: number;
  teacher_id: number;
  teacher_name: string | null;
  subject_id: number | null;
  subject_name: string | null;
  subject_color: string | null;
  title: string;
  purpose: string;
  start_time: string;
  end_time: string;
  location: string | null;
  capacity: number;
  effective_from: string;
  effective_to: string;
  status: ScheduleStatus;
  notes: string | null;
  version: number;
  days: number[];
  days_label: string;
  assigned_count: number;
}

export interface OfficeHourSession {
  session_id: number;
  schedule_id: number;
  session_date: string;
  start_time: string;
  end_time: string;
  host_teacher_id: number;
  host_name: string | null;
  location: string | null;
  status: "SCHEDULED" | "HELD" | "CANCELLED";
  cancel_reason: string | null;
  cancel_note: string | null;
  topic: string | null;
  title: string;
  teacher_id: number;
  subject_id: number | null;
  state: SessionState;
  expected: number;
  marked: number;
  attended: number;
  version: number;
}

export interface StudentCard {
  student_id: number;
  first_name: string | null;
  last_name: string | null;
  registration_number: string | null;
  class_group_id: number | null;
  class_group_name: string | null;
}

export interface Holder {
  assignment_id: number;
  schedule_id: number;
  title: string;
  teacher_id: number;
  teacher_name: string | null;
  days: number[];
  days_label: string;
}

export type Availability =
  | { status: "FREE" }
  | { status: "WITH_YOU"; assignment_id: number }
  | { status: "HELD_BY_OTHER"; holders: Holder[] };

export interface Candidate extends StudentCard {
  availability: Availability;
  eligible: boolean;
  not_your_student: boolean;
  clash_note: string | null;
}

export interface CandidatesResponse {
  students: Candidate[];
  class_groups: number[];
  capacity: number;
  assigned_count: number;
  lock_mode: "TERM" | "WEEKDAY";
}

export interface AssignResult {
  assigned: Array<{ student_id: number; assignment_id: number; effective_from: string; clash_note: string | null }>;
  conflicts: Array<{ student_id: number; holders: Holder[] }>;
  already_assigned: number[];
  ineligible: Array<{ student_id: number; reason: "NOT_ENROLLED" | "NOT_YOUR_STUDENT" | "OUT_OF_SCOPE" }>;
  over_capacity: number[];
  no_remaining_sessions: boolean;
}

export interface RosterRow {
  assignment_id: number;
  schedule_id: number;
  student_id: number;
  status: "ACTIVE" | "ENDED";
  effective_from: string;
  effective_to: string;
  reason_code: string | null;
  reason_note: string | null;
  clash_note: string | null;
  end_reason_code: string | null;
  end_note: string | null;
  assigned_at: string | null;
  ended_at: string | null;
  student: StudentCard;
  stats?: StudentStats;
}

export interface StudentStats {
  expected: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number | null;
  presence_rate: number | null;
  current_absent_streak: number;
  longest_attended_streak: number;
  band: "CONSISTENT" | "WATCH" | "CHRONIC" | "TOO_FEW";
  last_attended: string | null;
}

export interface TransferRequest {
  request_id: number;
  student_id: number;
  from_assignment_id: number;
  to_schedule_id: number;
  requested_by: number;
  requested_by_name: string | null;
  message: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  student: StudentCard | null;
  from_schedule: { schedule_id: number; title: string; teacher_id: number; teacher_name: string | null };
  to_schedule: { schedule_id: number; title: string | null };
}

export interface MyOfficeHours {
  term_id: number;
  today: string;
  schedules: OfficeHourSchedule[];
  today_sessions: OfficeHourSession[];
  upcoming: OfficeHourSession[];
  unmarked: OfficeHourSession[];
  transfers: { incoming: TransferRequest[]; outgoing: TransferRequest[] };
}

export interface StudentAssignmentView {
  assignment_id: number;
  schedule_id: number;
  status: "ACTIVE" | "ENDED";
  effective_from: string;
  effective_to: string;
  title: string;
  teacher_id: number;
  teacher_name: string | null;
  subject_name: string | null;
  subject_color: string | null;
  days: number[];
  days_label: string;
  start_time: string;
  end_time: string;
  location: string | null;
}

export interface StudentSessionView {
  session_id: number;
  schedule_id: number;
  session_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  title: string | null;
  teacher_name: string | null;
  state: SessionState;
  cancel_reason: string | null;
  status: AttendanceStatus | null;
  arrived_at: string | null;
  notice?: { reason: string; note: string | null } | null;
}

export interface Suggestion extends StudentCard {
  signals: Array<{ source: "taskmentor" | "office_hours"; label: string; weight: number }>;
  score: number;
}

export interface StudentOverview {
  student_id: number;
  term: { academic_term_id: number; name: string | null; start_date: string; end_date: string };
  assignments: StudentAssignmentView[];
  upcoming: StudentSessionView[];
  history: StudentSessionView[];
  stats?: StudentStats;
  absence_reasons?: string[];
}

export interface BandEntry {
  day_of_week: number;
  schedule_id: number | null;
  title: string;
  start_time: string;
  end_time: string;
  location: string | null;
  color: string | null;
  role: "hosting" | "attending" | "summary";
  teacher_name: string | null;
  count: number;
}

export interface Closure {
  closure_id: number;
  start_date: string;
  end_date: string;
  reason: string;
  scope: "ALL" | "OFFICE_HOURS";
}


export interface RegisterRow {
  student_id: number;
  assignment_id: number | null;
  is_drop_in: boolean;
  status: AttendanceStatus | null;
  excuse_reason: string | null;
  arrived_at: string | null;
  note: string | null;
  outcome: number | null;
  follow_up: boolean;
  source: string;
  marked_at: string | null;
  first_name: string | null;
  last_name: string | null;
  registration_number: string | null;
  class_group_name: string | null;
  notice: { reason: string; note: string | null } | null;
}

export interface RegisterData {
  session: OfficeHourSession & { register_saved_by_name: string | null; register_last_saved_at: string | null };
  roster: RegisterRow[];
  can_edit: boolean;
  window: { opens_at: string; not_yet: boolean; closed: boolean; last_edit_day: string };
  late_after_minutes: number;
  qr_enabled?: boolean;
  excuse_reasons?: string[];
}

export interface RegisterRecordInput {
  student_id: number;
  status: AttendanceStatus | null;
  excuse_reason?: string | null;
  arrived_at?: string | null;
  note?: string | null;
  outcome?: number | null;
  follow_up?: boolean;
}

export interface UnmarkedSession {
  session_id: number;
  schedule_id: number;
  session_date: string;
  start_time: string;
  end_time: string;
  title: string;
  host_teacher_id: number;
  host_name: string | null;
  expected: number;
  days_overdue: number;
}

export interface Escalation {
  escalation_id: number;
  student_id: number;
  assignment_id: number;
  level: number;
  trigger_code: "CONSECUTIVE_L1" | "MONTH_L1" | "CONSECUTIVE_L2" | "RATE_BELOW";
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by_name: string | null;
  resolution_note: string | null;
  notified_user_ids: string | null;
  student: StudentCard | null;
  title: string;
  teacher_id: number;
  teacher_name: string | null;
  last_missed: string;
}


export type PeriodKind = "day" | "week" | "month" | "term" | "year" | "custom";
export interface ReportPeriod {
  period: PeriodKind;
  from: string;
  to: string;
  label: string;
  previous: { from: string; to: string; label: string } | null;
  bucket: "day" | "week" | "month";
}
export interface ReportQuery {
  period: PeriodKind;
  anchor?: string;
  from?: string;
  to?: string;
  term_id?: number | null;
  teacher_id?: number;
  subject_id?: number;
  class_group_id?: number;
}
export type BandCounts = Record<"CONSISTENT" | "WATCH" | "CHRONIC" | "TOO_FEW", number>;
export interface SummaryKpis {
  planned: number;
  due: number;
  held: number;
  unmarked: number;
  cancelled: number;
  cancelled_by_reason: Record<string, number>;
  delivery_rate: number | null;
  expected_attendances: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attendance_rate: number | null;
  presence_rate: number | null;
  punctuality: number | null;
  drop_ins: number;
  students: number;
  bands: BandCounts;
}
export interface SummaryReport {
  period: ReportPeriod;
  scope: "school" | "classGroups" | "own";
  kpis: SummaryKpis;
  previous: SummaryKpis | null;
  series: Array<{ key: string; label: string; planned: number; held: number; attendance_rate: number | null }>;
  utilisation: { assigned: number; capacity: number; rate: number | null } | null;
}
export type GroupBy = "teacher" | "subject" | "class_group" | "grade" | "program" | "weekday" | "purpose";
export interface BreakdownRow {
  key: string;
  label: string;
  planned: number;
  held: number;
  unmarked: number;
  cancelled: number;
  delivery_rate: number | null;
  expected_attendances: number;
  attended: number;
  absent: number;
  attendance_rate: number | null;
  presence_rate: number | null;
  students: number;
  bands: BandCounts;
}
export interface ConsistencyRow extends StudentStats {
  student_id: number;
  name: string;
  class_group_name: string | null;
  office_hours: string[];
}
export interface ConsistencyReport {
  period: ReportPeriod;
  thresholds: { consistent: number; watch: number; min_sessions: number };
  consistent: ConsistencyRow[];
  watch: ConsistencyRow[];
  chronic: ConsistencyRow[];
  too_few: ConsistencyRow[];
}
export interface DailySheet {
  date: string;
  sessions: Array<{
    session_id: number;
    title: string;
    start_time: string;
    end_time: string;
    location: string | null;
    host_name: string | null;
    status: string;
    roster: Array<{ student_id: number; name: string; class_group_name: string | null; status: AttendanceStatus | null; drop_in: boolean }>;
  }>;
}
export interface StudentReport {
  period: ReportPeriod;
  student_id: number;
  name: string;
  stats: StudentStats;
  assignments: Array<{ assignment_id: number; schedule_id: number; title: string; teacher_name: string | null; status: string; effective_from: string; effective_to: string; reason_code: string | null; end_reason_code: string | null }>;
  timeline: Array<{ session_id: number; schedule_id: number; session_date: string; session_status: string; cancel_reason: string | null; status: AttendanceStatus | null; note: string | null; outcome: number | null; title: string | null }>;
  escalations: Array<{ escalation_id: number; level: number; trigger_code: string; created_at: string; acknowledged_at: string | null }>;
}
export interface TeacherReport {
  period: ReportPeriod;
  teacher_id: number;
  name: string;
  planned: number;
  held: number;
  unmarked: number;
  cancelled: number;
  delivery_rate: number | null;
  on_time_registers: number | null;
  average_roster: number;
  attendance_rate: number | null;
  presence_rate: number | null;
  schedules: Array<{ schedule_id: number; title: string; status: string }>;
}
export interface CoverageReport {
  term_id: number;
  class_groups: Array<{ class_group_id: number; name: string; students: number; covered: number; coverage_rate: number | null; days: Record<number, number> }>;
  students_without: Array<{ student_id: number; name: string }>;
}
export interface OverviewReport {
  today: { date: string; sessions: number; expected: number; marked: number; missing: number };
  open_escalations: number;
  names_allowed: boolean;
}

export interface ScheduleInput {
  academic_term_id?: number | null;
  teacher_id?: number;
  title?: string;
  purpose?: string;
  subject_id?: number | null;
  days?: number[];
  start_time?: string;
  end_time?: string;
  location?: string | null;
  capacity?: number;
  effective_from?: string;
  effective_to?: string;
  notes?: string | null;
  status?: "DRAFT" | "ACTIVE";
  version?: number;
  student_ids?: number[];
  reason_code?: string;
}

export const officeHoursApi = {
  config: (termId?: number | null) =>
    api.get<Envelope<OfficeHoursConfig>>("/office-hours/config", { params: termId ? { term_id: termId } : undefined }),

  my: (termId?: number | null) =>
    api.get<Envelope<MyOfficeHours>>("/office-hours/my", { params: termId ? { term_id: termId } : undefined }),

  createSchedule: (input: ScheduleInput) =>
    api.post<Envelope<{ schedule: OfficeHourSchedule; assignment: AssignResult | null }>>("/office-hours/schedules", input),

  schedule: (id: number) =>
    api.get<Envelope<{ schedule: OfficeHourSchedule; roster: RosterRow[]; sessions: OfficeHourSession[] }>>(`/office-hours/schedules/${id}`),

  updateSchedule: (id: number, input: ScheduleInput) => api.patch<Envelope<OfficeHourSchedule>>(`/office-hours/schedules/${id}`, input),
  publishSchedule: (id: number) => api.post<Envelope<OfficeHourSchedule>>(`/office-hours/schedules/${id}/publish`),
  endSchedule: (id: number) => api.post<Envelope<OfficeHourSchedule>>(`/office-hours/schedules/${id}/end`),
  deleteSchedule: (id: number) => api.delete<Envelope<void>>(`/office-hours/schedules/${id}`),

  candidates: (id: number, params: { class_group_id?: number | null; q?: string; only_free?: boolean } = {}) =>
    api.get<Envelope<CandidatesResponse>>(`/office-hours/schedules/${id}/candidates`, {
      params: {
        ...(params.class_group_id ? { class_group_id: params.class_group_id } : {}),
        ...(params.q ? { q: params.q } : {}),
        ...(params.only_free ? { only_free: 1 } : {}),
      },
    }),

  assign: (id: number, body: { student_ids: number[]; reason_code?: string; reason_note?: string }) =>
    api.post<Envelope<AssignResult>>(`/office-hours/schedules/${id}/assignments`, body),

  removeAssignment: (assignmentId: number, body: { end_reason_code: string; end_note?: string }) =>
    api.delete<Envelope<RosterRow>>(`/office-hours/assignments/${assignmentId}`, { data: body }),

  transfers: () => api.get<Envelope<{ incoming: TransferRequest[]; outgoing: TransferRequest[] }>>("/office-hours/transfer-requests"),
  requestTransfer: (body: { student_id: number; to_schedule_id: number; message?: string }) =>
    api.post<Envelope<{ request_id: number }>>("/office-hours/transfer-requests", body),
  acceptTransfer: (id: number, note?: string) => api.post<Envelope<void>>(`/office-hours/transfer-requests/${id}/accept`, { note }),
  declineTransfer: (id: number, note?: string) => api.post<Envelope<void>>(`/office-hours/transfer-requests/${id}/decline`, { note }),
  cancelTransfer: (id: number) => api.post<Envelope<void>>(`/office-hours/transfer-requests/${id}/cancel`),

  sessions: (from: string, to: string) =>
    api.get<Envelope<{ from: string; to: string; sessions: OfficeHourSession[] }>>("/office-hours/sessions", { params: { from, to } }),
  cancelSession: (id: number, reason: string, note?: string) =>
    api.post<Envelope<OfficeHourSession>>(`/office-hours/sessions/${id}/cancel`, { reason, note }),
  restoreSession: (id: number) => api.post<Envelope<OfficeHourSession>>(`/office-hours/sessions/${id}/restore`),
  setHost: (id: number, teacherId: number) => api.post<Envelope<OfficeHourSession>>(`/office-hours/sessions/${id}/host`, { teacher_id: teacherId }),

  register: (sessionId: number) => api.get<Envelope<RegisterData>>(`/office-hours/sessions/${sessionId}/register`),
  saveRegister: (sessionId: number, body: { records: RegisterRecordInput[]; topic?: string | null; version?: number }) =>
    api.put<Envelope<RegisterData>>(`/office-hours/sessions/${sessionId}/register`, body),
  registerHistory: (sessionId: number) =>
    api.get<Envelope<Array<{ history_id: number; student_id: number; student_name: string | null; previous_status: string | null; new_status: string | null; changed_by_name: string | null; changed_at: string; source: string }>>>(
      `/office-hours/sessions/${sessionId}/history`,
    ),
  searchStudents: (q: string) => api.get<Envelope<StudentCard[]>>("/office-hours/students", { params: { q } }),
  adminUnmarked: (from?: string, to?: string) => api.get<Envelope<UnmarkedSession[]>>("/office-hours/admin/unmarked", { params: { from, to } }),

  me: (params: { term_id?: number | null; student_id?: number } = {}) =>
    api.get<Envelope<StudentOverview>>("/office-hours/me", {
      params: { ...(params.term_id ? { term_id: params.term_id } : {}), ...(params.student_id ? { student_id: params.student_id } : {}) },
    }),
  children: (termId?: number | null) =>
    api.get<Envelope<{ children: Array<StudentOverview & { student: StudentCard | null }> }>>("/office-hours/children", {
      params: termId ? { term_id: termId } : undefined,
    }),

  band: (params: { term_id?: number | null; class_group_id?: number | null } = {}) =>
    api.get<Envelope<{ entries: BandEntry[]; mode: "personal" | "class_group" | "none" }>>("/office-hours/band", {
      params: {
        ...(params.term_id ? { term_id: params.term_id } : {}),
        ...(params.class_group_id ? { class_group_id: params.class_group_id } : {}),
      },
    }),

  adminSchedules: (params: { term_id?: number | null; teacher_id?: number; subject_id?: number; status?: string } = {}) =>
    api.get<Envelope<{ term_id: number; schedules: OfficeHourSchedule[] }>>("/office-hours/admin/schedules", { params }),
  override: (body: { student_id: number; to_schedule_id: number; reason: string }) =>
    api.post<Envelope<{ assignment_id: number }>>("/office-hours/admin/assignments/override", body),
  nudgeUnmarked: (sessionIds: number[]) => api.post<Envelope<{ notified: number }>>("/office-hours/admin/unmarked/nudge", { session_ids: sessionIds }),
  checkInToken: (sessionId: number) =>
    api.post<Envelope<{ token: string; code: string; session_id: number; expires_in: number; rotates_every: number }>>(`/office-hours/sessions/${sessionId}/checkin-token`),
  checkIn: (body: { token?: string; session_id?: number; code?: string }) =>
    api.post<Envelope<{ status: AttendanceStatus; already: boolean; drop_in: boolean; title?: string }>>("/office-hours/checkin", body),
  sendAbsenceNotice: (sessionId: number, reason: string, note?: string) => api.post<Envelope<null>>(`/office-hours/sessions/${sessionId}/absence-notice`, { reason, note }),
  withdrawAbsenceNotice: (sessionId: number) => api.delete<Envelope<null>>(`/office-hours/sessions/${sessionId}/absence-notice`),
  suggestions: (scheduleId: number) => api.get<Envelope<{ task_mentor: "ok" | "unavailable"; students: Suggestion[] }>>(`/office-hours/schedules/${scheduleId}/suggestions`),
  rollover: (scheduleId: number, toTermId: number) =>
    api.post<Envelope<{ schedule_id: number; assignment: AssignResult | null }>>(`/office-hours/schedules/${scheduleId}/rollover`, { to_term_id: toTermId }),
  moveSession: (sessionId: number, body: { date: string; start_time?: string; end_time?: string; location?: string }) =>
    api.post<Envelope<OfficeHourSession>>(`/office-hours/sessions/${sessionId}/move`, body),
  summary: (q: ReportQuery) => api.get<Envelope<SummaryReport>>("/office-hours/reports/summary", { params: q }),
  breakdown: (q: ReportQuery & { group_by: GroupBy }) => api.get<Envelope<{ period: ReportPeriod; group_by: GroupBy; rows: BreakdownRow[] }>>("/office-hours/reports/breakdown", { params: q }),
  consistency: (q: ReportQuery) => api.get<Envelope<ConsistencyReport>>("/office-hours/reports/consistency", { params: q }),
  daily: (date: string, termId?: number | null) => api.get<Envelope<DailySheet>>("/office-hours/reports/daily", { params: { date, term_id: termId ?? undefined } }),
  studentReport: (id: number, q: Partial<ReportQuery> = {}) => api.get<Envelope<StudentReport>>(`/office-hours/reports/students/${id}`, { params: q }),
  teacherReport: (id: number, q: Partial<ReportQuery> = {}) => api.get<Envelope<TeacherReport>>(`/office-hours/reports/teachers/${id}`, { params: q }),
  coverage: (termId: number | null, classGroupId?: number | null) =>
    api.get<Envelope<CoverageReport>>("/office-hours/admin/coverage", { params: { term_id: termId ?? undefined, class_group_id: classGroupId ?? undefined } }),
  overview: (termId: number | null) => api.get<Envelope<OverviewReport>>("/office-hours/admin/overview", { params: { term_id: termId ?? undefined } }),
  escalations: (params: { term_id?: number | null; status?: "open" | "all" } = {}) =>
    api.get<Envelope<Escalation[]>>("/office-hours/escalations", { params }),
  acknowledgeEscalation: (id: number, note?: string) => api.post<Envelope<void>>(`/office-hours/escalations/${id}/ack`, { note }),
  adminTransfers: () => api.get<Envelope<{ incoming: TransferRequest[] }>>("/office-hours/admin/transfer-requests"),

  closures: (from?: string, to?: string) => api.get<Envelope<Closure[]>>("/office-hours/closures", { params: { from, to } }),
  previewClosure: (start_date: string, end_date: string) =>
    api.get<Envelope<{ sessions_affected: number }>>("/office-hours/closures/preview", { params: { start_date, end_date } }),
  createClosure: (body: { start_date: string; end_date: string; reason: string; scope?: "ALL" | "OFFICE_HOURS" }) =>
    api.post<Envelope<{ closure_id: number; sessions_cancelled: number }>>("/office-hours/closures", body),
  deleteClosure: (id: number) => api.delete<Envelope<{ restored: number }>>(`/office-hours/closures/${id}`),

  settings: () => api.get<Envelope<Record<string, unknown>>>("/office-hours/settings"),
  saveSettings: (body: Record<string, unknown>) => api.put<Envelope<Record<string, unknown>>>("/office-hours/settings", body),
};

/** "Mon, Wed" from backend days. */
export const DAY_SHORT: Record<number, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri" };
export const DAY_LONG: Record<number, string> = { 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday" };

export const humanize = (code: string | null | undefined) =>
  (code ?? "")
    .toLowerCase()
    .split("_")
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");

export const studentName = (s: Pick<StudentCard, "first_name" | "last_name"> | null | undefined) =>
  [s?.first_name, s?.last_name].filter(Boolean).join(" ") || "Student";

/** Error text from an API failure, falling back to a friendly default. */
export const apiError = (error: unknown, fallback = "Something went wrong — please try again") => {
  const e = error as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message || fallback;
};

/** "Tue 6 Oct" for a YYYY-MM-DD date (no time zone shifts). */
export const formatYmd = (ymd: string, opts: { weekday?: boolean; year?: boolean } = { weekday: true }) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: opts.weekday ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: opts.year ? "numeric" : undefined,
  });
};
