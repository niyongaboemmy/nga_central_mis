import { apiService } from "../services/api";

export type ReminderKind =
  | "lesson"
  | "activity"
  | "quiz_open"
  | "quiz_close"
  | "assignment_due"
  | "meeting"
  | "event";

export interface KindSetting {
  enabled: boolean;
  offsets: number[];
}

export interface ReminderPreferences {
  enabled: boolean;
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

export interface ReminderOverview {
  preferences: ReminderPreferences;
  devices: ReminderDevice[];
  jobs: ReminderJob[];
  feed: FeedUrls | null;
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
  config: () =>
    data<{ push: { enabled: boolean; publicKey: string | null }; dailyPushCap: number }>(
      apiService.get("/reminders/config"),
    ),
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
  adminOverview: () => data<AdminOverview>(apiService.get("/reminders/admin/overview")),
};
