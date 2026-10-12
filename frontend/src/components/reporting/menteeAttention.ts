import type { AssignedStudent } from "../../api/mentorship";

/** Who needs the mentor first: unread messages, then open follow-ups, then no recent session. */
export const attentionRank = (s: AssignedStudent) =>
  (s.new_checkins ? 0 : 4) + (s.follow_up_required ? 0 : 2) + (s.overdue ? 0 : 1);

export const sortByAttention = (list: AssignedStudent[]) =>
  [...list].sort(
    (a, b) =>
      attentionRank(a) - attentionRank(b) ||
      `${a.first_name ?? ""} ${a.last_name ?? ""}`.localeCompare(`${b.first_name ?? ""} ${b.last_name ?? ""}`),
  );
