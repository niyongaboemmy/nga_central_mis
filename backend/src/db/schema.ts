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
  primaryKey,
  uniqueIndex,
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
