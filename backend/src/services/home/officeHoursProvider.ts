import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "../../db";
import { StudentClassGroup } from "../../db/schema";
import {
  OfficeHourAssignment,
  OfficeHourEscalation,
  OfficeHourSchedule,
  OfficeHourSession,
  OfficeHourTransferRequest,
} from "../../db/officeHoursSchema";
import { addDaysYmd, dowOfYmd, parseClock } from "../reminders/time";
import { loadMarks, statsFromMarks } from "../officeHours/metrics";
import { getSettings } from "../officeHours/settings";
import { nowMinutes, officeHoursEnabled, todayYmd } from "../officeHours/common";
import { expectedAssignments } from "../officeHours/sessions";
import { heldAt, lensesOfType } from "./access";
import type { AttentionItem, GlanceTile } from "./contract";
import { EMPTY, ProviderContext, ProviderResult } from "./providers";

// ============================================================================
// Office hours on Home (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §17.3):
//   student    next session, and a nudge after repeated misses
//   teacher    today's session, missing registers, transfer requests
//   class      students of the class below the watch threshold
//   leadership the week's attendance and registers overdue
// Read-only, a few batched queries per lens.
// ============================================================================

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export async function officeHoursProvider(ctx: ProviderContext): Promise<ProviderResult> {
  if (!officeHoursEnabled()) return EMPTY;
  const self = lensesOfType(ctx.access, "SELF")[0];
  const userId = ctx.access.userId;
  // Office hours run on Kigali dates (the server itself may be on UTC).
  const today = todayYmd();
  const minutesNow = nowMinutes();
  const items: AttentionItem[] = [];
  const tiles: GlanceTile[] = [];
  const settings = await getSettings();

  if (self) {
    // --- As a student ---------------------------------------------------
    const mine = await db
      .select({ a: OfficeHourAssignment, s: OfficeHourSchedule })
      .from(OfficeHourAssignment)
      .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
      .where(and(eq(OfficeHourAssignment.student_id, userId), eq(OfficeHourAssignment.status, "ACTIVE"), eq(OfficeHourSchedule.status, "ACTIVE")));
    if (mine.length) {
      const next = await db
        .select()
        .from(OfficeHourSession)
        .where(
          and(
            inArray(OfficeHourSession.schedule_id, mine.map((m) => m.s.schedule_id)),
            gte(OfficeHourSession.session_date, today),
            lte(OfficeHourSession.session_date, addDaysYmd(today, 14)),
            eq(OfficeHourSession.status, "SCHEDULED"),
          ),
        )
        .orderBy(OfficeHourSession.session_date, OfficeHourSession.start_time)
        .limit(5);
      const upcoming = next.find((n) => mine.some((m) => m.s.schedule_id === n.schedule_id && m.a.effective_from <= n.session_date) && !(n.session_date === today && minutesNow >= (parseClock(n.end_time) ?? 0)));
      tiles.push({
        id: "mis:office-hours:next",
        source: "mis",
        lens: self.key,
        label: "Office hours",
        value: upcoming ? `${upcoming.session_date === today ? "Today" : DAY[dowOfYmd(upcoming.session_date)]} ${upcoming.start_time}` : "None soon",
        hint: upcoming?.location ?? undefined,
        href: "/my-office-hours",
      });
      const marks = await loadMarks({ assignmentIds: mine.map((m) => m.a.assignment_id) });
      const stats = statsFromMarks(marks, settings);
      if (stats.current_absent_streak >= 2) {
        items.push({
          id: `mis:OH-S1:${self.key}`,
          source: "mis",
          kind: "OH-S1",
          tier: "slipping",
          lens: self.key,
          via: self.via,
          depth: "detail",
          count: stats.current_absent_streak,
          title: `You missed the last ${stats.current_absent_streak} office hours`,
          entities: [],
          why: "Office hours are mandatory. Come to the next one, or tell your teacher beforehand if you can't.",
          cta: { label: "See my office hours", href: "/my-office-hours" },
        });
      }
    }

    // --- As a host ----------------------------------------------------------
    const hosted = await db
      .select({ s: OfficeHourSession, title: OfficeHourSchedule.title })
      .from(OfficeHourSession)
      .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
      .where(and(eq(OfficeHourSession.host_teacher_id, userId), gte(OfficeHourSession.session_date, addDaysYmd(today, -14)), lte(OfficeHourSession.session_date, today), eq(OfficeHourSession.status, "SCHEDULED")));
    const todays = hosted.find((h) => h.s.session_date === today);
    if (todays) {
      const n = (await expectedAssignments(todays.s.schedule_id, today)).length;
      if (n)
        tiles.push({
          id: "mis:office-hours:today",
          source: "mis",
          lens: self.key,
          label: "Office hours today",
          value: `${todays.s.start_time} · ${n} ${plural(n, "student", "students")}`,
          hint: todays.s.location ?? undefined,
          href: "/office-hours",
        });
    }
    const overdue: typeof hosted = [];
    for (const h of hosted) {
      const ended = h.s.session_date < today || minutesNow >= (parseClock(h.s.end_time) ?? 0);
      if (ended && (await expectedAssignments(h.s.schedule_id, h.s.session_date)).length) overdue.push(h);
    }
    if (overdue.length) {
      const old = overdue.some((o) => o.s.session_date < today);
      items.push({
        id: `mis:OH-T1:${self.key}`,
        source: "mis",
        kind: "OH-T1",
        tier: old ? "blocking" : "slipping",
        lens: self.key,
        via: self.via,
        depth: "detail",
        count: overdue.length,
        title: `${overdue.length} office-hours ${plural(overdue.length, "register", "registers")} not taken`,
        entities: overdue.slice(0, 3).map((o) => `${o.title} · ${o.s.session_date}`),
        why: "Students' attendance only counts once the register is taken.",
        cta: { label: "Take the register", href: "/office-hours" },
        waiting_since: overdue[0].s.session_date,
      });
    }
    const transfers = await db
      .select({ id: OfficeHourTransferRequest.request_id })
      .from(OfficeHourTransferRequest)
      .innerJoin(OfficeHourAssignment, eq(OfficeHourAssignment.assignment_id, OfficeHourTransferRequest.from_assignment_id))
      .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
      .where(and(eq(OfficeHourSchedule.teacher_id, userId), eq(OfficeHourTransferRequest.status, "PENDING")));
    if (transfers.length) {
      items.push({
        id: `mis:OH-T2:${self.key}`,
        source: "mis",
        kind: "OH-T2",
        tier: "tidy",
        lens: self.key,
        via: self.via,
        depth: "detail",
        count: transfers.length,
        title: `${transfers.length} office-hours transfer ${plural(transfers.length, "request", "requests")}`,
        entities: [],
        why: "A colleague asked you to release a student.",
        cta: { label: "Answer", href: "/office-hours" },
      });
    }
  }

  // --- Class teacher: students below the watch threshold -------------------
  const classLenses = lensesOfType(ctx.access, "CLASS_GROUP").filter((l) => heldAt(ctx.access.snapshot, ["OFFICE_HOURS_VIEW"], l).allowed);
  const { termStart, termEnd, yearId, termId } = ctx.period;
  if (classLenses.length && yearId && termStart && termEnd) {
    for (const lens of classLenses) {
      const students = await db
        .select({ id: StudentClassGroup.user_id })
        .from(StudentClassGroup)
        .where(and(eq(StudentClassGroup.class_group_id, lens.scopeId!), eq(StudentClassGroup.academic_year_id, yearId), eq(StudentClassGroup.status, "ACTIVE")));
      const marks = await loadMarks({ studentIds: students.map((s) => s.id), fromYmd: termStart, toYmd: termEnd });
      const byStudent = new Map<number, typeof marks>();
      for (const m of marks) byStudent.set(m.student_id, [...(byStudent.get(m.student_id) ?? []), m]);
      const chronic = [...byStudent.values()].filter((list) => statsFromMarks(list, settings).band === "CHRONIC").length;
      if (chronic) {
        items.push({
          id: `mis:OH-C1:${lens.key}`,
          source: "mis",
          kind: "OH-C1",
          tier: "slipping",
          lens: lens.key,
          via: lens.via,
          depth: "summary",
          count: chronic,
          title: `${chronic} ${plural(chronic, "student", "students")} keep missing office hours`,
          entities: [],
          why: `Attendance below ${settings.rate_band_watch}% this term.`,
          cta: { label: "See who", href: "/office-hours/admin?tab=reports" },
        });
      }
    }
  }

  // --- Leadership: the week, and registers overdue ---------------------------
  const wide = lensesOfType(ctx.access, "SCHOOL", "PROGRAM").filter((l) => heldAt(ctx.access.snapshot, ["OFFICE_HOURS_VIEW", "OFFICE_HOURS_MANAGE_ANY"], l).allowed);
  if (wide.length && termId) {
    const lens = wide[0];
    const dow = dowOfYmd(today);
    const monday = addDaysYmd(today, dow === 0 ? -6 : 1 - dow);
    const week = statsFromMarks(await loadMarks({ fromYmd: monday, toYmd: today }), settings);
    tiles.push({
      id: "mis:office-hours:week",
      source: "mis",
      lens: lens.key,
      label: "Office hours attendance (week)",
      value: week.rate === null ? "—" : `${Math.round(week.rate)}%`,
      status: week.rate === null ? undefined : week.rate >= settings.rate_band_consistent ? "good" : week.rate >= settings.rate_band_watch ? "warning" : "critical",
      href: "/office-hours/admin",
    });
    const stale = await db
      .select({ id: OfficeHourSession.session_id, schedule: OfficeHourSession.schedule_id, date: OfficeHourSession.session_date })
      .from(OfficeHourSession)
      .where(and(eq(OfficeHourSession.academic_term_id, termId), eq(OfficeHourSession.status, "SCHEDULED"), lte(OfficeHourSession.session_date, addDaysYmd(today, -2))));
    let staleCount = 0;
    for (const s of stale.slice(0, 200)) if ((await expectedAssignments(s.schedule, s.date)).length) staleCount++;
    if (staleCount) {
      items.push({
        id: `mis:OH-L1:${lens.key}`,
        source: "mis",
        kind: "OH-L1",
        tier: "slipping",
        lens: lens.key,
        via: lens.via,
        depth: "summary",
        count: staleCount,
        title: `${staleCount} office-hours ${plural(staleCount, "register", "registers")} overdue`,
        entities: [],
        why: "Registers not taken two or more days after the session.",
        cta: { label: "Missing registers", href: "/office-hours/admin?tab=unmarked" },
      });
    }
    const open = await db
      .select({ id: OfficeHourEscalation.escalation_id })
      .from(OfficeHourEscalation)
      .where(and(eq(OfficeHourEscalation.academic_term_id, termId), eq(OfficeHourEscalation.level, 2), isNull(OfficeHourEscalation.acknowledged_at)));
    if (open.length) {
      items.push({
        id: `mis:OH-L2:${lens.key}`,
        source: "mis",
        kind: "OH-L2",
        tier: "slipping",
        lens: lens.key,
        via: lens.via,
        depth: "summary",
        count: open.length,
        title: `${open.length} serious office-hours ${plural(open.length, "escalation", "escalations")} need follow-up`,
        entities: [],
        why: "Students who keep missing mandatory office hours.",
        cta: { label: "Escalations", href: "/office-hours/admin?tab=escalations" },
      });
    }
  }
  if (!items.length && !tiles.length) return EMPTY;
  return { items, tiles, actions: [] };
}
