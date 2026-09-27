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
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * Access control v2 tables and columns (migration 090).
 *
 * Kept apart from schema.ts on purpose: the legacy `User`, `Role`,
 * `Permission` and `RolePermission` objects there are selected with
 * `db.select().from(X)` all over the codebase, so adding the new columns to
 * them would make every such query fail on a server where 090 has not run
 * yet. Only the access engine uses the objects below.
 */

export const SCOPE_TYPE_VALUES = [
  "PLATFORM",
  "SCHOOL",
  "PROGRAM",
  "DEPARTMENT",
  "GRADE",
  "CLASS_GROUP",
  "SUBJECT_CLASS",
  "MENTEES",
  "CHILDREN",
  "SELF",
] as const;

export const TRIGGER_TYPE_VALUES = [
  "PERSONA",
  "CLASS_TEACHER",
  "SUBJECT_TEACHER",
  "PROGRAM_LEAD",
  "MENTOR",
  "PARENT",
] as const;

export const AccessPermission = mysqlTable("Permission", {
  perm_id: bigint("perm_id", { mode: "number" }).primaryKey().autoincrement(),
  name: varchar("name", { length: 150 }).notNull(),
  description: varchar("description", { length: 255 }),
  status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).default("ACTIVE"),
  app: varchar("app", { length: 30 }).notNull().default("mis"),
  cap_key: varchar("cap_key", { length: 100 }),
  label: varchar("label", { length: 150 }),
  domain: varchar("domain", { length: 40 }),
  kind: mysqlEnum("kind", ["READ", "WRITE"]).notNull().default("WRITE"),
  depths: varchar("depths", { length: 40 }),
  restricted: tinyint("restricted").notNull().default(0),
  scopeable: tinyint("scopeable").notNull().default(1),
  deprecated_at: datetime("deprecated_at"),
});

export const AccessRole = mysqlTable("Role", {
  role_id: bigint("role_id", { mode: "number" }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 255 }),
  status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).default("ACTIVE"),
  preset_key: varchar("preset_key", { length: 60 }),
  school_id: bigint("school_id", { mode: "number" }),
  category: varchar("category", { length: 40 }),
  allowed_scope_types: varchar("allowed_scope_types", { length: 200 }),
  max_holders: int("max_holders"),
  platform_only: tinyint("platform_only").notNull().default(0),
  is_preset: tinyint("is_preset").notNull().default(0),
  version: int("version").notNull().default(1),
  updated_at: datetime("updated_at"),
});

export const AccessRolePermission = mysqlTable(
  "RolePermission",
  {
    role_id: bigint("role_id", { mode: "number" }).notNull(),
    perm_id: bigint("perm_id", { mode: "number" }).notNull(),
    depth: mysqlEnum("depth", ["summary", "detail", "sensitive"]),
  },
  (t) => ({ pk: primaryKey(t.role_id, t.perm_id) }),
);

export const UserAccessVersion = mysqlTable("User", {
  user_id: bigint("user_id", { mode: "number" }).primaryKey(),
  status: mysqlEnum("status", ["ACTIVE", "INACTIVE", "SUSPENDED"]),
  access_version: int("access_version").notNull().default(1),
});

export const AccessGrant = mysqlTable("AccessGrant", {
  grant_id: bigint("grant_id", { mode: "number" }).primaryKey().autoincrement(),
  user_id: bigint("user_id", { mode: "number" }).notNull(),
  role_id: bigint("role_id", { mode: "number" }).notNull(),
  school_id: bigint("school_id", { mode: "number" }).notNull().default(1),
  scope_type: mysqlEnum("scope_type", SCOPE_TYPE_VALUES).notNull(),
  scope_id: bigint("scope_id", { mode: "number" }),
  scope_id2: bigint("scope_id2", { mode: "number" }),
  academic_year_id: bigint("academic_year_id", { mode: "number" }),
  valid_from: date("valid_from", { mode: "string" }),
  valid_until: date("valid_until", { mode: "string" }),
  title: varchar("title", { length: 150 }),
  justification: varchar("justification", { length: 500 }),
  source: mysqlEnum("source", ["MANUAL", "RULE", "MIGRATION"]).notNull(),
  rule_id: bigint("rule_id", { mode: "number" }),
  source_ref: varchar("source_ref", { length: 120 }),
  status: mysqlEnum("status", ["ACTIVE", "SUSPENDED", "ENDED"]).notNull().default("ACTIVE"),
  granted_by: bigint("granted_by", { mode: "number" }),
  granted_at: datetime("granted_at").default(sql`CURRENT_TIMESTAMP`),
  ended_by: bigint("ended_by", { mode: "number" }),
  ended_at: datetime("ended_at"),
  end_reason: varchar("end_reason", { length: 255 }),
  last_certified_at: datetime("last_certified_at"),
  certified_by: bigint("certified_by", { mode: "number" }),
});

export const AccessRule = mysqlTable("AccessRule", {
  rule_id: bigint("rule_id", { mode: "number" }).primaryKey().autoincrement(),
  rule_key: varchar("rule_key", { length: 60 }),
  school_id: bigint("school_id", { mode: "number" }).notNull().default(1),
  name: varchar("name", { length: 150 }).notNull(),
  trigger_type: mysqlEnum("trigger_type", TRIGGER_TYPE_VALUES).notNull(),
  trigger_filter: text("trigger_filter"),
  role_id: bigint("role_id", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["ACTIVE", "PAUSED"]).notNull().default("ACTIVE"),
  created_by: bigint("created_by", { mode: "number" }),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at"),
});

export const Department = mysqlTable("Department", {
  department_id: bigint("department_id", { mode: "number" }).primaryKey().autoincrement(),
  school_id: bigint("school_id", { mode: "number" }).notNull().default(1),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 150 }).notNull(),
  status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).notNull().default("ACTIVE"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const DepartmentSubject = mysqlTable(
  "DepartmentSubject",
  {
    department_id: bigint("department_id", { mode: "number" }).notNull(),
    subject_id: bigint("subject_id", { mode: "number" }).notNull(),
  },
  (t) => ({ pk: primaryKey(t.department_id, t.subject_id) }),
);

export const AccessAudit = mysqlTable("AccessAudit", {
  audit_id: bigint("audit_id", { mode: "number" }).primaryKey().autoincrement(),
  actor_id: bigint("actor_id", { mode: "number" }),
  subject_user_id: bigint("subject_user_id", { mode: "number" }),
  action: varchar("action", { length: 60 }).notNull(),
  target: text("target"),
  before_json: text("before_json"),
  after_json: text("after_json"),
  reason: varchar("reason", { length: 500 }),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const AccessManifestRow = mysqlTable("AccessManifest", {
  app: varchar("app", { length: 30 }).primaryKey(),
  version: varchar("version", { length: 40 }),
  checksum: varchar("checksum", { length: 64 }).notNull(),
  manifest: text("manifest").notNull(),
  published_at: datetime("published_at").default(sql`CURRENT_TIMESTAMP`),
});

export const AccessPresetLink = mysqlTable(
  "AccessPresetLink",
  {
    preset_key: varchar("preset_key", { length: 60 }).notNull(),
    perm_name: varchar("perm_name", { length: 150 }).notNull(),
    applied_at: datetime("applied_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ pk: primaryKey(t.preset_key, t.perm_name) }),
);

export const AccessShadowDiff = mysqlTable("AccessShadowDiff", {
  diff_id: bigint("diff_id", { mode: "number" }).primaryKey().autoincrement(),
  app: varchar("app", { length: 30 }).notNull().default("mis"),
  user_id: bigint("user_id", { mode: "number" }).notNull(),
  capability: varchar("capability", { length: 150 }).notNull(),
  route: varchar("route", { length: 200 }).notNull(),
  legacy_allowed: tinyint("legacy_allowed").notNull(),
  v2_allowed: tinyint("v2_allowed").notNull(),
  v2_depth: varchar("v2_depth", { length: 10 }),
  sample_target: varchar("sample_target", { length: 500 }),
  hits: int("hits").notNull().default(1),
  first_seen: datetime("first_seen").default(sql`CURRENT_TIMESTAMP`),
  last_seen: datetime("last_seen").default(sql`CURRENT_TIMESTAMP`),
  reviewed_at: datetime("reviewed_at"),
  reviewed_by: bigint("reviewed_by", { mode: "number" }),
  review_note: varchar("review_note", { length: 255 }),
});
