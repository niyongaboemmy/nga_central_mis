import { useEffect, useSyncExternalStore } from "react";
import api from "../services/api";
import type { Avatar } from "../api/users";

/**
 * Who looks like what: a page-wide directory of people's profile photos.
 *
 * Lists and detail views show faces without every endpoint carrying photo links: a
 * <UserAvatar userId> asks here, all the ids asked for during one render are sent as a
 * single POST /users/avatars/lookup, and the answers are kept for the session (a
 * person without a photo is remembered as `null`, so they are not asked about again).
 */
type Entry = Avatar | null;

const BATCH = 500;
const FLUSH_DELAY_MS = 16;

const cache = new Map<number, Entry>();
const queued = new Set<number>();
const inFlight = new Set<number>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

const emit = () => listeners.forEach((l) => l());
const validId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0;

async function flush() {
  timer = null;
  const ids = [...queued];
  queued.clear();
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    chunk.forEach((id) => inFlight.add(id));
    try {
      const res = await api.post<{ data?: { avatars?: Record<string, Avatar> } }>("/users/avatars/lookup", {
        user_ids: chunk,
      });
      const avatars = res.data?.data?.avatars ?? {};
      chunk.forEach((id) => cache.set(id, avatars[id] ?? null));
    } catch {
      // Initials are a fine fallback; don't hammer the API by retrying on every render.
      chunk.forEach((id) => cache.set(id, null));
    } finally {
      chunk.forEach((id) => inFlight.delete(id));
    }
  }
  emit();
}

/** Ask for someone's photo; answered asynchronously through subscribers. */
export function requestAvatar(id: number | null | undefined) {
  if (!validId(id) || cache.has(id) || queued.has(id) || inFlight.has(id)) return;
  queued.add(id);
  if (!timer) timer = setTimeout(flush, FLUSH_DELAY_MS);
}

/** Record photos already at hand (a payload that carried them, or your own after a change). */
export function primeAvatars(entries: Array<{ user_id: number; avatar?: Avatar | null }>) {
  let changed = false;
  for (const e of entries) {
    if (!validId(e.user_id) || e.avatar === undefined) continue;
    if (cache.get(e.user_id) !== e.avatar) {
      cache.set(e.user_id, e.avatar);
      changed = true;
    }
  }
  if (changed) emit();
}

export const getCachedAvatar = (id: number): Entry | undefined => cache.get(id);

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The person's photo: undefined while unknown, null when they have none. */
export function useUserAvatar(id: number | null | undefined): Entry | undefined {
  const snapshot = useSyncExternalStore(subscribe, () => (validId(id) ? cache.get(id) : undefined));
  useEffect(() => {
    requestAvatar(id);
  }, [id]);
  return snapshot;
}

export function _resetAvatarDirectoryForTests() {
  cache.clear();
  queued.clear();
  inFlight.clear();
  if (timer) clearTimeout(timer);
  timer = null;
}
