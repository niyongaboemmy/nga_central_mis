import type { LucideIcon } from "lucide-react";
import { CalendarCheck, ClipboardCheck, Code2, MessagesSquare, MonitorSmartphone, School } from "lucide-react";
import { parseGuide, type ParsedGuide } from "./markdown";

/**
 * Staff documentation: one folder per app, one markdown file per guide.
 *
 *   src/docs/<module>/NN-name.md
 *
 * To add a guide, drop a markdown file in the module's folder (see README.md
 * for the format). To add a module, create its folder and add it to MODULES.
 * Nothing else needs wiring: files are picked up at build time.
 */

export interface DocModule {
  /** Folder name and URL segment. */
  id: string;
  name: string;
  tagline: string;
  icon: LucideIcon;
}

export const MODULES: DocModule[] = [
  { id: "mis", name: "Amashuri", tagline: "Schemes of work, lessons, timetable, mentoring and reports.", icon: School },
  { id: "task-mentor", name: "Task Mentor", tagline: "Assignments, quizzes, grading and report cards.", icon: ClipboardCheck },
  { id: "tendo", name: "Tendo", tagline: "Class registers, discipline and staff attendance.", icon: CalendarCheck },
  { id: "tupo", name: "Tupo", tagline: "Chat, mail, meetings and the school feed.", icon: MessagesSquare },
  { id: "tmcode", name: "TMCode", tagline: "The code editor for programming work and exams.", icon: Code2 },
  { id: "desktop", name: "Amashuri Desktop", tagline: "Every app in one window on your computer.", icon: MonitorSmartphone },
];

export interface Guide extends ParsedGuide {
  module: string;
  /** URL segment: the file name without its order prefix and extension. */
  slug: string;
  order: number;
}

const files = import.meta.glob("./*/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** Build the guide list from `{ "./module/NN-name.md": source }`. Exported for tests. */
export function buildGuides(sources: Record<string, string>): Guide[] {
  const out: Guide[] = [];
  for (const [path, source] of Object.entries(sources)) {
    const m = /^\.\/([^/]+)\/(?:(\d+)-)?([^/]+)\.md$/.exec(path);
    if (!m) continue;
    const parsed = parseGuide(source);
    out.push({
      ...parsed,
      title: parsed.title || m[3].replace(/-/g, " "),
      module: m[1],
      slug: m[3],
      order: m[2] ? Number(m[2]) : 999,
    });
  }
  return out.sort((a, b) => a.module.localeCompare(b.module) || a.order - b.order || a.slug.localeCompare(b.slug));
}

export const GUIDES: Guide[] = buildGuides(files);

export const guidesOf = (moduleId: string): Guide[] => GUIDES.filter((g) => g.module === moduleId);

export const findGuide = (moduleId: string, slug: string): Guide | undefined => GUIDES.find((g) => g.module === moduleId && g.slug === slug);

export const guidePath = (g: Pick<Guide, "module" | "slug">): string => `/docs/${g.module}/${g.slug}`;

export interface DocHit {
  guide: Guide;
  /** A short piece of the guide around the first match. */
  excerpt: string;
}

/** Every word must appear; title matches come first. */
export function searchGuides(query: string, guides: Guide[] = GUIDES, limit = 12): DocHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: Array<{ hit: DocHit; score: number }> = [];
  for (const guide of guides) {
    const title = guide.title.toLowerCase();
    const hay = `${title} ${guide.summary} ${guide.plain}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    const at = guide.plain.toLowerCase().indexOf(words[0]);
    const excerpt =
      at < 0
        ? guide.summary
        : `${at > 40 ? "…" : ""}${guide.plain.slice(Math.max(0, at - 40), at + 110).trim()}${at + 110 < guide.plain.length ? "…" : ""}`;
    scored.push({ hit: { guide, excerpt }, score: words.filter((w) => title.includes(w)).length });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.hit);
}
