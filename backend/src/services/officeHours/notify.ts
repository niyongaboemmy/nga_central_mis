import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import { Notification, User } from "../../db/schema";
import {
  OfficeHourAbsenceNotice,
  OfficeHourAssignment,
  OfficeHourAttendance,
  OfficeHourSchedule,
  OfficeHourSession,
  OfficeHourTransferRequest,
} from "../../db/officeHoursSchema";
import logger from "../../utils/logger";
import { notifyPerson, PersonNotice } from "../notifications/notifyPerson";
import { appUrl } from "../reminders/webPush";
import { humanizeCode } from "./text";
import { dayLabel, todayYmd } from "./common";
import { onOfficeHoursEvent, OfficeHoursEvent } from "./events";
import { userNames } from "./eligibility";
import { evaluateEscalations, guardiansOf, NewEscalation, recordNotified } from "./escalation";
import { peopleOfSessions, refreshReminderHub } from "./reminders";
import { scheduleDays } from "./sessions";
import { getSettings } from "./settings";

/**
 * Office-hours notifications (plan §13). Every event becomes a bell entry
 * plus Web Push for each person concerned -- independent of whether they
 * switched Hub reminders on, because these are things they must know.
 * Wording lives here only. Students never see reason codes or staff notes.
 *
 * Dedupe follows the Notification unique key (user, kind, subject type, id):
 * a repeated notice for the same thing refreshes the existing row.
 */
export type EmailSender = (to: string, subject: string, html: string, text: string) => Promise<boolean>;
const realEmail: EmailSender = async (to, subject, html, text) => {
  const { default: emailService } = await import("../../utils/email");
  return emailService.sendEmail({ to, subject, html, text }, false);
};
let sendEmail: EmailSender = realEmail;
/** Test hook. */
export const setOfficeHoursEmailSender = (fn: EmailSender | null) => {
  sendEmail = fn ?? realEmail;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const emailLayout = (title: string, lines: string[], link: string, footer: string) => {
  const url = appUrl(link);
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin:0 0 8px">NGA · Office hours</p>
  <h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
  ${lines.map((l) => `<p style="margin:0 0 10px;color:#334155">${esc(l)}</p>`).join("\n  ")}
  <a href="${esc(url)}" style="display:inline-block;margin-top:8px;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Open in NGA</a>
  <p style="font-size:12px;color:#64748b;margin-top:24px">${esc(footer)}</p>
</div>`;
  return { html, text: `${title}\n\n${lines.join("\n")}\n\nOpen: ${url}\n\n${footer}` };
};

const emailOf = async (userIds: number[]) => {
  if (!userIds.length) return new Map<number, string>();
  const rows = await db.select({ id: User.user_id, email: User.email }).from(User).where(inArray(User.user_id, userIds));
  return new Map(rows.filter((r) => r.email && !r.email.endsWith("@example.com")).map((r) => [r.id, r.email]));
};

const send = async (userIds: number[], n: Omit<PersonNotice, "userId">) => {
  const unique = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
  for (const userId of unique) await notifyPerson({ ...n, userId });
  return unique;
};

const scheduleRow = async (scheduleId: number) => {
  const [s] = await db.select().from(OfficeHourSchedule).where(eq(OfficeHourSchedule.schedule_id, scheduleId)).limit(1);
  return s ?? null;
};

const when = async (s: typeof OfficeHourSchedule.$inferSelect) => {
  const days = (await scheduleDays([s.schedule_id])).get(s.schedule_id) ?? [];
  return `${dayLabel(days)}, ${s.start_time}–${s.end_time}${s.location ? `, ${s.location}` : ""}`;
};

const ymdLabel = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
};

const activeStudentsOf = async (scheduleId: number) =>
  db
    .select({ id: OfficeHourAssignment.assignment_id, student: OfficeHourAssignment.student_id, from: OfficeHourAssignment.effective_from })
    .from(OfficeHourAssignment)
    .where(and(eq(OfficeHourAssignment.schedule_id, scheduleId), eq(OfficeHourAssignment.status, "ACTIVE")));

const notifyAssigned = async (assignmentIds: number[], actorId: number) => {
  if (!assignmentIds.length) return;
  const rows = await db
    .select({ a: OfficeHourAssignment, s: OfficeHourSchedule })
    .from(OfficeHourAssignment)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(and(inArray(OfficeHourAssignment.assignment_id, assignmentIds), eq(OfficeHourAssignment.status, "ACTIVE")));
  const teachers = await userNames(rows.map((r) => r.s.teacher_id));
  for (const { a, s } of rows) {
    if (s.status !== "ACTIVE") continue;
    await notifyPerson({
      userId: a.student_id,
      kind: "office_hours_assigned",
      title: `Office hours with ${teachers.get(s.teacher_id) ?? "your teacher"}`,
      body: `${s.title}: ${await when(s)}. Starts ${ymdLabel(a.effective_from)}. Office hours are mandatory.`,
      link: "/my-office-hours",
      subjectType: "office_hour_assignment",
      subjectId: a.assignment_id,
      actorId,
    });
  }
  await refreshReminderHub(rows.map((r) => r.a.student_id));
};

const notifyRemoved = async (assignmentId: number, actorId: number, reason: string) => {
  if (reason === "LEFT_CLASS") return;
  const [row] = await db
    .select({ a: OfficeHourAssignment, s: OfficeHourSchedule })
    .from(OfficeHourAssignment)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(eq(OfficeHourAssignment.assignment_id, assignmentId))
    .limit(1);
  if (!row) return;
  const teacher = (await userNames([row.s.teacher_id])).get(row.s.teacher_id) ?? "your teacher";
  await notifyPerson({
    userId: row.a.student_id,
    kind: "office_hours_removed",
    title: reason === "GOAL_MET" ? `Well done — office hours with ${teacher} are complete` : `You no longer have office hours with ${teacher}`,
    body: `${row.s.title} (${await when(row.s)}) is no longer on your timetable.`,
    link: "/my-office-hours",
    subjectType: "office_hour_assignment",
    subjectId: assignmentId,
    actorId: actorId || undefined,
  });
  await refreshReminderHub([row.a.student_id]);
};

const notifyScheduleChanged = async (scheduleId: number, actorId: number, fields: string[]) => {
  const s = await scheduleRow(scheduleId);
  if (!s) return;
  const students = await activeStudentsOf(scheduleId);
  const what = fields.includes("days") || fields.includes("start_time") || fields.includes("end_time") ? "times" : fields.includes("location") ? "room" : "details";
  await send(
    students.map((x) => x.student),
    {
      kind: "office_hours_changed",
      title: `Office hours ${what} changed: ${s.title}`,
      body: `Now ${await when(s)}.`,
      link: "/my-office-hours",
      subjectType: "office_hour_schedule",
      subjectId: scheduleId,
      actorId,
    },
  );
  const today = todayYmd();
  const future = await db
    .select({ id: OfficeHourSession.session_id })
    .from(OfficeHourSession)
    .where(and(eq(OfficeHourSession.schedule_id, scheduleId), gte(OfficeHourSession.session_date, today)));
  await refreshReminderHub([s.teacher_id, ...students.map((x) => x.student)], what === "times" ? future.map((f) => f.id) : []);
};

const notifyScheduleEnded = async (scheduleId: number, actorId: number) => {
  const s = await scheduleRow(scheduleId);
  if (!s) return;
  const ended = await db
    .select({ id: OfficeHourAssignment.assignment_id, student: OfficeHourAssignment.student_id })
    .from(OfficeHourAssignment)
    .where(and(eq(OfficeHourAssignment.schedule_id, scheduleId), eq(OfficeHourAssignment.end_reason_code, "SCHEDULE_ENDED")));
  const teacher = (await userNames([s.teacher_id])).get(s.teacher_id) ?? "your teacher";
  for (const e of ended) {
    await notifyPerson({
      userId: e.student,
      kind: "office_hours_removed",
      title: `Office hours with ${teacher} have ended`,
      body: `${s.title} is no longer on your timetable.`,
      link: "/my-office-hours",
      subjectType: "office_hour_assignment",
      subjectId: e.id,
      actorId,
    });
  }
  await refreshReminderHub([s.teacher_id, ...ended.map((e) => e.student)]);
};

const notifyCancelled = async (sessionIds: number[], actorId: number, reason: string, restored = false) => {
  if (!sessionIds.length) return;
  const sessions = await db
    .select({ s: OfficeHourSession, title: OfficeHourSchedule.title })
    .from(OfficeHourSession)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
    .where(inArray(OfficeHourSession.session_id, sessionIds));
  const today = todayYmd();
  const everyone: number[] = [];
  for (const { s, title } of sessions) {
    if (s.session_date < today) continue; // nobody needs to hear about the past
    const people = await peopleOfSessions([s.session_id]);
    everyone.push(...people);
    const students = people.filter((p) => p !== s.host_teacher_id);
    const recipients = actorId === s.host_teacher_id ? students : people;
    const why = reason === "CLOSURE" ? "the school is closed" : reason === "TEACHER_ABSENT" ? "your teacher is away" : humanizeCode(reason).toLowerCase();
    await send(recipients, {
      kind: "office_hours_cancelled",
      title: restored ? `Office hours are back on: ${title}` : `Office hours cancelled: ${title}`,
      body: restored
        ? `${ymdLabel(s.session_date)}, ${s.start_time}${s.location ? `, ${s.location}` : ""} is on again.`
        : `${ymdLabel(s.session_date)}, ${s.start_time} — ${why}.${s.cancel_note ? ` “${s.cancel_note}”` : ""} This never counts as missed.`,
      link: "/my-office-hours",
      subjectType: "office_hour_session",
      subjectId: s.session_id,
      actorId: actorId || undefined,
      // Same-day news must reach people before 16:20.
      ttlSeconds: s.session_date === today ? 4 * 3600 : 24 * 3600,
    });
  }
  await refreshReminderHub(everyone);
};

const notifyHostChanged = async (sessionId: number, actorId: number) => {
  const [row] = await db
    .select({ s: OfficeHourSession, title: OfficeHourSchedule.title })
    .from(OfficeHourSession)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
    .where(eq(OfficeHourSession.session_id, sessionId))
    .limit(1);
  if (!row) return;
  const host = (await userNames([row.s.host_teacher_id])).get(row.s.host_teacher_id) ?? "another teacher";
  await notifyPerson({
    userId: row.s.host_teacher_id,
    kind: "office_hours_changed",
    title: `You are covering office hours: ${row.title}`,
    body: `${ymdLabel(row.s.session_date)}, ${row.s.start_time}${row.s.location ? `, ${row.s.location}` : ""}. Please take the register.`,
    link: `/office-hours`,
    subjectType: "office_hour_session",
    subjectId: sessionId,
    actorId,
  });
  const people = await peopleOfSessions([sessionId]);
  await send(
    people.filter((p) => p !== row.s.host_teacher_id),
    {
      kind: "office_hours_changed",
      title: `${row.title}: ${host} will run office hours`,
      body: `${ymdLabel(row.s.session_date)}, ${row.s.start_time}${row.s.location ? `, ${row.s.location}` : ""}.`,
      link: "/my-office-hours",
      subjectType: "office_hour_session",
      subjectId: sessionId,
      actorId,
    },
  );
  await refreshReminderHub(people);
};

const notifyMoved = async (sessionId: number, fromSessionId: number, actorId: number) => {
  const [row] = await db
    .select({ s: OfficeHourSession, title: OfficeHourSchedule.title })
    .from(OfficeHourSession)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
    .where(eq(OfficeHourSession.session_id, sessionId))
    .limit(1);
  const [from] = await db.select().from(OfficeHourSession).where(eq(OfficeHourSession.session_id, fromSessionId)).limit(1);
  if (!row || !from) return;
  // Everyone expected at the original date.
  const people = await peopleOfSessions([fromSessionId]);
  await send(
    people.filter((p) => p !== actorId),
    {
      kind: "office_hours_changed",
      title: `Office hours moved: ${row.title}`,
      body: `${ymdLabel(from.session_date)} ${from.start_time} is now ${ymdLabel(row.s.session_date)} ${row.s.start_time}${row.s.location ? `, ${row.s.location}` : ""}.`,
      link: "/my-office-hours",
      subjectType: "office_hour_session",
      subjectId: sessionId,
      actorId,
    },
  );
  await refreshReminderHub(people, [fromSessionId]);
};

/** Absent marks tell the student; a correction away from absent withdraws that notice. */
const notifyMarks = async (sessionId: number, studentIds: number[], actorId: number) => {
  if (!studentIds.length) return;
  const [row] = await db
    .select({ s: OfficeHourSession, title: OfficeHourSchedule.title, teacher_id: OfficeHourSchedule.teacher_id })
    .from(OfficeHourSession)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
    .where(eq(OfficeHourSession.session_id, sessionId))
    .limit(1);
  if (!row) return;
  const marks = await db
    .select()
    .from(OfficeHourAttendance)
    .where(and(eq(OfficeHourAttendance.session_id, sessionId), inArray(OfficeHourAttendance.student_id, studentIds), isNotNull(OfficeHourAttendance.status)));
  const teacher = (await userNames([row.s.host_teacher_id])).get(row.s.host_teacher_id) ?? "your teacher";
  for (const m of marks) {
    if (m.status === "ABSENT") {
      await notifyPerson({
        userId: m.student_id,
        kind: "office_hours_absent",
        title: `You missed office hours with ${teacher}`,
        body: `${row.title}, ${ymdLabel(row.s.session_date)}. Office hours are mandatory — please come next time, or tell your teacher beforehand if you can't.`,
        link: "/my-office-hours",
        subjectType: "office_hour_session",
        subjectId: sessionId,
        actorId: actorId || undefined,
        push: false,
      });
    } else {
      await db
        .delete(Notification)
        .where(
          and(
            eq(Notification.user_id, m.student_id),
            eq(Notification.kind, "office_hours_absent"),
            eq(Notification.subject_type, "office_hour_session"),
            eq(Notification.subject_id, sessionId),
          ),
        );
    }
  }
};

/** Tell the right people about new escalations (plan §13.4). */
export const notifyEscalations = async (created: NewEscalation[]) => {
  if (!created.length) return;
  const settings = await getSettings();
  for (const e of created) {
    const s = await scheduleRow(e.scheduleId);
    if (!s) continue;
    const { classTeachers, programLeads, parents } = await guardiansOf(e.studentId, s.academic_year_id);
    const names = await userNames([e.studentId, e.teacherId]);
    const student = names.get(e.studentId) ?? "A student";
    const teacher = names.get(e.teacherId) ?? "their teacher";
    const why =
      e.trigger === "RATE_BELOW"
        ? `attendance is ${e.rate === null ? "low" : `${Math.round(e.rate)}%`}`
        : e.trigger === "MONTH_L1"
          ? "several absences in the last 30 days"
          : `${e.streak} sessions missed in a row`;
    const notified: number[] = [];
    // The student, in neutral words.
    await notifyPerson({
      userId: e.studentId,
      kind: "office_hours_escalation",
      title: `Please come to office hours with ${teacher}`,
      body: `You have missed ${e.streak > 1 ? `the last ${e.streak} sessions` : "several sessions"} of ${s.title}. ${e.level === 2 ? "Your class teacher and family have been told." : "Your class teacher has been told."}`,
      link: "/my-office-hours",
      subjectType: "office_hour_escalation",
      subjectId: e.escalationId,
    });
    notified.push(e.studentId);
    const staff = [e.teacherId, ...classTeachers, ...(e.level === 2 ? programLeads : [])];
    notified.push(
      ...(await send(staff, {
        kind: "office_hours_escalation",
        title: `${e.level === 2 ? "Serious: " : ""}${student} is missing office hours`,
        body: `${s.title} with ${teacher}: ${why}.`,
        link: "/office-hours/admin?tab=escalations",
        subjectType: "office_hour_escalation",
        subjectId: e.escalationId,
      })),
    );
    if (e.level === 2 && settings.parent_notifications !== "OFF" && parents.length) {
      notified.push(
        ...(await send(parents, {
          kind: "office_hours_escalation",
          title: `${student} is missing mandatory office hours`,
          body: `${student} has ${why} in ${s.title} with ${teacher}. Please encourage them to attend.`,
          link: "/my-office-hours",
          subjectType: "office_hour_escalation",
          subjectId: e.escalationId,
        })),
      );
      const emails = await emailOf(parents);
      for (const [, to] of emails) {
        const mail = emailLayout(
          `${student} is missing mandatory office hours`,
          [
            `${student} has ${why} in ${s.title} with ${teacher} (${await when(s)}).`,
            "Office hours are part of the school's academic support. Please encourage them to attend, or contact the class teacher if something is stopping them.",
          ],
          "/my-office-hours",
          "You receive this because you are listed as a parent or guardian at NGA.",
        );
        await sendEmail(to, `${student}: office hours attendance`, mail.html, mail.text).catch(() => false);
      }
    }
    await recordNotified(e.escalationId, notified);
  }
};

const notifyTransfer = async (requestId: number, decided: boolean, accepted = false) => {
  const [row] = await db
    .select({ r: OfficeHourTransferRequest, fromTeacher: OfficeHourSchedule.teacher_id })
    .from(OfficeHourTransferRequest)
    .innerJoin(OfficeHourAssignment, eq(OfficeHourAssignment.assignment_id, OfficeHourTransferRequest.from_assignment_id))
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(eq(OfficeHourTransferRequest.request_id, requestId))
    .limit(1);
  if (!row) return;
  const names = await userNames([row.r.requested_by, row.r.student_id, row.fromTeacher]);
  const student = names.get(row.r.student_id) ?? "a student";
  if (!decided) {
    await notifyPerson({
      userId: row.fromTeacher,
      kind: "office_hours_transfer",
      title: `${names.get(row.r.requested_by) ?? "A teacher"} asks you to release ${student}`,
      body: row.r.message ? `“${row.r.message}”` : "Open Office hours to release or keep the student.",
      link: "/office-hours",
      subjectType: "office_hour_transfer",
      subjectId: requestId,
      actorId: row.r.requested_by,
    });
  } else {
    await notifyPerson({
      userId: row.r.requested_by,
      kind: "office_hours_transfer",
      title: accepted ? `${student} is now in your office hours` : `${names.get(row.fromTeacher) ?? "The other teacher"} kept ${student}`,
      body: row.r.decision_note ? `“${row.r.decision_note}”` : accepted ? "They have been told when to come." : "You can ask leadership if it is urgent.",
      link: "/office-hours",
      subjectType: "office_hour_transfer",
      subjectId: requestId,
    });
  }
};

const notifyOverride = async (assignmentId: number, endedAssignmentIds: number[], actorId: number) => {
  await notifyAssigned([assignmentId], actorId);
  const ended = endedAssignmentIds.length
    ? await db
        .select({ teacher: OfficeHourSchedule.teacher_id, title: OfficeHourSchedule.title, student: OfficeHourAssignment.student_id, id: OfficeHourAssignment.assignment_id })
        .from(OfficeHourAssignment)
        .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
        .where(inArray(OfficeHourAssignment.assignment_id, endedAssignmentIds))
    : [];
  const [target] = await db
    .select({ teacher: OfficeHourSchedule.teacher_id, title: OfficeHourSchedule.title, student: OfficeHourAssignment.student_id })
    .from(OfficeHourAssignment)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(eq(OfficeHourAssignment.assignment_id, assignmentId));
  if (!target) return;
  const name = (await userNames([target.student])).get(target.student) ?? "A student";
  for (const e of ended) {
    await notifyPerson({
      userId: e.teacher,
      kind: "office_hours_changed",
      title: `${name} moved to other office hours`,
      body: `They left “${e.title}” and joined “${target.title}”.`,
      link: "/office-hours",
      subjectType: "office_hour_assignment",
      subjectId: e.id,
      actorId,
    });
  }
  if (actorId !== target.teacher) {
    await notifyPerson({
      userId: target.teacher,
      kind: "office_hours_changed",
      title: `${name} was added to “${target.title}”`,
      body: "Added by leadership.",
      link: "/office-hours",
      subjectType: "office_hour_assignment",
      subjectId: assignmentId,
      actorId,
    });
  }
};

const notifyAbsenceNotice = async (sessionId: number, studentId: number) => {
  const [row] = await db
    .select({ s: OfficeHourSession, title: OfficeHourSchedule.title, n: OfficeHourAbsenceNotice })
    .from(OfficeHourSession)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
    .innerJoin(OfficeHourAbsenceNotice, and(eq(OfficeHourAbsenceNotice.session_id, OfficeHourSession.session_id), eq(OfficeHourAbsenceNotice.student_id, studentId)))
    .where(eq(OfficeHourSession.session_id, sessionId))
    .limit(1);
  if (!row) return;
  const name = (await userNames([studentId])).get(studentId) ?? "A student";
  await notifyPerson({
    userId: row.s.host_teacher_id,
    kind: "office_hours_changed",
    title: `${name} can't come to office hours ${ymdLabel(row.s.session_date)}`,
    body: `${humanizeCode(row.n.reason)}${row.n.note ? ` — “${row.n.note}”` : ""}. It shows on the register as a suggestion to excuse.`,
    link: "/office-hours",
    subjectType: "office_hour_session",
    subjectId: sessionId * 100000 + (studentId % 100000),
    actorId: studentId,
    push: false,
  });
};

export const handleOfficeHoursEvent = async (e: OfficeHoursEvent) => {
  switch (e.type) {
    case "schedule_published":
      return notifyAssigned((await activeStudentsOf(e.scheduleId)).map((x) => x.id), e.actorId).then(async () => {
        const s = await scheduleRow(e.scheduleId);
        if (s) await refreshReminderHub([s.teacher_id]);
      });
    case "assigned":
      return notifyAssigned(e.assignmentIds, e.actorId);
    case "removed":
      return notifyRemoved(e.assignmentId, e.actorId, e.reason);
    case "override":
      return notifyOverride(e.assignmentId, e.endedAssignmentIds, e.actorId);
    case "schedule_changed":
      return notifyScheduleChanged(e.scheduleId, e.actorId, e.fields);
    case "schedule_ended":
      return notifyScheduleEnded(e.scheduleId, e.actorId);
    case "sessions_cancelled":
      return notifyCancelled(e.sessionIds, e.actorId, e.reason);
    case "sessions_restored":
      return notifyCancelled(e.sessionIds, e.actorId, "", true);
    case "host_changed":
      return notifyHostChanged(e.sessionId, e.actorId);
    case "session_moved":
      return notifyMoved(e.sessionId, e.fromSessionId, e.actorId);
    case "register_saved": {
      await notifyMarks(e.sessionId, e.changedStudentIds, e.actorId);
      const [s] = await db.select({ schedule: OfficeHourSession.schedule_id }).from(OfficeHourSession).where(eq(OfficeHourSession.session_id, e.sessionId));
      if (!s) return;
      const marked = await db
        .select({ id: OfficeHourAttendance.assignment_id })
        .from(OfficeHourAttendance)
        .where(and(eq(OfficeHourAttendance.session_id, e.sessionId), isNotNull(OfficeHourAttendance.assignment_id)));
      return notifyEscalations(await evaluateEscalations({ assignmentIds: marked.map((m) => m.id!).filter(Boolean) }));
    }
    case "transfer_requested":
      return notifyTransfer(e.requestId, false);
    case "transfer_decided":
      return notifyTransfer(e.requestId, true, e.accepted);
    case "absence_notice":
      return notifyAbsenceNotice(e.sessionId, e.studentId);
  }
};

let registered = false;
/** Subscribe the notifier once (routes and the scheduler both call this). */
export const registerOfficeHoursNotifier = () => {
  if (registered) return;
  registered = true;
  onOfficeHoursEvent((e) =>
    handleOfficeHoursEvent(e).catch((error) => {
      logger.error(`[office-hours] notify ${e.type} failed`, { error });
    }),
  );
};

