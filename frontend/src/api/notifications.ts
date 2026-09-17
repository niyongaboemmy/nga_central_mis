import { apiService } from "../services/api";

export interface AppNotification {
  notification: {
    notification_id: number;
    user_id: number;
    kind: "document_shared" | "folder_shared" | "permission_revoked" | string;
    title: string;
    body: string | null;
    link: string | null;
    subject_type: string | null;
    subject_id: number | null;
    actor_id: number | null;
    read_at: string | null;
    created_at: string;
  };
  actor: {
    user_id: number;
    username: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export const notificationApi = {
  list: (params?: { page?: number; limit?: number }) =>
    apiService.get<{
      data: AppNotification[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>("/notifications", { params }),

  unreadCount: () =>
    apiService.get<{ data: { unreadCount: number } }>(
      "/notifications/unread-count",
    ),

  markRead: (notificationId: number) =>
    apiService.post(`/notifications/${notificationId}/read`),

  markAllRead: () => apiService.post("/notifications/read-all"),

  remove: (notificationId: number) =>
    apiService.delete(`/notifications/${notificationId}`),
};
