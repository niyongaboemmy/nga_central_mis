import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Clock, FileText } from "lucide-react";
import { SharedNoteSummary, isPdfBackedNote } from "../../../api/lessonNotes";
import { useMotion } from "../../../design/motion";
import SubjectIcon from "../../elearning/ui/subjectIcons";
import { Highlight, cleanExcerpt, fullWhen, initialsOf, isRecent, shortWhen } from "./noteVisuals";

/** Reading time for prose, page count for a PDF. */
export const NoteLength: React.FC<{ note: SharedNoteSummary; className?: string }> = ({
  note,
  className = "",
}) =>
  isPdfBackedNote(note) ? (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <FileText className="w-3.5 h-3.5" aria-hidden />
      {note.page_count ? `${note.page_count} page${note.page_count === 1 ? "" : "s"}` : "PDF"}
    </span>
  ) : (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Clock className="w-3.5 h-3.5" aria-hidden />
      {note.reading_minutes || 1} min
    </span>
  );

/** Neutral tile — the icon identifies the subject, the colour does not. */
const SubjectTile: React.FC<{ subject: string; size?: "sm" | "md" | "lg" }> = ({
  subject,
  size = "md",
}) => {
  const box = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-7 w-7" : "h-10 w-10";
  const glyph = size === "lg" ? "h-6 w-6" : size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <span
      className={`${box} flex flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-200`}
      aria-hidden
    >
      <SubjectIcon subjectName={subject} className={glyph} />
    </span>
  );
};

export { SubjectTile };

/* ------------------------------------------------------------------ the card */

interface CardProps {
  note: SharedNoteSummary;
  tokens: string[];
  onOpen: (id: number) => void;
}

/**
 * One note in the library.
 *
 * Reads top to bottom the way a student scans: which subject, is it new, what
 * is it called, what is it about, who set it and how long it will take.
 */
const NoteCard: React.FC<CardProps> = ({ note, tokens, onOpen }) => {
  const m = useMotion();
  const fresh = isRecent(note.updated_at);
  const excerpt = cleanExcerpt(note.excerpt);

  return (
    <motion.button
      type="button"
      layout
      {...m("reveal")}
      onClick={() => onOpen(note.note_id)}
      aria-label={`Open ${note.title}`}
      className="el-card el-card-hover group flex h-full flex-col p-5 text-left focus:outline-none focus-visible:shadow-glow"
    >
      {/* The subject gets the whole first line. Sharing it with the reading time and
          a badge truncated names like "Web Application Development Using JavaS…". */}
      <div className="mb-3 flex items-center gap-2">
        <SubjectTile subject={note.subject_name} size="sm" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-500 dark:text-gray-400">
          <Highlight text={note.subject_name} tokens={tokens} />
        </span>
        {fresh && (
          <span className="flex-shrink-0 rounded-pill bg-brand-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            New
          </span>
        )}
      </div>

      <h3 className="line-clamp-2 text-[17px] font-semibold leading-snug tracking-tight text-gray-900 dark:text-white">
        <Highlight text={note.title} tokens={tokens} />
      </h3>

      {excerpt && (
        <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
          <Highlight text={excerpt} tokens={tokens} />
        </p>
      )}

      {/* Pinned, so every card in a row ends on the same line whatever the title length. */}
      <div className="mt-auto flex items-center gap-2 border-t border-gray-100 pt-3.5 dark:border-white/[0.06]">
        <span
          aria-hidden
          className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-pill bg-gray-100 text-[9px] font-bold text-gray-500 dark:bg-white/[0.08] dark:text-gray-300"
        >
          {initialsOf(note.teacher_name || "?")}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-gray-500 dark:text-gray-400">
          <Highlight text={note.teacher_name} tokens={tokens} />
        </span>
        <span className="flex flex-shrink-0 items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
          <NoteLength note={note} />
          <span aria-hidden>·</span>
          <span title={fullWhen(note.updated_at)} className="tabular-nums">
            {shortWhen(note.updated_at)}
          </span>
        </span>
        <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
      </div>
    </motion.button>
  );
};

/* ------------------------------------------------------------------ list row */

/**
 * The same note as a full-width row.
 *
 * Grid is for browsing — the excerpt earns its space when you do not know what
 * you are looking for. List is for finding: four times as many notes on screen,
 * titles aligned in one column so the eye scans straight down.
 */
export const NoteListRow: React.FC<CardProps> = ({ note, tokens, onOpen }) => {
  const fresh = isRecent(note.updated_at);
  const excerpt = cleanExcerpt(note.excerpt);

  return (
    <button
      type="button"
      onClick={() => onOpen(note.note_id)}
      aria-label={`Open ${note.title}`}
      className="group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 dark:hover:bg-white/[0.04] dark:focus-visible:bg-white/[0.04]"
    >
      <SubjectTile subject={note.subject_name} size="sm" />

      <span className="min-w-0 flex-1 md:flex-[0_0_34%]">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            <Highlight text={note.title} tokens={tokens} />
          </span>
          {fresh && (
            <span className="flex-shrink-0 rounded-pill bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              New
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
          <Highlight text={note.subject_name} tokens={tokens} />
        </span>
      </span>

      <span className="hidden min-w-0 flex-1 truncate text-[13px] text-gray-500 dark:text-gray-400 md:block">
        <Highlight text={excerpt} tokens={tokens} />
      </span>

      <span className="hidden flex-shrink-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400 sm:flex">
        <span
          aria-hidden
          className="grid h-6 w-6 place-items-center rounded-pill bg-gray-100 text-[9px] font-bold text-gray-500 dark:bg-white/[0.08] dark:text-gray-300"
        >
          {initialsOf(note.teacher_name || "?")}
        </span>
        <span className="hidden w-28 truncate lg:block">
          <Highlight text={note.teacher_name} tokens={tokens} />
        </span>
      </span>

      <span className="flex w-24 flex-shrink-0 items-center justify-end gap-2 text-[11px] text-gray-400 dark:text-gray-500">
        <NoteLength note={note} />
      </span>
      <span
        className="hidden w-20 flex-shrink-0 text-right text-[11px] tabular-nums text-gray-400 dark:text-gray-500 sm:block"
        title={fullWhen(note.updated_at)}
      >
        {shortWhen(note.updated_at)}
      </span>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
    </button>
  );
};

/* ------------------------------------------------------------------ the hero */

/**
 * The page's focal point: the newest note.
 *
 * Brand blue, not a per-subject hue — it is the one thing on the page that is
 * meant to be louder than everything else, so it uses the app's own accent.
 */
export const HeroNoteCard: React.FC<{
  note: SharedNoteSummary;
  eyebrow: string;
  onOpen: (id: number) => void;
}> = ({ note, eyebrow, onOpen }) => {
  const m = useMotion();
  const excerpt = cleanExcerpt(note.excerpt);

  return (
    <motion.section {...m("reveal")}>
      {/* Horizontal and full width. As a tall two-column block it had a void in the
          middle: three short lines of content stretched over 300px of card. */}
      <div className="flex flex-col gap-5 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 via-brand-50/40 to-white p-6 shadow-soft dark:border-brand-500/20 dark:from-brand-500/[0.12] dark:via-brand-500/[0.05] dark:to-white/[0.02] md:flex-row md:items-center">
        <SubjectTile subject={note.subject_name} size="lg" />

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-200">
            {eyebrow}
          </p>
          <h2 className="mt-1 line-clamp-2 text-2xl font-bold leading-tight tracking-tight text-gray-900 dark:text-white">
            {note.title}
          </h2>
          {excerpt && (
            <p className="mt-1.5 line-clamp-2 max-w-3xl text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {excerpt}
            </p>
          )}
          <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span className="truncate font-medium">{note.subject_name}</span>
            {note.teacher_name && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{note.teacher_name}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <NoteLength note={note} />
            <span aria-hidden>·</span>
            <span title={fullWhen(note.updated_at)}>{shortWhen(note.updated_at)}</span>
          </p>
        </div>

        <motion.button
          {...m("tap")}
          onClick={() => onOpen(note.note_id)}
          className="inline-flex min-h-[46px] flex-shrink-0 items-center justify-center gap-1.5 rounded-pill bg-brand-500 px-7 text-sm font-semibold text-white shadow-soft hover:bg-brand-600 focus:outline-none focus-visible:shadow-glow"
        >
          Read note <ArrowRight className="h-4 w-4" />
        </motion.button>
      </div>
    </motion.section>
  );
};

/* ------------------------------------------------------------------ side rail */

/** The compact "what else landed" list beside the hero. */
export const RecentNotesPanel: React.FC<{
  notes: SharedNoteSummary[];
  onOpen: (id: number) => void;
  title: string;
  icon: React.ReactNode;
  emptyBody: string;
}> = ({ notes, onOpen, title, icon, emptyBody }) => {
  const m = useMotion();
  return (
    <motion.section {...m("reveal")} className="el-card flex flex-col p-5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {icon} {title}
      </h3>
      {notes.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{emptyBody}</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 dark:divide-white/[0.06]">
          {notes.map((n) => (
            <li key={n.note_id}>
              <button
                onClick={() => onOpen(n.note_id)}
                className="-mx-2 flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 dark:hover:bg-white/[0.05] dark:focus-visible:bg-white/[0.05]"
              >
                <SubjectTile subject={n.subject_name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-gray-800 dark:text-gray-100">
                    {n.title}
                  </span>
                  <span className="block truncate text-[11px] text-gray-400 dark:text-gray-500">
                    {n.subject_name} · {shortWhen(n.updated_at)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
};

export default NoteCard;
