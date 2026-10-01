import { useCallback, useEffect, useRef, useState } from "react";
import { monitorApi, LiveEvent, LiveFilter, LivePerson, LiveSnapshot } from "../api/monitor";

/**
 * Live presence for the Realtime page: SSE first (with a single-use ticket, so the JWT
 * never goes into a URL), polling every 10 s as the fallback. Diffs are merged into
 * a keyed map, so a busy roster does not re-render from scratch every two seconds.
 */
export interface LiveState {
  snapshot: Omit<LiveSnapshot, "people"> | null;
  people: LivePerson[];
  events: LiveEvent[];
  mode: "connecting" | "live" | "polling" | "error";
  updatedAt: number;
}

const MAX_EVENTS = 60;

export function useLiveStream(filter: LiveFilter) {
  const [state, setState] = useState<LiveState>({ snapshot: null, people: [], events: [], mode: "connecting", updatedAt: 0 });
  const peopleRef = useRef(new Map<string, LivePerson>());
  const filterKey = JSON.stringify(filter);

  const applySnapshot = useCallback((s: LiveSnapshot) => {
    peopleRef.current = new Map(s.people.map((p) => [p.key, p]));
    const { people: _people, events, ...rest } = s;
    void _people;
    setState((st) => ({
      ...st,
      snapshot: rest,
      people: [...peopleRef.current.values()],
      events: events ?? st.events,
      updatedAt: Date.now(),
    }));
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let poll: number | null = null;
    let closed = false;
    let retries = 0;
    const f = JSON.parse(filterKey) as LiveFilter;

    const startPolling = () => {
      if (poll || closed) return;
      setState((st) => ({ ...st, mode: "polling" }));
      const tick = async () => {
        try {
          applySnapshot(await monitorApi.live(f));
        } catch {
          setState((st) => ({ ...st, mode: "error" }));
        }
      };
      void tick();
      poll = window.setInterval(tick, 10_000);
    };

    const connect = async () => {
      if (closed) return;
      if (typeof EventSource === "undefined") return startPolling();
      try {
        const ticket = await monitorApi.liveTicket();
        if (closed) return;
        es = new EventSource(monitorApi.streamUrl(ticket, f));
        es.onmessage = (m) => {
          retries = 0;
          let msg: any;
          try {
            msg = JSON.parse(m.data);
          } catch {
            return;
          }
          if (msg.type === "snapshot") {
            applySnapshot(msg);
            setState((st) => ({ ...st, mode: "live" }));
          } else if (msg.type === "diff") {
            for (const k of msg.remove as string[]) peopleRef.current.delete(k);
            for (const p of msg.upsert as LivePerson[]) peopleRef.current.set(p.key, p);
            setState((st) => ({ ...st, people: [...peopleRef.current.values()], updatedAt: Date.now() }));
          } else if (msg.type === "counts") {
            setState((st) =>
              st.snapshot
                ? { ...st, snapshot: { ...st.snapshot, counts: msg.counts, last5: msg.last5, top_features: msg.top_features, minutes: msg.minutes }, updatedAt: Date.now() }
                : st,
            );
          } else if (msg.type === "event") {
            setState((st) => ({ ...st, events: [msg.event as LiveEvent, ...st.events].slice(0, MAX_EVENTS) }));
          }
        };
        es.onerror = () => {
          // The ticket is single-use: a reconnect needs a fresh one, so we handle it.
          es?.close();
          es = null;
          if (closed) return;
          retries++;
          if (retries > 3) startPolling();
          else window.setTimeout(connect, 2_000 * retries);
        };
      } catch {
        startPolling();
      }
    };

    void connect();
    return () => {
      closed = true;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [filterKey, applySnapshot]);

  return state;
}
