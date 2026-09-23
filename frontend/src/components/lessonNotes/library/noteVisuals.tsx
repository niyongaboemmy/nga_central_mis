import React from "react";

/**
 * Shared bits for the student library and the note reader.
 *
 * **One accent colour.** An earlier pass tinted every subject a different hue;
 * with three subjects on screen the page read as a fruit salad and nothing
 * looked like it belonged to the MIS. Subjects are told apart by their icon —
 * which the app already has a proper set for — and the only colour that carries
 * meaning is the brand blue, used for what is new and what is selected.
 */

/** "Advanced Mathematics" -> "AM". Two letters is enough to tell teachers apart. */
export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};

/* --------------------------------------------------------------------- time */

const DAY = 86_400_000;
export const NEW_FOR_DAYS = 7;

/** A note a teacher published this week is the thing a student came here for. */
export const isRecent = (iso: string): boolean =>
  Date.now() - new Date(iso).getTime() < NEW_FOR_DAYS * DAY;

/**
 * Short enough to sit in a card footer. `formatDistanceToNow` gives "about 2
 * months ago", which wraps and pushes the layout around; this stays terse and
 * switches to an absolute date once "days ago" stops being meaningful.
 */
export const shortWhen = (iso: string): string => {
  const then = new Date(iso);
  const diff = Date.now() - then.getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return then.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(then.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
};

/** The full timestamp, for a `title` tooltip on the terse one above. */
export const fullWhen = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/* ------------------------------------------------------------------ excerpt */

/**
 * The server builds the excerpt by stripping tags from the body, so a note that
 * opens with an "Overview" heading yields "Overview Good interface design…" on
 * every card. Drop a leading heading-ish word so the preview starts at the
 * sentence a student would actually read.
 */
const LEADING_HEADING =
  /^(overview|introduction|intro|summary|contents|objectives?|aims?|background)\b[\s:–—-]*/i;

export const cleanExcerpt = (excerpt: string | null | undefined): string =>
  (excerpt || "").replace(LEADING_HEADING, "").trim();

/* ---------------------------------------------------------------- highlight */

/** Splits text into matched/unmatched runs so search hits are visible in place. */
export const Highlight: React.FC<{ text: string; tokens: string[] }> = ({ text, tokens }) => {
  if (tokens.length === 0 || !text) return <>{text}</>;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
  if (escaped.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  const lowered = tokens.map((t) => t.toLowerCase());
  return (
    <>
      {parts.map((part, i) =>
        lowered.includes(part.toLowerCase()) ? (
          <mark
            key={i}
            className="rounded bg-accent-100 px-0.5 py-px text-inherit dark:bg-accent-500/25"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
};
