import { useEffect, useRef, useState } from "react";
import { API_BASE_URL, apiService } from "../../../services/api";
import { getToken } from "../../../utils/auth";

export interface ReadingPosition {
  scroll_pct: number;
  heading: string | null;
  at: number;
}

export interface Watcher {
  user_id: number;
  name: string;
  /** Where in the page they are, once their reader has reported it. */
  position?: ReadingPosition | null;
  item_id: number | null;
  item_title: string | null;
  item_type: string | null;
  section_id: number | null;
  section_title: string | null;
  state: string;
  seconds_spent: number;
  since: number;
  last_seen: number;
  /** Pings are current — they really are on this page now, not idling in another tab. */
  active: boolean;
  /** Seconds on this item in this visit (lifetime total is `seconds_spent`). */
  dwell_seconds: number;
}

/** Watchers rolled up by the page they are on — see the backend's TopicPresence. */
export interface TopicPresence {
  item_id: number | null;
  item_title: string | null;
  item_type: string | null;
  section_id: number | null;
  section_title: string | null;
  viewers: number;
  active_viewers: number;
  readers: {
    user_id: number;
    name: string;
    seconds_spent: number;
    active: boolean;
    position?: ReadingPosition | null;
  }[];
  max_seconds: number;
}

export interface LiveProgress {
  user_id: number;
  name: string;
  item_id: number;
  item_title: string;
  item_type: string;
  section_id: number;
  section_title: string | null;
  verb: "started" | "completed" | "scored";
  score_pct?: number | null;
  at: number;
}

/**
 * Live class activity for the teacher. Prefers Server-Sent Events (pushed the instant a
 * student opens or finishes something) and falls back to polling the same snapshot every
 * 15 s when EventSource can't connect — a proxy that strips streaming should degrade, not
 * break. `enabled` lets the caller stop both while the panel is closed.
 */
export function useCourseLive(courseId: number, enabled: boolean) {
  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [topics, setTopics] = useState<TopicPresence[]>([]);
  const [recent, setRecent] = useState<LiveProgress[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !courseId) return;
    let poll: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const snapshot = () =>
      apiService
        .get(`/elearning/courses/${courseId}/live/snapshot`)
        .then((r) => {
          if (closed) return;
          setWatchers(r.data.data.watchers || []);
          setTopics(r.data.data.topics || []);
          setRecent(r.data.data.recent || []);
        })
        .catch(() => undefined);

    const startPolling = () => {
      if (poll || closed) return;
      snapshot();
      poll = setInterval(snapshot, 15_000);
    };

    // EventSource can't send headers, so the session rides as ?token= (the same fallback
    // the auth middleware already allows for <img>/<a> style GETs).
    const token = getToken();
    if (typeof EventSource !== "undefined" && token) {
      const es = new EventSource(
        `${API_BASE_URL}/elearning/courses/${courseId}/live?token=${encodeURIComponent(token)}`,
      );
      sourceRef.current = es;
      es.onopen = () => {
        if (closed) return;
        setConnected(true);
        if (poll) {
          clearInterval(poll);
          poll = null;
        }
      };
      es.onmessage = (e) => {
        if (closed) return;
        try {
          const d = JSON.parse(e.data);
          if (Array.isArray(d.watchers)) setWatchers(d.watchers);
          if (Array.isArray(d.topics)) setTopics(d.topics);
          if (Array.isArray(d.recent)) setRecent(d.recent);
          if (d.progress)
            setRecent((r) =>
              [
                d.progress,
                ...r.filter(
                  (x) =>
                    !(
                      x.item_id === d.progress.item_id &&
                      x.user_id === d.progress.user_id &&
                      x.at === d.progress.at
                    ),
                ),
              ].slice(0, 30),
            );
        } catch {
          /* ignore a malformed frame */
        }
      };
      es.onerror = () => {
        setConnected(false);
        // The browser retries on its own; polling covers the gap (and the case where the
        // stream can never be established).
        startPolling();
      };
    } else {
      startPolling();
    }

    return () => {
      closed = true;
      if (poll) clearInterval(poll);
      sourceRef.current?.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [courseId, enabled]);

  return { watchers, topics, recent, connected };
}
