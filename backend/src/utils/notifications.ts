import { db } from "../db";
import { Notification } from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import logger from "./logger";

export type NotificationKind =
  | "document_shared"
  | "folder_shared"
  | "permission_revoked"
  // E-learning (ELEARNING_MODULE_IMPLEMENTATION_PLAN.md §3.6)
  | "course_section_published"
  | "course_item_due_soon"
  | "course_result_received"
  | "course_section_empty"
  | "course_nudge"
  // Reminder Hub (REMINDERS_SOLUTION_PROPOSAL.md)
  | "reminder"
  // Usage & Monitoring (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §10.4)
  | "monitor_watch"
  | "monitor_alert"
  | "monitor_message";

export interface NotifyUserInput {
  userId: number;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  subjectType: "document" | "folder" | "course_section" | "course_item" | "course" | "reminder" | "watch" | "alert" | "message";
  subjectId: number;
  actorId?: number;
}

/**
 * Upserts a notification for a single recipient. Re-sharing the same
 * subject with the same person bumps the existing unread row (refreshes
 * created_at/clears read_at) instead of stacking duplicates — matches the
 * unique (user_id, kind, subject_type, subject_id) index on Notification.
 */
export const notifyUser = async ({
  userId,
  kind,
  title,
  body,
  link,
  subjectType,
  subjectId,
  actorId,
}: NotifyUserInput) => {
  try {
    await db
      .insert(Notification)
      .values({
        user_id: userId,
        kind,
        title,
        body: body || null,
        link: link || null,
        subject_type: subjectType,
        subject_id: subjectId,
        actor_id: actorId || null,
      })
      .onDuplicateKeyUpdate({
        set: {
          title,
          body: body || null,
          link: link || null,
          actor_id: actorId || null,
          read_at: null,
          created_at: sql`CURRENT_TIMESTAMP`,
        },
      });
  } catch (error) {
    // Notifications are a courtesy, not the source of truth — never let a
    // failure here roll back or fail the share/revoke action that triggered it.
    logger.error("Failed to create notification", {
      error,
      data: { userId, kind, subjectType, subjectId },
    });
  }
};

/** Convenience for notifying several recipients with the same message. */
export const notifyUsers = async (
  userIds: number[],
  input: Omit<NotifyUserInput, "userId">,
) => {
  await Promise.all(
    [...new Set(userIds)].map((userId) => notifyUser({ ...input, userId })),
  );
};

export const getUnreadCount = async (userId: number): Promise<number> => {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(Notification)
    .where(
      and(eq(Notification.user_id, userId), sql`${Notification.read_at} IS NULL`),
    );
  return row ? Number(row.count) : 0;
};
