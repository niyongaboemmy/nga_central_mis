import { q } from "./db";
import { clock } from "./runtime";

/**
 * Per-user and per-device facts the hot path needs, cached in memory: display name,
 * user type, the exclusion flag, which apps the user was already seen in (first_visit),
 * and which devices and IPs they have used (new-device / new-IP alerts). Loaded in
 * batches from the activity pool.
 */
export interface UserInfo {
  userId: number;
  name: string;
  username: string | null;
  userType: string | null;
  status: string | null;
  excluded: boolean;
  firstSeenApps: Set<string>;
  knownDevices: Set<string>;
  knownIps: Set<string>;
  knownCountries: Set<string>;
  loadedAt: number;
}

const users = new Map<number, UserInfo>();
const USER_TTL_MS = 5 * 60_000;

export const loadUsers = async (ids: number[]): Promise<Map<number, UserInfo>> => {
  const now = clock.now();
  const need = [...new Set(ids)].filter((id) => {
    const u = users.get(id);
    return !u || now - u.loadedAt > USER_TTL_MS;
  });
  if (need.length) {
    const rows = await q<any>(
      `SELECT u.user_id, u.username, u.status, p.first_name, p.last_name, p.user_type,
              s.excluded, s.first_seen_by_app
         FROM User u
         LEFT JOIN UserProfile p ON p.user_id = u.user_id
         LEFT JOIN AnalyticsUserState s ON s.user_id = u.user_id
        WHERE u.user_id IN (?)`,
      [need],
    );
    const devs = await q<any>(
      `SELECT DISTINCT user_id, device_id FROM AnalyticsSession WHERE user_id IN (?) AND started_at > UTC_TIMESTAMP() - INTERVAL 400 DAY`,
      [need],
    );
    const ips = await q<any>(
      `SELECT ui.user_id, HEX(ui.ip) AS ip, g.country_code
         FROM AnalyticsUserIp ui LEFT JOIN AnalyticsIp i ON i.ip = ui.ip LEFT JOIN AnalyticsGeo g ON g.geo_id = i.geo_id
        WHERE ui.user_id IN (?)`,
      [need],
    );
    for (const r of rows) {
      const fs = parseJson(r.first_seen_by_app) ?? {};
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.username || `User ${r.user_id}`;
      users.set(Number(r.user_id), {
        userId: Number(r.user_id),
        name,
        username: r.username ?? null,
        userType: r.user_type ?? null,
        status: r.status ?? null,
        excluded: !!r.excluded,
        firstSeenApps: new Set(Object.keys(fs)),
        knownDevices: new Set(),
        knownIps: new Set(),
        knownCountries: new Set(),
        loadedAt: now,
      });
    }
    for (const d of devs) users.get(Number(d.user_id))?.knownDevices.add(d.device_id);
    for (const i of ips) {
      const u = users.get(Number(i.user_id));
      if (!u) continue;
      u.knownIps.add(String(i.ip).toLowerCase());
      if (i.country_code) u.knownCountries.add(i.country_code);
    }
  }
  const out = new Map<number, UserInfo>();
  for (const id of ids) {
    const u = users.get(id);
    if (u) out.set(id, u);
  }
  return out;
};

export const cachedUser = (id: number | null | undefined) => (id ? users.get(id) ?? null : null);

export const setUserExcludedInCache = (id: number, excluded: boolean) => {
  const u = users.get(id);
  if (u) u.excluded = excluded;
};

export const forgetUser = (id: number) => users.delete(id);

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------
export interface DeviceInfo {
  deviceId: string;
  isNew: boolean;
  botScore: number;
  botOverride: "none" | "human" | "bot";
  inputSeen: boolean;
  pageViews: number;
  rateHits: number;
  firstUserId: number | null;
  lastUserId: number | null;
  linkedUserIds: Set<number>;
  guestNames: Set<string>;
  preciseLocState: "unasked" | "granted" | "denied";
  loadedAt: number;
}
const devices = new Map<string, DeviceInfo>();
const DEVICE_MAX = 50_000;

export const loadDevice = async (deviceId: string): Promise<DeviceInfo> => {
  const hit = devices.get(deviceId);
  if (hit) return hit;
  const rows = await q<any>(
    `SELECT bot_score, bot_override, page_views, first_user_id, last_user_id, linked_user_ids, guest_names, precise_loc_state
       FROM AnalyticsDevice WHERE device_id = ?`,
    [deviceId],
  );
  const r = rows[0];
  const info: DeviceInfo = {
    deviceId,
    isNew: !r,
    botScore: r ? Number(r.bot_score) : 0,
    botOverride: r?.bot_override ?? "none",
    inputSeen: false,
    pageViews: r ? Number(r.page_views) : 0,
    rateHits: 0,
    firstUserId: r?.first_user_id ? Number(r.first_user_id) : null,
    lastUserId: r?.last_user_id ? Number(r.last_user_id) : null,
    linkedUserIds: new Set((parseJson(r?.linked_user_ids) ?? []).map(Number)),
    guestNames: new Set(parseJson(r?.guest_names) ?? []),
    preciseLocState: r?.precise_loc_state ?? "unasked",
    loadedAt: clock.now(),
  };
  devices.set(deviceId, info);
  if (devices.size > DEVICE_MAX) devices.delete(devices.keys().next().value as string);
  return info;
};

export const cachedDevice = (deviceId: string) => devices.get(deviceId) ?? null;

export const clearPeopleCaches = () => {
  users.clear();
  devices.clear();
};

export const parseJson = (v: unknown): any => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
