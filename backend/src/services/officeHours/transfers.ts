import { and, eq, inArray, lte, or, desc } from "drizzle-orm";
import { db } from "../../db";
import { OfficeHourAssignment, OfficeHourSchedule, OfficeHourTransferRequest } from "../../db/officeHoursSchema";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "../../errors/CustomError";
import { addDaysYmd, dowOfYmd, kigaliInstant } from "../reminders/time";
import { Actor, assertCanManage } from "./access";
import { availabilityFor, moveStudent } from "./assignments";
import { now, todayYmd } from "./common";
import { emitOfficeHoursEvent } from "./events";
import { studentCards, userNames } from "./eligibility";
import { loadSchedule } from "./schedules";

/**
 * Transfer requests (plan §5.4): teacher B asks teacher A to release a student
 * so B can assign them. A accepts (the student moves atomically) or declines.
 * Requests expire after three school days.
 */
const SCHOOL_DAYS_TO_EXPIRE = 3;

const expiryFrom = (ymd: string) => {
  let d = ymd;
  let left = SCHOOL_DAYS_TO_EXPIRE;
  while (left > 0) {
    d = addDaysYmd(d, 1);
    const dow = dowOfYmd(d);
    if (dow >= 1 && dow <= 5) left--;
  }
  return kigaliInstant(d, 23 * 60 + 59);
};

export const requestTransfer = async (actor: Actor, studentId: number, toScheduleId: number, message: unknown) => {
  const target = await loadSchedule(toScheduleId);
  assertCanManage(actor, target.teacher_id);
  if (target.status !== "ACTIVE") throw new ConflictError("Publish these office hours before requesting a transfer");
  const avail = (await availabilityFor(target, [studentId])).get(studentId);
  if (!avail || avail.status === "FREE") throw new ConflictError("This student is free; assign them directly");
  if (avail.status === "WITH_YOU") throw new ConflictError("This student is already in these office hours");
  const holder = avail.holders[0];
  if (!holder) throw new ConflictError("Could not find who holds this student");
  if (holder.teacher_id === actor.userId) throw new ConflictError("You already hold this student in other office hours; remove them there first");
  const [dup] = await db
    .select({ id: OfficeHourTransferRequest.request_id })
    .from(OfficeHourTransferRequest)
    .where(
      and(
        eq(OfficeHourTransferRequest.from_assignment_id, holder.assignment_id),
        eq(OfficeHourTransferRequest.to_schedule_id, toScheduleId),
        eq(OfficeHourTransferRequest.status, "PENDING"),
      ),
    )
    .limit(1);
  if (dup) throw new ConflictError("You already asked for this student; wait for an answer");
  const [res] = (await db.insert(OfficeHourTransferRequest).values({
    student_id: studentId,
    from_assignment_id: holder.assignment_id,
    to_schedule_id: toScheduleId,
    requested_by: actor.userId,
    message: typeof message === "string" ? message.trim().slice(0, 500) || null : null,
    expires_at: expiryFrom(todayYmd()),
    created_at: now(),
  })) as any;
  const requestId = res.insertId as number;
  emitOfficeHoursEvent({ type: "transfer_requested", requestId, actorId: actor.userId });
  return requestId;
};

export const loadTransfer = async (requestId: number) => {
  const [row] = await db
    .select({ r: OfficeHourTransferRequest, from: OfficeHourAssignment, fromSchedule: OfficeHourSchedule })
    .from(OfficeHourTransferRequest)
    .innerJoin(OfficeHourAssignment, eq(OfficeHourAssignment.assignment_id, OfficeHourTransferRequest.from_assignment_id))
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(eq(OfficeHourTransferRequest.request_id, requestId))
    .limit(1);
  if (!row) throw new NotFoundError("Transfer request not found");
  return row;
};

export const decideTransfer = async (actor: Actor, requestId: number, accept: boolean, note: unknown) => {
  const { r, from, fromSchedule } = await loadTransfer(requestId);
  // The holder (or leadership) decides.
  assertCanManage(actor, fromSchedule.teacher_id);
  if (r.status !== "PENDING") throw new ConflictError(`This request is already ${r.status.toLowerCase()}`);
  if (r.expires_at.getTime() < now().getTime()) {
    await db.update(OfficeHourTransferRequest).set({ status: "EXPIRED" }).where(eq(OfficeHourTransferRequest.request_id, requestId));
    throw new ConflictError("This request has expired");
  }
  const decisionNote = typeof note === "string" ? note.trim().slice(0, 500) || null : null;
  if (accept) {
    if (from.status !== "ACTIVE") throw new ConflictError("The student has already left these office hours");
    await moveStudent(actor, r.student_id, r.to_schedule_id, "TRANSFERRED", decisionNote ?? r.message);
  }
  await db
    .update(OfficeHourTransferRequest)
    .set({ status: accept ? "ACCEPTED" : "DECLINED", decided_by: actor.userId, decided_at: now(), decision_note: decisionNote })
    .where(eq(OfficeHourTransferRequest.request_id, requestId));
  emitOfficeHoursEvent({ type: "transfer_decided", requestId, actorId: actor.userId, accepted: accept });
};

export const cancelTransfer = async (actor: Actor, requestId: number) => {
  const { r } = await loadTransfer(requestId);
  if (r.requested_by !== actor.userId && !actor.manageAny) throw new AuthorizationError("Only the requester can cancel");
  if (r.status !== "PENDING") return;
  await db.update(OfficeHourTransferRequest).set({ status: "CANCELLED", decided_at: now(), decided_by: actor.userId }).where(eq(OfficeHourTransferRequest.request_id, requestId));
};

export const expireTransfers = async () => {
  const res = (await db
    .update(OfficeHourTransferRequest)
    .set({ status: "EXPIRED" })
    .where(and(eq(OfficeHourTransferRequest.status, "PENDING"), lte(OfficeHourTransferRequest.expires_at, now())))) as any;
  return Number(res?.[0]?.affectedRows ?? 0);
};

/** Requests a teacher must answer (incoming) and is waiting on (outgoing). */
export const transfersFor = async (userId: number, all = false) => {
  const rows = await db
    .select({ r: OfficeHourTransferRequest, fromSchedule: OfficeHourSchedule })
    .from(OfficeHourTransferRequest)
    .innerJoin(OfficeHourAssignment, eq(OfficeHourAssignment.assignment_id, OfficeHourTransferRequest.from_assignment_id))
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(
      and(
        eq(OfficeHourTransferRequest.status, "PENDING"),
        all ? undefined : or(eq(OfficeHourSchedule.teacher_id, userId), eq(OfficeHourTransferRequest.requested_by, userId)),
      ),
    )
    .orderBy(desc(OfficeHourTransferRequest.created_at));
  if (!rows.length) return { incoming: [], outgoing: [] };
  const targets = await db
    .select({ id: OfficeHourSchedule.schedule_id, title: OfficeHourSchedule.title, teacher_id: OfficeHourSchedule.teacher_id, year: OfficeHourSchedule.academic_year_id })
    .from(OfficeHourSchedule)
    .where(inArray(OfficeHourSchedule.schedule_id, rows.map((r) => r.r.to_schedule_id)));
  const targetById = new Map(targets.map((t) => [t.id, t]));
  const names = await userNames([...rows.map((r) => r.r.requested_by), ...rows.map((r) => r.fromSchedule.teacher_id)]);
  const cards = await studentCards(rows.map((r) => r.r.student_id), rows[0].fromSchedule.academic_year_id);
  const shaped = rows.map((x) => ({
    ...x.r,
    student: cards.get(x.r.student_id) ?? null,
    from_schedule: { schedule_id: x.fromSchedule.schedule_id, title: x.fromSchedule.title, teacher_id: x.fromSchedule.teacher_id, teacher_name: names.get(x.fromSchedule.teacher_id) ?? null },
    to_schedule: { schedule_id: x.r.to_schedule_id, title: targetById.get(x.r.to_schedule_id)?.title ?? null },
    requested_by_name: names.get(x.r.requested_by) ?? null,
  }));
  if (all) return { incoming: shaped, outgoing: [] };
  return {
    incoming: shaped.filter((x) => x.from_schedule.teacher_id === userId),
    outgoing: shaped.filter((x) => x.requested_by === userId),
  };
};

export const assertValidTransferBody = (body: any) => {
  const studentId = Number(body?.student_id);
  const toScheduleId = Number(body?.to_schedule_id);
  if (!Number.isInteger(studentId) || studentId <= 0 || !Number.isInteger(toScheduleId) || toScheduleId <= 0) {
    throw new ValidationError("student_id and to_schedule_id are required");
  }
  return { studentId, toScheduleId };
};
