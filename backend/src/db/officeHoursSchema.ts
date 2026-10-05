import {
  mysqlTable,
  bigint,
  varchar,
  mysqlEnum,
  datetime,
  date,
  tinyint,
  smallint,
  int,
  text,
  timestamp,
  primaryKey,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * Mandatory office hours (migration 102, OFFICE_HOURS_IMPLEMENTATION_PLAN.md §6).
 * Kept out of schema.ts, like reminderSchema.ts, so the feature's data model
 * reads as one unit.
 *
 * DATE columns are Kigali calendar dates, read and written as "YYYY-MM-DD"
 * strings (mode "string") so no host time zone ever shifts them. DATETIME
 * columns are UTC instants (Drizzle writes Dates as UTC text). day_of_week is
 * the timetable's encoding: 1 = Monday ... 5 = Friday.
 */

export const OfficeHourSetting = mysqlTable("OfficeHourSetting", {
  id: tinyint("id").primaryKey(),
  student_lock_mode: mysqlEnum("student_lock_mode", ["TERM", "WEEKDAY"]).notNull().default("TERM"),
  allow_any_student: tinyint("allow_any_student").notNull().default(0),
  band_start: varchar("band_start", { length: 5 }).notNull().default("16:20"),
  band_end: varchar("band_end", { length: 5 }).notNull().default("17:20"),
  allowed_window_start: varchar("allowed_window_start", { length: 5 }).notNull().default("16:00"),
  allowed_window_end: varchar("allowed_window_end", { length: 5 }).notNull().default("18:00"),
  default_capacity: smallint("default_capacity").notNull().default(15),
  max_capacity: smallint("max_capacity").notNull().default(40),
  roster_cutoff_time: varchar("roster_cutoff_time", { length: 5 }).notNull().default("14:00"),
  late_after_minutes: smallint("late_after_minutes").notNull().default(10),
  register_edit_days: smallint("register_edit_days").notNull().default(7),
  auto_close_unmarked: tinyint("auto_close_unmarked").notNull().default(0),
  escalation_consecutive_l1: smallint("escalation_consecutive_l1").notNull().default(2),
  escalation_month_l1: smallint("escalation_month_l1").notNull().default(2),
  escalation_consecutive_l2: smallint("escalation_consecutive_l2").notNull().default(3),
  rate_band_consistent: smallint("rate_band_consistent").notNull().default(90),
  rate_band_watch: smallint("rate_band_watch").notNull().default(80),
  min_sessions_for_rate: smallint("min_sessions_for_rate").notNull().default(3),
  parent_notifications: mysqlEnum("parent_notifications", ["OFF", "ESCALATIONS", "WEEKLY"]).notNull().default("ESCALATIONS"),
  qr_checkin_enabled: tinyint("qr_checkin_enabled").notNull().default(0),
  updated_by: bigint("updated_by", { mode: "number" }),
  updated_at: datetime("updated_at"),
});

export const OfficeHourSchedule = mysqlTable("OfficeHourSchedule", {
  schedule_id: bigint("schedule_id", { mode: "number" }).primaryKey().autoincrement(),
  academic_year_id: bigint("academic_year_id", { mode: "number" }).notNull(),
  academic_term_id: bigint("academic_term_id", { mode: "number" }).notNull(),
  teacher_id: bigint("teacher_id", { mode: "number" }).notNull(),
  subject_id: bigint("subject_id", { mode: "number" }),
  title: varchar("title", { length: 150 }).notNull(),
  purpose: varchar("purpose", { length: 30 }).notNull().default("ACADEMIC_SUPPORT"),
  start_time: varchar("start_time", { length: 5 }).notNull(),
  end_time: varchar("end_time", { length: 5 }).notNull(),
  location: varchar("location", { length: 100 }),
  capacity: smallint("capacity").notNull().default(15),
  effective_from: date("effective_from", { mode: "string" }).notNull(),
  effective_to: date("effective_to", { mode: "string" }).notNull(),
  status: mysqlEnum("status", ["DRAFT", "ACTIVE", "ENDED", "CANCELLED"]).notNull().default("ACTIVE"),
  notes: text("notes"),
  created_by: bigint("created_by", { mode: "number" }),
  updated_by: bigint("updated_by", { mode: "number" }),
  ended_at: datetime("ended_at"),
  version: int("version").notNull().default(1),
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const OfficeHourScheduleDay = mysqlTable(
  "OfficeHourScheduleDay",
  {
    schedule_id: bigint("schedule_id", { mode: "number" }).notNull(),
    day_of_week: tinyint("day_of_week").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.schedule_id, t.day_of_week] }) }),
);

export const OfficeHourAssignment = mysqlTable("OfficeHourAssignment", {
  assignment_id: bigint("assignment_id", { mode: "number" }).primaryKey().autoincrement(),
  schedule_id: bigint("schedule_id", { mode: "number" }).notNull(),
  academic_term_id: bigint("academic_term_id", { mode: "number" }).notNull(),
  student_id: bigint("student_id", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["ACTIVE", "ENDED"]).notNull().default("ACTIVE"),
  effective_from: date("effective_from", { mode: "string" }).notNull(),
  effective_to: date("effective_to", { mode: "string" }).notNull(),
  reason_code: varchar("reason_code", { length: 30 }),
  reason_note: varchar("reason_note", { length: 500 }),
  clash_note: varchar("clash_note", { length: 255 }),
  end_reason_code: varchar("end_reason_code", { length: 30 }),
  end_note: varchar("end_note", { length: 500 }),
  assigned_by: bigint("assigned_by", { mode: "number" }),
  ended_by: bigint("ended_by", { mode: "number" }),
  assigned_at: datetime("assigned_at"),
  ended_at: datetime("ended_at"),
});

export const OfficeHourStudentLock = mysqlTable(
  "OfficeHourStudentLock",
  {
    academic_term_id: bigint("academic_term_id", { mode: "number" }).notNull(),
    student_id: bigint("student_id", { mode: "number" }).notNull(),
    day_of_week: tinyint("day_of_week").notNull(),
    assignment_id: bigint("assignment_id", { mode: "number" }).notNull(),
    created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ pk: primaryKey({ columns: [t.academic_term_id, t.student_id, t.day_of_week] }) }),
);

/**
 * The no-overlap guarantee per date (migration 104): PK (student, lock_date).
 * Replaces OfficeHourStudentLock's (term, student, weekday), which held a
 * student for the whole term and so could not express weekly invitations.
 */
export const OfficeHourStudentDateLock = mysqlTable(
  "OfficeHourStudentDateLock",
  {
    student_id: bigint("student_id", { mode: "number" }).notNull(),
    lock_date: date("lock_date", { mode: "string" }).notNull(),
    academic_term_id: bigint("academic_term_id", { mode: "number" }).notNull(),
    assignment_id: bigint("assignment_id", { mode: "number" }).notNull(),
    created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ pk: primaryKey({ columns: [t.student_id, t.lock_date] }) }),
);

export const OfficeHourSession = mysqlTable("OfficeHourSession", {
  session_id: bigint("session_id", { mode: "number" }).primaryKey().autoincrement(),
  schedule_id: bigint("schedule_id", { mode: "number" }).notNull(),
  academic_term_id: bigint("academic_term_id", { mode: "number" }).notNull(),
  session_date: date("session_date", { mode: "string" }).notNull(),
  start_time: varchar("start_time", { length: 5 }).notNull(),
  end_time: varchar("end_time", { length: 5 }).notNull(),
  host_teacher_id: bigint("host_teacher_id", { mode: "number" }).notNull(),
  location: varchar("location", { length: 100 }),
  status: mysqlEnum("status", ["SCHEDULED", "HELD", "CANCELLED"]).notNull().default("SCHEDULED"),
  cancel_reason: varchar("cancel_reason", { length: 30 }),
  cancel_note: varchar("cancel_note", { length: 255 }),
  cancelled_by: bigint("cancelled_by", { mode: "number" }),
  cancelled_at: datetime("cancelled_at"),
  topic: varchar("topic", { length: 255 }),
  /** A one-off session moved from another date; the original stays CANCELLED (MOVED). */
  moved_from_session_id: bigint("moved_from_session_id", { mode: "number" }),
  register_first_saved_at: datetime("register_first_saved_at"),
  register_last_saved_at: datetime("register_last_saved_at"),
  register_saved_by: bigint("register_saved_by", { mode: "number" }),
  version: int("version").notNull().default(1),
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;
export type OfficeHourAttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const OfficeHourAttendance = mysqlTable(
  "OfficeHourAttendance",
  {
    session_id: bigint("session_id", { mode: "number" }).notNull(),
    student_id: bigint("student_id", { mode: "number" }).notNull(),
    assignment_id: bigint("assignment_id", { mode: "number" }),
    is_drop_in: tinyint("is_drop_in").notNull().default(0),
    status: mysqlEnum("status", ATTENDANCE_STATUSES),
    excuse_reason: varchar("excuse_reason", { length: 30 }),
    arrived_at: varchar("arrived_at", { length: 5 }),
    note: varchar("note", { length: 255 }),
    outcome: tinyint("outcome"),
    follow_up: tinyint("follow_up").notNull().default(0),
    source: mysqlEnum("source", ["TEACHER", "QR", "AUTO", "IMPORT"]).notNull().default("TEACHER"),
    marked_by: bigint("marked_by", { mode: "number" }),
    marked_at: datetime("marked_at"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.session_id, t.student_id] }) }),
);

export const OfficeHourAttendanceHistory = mysqlTable("OfficeHourAttendanceHistory", {
  history_id: bigint("history_id", { mode: "number" }).primaryKey().autoincrement(),
  session_id: bigint("session_id", { mode: "number" }).notNull(),
  student_id: bigint("student_id", { mode: "number" }).notNull(),
  previous_status: varchar("previous_status", { length: 10 }),
  new_status: varchar("new_status", { length: 10 }),
  previous_note: varchar("previous_note", { length: 255 }),
  new_note: varchar("new_note", { length: 255 }),
  source: varchar("source", { length: 10 }).notNull().default("TEACHER"),
  changed_by: bigint("changed_by", { mode: "number" }),
  changed_at: datetime("changed_at").notNull(),
});

export const OfficeHourEscalation = mysqlTable("OfficeHourEscalation", {
  escalation_id: bigint("escalation_id", { mode: "number" }).primaryKey().autoincrement(),
  student_id: bigint("student_id", { mode: "number" }).notNull(),
  assignment_id: bigint("assignment_id", { mode: "number" }).notNull(),
  academic_term_id: bigint("academic_term_id", { mode: "number" }).notNull(),
  level: tinyint("level").notNull(),
  trigger_code: varchar("trigger_code", { length: 20 }).notNull(),
  trigger_session_id: bigint("trigger_session_id", { mode: "number" }).notNull(),
  notified_user_ids: text("notified_user_ids"),
  created_at: datetime("created_at").notNull(),
  acknowledged_by: bigint("acknowledged_by", { mode: "number" }),
  acknowledged_at: datetime("acknowledged_at"),
  resolution_note: varchar("resolution_note", { length: 500 }),
});

export const OfficeHourTransferRequest = mysqlTable("OfficeHourTransferRequest", {
  request_id: bigint("request_id", { mode: "number" }).primaryKey().autoincrement(),
  student_id: bigint("student_id", { mode: "number" }).notNull(),
  from_assignment_id: bigint("from_assignment_id", { mode: "number" }).notNull(),
  to_schedule_id: bigint("to_schedule_id", { mode: "number" }).notNull(),
  requested_by: bigint("requested_by", { mode: "number" }).notNull(),
  message: varchar("message", { length: 500 }),
  status: mysqlEnum("status", ["PENDING", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"]).notNull().default("PENDING"),
  decided_by: bigint("decided_by", { mode: "number" }),
  decided_at: datetime("decided_at"),
  decision_note: varchar("decision_note", { length: 500 }),
  expires_at: datetime("expires_at").notNull(),
  created_at: datetime("created_at").notNull(),
});

export const OfficeHourAbsenceNotice = mysqlTable("OfficeHourAbsenceNotice", {
  notice_id: bigint("notice_id", { mode: "number" }).primaryKey().autoincrement(),
  session_id: bigint("session_id", { mode: "number" }).notNull(),
  student_id: bigint("student_id", { mode: "number" }).notNull(),
  reason: varchar("reason", { length: 30 }).notNull(),
  note: varchar("note", { length: 255 }),
  created_at: datetime("created_at").notNull(),
});

export const SchoolClosure = mysqlTable("SchoolClosure", {
  closure_id: bigint("closure_id", { mode: "number" }).primaryKey().autoincrement(),
  start_date: date("start_date", { mode: "string" }).notNull(),
  end_date: date("end_date", { mode: "string" }).notNull(),
  reason: varchar("reason", { length: 150 }).notNull(),
  scope: mysqlEnum("scope", ["ALL", "OFFICE_HOURS"]).notNull().default("ALL"),
  created_by: bigint("created_by", { mode: "number" }),
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});
