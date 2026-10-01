import { ValidationError } from "../../../errors/CustomError";
import type { SourceToggles } from "./contextPack";

/**
 * The teacher's lesson recipe (LESSON_STUDIO plan §8.1, §9.2 step 3). Stored as a snapshot on
 * every run (presets can change later) and as saved presets in CourseBlueprint. Always pass
 * client input through normaliseBlueprint — it clamps every number and fills defaults, so the
 * engine never sees an out-of-range request.
 */
export type LessonLength = "SHORT" | "STANDARD" | "FULL";
export type Difficulty = "EASY" | "MIXED" | "CHALLENGING";

export interface Blueprint {
  version: 1;
  /** Place the teacher's existing notes that already cover a week before writing anything. */
  reuse_existing_notes: boolean;
  sources: Required<SourceToggles>;
  /** Reference files (FileAsset ids) the teacher attached to this run. */
  extra_asset_ids: number[];
  lesson: { enabled: boolean; length: LessonLength; interactive_breaks: number; worked_example: boolean };
  practical_task: { enabled: boolean };
  video_slot: { enabled: boolean };
  knowledge_check: { enabled: boolean; questions: number; difficulty: Difficulty };
  flashcards: { enabled: boolean; cards: number };
  exit_ticket: { enabled: boolean; questions: number };
  style: {
    language: "en" | "fr";
    reading_level: "L3" | "L4" | "L5";
    tone: "FRIENDLY" | "FORMAL";
    local_examples: boolean;
    kinyarwanda_glossary: boolean;
    /** Always cross-check answers with a second AI, even when quota is low. */
    strict_accuracy: boolean;
  };
  instructions: string;
}

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;
};
const flag = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : v === 1 || v === "1" || v === "true" ? true : v === 0 || v === "0" || v === "false" ? false : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

export const DEFAULT_BLUEPRINT: Blueprint = {
  version: 1,
  reuse_existing_notes: true,
  sources: { lesson_plans: true, my_notes: true, subject_materials: true, previous_weeks: true },
  extra_asset_ids: [],
  lesson: { enabled: true, length: "STANDARD", interactive_breaks: 2, worked_example: true },
  practical_task: { enabled: false },
  video_slot: { enabled: false },
  knowledge_check: { enabled: true, questions: 6, difficulty: "MIXED" },
  flashcards: { enabled: false, cards: 8 },
  exit_ticket: { enabled: false, questions: 2 },
  style: { language: "en", reading_level: "L4", tone: "FRIENDLY", local_examples: true, kinyarwanda_glossary: false, strict_accuracy: false },
  instructions: "",
};

export function normaliseBlueprint(raw: any): Blueprint {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_BLUEPRINT;
  const bp: Blueprint = {
    version: 1,
    reuse_existing_notes: flag(r.reuse_existing_notes, d.reuse_existing_notes),
    sources: {
      lesson_plans: flag(r.sources?.lesson_plans, true),
      my_notes: flag(r.sources?.my_notes, true),
      subject_materials: flag(r.sources?.subject_materials, true),
      previous_weeks: flag(r.sources?.previous_weeks, true),
    },
    extra_asset_ids: Array.isArray(r.extra_asset_ids)
      ? [...new Set(r.extra_asset_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))].slice(0, 20) as number[]
      : [],
    lesson: {
      enabled: flag(r.lesson?.enabled, d.lesson.enabled),
      length: oneOf(r.lesson?.length, ["SHORT", "STANDARD", "FULL"] as const, d.lesson.length),
      interactive_breaks: clamp(r.lesson?.interactive_breaks, 0, 3, d.lesson.interactive_breaks),
      worked_example: flag(r.lesson?.worked_example, d.lesson.worked_example),
    },
    practical_task: { enabled: flag(r.practical_task?.enabled, d.practical_task.enabled) },
    video_slot: { enabled: flag(r.video_slot?.enabled, d.video_slot.enabled) },
    knowledge_check: {
      enabled: flag(r.knowledge_check?.enabled, d.knowledge_check.enabled),
      questions: clamp(r.knowledge_check?.questions, 3, 10, d.knowledge_check.questions),
      difficulty: oneOf(r.knowledge_check?.difficulty, ["EASY", "MIXED", "CHALLENGING"] as const, d.knowledge_check.difficulty),
    },
    flashcards: { enabled: flag(r.flashcards?.enabled, d.flashcards.enabled), cards: clamp(r.flashcards?.cards, 4, 15, d.flashcards.cards) },
    exit_ticket: { enabled: flag(r.exit_ticket?.enabled, d.exit_ticket.enabled), questions: clamp(r.exit_ticket?.questions, 1, 3, d.exit_ticket.questions) },
    style: {
      language: oneOf(r.style?.language, ["en", "fr"] as const, d.style.language),
      reading_level: oneOf(r.style?.reading_level, ["L3", "L4", "L5"] as const, d.style.reading_level),
      tone: oneOf(r.style?.tone, ["FRIENDLY", "FORMAL"] as const, d.style.tone),
      local_examples: flag(r.style?.local_examples, d.style.local_examples),
      kinyarwanda_glossary: flag(r.style?.kinyarwanda_glossary, d.style.kinyarwanda_glossary),
      strict_accuracy: flag(r.style?.strict_accuracy, d.style.strict_accuracy),
    },
    instructions: typeof r.instructions === "string" ? r.instructions.trim().slice(0, 2000) : "",
  };
  if (!producesAnything(bp)) throw new ValidationError("Turn on at least one block (lesson, practical task, video, check, flashcards or exit ticket).");
  return bp;
}

export const producesAnything = (bp: Blueprint) =>
  bp.lesson.enabled || bp.practical_task.enabled || bp.video_slot.enabled || bp.knowledge_check.enabled || bp.flashcards.enabled || bp.exit_ticket.enabled;

/** The lesson call also writes the practical task (one call instead of two, to save free quota). */
export const needsCoreLesson = (bp: Blueprint) => bp.lesson.enabled || bp.practical_task.enabled;
/** One "assess" call covers the check, flashcards, exit ticket and video "watch for" questions. */
export const needsAssessmentPack = (bp: Blueprint) =>
  bp.knowledge_check.enabled || bp.flashcards.enabled || bp.exit_ticket.enabled || bp.video_slot.enabled;

export interface Preset {
  id: string;
  name: string;
  description: string;
  config: Blueprint;
}

const preset = (id: string, name: string, description: string, patch: (b: Blueprint) => void): Preset => {
  const config: Blueprint = JSON.parse(JSON.stringify(DEFAULT_BLUEPRINT));
  patch(config);
  return { id, name, description, config };
};

/** Built-in presets (§9.2). Kept in code so they version with the prompts. */
export const BUILTIN_PRESETS: Preset[] = [
  preset("quick_week", "Quick week", "A short lesson and a 5-question check. About 2 AI calls a week.", (b) => {
    b.lesson.length = "SHORT";
    b.lesson.interactive_breaks = 1;
    b.lesson.worked_example = false;
    b.knowledge_check.questions = 5;
  }),
  preset("full_lesson", "Full lesson", "A full lesson with interactive breaks, a worked example, an 8-question check and an exit ticket.", (b) => {
    b.lesson.length = "STANDARD";
    b.lesson.interactive_breaks = 2;
    b.knowledge_check.questions = 8;
    b.exit_ticket.enabled = true;
  }),
  preset("practical_tvet", "Practical TVET week", "Short theory, a practical task with a safety checklist, and an exit ticket.", (b) => {
    b.lesson.length = "SHORT";
    b.lesson.interactive_breaks = 1;
    b.practical_task.enabled = true;
    b.knowledge_check.questions = 5;
    b.exit_ticket.enabled = true;
  }),
  preset("revision_week", "Revision week", "No new lesson: flashcards of key terms and a 10-question check.", (b) => {
    b.lesson.enabled = false;
    b.flashcards.enabled = true;
    b.flashcards.cards = 12;
    b.knowledge_check.questions = 10;
    b.knowledge_check.difficulty = "CHALLENGING";
  }),
];

/** A one-line summary for provenance ("how was this made?"). */
export function describeBlueprint(bp: Blueprint): string {
  const parts: string[] = [];
  if (bp.lesson.enabled) parts.push(`${bp.lesson.length.toLowerCase()} lesson${bp.lesson.interactive_breaks ? ` + ${bp.lesson.interactive_breaks} interactive breaks` : ""}`);
  if (bp.practical_task.enabled) parts.push("practical task");
  if (bp.video_slot.enabled) parts.push("video slot");
  if (bp.knowledge_check.enabled) parts.push(`${bp.knowledge_check.questions}-question check`);
  if (bp.flashcards.enabled) parts.push(`${bp.flashcards.cards} flashcards`);
  if (bp.exit_ticket.enabled) parts.push("exit ticket");
  return parts.join(", ");
}
