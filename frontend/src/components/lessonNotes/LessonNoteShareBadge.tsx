import React from "react";
import { Send, EyeOff } from "lucide-react";

interface Props {
  shareCount: number;
  size?: "sm" | "md";
}

// Publishing a note only makes it *shareable* — students see nothing until the teacher
// actually shares it. That distinction was invisible everywhere in the UI, so notes sat
// published-but-unshared while teachers assumed their class could already read them.
// This badge is the single source of truth for "students can read this" and renders next
// to LessonNoteStatusBadge on every published note.
const LessonNoteShareBadge: React.FC<Props> = ({ shareCount, size = "sm" }) => {
  const isShared = shareCount > 0;
  const sizeClasses = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  const Icon = isShared ? Send : EyeOff;

  return (
    <span
      title={
        isShared
          ? "Students you shared this with can read it"
          : "Published, but not shared yet — no student can see this note"
      }
      className={`inline-flex items-center gap-1 font-medium rounded-full ${sizeClasses} ${
        isShared
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      }`}
    >
      <Icon className="w-2.5 h-2.5" />
      {isShared ? "Shared" : "Not shared"}
    </span>
  );
};

export default LessonNoteShareBadge;
