import React, { useEffect, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { searchUsers, type UserSearchResult } from "../../api/users";
import type { ActivityAssignee } from "../../api/calendar";

/** Display name for a user, falling back to username/email when the profile
 *  has no name on it. */
export const assigneeLabel = (
  u: Pick<ActivityAssignee, "first_name" | "last_name"> & {
    username?: string;
    email?: string;
  },
): string =>
  `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() ||
  u.username ||
  u.email ||
  "Unnamed user";

interface ActivityAssigneePickerProps {
  value: ActivityAssignee[];
  onChange: (next: ActivityAssignee[]) => void;
  disabled?: boolean;
}

/**
 * Optional "Assigned to" control for a custom activity.
 *
 * Type to search staff (debounced against /users/search), pick any number of
 * them, remove with the chip's ×. Leaving it empty is fine — an unassigned
 * activity is still a valid class-group / school-wide event.
 */
const ActivityAssigneePicker: React.FC<ActivityAssigneePickerProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  // Debounced search; stale responses are dropped so fast typing never shows
  // results for an earlier query.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchUsers(q);
        if (id !== requestId.current) return;
        setResults(found);
        setHighlighted(0);
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Close the suggestion list on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const chosen = new Set(value.map((u) => u.user_id));
  const options = results.filter((u) => !chosen.has(u.user_id));

  const add = (u: UserSearchResult) => {
    onChange([
      ...value,
      { user_id: u.user_id, first_name: u.first_name, last_name: u.last_name },
    ]);
    setQuery("");
    setResults([]);
    setOpen(false);
  };
  const remove = (userId: number) =>
    onChange(value.filter((u) => u.user_id !== userId));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && query === "" && value.length > 0) {
      remove(value[value.length - 1].user_id);
      return;
    }
    if (!open || options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      add(options[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const listboxId = "activity-assignee-options";

  return (
    <div ref={rootRef} className="relative">
      <div
        className={`flex flex-wrap items-center gap-1.5 w-full px-3 py-2 min-h-[3rem] text-sm border-2 rounded-xl transition-all bg-gray-50 dark:bg-gray-700/60 border-gray-200 dark:border-gray-600 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/30 ${
          disabled ? "opacity-60 pointer-events-none" : ""
        }`}
      >
        {value.map((u) => (
          <span
            key={u.user_id}
            data-testid="assignee-chip"
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 text-xs font-medium"
          >
            {assigneeLabel(u)}
            <button
              type="button"
              aria-label={`Remove ${assigneeLabel(u)}`}
              onClick={() => remove(u.user_id)}
              className="w-4 h-4 rounded-full inline-flex items-center justify-center hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1.5 flex-1 min-w-[8rem]">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            role="combobox"
            aria-label="Assign staff"
            aria-expanded={open && options.length > 0}
            aria-controls={listboxId}
            aria-autocomplete="list"
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={
              value.length === 0
                ? "Optional — search staff by name"
                : "Add another…"
            }
            className="flex-1 min-w-0 bg-transparent outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 py-1"
          />
        </div>
      </div>

      {open && query.trim().length >= 2 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl py-1"
        >
          {searching && options.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-400">Searching…</li>
          )}
          {!searching && options.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-400">
              No staff match “{query.trim()}”
            </li>
          )}
          {options.map((u, i) => (
            <li
              key={u.user_id}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => add(u)}
              className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                i === highlighted
                  ? "bg-emerald-50 dark:bg-emerald-900/30"
                  : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              <UserPlus className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-gray-900 dark:text-white">
                  {assigneeLabel(u)}
                </span>
                <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                  {[u.user_type, u.email].filter(Boolean).join(" · ")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ActivityAssigneePicker;
