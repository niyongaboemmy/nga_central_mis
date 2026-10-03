import { apiService } from "../services/api";

export type ReminderKind =
  | "lesson"
  | "activity"
  | "quiz_open"
  | "quiz_close"
  | "assignment_due"
  | "meeting"
  | "office_hours"
  | "event";

export interface KindSetting {
  enabled: boolean;
  offsets: number[];
}

/** Extra channels on top of in-app + Web Push. */
export interface ChannelChoices {
  telegram: boolean;
  /** Email a critical reminder nobody opened. */
  email: boolean;
  googleCalendar: boolean;
}

export interface ReminderPreferences {
  enabled: boolean;
  channels: ChannelChoices;
  settings: Record<ReminderKind, KindSetting>;
  quietStart: string;
  quietEnd: string;
  morningBriefing: boolean;
  lessonCustomized?: boolean;
}

export interface ReminderDevice {
  subscription_id: number;
  platform: string | null;
  browser: string | null;
  installed: number;
  created_at: string | null;
  last_seen_at: string | null;
  last_success_at: string | null;
  failure_count: number;
  endpoint_hash: string;
}

export interface ReminderJob {
  job_id: number;
  source_type: string;
  title: string;
  body: string | null;
  link: string | null;
  event_start: string;
  fire_at: string;
  offset_min: number;
  status: string;
  channels: string | null;
  critical: number;
  sent_at: string | null;
  acked_at: string | null;
}

export interface AgendaItem {
  key: string;
  kind: ReminderKind;
  title: string;
  detail: string | null;
  location: string | null;
  link: string | null;
  color: string | null;
  role: "teaching" | "attending" | "other";
  critical: boolean;
  start: string;
  end: string | null;
}

export interface Agenda {
  now: string;
  today: string;
  items: AgendaItem[];
}

export interface FeedUrls {
  https: string;
  webcal: string;
}

export interface ReminderConnections {
  telegram: { username: string | null; linked_at: string | null } | null;
  googleCalendar: {
    email: string | null;
    status: "active" | "revoked" | string;
    last_sync_at: string | null;
    last_error: string | null;
  } | null;
}

export interface ReminderConfig {
  push: { enabled: boolean; publicKey: string | null };
  dailyPushCap: number;
  telegram?: { enabled: boolean; bot: string | null };
  googleCalendar?: { enabled: boolean };
  email?: { enabled: boolean; escalateAfterMinutes: number };
}

export interface ReminderOverview {
  preferences: ReminderPreferences;
  devices: ReminderDevice[];
  jobs: ReminderJob[];
  feed: FeedUrls | null;
  connections?: ReminderConnections;
}

export interface DeliveryReport {
  jobId: number;
  channels: string[];
  pushAttempted: number;
  pushDelivered: number;
  capped: boolean;
  errors: string[];
}

export interface AdminOverview {
  since: string;
  optedInUsers: number;
  byStatus: { status: string; count: number }[];
  byChannel: { channels: string; count: number }[];
  devices: { platform: string | null; browser: string | null; installed: boolean; count: number }[];
  onTimeRate: number | null;
  ackRate: number | null;
  push: { enabled: boolean };
}

const data = <T>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

export const remindersApi = {
  config: () => data<ReminderConfig>(apiService.get("/reminders/config")),
  me: () => data<ReminderOverview>(apiService.get("/reminders/me")),
  savePreferences: (patch: Partial<ReminderPreferences>) =>
    data<ReminderPreferences>(apiService.put("/reminders/preferences", patch)),
  agenda: (days = 2) => data<Agenda>(apiService.get("/reminders/agenda", { params: { days } })),
  subscribe: (body: {
    subscription: PushSubscriptionJSON;
    platform: string;
    browser: string;
    installed: boolean;
  }) => data<{ endpoint_hash: string }>(apiService.post("/reminders/push/subscriptions", body)),
  unsubscribe: (endpoint: string) =>
    data<{ removed: number }>(apiService.delete("/reminders/push/subscriptions", { data: { endpoint } })),
  removeDevice: (id: number) =>
    data<{ removed: number }>(apiService.delete(`/reminders/push/subscriptions/${id}`)),
  heartbeat: (endpoint: string, installed: boolean) =>
    data<{ known: boolean }>(apiService.post("/reminders/push/heartbeat", { endpoint, installed })),
  test: () => data<DeliveryReport>(apiService.post("/reminders/test")),
  ack: (jobId: number) => data<{ ok: boolean }>(apiService.post(`/reminders/jobs/${jobId}/ack`)),
  snooze: (jobId: number) => data<{ ok: boolean }>(apiService.post(`/reminders/jobs/${jobId}/snooze`)),
  createFeed: () => data<FeedUrls>(apiService.post("/reminders/feed")),
  deleteFeed: () => data<{ ok: boolean }>(apiService.delete("/reminders/feed")),
  telegramLink: () => data<{ url: string; expiresAt: string }>(apiService.post("/reminders/telegram/link")),
  telegramUnlink: () => data<{ removed: boolean }>(apiService.delete("/reminders/telegram")),
  googleConnectUrl: () => data<{ url: string }>(apiService.get("/reminders/google/connect")),
  googleSync: () =>
    data<{ status: string; last_sync_at: string | null; last_error: string | null }>(apiService.post("/reminders/google/sync")),
  googleDisconnect: () => data<{ removed: boolean }>(apiService.delete("/reminders/google")),
  adminOverview: () => data<AdminOverview>(apiService.get("/reminders/admin/overview")),
};
