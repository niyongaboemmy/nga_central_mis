import { useCallback, useEffect, useRef, useState } from "react";
import { RunDetail, RunEvent, studioApi } from "../../../api/studio";
import { getToken } from "../../../utils/auth";
import { applyTaskEvent, isRunActive } from "./studioModel";

/**
 * Live progress of one generation run. Server-Sent Events tell us *that* something changed
 * (a task started/finished, the run paused for quota); the run itself is re-read, debounced,
 * so digests and drafts are always the server's truth. If the stream can't connect (a proxy
 * that buffers) it falls back to polling every 4 s while the run is active.
 */
export function useRunStream(runId: number | null) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    if (!runId) return;
    try {
      const r = await studioApi.run(runId);
      if (alive.current) {
        setRun(r.data.data);
        setError(null);
      }
    } catch (e: any) {
      if (alive.current) setError(e?.response?.data?.message || "Could not load the run");
    }
  }, [runId]);

  const scheduleReload = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => void reload(), 600);
  }, [reload]);

  useEffect(() => {
    alive.current = true;
    setRun(null);
    if (!runId) return;
    void reload();
    let es: EventSource | null = null;
    const token = getToken();
    if (typeof EventSource !== "undefined" && token) {
      es = new EventSource(studioApi.streamUrl(runId, token));
      es.onopen = () => setConnected(true);
      es.onmessage = (msg) => {
        try {
          const e = JSON.parse(msg.data) as RunEvent;
          if (e.type === "task") setRun((r) => (r ? applyTaskEvent(r, e) : r));
          if (e.type === "task" || e.type === "run") scheduleReload();
        } catch {
          /* a malformed frame is ignored; the next reload fixes the view */
        }
      };
      // Not connected → the polling effect below takes over until the stream recovers.
      es.onerror = () => setConnected(false);
    }
    return () => {
      alive.current = false;
      es?.close();
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
  }, [runId, reload, scheduleReload]);

  // Fallback polling while the stream is down; stops once the run settles.
  const active = run ? isRunActive(run.run.status) : true;
  useEffect(() => {
    if (!active || !runId || connected) return;
    const t = setInterval(() => void reload(), 4000);
    return () => clearInterval(t);
  }, [active, runId, connected, reload]);

  return { run, setRun, reload, connected, error };
}
