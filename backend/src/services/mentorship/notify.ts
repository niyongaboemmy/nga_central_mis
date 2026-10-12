import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { MenteeCheckIn, UserProfile } from "../../db/schema";
import { notifyPerson } from "../notifications/notifyPerson";
import { holdersOf } from "../access/admin";
import logger from "../../utils/logger";

/**
 * Who hears about what in mentoring. Before this, nothing in the module told
 * anyone anything: a student's check-in sat unseen until the mentor happened to
 * open the hub, a reply only showed if the student went looking, and neither
 * side learned that an admin had paired them. Every notice goes to the bell and,
 * where the person enabled it, as a Web Push (notifyPerson).
 *
 * Privacy: mentor-facing notices may name the student and the check-in's title
 * (both are the mentor's to see); they never quote the message itself, which
 * can be sensitive and would otherwise sit on a lock screen. Escalations to
 * coordinators carry neither.
 */

export const CHECKIN_LABEL: Record<string, string> = {
  GENERAL: "General",
  APPRECIATION: "Appreciation",
  ACADEMIC: "Academic",
  BEHAVIORAL: "Behaviour",
  ATTENDANCE: "Attendance",
  WELLBEING: "Wellbeing",
  CONCERN: "Concern",
  REQUEST_MEETING: "Meeting request",
  OTHER: "Other",
};

/** Categories where an unanswered check-in is worth a coordinator's attention. */
export const SENSITIVE_CATEGORIES = ["CONCERN", "WELLBEING"];

/** A mentor is nudged once when a check-in waits this long unread. */
export const WAITING_NUDGE_HOURS = 48;
/** A sensitive check-in still unread after this long goes to the coordinators. */
export const ESCALATE_AFTER_HOURS = 72;

const fullName = (first: string | null | undefined, last: string | null | undefined, fallback: string) =>
  `${first ?? ""} ${last ?? ""}`.trim() || fallback;

async function namesOf(ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (!unique.length) return new Map();
  const rows = await db
    .select({ user_id: UserProfile.user_id, first_name: UserProfile.first_name, last_name: UserProfile.last_name })
    .from(UserProfile)
    .where(inArray(UserProfile.user_id, unique));
  return new Map(rows.map((r) => [r.user_id, fullName(r.first_name, r.last_name, "")]));
}

const safely = async (what: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (error) {
    // A notice is a courtesy: never fail the action that triggered it.
    logger.error(`[mentorship] ${what} notice failed`, { error });
  }
};

// ─── check-ins ──────────────────────────────────────────────────────────────

export async function notifyCheckInSubmitted(c: {
  checkinId: number;
  studentId: number;
  mentorId: number;
  category: string;
  title: string | null;
}) {
  await safely("check-in", async () => {
    const names = await namesOf([c.studentId]);
    const student = names.get(c.studentId) || "A mentee";
    const label = CHECKIN_LABEL[c.category] ?? "Check-in";
    const title =
      c.category === "REQUEST_MEETING"
        ? `${student} asked to meet you`
        : SENSITIVE_CATEGORIES.includes(c.category)
          ? `${student} raised a ${label.toLowerCase()} with you`
          : `New check-in from ${student}`;
    await notifyPerson({
      userId: c.mentorId,
      kind: "mentorship_checkin",
      title,
      body: c.title ? `${label}: ${c.title}` : `${label} · open it to read and reply`,
      link: `/my-mentees/inbox?checkin=${c.checkinId}`,
      subjectType: "mentee_checkin",
      subjectId: c.checkinId,
      actorId: c.studentId,
    });
  });
}

export type CheckInAnswer = "reply" | "approved" | "rejected" | "addressed";

export async function notifyCheckInAnswered(c: {
  checkinId: number;
  studentId: number;
  mentorId: number;
  actorId: number;
  answer: CheckInAnswer;
  title: string | null;
}) {
  await safely("check-in reply", async () => {
    const byMentor = c.actorId === c.mentorId;
    const names = await namesOf([c.mentorId]);
    const who = byMentor ? names.get(c.mentorId) || "Your mentor" : "Your school's mentoring team";
    const about = c.title ? `“${c.title}”` : "your check-in";
    const title = {
      reply: `${who} replied to ${about}`,
      approved: `${who} approved ${about}`,
      rejected: `${who} sent ${about} back to you`,
      addressed: `${who} marked ${about} as dealt with`,
    }[c.answer];
    await notifyPerson({
      userId: c.studentId,
      kind: "mentorship_checkin_reply",
      title,
      body: c.answer === "rejected" ? "Read their comment and send it again if needed." : "Open it to read the reply.",
      link: `/my-mentor?checkin=${c.checkinId}`,
      subjectType: "mentee_checkin",
      subjectId: c.checkinId,
      actorId: c.actorId,
    });
  });
}

// ─── assignments ────────────────────────────────────────────────────────────

/**
 * After an admin (re)assigns students: the mentor gets one notice for the whole
 * batch, every student hears who their mentor now is, and a mentor who lost a
 * student to someone else is told so instead of finding them gone.
 */
export async function notifyAssignmentsChanged(a: {
  mentorId: number;
  actorId: number;
  added: { studentId: number; assignmentId: number }[];
  movedFrom: { studentId: number; mentorId: number; assignmentId: number }[];
  yearName: string | null;
}) {
  if (!a.added.length) return;
  await safely("assignment", async () => {
    const names = await namesOf([a.mentorId, ...a.added.map((x) => x.studentId), ...a.movedFrom.map((m) => m.mentorId)]);
    const mentor = names.get(a.mentorId) || "A mentor";
    const year = a.yearName ? ` for ${a.yearName}` : "";

    const first = a.added[0];
    const firstName = names.get(first.studentId) || "A student";
    await notifyPerson({
      userId: a.mentorId,
      kind: "mentorship_assigned",
      title:
        a.added.length === 1
          ? `${firstName} is now your mentee`
          : `${a.added.length} students are now your mentees`,
      body:
        a.added.length === 1
          ? `You mentor them${year}. Open their profile to plan a first session.`
          : `Including ${a.added.slice(0, 3).map((x) => names.get(x.studentId) || "a student").join(", ")}${a.added.length > 3 ? "…" : ""}${year}.`,
      link: a.added.length === 1 ? `/my-mentees/${first.studentId}` : "/my-mentees",
      subjectType: "mentor_assignment",
      subjectId: first.assignmentId,
      actorId: a.actorId,
    });

    for (const x of a.added) {
      await notifyPerson({
        userId: x.studentId,
        kind: "mentorship_assigned",
        title: `${mentor} is now your mentor`,
        body: `They will follow your progress${year}. Say hello or ask for a meeting any time.`,
        link: "/my-mentor",
        subjectType: "mentor_assignment",
        subjectId: x.assignmentId,
        actorId: a.actorId,
      });
    }

    for (const m of a.movedFrom) {
      if (m.mentorId === a.mentorId) continue;
      await notifyPerson({
        userId: m.mentorId,
        kind: "mentorship_ended",
        title: `${names.get(m.studentId) || "A mentee"} moved to another mentor`,
        body: `${mentor} mentors them now. Your past session notes stay with you.`,
        link: "/my-mentees",
        subjectType: "mentor_assignment",
        subjectId: m.assignmentId,
        actorId: a.actorId,
        push: false,
      });
    }
  });
}

export async function notifyAssignmentEnded(a: {
  assignmentId: number;
  mentorId: number;
  studentId: number;
  actorId: number;
}) {
  await safely("assignment end", async () => {
    const names = await namesOf([a.mentorId, a.studentId]);
    await notifyPerson({
      userId: a.mentorId,
      kind: "mentorship_ended",
      title: `${names.get(a.studentId) || "A mentee"} is no longer your mentee`,
      body: "The school ended this mentoring assignment. Your past session notes stay with you.",
      link: "/my-mentees",
      subjectType: "mentor_assignment",
      subjectId: a.assignmentId,
      actorId: a.actorId,
      push: false,
    });
    await notifyPerson({
      userId: a.studentId,
      kind: "mentorship_ended",
      title: `${names.get(a.mentorId) || "Your mentor"} is no longer your mentor`,
      body: "Your school will let you know who mentors you next.",
      link: "/my-mentor",
      subjectType: "mentor_assignment",
      subjectId: a.assignmentId,
      actorId: a.actorId,
      push: false,
    });
  });
}

// ─── waiting check-ins (periodic sweep) ─────────────────────────────────────

const CAP = "MANAGE_MENTOR_ASSIGNMENTS";

/** Mentoring coordinators: whoever may manage mentor assignments, v2 or legacy. */
export async function coordinatorIds(): Promise<number[]> {
  const ids = new Set<number>();
  try {
    for (const h of await holdersOf(CAP, { type: "SCHOOL" } as any)) ids.add(h.user_id);
  } catch {
    /* access tables unavailable: legacy roles only */
  }
  try {
    const [rows] = (await db.execute(sql`
      SELECT DISTINCT ur.user_id AS id FROM UserRole ur
      JOIN RolePermission rp ON rp.role_id = ur.role_id
      JOIN Permission p ON p.perm_id = rp.perm_id AND p.name = ${CAP}
      JOIN User u ON u.user_id = ur.user_id AND u.status = 'ACTIVE'`)) as any;
    for (const r of rows as any[]) ids.add(Number(r.id));
  } catch {
    /* no legacy tables */
  }
  return [...ids];
}

/**
 * Notices that must go out once, ever: the sweep runs every few hours and a
 * second identical notice would re-open one the person already read (notifyUser
 * upserts and clears read_at).
 */
async function alreadySent(userId: number, kind: string, checkinId: number) {
  const [rows] = (await db.execute(sql`
    SELECT 1 FROM Notification
    WHERE user_id = ${userId} AND kind = ${kind} AND subject_type = 'mentee_checkin' AND subject_id = ${checkinId}
    LIMIT 1`)) as any;
  return (rows as any[]).length > 0;
}

/**
 * Nudge the mentor once about a check-in nobody has opened in two days, and
 * tell the coordinators once about a concern or wellbeing check-in still
 * unopened after three — a student who raised a worry must not be left with
 * silence because one adult missed it.
 */
export async function sweepWaitingCheckIns(): Promise<{ nudged: number; escalated: number }> {
  const waiting = await db
    .select({
      checkin_id: MenteeCheckIn.checkin_id,
      student_id: MenteeCheckIn.student_id,
      mentor_id: MenteeCheckIn.mentor_id,
      category: MenteeCheckIn.category,
      hours: sql<number>`TIMESTAMPDIFF(HOUR, ${MenteeCheckIn.submitted_at}, NOW())`,
    })
    .from(MenteeCheckIn)
    .where(
      and(
        eq(MenteeCheckIn.status, "NEW"),
        sql`${MenteeCheckIn.submitted_at} <= DATE_SUB(NOW(), INTERVAL ${WAITING_NUDGE_HOURS} HOUR)`,
        // Older than a month is history, not something to chase now.
        sql`${MenteeCheckIn.submitted_at} >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      ),
    )
    .limit(500);
  if (!waiting.length) return { nudged: 0, escalated: 0 };

  const names = await namesOf(waiting.flatMap((w) => [w.student_id, w.mentor_id]));
  let nudged = 0;
  let escalated = 0;
  let coordinators: number[] | null = null;

  for (const w of waiting) {
    const student = names.get(w.student_id) || "A mentee";
    const days = Math.max(2, Math.floor(Number(w.hours) / 24));
    if (!(await alreadySent(w.mentor_id, "mentorship_checkin_waiting", w.checkin_id))) {
      await notifyPerson({
        userId: w.mentor_id,
        kind: "mentorship_checkin_waiting",
        title: `${student}'s check-in has waited ${days} days`,
        body: "A short reply shows them someone is listening.",
        link: `/my-mentees/inbox?checkin=${w.checkin_id}`,
        subjectType: "mentee_checkin",
        subjectId: w.checkin_id,
      });
      nudged++;
    }

    if (SENSITIVE_CATEGORIES.includes(String(w.category)) && Number(w.hours) >= ESCALATE_AFTER_HOURS) {
      coordinators ??= await coordinatorIds();
      const mentor = names.get(w.mentor_id) || "their mentor";
      for (const id of coordinators) {
        if (id === w.mentor_id || (await alreadySent(id, "mentorship_checkin_escalated", w.checkin_id))) continue;
        await notifyPerson({
          userId: id,
          kind: "mentorship_checkin_escalated",
          title: `A ${CHECKIN_LABEL[String(w.category)]?.toLowerCase() ?? "check-in"} from ${student} is unanswered`,
          body: `Sent to ${mentor} ${days} days ago and not opened yet.`,
          link: `/admin/reports?tab=mentoring-log&view=checkins`,
          subjectType: "mentee_checkin",
          subjectId: w.checkin_id,
        });
        escalated++;
      }
    }
  }
  return { nudged, escalated };
}
