/**
 * Platform settings (control plane PlatformSetting) with the plan's defaults
 * (§13: the owner may change them), and the yearly reference sequences.
 */
import { RowDataPacket } from "mysql2/promise";
import { controlPool } from "../../db/platform";

export const PLATFORM_SETTING_DEFAULTS = {
  "grace.days": 14,
  "archive.retention_days": 180,
  "invoice.due_days": 14,
  "application.payment_expiry_days": 30,
  "application.draft_expiry_days": 14,
  "application.purge_after_months": 12,
  "billing.auto_issue_on_approval": false,
  "billing.separation_of_duties": false,
  "renewal.reminder_days": [30, 14, 7, 1],
  "review.sla_days": 3,
  "documents.required": ["REGISTRATION_CERT"] as string[],
  "support.max_hours": 24,
};

export type PlatformSettingKey = keyof typeof PLATFORM_SETTING_DEFAULTS;
export type PlatformSettings = typeof PLATFORM_SETTING_DEFAULTS;

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const out: any = { ...PLATFORM_SETTING_DEFAULTS };
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>("SELECT setting_key, value_json FROM PlatformSetting");
    for (const r of rows) {
      if (!(r.setting_key in out)) continue;
      out[r.setting_key] = typeof r.value_json === "string" ? JSON.parse(r.value_json) : r.value_json;
    }
  } catch {
    /* no table yet: defaults */
  }
  return out;
}

export async function getPlatformSetting<K extends PlatformSettingKey>(key: K): Promise<PlatformSettings[K]> {
  return (await getPlatformSettings())[key];
}

export async function setPlatformSetting<K extends PlatformSettingKey>(key: K, value: PlatformSettings[K], userId?: number): Promise<void> {
  await controlPool().query(
    "INSERT INTO PlatformSetting (setting_key, value_json, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by)",
    [key, JSON.stringify(value), userId ?? null],
  );
}

/**
 * Next reference in a yearly series: nextRef("APP") -> "APP-2026-0001".
 * Atomic (LAST_INSERT_ID trick), so two approvals never share a number.
 */
export async function nextRef(prefix: "APP" | "INV", now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const key = `${prefix}-${year}`;
  await controlPool().query("INSERT IGNORE INTO PlatformSequence (seq_key, next_value) VALUES (?, 1)", [key]);
  const conn = await controlPool().getConnection();
  try {
    await conn.query("UPDATE PlatformSequence SET next_value = LAST_INSERT_ID(next_value + 1) WHERE seq_key = ?", [key]);
    const [rows] = await conn.query<RowDataPacket[]>("SELECT LAST_INSERT_ID() AS v");
    const n = Number(rows[0].v) - 1;
    return `${key}-${String(n).padStart(4, "0")}`;
  } finally {
    conn.release();
  }
}
