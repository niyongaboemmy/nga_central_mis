import { useCallback, useEffect, useRef, useState } from "react";
import { getHomeOverview } from "../../api/home";
import { describeLoadError, type LoadFailure } from "../teacher/loadError";
import type { HomeOverview } from "./contract";

/** Background refresh cadence -- only while the tab is visible. */
export const HOME_REFRESH_MS = 5 * 60 * 1000;
/** A focus/visibility return refetches when the data is older than this. */
const STALE_MS = 60 * 1000;

const snapshotKey = (userId: number | undefined, as: number | undefined) =>
  userId ? `home.snapshot.${userId}${as ? `.as${as}` : ""}` : null;

/**
 * Last Home the user saw, so a revisit paints instantly while the fresh copy
 * loads. Per-user, per-tab (sessionStorage), best-effort: storage can be
 * blocked, full or absent, and the page must work the same without it.
 */
const readSnapshot = (key: string | null): HomeOverview | null => {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as HomeOverview) : null;
  } catch {
    return null;
  }
};
const writeSnapshot = (key: string | null, data: HomeOverview) => {
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* storage full or blocked -- the snapshot is only a convenience */
  }
};

export interface HomeData {
  data: HomeOverview | null;
  /** First load with nothing to show yet. */
  loading: boolean;
  /** A (background) refresh is in flight. */
  refreshing: boolean;
  /** Showing the cached copy from the last visit while the fresh one loads. */
  fromSnapshot: boolean;
  error: LoadFailure | null;
  fetchedAt: Date | null;
  refresh: () => void;
}

export function useHomeData(params: {
  userId?: number;
  yearId?: number | null;
  termId?: number | null;
  as?: number;
}): HomeData {
  const { userId, yearId, termId, as } = params;
  const key = snapshotKey(userId, as);
  const [data, setData] = useState<HomeOverview | null>(() => readSnapshot(key));
  const [fromSnapshot, setFromSnapshot] = useState<boolean>(() => !!readSnapshot(key));
  const [loading, setLoading] = useState<boolean>(() => !readSnapshot(key));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<LoadFailure | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);
  const fetchedAtRef = useRef<number>(0);

  const load = useCallback(
    async (opts: { refresh?: boolean; background?: boolean } = {}) => {
      if (!userId || inFlight.current) return;
      inFlight.current = true;
      setRefreshing(true);
      try {
        const next = await getHomeOverview({
          academic_year_id: yearId ?? undefined,
          academic_term_id: termId ?? undefined,
          refresh: opts.refresh,
          as,
        });
        setData(next);
        setFromSnapshot(false);
        setError(null);
        const at = new Date();
        setFetchedAt(at);
        fetchedAtRef.current = at.getTime();
        writeSnapshot(key, next);
      } catch (err) {
        // A failed background refresh keeps what is on screen.
        if (!opts.background) setError(describeLoadError(err));
      } finally {
        inFlight.current = false;
        setRefreshing(false);
        setLoading(false);
      }
    },
    [userId, yearId, termId, as, key],
  );

  // Initial load and whenever the period switcher changes.
  useEffect(() => {
    void load();
  }, [load]);

  // Background refresh while visible; catch up on return to the tab.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void load({ background: true });
    };
    const id = window.setInterval(tick, HOME_REFRESH_MS);
    const onReturn = () => {
      if (document.visibilityState === "visible" && Date.now() - fetchedAtRef.current > STALE_MS) {
        void load({ background: true });
      }
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [load]);

  const refresh = useCallback(() => void load({ refresh: true }), [load]);

  return { data, loading, refreshing, fromSnapshot, error, fetchedAt, refresh };
}
