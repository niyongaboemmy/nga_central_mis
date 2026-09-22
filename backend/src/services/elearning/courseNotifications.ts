import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import { Course, CourseItem, CourseItemProgress, CourseSection, Notification } from "../../db/schema";
import { notifyUsers } from "../../utils/notifications";
import logger from "../../utils/logger";
import { CourseRow, listCourseMembers } from "./courseMembership";

/**
 * In-app notifications for the e-learning module (plan §3.6). Each helper is best-effort —
 * notifyUser already swallows failures, and none of these may fail the action that
 * triggered them.
 */

const learnerLink = (courseId: number, sectionId?: number, itemId?: number) =>
  itemId
    ? `/my-learning/courses/${courseId}/items/${itemId}`
    : sectionId
      ? `/my-learning/courses/${courseId}?section=${sectionId}`
      : `/my-learning/courses/${courseId}`;

/** One batched notification per section to every member: "Week 4 is ready". */
export async function notifySectionPublished(course: CourseRow, sectionId: number, actorId: number) {
  try {
    const [section] = await db.select().from(CourseSection).where(eq(CourseSection.section_id, sectionId)).limit(1);
    if (!section) return;
    const members = await listCourseMembers(course);
    if (members.length === 0) return;
    await notifyUsers(
      members.map((m) => m.user_id),
      {
        kind: "course_section_published",
        title: `${section.title} is ready`,
        body: `New content in ${course.title}.`,
        link: learnerLink(course.course_id, sectionId),
        subjectType: "course_section",
        subjectId: sectionId,
        actorId,
      },
    );
  } catch (error) {
    logger.error("notifySectionPublished failed", { error, sectionId });
  }
}

/** Teacher → student "friendly nudge" from the Insights tab (UX plan §5). */
export async function notifyNudge(course: CourseRow, studentIds: number[], teacherName: string, actorId: number, message?: string) {
  const body = (message || `Hi — ${course.title} has new content ready when you are.`).slice(0, 480);
  await notifyUsers(studentIds, {
    kind: "course_nudge",
    title: `A note from ${teacherName || "your teacher"}`,
    body,
    link: learnerLink(course.course_id),
    subjectType: "course",
    subjectId: course.course_id,
    actorId,
  });
}

/** A Task Mentor / knowledge-check result closed a SUBMIT / MIN_SCORE item. */
export async function notifyResultReceived(courseId: number, itemId: number, userId: number, title: string, scorePct: number | null) {
  await notifyUsers([userId], {
    kind: "course_result_received",
    title: scorePct === null ? `${title} — result received` : `${title} — ${Math.round(scorePct)} %`,
    body: scorePct === null ? "Your submission was recorded." : "Your score was recorded on your course.",
    link: learnerLink(courseId, undefined, itemId),
    subjectType: "course_item",
    subjectId: itemId,
  });
}

/**
 * Nightly sweep (index.ts): items due in the next 24 h that a member hasn't completed → one
 * "due soon" notification per (student, item). Dedupe is the Notification unique key.
 */
export async function sweepDueSoon(): Promise<number> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const due = await db
    .select({ item: CourseItem, course: Course })
    .from(CourseItem)
    .innerJoin(CourseSection, eq(CourseSection.section_id, CourseItem.section_id))
    .innerJoin(Course, eq(Course.course_id, CourseSection.course_id))
    .where(
      and(
        eq(Course.status, "PUBLISHED"),
        eq(CourseSection.status, "PUBLISHED"),
        eq(CourseItem.is_published, 1),
        gte(CourseItem.due_at, now),
        lte(CourseItem.due_at, horizon),
      ),
    );
  let sent = 0;
  for (const { item, course } of due) {
    const members = await listCourseMembers(course);
    if (members.length === 0) continue;
    const done = await db
      .select({ user_id: CourseItemProgress.user_id })
      .from(CourseItemProgress)
      .where(and(eq(CourseItemProgress.item_id, item.item_id), eq(CourseItemProgress.state, "COMPLETED")));
    const doneSet = new Set(done.map((d) => d.user_id));
    const targets = members.filter((m) => !doneSet.has(m.user_id)).map((m) => m.user_id);
    if (targets.length === 0) continue;
    // Skip anyone already told about this item (the unique key would just bump the row).
    const told = await db
      .select({ user_id: Notification.user_id })
      .from(Notification)
      .where(
        and(
          eq(Notification.kind, "course_item_due_soon"),
          eq(Notification.subject_type, "course_item"),
          eq(Notification.subject_id, item.item_id),
          inArray(Notification.user_id, targets),
        ),
      );
    const toldSet = new Set(told.map((t) => t.user_id));
    const fresh = targets.filter((t) => !toldSet.has(t));
    if (fresh.length === 0) continue;
    await notifyUsers(fresh, {
      kind: "course_item_due_soon",
      title: `${item.title} is due soon`,
      body: `Due ${new Date(item.due_at!).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · ${course.title}`,
      link: learnerLink(course.course_id, undefined, item.item_id),
      subjectType: "course_item",
      subjectId: item.item_id,
    });
    sent += fresh.length;
  }
  return sent;
}

/** Teacher nudge: a week that went live with nothing in it (plan §3.6 COURSE_SECTION_EMPTY). */
export async function sweepEmptyPublishedSections(): Promise<number> {
  const rows = await db
    .select({ section: CourseSection, course: Course, items: sql<number>`(SELECT COUNT(*) FROM CourseItem ci WHERE ci.section_id = ${CourseSection.section_id} AND ci.is_published = 1)` })
    .from(CourseSection)
    .innerJoin(Course, eq(Course.course_id, CourseSection.course_id))
    .where(and(eq(Course.status, "PUBLISHED"), eq(CourseSection.status, "PUBLISHED")));
  let sent = 0;
  for (const r of rows) {
    if (Number(r.items) > 0) continue;
    await notifyUsers([r.course.owner_user_id], {
      kind: "course_section_empty",
      title: `${r.section.title} is live but empty`,
      body: `Students can open it in ${r.course.title}, but there is nothing to read yet. Add a note or hide the week.`,
      link: `/elearning/courses/${r.course.course_id}/build?section=${r.section.section_id}`,
      subjectType: "course_section",
      subjectId: r.section.section_id,
    });
    sent += 1;
  }
  return sent;
}
