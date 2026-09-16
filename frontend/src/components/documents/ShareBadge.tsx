import React from "react";
import { type ShareRecipient } from "../../api/documents";
import { getInitials, getAvatarColor } from "./types";

const displayName = (u: ShareRecipient) =>
  u.first_name || u.last_name
    ? `${u.first_name || ""} ${u.last_name || ""}`.trim()
    : u.username;

interface ShareBadgeProps {
  count: number;
  sharedWith?: ShareRecipient[];
  onClick?: (e: React.MouseEvent) => void;
  variant: "grid" | "list";
}

/** Avatar-stack badge showing who a file/folder is shared with, not just a count. */
const ShareBadge: React.FC<ShareBadgeProps> = ({
  count,
  sharedWith,
  onClick,
  variant,
}) => {
  if (!count) return null;
  const shown = (sharedWith || []).slice(0, 3);
  const overflow = count - shown.length;
  const title =
    (sharedWith || []).map(displayName).join(", ") +
    (overflow > 0 ? `, +${overflow} more` : "");

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      title={`Shared with ${count} ${count === 1 ? "person" : "people"}: ${title}`}
      className={`flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors ${
        variant === "grid"
          ? "absolute top-2 right-2 pl-1 pr-2 py-1 shadow-sm"
          : "pl-1 pr-2 py-1 flex-shrink-0"
      }`}
    >
      <span className="flex items-center -space-x-1.5">
        {shown.length > 0
          ? shown.map((u) => (
              <span
                key={u.user_id}
                className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold ring-2 ring-white dark:ring-gray-800 ${getAvatarColor(
                  u.username,
                )}`}
              >
                {getInitials(u.first_name, u.last_name, u.username)}
              </span>
            ))
          : null}
      </span>
      {(overflow > 0 || shown.length === 0) && (
        <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
          {overflow > 0 ? `+${overflow}` : count}
        </span>
      )}
    </button>
  );
};

export default ShareBadge;
