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
  decimal,
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
  // Bumped on logout so previously-issued JWTs (which embed the version at
  // sign time) stop verifying immediately, even though they're otherwise
  // still cryptographically valid for their full 24h lifetime. This is what
  // makes logout actually revoke a session instead of just clearing a
  // cookie -- see authenticate() in middleware/auth.ts.
  token_version: int("token_version").notNull().default(0),
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
  registration_number: varchar("registration_number", { length: 20 }).unique(),
});

// RegistrationSequence table -- single-row counter backing every student
// registration number (see utils/registrationNumber.ts).
export const RegistrationSequence = mysqlTable("RegistrationSequence", {
  id: tinyint("id").primaryKey(),
  current_value: bigint("current_value", { mode: "number" })
    .notNull()
    .default(0),
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
  google_id: varchar("google_id", { length: 255 }).unique(),
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
    academic_year_id: bigint("academic_year_id", { mode: "number" })
      .notNull()
      .references(() => AcademicYear.academic_year_id),
    assigned_at: datetime("assigned_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey(table.user_id, table.program_id, table.academic_year_id),
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
  // RTB/TVET report fields (migration 079) -- shown on the Scheme of Work PDF's cover page,
  // shared by every scheme of this subject rather than re-entered per scheme.
  rqf_level: varchar("rqf_level", { length: 50 }),
  learning_hours: varchar("learning_hours", { length: 100 }),
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

// ClassGroup table -- a permanent label for a cohort within a grade (e.g.
// "Coding A", "G1"), like Grade/Subject/Program. Not year-scoped: the same
// row is reused every academic year. Which students/teachers are in it for
// a given year is tracked on StudentClassGroup/TeacherSubjectAssignment via
// their own academic_year_id column, not by recreating this row per year.
export const ClassGroup = mysqlTable("ClassGroup", {
  class_group_id: bigint("class_group_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
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
    academic_year_id: bigint("academic_year_id", { mode: "number" })
      .notNull()
      .references(() => AcademicYear.academic_year_id),
    assigned_at: datetime("assigned_at").default(sql`CURRENT_TIMESTAMP`),
    status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).default("ACTIVE"),
  },
  (table) => ({
    pk: primaryKey(table.user_id, table.class_group_id, table.academic_year_id),
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
    academic_year_id: bigint("academic_year_id", { mode: "number" })
      .notNull()
      .references(() => AcademicYear.academic_year_id),
    enrolled_at: datetime("enrolled_at").default(sql`CURRENT_TIMESTAMP`),
    status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).default("ACTIVE"),
  },
  (table) => ({
    pk: primaryKey(table.user_id, table.subject_id, table.academic_year_id),
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
    academic_year_id: bigint("academic_year_id", { mode: "number" })
      .notNull()
      .references(() => AcademicYear.academic_year_id),
    assigned_at: datetime("assigned_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey(
      table.user_id,
      table.subject_id,
      table.class_group_id,
      table.academic_year_id,
    ),
  }),
);

// UserGrade junction table for class teacher grade assignments. Scoped to a
// single ClassGroup (see 066) -- a class teacher leads one section of a
// grade, not the whole grade -- so two teachers on the same grade stay
// distinguishable. ClassGroup is not year-scoped, hence class_group_id sits
// alongside academic_year_id in the key rather than replacing it.
export const UserGrade = mysqlTable(
  "UserGrade",
  {
    user_id: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => User.user_id),
    grade_id: bigint("grade_id", { mode: "number" })
      .notNull()
      .references(() => Grade.grade_id),
    class_group_id: bigint("class_group_id", { mode: "number" })
      .notNull()
      .references(() => ClassGroup.class_group_id),
    academic_year_id: bigint("academic_year_id", { mode: "number" })
      .notNull()
      .references(() => AcademicYear.academic_year_id),
    assigned_at: datetime("assigned_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey(
      table.user_id,
      table.grade_id,
      table.class_group_id,
      table.academic_year_id,
    ),
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
  academic_year_id: bigint("academic_year_id", { mode: "number" }).references(
    () => AcademicYear.academic_year_id,
  ),
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
  academic_year_id: bigint("academic_year_id", { mode: "number" }).references(
    () => AcademicYear.academic_year_id,
  ),
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
      "DOWNLOAD",
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

// DocumentShareLink table: backs the Share modal's "Links" tab with a real,
// authenticated-only "anyone with the link" flow (login still required —
// see resolveShareLinkAccess in documentController.ts).
export const DocumentShareLink = mysqlTable("DocumentShareLink", {
  link_id: bigint("link_id", { mode: "number" }).primaryKey().autoincrement(),
  document_id: bigint("document_id", { mode: "number" }).references(
    () => Document.document_id,
  ),
  folder_id: bigint("folder_id", { mode: "number" }).references(
    () => DocumentFolder.folder_id,
  ),
  token: varchar("token", { length: 64 }).notNull(),
  permission_type: mysqlEnum("permission_type", ["VIEW", "DOWNLOAD"]).default(
    "VIEW",
  ),
  created_by: bigint("created_by", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  expires_at: datetime("expires_at"),
  revoked_at: datetime("revoked_at"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// Notification table: generic in-app notification inbox. The unique
// dedupe index means re-sharing the same item with the same person should
// be done via an upsert (bump created_at / clear read_at) rather than a
// plain insert, so it doesn't stack duplicate unread rows.
export const Notification = mysqlTable("Notification", {
  notification_id: bigint("notification_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  kind: varchar("kind", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: varchar("body", { length: 500 }),
  link: varchar("link", { length: 500 }),
  subject_type: varchar("subject_type", { length: 50 }),
  subject_id: bigint("subject_id", { mode: "number" }),
  actor_id: bigint("actor_id", { mode: "number" }).references(
    () => User.user_id,
  ),
  read_at: datetime("read_at"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

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
  // Prefix for student registration numbers, e.g. "120823" in
  // "120823-0001" -- see utils/registrationNumber.ts.
  school_code: varchar("school_code", { length: 20 }).unique(),
  address: varchar("address", { length: 255 }),
  contact_email: varchar("contact_email", { length: 150 }),
  contact_phone: varchar("contact_phone", { length: 50 }),
  logo: varchar("logo", { length: 500 }),
  // Second logo slot for printed reports (e.g. Scheme of Work cover page)
  // -- migration 078. `logo` is the primary/left mark, this is the
  // secondary/right one (partner programme, etc.).
  partner_logo: varchar("partner_logo", { length: 500 }),
  // Dedicated logo for reports/documents (e.g. the Scheme of Work PDF's running header on every
  // page) -- migration 080. Distinct from logo/partner_logo, which are the two cover-page slots.
  documents_logo: varchar("documents_logo", { length: 500 }),
  // Report/PDF cover-page fields (migration 079) -- Sector/Trade/Qualification are the same for
  // every scheme this school produces, so they live here rather than being re-entered per scheme.
  sector: varchar("sector", { length: 100 }),
  trade: varchar("trade", { length: 150 }),
  qualification_title: varchar("qualification_title", { length: 255 }),
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
  source: mysqlEnum("source", [
    "MANUAL",
    "DOCX_IMPORT",
    "DOCX_IMPORT_AI",
    "AI_GENERATED",
  ]).default("MANUAL"),
  ai_source_filename: varchar("ai_source_filename", { length: 255 }),
  // Cover-page fields for the printed/PDF report (migration 077). Nullable:
  // trainer/class/school-year/term are already derivable via user_id/
  // class_group_id/academic_term_id and are joined at render time instead
  // of duplicated here.
  sector: varchar("sector", { length: 100 }),
  trade: varchar("trade", { length: 150 }),
  qualification_title: varchar("qualification_title", { length: 255 }),
  rqf_level: varchar("rqf_level", { length: 50 }),
  module_code: varchar("module_code", { length: 50 }),
  learning_hours_per_week: int("learning_hours_per_week"),
  number_of_classes: int("number_of_classes"),
  scheme_date: date("scheme_date"),
  approver_name: varchar("approver_name", { length: 150 }),
  approver_title: varchar("approver_title", { length: 150 }),
  trainer_signed: tinyint("trainer_signed").default(0),
  approver_signed: tinyint("approver_signed").default(0),
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
  // Which Learning Outcome / Competence group (Curriculum's
  // SubjectCompetency) this week belongs to -- migration 075. Nullable:
  // old rows, and any scheme not linked to curriculum, have no group.
  competency_id: bigint("competency_id", { mode: "number" }).references(
    () => SubjectCompetency.competency_id,
    { onDelete: "set null" },
  ),
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
  // Explicit per-week status (migration 076) -- SKIPPED marks an
  // intentionally-empty holiday/break week so it still renders as a real,
  // visible row instead of vanishing entirely from the calendar/PDF.
  entry_status: mysqlEnum("entry_status", [
    "PLANNED",
    "SKIPPED",
    "COMPLETED",
  ])
    .notNull()
    .default("PLANNED"),
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
  // Snapshot metrics — lessons_delivered_count is auto-derived from lessons array
  lessons_delivered_count: int("lessons_delivered_count").default(0),
  /** @deprecated Use MentorshipSession table counts instead */
  mentorship_sessions_count: int("mentorship_sessions_count").default(0),
  /** @deprecated Subjective snapshot removed from lesson reporting flow */
  active_students_count: int("active_students_count").default(0),
  /** @deprecated Subjective snapshot removed from lesson reporting flow */
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
    .references(() => User.user_id, { onDelete: "cascade" }),
  student_name: text("student_name"),
  topic: varchar("topic", { length: 255 }),
  academic_year_id: bigint("academic_year_id", { mode: "number" }).references(
    () => AcademicYear.academic_year_id,
  ),
  academic_term_id: bigint("academic_term_id", { mode: "number" }).references(
    () => AcademicTerm.academic_term_id,
  ),
  // Intelligence-layer additions (migration 039)
  subject_id: bigint("subject_id", { mode: "number" })
    .references(() => Subject.subject_id, { onDelete: "set null" }),
  previous_session_id: bigint("previous_session_id", { mode: "number" }),
  session_date: date("session_date"),
  duration_minutes: int("duration_minutes"),
  assignment_completion: varchar("assignment_completion", { length: 255 }),
  assignment_notes: text("assignment_notes"),
  punctuality_attendance: varchar("punctuality_attendance", { length: 255 }),
  discipline_notes: text("discipline_notes"),
  discipline_progress: mysqlEnum("discipline_progress", ["IMPROVED", "CONSISTENT", "DECLINED"]),
  academic_planning: text("academic_planning"),
  academic_personal_notes: text("academic_personal_notes"),
  dishonesty_flagged: tinyint("dishonesty_flagged").default(0),
  stress_flag: tinyint("stress_flag").default(0),
  next_steps: text("next_steps"),
  action_items: text("action_items"),
  challenges_identified: text("challenges_identified"),
  guidance_notes: text("guidance_notes"),
  wellbeing_status: text("wellbeing_status"),
  wellbeing_score: tinyint("wellbeing_score"),
  wellbeing_notes: text("wellbeing_notes"),
  follow_up_required: tinyint("follow_up_required").default(0),
  is_completed: tinyint("is_completed").default(0),
  session_status: mysqlEnum("session_status", ["OPEN", "IN_PROGRESS", "RESOLVED"]).default("OPEN"),
  // Admin approval workflow (migration 049) — mirrors MenteeCheckIn's
  // validation_status convention.
  validation_status: mysqlEnum("validation_status", ["PENDING", "APPROVED", "REJECTED"])
    .notNull()
    .default("PENDING"),
  validation_comment: text("validation_comment"),
  validated_by: bigint("validated_by", { mode: "number" }),
  validated_at: datetime("validated_at"),
  notes: text("notes"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// MentorAssignment table: explicit "who mentors whom, this academic year"
// relationship (migration 047). Deliberately decoupled from
// TeacherSubjectAssignment/ClassGroup — a mentor may be responsible for
// mentees across multiple class groups/years.
export const MentorAssignment = mysqlTable("MentorAssignment", {
  assignment_id: bigint("assignment_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  mentor_id: bigint("mentor_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  student_id: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  academic_year_id: bigint("academic_year_id", { mode: "number" })
    .notNull()
    .references(() => AcademicYear.academic_year_id),
  status: mysqlEnum("status", ["ACTIVE", "ENDED"]).default("ACTIVE"),
  assigned_by: bigint("assigned_by", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  assigned_at: datetime("assigned_at").default(sql`CURRENT_TIMESTAMP`),
  ended_at: datetime("ended_at"),
  notes: text("notes"),
});

// MenteeCheckIn table: student-authored check-ins/comments to their assigned
// mentor (migration 047) — the first student-facing surface in this module.
export const MenteeCheckIn = mysqlTable("MenteeCheckIn", {
  checkin_id: bigint("checkin_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  student_id: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  mentor_id: bigint("mentor_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  academic_year_id: bigint("academic_year_id", { mode: "number" })
    .notNull()
    .references(() => AcademicYear.academic_year_id),
  submitted_at: datetime("submitted_at").default(sql`CURRENT_TIMESTAMP`),
  // Expanded from the original 4 values in migration 050 to cover the
  // realistic range of student reports (academic/behavioral/attendance/
  // wellbeing/other), not just appreciation/concern/meeting/general.
  category: mysqlEnum("category", [
    "GENERAL",
    "APPRECIATION",
    "ACADEMIC",
    "BEHAVIORAL",
    "ATTENDANCE",
    "WELLBEING",
    "CONCERN",
    "REQUEST_MEETING",
    "OTHER",
  ]).default("GENERAL"),
  title: varchar("title", { length: 150 }),
  // Optional link to one of the student's enrolled subjects (migration 050) —
  // lets a report be scoped to a specific class without requiring one.
  subject_id: bigint("subject_id", { mode: "number" }).references(() => Subject.subject_id),
  message: text("message").notNull(),
  linked_session_id: bigint("linked_session_id", { mode: "number" }).references(
    () => MentorshipSession.mentorship_id,
  ),
  status: mysqlEnum("status", ["NEW", "ACKNOWLEDGED", "ADDRESSED"]).default("NEW"),
  // Approval workflow (migration 048) — mirrors SchemeOfWork/SchemeOfWorkEntry's
  // validation_status convention. mentor_response doubles as the approval
  // comment when validation_status is set alongside it.
  validation_status: mysqlEnum("validation_status", ["PENDING", "APPROVED", "REJECTED"]).default("PENDING"),
  mentor_response: text("mentor_response"),
  responded_at: datetime("responded_at"),
});

// ReportProjectUpdate table: Delivery Studio project work status
export const ReportProjectUpdate = mysqlTable("ReportProjectUpdate", {
  project_update_id: bigint("project_update_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  report_id: bigint("report_id", { mode: "number" }).references(
    () => InstructorReport.report_id,
    { onDelete: "cascade" },
  ),
  user_id: bigint("user_id", { mode: "number" }).references(
    () => User.user_id,
    { onDelete: "cascade" },
  ),
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

// LessonReport — decoupled per-lesson delivery record
export const LessonReport = mysqlTable(
  "LessonReport",
  {
    lesson_report_id: bigint("lesson_report_id", { mode: "number" })
      .primaryKey()
      .autoincrement(),
    lesson_id: int("lesson_id").references(() => LO_Lesson.id, {
      onDelete: "set null",
    }),
    entry_id: bigint("entry_id", { mode: "number" }).references(
      () => SchemeOfWorkEntry.entry_id,
      { onDelete: "set null" },
    ),
    reported_by: bigint("reported_by", { mode: "number" })
      .notNull()
      .references(() => User.user_id, { onDelete: "cascade" }),
    academic_year_id: bigint("academic_year_id", { mode: "number" }).references(
      () => AcademicYear.academic_year_id,
    ),
    academic_term_id: bigint("academic_term_id", { mode: "number" }).references(
      () => AcademicTerm.academic_term_id,
    ),
    // Denormalized at write time from lesson_id/entry_id (scheduled reports)
    // or supplied directly (ad-hoc reports, Phase 2) — kept even if the
    // source lesson/entry is later deleted, unlike the nullable FKs above.
    subject_id: bigint("subject_id", { mode: "number" }).references(
      () => Subject.subject_id,
      { onDelete: "set null" },
    ),
    class_group_id: bigint("class_group_id", { mode: "number" }).references(
      () => ClassGroup.class_group_id,
      { onDelete: "set null" },
    ),
    delivery_date: date("delivery_date").notNull(),
    status: mysqlEnum("status", ["DELIVERED", "PARTIAL", "MISSED", "UNPLANNED"])
      .notNull()
      .default("DELIVERED"),
    attendance_count: int("attendance_count"),
    completion_rate: int("completion_rate"),
    reflection_notes: text("reflection_notes"),
    evidence_url: varchar("evidence_url", { length: 500 }),
    schedule_flag: mysqlEnum("schedule_flag", ["ON_TIME", "AHEAD", "BEHIND"])
      .notNull()
      .default("ON_TIME"),
    // Admin approval workflow (migration 049) — mirrors MenteeCheckIn's
    // validation_status convention.
    validation_status: mysqlEnum("validation_status", ["PENDING", "APPROVED", "REJECTED"])
      .notNull()
      .default("PENDING"),
    validation_comment: text("validation_comment"),
    validated_by: bigint("validated_by", { mode: "number" }),
    validated_at: datetime("validated_at"),
    created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    // Nullable lesson_id means this only dedupes scheduled reports — ad-hoc
    // reports (lesson_id NULL) are allowed to repeat on the same date.
    uniqueReportedLessonDate: uniqueIndex("uq_lesson_report_reporter_lesson_date").on(
      table.reported_by,
      table.lesson_id,
      table.delivery_date,
    ),
    subjectIdx: index("idx_lesson_report_subject").on(table.subject_id),
    classGroupIdx: index("idx_lesson_report_class_group").on(table.class_group_id),
    validationStatusIdx: index("idx_lr_validation_status").on(table.validation_status),
  }),
);

// SupportRequestCategory — admin-managed lookup for the "Support Needed"
// multi-select (replaces free-text-only Academic/Technical/Infrastructure/
// Coordination fields so admins can GROUP BY category and rank requests).
export const SupportRequestCategory = mysqlTable("SupportRequestCategory", {
  category_id: bigint("category_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  label: varchar("label", { length: 150 }).notNull().unique(),
  is_active: tinyint("is_active").default(1),
});

// ChallengeCategory — admin-managed lookup for tagging recurring challenges
// (e.g. "Electricity/Power") so they can be ranked by frequency across
// subjects/teachers instead of only readable one report at a time.
export const ChallengeCategory = mysqlTable("ChallengeCategory", {
  category_id: bigint("category_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  label: varchar("label", { length: 150 }).notNull().unique(),
  is_active: tinyint("is_active").default(1),
});

// LessonReportSupportRequest — join table: which support categories a given
// lesson report flagged, with an optional free-text note per selection.
export const LessonReportSupportRequest = mysqlTable("LessonReportSupportRequest", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  lesson_report_id: bigint("lesson_report_id", { mode: "number" })
    .notNull()
    .references(() => LessonReport.lesson_report_id, { onDelete: "cascade" }),
  category_id: bigint("category_id", { mode: "number" })
    .notNull()
    .references(() => SupportRequestCategory.category_id),
  note: text("note"),
});

// LessonReportChallengeTag — join table: which challenge categories a given
// lesson report was tagged with (additive to the free-text reflection_notes).
export const LessonReportChallengeTag = mysqlTable("LessonReportChallengeTag", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  lesson_report_id: bigint("lesson_report_id", { mode: "number" })
    .notNull()
    .references(() => LessonReport.lesson_report_id, { onDelete: "cascade" }),
  category_id: bigint("category_id", { mode: "number" })
    .notNull()
    .references(() => ChallengeCategory.category_id),
});

// Curriculum — SubjectCompetency
export const SubjectCompetency = mysqlTable("SubjectCompetency", {
  competency_id: bigint("competency_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  subject_id: bigint("subject_id", { mode: "number" })
    .notNull()
    .references(() => Subject.subject_id, { onDelete: "cascade" }),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  element_number: int("element_number").notNull().default(1),
  // Hours budgeted to this Learning Outcome/Element in the official curriculum (e.g. "Learning
  // hours: 40"), and the bullet "Indicative content" listed under it — both absent from the
  // original schema, added for "Import from Curriculum" AI extraction to populate.
  learning_hours: int("learning_hours"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  indicative_content: text("indicative_content"),
  sort_order: int("sort_order").notNull().default(0),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// Curriculum — CompetencyPerformanceCriteria
export const CompetencyPerformanceCriteria = mysqlTable(
  "CompetencyPerformanceCriteria",
  {
    criteria_id: bigint("criteria_id", { mode: "number" })
      .primaryKey()
      .autoincrement(),
    competency_id: bigint("competency_id", { mode: "number" })
      .notNull()
      .references(() => SubjectCompetency.competency_id, { onDelete: "cascade" }),
    criteria_number: varchar("criteria_number", { length: 20 }).notNull(),
    description: text("description").notNull(),
    sort_order: int("sort_order").notNull().default(0),
    created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
);

// SchemeEntryCriteria — links a Scheme of Work entry (a taught week) to the Curriculum Performance
// Criteria it addresses. Many-to-many, populated primarily by AI matching (see
// CURRICULUM_SCHEME_OF_WORK_INTEGRATION_IMPLEMENTATION_PLAN.md).
export const SchemeEntryCriteria = mysqlTable(
  "SchemeEntryCriteria",
  {
    entry_id: bigint("entry_id", { mode: "number" })
      .notNull()
      .references(() => SchemeOfWorkEntry.entry_id, { onDelete: "cascade" }),
    criteria_id: bigint("criteria_id", { mode: "number" })
      .notNull()
      .references(() => CompetencyPerformanceCriteria.criteria_id, {
        onDelete: "cascade",
      }),
    created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey(table.entry_id, table.criteria_id),
  }),
);

// Curriculum — SubjectDocumentCategory
export const SubjectDocumentCategory = mysqlTable("SubjectDocumentCategory", {
  category_id: bigint("category_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  subject_id: bigint("subject_id", { mode: "number" })
    .notNull()
    .references(() => Subject.subject_id, { onDelete: "cascade" }),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  name: varchar("name", { length: 150 }).notNull(),
  description: varchar("description", { length: 500 }),
  color: varchar("color", { length: 7 }).default("#3B82F6"),
  sort_order: int("sort_order").notNull().default(0),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// Curriculum — SubjectDocument (competency_id omits .references() — SET NULL FK is in raw SQL migration)
export const SubjectDocument = mysqlTable("SubjectDocument", {
  document_id: bigint("document_id", { mode: "number" })
    .primaryKey()
    .autoincrement(),
  category_id: bigint("category_id", { mode: "number" })
    .notNull()
    .references(() => SubjectDocumentCategory.category_id, { onDelete: "cascade" }),
  subject_id: bigint("subject_id", { mode: "number" })
    .notNull()
    .references(() => Subject.subject_id, { onDelete: "cascade" }),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  competency_id: bigint("competency_id", { mode: "number" }),
  file_name: varchar("file_name", { length: 255 }).notNull(),
  original_name: varchar("original_name", { length: 255 }).notNull(),
  file_path: varchar("file_path", { length: 500 }).notNull(),
  file_size: bigint("file_size", { mode: "number" }).notNull(),
  mime_type: varchar("mime_type", { length: 100 }).notNull(),
  file_extension: varchar("file_extension", { length: 20 }).notNull(),
  description: varchar("description", { length: 500 }),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// AssessmentScore — student grade records pulled into mentorship context (migration 039)
export const AssessmentScore = mysqlTable("AssessmentScore", {
  score_id: bigint("score_id", { mode: "number" }).primaryKey().autoincrement(),
  student_id: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id, { onDelete: "cascade" }),
  subject_id: bigint("subject_id", { mode: "number" })
    .notNull()
    .references(() => Subject.subject_id, { onDelete: "cascade" }),
  academic_year_id: int("academic_year_id"),
  term: varchar("term", { length: 20 }),
  assessment_type: varchar("assessment_type", { length: 50 }).notNull().default("EXAM"),
  title: varchar("title", { length: 150 }),
  score: decimal("score", { precision: 5, scale: 2 }).notNull(),
  max_score: decimal("max_score", { precision: 5, scale: 2 }).notNull().default("100"),
  assessed_at: date("assessed_at").notNull(),
  recorded_by: bigint("recorded_by", { mode: "number" })
    .references(() => User.user_id, { onDelete: "set null" }),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// LessonNote — teacher-authored, AI-assisted rich text notes (Tiptap JSON), optionally
// anchored to a Scheme of Work week so generation/editing can be grounded in curriculum context.
export const LessonNote = mysqlTable("LessonNote", {
  note_id: bigint("note_id", { mode: "number" }).primaryKey().autoincrement(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  subject_id: bigint("subject_id", { mode: "number" })
    .notNull()
    .references(() => Subject.subject_id, { onDelete: "cascade" }),
  class_group_id: bigint("class_group_id", { mode: "number" }).references(
    () => ClassGroup.class_group_id,
  ),
  scheme_entry_id: bigint("scheme_entry_id", { mode: "number" }).references(
    () => SchemeOfWorkEntry.entry_id,
    { onDelete: "set null" },
  ),
  academic_term_id: bigint("academic_term_id", { mode: "number" }).references(
    () => AcademicTerm.academic_term_id,
  ),
  title: varchar("title", { length: 255 }).notNull(),
  content_json: json("content_json"),
  content_html: text("content_html"),
  // PDF_UPLOAD notes only: where the teacher's original PDF lives in the file-server,
  // plus the display metadata the editor/reader show. content_html then holds the
  // text extracted from that PDF (see lessonNotePdf.ts), never teacher-edited HTML.
  file_path: varchar("file_path", { length: 500 }),
  file_name: varchar("file_name", { length: 255 }),
  file_size: int("file_size"),
  page_count: int("page_count"),
  status: mysqlEnum("status", ["DRAFT", "PUBLISHED"]).default("DRAFT"),
  source: mysqlEnum("source", ["MANUAL", "AI_GENERATED", "AI_ASSISTED", "PDF_UPLOAD"]).default(
    "MANUAL",
  ),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// LessonNoteCriteria — the performance criteria a note covers (a whole Learning Outcome is
// simply all of its criteria). Replaces the single scheme_entry_id week link for new notes.
export const LessonNoteCriteria = mysqlTable(
  "LessonNoteCriteria",
  {
    note_id: bigint("note_id", { mode: "number" })
      .notNull()
      .references(() => LessonNote.note_id, { onDelete: "cascade" }),
    criteria_id: bigint("criteria_id", { mode: "number" })
      .notNull()
      .references(() => CompetencyPerformanceCriteria.criteria_id, { onDelete: "cascade" }),
    created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey(table.note_id, table.criteria_id),
  }),
);

// LessonNoteVersion — snapshot written before every AI-applied edit (and on publish),
// so a teacher can always step back from an AI change.
export const LessonNoteVersion = mysqlTable("LessonNoteVersion", {
  version_id: bigint("version_id", { mode: "number" }).primaryKey().autoincrement(),
  note_id: bigint("note_id", { mode: "number" })
    .notNull()
    .references(() => LessonNote.note_id, { onDelete: "cascade" }),
  content_json: json("content_json").notNull(),
  created_by: mysqlEnum("created_by", ["USER", "AI"]).notNull().default("USER"),
  prompt_text: text("prompt_text"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// LessonNoteShare — mirrors DocumentPermission's filter-based sharing so a note can be
// shared with a whole class, everyone enrolled in the subject, or hand-picked students.
export const LessonNoteShare = mysqlTable("LessonNoteShare", {
  share_id: bigint("share_id", { mode: "number" }).primaryKey().autoincrement(),
  note_id: bigint("note_id", { mode: "number" })
    .notNull()
    .references(() => LessonNote.note_id, { onDelete: "cascade" }),
  shared_by: bigint("shared_by", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  filter_type: mysqlEnum("filter_type", [
    "class_group",
    "subject_enrolled",
    "specific_students",
  ]).notNull(),
  filter_ids: json("filter_ids").notNull(),
  permission: mysqlEnum("permission", ["VIEW"]).default("VIEW"),
  expires_at: datetime("expires_at"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// LessonNoteImage — images embedded in a note's Tiptap content, stored via the same
// local-storage-backed flow as SubjectDocument, served through an authenticated streaming endpoint.
export const LessonNoteImage = mysqlTable("LessonNoteImage", {
  image_id: bigint("image_id", { mode: "number" }).primaryKey().autoincrement(),
  note_id: bigint("note_id", { mode: "number" })
    .notNull()
    .references(() => LessonNote.note_id, { onDelete: "cascade" }),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  file_path: varchar("file_path", { length: 500 }).notNull(),
  mime_type: varchar("mime_type", { length: 100 }).notNull(),
  original_name: varchar("original_name", { length: 255 }).notNull(),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// LessonNotePromptPreset — a teacher's own saved "Ask AI" instructions (e.g. phrasing they
// reuse across notes), shown alongside the built-in quick prompts in the editor.
export const LessonNotePromptPreset = mysqlTable("LessonNotePromptPreset", {
  preset_id: bigint("preset_id", { mode: "number" }).primaryKey().autoincrement(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  label: varchar("label", { length: 80 }).notNull(),
  prompt_text: text("prompt_text").notNull(),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// DatabaseQueryLog — audit trail for every query executed through the Database
// Management tool (both the free-form SQL runner and row insert/update/delete).
export const DatabaseQueryLog = mysqlTable("DatabaseQueryLog", {
  log_id: bigint("log_id", { mode: "number" }).primaryKey().autoincrement(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => User.user_id),
  query_text: text("query_text").notNull(),
  statement_type: varchar("statement_type", { length: 50 }).notNull(),
  is_write: tinyint("is_write").default(0),
  row_count: int("row_count"),
  execution_ms: int("execution_ms"),
  status: mysqlEnum("status", ["SUCCESS", "ERROR"]).notNull(),
  error_message: text("error_message"),
  ip_address: varchar("ip_address", { length: 64 }),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// IntegrationToken table
//
// Service credentials for partner systems pulling read-only snapshots (see
// migrations/064_integration_tokens.sql). Only the hash is stored.
export const IntegrationToken = mysqlTable(
  "IntegrationToken",
  {
    token_id: bigint("token_id", { mode: "number" })
      .primaryKey()
      .autoincrement(),
    name: varchar("name", { length: 100 }).notNull(),
    token_hash: varchar("token_hash", { length: 64 }).notNull(),
    token_prefix: varchar("token_prefix", { length: 16 }).notNull(),
    scopes: varchar("scopes", { length: 255 }).notNull().default("sync:read"),
    school_id: bigint("school_id", { mode: "number" }),
    last_used_at: datetime("last_used_at"),
    expires_at: datetime("expires_at"),
    revoked_at: datetime("revoked_at"),
    created_by: bigint("created_by", { mode: "number" }),
    created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("integration_token_hash_unique").on(
      table.token_hash,
    ),
    activeIdx: index("integration_token_active_idx").on(
      table.revoked_at,
      table.expires_at,
    ),
  }),
);
