import { useEffect, useState } from "react";
import { apiService } from "../../../services/api";

/**
 * Offline support for the learner (plan Phase 5): progress actions taken while offline are
 * queued in localStorage and replayed on reconnect; the service worker (public/elearning-sw.js)
 * keeps the last-opened course/items readable. Explicitly *not* offline authoring.
 */

const QUEUE_KEY = "elearning.offlineQueue";

interface QueuedAction {
  id: string;
  method: "post";
  url: string;
  body?: unknown;
  queued_at: number;
}

const read = (): QueuedAction[] => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
};
const write = (q: QueuedAction[]) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* ignore */
  }
};

export const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

/** Sends now, or queues when offline / the network fails. Resolves true when sent immediately. */
export async function sendOrQueue(url: string, body?: unknown): Promise<boolean> {
  if (isOnline()) {
    try {
      await apiService.post(url, body);
      return true;
    } catch (e: any) {
      // Only network failures are queued; a 4xx is a real answer and must not be retried forever.
      if (e?.response) throw e;
    }
  }
  write([...read(), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, method: "post", url, body, queued_at: Date.now() }]);
  return false;
}

/** Replays the queue in order; stops at the first network failure, drops 4xx responses. */
export async function flushQueue(): Promise<number> {
  const q = read();
  if (q.length === 0 || !isOnline()) return 0;
  let sent = 0;
  const remaining: QueuedAction[] = [];
  for (let i = 0; i < q.length; i += 1) {
    const a = q[i];
    try {
      await apiService.post(a.url, a.body);
      sent += 1;
    } catch (e: any) {
      if (e?.response) continue; // server answered — drop it
      remaining.push(...q.slice(i));
      break;
    }
  }
  write(remaining);
  return sent;
}

export const queuedCount = () => read().length;

/** `[online, queued]` — re-renders on connectivity changes and flushes the queue when back online. */
export function useOffline(): { online: boolean; queued: number } {
  const [online, setOnline] = useState(isOnline());
  const [queued, setQueued] = useState(queuedCount());
  useEffect(() => {
    const up = async () => {
      setOnline(true);
      await flushQueue();
      setQueued(queuedCount());
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    if (isOnline()) up();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return { online, queued };
}

/** Registers the learner service worker once (no-op in dev / unsupported browsers). */
export function registerLearnerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;
  navigator.serviceWorker.register("/elearning-sw.js", { scope: "/" }).catch(() => undefined);
}
