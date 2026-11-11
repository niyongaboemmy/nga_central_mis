/**
 * First-run setup checklist (plan §6.6) -- WORK PACKAGE D. `SetupItem[]` of
 * frontend/src/api/tenantMgmt.ts, computed from the school's own database
 * (existence checks only), plus a per-tenant "dismissed" flag
 * (control plane TenantSetupState, migrations/platform/003).
 */
import { RowDataPacket } from "mysql2/promise";
import { controlPool } from "../../db/platform";
import { poolFor } from "../../db/pools";

export type SetupKey = "profile" | "academic_year" | "structure" | "periods" | "people" | "roles" | "apps" | "parents";

export interface SetupItem {
  key: SetupKey;
  label: string;
  done: boolean;
  link: string;
}

async function count(tid: number, q: string, params: unknown[] = []): Promise<number> {
  try {
    const [rows] = await poolFor(tid).query<RowDataPacket[]>(q, params);
    return Number(rows[0]?.n ?? 0) || 0;
  } catch {
    return 0;
  }
}

export async function setupItems(tid: number): Promise<SetupItem[]> {
  const profile = await count(
    tid,
    "SELECT COUNT(*) AS n FROM School WHERE school_id = ? AND name <> '' AND logo IS NOT NULL AND logo <> '' AND contact_phone IS NOT NULL AND contact_phone <> ''",
    [tid],
  );
  const years = await count(tid, "SELECT COUNT(*) AS n FROM AcademicYear");
  const terms = await count(tid, "SELECT COUNT(*) AS n FROM AcademicTerm");
  const programs = await count(tid, "SELECT COUNT(*) AS n FROM Program");
  const grades = await count(tid, "SELECT COUNT(*) AS n FROM Grade");
  const groups = await count(tid, "SELECT COUNT(*) AS n FROM ClassGroup");
  const subjects = await count(tid, "SELECT COUNT(*) AS n FROM Subject");
  // No per-tenant period setting in this schema yet: timetable slots stand in.
  const periods = await count(tid, "SELECT COUNT(*) AS n FROM CalendarSlot WHERE is_active = 1");
  const people = await count(tid, "SELECT COUNT(*) AS n FROM `User` WHERE status = 'ACTIVE'");
  // A grant beyond the school owner's own (school_owner preset) means roles were handed out.
  const grants = await count(
    tid,
    "SELECT COUNT(*) AS n FROM AccessGrant g LEFT JOIN `Role` r ON r.role_id = g.role_id WHERE g.status = 'ACTIVE' AND (r.preset_key IS NULL OR r.preset_key <> 'school_owner')",
  );
  const fragments = await count(tid, "SELECT COUNT(*) AS n FROM RoleSystemFragment");
  const parents = await count(tid, "SELECT COUNT(*) AS n FROM Parenting");
  return [
    { key: "profile", label: "School profile and logo", done: profile > 0, link: "/schools" },
    { key: "academic_year", label: "Academic year and terms", done: years > 0 && terms > 0, link: "/academics" },
    { key: "structure", label: "Programmes, grades, class groups and subjects", done: programs > 0 && grades > 0 && groups > 0 && subjects > 0, link: "/academics" },
    { key: "periods", label: "Timetable periods", done: periods > 0, link: "/calendar" },
    { key: "people", label: "Import staff and students", done: people > 1, link: "/users" },
    { key: "roles", label: "Roles and access", done: grants > 0, link: "/access-studio" },
    { key: "apps", label: "Which roles see which apps", done: fragments > 0, link: "/systems" },
    { key: "parents", label: "Invite parents", done: parents > 0, link: "/families/import" },
  ];
}

export async function isSetupDismissed(tid: number): Promise<boolean> {
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>("SELECT dismissed_at FROM TenantSetupState WHERE tenant_id = ?", [tid]);
    return Boolean(rows[0]?.dismissed_at);
  } catch {
    return false;
  }
}

export async function dismissSetup(tid: number, userId: number): Promise<void> {
  await controlPool().query(
    "INSERT INTO TenantSetupState (tenant_id, dismissed_at, dismissed_by) VALUES (?, NOW(), ?) ON DUPLICATE KEY UPDATE dismissed_at = VALUES(dismissed_at), dismissed_by = VALUES(dismissed_by)",
    [tid, userId],
  );
}
