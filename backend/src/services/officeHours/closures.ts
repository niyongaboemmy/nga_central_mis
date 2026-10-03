import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db";
import { OfficeHourSession, SchoolClosure } from "../../db/officeHoursSchema";
import { NotFoundError, ValidationError } from "../../errors/CustomError";
import { isYmd } from "./common";
import { cancelForClosure, rematerialiseSchedule, schedulesTouching } from "./sessions";

/**
 * School closures (plan §6.9): holidays, exam days, events. Creating one
 * cancels the office-hours sessions it covers (reason CLOSURE, with a notice);
 * removing it restores them. scope ALL is deliberately general so the lesson
 * reminders can honour closures later.
 */
export const listClosures = async (fromYmd?: string | null, toYmd?: string | null) => {
  const conds = [];
  if (fromYmd) conds.push(gte(SchoolClosure.end_date, fromYmd));
  if (toYmd) conds.push(lte(SchoolClosure.start_date, toYmd));
  return db.select().from(SchoolClosure).where(conds.length ? and(...conds) : undefined).orderBy(asc(SchoolClosure.start_date));
};

/** How many sessions a closure would cancel (shown before confirming). */
export const previewClosure = async (startYmd: string, endYmd: string) => {
  const rows = await db
    .select({ id: OfficeHourSession.session_id })
    .from(OfficeHourSession)
    .where(and(gte(OfficeHourSession.session_date, startYmd), lte(OfficeHourSession.session_date, endYmd), eq(OfficeHourSession.status, "SCHEDULED")));
  return { sessions_affected: rows.length };
};

export const createClosure = async (input: any, actorId: number) => {
  const start = input?.start_date;
  const end = input?.end_date || start;
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!isYmd(start) || !isYmd(end)) throw new ValidationError("Dates must look like 2026-10-06", [{ field: "start_date", message: "Invalid date" }]);
  if (start > end) throw new ValidationError("The closure must end on or after it starts", [{ field: "end_date", message: "Before start" }]);
  if (!reason || reason.length > 150) throw new ValidationError("Give a reason (150 characters at most)", [{ field: "reason", message: "Required" }]);
  const scope = input?.scope === "OFFICE_HOURS" ? "OFFICE_HOURS" : "ALL";
  const [res] = (await db.insert(SchoolClosure).values({ start_date: start, end_date: end, reason, scope, created_by: actorId })) as any;
  const cancelled = await cancelForClosure(start, end, actorId);
  return { closure_id: res.insertId as number, sessions_cancelled: cancelled.length };
};

export const deleteClosure = async (closureId: number, actorId: number) => {
  const [row] = await db.select().from(SchoolClosure).where(eq(SchoolClosure.closure_id, closureId)).limit(1);
  if (!row) throw new NotFoundError("Closure not found");
  await db.delete(SchoolClosure).where(eq(SchoolClosure.closure_id, closureId));
  let restored = 0;
  for (const scheduleId of await schedulesTouching(row.start_date, row.end_date)) {
    restored += (await rematerialiseSchedule(scheduleId, actorId)).restored.length;
  }
  return { restored };
};
