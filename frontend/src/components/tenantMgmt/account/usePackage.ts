/**
 * The school's package as the UI sees it (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md
 * §3.3, §6.6, M6): GET /tenant/status, fetched once and kept in module memory so
 * every banner, lock badge and nav entry shares one request.
 *
 * Fails open: when the status cannot be read (single-school install, offline,
 * old server) everything counts as included -- the server enforces anyway (R7).
 */
import { useEffect, useSyncExternalStore } from "react";
import { accessLocksApi, tenantApi, type EffectiveEntitlements } from "../../../api/tenantMgmt";
import { PRIMARY_TID, readIdentity } from "../../../lib/tenant";

export type TenantStatusData = Awaited<ReturnType<typeof tenantApi.status>>;

type Store = { data: TenantStatusData | null; loading: boolean; failed: boolean; at: number };
let store: Store = { data: null, loading: false, failed: false, at: 0 };
let inflight: Promise<TenantStatusData | null> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const STATUS_REFRESH_MS = 10 * 60_000;

const hasToken = () => {
  try {
    return !!localStorage.getItem("token");
  } catch {
    return false;
  }
};

/** Read (or reuse) the tenant status. Never throws. */
export function loadTenantStatus(force = false): Promise<TenantStatusData | null> {
  if (inflight) return inflight;
  if (!force && store.at && Date.now() - store.at < STATUS_REFRESH_MS) return Promise.resolve(store.data);
  if (!hasToken()) return Promise.resolve(null);
  store = { ...store, loading: true };
  emit();
  inflight = tenantApi
    .status()
    .then((data) => {
      store = { data, loading: false, failed: false, at: Date.now() };
      return data;
    })
    .catch(() => {
      store = { ...store, loading: false, failed: true, at: Date.now() };
      return store.data;
    })
    .finally(() => {
      inflight = null;
      emit();
    });
  return inflight;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The shared tenant status (null until loaded or when unavailable). */
export function useTenantStatus() {
  const s = useSyncExternalStore(subscribe, () => store);
  useEffect(() => {
    void loadTenantStatus();
  }, []);
  return s;
}

/** Does the package include this APP / FEATURE key? */
export const entitled = (ent: EffectiveEntitlements | null | undefined, key: string): boolean =>
  !ent || ent.unrestricted || ent.features.includes(key) || ent.apps.includes(key);

/** OAuth client id of a spoke -> the package APP key that unlocks it. */
export const CLIENT_APP_KEYS: Record<string, string> = {
  taskmentor_app: "app.taskmentor",
  discipline_attendance: "app.tendo",
  tupo: "app.tupo",
};

/** May this system be given to roles under the package? Unknown systems are not package-gated. */
export const isSystemEntitled = (clientId: string | null | undefined, ent: EffectiveEntitlements | null | undefined): boolean => {
  const key = clientId ? CLIENT_APP_KEYS[clientId] : undefined;
  return !key || entitled(ent, key);
};

/** `{ allowed, loading }` for one feature key (e.g. "feature.elearning"). */
export function usePackageFeature(featureKey: string) {
  const s = useTenantStatus();
  return { allowed: entitled(s.data?.entitlements, featureKey), loading: s.loading && !s.data };
}

/** Test helper. */
export function __resetPackageStore(data: TenantStatusData | null = null) {
  store = { data, loading: false, failed: false, at: data ? Date.now() : 0 };
  inflight = null;
  emit();
}

// ---------------------------------------------------------------------------
// Access Studio lock badges: capabilities the package does not include
// ---------------------------------------------------------------------------

type Locks = Awaited<ReturnType<typeof accessLocksApi.locks>>;
let locksState: Locks | null = null;
let locksPromise: Promise<Locks | null> | null = null;
const lockListeners = new Set<() => void>();

function loadLocks() {
  if (!locksPromise) {
    locksPromise = accessLocksApi
      .locks()
      .then((l) => (locksState = l))
      .catch(() => null)
      .finally(() => lockListeners.forEach((f) => f()));
  }
  return locksPromise;
}

/** `lockedFeature(app, capKey)` -> the feature key it needs, or null when included. Fetched once per page load. */
export function usePackageLocks() {
  const locks = useSyncExternalStore(
    (l) => {
      lockListeners.add(l);
      return () => lockListeners.delete(l);
    },
    () => locksState,
  );
  useEffect(() => {
    void loadLocks();
  }, []);
  return (app: string, key: string): string | null => locks?.locked?.[app]?.[key] ?? null;
}

/** False only when this browser is known to be signed in to a school other than the primary one. */
export const isPrimaryTenantSession = (): boolean => {
  const id = readIdentity();
  return !id || id.tid === PRIMARY_TID;
};

/** Test helper. */
export function __resetLocks(l: Locks | null = null) {
  locksState = l;
  locksPromise = l ? Promise.resolve(l) : null;
  lockListeners.forEach((f) => f());
}
