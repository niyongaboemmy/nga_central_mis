import { useCallback, useEffect, useRef, useState } from "react";
import { remindersApi, type Agenda, type ReminderConfig, type ReminderOverview, type ReminderPreferences } from "../../api/reminders";
import { getPushStatus, type PushStatus } from "../../reminders/push";
import { usePwa } from "../../reminders/pwa";
import { API_BASE_URL } from "../../services/api";

/** Hand the worker what it needs to refresh the offline agenda on its own. */
const shareAgendaSource = async (agenda: Agenda | null) => {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
  const token = localStorage.getItem("token");
  const worker = navigator.serviceWorker.controller;
  if (token) worker.postMessage({ type: "nga:agenda-source", apiBase: API_BASE_URL, token });
  if (agenda) worker.postMessage({ type: "nga:agenda-cache", body: JSON.stringify(agenda) });
  try {
    const reg: any = await navigator.serviceWorker.ready;
    if (reg.periodicSync) {
      const status = await (navigator as any).permissions?.query({ name: "periodic-background-sync" });
      if (!status || status.state === "granted") {
        await reg.periodicSync.register("nga-agenda", { minInterval: 6 * 3_600_000 });
      }
    }
  } catch {
    /* periodic sync is an enhancement only */
  }
};

/** Last agenda the worker cached, for opening the page offline. */
const cachedAgenda = async (): Promise<Agenda | null> => {
  try {
    const res = await fetch("/__nga/agenda.json");
    return res.ok ? ((await res.json()) as Agenda) : null;
  } catch {
    return null;
  }
};

export const useReminders = () => {
  const pwa = usePwa();
  const [overview, setOverview] = useState<ReminderOverview | null>(null);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushEnabledOnServer, setPushEnabledOnServer] = useState(true);
  const [config, setConfig] = useState<ReminderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const mounted = useRef(true);

  const refreshPush = useCallback(async () => {
    const status = await getPushStatus();
    if (mounted.current) setPushStatus(status);
    return status;
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [me, ag, config] = await Promise.all([
        remindersApi.me(),
        remindersApi.agenda(2),
        remindersApi.config(),
      ]);
      if (!mounted.current) return;
      setOverview(me);
      setAgenda(ag);
      setPushEnabledOnServer(config.push.enabled);
      setConfig(config);
      setOffline(false);
      void shareAgendaSource(ag);
    } catch (e: any) {
      if (!mounted.current) return;
      const cached = await cachedAgenda();
      if (cached) {
        setAgenda(cached);
        setOffline(true);
      }
      setError(
        e?.code === "ECONNABORTED"
          ? "The server took too long to answer."
          : e?.response
            ? "We couldn't load your reminders."
            : "You're offline — showing the last saved agenda.",
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    void refreshPush();
    // A push arriving while the page is open refreshes the lists.
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "nga:reminder") void load();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      mounted.current = false;
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [load, refreshPush]);

  useEffect(() => {
    void refreshPush();
  }, [pwa.installed, pwa.registration, refreshPush]);

  const savePreferences = useCallback(async (patch: Partial<ReminderPreferences>) => {
    const saved = await remindersApi.savePreferences(patch);
    setOverview((o) => (o ? { ...o, preferences: saved } : o));
    return saved;
  }, []);

  return {
    pwa,
    overview,
    agenda,
    pushStatus,
    pushEnabledOnServer,
    config,
    loading,
    error,
    offline,
    reload: load,
    refreshPush,
    savePreferences,
    setOverview,
  };
};
