import { useEffect, useState } from "react";
import { mentorshipApi, MyMentorshipRole } from "../api/mentorship";

// Whether the signed-in user mentors anyone (or has a mentor) this year.
// Mentors are not only teachers — staff and admins can hold mentees too — so
// the "My Mentees" entry is driven by real assignments, not by a permission.
// One request per user and year, shared by every caller.
let cached: { key: string; promise: Promise<MyMentorshipRole | null> } | null = null;

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

/** `yearId` follows the top-bar period selector, so the menu matches the hub. */
export function useMentorshipRole(
  userId: number | null | undefined,
  yearId?: number | null,
): MyMentorshipRole | null {
  const [role, setRole] = useState<MyMentorshipRole | null>(null);
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
  }, [userId, yearId]);
  return role;
}
