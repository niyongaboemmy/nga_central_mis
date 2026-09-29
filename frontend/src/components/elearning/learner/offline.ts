import { useEffect, useState } from "react";
import { API_BASE_URL, apiService } from "../../../services/api";
import { getToken } from "../../../utils/auth";
import { registerAppServiceWorker } from "../../../reminders/pwa";

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

/**
 * Fire-and-forget signal that must survive the page going away (unload, tab close,
 * bfcache). `fetch` with `keepalive` is the transport the browser is required to flush
 * after the document is gone — a normal fetch gets cancelled.
 *
 * Deliberately NOT `sendBeacon`: it cannot set an Authorization header, and the only way
 * to authenticate it would be a JWT in the query string, which this app's auth middleware
 * accepts on GET only — and which would end up in every access log. A missed departure is
 * harmless anyway: presence then expires on the server's own stale timer instead.
 */
export function sendDeparture(url: string): void {
  const token = getToken();
  if (!token) return;
  try {
    void fetch(`${API_BASE_URL}${url}`, {
      method: "POST",
      keepalive: true,
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  } catch {
    /* the server's stale sweep is the backstop */
  }
}

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

/**
 * The learner offline cache now lives inside the app-wide worker (public/sw.js
 * importScripts elearning-sw.js): only one service worker can control "/", and
 * the installable NGA app needs it for reminders too. Kept as a named entry
 * point so learner pages still make sure it is registered.
 */
export function registerLearnerServiceWorker() {
  void registerAppServiceWorker();
}
