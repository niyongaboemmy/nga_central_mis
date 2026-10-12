import { useEffect, useState } from "react";
import { mentorshipApi, MyMentorshipRole } from "../api/mentorship";

// Whether the signed-in user mentors anyone (or has a mentor) this year.
// Mentors are not only teachers — staff and admins can hold mentees too — so
// the "My Mentees" entry is driven by real assignments, not by a permission.
// One request per user and year, shared by every caller (sidebar, top-bar
// mentees button, search). It also carries the unread check-in count, so
// anything that changes that count calls refreshMentorshipRole() and every
// subscriber re-renders with the new badge.
let cached: { key: string; promise: Promise<MyMentorshipRole | null> } | null = null;
const listeners = new Set<() => void>();

export function loadMentorshipRole(userId: number, yearId?: number | null): Promise<MyMentorshipRole | null> {
  const key = `${userId}:${yearId ?? ""}`;
  if (!cached || cached.key !== key) {
    cached = {
      key,
      promise: mentorshipApi
        .getMyRole(yearId ?? undefined)
        .then((res) => (res as any).data?.data ?? null)
        .catch(() => {
          cached = null; // retry on the next mount
          return null;
        }),
    };
  }
  return cached.promise;
}

/** Drop the cached answer and tell every mounted hook to fetch it again. */
export function refreshMentorshipRole() {
  cached = null;
  listeners.forEach((fn) => fn());
}

/** `yearId` follows the top-bar period selector, so the menu matches the hub. */
export function useMentorshipRole(
  userId: number | null | undefined,
  yearId?: number | null,
): MyMentorshipRole | null {
  const [role, setRole] = useState<MyMentorshipRole | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);
  useEffect(() => {
    if (!userId) {
      setRole(null);
      return;
    }
    let alive = true;
    loadMentorshipRole(userId, yearId).then((r) => alive && setRole(r));
    return () => {
      alive = false;
    };
  }, [userId, yearId, version]);
  return role;
}
