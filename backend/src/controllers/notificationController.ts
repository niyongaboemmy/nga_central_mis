import { db } from "../db";
import { Notification, User, UserProfile } from "../db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { successResponse, paginatedResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import { NotFoundError } from "../errors/CustomError";
import { getUnreadCount } from "../utils/notifications";

export const listNotifications = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const offset = (pageNum - 1) * limitNum;

  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        notification: Notification,
        actor: {
          user_id: User.user_id,
          username: User.username,
          first_name: UserProfile.first_name,
          last_name: UserProfile.last_name,
        },
      })
      .from(Notification)
      .leftJoin(User, eq(Notification.actor_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(eq(Notification.user_id, userId))
      .orderBy(desc(Notification.created_at))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: sql<number>`COUNT(*)` })
      .from(Notification)
      .where(eq(Notification.user_id, userId)),
  ]);

  paginatedResponse(res, "Notifications retrieved successfully", items, {
    page: pageNum,
    limit: limitNum,
    total: Number(total),
    totalPages: Math.ceil(Number(total) / limitNum),
  });
});

export const getUnreadNotificationCount = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const unreadCount = await getUnreadCount(userId);
    successResponse(res, "Unread count retrieved successfully", {
      unreadCount,
    });
  },
);

export const markNotificationRead = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const notificationId = parseInt(req.params.notificationId);

    const [existing] = await db
      .select()
      .from(Notification)
      .where(
        and(
          eq(Notification.notification_id, notificationId),
          eq(Notification.user_id, userId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Notification not found");
    }

    await db
      .update(Notification)
      .set({ read_at: sql`CURRENT_TIMESTAMP` })
      .where(eq(Notification.notification_id, notificationId));

    successResponse(res, "Notification marked as read", null);
  },
);

export const markAllNotificationsRead = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    await db
      .update(Notification)
      .set({ read_at: sql`CURRENT_TIMESTAMP` })
      .where(
        and(eq(Notification.user_id, userId), sql`${Notification.read_at} IS NULL`),
      );
    successResponse(res, "All notifications marked as read", null);
  },
);

export const deleteNotification = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const notificationId = parseInt(req.params.notificationId);

  const [existing] = await db
    .select()
    .from(Notification)
    .where(
      and(
        eq(Notification.notification_id, notificationId),
        eq(Notification.user_id, userId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Notification not found");
  }

  await db
    .delete(Notification)
    .where(eq(Notification.notification_id, notificationId));

  successResponse(res, "Notification deleted", null);
});
