/** Shared visual language for the student reading experience (library cards + reader).
 *
 *  Subject colours are derived deterministically from the subject name rather than stored,
 *  so the same subject always looks the same across the library and the reader without any
 *  schema change. Every class string is written out in full because Tailwind's JIT scanner
 *  can't resolve interpolated class names. */

export interface SubjectAccent {
  /** Small pill behind the subject name. */
  chip: string;
  /** Same pill when it's an active filter. */
  chipActive: string;
  /** 6px status dot. */
  dot: string;
  /** Top edge bar on a card. */
  bar: string;
  /** Teacher initial avatar. */
  avatar: string;
  /** Reader header gradient. */
  gradient: string;
}

const PALETTE: SubjectAccent[] = [
  {
    chip: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    chipActive: "bg-blue-600 text-white",
    dot: "bg-blue-500",
    bar: "bg-gradient-to-r from-blue-500 to-blue-400",
    avatar: "bg-blue-500",
    gradient: "from-blue-600 to-indigo-600",
  },
  {
    chip: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    chipActive: "bg-violet-600 text-white",
    dot: "bg-violet-500",
    bar: "bg-gradient-to-r from-violet-500 to-violet-400",
    avatar: "bg-violet-500",
    gradient: "from-violet-600 to-purple-600",
  },
  {
    chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    chipActive: "bg-emerald-600 text-white",
    dot: "bg-emerald-500",
    bar: "bg-gradient-to-r from-emerald-500 to-emerald-400",
    avatar: "bg-emerald-500",
    gradient: "from-emerald-600 to-teal-600",
  },
  {
    chip: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    chipActive: "bg-amber-500 text-white",
    dot: "bg-amber-500",
    bar: "bg-gradient-to-r from-amber-500 to-amber-400",
    avatar: "bg-amber-500",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    chip: "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    chipActive: "bg-rose-600 text-white",
    dot: "bg-rose-500",
    bar: "bg-gradient-to-r from-rose-500 to-rose-400",
    avatar: "bg-rose-500",
    gradient: "from-rose-600 to-pink-600",
  },
  {
    chip: "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    chipActive: "bg-cyan-600 text-white",
    dot: "bg-cyan-500",
    bar: "bg-gradient-to-r from-cyan-500 to-cyan-400",
    avatar: "bg-cyan-500",
    gradient: "from-cyan-600 to-sky-600",
  },
];

export const subjectAccent = (subject: string): SubjectAccent => {
  let hash = 0;
  for (let i = 0; i < subject.length; i++) hash = (hash * 31 + subject.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
};
