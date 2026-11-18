import { useEffect, useState } from "react";
import { sideProjectsApi } from "../../api/sideProjects";

let cached: { at: number; n: number } | null = null;

/** How many projects the signed-in staff member supervises (cached 5 minutes). */
export function useSupervisingCount(enabled: boolean): number {
  const [n, setN] = useState(cached?.n ?? 0);
  useEffect(() => {
    if (!enabled) return;
    if (cached && Date.now() - cached.at < 300_000) {
      setN(cached.n);
      return;
    }
    let live = true;
    sideProjectsApi
      .me()
      .then((m) => {
        cached = { at: Date.now(), n: m.supervising };
        if (live) setN(m.supervising);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled]);
  return enabled ? n : 0;
}
