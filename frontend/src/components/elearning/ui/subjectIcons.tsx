import React from "react";
import {
  Binary,
  BookOpen,
  Briefcase,
  Calculator,
  Code2,
  Database,
  Dumbbell,
  FlaskConical,
  Globe2,
  HeartPulse,
  Languages,
  Monitor,
  Network,
  PenTool,
  Sprout,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Subject icons, drawn from the same line-icon family as the rest of the app.
 *
 * Emoji were doing this job before: they render differently on every platform (Apple's are
 * glossy 3D, Windows' are flat, Android's differ again), they ignore the theme and the
 * subject colour, they can't be sized reliably, and a teacher typing one into a text field
 * had no idea which ones existed. These are real components — one stroke weight, currentColor,
 * and a picker that shows the whole set.
 */
export interface SubjectIconDef {
  /** Stored in Course.icon (VARCHAR 16). Stable — never rename a key in use. */
  key: string;
  label: string;
  Icon: LucideIcon;
  /** Matched against the subject name when the teacher hasn't chosen one. */
  match: RegExp;
}

// Order is the matching order: a specific subject must be listed before a broader one, or
// "Apply Basic Database Development" would be caught by the programming matcher.
export const SUBJECT_ICONS: SubjectIconDef[] = [
  { key: "database", label: "Databases", Icon: Database, match: /database|sql|data manage|information system/i },
  { key: "network", label: "Networking", Icon: Network, match: /network|internet|telecom|cisco|server/i },
  { key: "design", label: "Design", Icon: PenTool, match: /design|graphic|draw|art|multimedia|animation/i },
  { key: "code", label: "Programming", Icon: Code2, match: /program|coding|software|web|develop|php|java|python|script/i },
  { key: "computer", label: "Computers", Icon: Monitor, match: /computer|ict|digital|hardware|operating system/i },
  { key: "math", label: "Mathematics", Icon: Calculator, match: /math|calcul|algebra|geometr|statis|numer/i },
  { key: "science", label: "Science", Icon: FlaskConical, match: /physic|chem|biolog|science|laborator/i },
  { key: "language", label: "Language", Icon: Languages, match: /english|french|kinyarwanda|swahili|language|literature|communicat/i },
  { key: "business", label: "Business", Icon: Briefcase, match: /entrepreneur|business|account|finance|econom|market|manage/i },
  { key: "engineering", label: "Engineering", Icon: Wrench, match: /electr|mechan|engineer|construct|build|weld|plumb|automot|machin/i },
  { key: "agriculture", label: "Agriculture", Icon: Sprout, match: /agri|farm|crop|animal|veterin|forest|environment/i },
  { key: "hospitality", label: "Hospitality", Icon: UtensilsCrossed, match: /food|culin|cook|hotel|tour|hospitality|bakery/i },
  { key: "health", label: "Health", Icon: HeartPulse, match: /health|nurs|medic|care|hygien|safety/i },
  { key: "sport", label: "Sport", Icon: Dumbbell, match: /sport|physical education|fitness|athlet/i },
  { key: "society", label: "Society", Icon: Globe2, match: /histor|geograph|civic|social|citizen|politic/i },
  { key: "logic", label: "Logic", Icon: Binary, match: /logic|algorithm|reason|discrete/i },
  { key: "general", label: "General", Icon: BookOpen, match: /.^/ },
];

const BY_KEY = new Map(SUBJECT_ICONS.map((i) => [i.key, i]));
const FALLBACK = SUBJECT_ICONS[SUBJECT_ICONS.length - 1];

/** The teacher's choice when there is one, otherwise the best guess from the subject name. */
export function resolveSubjectIcon(subjectName: string, stored?: string | null): SubjectIconDef {
  if (stored && BY_KEY.has(stored)) return BY_KEY.get(stored)!;
  return SUBJECT_ICONS.find((i) => i.match.test(subjectName || "")) || FALLBACK;
}

/**
 * Renders a subject's icon. Courses saved before the icon set existed hold an emoji in the
 * same column — those still render as text so nothing looks broken while they're updated.
 */
const SubjectIcon: React.FC<{ subjectName: string; icon?: string | null; className?: string }> = ({ subjectName, icon, className = "w-5 h-5" }) => {
  const isLegacyEmoji = !!icon && !BY_KEY.has(icon);
  if (isLegacyEmoji) {
    return (
      <span className={`inline-flex items-center justify-center leading-none ${className}`} aria-hidden>
        {icon}
      </span>
    );
  }
  const { Icon } = resolveSubjectIcon(subjectName, icon);
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
};

export default SubjectIcon;
