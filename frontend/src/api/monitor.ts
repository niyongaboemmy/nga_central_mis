import api, { API_BASE_URL } from "../services/api";

/**
 * Usage & Monitoring console API (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §15).
 */
export type AppKey = "mis" | "tm" | "tendo" | "tupo";
export type PresenceStatus = "active" | "idle" | "background" | "offline";

export interface GeoView {
  country_code: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
  conn_type: string;
  lat: number | null;
  lon: number | null;
}

export interface LiveTab {
  app: AppKey;
  feature: string | null;
  route: string | null;
  title: string | null;
  status: Exclude<PresenceStatus, "offline">;
  standalone: boolean;
  device: { browser: string | null; os: string | null; type: string };
  ip: string | null;
  geo: GeoView | null;
  network: string | null;
  since: string;
}

export interface LivePerson {
  key: string;
  user: { id: number; name: string; type: string | null } | null;
  visitor: { code: string; device_id: string } | null;
  status: PresenceStatus;
  since: string;
  last_beat: string;
  tabs: LiveTab[];
}

export interface LiveCounts {
  active: number;
  idle: number;
  background: number;
  online: number;
  users: number;
  visitors: number;
  by_app: Record<string, number>;
  by_type: Record<string, number>;
}

export interface MinutePoint {
  minute: string;
  total: number;
  users: number;
  visitors: number;
  by_app: Record<string, number>;
}

export interface LiveSnapshot {
  at: string;
  counts: LiveCounts;
  last5: number;
  last30: number;
  minutes: MinutePoint[];
  top_features: { app: AppKey; feature: string; people: number }[];
  people: LivePerson[];
  events?: LiveEvent[];
  named: boolean;
}

export interface LiveEvent {
  at: string;
  kind: string;
  app: AppKey;
  user_id: number | null;
  user_name: string | null;
  user_type: string | null;
  device_id: string | null;
  visitor_code: string | null;
  ip: string | null;
  place: string | null;
  isp: string | null;
  detail: Record<string, unknown> | null;
}

export interface LiveFilter {
  app?: AppKey[];
  aud?: "user" | "visitor" | "both";
  type?: string[];
  feature?: string;
}

export const filterQuery = (f: LiveFilter) => {
  const p = new URLSearchParams();
  if (f.app?.length) p.set("app", f.app.join(","));
  if (f.aud && f.aud !== "both") p.set("aud", f.aud);
  if (f.type?.length) p.set("type", f.type.join(","));
  if (f.feature) p.set("feature", f.feature);
  return p.toString();
};

export const monitorApi = {
  live: async (f: LiveFilter = {}) => (await api.get(`/monitor/live?${filterQuery(f)}`)).data.data as LiveSnapshot,
  liveTicket: async () => (await api.post("/monitor/live/ticket")).data.data.ticket as string,
  streamUrl: (ticket: string, f: LiveFilter = {}) =>
    `${API_BASE_URL}/monitor/live/stream?ticket=${encodeURIComponent(ticket)}&${filterQuery(f)}`,
  settings: async () => (await api.get("/monitor/settings")).data.data,
  saveSettings: async (settings: Record<string, unknown>, reason?: string) =>
    (await api.put("/monitor/settings", { settings, reason })).data.data,
  ingestHealth: async () => (await api.get("/monitor/ingest/health")).data.data,
  catalogHealth: async () => (await api.get("/monitor/catalog/health")).data.data,
};

// ---------------------------------------------------------------------------
// Reports (plan §14). Query strings come from useReportQuery (URL state).
// ---------------------------------------------------------------------------
const getData = async <T = any>(path: string, qs: string) => (await api.get(`/monitor${path}${qs ? `?${qs}` : ""}`)).data.data as T;

export const reportsApi = {
  overview: (qs: string) => getData("/overview", qs),
  accessSeries: (qs: string) => getData("/access/series", qs),
  heatmap: (qs: string) => getData("/access/heatmap", qs),
  accessUsers: (qs: string) => getData("/access/users", qs),
  failed: (qs: string) => getData("/access/failed", qs),
  audience: (qs: string) => getData("/audience", qs),
  adoption: (qs: string) => getData("/audience/adoption", qs),
  visitors: (qs: string) => getData("/visitors", qs),
  visitorSummary: (qs: string) => getData("/visitors/summary", qs),
  features: (qs: string) => getData("/engagement/features", qs),
  dimension: (qs: string) => getData("/engagement/dimension", qs),
  keyEvents: (qs: string) => getData("/engagement/key-events", qs),
  apps: (qs: string) => getData("/apps", qs),
  retention: (qs: string) => getData("/retention", qs),
  technology: (qs: string) => getData("/technology", qs),
  locations: (qs: string) => getData("/locations", qs),
  ip: (ip: string) => getData(`/ip/${encodeURIComponent(ip)}`, ""),
  /** Download a CSV export (authenticated) and save it. */
  csv: async (path: string, qs: string, filename: string) => {
    const r = await api.get(`/monitor${path}?${qs}${qs ? "&" : ""}format=csv`, { responseType: "blob" });
    const url = URL.createObjectURL(r.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  },
};
