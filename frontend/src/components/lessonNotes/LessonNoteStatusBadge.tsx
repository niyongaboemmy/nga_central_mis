import React from "react";
import { Users, PencilLine } from "lucide-react";

interface Props {
  status: "DRAFT" | "PUBLISHED";
  size?: "sm" | "md";
}

// Single source of truth for how a note's status renders — used on the notes list,
// the per-subject notes tab, and the editor header, so "Draft" vs "Published" always
// looks and reads the same everywhere a teacher sees it.
const LessonNoteStatusBadge: React.FC<Props> = ({ status, size = "sm" }) => {
  const isPublished = status === "PUBLISHED";
  const sizeClasses = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  const Icon = isPublished ? Users : PencilLine;

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full ${sizeClasses} ${
        isPublished
          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      }`}
    >
      <Icon className="w-2.5 h-2.5" />
      {isPublished ? "Published" : "Draft"}
    </span>
  );
};

export default LessonNoteStatusBadge;
