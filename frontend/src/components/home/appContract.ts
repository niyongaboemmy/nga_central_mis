import type { AttentionItem, GlanceTile } from "./contract";

/**
 * Other apps on Home (plan §9, H3) -- what POST /home/apps/:source/summary
 * returns after the MIS has checked the app's answer. Mirrors
 * backend/src/services/home/apps.ts (AppSummaryResult / SanitisedSummary).
 */
export type AppSource = "taskmentor" | "attendance" | "tupo";

export interface AppUpdate {
  id: string;
  source: AppSource;
  kind: string;
  title: string;
  body: string | null;
  severity: "info" | "success" | "warning" | "critical";
  created_at: string;
  read: boolean;
  href: string | null;
}

export interface AppMeeting {
  id: string;
  title: string;
  starts_at: string;
  live: boolean;
  href: string | null;
}

export interface AppSummary {
  version: 1;
  source: AppSource;
  generated_at: string;
  provisioned: boolean;
  items: AttentionItem[];
  tiles: GlanceTile[];
  updates: AppUpdate[];
  today_marks: Array<{ lesson_key: string; status: "done" | "missing" | "upcoming" | "not_yours"; href: string | null }>;
  comms: { chat_unread: number; mentions: number; mail_unread: number; meetings: AppMeeting[] } | null;
  app_url: string | null;
}

export interface AppSummaryResult {
  source: AppSource;
  status: "ok" | "unprovisioned" | "unavailable" | "unauthorized";
  message?: string;
  summary?: AppSummary;
}

/** Per-app state on the page: "loading" until its first answer arrives. */
export type AppState =
  | { source: AppSource; name: string; status: "loading" }
  | ({ name: string } & AppSummaryResult);
