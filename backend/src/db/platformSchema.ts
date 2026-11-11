import { mysqlTable, bigint, varchar, mysqlEnum, datetime, tinyint, json, char, primaryKey } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * Control-plane tables (database PLATFORM_DB_NAME, default `amashuri_platform`).
 * Created by backend/migrations/platform/*.sql; queried only through `controlDb`
 * (db/platform.ts), never through the tenant-routed `db`.
 */

export const TENANT_STATUS_VALUES = ["PENDING", "ACTIVE", "GRACE", "SUSPENDED", "ARCHIVED"] as const;

export const Tenant = mysqlTable("Tenant", {
  tenant_id: bigint("tenant_id", { mode: "number" }).primaryKey().autoincrement(),
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  display_name: varchar("display_name", { length: 150 }).notNull(),
  legal_name: varchar("legal_name", { length: 200 }),
  status: mysqlEnum("status", TENANT_STATUS_VALUES).notNull().default("PENDING"),
  is_primary: tinyint("is_primary").notNull().default(0),
  package_code: varchar("package_code", { length: 30 }).notNull().default("starter"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Africa/Kigali"),
  country: varchar("country", { length: 2 }),
  mis_db_name: varchar("mis_db_name", { length: 64 }),
  tm_db_name: varchar("tm_db_name", { length: 64 }),
  tendo_db_path: varchar("tendo_db_path", { length: 255 }),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at"),
  activated_at: datetime("activated_at"),
  suspended_at: datetime("suspended_at"),
});

export const AccountDirectory = mysqlTable("AccountDirectory", {
  entry_id: bigint("entry_id", { mode: "number" }).primaryKey().autoincrement(),
  email_norm: varchar("email_norm", { length: 191 }),
  username_norm: varchar("username_norm", { length: 191 }),
  tenant_id: bigint("tenant_id", { mode: "number" }).notNull(),
  user_id: bigint("user_id", { mode: "number" }).notNull(),
  kind: mysqlEnum("kind", ["STAFF", "STUDENT", "PARENT"]).notNull().default("STAFF"),
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
  updated_at: datetime("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const TenantSystem = mysqlTable(
  "TenantSystem",
  {
    tenant_id: bigint("tenant_id", { mode: "number" }).notNull(),
    /** System.system_id in the primary tenant's database (System is global). */
    system_id: bigint("system_id", { mode: "number" }).notNull(),
    status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).notNull().default("ACTIVE"),
    source: mysqlEnum("source", ["PACKAGE", "OVERRIDE"]).notNull().default("OVERRIDE"),
    created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: datetime("updated_at"),
  },
  (t) => ({ pk: primaryKey(t.tenant_id, t.system_id) }),
);

export const TenantMigration = mysqlTable(
  "TenantMigration",
  {
    tenant_id: bigint("tenant_id", { mode: "number" }).notNull(),
    app: varchar("app", { length: 20 }).notNull(),
    file: varchar("file", { length: 191 }).notNull(),
    checksum: char("checksum", { length: 64 }).notNull(),
    outcome: mysqlEnum("outcome", ["APPLIED", "SKIPPED", "BASELINED"]).notNull().default("APPLIED"),
    applied_at: datetime("applied_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ pk: primaryKey(t.tenant_id, t.app, t.file) }),
);

export const PlatformAudit = mysqlTable("PlatformAudit", {
  audit_id: bigint("audit_id", { mode: "number" }).primaryKey().autoincrement(),
  actor_tid: bigint("actor_tid", { mode: "number" }),
  actor_user_id: bigint("actor_user_id", { mode: "number" }),
  action: varchar("action", { length: 80 }).notNull(),
  target_tid: bigint("target_tid", { mode: "number" }),
  payload: json("payload"),
  ip: varchar("ip", { length: 64 }),
  at: datetime("at").default(sql`CURRENT_TIMESTAMP`),
});

export const PlatformMigration = mysqlTable("PlatformMigration", {
  file: varchar("file", { length: 191 }).primaryKey(),
  checksum: char("checksum", { length: 64 }).notNull(),
  applied_at: datetime("applied_at").default(sql`CURRENT_TIMESTAMP`),
});
