import React from "react";
import { AlertTriangle, CalendarClock, CircleSlash, GraduationCap, Plus } from "lucide-react";
import type { LessonNotePlacement, NoteReach } from "../../../api/lessonNotes";

/** "Week 3 — Forms and inputs" → "Week 3" (the full title is in the tooltip and the panel). */
export const shortWeek = (title: string) => title.split(" — ")[0].split(" - ")[0].trim() || title;

export const formatOpensAt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/**
 * One chip that answers "can students read this note?" — and is the button that opens the
 * note's e-learning panel. Colour follows the state: green live, blue scheduled, amber
 * blocked (with the reason), dashed when it isn't on the course yet.
 */
const NoteReachChip: React.FC<{
  reach?: NoteReach;
  placement?: LessonNotePlacement | null;
  hasCourse: boolean;
  onClick: () => void;
  size?: "sm" | "md";
}> = ({ reach, placement, hasCourse, onClick, size = "sm" }) => {
  const state = reach?.state ?? (placement ? "LIVE" : "OFF_COURSE");
  const week = placement ? shortWeek(placement.section_title) : "";
  const text = size === "sm" ? "text-[11px]" : "text-xs";
  const base = `inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full ${text} font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50`;

  let className: string;
  let icon: React.ReactNode;
  let label: React.ReactNode;
  let title: string;

  if (state === "LIVE") {
    className = "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-400/10 border border-emerald-200 dark:border-emerald-400/25 hover:bg-emerald-100 dark:hover:bg-emerald-400/20";
    icon = <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>;
    label = <span className="truncate">Live · {week}</span>;
    title = `Students can read it — ${placement?.section_title}`;
  } else if (state === "SCHEDULED") {
    className = "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-400/10 border border-blue-200 dark:border-blue-400/25 hover:bg-blue-100 dark:hover:bg-blue-400/20";
    icon = <CalendarClock className="w-3 h-3 flex-shrink-0" />;
    label = <span className="truncate">{week} · opens {reach?.opens_at ? formatOpensAt(reach.opens_at) : "soon"}</span>;
    title = `${placement?.section_title} — opens to students automatically`;
  } else if (state === "BLOCKED") {
    className = "text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/25 hover:bg-amber-100 dark:hover:bg-amber-400/20";
    icon = <AlertTriangle className="w-3 h-3 flex-shrink-0" />;
    label = <span className="truncate">{week} · {reach?.blocker || "not visible yet"}</span>;
    title = `On ${placement?.section_title}, but students can't open it yet — click to fix`;
  } else if (hasCourse) {
    className = "text-blue-700 dark:text-blue-300 bg-blue-50/60 dark:bg-blue-400/10 border border-dashed border-blue-300 dark:border-blue-400/30 hover:bg-blue-100 dark:hover:bg-blue-400/20 hover:border-solid";
    icon = <Plus className="w-3 h-3 flex-shrink-0" />;
    label = "Add to e-learning";
    title = "Choose the week students should read it in";
  } else {
    className = "text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1]";
    icon = <CircleSlash className="w-3 h-3 flex-shrink-0" />;
    label = "No course yet";
    title = "There is no e-learning course for this subject and class yet";
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      aria-haspopup="dialog"
      data-reach={state}
      className={`${base} ${className}`}
    >
      {icon}
      {label}
      {state !== "OFF_COURSE" && <GraduationCap className="w-3 h-3 flex-shrink-0 opacity-60" />}
    </button>
  );
};

export default NoteReachChip;
