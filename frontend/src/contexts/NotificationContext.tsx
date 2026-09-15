import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { notificationApi, type AppNotification } from "../api/notifications";
import { useUser } from "./UserContext";
import { useToast } from "./ToastContext";

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
  markRead: (notificationId: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (notificationId: number) => Promise<void>;
  /** True if there's an unread "shared with you" notification for this exact item. */
  isSubjectUnread: (subjectType: string, subjectId: number) => boolean;
  /** Marks any unread notification(s) for this item as read (e.g. when opened). */
  markSubjectRead: (subjectType: string, subjectId: number) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
);

const POLL_INTERVAL_MS = 45000;

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useUser();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Highest notification_id seen so far, so a poll that finds newer ones can
  // toast just those instead of re-toasting everything on every refresh.
  const seenMaxIdRef = useRef<number>(-1);
  const isFirstLoadRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoading(true);
      const [listRes, countRes] = await Promise.all([
        notificationApi.list({ limit: 20 }),
        notificationApi.unreadCount(),
      ]);
      const items: AppNotification[] = (listRes.data as any).data || [];
      setNotifications(items);
      setUnreadCount((countRes.data as any).data?.unreadCount ?? 0);

      const newestId = items.reduce(
        (max, n) => Math.max(max, n.notification.notification_id),
        -1,
      );

      if (isFirstLoadRef.current) {
        // Don't toast the whole backlog the first time a session loads.
        isFirstLoadRef.current = false;
      } else {
        const freshlyArrived = items.filter(
          (n) =>
            n.notification.notification_id > seenMaxIdRef.current &&
            !n.notification.read_at,
        );
        for (const n of freshlyArrived.slice(0, 3)) {
          showToast(n.notification.title, "info");
        }
      }
      if (newestId > seenMaxIdRef.current) seenMaxIdRef.current = newestId;
    } catch (error) {
      console.error("Failed to load notifications:", error);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      seenMaxIdRef.current = -1;
      isFirstLoadRef.current = true;
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    refresh();
    pollRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user?.user_id]);

  const markRead = useCallback(async (notificationId: number) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.notification.notification_id === notificationId
          ? { ...n, notification: { ...n.notification, read_at: new Date().toISOString() } }
          : n,
      ),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await notificationApi.markRead(notificationId);
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        notification: { ...n.notification, read_at: new Date().toISOString() },
      })),
    );
    setUnreadCount(0);
    try {
      await notificationApi.markAllRead();
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  }, []);

  const remove = useCallback(async (notificationId: number) => {
    const wasUnread = notifications.find(
      (n) =>
        n.notification.notification_id === notificationId &&
        !n.notification.read_at,
    );
    setNotifications((prev) =>
      prev.filter((n) => n.notification.notification_id !== notificationId),
    );
    if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await notificationApi.remove(notificationId);
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  }, [notifications]);

  const unreadSubjectKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const n of notifications) {
      if (
        !n.notification.read_at &&
        n.notification.subject_type &&
        n.notification.subject_id != null
      ) {
        keys.add(`${n.notification.subject_type}:${n.notification.subject_id}`);
      }
    }
    return keys;
  }, [notifications]);

  const isSubjectUnread = useCallback(
    (subjectType: string, subjectId: number) =>
      unreadSubjectKeys.has(`${subjectType}:${subjectId}`),
    [unreadSubjectKeys],
  );

  const markSubjectRead = useCallback(
    (subjectType: string, subjectId: number) => {
      const matches = notifications.filter(
        (n) =>
          !n.notification.read_at &&
          n.notification.subject_type === subjectType &&
          n.notification.subject_id === subjectId,
      );
      matches.forEach((n) => markRead(n.notification.notification_id));
    },
    [notifications, markRead],
  );

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        refresh,
        markRead,
        markAllRead,
        remove,
        isSubjectUnread,
        markSubjectRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider",
    );
  }
  return context;
};

export default NotificationProvider;
