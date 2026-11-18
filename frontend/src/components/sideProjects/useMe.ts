import { useEffect, useState } from "react";
import { sideProjectsApi, type Me } from "../../api/sideProjects";

let cached: { at: number; me: Me } | null = null;
let pending: Promise<Me> | null = null;

/** What the signed-in user may do in side projects (/side-projects/me), cached for 2 minutes. */
export function useSpMe(): Me | null {
  const [me, setMe] = useState<Me | null>(cached?.me ?? null);
  useEffect(() => {
    if (cached && Date.now() - cached.at < 120_000) return;
    let live = true;
    pending ??= sideProjectsApi.me().finally(() => (pending = null));
    pending
      .then((m) => {
        cached = { at: Date.now(), me: m };
        if (live) setMe(m);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return me;
}

/** Tests and sign-out. */
export const resetSpMe = () => (cached = null);
