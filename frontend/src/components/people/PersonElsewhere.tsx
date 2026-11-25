/**
 * "Find a person who already has an account in another school": the one look for it
 * (TENANT_MANAGEMENT_UI_CONSISTENCY_PLAN.md F11). Used by the platform console
 * (School detail → Admins → Add existing person) and by Create user in a school.
 *
 * Presentational only. Each caller keeps its own search, because the rules differ on
 * purpose: the platform searches every school by any part of a name, while a school can
 * only look up an exact e-mail or username in other schools.
 */
import React from "react";
import { ChevronRight, School, Search } from "lucide-react";
import { accent, surface } from "../../design/surfaces";

/** Shape shared by api/users.ts and api/tenantMgmt.ts PersonElsewhere. */
export interface PersonElsewhereLike {
  tid: number;
  schoolName: string;
  userId: number;
  name: string;
  email: string | null;
  username: string;
  roles: string[];
  alreadyInTarget: boolean;
}

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export const personInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export const PersonAvatar: React.FC<{ name: string; picked?: boolean; size?: "md" | "lg" }> = ({ name, picked, size = "md" }) => (
  <span
    className={cx(
      "flex shrink-0 items-center justify-center rounded-full font-bold",
      size === "lg" ? "h-12 w-12 text-base" : "h-10 w-10 text-sm",
      picked ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    )}
    aria-hidden
  >
    {personInitials(name)}
  </span>
);

/** Search input with a leading icon; `action` sits to its right (e.g. a Find button). */
export const PersonSearchField: React.FC<{
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  action?: React.ReactNode;
}> = ({ value, onChange, label, placeholder, autoFocus, onEnter, action }) => (
  <div className="flex gap-2">
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        autoFocus={autoFocus}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder={placeholder}
        className={cx(surface.input, "pl-9")}
      />
    </div>
    {action}
  </div>
);

const Meta: React.FC<{ p: PersonElsewhereLike }> = ({ p }) => (
  <span className="flex flex-wrap gap-x-3 text-xs text-gray-600 dark:text-gray-400">
    <span className="inline-flex items-center gap-1">
      <School className="h-3 w-3" aria-hidden />
      {p.schoolName}
    </span>
    {p.email && <span className="truncate">{p.email}</span>}
    {p.roles.length > 0 && <span>{p.roles.join(", ")}</span>}
  </span>
);

/**
 * People found. Without `pickLabel` the whole row is the button (named after the person);
 * with it, each row gets a small button carrying that label. `onTint`: the list sits on a
 * tinted panel, so rows are white tiles instead of divided rows. Never one outlined box per row.
 */
export const PersonResults: React.FC<{
  people: PersonElsewhereLike[];
  onPick: (p: PersonElsewhereLike) => void;
  pickLabel?: string;
  alreadyLabel?: string;
  label?: string;
  onTint?: boolean;
  className?: string;
}> = ({ people, onPick, pickLabel, alreadyLabel = "Already here", label = "People found", onTint, className }) => (
  <ul className={cx(onTint ? "space-y-2" : cx("divide-y", surface.divide), className)} aria-label={label}>
    {people.map((p) => {
      const row = (
        <>
          <PersonAvatar name={p.name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">{p.name}</span>
            <Meta p={p} />
          </span>
        </>
      );
      const tile = onTint ? "rounded-xl bg-white p-3 dark:bg-gray-900/50" : "px-2 py-2.5";
      return (
        <li key={`${p.tid}-${p.userId}`}>
          {pickLabel ? (
            <div className={cx("flex flex-wrap items-center gap-3", tile)}>
              {row}
              {p.alreadyInTarget ? (
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{alreadyLabel}</span>
              ) : (
                <button type="button" onClick={() => onPick(p)} className={cx("rounded-full px-3 py-1.5 text-xs font-semibold", accent.solid, accent.focus)}>
                  {pickLabel}
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={p.alreadyInTarget}
              onClick={() => onPick(p)}
              className={cx("flex w-full items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60", tile, surface.insetHover, accent.focus)}
            >
              {row}
              {p.alreadyInTarget ? (
                <span className="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400">{alreadyLabel}</span>
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              )}
            </button>
          )}
        </li>
      );
    })}
  </ul>
);

/** Loading rows while a search runs. */
export const PersonResultsSkeleton: React.FC<{ rows?: number }> = ({ rows = 2 }) => (
  <ul className="space-y-2" role="status" aria-busy="true" aria-label="Searching">
    {Array.from({ length: rows }).map((_, i) => (
      <li key={i} className="flex items-center gap-3 px-2 py-2.5">
        <span className={cx("h-10 w-10 shrink-0 !rounded-full", surface.skeleton)} />
        <span className="flex-1 space-y-2">
          <span className={cx("block h-3.5 w-40", surface.skeleton)} />
          <span className={cx("block h-3 w-56 max-w-full", surface.skeleton)} />
        </span>
      </li>
    ))}
  </ul>
);

/** The chosen person: a blue tint, no outline; `children` is the action (Change / Create new instead). */
export const PickedPerson: React.FC<{ person: PersonElsewhereLike; detail: React.ReactNode; note?: React.ReactNode; children?: React.ReactNode }> = ({ person, detail, note, children }) => (
  <div className="flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 p-3 dark:bg-blue-500/10">
    <PersonAvatar name={person.name} picked />
    <div className="min-w-0 flex-1">
      <p className="truncate font-semibold text-gray-900 dark:text-white">{person.name}</p>
      <p className="truncate text-xs text-gray-600 dark:text-gray-300">{detail}</p>
      {note && <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{note}</p>}
    </div>
    {children}
  </div>
);
