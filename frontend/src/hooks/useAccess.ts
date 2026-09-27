import { useCallback, useEffect, useSyncExternalStore } from "react";
import { accessApi } from "../api/access";
import {
  AccessSnapshot,
  can as canCore,
  Depth,
  depthAt as depthAtCore,
  scopeFor as scopeForCore,
  Target,
} from "../vendor/nga-access";

/**
 * The signed-in user's access-control-v2 snapshot for the MIS
 * (GET /access/me), shared by every component through one small store.
 *
 * `can` answers v2 capabilities -- including the ones the legacy
 * `usePermissions` never sees (ACCESS_STUDIO_VIEW, VIEW_LEADERSHIP_STRUCTURE,
 * ...). While the snapshot loads, or when the server has no v2 (503), every
 * answer is `false`: fail closed.
 */

type State = { snapshot: AccessSnapshot | null; loading: boolean; unavailable: boolean; at: number };
let state: State = { snapshot: null, loading: false, unavailable: false, at: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const REFRESH_MS = 60_000;

async function load(force = false) {
  if (state.loading) return;
  if (!force && state.at && Date.now() - state.at < REFRESH_MS) return;
  if (!localStorage.getItem("token")) return;
  state = { ...state, loading: true };
  emit();
  try {
    const snapshot = await accessApi.me("mis");
    state = { snapshot, loading: false, unavailable: false, at: Date.now() };
  } catch (err: any) {
    state = {
      snapshot: null,
      loading: false,
      unavailable: err?.response?.status === 503,
      at: Date.now(),
    };
  }
  emit();
}

/** Drop the cached snapshot (after an access change made in this tab). */
export function refreshAccess() {
  return load(true);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useAccess() {
  const snap = useSyncExternalStore(subscribe, () => state);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const can = useCallback(
    (capability: string | string[], target?: Target | null, minDepth?: Depth) =>
      (Array.isArray(capability) ? capability : [capability]).some((c) =>
        canCore(snap.snapshot, c, target, minDepth),
      ),
    [snap.snapshot],
  );
  const depthAt = useCallback(
    (capability: string, target?: Target | null) => depthAtCore(snap.snapshot, capability, target),
    [snap.snapshot],
  );
  const scopeFor = useCallback(
    (capability: string, minDepth?: Depth) => scopeForCore(snap.snapshot, capability, minDepth),
    [snap.snapshot],
  );

  return {
    snapshot: snap.snapshot,
    loading: snap.loading || (!snap.at && !!localStorage.getItem("token")),
    unavailable: snap.unavailable,
    can,
    depthAt,
    scopeFor,
    refresh: refreshAccess,
  };
}

/** Test helper: reset the shared store. */
export function __resetAccessStore() {
  state = { snapshot: null, loading: false, unavailable: false, at: 0 };
  emit();
}
