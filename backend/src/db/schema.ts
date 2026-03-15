import {
  mysqlTable,
  bigint,
  varchar,
  mysqlEnum,
  datetime,
  date,
  tinyint,
  int,
  text,
  json,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// User table
export const User = mysqlTable("User", {
  user_id: bigint("user_id", { mode: "number" }).primaryKey().autoincrement(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  email: varchar("email", { length: 150 }).notNull().unique(),
  phone_number: varchar("phone_number", { length: 50 }),
  status: mysqlEnum("status", ["ACTIVE", "INACTIVE", "SUSPENDED"]).default(
    "ACTIVE",
  ),
  preferred_theme: mysqlEnum("preferred_theme", ["light", "dark"]).default(
    "light",
  ),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// UserProfile table
export const UserProfile = mysqlTable("UserProfile", {
  profile_id: bigint("profile_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  first_name: varchar("first_name", { length: 100 }),
  last_name: varchar("last_name", { length: 100 }),
  gender: mysqlEnum("gender", ["MALE", "FEMALE", "OTHER"]),
  date_of_birth: date("date_of_birth"),
  address: varchar("address", { length: 255 }),
  user_type: mysqlEnum("user_type", [
    "STUDENT",
    "TEACHER",
    "ADMIN",
    "PARENT",
    "STAFF",
  ]),
  external_id: varchar("external_id", { length: 100 }),
});

// AuthCredential table
export const AuthCredential = mysqlTable("AuthCredential", {
  auth_id: bigint("auth_id", { mode: "number" }).primaryKey().autoincrement(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  password_hash: varchar("password_hash", { length: 255 }).notNull(),
  force_password_change: tinyint("force_password_change").default(0),
  mfa_enabled: tinyint("mfa_enabled").default(0),
  failed_attempts: int("failed_attempts").default(0),
  locked_until: datetime("locked_until"),
});

// OTP table for 2FA
export const OTP = mysqlTable("OTP", {
  otp_id: bigint("otp_id", { mode: "number" }).primaryKey().autoincrement(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  otp_code: varchar("otp_code", { length: 6 }).notNull(),
  otp_type: mysqlEnum("otp_type", [
    "LOGIN_2FA",
    "PASSWORD_RESET",
    "EMAIL_VERIFICATION",
  ]).default("LOGIN_2FA"),
  expires_at: datetime("expires_at").notNull(),
  is_used: tinyint("is_used").default(0),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// Role table
export const Role = mysqlTable("Role", {
  role_id: bigint("role_id", { mode: "number" }).primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: varchar("description", { length: 255 }),
  status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).default("ACTIVE"),
});

// Permission table
export const Permission = mysqlTable("Permission", {
  perm_id: bigint("perm_id", { mode: "number" }).primaryKey().autoincrement(),
  name: varchar("name", { length: 150 }).notNull().unique(),
  description: varchar("description", { length: 255 }),
  status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).default("ACTIVE"),
});

// RolePermission junction table
export const RolePermission = mysqlTable(
  "RolePermission",
  {
    role_id: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => Role.role_id),
    perm_id: bigint("perm_id", { mode: "number" })
      .notNull()
      .references(() => Permission.perm_id),
  },
  (table) => ({
    pk: primaryKey(table.role_id, table.perm_id),
  }),
);

// UserRole junction table
export const UserRole = mysqlTable(
  "UserRole",
  {
    user_id: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => User.user_id),
    role_id: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => Role.role_id),
  },
  (table) => ({
    pk: primaryKey(table.user_id, table.role_id),
  }),
);

// Program table
export const Program = mysqlTable("Program", {
  program_id: bigint("program_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: varchar("description", { length: 255 }),
});

// UserProgramLead junction table
export const UserProgramLead = mysqlTable(
  "UserProgramLead",
  {
    user_id: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => User.user_id),
    program_id: bigint("program_id", { mode: "number" })
      .notNull()
      .references(() => Program.program_id),
    assigned_at: datetime("assigned_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey(table.user_id, table.program_id),
  }),
);

// Grade table
export const Grade = mysqlTable("Grade", {
  grade_id: bigint("grade_id", { mode: "number" }).primaryKey().autoincrement(),
  program_id: bigint("program_id", { mode: "number" })
    .notNull()
    .references(() => Program.program_id),
  name: varchar("name", { length: 50 }).notNull(),
  level_order: int("level_order").notNull(),
});

// CourseCategory table
export const CourseCategory = mysqlTable("CourseCategory", {
  category_id: bigint("category_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: varchar("description", { length: 255 }),
  status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).default("ACTIVE"),
});

// Subject table
export const Subject = mysqlTable("Subject", {
  subject_id: bigint("subject_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  code: varchar("code", { length: 50 }).unique(),
  name: varchar("name", { length: 150 }).notNull(),
  description: varchar("description", { length: 255 }),
  course_category_id: bigint("course_category_id", {
    mode: "number",
  }).references(() => CourseCategory.category_id),
  max_marks: int("max_marks"),
  color: varchar("color", { length: 7 }).default("#3B82F6"),
  status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).default("ACTIVE"),
});

// GradeSubject junction table
export const GradeSubject = mysqlTable(
  "GradeSubject",
  {
    grade_id: bigint("grade_id", { mode: "number" })
      .notNull()
      .references(() => Grade.grade_id),
    subject_id: bigint("subject_id", { mode: "number" })
      .notNull()
      .references(() => Subject.subject_id),
  },
  (table) => ({
    pk: primaryKey(table.grade_id, table.subject_id),
  }),
);

// AcademicYear table
export const AcademicYear = mysqlTable("AcademicYear", {
  academic_year_id: bigint("academic_year_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  name: varchar("name", { length: 50 }).notNull(),
  start_date: date("start_date"),
  end_date: date("end_date"),
  is_current: tinyint("is_current").default(0),
});

// AcademicTerm table
export const AcademicTerm = mysqlTable("AcademicTerm", {
  academic_term_id: bigint("academic_term_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  academic_year_id: bigint("academic_year_id", { mode: "number" })
    .notNull()
    .references(() => AcademicYear.academic_year_id),
  name: varchar("name", { length: 50 }),
  start_date: date("start_date"),
  end_date: date("end_date"),
  is_current: tinyint("is_current").default(0),
});

// ClassGroup table
export const ClassGroup = mysqlTable("ClassGroup", {
  class_group_id: bigint("class_group_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  academic_year_id: bigint("academic_year_id", { mode: "number" })
    .notNull()
    .references(() => AcademicYear.academic_year_id),
  grade_id: bigint("grade_id", { mode: "number" })
    .notNull()
    .references(() => Grade.grade_id),
  name: varchar("name", { length: 50 }).notNull(),
});

// StudentClassGroup table
export const StudentClassGroup = mysqlTable(
  "StudentClassGroup",
  {
    user_id: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => User.user_id),
    class_group_id: bigint("class_group_id", { mode: "number" })
      .notNull()
      .references(() => ClassGroup.class_group_id),
    assigned_at: datetime("assigned_at").default(sql`CURRENT_TIMESTAMP`),
    status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).default("ACTIVE"),
  },
  (table) => ({
    pk: primaryKey(table.user_id, table.class_group_id),
  }),
);

// StudentSubjectEnrollment table
export const StudentSubjectEnrollment = mysqlTable(
  "StudentSubjectEnrollment",
  {
    user_id: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => User.user_id),
    subject_id: bigint("subject_id", { mode: "number" })
      .notNull()
      .references(() => Subject.subject_id),
    academic_term_id: bigint("academic_term_id", { mode: "number" })
      .notNull()
      .references(() => AcademicTerm.academic_term_id),
    enrolled_at: datetime("enrolled_at").default(sql`CURRENT_TIMESTAMP`),
    status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).default("ACTIVE"),
  },
  (table) => ({
    pk: primaryKey(table.user_id, table.subject_id, table.academic_term_id),
  }),
);

// TeacherSubjectAssignment table
export const TeacherSubjectAssignment = mysqlTable(
  "TeacherSubjectAssignment",
  {
    user_id: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => User.user_id),
    subject_id: bigint("subject_id", { mode: "number" })
      .notNull()
      .references(() => Subject.subject_id),
    class_group_id: bigint("class_group_id", { mode: "number" })
      .notNull()
      .references(() => ClassGroup.class_group_id),
    academic_term_id: bigint("academic_term_id", { mode: "number" })
      .notNull()
      .references(() => AcademicTerm.academic_term_id),
    assigned_at: datetime("assigned_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey(
      table.user_id,
      table.subject_id,
      table.class_group_id,
      table.academic_term_id,
    ),
  }),
);

// UserGrade junction table for class teacher grade assignments
export const UserGrade = mysqlTable(
  "UserGrade",
  {
    user_id: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => User.user_id),
    grade_id: bigint("grade_id", { mode: "number" })
      .notNull()
      .references(() => Grade.grade_id),
    assigned_at: datetime("assigned_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey(table.user_id, table.grade_id),
  }),
);

// DocumentFolder table for user document management
export const DocumentFolder = mysqlTable("DocumentFolder", {
  folder_id: bigint("folder_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  parent_folder_id: bigint("parent_folder_id", { mode: "number" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 500 }),
  color: varchar("color", { length: 7 }).default("#008d3b"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// Document table for file storage
export const Document = mysqlTable("Document", {
  document_id: bigint("document_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  folder_id: bigint("folder_id", { mode: "number" }),
  file_name: varchar("file_name", { length: 255 }).notNull(),
  original_name: varchar("original_name", { length: 255 }).notNull(),
  file_path: varchar("file_path", { length: 500 }).notNull(),
  file_size: bigint("file_size", { mode: "number" }).notNull(),
  mime_type: varchar("mime_type", { length: 100 }).notNull(),
  file_extension: varchar("file_extension", { length: 20 }).notNull(),
  is_public: tinyint("is_public").default(0),
  description: varchar("description", { length: 500 }),
  tags: varchar("tags", { length: 500 }),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// DocumentVersion table for version control
export const DocumentVersion = mysqlTable("DocumentVersion", {
  version_id: bigint("version_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  document_id: bigint("document_id", { mode: "number" })
    .notNull()
    .references(() => Document.document_id),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  version_number: int("version_number").notNull(),
  file_name: varchar("file_name", { length: 255 }).notNull(),
  file_path: varchar("file_path", { length: 500 }).notNull(),
  file_size: bigint("file_size", { mode: "number" }).notNull(),
  change_description: varchar("change_description", { length: 500 }),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// DocumentPermission table for sharing documents
export const DocumentPermission = mysqlTable(
  "DocumentPermission",
  {
    permission_id: bigint("permission_id", { mode: "number" })
      .primaryKey()
      .autoincrement(),
    document_id: bigint("document_id", { mode: "number" })
      .notNull()
      .references(() => Document.document_id),
    user_id: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => User.user_id),
    permission_type: mysqlEnum("permission_type", [
      "VIEW",
      "EDIT",
      "DOWNLOAD",
      "SHARE",
    ]).default("VIEW"),
    shared_by: bigint("shared_by", { mode: "number" })
      .notNull()
      .references(() => User.user_id),
    shared_with: mysqlEnum("shared_with", ["user", "role"]).default("user"),
    // Filter fields for granular role-based sharing (array of IDs)
    filter_type: mysqlEnum("filter_type", [
      "subject_assigned",
      "subject_enrolled",
      "program_assigned",
      "grade_assigned",
    ]),
    filter_ids: json("filter_ids"),
    academic_term_id: bigint("academic_term_id", { mode: "number" }).references(
      () => AcademicTerm.academic_term_id,
    ),
    expires_at: datetime("expires_at"),
    created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey(table.permission_id),
  }),
);

// FolderPermission table for sharing folders
export const FolderPermission = mysqlTable(
  "FolderPermission",
  {
    permission_id: bigint("permission_id", { mode: "number" })
      .primaryKey()
      .autoincrement(),
    folder_id: bigint("folder_id", { mode: "number" })
      .notNull()
      .references(() => DocumentFolder.folder_id),
    user_id: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => User.user_id),
    permission_type: mysqlEnum("permission_type", [
      "VIEW",
      "EDIT",
      "SHARE",
    ]).default("VIEW"),
    shared_by: bigint("shared_by", { mode: "number" })
      .notNull()
      .references(() => User.user_id),
    // Filter fields for granular role-based sharing (array of IDs)
    filter_type: mysqlEnum("filter_type", [
      "subject_assigned",
      "subject_enrolled",
      "program_assigned",
      "grade_assigned",
    ]),
    filter_ids: json("filter_ids"),
    academic_term_id: bigint("academic_term_id", { mode: "number" }).references(
      () => AcademicTerm.academic_term_id,
    ),
    expires_at: datetime("expires_at"),
    created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey(table.permission_id),
  }),
);

// Parenting table
export const Parenting = mysqlTable(
  "Parenting",
  {
    parenting_id: bigint("parenting_id", { mode: "number" })
      .primaryKey()
      .autoincrement(),
    student_id: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => User.user_id),
    parent_id: bigint("parent_id", { mode: "number" })
      .notNull()
      .references(() => User.user_id),
    relationship: varchar("relationship", { length: 50 }).default("PARENT"),
    created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    unique_pair: uniqueIndex("unique_student_parent").on(
      table.student_id,
      table.parent_id,
    ),
  }),
);

// ActivityLog table for centralizing generic events
export const ActivityLog = mysqlTable("ActivityLog", {
  activity_id: bigint("activity_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  actor_id: bigint("actor_id", { mode: "number" }).references(
    () => User.user_id,
  ),
  action_type: varchar("action_type", { length: 50 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  entity_type: varchar("entity_type", { length: 50 }),
  entity_id: bigint("entity_id", { mode: "number" }),
  metadata: text("metadata"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// School table (Tenant)
export const School = mysqlTable("School", {
  school_id: bigint("school_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  name: varchar("name", { length: 150 }).notNull().unique(),
  address: varchar("address", { length: 255 }),
  contact_email: varchar("contact_email", { length: 150 }),
  contact_phone: varchar("contact_phone", { length: 50 }),
  logo: varchar("logo", { length: 500 }),
  status: mysqlEnum("status", ["ACTIVE", "INACTIVE", "SUSPENDED"]).default(
    "ACTIVE",
  ),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// System table (Module)
export const System = mysqlTable("System", {
  system_id: bigint("system_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: varchar("description", { length: 255 }),
  // SSO Fields
  client_id: varchar("client_id", { length: 100 }).unique(),
  client_secret: varchar("client_secret", { length: 255 }),
  allowed_redirect_uris: text("allowed_redirect_uris"),
  icon_url: varchar("icon_url", { length: 255 }).notNull(),
  home_url: varchar("home_url", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).default("ACTIVE"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// SchoolSystemAssignment table (School <-> System)
export const SchoolSystemAssignment = mysqlTable(
  "SchoolSystemAssignment",
  {
    school_id: bigint("school_id", { mode: "number" })
      .notNull()
      .references(() => School.school_id),
    system_id: bigint("system_id", { mode: "number" })
      .notNull()
      .references(() => System.system_id),
    assigned_at: datetime("assigned_at").default(sql`CURRENT_TIMESTAMP`),
    status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).default("ACTIVE"),
  },
  (table) => ({
    pk: primaryKey(table.school_id, table.system_id),
  }),
);

// RoleSystemFragment table (System <-> Role in a School context)
export const RoleSystemFragment = mysqlTable(
  "RoleSystemFragment",
  {
    fragment_id: bigint("fragment_id", { mode: "number" })
      .primaryKey()
      .autoincrement(),
    school_id: bigint("school_id", { mode: "number" })
      .notNull()
      .references(() => School.school_id),
    role_id: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => Role.role_id),
    system_id: bigint("system_id", { mode: "number" })
      .notNull()
      .references(() => System.system_id),
    assigned_at: datetime("assigned_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    unique_assignment: uniqueIndex("unique_role_system_school").on(
      table.school_id,
      table.role_id,
      table.system_id,
    ),
  }),
);
// SSOCode table for authorization code flow
export const SSOCode = mysqlTable("SSOCode", {
  code_id: bigint("code_id", { mode: "number" }).primaryKey().autoincrement(),
  code: varchar("code", { length: 100 }).notNull().unique(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  system_id: bigint("system_id", { mode: "number" })
    .notNull()
    .references(() => System.system_id),
  expires_at: datetime("expires_at").notNull(),
  is_used: tinyint("is_used").default(0),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// SchemeOfWork table
export const SchemeOfWork = mysqlTable("SchemeOfWork", {
  scheme_id: bigint("scheme_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  subject_id: bigint("subject_id", { mode: "number" })
    .notNull()
    .references(() => Subject.subject_id),
  class_group_id: bigint("class_group_id", { mode: "number" })
    .notNull()
    .references(() => ClassGroup.class_group_id),
  academic_term_id: bigint("academic_term_id", { mode: "number" })
    .notNull()
    .references(() => AcademicTerm.academic_term_id),
  validation_status: mysqlEnum("validation_status", [
    "PENDING",
    "APPROVED",
    "REJECTED",
  ]).default("PENDING"),
  validation_comment: text("validation_comment"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// SchemeOfWorkEntry table
export const SchemeOfWorkEntry = mysqlTable("SchemeOfWorkEntry", {
  entry_id: bigint("entry_id", { mode: "number" }).primaryKey().autoincrement(),
  scheme_id: bigint("scheme_id", { mode: "number" })
    .notNull()
    .references(() => SchemeOfWork.scheme_id),
  week_number: varchar("week_number", { length: 50 }),
  start_date: date("start_date"),
  end_date: date("end_date"),
  topic: text("topic"),
  sub_topic: text("sub_topic"),
  objective: text("objective"),
  methodology: text("methodology"),
  resources: text("resources"),
  evaluation: text("evaluation"),
  duration: varchar("duration", { length: 50 }).default(sql`NULL`),
  learning_place: varchar("learning_place", { length: 100 }).default(sql`NULL`),
  observation: text("observation").default(sql`NULL`),
  is_completed: tinyint("is_completed").default(0),
  validation_status: mysqlEnum("validation_status", [
    "PENDING",
    "APPROVED",
    "REJECTED",
  ]).default("PENDING"),
  validation_comment: text("validation_comment"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});
// LO_Lesson table (Master record for structured lesson plans)
export const LO_Lesson = mysqlTable("LO_Lesson", {
  id: int("id").primaryKey().autoincrement(),
  entry_id: bigint("entry_id", { mode: "number" }).references(
    () => SchemeOfWorkEntry.entry_id,
    { onDelete: "cascade" },
  ),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  session_code: varchar("session_code", { length: 50 }),
  sector: varchar("sector", { length: 100 }),
  trade: varchar("trade", { length: 100 }),
  level: varchar("level", { length: 50 }),
  module_code: varchar("module_code", { length: 50 }),
  module_name: varchar("module_name", { length: 255 }),
  week: int("week"),
  term: varchar("term", { length: 20 }),
  school_year: varchar("school_year", { length: 20 }),
  class_name: varchar("class_name", { length: 100 }),
  number_of_trainees: int("number_of_trainees"),
  lesson_date: date("lesson_date"),
  start_time: varchar("start_time", { length: 50 }), // Using varchar for flexibility or time("start_time")
  end_time: varchar("end_time", { length: 50 }),
  instructor_name: varchar("instructor_name", { length: 255 }),
  big_question: text("big_question"),
  total_duration_minutes: int("total_duration_minutes"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// LO_LearningOutcome table
export const LO_LearningOutcome = mysqlTable("LO_LearningOutcome", {
  id: int("id").primaryKey().autoincrement(),
  lesson_id: int("lesson_id")
    .notNull()
    .references(() => LO_Lesson.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 10 }), // LO1, LO2, LO3
  title: varchar("title", { length: 255 }),
  description: text("description"),
  duration_minutes: int("duration_minutes"),
});

// LO_LearningOutcomeActivity table
export const LO_LearningOutcomeActivity = mysqlTable(
  "LO_LearningOutcomeActivity",
  {
    id: int("id").primaryKey().autoincrement(),
    learning_outcome_id: int("learning_outcome_id")
      .notNull()
      .references(() => LO_LearningOutcome.id, { onDelete: "cascade" }),
    trainer_activities: text("trainer_activities"),
    learner_activities: text("learner_activities"),
  },
);

// LO_LearningOutcomeResource table
export const LO_LearningOutcomeResource = mysqlTable(
  "LO_LearningOutcomeResource",
  {
    id: int("id").primaryKey().autoincrement(),
    learning_outcome_id: int("learning_outcome_id")
      .notNull()
      .references(() => LO_LearningOutcome.id, { onDelete: "cascade" }),
    resource_name: varchar("resource_name", { length: 255 }),
  },
);

// LO_LessonSection table (Introduction & Conclusion)
export const LO_LessonSection = mysqlTable("LO_LessonSection", {
  id: int("id").primaryKey().autoincrement(),
  lesson_id: int("lesson_id")
    .notNull()
    .references(() => LO_Lesson.id, { onDelete: "cascade" }),
  section_type: mysqlEnum("section_type", [
    "Introduction",
    "Development",
    "Conclusion",
  ]),
  trainer_activities: text("trainer_activities"),
  learner_activities: text("learner_activities"),
  resources: text("resources"),
  duration_minutes: int("duration_minutes"),
});

// LO_IndicativeContent table
export const LO_IndicativeContent = mysqlTable("LO_IndicativeContent", {
  id: int("id").primaryKey().autoincrement(),
  lesson_id: int("lesson_id")
    .notNull()
    .references(() => LO_Lesson.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 100 }),
  content: text("content"),
});

// LO_LessonAssignment table
export const LO_LessonAssignment = mysqlTable("LO_LessonAssignment", {
  id: int("id").primaryKey().autoincrement(),
  lesson_id: int("lesson_id")
    .notNull()
    .references(() => LO_Lesson.id, { onDelete: "cascade" }),
  description: text("description"),
});

// LO_LessonEvaluation table
export const LO_LessonEvaluation = mysqlTable("LO_LessonEvaluation", {
  id: int("id").primaryKey().autoincrement(),
  lesson_id: int("lesson_id")
    .notNull()
    .references(() => LO_Lesson.id, { onDelete: "cascade" }),
  teacher_notes: text("teacher_notes"),
  references: text("references"),
  prepared_by: varchar("prepared_by", { length: 255 }),
  verified_by: varchar("verified_by", { length: 255 }),
});

// AcademicCalendar table: Stores calendar configuration for a specific academic year, term, and class group
export const AcademicCalendar = mysqlTable("AcademicCalendar", {
  calendar_id: bigint("calendar_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  academic_year_id: bigint("academic_year_id", { mode: "number" })
    .notNull()
    .references(() => AcademicYear.academic_year_id),
  academic_term_id: bigint("academic_term_id", { mode: "number" })
    .notNull()
    .references(() => AcademicTerm.academic_term_id),
  class_group_id: bigint("class_group_id", { mode: "number" })
    .notNull()
    .references(() => ClassGroup.class_group_id),
  name: varchar("name", { length: 150 }),
  description: text("description"),
  is_active: tinyint("is_active").default(1),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// CalendarSlot table: Stores individual time slots for subjects in the weekly calendar
export const CalendarSlot = mysqlTable("CalendarSlot", {
  slot_id: bigint("slot_id", { mode: "number" }).primaryKey().autoincrement(),
  calendar_id: bigint("calendar_id", { mode: "number" }).references(
    () => AcademicCalendar.calendar_id,
  ),
  academic_term_id: bigint("academic_term_id", { mode: "number" }).references(
    () => AcademicTerm.academic_term_id,
  ),
  class_group_id: bigint("class_group_id", { mode: "number" }),
  subject_id: bigint("subject_id", { mode: "number" })
    .notNull()
    .references(() => Subject.subject_id),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  day_of_week: tinyint("day_of_week").notNull(),
  start_time: varchar("start_time", { length: 10 }).notNull(),
  end_time: varchar("end_time", { length: 10 }).notNull(),
  location: varchar("location", { length: 100 }),
  color: varchar("color", { length: 7 }).default("#3B82F6"),
  notes: text("notes"),
  is_active: tinyint("is_active").default(1),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// CalendarNotification table: Stores notification preferences for instructors
export const CalendarNotification = mysqlTable("CalendarNotification", {
  notification_id: bigint("notification_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  notification_type: varchar("notification_type", { length: 50 })
    .notNull()
    .default("LESSON_STARTING"),
  minutes_before: int("minutes_before").notNull().default(30),
  is_enabled: tinyint("is_enabled").default(1),
  notification_method: varchar("notification_method", { length: 20 }).default(
    "IN_APP",
  ),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// CalendarActivity table: Stores non-subject activities
export const CalendarActivity = mysqlTable("CalendarActivity", {
  activity_id: bigint("activity_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  academic_term_id: bigint("academic_term_id", { mode: "number" })
    .notNull()
    .references(() => AcademicTerm.academic_term_id),
  class_group_id: bigint("class_group_id", { mode: "number" }),
  activity_name: varchar("activity_name", { length: 150 }).notNull(),
  activity_type: varchar("activity_type", { length: 50 }).notNull(),
  day_of_week: tinyint("day_of_week"),
  start_date: date("start_date"),
  end_date: date("end_date"),
  start_time: varchar("start_time", { length: 10 }).notNull(),
  end_time: varchar("end_time", { length: 10 }).notNull(),
  location: varchar("location", { length: 100 }),
  description: text("description"),
  color: varchar("color", { length: 7 }).default("#10B981"),
  is_recurring: tinyint("is_recurring").default(1),
  is_active: tinyint("is_active").default(1),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// --- Reporting Module Tables ---

// InstructorReport table: Central record for a weekly or daily report
export const InstructorReport = mysqlTable("InstructorReport", {
  report_id: bigint("report_id", { mode: "number" }).primaryKey().autoincrement(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  academic_term_id: bigint("academic_term_id", { mode: "number" })
    .references(() => AcademicTerm.academic_term_id),
  class_group_id: bigint("class_group_id", { mode: "number" })
    .references(() => ClassGroup.class_group_id),
  week_number: int("week_number"),
  start_date: date("start_date"),
  end_date: date("end_date"),
  submission_date: datetime("submission_date").default(sql`CURRENT_TIMESTAMP`),
  progress_status: mysqlEnum("progress_status", [
    "ON_TRACK",
    "SLIGHTLY_BEHIND",
    "AHEAD",
  ]).default("ON_TRACK"),
  key_highlights: text("key_highlights"),
  challenges_encountered: text("challenges_encountered"),
  // Snapshot metrics
  lessons_delivered_count: int("lessons_delivered_count").default(0),
  mentorship_sessions_count: int("mentorship_sessions_count").default(0),
  active_students_count: int("active_students_count").default(0),
  struggling_students_count: int("struggling_students_count").default(0),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// ReportLesson table: Individual lessons linked to a report
export const ReportLesson = mysqlTable("ReportLesson", {
  lesson_report_id: bigint("lesson_report_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  report_id: bigint("report_id", { mode: "number" })
    .notNull()
    .references(() => InstructorReport.report_id, { onDelete: "cascade" }),
  lesson_title: varchar("lesson_title", { length: 255 }),
  planned: tinyint("planned").default(1),
  delivered: tinyint("delivered").default(1),
  notes: text("notes"),
});

// MentorshipSession table: Records of mentorship meetings
export const MentorshipSession = mysqlTable("MentorshipSession", {
  mentorship_id: bigint("mentorship_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  report_id: bigint("report_id", { mode: "number" })
    .references(() => InstructorReport.report_id, { onDelete: "cascade" }),
  user_id: bigint("user_id", { mode: "number" }) // Mentor/Instructor
    .notNull()
    .references(() => User.user_id),
  student_id: bigint("student_id", { mode: "number" })
    .references(() => User.user_id),
  student_name: text("student_name"),
  session_date: date("session_date"),
  duration_minutes: int("duration_minutes"),
  assignment_completion: varchar("assignment_completion", { length: 255 }),
  punctuality_attendance: varchar("punctuality_attendance", { length: 255 }),
  academic_planning: text("academic_planning"),
  next_steps: text("next_steps"),
  challenges_identified: text("challenges_identified"),
  wellbeing_status: text("wellbeing_status"),
  follow_up_required: tinyint("follow_up_required").default(0),
  notes: text("notes"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ReportProjectUpdate table: Delivery Studio project work status
export const ReportProjectUpdate = mysqlTable("ReportProjectUpdate", {
  project_update_id: bigint("project_update_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  report_id: bigint("report_id", { mode: "number" })
    .notNull()
    .references(() => InstructorReport.report_id, { onDelete: "cascade" }),
  project_name: varchar("project_name", { length: 255 }),
  role: varchar("role", { length: 100 }),
  work_completed: text("work_completed"),
  status: mysqlEnum("status", ["ON_TRACK", "AT_RISK", "DELAYED", "COMPLETE"]).default("ON_TRACK"),
  key_outputs: text("key_outputs"),
  challenges: text("challenges"),
});

// ReportReflection table: Qualitative reflections and support needs
export const ReportReflection = mysqlTable("ReportReflection", {
  reflection_id: bigint("reflection_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  report_id: bigint("report_id", { mode: "number" })
    .notNull()
    .references(() => InstructorReport.report_id, { onDelete: "cascade" }),
  what_worked_well: text("what_worked_well"),
  improvement_areas: text("improvement_areas"),
  academic_support_needed: text("academic_support_needed"),
  technical_support_needed: text("technical_support_needed"),
  infrastructure_support_needed: text("infrastructure_support_needed"),
  coordination_support_needed: text("coordination_support_needed"),
});

// ReportTopic table: Topics covered or planned
export const ReportTopic = mysqlTable("ReportTopic", {
  topic_report_id: bigint("topic_report_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  report_id: bigint("report_id", { mode: "number" })
    .notNull()
    .references(() => InstructorReport.report_id, { onDelete: "cascade" }),
  topic_name: text("topic_name"),
  is_planned_for_next_week: tinyint("is_planned_for_next_week").default(0),
});
