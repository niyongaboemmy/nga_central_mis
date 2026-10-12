import { sql } from "drizzle-orm";
import { db } from "../../db";

/** Parent consent for the AI Tutor (TOOLS_HUB plan §5.7.6), used when the school requires it. */

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const missing = (e: any) => e?.code === "ER_NO_SUCH_TABLE" || e?.cause?.code === "ER_NO_SUCH_TABLE";

export async function hasConsent(studentId: number): Promise<boolean> {
  try {
    const [r] = rows(await db.execute(sql`SELECT granted FROM DesktopTutorConsent WHERE student_id = ${studentId} LIMIT 1`));
    return !!Number(r?.granted);
  } catch (e) {
    if (missing(e)) return false;
    throw e;
  }
}

/** A parent's children (Parenting) and each one's consent. */
export async function children(parentId: number) {
  const r = rows(await db.execute(sql`
    SELECT pa.student_id AS id, TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS name,
           c.granted, c.parent_id AS byParent
    FROM Parenting pa
    LEFT JOIN UserProfile p ON p.user_id = pa.student_id
    LEFT JOIN DesktopTutorConsent c ON c.student_id = pa.student_id
    WHERE pa.parent_id = ${parentId}
    ORDER BY p.first_name`));
  return r.map((x: any) => ({ id: Number(x.id), name: String(x.name || ""), granted: x.granted === null || x.granted === undefined ? null : !!Number(x.granted) }));
}

/** Only a linked parent may answer for a child. */
export async function setConsent(parentId: number, studentId: number, granted: boolean): Promise<boolean> {
  const [link] = rows(await db.execute(sql`SELECT 1 AS ok FROM Parenting WHERE parent_id = ${parentId} AND student_id = ${studentId} LIMIT 1`));
  if (!link) return false;
  await db.execute(sql`
    INSERT INTO DesktopTutorConsent (student_id, parent_id, granted, updated_at) VALUES (${studentId}, ${parentId}, ${granted ? 1 : 0}, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), granted = VALUES(granted), updated_at = VALUES(updated_at)`);
  return true;
}
