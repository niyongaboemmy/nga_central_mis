import { API_BASE_URL } from "../services/api";
import { getToken, removeToken } from "../utils/auth";
import { initActivity, getDeviceId, endActivity, type CatalogEntry } from "../vendor/nga-activity";
import catalog from "./mis.catalog.json";

/**
 * Platform activity for the MIS SPA itself (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §13).
 * The MIS posts straight to its own API: `/activity/sync`, authenticated by the session
 * token, or anonymous on public pages. The other apps go through their own relay.
 */
const OFFLINE_USER_KEY = "nga.user.offlineCache";

const userIdFromToken = (token: string | null): number | null => {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const id = Number(payload.userId);
    return Number.isInteger(id) && id > 0 && !payload.requiresOTP ? id : null;
  } catch {
    return null;
  }
};

const cachedUserType = (): string | null => {
  try {
    const u = JSON.parse(localStorage.getItem(OFFLINE_USER_KEY) || "null");
    return u?.profile?.user_type ?? null;
  } catch {
    return null;
  }
};

export const startMisActivity = () =>
  initActivity({
    app: "mis",
    endpoint: `${API_BASE_URL}/activity/sync`,
    configUrl: `${API_BASE_URL}/activity/config`,
    credentials: "include",
    authHeader: () => {
      const t = getToken();
      return t && userIdFromToken(t) ? `Bearer ${t}` : null;
    },
    userKey: () => userIdFromToken(getToken()),
    userType: cachedUserType,
    release: (import.meta.env.VITE_RELEASE as string | undefined) ?? undefined,
    catalog: (catalog as { features: CatalogEntry[] }).features,
    // An administrator signed this device out (Usage & Monitoring → User 360).
    onEndCommand: () => {
      removeToken();
      window.location.assign("/login?ended=1");
    },
  });

export { getDeviceId, endActivity };
