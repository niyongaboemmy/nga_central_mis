import { and, asc, desc, eq, like } from "drizzle-orm";
import { db } from "../../db";
import { ClassGroup, LessonNote, SchemeOfWork, SchemeOfWorkEntry, Subject } from "../../db/schema";
import { loadTeacherLessons } from "../../controllers/calendarController";
import { recordActivity } from "../../utils/activityLogger";
import { sanitizeNoteHtml } from "../../utils/sanitizeNoteHtml";
import { resolvePeriod, toIsoDate } from "../academicPeriod";
import { curriculumFor } from "../competencyMap";
import { loadCurriculumSelection, parseCriteriaIds, setNoteCriteria } from "../lessonNoteCurriculum";
import { loadTeacherAssignments, type TeacherAssignmentRow } from "../teacherSchemes";
import { requestHasCap } from "../ai/personal/routes";
import type { AppSource } from "../home/apps";
import { mcpFrontend } from "./config";
import type { McpPerson } from "./gate";

/**
 * The MIS's own connector tools (EXTERNAL_AI_CONTRACT.md §2). Reads cover only the person's
 * own teaching (their assignments, timetable, schemes and notes); nothing here names a pupil.
 * Draft tools only ever create something unpublished that the person confirms in the MIS.
 *
 * mis_propose_scheme_week writes nothing: a Scheme of Work week has no draft state (a new
 * SchemeOfWorkEntry is immediately part of the teacher's scheme and of the validators'
 * PENDING queue), so the tool returns the proposed week and a link to the scheme, where the
 * teacher adds it themselves.
 */

export type ToolKind = "read" | "draft";

export interface McpTool {
  name: string;
  title: string;
  description: string;
  kind: ToolKind;
  pupilData: boolean;
  inputSchema: Record<string, unknown>;
  source: "mis" | AppSource;
}

export interface ToolOutput {
  summary: string;
  result: unknown;
  openUrl: string | null;
}

export class ToolError extends Error {
  constructor(
    readonly code: "TOOL_UNKNOWN" | "TOOL_FORBIDDEN" | "BAD_ARGUMENTS" | "NOT_FOUND" | "EXTERNAL_OFF" | "PUPIL_CONSENT_REQUIRED",
    message: string,
  ) {
    super(message);
  }
}

interface MisTool extends McpTool {
  source: "mis";
  /** Extra capability the person needs (besides the connector itself). */
  needs?: string;
  run(p: McpPerson, args: Record<string, unknown>): Promise<ToolOutput>;
}

// ── argument helpers ─────────────────────────────────────────────────────

const id = (args: Record<string, unknown>, key: string, required = true): number | null => {
  const v = args[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolError("BAD_ARGUMENTS", `${key} is required.`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ToolError("BAD_ARGUMENTS", `${key} must be a positive whole number.`);
  return n;
};
const text = (args: Record<string, unknown>, key: string, max: number, required = false): string | null => {
  const v = args[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolError("BAD_ARGUMENTS", `${key} is required.`);
    return null;
  }
  if (typeof v !== "string") throw new ToolError("BAD_ARGUMENTS", `${key} must be text.`);
  if (v.length > max) throw new ToolError("BAD_ARGUMENTS", `${key} is too long (at most ${max} characters).`);
  return v.trim();
};
const cap = (s: unknown, max = 1200) => (typeof s === "string" ? (s.length > max ? `${s.slice(0, max)}…` : s) : s ?? null);

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const url = (path: string) => `${mcpFrontend()}${path}`;

/** The person's (subject, class) assignments this year, and the period they belong to. */
async function myTeaching(p: McpPerson) {
  const { term, year } = await resolvePeriod();
  const assignments = await loadTeacherAssignments(p.userId, year?.academic_year_id ?? null);
  return { term, year, assignments };
}

function assertTeaches(assignments: TeacherAssignmentRow[], subjectId: number, classGroupId?: number | null) {
  const mine = assignments.filter((a) => a.subject_id === subjectId);
  if (mine.length === 0) throw new ToolError("TOOL_FORBIDDEN", "You are not assigned to teach this subject this year. Call mis_list_my_subjects to see yours.");
  if (classGroupId && !mine.some((a) => a.class_group_id === classGroupId)) {
    throw new ToolError("TOOL_FORBIDDEN", "You do not teach this subject to that class this year. Call mis_list_my_subjects to see yours.");
  }
  return mine;
}

/** Note HTML as plain text for the model. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<h([1-4])[^>]*>/gi, (_m, n) => `\n${"#".repeat(Number(n))} `)
    .replace(/<\/(p|div|h[1-6]|li|tr|pre|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

/** Small Markdown -> HTML (headings, lists, code blocks, quotes, paragraphs) for note drafts. */
export function markdownToHtml(md: string): string {
  const out: string[] = [];
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li><p>${inline(i)}</p></li>`).join("")}</${list.tag}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (fence) {
      flushPara();
      flushList();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) code.push(lines[i]);
      const cls = fence[1] ? ` class="language-${esc(fence[1])}"` : "";
      out.push(`<pre><code${cls}>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);
    if (h) {
      flushPara();
      flushList();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    } else if (ul || ol) {
      flushPara();
      const tag = ul ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push((ul ?? ol)![1]);
    } else if (quote) {
      flushPara();
      flushList();
      out.push(`<blockquote><p>${inline(quote[1])}</p></blockquote>`);
    } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flushPara();
      flushList();
      out.push("<hr>");
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return out.join("\n");
}

// ── the tools ────────────────────────────────────────────────────────────

const OBJ = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

export const MIS_TOOLS: MisTool[] = [
  {
    name: "mis_list_my_subjects",
    title: "My subjects and classes",
    description:
      "Lists the subjects and classes the signed-in teacher teaches this academic year (subject_id, class_group_id, names, grade), plus the current term. Use these ids with the other mis_ tools.",
    kind: "read",
    pupilData: false,
    source: "mis",
    inputSchema: OBJ({}),
    async run(p) {
      const { term, year, assignments } = await myTeaching(p);
      return {
        summary: assignments.length
          ? `You teach ${assignments.length} subject-class pair${assignments.length === 1 ? "" : "s"} in ${year?.name ?? "this year"}.`
          : "You have no teaching assignments this academic year.",
        result: {
          academic_year: year ? { id: year.academic_year_id, name: year.name } : null,
          term: term ? { id: term.academic_term_id, name: term.name, start: toIsoDate(term.start_date), end: toIsoDate(term.end_date) } : null,
          subjects: assignments.map((a) => ({
            subject_id: a.subject_id,
            subject: a.subject_name,
            code: a.subject_code,
            class_group_id: a.class_group_id,
            class_group: a.class_group_name,
            grade: a.grade_name,
          })),
        },
        openUrl: url("/scheme-of-work"),
      };
    },
  },
  {
    name: "mis_get_my_timetable",
    title: "My timetable",
    description:
      "Returns the signed-in teacher's weekly lessons for the current term: day, start and end time, subject, class and room. Optional day (0 = Sunday … 6 = Saturday) narrows it to one day.",
    kind: "read",
    pupilData: false,
    source: "mis",
    inputSchema: OBJ({ day: { type: "integer", minimum: 0, maximum: 6, description: "0 = Sunday … 6 = Saturday" } }),
    async run(p, args) {
      const day = args.day === undefined || args.day === null ? null : Number(args.day);
      if (day !== null && !(Number.isInteger(day) && day >= 0 && day <= 6)) throw new ToolError("BAD_ARGUMENTS", "day must be 0 (Sunday) to 6 (Saturday).");
      const { term, year } = await resolvePeriod();
      if (!term) return { summary: "There is no current term in the MIS.", result: { lessons: [] }, openUrl: url("/dashboard") };
      const lessons = (await loadTeacherLessons({
        userId: p.userId,
        termId: term.academic_term_id,
        yearId: year?.academic_year_id ?? null,
        dayOfWeek: day,
      })) as any[];
      return {
        summary: `${lessons.length} lesson${lessons.length === 1 ? "" : "s"} ${day === null ? "a week" : `on ${DAYS[day]}`} in ${term.name ?? "this term"}.`,
        result: {
          term: { id: term.academic_term_id, name: term.name },
          lessons: lessons.map((l) => ({
            day: DAYS[l.day_of_week] ?? l.day_of_week,
            day_of_week: l.day_of_week,
            start: String(l.start_time).slice(0, 5),
            end: String(l.end_time).slice(0, 5),
            subject_id: l.subject_id,
            subject: l.subject_name,
            class_group_id: l.class_group_id,
            class_group: l.class_group_name,
            location: l.location ?? null,
          })),
        },
        openUrl: url("/dashboard"),
      };
    },
  },
  {
    name: "mis_get_scheme_of_work",
    title: "My scheme of work",
    description:
      "Returns the signed-in teacher's own scheme of work for one subject and class (this term unless term_id is given): each week's dates, topic, objective, methodology, resources, evaluation and status.",
    kind: "read",
    pupilData: false,
    source: "mis",
    inputSchema: OBJ(
      {
        subject_id: { type: "integer", description: "From mis_list_my_subjects" },
        class_group_id: { type: "integer", description: "From mis_list_my_subjects" },
        term_id: { type: "integer", description: "Optional; defaults to the current term" },
      },
      ["subject_id", "class_group_id"],
    ),
    async run(p, args) {
      const subjectId = id(args, "subject_id")!;
      const classGroupId = id(args, "class_group_id")!;
      const termArg = id(args, "term_id", false);
      const { term, year } = await resolvePeriod(undefined, termArg ?? undefined);
      if (!term) throw new ToolError("NOT_FOUND", "That term was not found.");
      assertTeaches(await loadTeacherAssignments(p.userId, year?.academic_year_id ?? null), subjectId, classGroupId);
      const [scheme] = await db
        .select()
        .from(SchemeOfWork)
        .where(
          and(
            eq(SchemeOfWork.user_id, p.userId),
            eq(SchemeOfWork.subject_id, subjectId),
            eq(SchemeOfWork.class_group_id, classGroupId),
            eq(SchemeOfWork.academic_term_id, term.academic_term_id),
          ),
        )
        .limit(1);
      const openUrl = url("/scheme-of-work");
      if (!scheme) return { summary: `You have no scheme of work for this subject and class in ${term.name ?? "this term"} yet.`, result: { scheme: null, weeks: [] }, openUrl };
      const weeks = await db
        .select()
        .from(SchemeOfWorkEntry)
        .where(eq(SchemeOfWorkEntry.scheme_id, scheme.scheme_id))
        .orderBy(asc(SchemeOfWorkEntry.start_date), asc(SchemeOfWorkEntry.entry_id))
        .limit(80);
      return {
        summary: `Scheme of work with ${weeks.length} week${weeks.length === 1 ? "" : "s"} for ${term.name ?? "this term"}.`,
        result: {
          scheme: { scheme_id: scheme.scheme_id, term: term.name, validation_status: scheme.validation_status, module_code: scheme.module_code },
          weeks: weeks.map((w) => ({
            entry_id: w.entry_id,
            week: w.week_number,
            start: toIsoDate(w.start_date),
            end: toIsoDate(w.end_date),
            competency_id: w.competency_id,
            topic: cap(w.topic),
            sub_topic: cap(w.sub_topic),
            objective: cap(w.objective),
            methodology: cap(w.methodology, 600),
            resources: cap(w.resources, 600),
            evaluation: cap(w.evaluation, 600),
            status: w.entry_status,
            validation_status: w.validation_status,
          })),
        },
        openUrl,
      };
    },
  },
  {
    name: "mis_list_my_lesson_notes",
    title: "My lesson notes",
    description:
      "Lists the signed-in teacher's own lesson notes (id, title, subject, class, DRAFT/PUBLISHED, last change), newest first. Filter by subject_id, status or search. Pass note_id to get one note's full text instead.",
    kind: "read",
    pupilData: false,
    source: "mis",
    needs: "MANAGE_LESSON_NOTES",
    inputSchema: OBJ({
      note_id: { type: "integer", description: "Return this note's full text" },
      subject_id: { type: "integer" },
      status: { type: "string", enum: ["DRAFT", "PUBLISHED"] },
      search: { type: "string", description: "Words in the title" },
      limit: { type: "integer", minimum: 1, maximum: 50 },
      cursor: { type: "string", description: "next_cursor from the previous page" },
    }),
    async run(p, args) {
      const noteId = id(args, "note_id", false);
      if (noteId) {
        const [n] = await db
          .select({ note: LessonNote, subject: Subject.name, class_group: ClassGroup.name })
          .from(LessonNote)
          .leftJoin(Subject, eq(Subject.subject_id, LessonNote.subject_id))
          .leftJoin(ClassGroup, eq(ClassGroup.class_group_id, LessonNote.class_group_id))
          .where(and(eq(LessonNote.note_id, noteId), eq(LessonNote.user_id, p.userId)))
          .limit(1);
        if (!n) throw new ToolError("NOT_FOUND", "No lesson note of yours has that id.");
        const body = htmlToText(n.note.content_html ?? "");
        return {
          summary: `Lesson note "${n.note.title}" (${n.note.status}).`,
          result: {
            note_id: n.note.note_id,
            title: n.note.title,
            subject_id: n.note.subject_id,
            subject: n.subject,
            class_group: n.class_group,
            status: n.note.status,
            text: body.length > 40_000 ? `${body.slice(0, 40_000)}…` : body,
            truncated: body.length > 40_000,
          },
          openUrl: url(`/lesson-notes/${n.note.note_id}`),
        };
      }
      const subjectId = id(args, "subject_id", false);
      const status = args.status === "DRAFT" || args.status === "PUBLISHED" ? args.status : null;
      if (args.status !== undefined && args.status !== null && !status) throw new ToolError("BAD_ARGUMENTS", "status must be DRAFT or PUBLISHED.");
      const search = text(args, "search", 100);
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      const offset = Math.max(0, Number.parseInt(String(args.cursor ?? "0"), 10) || 0);
      const filters = [eq(LessonNote.user_id, p.userId)];
      if (subjectId) filters.push(eq(LessonNote.subject_id, subjectId));
      if (status) filters.push(eq(LessonNote.status, status));
      if (search) filters.push(like(LessonNote.title, `%${search.replace(/[%_\\]/g, "\\$&")}%`));
      const list = await db
        .select({
          note_id: LessonNote.note_id,
          title: LessonNote.title,
          subject_id: LessonNote.subject_id,
          subject: Subject.name,
          class_group: ClassGroup.name,
          status: LessonNote.status,
          updated_at: LessonNote.updated_at,
        })
        .from(LessonNote)
        .leftJoin(Subject, eq(Subject.subject_id, LessonNote.subject_id))
        .leftJoin(ClassGroup, eq(ClassGroup.class_group_id, LessonNote.class_group_id))
        .where(and(...filters))
        .orderBy(desc(LessonNote.updated_at), desc(LessonNote.note_id))
        .limit(limit + 1)
        .offset(offset);
      const more = list.length > limit;
      const page = list.slice(0, limit);
      return {
        summary: `${page.length} lesson note${page.length === 1 ? "" : "s"}${more ? " (more available)" : ""}.`,
        result: {
          notes: page.map((n) => ({ ...n, updated_at: n.updated_at ? new Date(n.updated_at as any).toISOString() : null })),
          next_cursor: more ? String(offset + limit) : null,
        },
        openUrl: url("/lesson-notes"),
      };
    },
  },
  {
    name: "mis_get_competences",
    title: "Curriculum competences",
    description:
      "Returns the curriculum of a subject the teacher teaches: learning outcomes (competences) and their performance criteria with ids. Use criteria ids with mis_create_lesson_note_draft.",
    kind: "read",
    pupilData: false,
    source: "mis",
    inputSchema: OBJ({ subject_id: { type: "integer", description: "From mis_list_my_subjects" } }, ["subject_id"]),
    async run(p, args) {
      const subjectId = id(args, "subject_id")!;
      const { assignments } = await myTeaching(p);
      const [a] = assertTeaches(assignments, subjectId);
      const outcomes = await curriculumFor(subjectId);
      return {
        summary: `${a.subject_name}: ${outcomes.length} learning outcome${outcomes.length === 1 ? "" : "s"}.`,
        result: {
          subject_id: subjectId,
          subject: a.subject_name,
          outcomes: outcomes.slice(0, 60).map((o) => ({ ...o, title: cap(o.title, 400), criteria: o.criteria.slice(0, 40).map((c) => ({ ...c, description: cap(c.description, 400) })) })),
        },
        openUrl: url("/competency-map"),
      };
    },
  },
  {
    name: "mis_create_lesson_note_draft",
    title: "Create a lesson note draft",
    description:
      "Saves a new lesson note in the MIS as an unpublished DRAFT that only the teacher can see. Nothing is published or shared: the teacher reviews it in the MIS (openUrl) and publishes it themselves. content is Markdown (headings, lists, code blocks) or HTML.",
    kind: "draft",
    pupilData: false,
    source: "mis",
    needs: "MANAGE_LESSON_NOTES",
    inputSchema: OBJ(
      {
        subject_id: { type: "integer", description: "From mis_list_my_subjects" },
        class_group_id: { type: "integer", description: "Optional class, from mis_list_my_subjects" },
        title: { type: "string", maxLength: 200 },
        content: { type: "string", description: "The note, in Markdown (or HTML)" },
        format: { type: "string", enum: ["markdown", "html"], description: "Default markdown" },
        criteria_ids: { type: "array", items: { type: "integer" }, description: "Performance criteria covered, from mis_get_competences" },
      },
      ["subject_id", "title", "content"],
    ),
    async run(p, args) {
      const subjectId = id(args, "subject_id")!;
      const classGroupId = id(args, "class_group_id", false);
      const title = text(args, "title", 200, true)!;
      const content = text(args, "content", 200_000, true)!;
      const { term, assignments } = await myTeaching(p);
      assertTeaches(assignments, subjectId, classGroupId);
      let selection;
      try {
        selection = await loadCurriculumSelection(subjectId, parseCriteriaIds(args.criteria_ids ?? []));
      } catch (e) {
        throw new ToolError("BAD_ARGUMENTS", (e as Error).message);
      }
      const html = sanitizeNoteHtml(args.format === "html" ? content : markdownToHtml(content));
      const [res] = (await db.insert(LessonNote).values({
        user_id: p.userId,
        subject_id: subjectId,
        class_group_id: classGroupId,
        academic_term_id: term?.academic_term_id ?? null,
        title,
        content_html: html,
        status: "DRAFT",
        source: "AI_GENERATED",
      })) as any;
      const noteId = Number(res.insertId);
      await setNoteCriteria(noteId, selection.criteriaIds);
      await recordActivity(p.userId, "LESSON_NOTE_CREATE", `Created lesson note draft "${title}" from an external AI (NGA connector)`, "LessonNote", noteId);
      return {
        summary: `Saved "${title}" as a draft lesson note. It is not published or shared; review it in the MIS and publish it yourself.`,
        result: { note_id: noteId, status: "DRAFT", criteria_ids: selection.criteriaIds },
        openUrl: url(`/lesson-notes/${noteId}`),
      };
    },
  },
  {
    name: "mis_propose_scheme_week",
    title: "Propose a scheme of work week",
    description:
      "Checks and returns a proposed scheme of work week for one of the teacher's subjects and classes. It does NOT save anything: scheme weeks have no draft state, so the teacher adds the week in the MIS scheme of work (openUrl).",
    kind: "draft",
    pupilData: false,
    source: "mis",
    inputSchema: OBJ(
      {
        subject_id: { type: "integer" },
        class_group_id: { type: "integer" },
        week_number: { type: "string", description: "e.g. \"Week 3\"" },
        start_date: { type: "string", description: "yyyy-mm-dd" },
        end_date: { type: "string", description: "yyyy-mm-dd" },
        competency_id: { type: "integer", description: "Learning outcome, from mis_get_competences" },
        topic: { type: "string" },
        sub_topic: { type: "string" },
        objective: { type: "string" },
        methodology: { type: "string" },
        resources: { type: "string" },
        evaluation: { type: "string" },
        duration: { type: "string" },
      },
      ["subject_id", "class_group_id", "topic", "objective"],
    ),
    async run(p, args) {
      const subjectId = id(args, "subject_id")!;
      const classGroupId = id(args, "class_group_id")!;
      const { term, assignments } = await myTeaching(p);
      assertTeaches(assignments, subjectId, classGroupId);
      const date = (k: string) => {
        const v = text(args, k, 10);
        if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ToolError("BAD_ARGUMENTS", `${k} must be yyyy-mm-dd.`);
        return v;
      };
      const competencyId = id(args, "competency_id", false);
      if (competencyId) {
        const outcomes = await curriculumFor(subjectId);
        if (!outcomes.some((o) => o.competency_id === competencyId)) throw new ToolError("BAD_ARGUMENTS", "competency_id is not a learning outcome of this subject.");
      }
      const week = {
        week_number: text(args, "week_number", 50),
        start_date: date("start_date"),
        end_date: date("end_date"),
        competency_id: competencyId,
        topic: text(args, "topic", 2000, true),
        sub_topic: text(args, "sub_topic", 2000),
        objective: text(args, "objective", 4000, true),
        methodology: text(args, "methodology", 4000),
        resources: text(args, "resources", 4000),
        evaluation: text(args, "evaluation", 4000),
        duration: text(args, "duration", 50),
      };
      const [scheme] = term
        ? await db
            .select({ scheme_id: SchemeOfWork.scheme_id })
            .from(SchemeOfWork)
            .where(
              and(
                eq(SchemeOfWork.user_id, p.userId),
                eq(SchemeOfWork.subject_id, subjectId),
                eq(SchemeOfWork.class_group_id, classGroupId),
                eq(SchemeOfWork.academic_term_id, term.academic_term_id),
              ),
            )
            .limit(1)
        : [];
      return {
        summary:
          "Proposed week checked; nothing was saved. Scheme of work weeks have no draft state, so add this week yourself in the MIS scheme of work (openUrl).",
        result: { saved: false, scheme_id: scheme?.scheme_id ?? null, term: term?.name ?? null, proposed_week: week },
        openUrl: url("/scheme-of-work"),
      };
    },
  },
];

const BY_NAME = new Map(MIS_TOOLS.map((t) => [t.name, t]));
export const misTool = (name: string) => BY_NAME.get(name) ?? null;

/** The MIS tools this person may see (their own extra capabilities). */
export async function misToolsFor(p: McpPerson): Promise<MisTool[]> {
  const needs = [...new Set(MIS_TOOLS.map((t) => t.needs).filter(Boolean) as string[])];
  const held = new Map(await Promise.all(needs.map(async (c) => [c, await requestHasCap(p.req, c)] as const)));
  return MIS_TOOLS.filter((t) => !t.needs || held.get(t.needs));
}
