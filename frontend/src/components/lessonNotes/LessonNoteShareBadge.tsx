import React from "react";
import { Users } from "lucide-react";

interface Props {
  shareCount: number;
  size?: "sm" | "md";
}

// Publishing a note is what makes it readable: the class it was written for and everyone
// enrolled in its subject can see it as soon as it goes live (see hasNaturalAudienceAccess
// in lessonNoteController). Shares only ever widen that audience, so this badge reports who
// can read the note rather than whether a share row happens to exist.
const LessonNoteShareBadge: React.FC<Props> = ({ shareCount, size = "sm" }) => {
  const sizeClasses = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";

  return (
    <span
      title={
        shareCount > 0
          ? `Visible to this note's class and enrolled students, plus ${shareCount} extra share${shareCount === 1 ? "" : "s"}`
          : "Visible to this note's class and everyone enrolled in the subject"
      }
      className={`inline-flex items-center gap-1 font-medium rounded-full ${sizeClasses} bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300`}
    >
      <Users className="w-2.5 h-2.5" />
      {shareCount > 0 ? `Students can view · +${shareCount}` : "Students can view"}
    </span>
  );
};

export default LessonNoteShareBadge;
