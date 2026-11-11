import { useCallback, useEffect, useRef, useState } from "react";
import { applicantApi, type OnboardingMe } from "../../../api/tenantMgmt";

export const POLL_MS = 15000;
export const POLL_PROVISIONING_MS = 3000;

/**
 * The applicant's state, kept fresh: every 15 s, every 3 s while provisioning,
 * and on window focus. A 401 means the onboarding token expired -> onExpired.
 */
export function useOnboardingMe(token: string, onExpired: () => void, initial: OnboardingMe | null = null) {
  const [me, setMe] = useState<OnboardingMe | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const expired = useRef(onExpired);
  expired.current = onExpired;
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setMe(await applicantApi.me());
      setError(null);
    } catch (e: any) {
      if (e?.response?.status === 401) expired.current();
      else setError(e?.response?.data?.message || "No connection");
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [token, reload]);

  const status = me?.application?.status;
  useEffect(() => {
    const ms = status === "PROVISIONING" ? POLL_PROVISIONING_MS : POLL_MS;
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void reload();
    }, ms);
    return () => window.clearInterval(t);
  }, [status, reload]);

  useEffect(() => {
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  return { me, error, reload, setMe };
}
