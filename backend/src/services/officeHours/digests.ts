import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import { Permission, Role, RolePermission, User, UserRole } from "../../db/schema";
import { OfficeHourAssignment, OfficeHourSchedule, OfficeHourSession } from "../../db/officeHoursSchema";
import { notifyPerson } from "../notifications/notifyPerson";
import { addDaysYmd, dowOfYmd, kigaliParts, parseClock } from "../reminders/time";
import { AuthorizationError } from "../../errors/CustomError";
import { Actor } from "./access";
import { now, todayYmd } from "./common";
import { userNames } from "./eligibility";
import { loadMarks, statsFromMarks } from "./metrics";
import { emailLayout } from "./notify";
import { expectedAssignments } from "./sessions";
import { getSettings } from "./settings";

/**
 * Time-based office-hours notices (plan §7.4, §13.1): the teacher's morning
 * roster, register reminders, leadership nudges and the Friday digests.
 * Every notice is keyed so re-running a job refreshes rather than duplicates.
 */
const ymdInt = (ymd: string) => Number(ymd.replace(/-/g, ""));
const weekKey = (ymd: string) => {
  // Monday of the week, as yyyymmdd: one digest per person per week.
  const dow = dowOfYmd(ymd);
  return ymdInt(addDaysYmd(ymd, dow === 0 ? -6 : 1 - dow));
};

type EmailSender = (to: string, subject: string, html: string, text: string) => Promise<boolean>;
let sendEmail: EmailSender = async (to, subject, html, text) => {
  const { default: emailService } = await import("../../utils/email");
  return emailService.sendEmail({ to, subject, html, text }, false);
};
/** Test hook. */
export const setDigestEmailSender = (fn: EmailSender | null) => {
  if (fn) sendEmail = fn;
};

const sessionsOn = async (ymd: string, status: "SCHEDULED" | "ANY" = "ANY") =>
  db
    .select({ s: OfficeHourSession, title: OfficeHourSchedule.title, teacher_id: OfficeHourSchedule.teacher_id })
    .from(OfficeHourSession)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
    .where(and(eq(OfficeHourSession.session_date, ymd), eq(OfficeHourSchedule.status, "ACTIVE"), status === "SCHEDULED" ? eq(OfficeHourSession.status, "SCHEDULED") : sql`${OfficeHourSession.status} <> 'CANCELLED'`));

/** 06:30: each host gets today's office hours with the number expected. */
export const morningDigest = async () => {
  const today = todayYmd();
  const rows = await sessionsOn(today);
  const byHost = new Map<number, string[]>();
  for (const r of rows) {
    const n = (await expectedAssignments(r.s.schedule_id, today)).length;
    if (!n) continue;
    byHost.set(r.s.host_teacher_id, [...(byHost.get(r.s.host_teacher_id) ?? []), `${r.s.start_time} ${r.title} · ${n} student${n === 1 ? "" : "s"}${r.s.location ? ` · ${r.s.location}` : ""}`]);
  }
  for (const [host, lines] of byHost) {
    await notifyPerson({
      userId: host,
      kind: "office_hours_digest",
      title: lines.length === 1 ? "Office hours today" : `${lines.length} office hours today`,
      body: lines.join("\n"),
      link: "/office-hours",
      subjectType: "office_hour_digest",
      subjectId: ymdInt(today),
      push: false,
    });
  }
  return byHost.size;
};

const sentStages = new Set<string>();
/** Test hook. */
export const resetRegisterReminders = () => sentStages.clear();

/**
 * Register reminders for the host: "take the register" five minutes in,
 * "still missing" ten minutes after the end, and once the next morning.
 * One notification row per session, refreshed at each stage.
 */
export const registerReminders = async () => {
  const at = kigaliParts(now());
  const today = at.ymd;
  const out: Array<{ sessionId: number; stage: string }> = [];
  const remind = async (r: Awaited<ReturnType<typeof sessionsOn>>[number], stage: "due" | "missing" | "yesterday") => {
    const key = `${r.s.session_id}:${stage}`;
    if (sentStages.has(key)) return;
    if (!(await expectedAssignments(r.s.schedule_id, r.s.session_date)).length) return;
    sentStages.add(key);
    const title =
      stage === "due" ? `Take the register: ${r.title}` : stage === "missing" ? `Register still missing: ${r.title}` : `Yesterday's register is missing: ${r.title}`;
    await notifyPerson({
      userId: r.s.host_teacher_id,
      kind: "office_hours_register_due",
      title,
      body: stage === "due" ? "Tap to mark who came — Mark all present, then change the few who didn't." : "Students' attendance only counts once the register is taken.",
      link: "/office-hours",
      subjectType: "office_hour_session",
      subjectId: r.s.session_id,
      push: stage !== "due",
    });
    out.push({ sessionId: r.s.session_id, stage });
  };
  for (const r of await sessionsOn(today, "SCHEDULED")) {
    const start = parseClock(r.s.start_time) ?? 0;
    const end = parseClock(r.s.end_time) ?? 0;
    if (at.minutes >= end + 10) await remind(r, "missing");
    else if (at.minutes >= start + 5) await remind(r, "due");
  }
  if (at.minutes >= 7 * 60 + 30) {
    // Weekend mornings skip; Monday reminds about Friday.
    const dow = dowOfYmd(today);
    if (dow >= 1 && dow <= 5) {
      const previous = addDaysYmd(today, dow === 1 ? -3 : -1);
      for (const r of await sessionsOn(previous, "SCHEDULED")) await remind(r, "yesterday");
    }
  }
  return out;
};

/** Leadership "Remind" on missing registers. */
export const nudgeUnmarked = async (actor: Actor, sessionIds: number[]) => {
  if (!actor.manageAny) throw new AuthorizationError("Only leadership can send reminders");
  if (!sessionIds.length) return 0;
  const rows = await db
    .select({ s: OfficeHourSession, title: OfficeHourSchedule.title })
    .from(OfficeHourSession)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
    .where(and(inArray(OfficeHourSession.session_id, sessionIds.slice(0, 200)), eq(OfficeHourSession.status, "SCHEDULED")));
  const leader = (await userNames([actor.userId])).get(actor.userId) ?? "Leadership";
  for (const r of rows) {
    await notifyPerson({
      userId: r.s.host_teacher_id,
      kind: "office_hours_register_due",
      title: `Please take the register: ${r.title} (${r.s.session_date})`,
      body: `${leader} asked for it. Students' attendance only counts once the register is taken.`,
      link: "/office-hours",
      subjectType: "office_hour_session",
      subjectId: r.s.session_id,
      actorId: actor.userId,
    });
  }
  return rows.length;
};

/** People who hold a legacy role carrying `permission` (leadership audience). */
const holdersOf = async (permission: string) => {
  const rows = await db
    .selectDistinct({ id: UserRole.user_id })
    .from(UserRole)
    .innerJoin(Role, and(eq(Role.role_id, UserRole.role_id), eq(Role.status, "ACTIVE")))
    .innerJoin(RolePermission, eq(RolePermission.role_id, Role.role_id))
    .innerJoin(Permission, and(eq(Permission.perm_id, RolePermission.perm_id), eq(Permission.name, permission)))
    .innerJoin(User, and(eq(User.user_id, UserRole.user_id), eq(User.status, "ACTIVE")));
  return rows.map((r) => r.id);
};

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

/** Friday 17:30: teachers, leadership and (if WEEKLY) parents get the week in a few lines. */
export const weeklyDigests = async () => {
  const settings = await getSettings();
  const today = todayYmd();
  const dow = dowOfYmd(today);
  const monday = addDaysYmd(today, dow === 0 ? -6 : 1 - dow);
  const key = weekKey(today);
  const sessions = await db
    .select({ s: OfficeHourSession, title: OfficeHourSchedule.title })
    .from(OfficeHourSession)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
    .where(and(gte(OfficeHourSession.session_date, monday), lte(OfficeHourSession.session_date, today)));
  const live = sessions.filter((x) => x.s.status !== "CANCELLED");
  const marks = await loadMarks({ fromYmd: monday, toYmd: today });
  const stats = statsFromMarks(marks, settings);
  const result = { teachers: 0, leaders: 0, parents: 0 };

  // Teachers: their own week.
  const hosts = [...new Set(live.map((x) => x.s.host_teacher_id))];
  for (const host of hosts) {
    const mine = live.filter((x) => x.s.host_teacher_id === host);
    const held = mine.filter((x) => x.s.status === "HELD").length;
    const ids = new Set(mine.map((x) => x.s.session_id));
    const own = statsFromMarks(marks.filter((m) => ids.has(m.session_id)), settings);
    await notifyPerson({
      userId: host,
      kind: "office_hours_digest",
      title: "Your office hours this week",
      body: `${held} of ${mine.length} registers taken · attendance ${pct(own.rate)}${mine.length - held ? ` · ${mine.length - held} still missing` : ""}`,
      link: "/office-hours?tab=reports",
      subjectType: "office_hour_digest",
      subjectId: key,
      push: false,
    });
    result.teachers++;
  }

  // Leadership: the school's week, by bell and email.
  if (live.length) {
    const held = live.filter((x) => x.s.status === "HELD").length;
    const studentStats = new Map<number, typeof marks>();
    for (const m of await loadMarks({ fromYmd: addDaysYmd(today, -60), toYmd: today })) studentStats.set(m.student_id, [...(studentStats.get(m.student_id) ?? []), m]);
    const chronic = [...studentStats.values()].filter((list) => statsFromMarks(list, settings).band === "CHRONIC").length;
    const lines = [
      `${held} of ${live.length} sessions held with a register (${live.length - held} missing).`,
      `Attendance this week: ${pct(stats.rate)} (${stats.present + stats.late} attended, ${stats.absent} missed, ${stats.excused} excused).`,
      `${chronic} student${chronic === 1 ? "" : "s"} currently below the watch threshold.`,
    ];
    const leaders = await holdersOf("OFFICE_HOURS_MANAGE_ANY");
    const emails = new Map((await db.select({ id: User.user_id, email: User.email }).from(User).where(inArray(User.user_id, leaders.length ? leaders : [0]))).map((r) => [r.id, r.email]));
    for (const id of leaders) {
      await notifyPerson({
        userId: id,
        kind: "office_hours_digest",
        title: "Office hours this week",
        body: lines.join(" "),
        link: "/office-hours/admin",
        subjectType: "office_hour_digest",
        subjectId: key,
        push: false,
      });
      const to = emails.get(id);
      if (to && !to.endsWith("@example.com")) {
        const mail = emailLayout("Office hours this week", lines, "/office-hours/admin", "Weekly summary for school leadership.");
        await sendEmail(to, "Office hours: weekly summary", mail.html, mail.text).catch(() => false);
      }
      result.leaders++;
    }
  }

  // Parents (only when the school chose WEEKLY).
  if (settings.parent_notifications === "WEEKLY") {
    const studentIds = [
      ...new Set(
        (
          await db
            .select({ id: OfficeHourAssignment.student_id })
            .from(OfficeHourAssignment)
            .where(and(eq(OfficeHourAssignment.status, "ACTIVE"), lte(OfficeHourAssignment.effective_from, today)))
        ).map((r) => r.id),
      ),
    ];
    const parentRows = studentIds.length
      ? ((await db.execute(sql`SELECT parent_id, student_id FROM Parenting WHERE student_id IN (${sql.join(studentIds.map((i) => sql`${i}`), sql`, `)})`)) as any)[0]
      : [];
    const names = await userNames(studentIds);
    for (const p of parentRows as Array<{ parent_id: number; student_id: number }>) {
      const own = statsFromMarks(marks.filter((m) => m.student_id === Number(p.student_id)), settings);
      if (!own.expected) continue;
      const child = names.get(Number(p.student_id)) ?? "Your child";
      await notifyPerson({
        userId: Number(p.parent_id),
        kind: "office_hours_digest",
        title: `${child}'s office hours this week`,
        body: `Attended ${own.present + own.late} of ${own.expected}${own.excused ? ` (${own.excused} excused)` : ""}.`,
        link: "/my-office-hours",
        subjectType: "office_hour_digest",
        subjectId: key * 10 + (Number(p.student_id) % 10),
        push: false,
      });
      result.parents++;
    }
  }
  return result;
};

