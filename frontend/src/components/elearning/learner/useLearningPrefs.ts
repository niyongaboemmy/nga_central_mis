import { useCallback, useEffect, useState } from "react";
import { apiService } from "../../../services/api";

/**
 * Per-account learning choices (UX plan §6.3 UserLearningPrefs): celebrations, opt-in streak,
 * reduced motion override. Cached in localStorage for instant first paint, synced to the
 * server when the endpoint is available (Phase 5); a missing endpoint just leaves the local copy.
 */
export interface LearningPrefs {
  celebrations_enabled: boolean;
  streak_enabled: boolean;
  reduced_motion: boolean | null;
}

const KEY = "elearning.prefs";
const DEFAULTS: LearningPrefs = { celebrations_enabled: true, streak_enabled: false, reduced_motion: null };

const readLocal = (): LearningPrefs => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
};

let serverLoaded = false;

export const useLearningPrefs = () => {
  const [prefs, setPrefs] = useState<LearningPrefs>(readLocal);

  useEffect(() => {
    if (serverLoaded) return;
    serverLoaded = true;
    apiService
      .get("/elearning/my/prefs")
      .then((r) => {
        const d = r.data?.data;
        if (!d) return;
        const next: LearningPrefs = {
          celebrations_enabled: !!d.celebrations_enabled,
          streak_enabled: !!d.streak_enabled,
          reduced_motion: d.reduced_motion === null || d.reduced_motion === undefined ? null : !!d.reduced_motion,
        };
        setPrefs(next);
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        serverLoaded = false;
      });
  }, []);

  const update = useCallback((patch: Partial<LearningPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      apiService.patch("/elearning/my/prefs", patch).catch(() => undefined);
      return next;
    });
  }, []);

  return { prefs, update };
};
