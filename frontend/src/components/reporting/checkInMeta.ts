import type { CheckInCategory, CheckInStatus, ValidationStatus } from "../../api/mentorship";

// Mentor-side labels and colours for every check-in category. The inbox used to
// know only four of the nine (GENERAL/APPRECIATION/CONCERN/REQUEST_MEETING), so
// academic, behaviour, attendance, wellbeing and "other" check-ins showed an
// empty, colourless badge. Colours match the student's picker in MyMentor.tsx.
export const CHECKIN_CATEGORY: Record<CheckInCategory, { label: string; className: string }> = {
  GENERAL: { label: "General", className: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300" },
  APPRECIATION: { label: "Appreciation", className: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" },
  ACADEMIC: { label: "Academic", className: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400" },
  BEHAVIORAL: { label: "Behaviour", className: "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400" },
  ATTENDANCE: { label: "Attendance", className: "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400" },
  WELLBEING: { label: "Wellbeing", className: "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400" },
  CONCERN: { label: "Concern", className: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400" },
  REQUEST_MEETING: { label: "Meeting request", className: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" },
  OTHER: { label: "Other", className: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" },
};

export const categoryMeta = (c: string | null | undefined) =>
  CHECKIN_CATEGORY[c as CheckInCategory] ?? CHECKIN_CATEGORY.OTHER;

export const CHECKIN_STATUS_LABEL: Record<CheckInStatus, string> = {
  NEW: "Unread",
  ACKNOWLEDGED: "Seen",
  ADDRESSED: "Dealt with",
};

export const VALIDATION_LABEL: Record<ValidationStatus, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" },
  APPROVED: { label: "Approved", className: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" },
  REJECTED: { label: "Rejected", className: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400" },
};

/** "12 Oct 2026" from a YYYY-MM-DD (or ISO) date; the input itself if unparsable. */
export const formatDay = (value: string | null | undefined) => {
  if (!value) return "";
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
