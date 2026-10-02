import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../../db";
import { StudentClassGroup } from "../../db/schema";
import { OfficeHourAssignment, OfficeHourSchedule, OfficeHourStudentLock } from "../../db/officeHoursSchema";
import logger from "../../utils/logger";
import { addDaysYmd } from "../reminders/time";
import { isDupEntry, now, todayYmd } from "./common";
import { emitOfficeHoursEvent } from "./events";
import { lockDaysFor } from "./assignments";
import { scheduleDays } from "./sessions";
import { getSettings } from "./settings";

/**
 * Nightly reconcile (plan §7.4):
 *   1. windows that are over end naturally (schedules and assignments), freeing locks;
 *   2. a student no longer ACTIVE in a class this year leaves (LEFT_CLASS);
 *   3. the invariant "ACTIVE assignment <=> lock rows" is repaired and drift logged.
 */
export const reconcileOfficeHours = async () => {
  const today = todayYmd();
  const out = { schedulesEnded: 0, assignmentsCompleted: 0, leftClass: 0, orphanLocks: 0, locksRestored: 0, lockConflicts: 0 };

  // 1) Natural ends.
  const finishedSchedules = await db
    .select({ id: OfficeHourSchedule.schedule_id })
    .from(OfficeHourSchedule)
    .where(and(eq(OfficeHourSchedule.status, "ACTIVE"), lt(OfficeHourSchedule.effective_to, today)));
  if (finishedSchedules.length) {
    await db
      .update(OfficeHourSchedule)
      .set({ status: "ENDED", ended_at: now() })
      .where(inArray(OfficeHourSchedule.schedule_id, finishedSchedules.map((s) => s.id)));
    out.schedulesEnded = finishedSchedules.length;
  }
  const finished = await db
    .select({ id: OfficeHourAssignment.assignment_id })
    .from(OfficeHourAssignment)
    .where(and(eq(OfficeHourAssignment.status, "ACTIVE"), lt(OfficeHourAssignment.effective_to, today)));
  if (finished.length) {
    const ids = finished.map((f) => f.id);
    await db
      .update(OfficeHourAssignment)
      .set({ status: "ENDED", end_reason_code: "COMPLETED", ended_at: now() })
      .where(inArray(OfficeHourAssignment.assignment_id, ids));
    await db.delete(OfficeHourStudentLock).where(inArray(OfficeHourStudentLock.assignment_id, ids));
    out.assignmentsCompleted = ids.length;
  }

  // 2) Students who left their class (or the school) this year.
  const gone = (await db.execute(sql`
    SELECT a.assignment_id
    FROM OfficeHourAssignment a
    JOIN OfficeHourSchedule s ON s.schedule_id = a.schedule_id
    WHERE a.status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM ${StudentClassGroup} scg
        WHERE scg.user_id = a.student_id AND scg.academic_year_id = s.academic_year_id AND scg.status = 'ACTIVE'
      )
  `)) as any;
  const goneIds = (gone[0] as any[]).map((r) => Number(r.assignment_id));
  if (goneIds.length) {
    const yesterday = addDaysYmd(today, -1);
    await db
      .update(OfficeHourAssignment)
      .set({ status: "ENDED", end_reason_code: "LEFT_CLASS", ended_at: now(), effective_to: yesterday })
      .where(inArray(OfficeHourAssignment.assignment_id, goneIds));
    await db.delete(OfficeHourStudentLock).where(inArray(OfficeHourStudentLock.assignment_id, goneIds));
    for (const id of goneIds) emitOfficeHoursEvent({ type: "removed", assignmentId: id, actorId: 0, reason: "LEFT_CLASS" });
    out.leftClass = goneIds.length;
  }

  // 3) Lock invariant.
  const orphan = (await db.execute(sql`
    SELECT l.assignment_id FROM OfficeHourStudentLock l
    LEFT JOIN OfficeHourAssignment a ON a.assignment_id = l.assignment_id AND a.status = 'ACTIVE'
    WHERE a.assignment_id IS NULL
  `)) as any;
  const orphanIds = [...new Set((orphan[0] as any[]).map((r) => Number(r.assignment_id)))];
  if (orphanIds.length) {
    await db.delete(OfficeHourStudentLock).where(inArray(OfficeHourStudentLock.assignment_id, orphanIds));
    out.orphanLocks = orphanIds.length;
  }
  const unlocked = (await db.execute(sql`
    SELECT a.assignment_id, a.schedule_id, a.student_id, a.academic_term_id FROM OfficeHourAssignment a
    WHERE a.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM OfficeHourStudentLock l WHERE l.assignment_id = a.assignment_id)
  `)) as any;
  const rows = unlocked[0] as any[];
  if (rows.length) {
    const settings = await getSettings();
    const days = await scheduleDays([...new Set(rows.map((r) => Number(r.schedule_id)))]);
    for (const r of rows) {
      const lockDays = lockDaysFor(settings.student_lock_mode, days.get(Number(r.schedule_id)) ?? []);
      try {
        await db.insert(OfficeHourStudentLock).values(
          lockDays.map((d) => ({ academic_term_id: Number(r.academic_term_id), student_id: Number(r.student_id), day_of_week: d, assignment_id: Number(r.assignment_id) })),
        );
        out.locksRestored++;
      } catch (error) {
        if (!isDupEntry(error)) throw error;
        // Two assignments claim the same day: a human must decide which one stays.
        out.lockConflicts++;
        logger.warn("[office-hours] reconcile: assignment overlaps another and was left unlocked", { assignmentId: r.assignment_id });
      }
    }
  }
  if (Object.values(out).some((n) => n > 0)) logger.info("[office-hours] reconcile", out);
  return out;
};
