import crypto from "crypto";
import { promises as fsp } from "fs";
import { generateStructuredContent, orderedProviders, friendlyAIErrorMessage } from "../aiProviders";
import { isCoolingDown, isParkedDead } from "../aiProviders/registry";
import type { JSONSchema } from "../aiProviders/types";
import type { PersonalOption } from "../aiProviders/generate";
import { classifyUpload, extensionOf } from "../files/fileKinds";
import { extractText, MIN_USEFUL_CHARS } from "../files/extractText";
import { fail, isStudentAccount, PRIORITIES, STAGES, CAP, type Priority, type Stage } from "./core";
import { ABSTRACT_MAX, ABSTRACT_MIN } from "./projects";
import { categories } from "./projects";
import { MIN_PROJECT_DAYS } from "./stages";
import type { ProjectAccess } from "./access";
import { createItem, createTask } from "./work";

/**
 * "Set up with AI" (migration 140, SIDE_PROJECTS_AI_SETUP; never students). The owner drops every
 * document about the project they are about to create, adds an extra prompt, and AI fills in the
 * whole wizard: the idea, the concept note, dates and stages, links, which file is the concept /
 * SRS / implementation plan, and a plan of phases, features and tasks. They can then talk to it
 * ("make it 3 months", "split the mobile work") until the draft is right.
 *
 * Only extracted text is kept, in memory, for a few hours (one pm2 instance): the files themselves
 * stay in the browser and go up through the normal create flow, so nothing is stored for a project
 * that is never created. The school AI switch applies inside generateStructuredContent.
 */

export const SESSION_TTL_MS = 3 * 60 * 60_000;
export const MAX_FILES = 12;
/** What the AI sees from all documents together (free tiers have small context windows). */
export const PROMPT_TEXT_BUDGET = 60_000;
const MAX_PHASES = 8;
const MAX_FEATURES = 8;
const MAX_TASKS = 8;
const MAX_TOTAL_TASKS = 120;

export const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  groq: "Groq",
  glm: "GLM",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Claude",
  mistral: "Mistral",
  cerebras: "Cerebras",
};

export type DocSlot = "CONCEPT" | "SRS" | "IMPLEMENTATION_PLAN" | "GALLERY" | "SKIP";
const DOC_SLOTS: DocSlot[] = ["CONCEPT", "SRS", "IMPLEMENTATION_PLAN", "GALLERY", "SKIP"];

export interface SetupFile {
  id: string;
  name: string;
  size: number;
  kind: string | null;
  pages: number | null;
  chars: number;
  status: "READ" | "NO_TEXT" | "REFUSED";
  note: string | null;
  text: string;
}

export interface DraftTask { title: string; priority: Priority; estimateHours: number | null }
export interface DraftFeature { title: string; description: string; priority: Priority; estimateHours: number | null; tasks: DraftTask[] }
export interface DraftPhase { title: string; description: string; stage: Stage | null; features: DraftFeature[] }

export interface Draft {
  title: string;
  abstract: string;
  problemStatement: string;
  description: string;
  concept: { users: string; solution: string; impact: string };
  techTags: string[];
  categoryId: number | null;
  category: string;
  kind: "DELIVERY_STUDIO" | "INDIVIDUAL";
  customerName: string;
  githubUrl: string;
  accessUrl: string;
  startDate: string;
  targetDate: string;
  stageEnds: { IDEA: string; PLANNING: string; IN_PROGRESS: string } | null;
  startIn: "IDEA" | "PLANNING" | "IN_PROGRESS";
  documents: Array<{ fileId: string; name: string; slot: DocSlot; why: string }>;
  phases: DraftPhase[];
  questions: string[];
  assumptions: string[];
  summary: string;
}

export interface Turn { role: "user" | "ai"; text: string; at: string }

interface Session {
  id: string;
  userId: number;
  touched: number;
  files: SetupFile[];
  prompt: string;
  turns: Turn[];
  draft: Draft | null;
  provider: string | null;
}

const sessions = new Map<string, Session>();

function sweep(now = Date.now()) {
  for (const [id, s] of sessions) if (now - s.touched > SESSION_TTL_MS) sessions.delete(id);
}

/** Test seam. */
export function resetSessions() {
  sessions.clear();
}

/** SIDE_PROJECTS_AI_SETUP, and never a student account (migration 140). */
export async function mayUseAiSetup(userId: number, permissions: string[] | undefined) {
  return (permissions ?? []).includes(CAP.AI_SETUP) && !(await isStudentAccount(userId));
}

export async function assertAiSetup(userId: number, permissions: string[] | undefined) {
  if (!(await mayUseAiSetup(userId, permissions))) fail(403, "NOT_ALLOWED", "Setting up a project with AI isn't available for your account");
}

/** Configured providers, in the order AUTO tries them, with whether each can answer right now. */
export function providers() {
  const auto = orderedProviders(undefined).filter((p) => p.isConfigured());
  return {
    auto: auto.length > 0,
    list: auto.map((p) => ({ name: p.name, label: PROVIDER_LABELS[p.name] ?? p.name, ready: !isParkedDead(p.name) && !isCoolingDown(p.name) })),
  };
}

export function createSession(userId: number) {
  sweep();
  const id = crypto.randomBytes(12).toString("hex");
  sessions.set(id, { id, userId, touched: Date.now(), files: [], prompt: "", turns: [], draft: null, provider: null });
  return { id, maxFiles: MAX_FILES };
}

function sessionOf(userId: number, id: string): Session {
  sweep();
  const found = sessions.get(String(id));
  if (!found || found.userId !== userId) return fail(404, "SESSION_GONE", "This AI setup has expired. Start again");
  found.touched = Date.now();
  return found;
}

const publicFile = (f: SetupFile) => ({ id: f.id, name: f.name, size: f.size, kind: f.kind, pages: f.pages, chars: f.chars, status: f.status, note: f.note });

export function sessionView(userId: number, id: string) {
  const s = sessionOf(userId, id);
  return { id: s.id, files: s.files.map(publicFile), prompt: s.prompt, turns: s.turns, draft: s.draft, provider: s.provider };
}

/** Reads one document: text for the AI, a status for the person. The temp file is always removed. */
export async function addFile(userId: number, id: string, file: { path: string; originalname: string; size: number }) {
  try {
    const s = sessionOf(userId, id);
    if (s.files.length >= MAX_FILES) fail(400, "TOO_MANY", `Add at most ${MAX_FILES} documents`, "file");
    const name = String(file.originalname || "document").slice(0, 200);
    const base: SetupFile = { id: crypto.randomBytes(6).toString("hex"), name, size: Number(file.size) || 0, kind: null, pages: null, chars: 0, status: "READ", note: null, text: "" };
    const verdict = await classifyUpload(name, file.path, base.size);
    if (!verdict.ok) {
      Object.assign(base, { status: "REFUSED", note: verdict.reason });
    } else {
      base.kind = verdict.kind;
      if (verdict.kind === "image" || verdict.kind === "audio" || verdict.kind === "archive") {
        Object.assign(base, { status: "NO_TEXT", note: verdict.kind === "image" ? "An image: it goes to the gallery" : "No text to read: it will still be attached" });
      } else {
        try {
          const out = await extractText(file.path, verdict.kind, extensionOf(name));
          base.text = out.text;
          base.chars = out.text.length;
          base.pages = out.pages ?? null;
          if (out.text.length < MIN_USEFUL_CHARS) Object.assign(base, { status: "NO_TEXT", note: out.method === "none" ? "This format can't be read here: save it as PDF or .docx" : "No readable text (a scan?)" });
        } catch {
          Object.assign(base, { status: "NO_TEXT", note: "This file couldn't be read" });
        }
      }
    }
    s.files.push(base);
    return publicFile(base);
  } finally {
    await fsp.rm(file.path, { force: true }).catch(() => undefined);
  }
}

export function removeFile(userId: number, id: string, fileId: string) {
  const s = sessionOf(userId, id);
  s.files = s.files.filter((f) => f.id !== fileId);
  return { ok: true };
}

// ---------------------------------------------------------------------------------- the prompt

const str: JSONSchema = { type: "string" };
const strArr: JSONSchema = { type: "array", items: str };
const prio: JSONSchema = { type: "string", description: "LOW, MEDIUM, HIGH or CRITICAL" };
const hours: JSONSchema = { type: "number" };

export const DRAFT_SCHEMA: JSONSchema = {
  type: "object",
  required: [
    "reply", "summary", "title", "abstract", "problemStatement", "description", "users", "solution", "impact", "techTags", "category", "kind",
    "customerName", "githubUrl", "accessUrl", "startDate", "targetDate", "ideaEnd", "planningEnd", "buildingEnd", "startIn", "documents", "phases", "questions", "assumptions",
  ],
  properties: {
    reply: str,
    summary: str,
    title: str,
    abstract: str,
    problemStatement: str,
    description: str,
    users: str,
    solution: str,
    impact: str,
    techTags: strArr,
    category: str,
    kind: { type: "string", description: "DELIVERY_STUDIO or INDIVIDUAL" },
    customerName: str,
    githubUrl: str,
    accessUrl: str,
    startDate: str,
    targetDate: str,
    ideaEnd: str,
    planningEnd: str,
    buildingEnd: str,
    startIn: { type: "string", description: "IDEA, PLANNING or IN_PROGRESS" },
    documents: {
      type: "array",
      items: { type: "object", required: ["file", "slot", "why"], properties: { file: { type: "number", description: "the document number" }, slot: { type: "string", description: "CONCEPT, SRS, IMPLEMENTATION_PLAN, GALLERY or SKIP" }, why: str } },
    },
    phases: {
      type: "array",
      items: {
        type: "object",
              required: ["title", "description", "stage", "features"],
        properties: {
          title: str,
          description: str,
          stage: { type: "string", description: "IDEA, PLANNING, IN_PROGRESS or TESTING" },
          features: {
            type: "array",
            items: {
              type: "object",
                          required: ["title", "description", "priority", "estimateHours", "tasks"],
              properties: {
                title: str,
                description: str,
                priority: prio,
                estimateHours: hours,
                tasks: {
                  type: "array",
                  items: { type: "object", required: ["title", "priority", "estimateHours"], properties: { title: str, priority: prio, estimateHours: hours } },
                },
              },
            },
          },
        },
      },
    },
    questions: strArr,
    assumptions: strArr,
  },
};

/** Every document's text, shared fairly inside the budget (a long SRS can't crowd out the brief). */
export function documentsBlock(files: SetupFile[], budget = PROMPT_TEXT_BUDGET) {
  const lines: string[] = [];
  const readable = files.filter((f) => f.status === "READ");
  let left = budget;
  let remaining = readable.length;
  const bySize = [...readable].sort((a, b) => a.text.length - b.text.length);
  const share = new Map<string, number>();
  for (const f of bySize) {
    const fair = Math.floor(left / Math.max(1, remaining));
    const take = Math.min(f.text.length, fair);
    share.set(f.id, take);
    left -= take;
    remaining--;
  }
  files.forEach((f, i) => {
    const head = `### Document ${i + 1}: ${f.name} (${f.kind ?? "unknown"}${f.pages ? `, ${f.pages} pages` : ""})`;
    if (f.status !== "READ") {
      lines.push(`${head}\n[no text: ${f.note ?? "not readable"}]`);
      return;
    }
    const n = share.get(f.id) ?? 0;
    const text = f.text.slice(0, n);
    lines.push(`${head}\n${text}${n < f.text.length ? "\n[…cut to fit…]" : ""}`);
  });
  return lines.join("\n\n");
}

const todayYmd = () => new Date().toISOString().slice(0, 10);

function buildPrompt(s: Session, cats: Array<{ name: string }>, ask: string | null) {
  const today = todayYmd();
  const rules = `You set up a new project in a school's project management system from the documents the project owner uploaded.
Read every document and fill in the whole project. Write in clear, plain English, in the owner's voice ("We build…" is fine). Never invent people's names, emails or phone numbers.
Today is ${today}.

Fields:
- title: 3-150 characters, the product's real name if the documents give one.
- abstract: ${ABSTRACT_MIN}-${ABSTRACT_MAX} characters, two or three sentences: what it is, who it is for, what it changes.
- problemStatement: 30-3000 characters: who has the problem and why it matters.
- description: up to 1500 characters of extra detail (scope, constraints), or "".
- users (who it helps, 10-1500), solution (proposed solution, 30-3000), impact (expected impact, 10-1500): the concept note.
- techTags: up to 10 technologies named or clearly implied (e.g. "React", "Laravel", "MySQL").
- category: exactly one of [${cats.map((c) => JSON.stringify(c.name)).join(", ")}] or "".
- kind: DELIVERY_STUDIO when it is work for a customer/client, else INDIVIDUAL.
- customerName: the client organisation when there is one, else "".
- githubUrl: a https://github.com/owner/repo link found in the documents, else "". accessUrl: a https live/demo link, else "".
- startDate and targetDate: YYYY-MM-DD. Use the documents' dates; otherwise start ${today} and choose a realistic closing date for the scope. targetDate at least ${MIN_PROJECT_DAYS} days after startDate.
- ideaEnd, planningEnd, buildingEnd: YYYY-MM-DD ends of the Idea, Planning and Building stages, in order, between start and target (Testing runs from buildingEnd to the target). "" to let the system split evenly.
- startIn: IDEA when only an idea exists, PLANNING when designs/requirements exist, IN_PROGRESS when building has started.
- documents: one entry per document number: CONCEPT (concept note / proposal / brief), SRS (requirements specification), IMPLEMENTATION_PLAN (plan, schedule, roadmap, work breakdown), GALLERY (images, screenshots, diagrams, other supporting files), SKIP (unrelated). At most one CONCEPT, one SRS, one IMPLEMENTATION_PLAN; give a short why.
- phases: 2-${MAX_PHASES} phases in order, each with stage (IDEA/PLANNING/IN_PROGRESS/TESTING), 1-${MAX_FEATURES} features (deliverables) and 1-${MAX_TASKS} concrete tasks per feature (verb first, e.g. "Build the order form"). estimateHours: realistic hours (0 when unknown). Follow the requirements and plan in the documents; don't pad.
- questions: up to 5 short questions about things the documents leave unclear that would change the plan.
- assumptions: up to 5 assumptions you made.
- summary: two sentences on what you understood.
- reply: one or two friendly sentences to the owner about what you did${ask ? " in answer to their last message" : ""}.`;

  const owner = s.prompt.trim() ? `\n\nThe owner's extra instructions (follow them; they win over the documents):\n${s.prompt.trim()}` : "";
  const docs = s.files.length ? `\n\n## Documents\n\n${documentsBlock(s.files)}` : "\n\nNo documents were uploaded: work from the owner's instructions.";
  if (!ask || !s.draft) return `${rules}${owner}${docs}`;
  const history = s.turns
    .slice(-8)
    .map((t) => `${t.role === "user" ? "Owner" : "You"}: ${t.text}`)
    .join("\n");
  return `${rules}${owner}${docs}

## The current draft (JSON)
${JSON.stringify(toModel(s.draft, s.files))}

## Conversation so far
${history}

## The owner now asks
${ask}

Return the WHOLE updated project with their change applied; keep everything they didn't ask to change.`;
}

/** The draft in the model's own shape, so a refinement round-trips. */
function toModel(d: Draft, files: SetupFile[]) {
  return {
    title: d.title,
    abstract: d.abstract,
    problemStatement: d.problemStatement,
    description: d.description,
    users: d.concept.users,
    solution: d.concept.solution,
    impact: d.concept.impact,
    techTags: d.techTags,
    category: d.category,
    kind: d.kind,
    customerName: d.customerName,
    githubUrl: d.githubUrl,
    accessUrl: d.accessUrl,
    startDate: d.startDate,
    targetDate: d.targetDate,
    ideaEnd: d.stageEnds?.IDEA ?? "",
    planningEnd: d.stageEnds?.PLANNING ?? "",
    buildingEnd: d.stageEnds?.IN_PROGRESS ?? "",
    startIn: d.startIn,
    documents: d.documents.map((x) => ({ file: files.findIndex((f) => f.id === x.fileId) + 1, slot: x.slot, why: x.why })),
    phases: d.phases,
    questions: d.questions,
    assumptions: d.assumptions,
  };
}

// ---------------------------------------------------------------------------------- normalising

const s = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+\n/g, "\n").trim().slice(0, max) : "");
const isYmd = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`));
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const addDays = (a: string, n: number) => new Date(Date.parse(`${a}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const prioOf = (x: unknown): Priority => ((PRIORITIES as readonly string[]).includes(String(x).toUpperCase()) ? (String(x).toUpperCase() as Priority) : "MEDIUM");
const hoursOf = (x: unknown) => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? Math.min(999, Math.round(n * 2) / 2) : null;
};
const https = (x: unknown) => {
  const v = s(x, 500);
  return /^https:\/\/[^\s]+$/i.test(v) ? v : "";
};
const github = (x: unknown) => {
  const v = s(x, 500).replace(/\.git$/, "");
  return /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/i.test(v) ? v.replace(/\/$/, "") : "";
};

/** Model output → a draft the wizard can trust: clipped, valid dates, one file per slot, bounded plan. */
export function normalise(raw: any, files: SetupFile[], cats: Array<{ id: number; name: string }>): Draft {
  const today = todayYmd();
  let start = isYmd(s(raw?.startDate, 10)) ? s(raw.startDate, 10) : today;
  let target = isYmd(s(raw?.targetDate, 10)) ? s(raw.targetDate, 10) : addDays(start, 90);
  if (dayDiff(start, target) + 1 < MIN_PROJECT_DAYS) target = addDays(start, Math.max(MIN_PROJECT_DAYS - 1, 29));
  const ends = [raw?.ideaEnd, raw?.planningEnd, raw?.buildingEnd].map((x) => s(x, 10));
  let stageEnds: Draft["stageEnds"] = null;
  if (ends.every(isYmd) && start <= ends[0] && ends[0] < ends[1] && ends[1] < ends[2] && ends[2] < target) {
    stageEnds = { IDEA: ends[0], PLANNING: ends[1], IN_PROGRESS: ends[2] };
  }
  const catName = s(raw?.category, 80).toLowerCase();
  const cat = cats.find((c) => c.name.toLowerCase() === catName) ?? null;

  const used = new Set<DocSlot>();
  const documents: Draft["documents"] = [];
  const asked = Array.isArray(raw?.documents) ? raw.documents : [];
  files.forEach((f, i) => {
    const hit = asked.find((d: any) => Number(d?.file) === i + 1);
    let slot: DocSlot = DOC_SLOTS.includes(String(hit?.slot).toUpperCase() as DocSlot) ? (String(hit.slot).toUpperCase() as DocSlot) : "GALLERY";
    // Documents slots take documents only, and one file each.
    const docLike = ["pdf", "word", "markdown", "text", "slides", "sheet"].includes(String(f.kind));
    if ((slot === "CONCEPT" || slot === "SRS" || slot === "IMPLEMENTATION_PLAN") && (!docLike || used.has(slot))) slot = "GALLERY";
    if (slot === "SRS" && f.kind === "slides") slot = "GALLERY";
    if ((slot === "SRS" || slot === "CONCEPT") && f.kind === "sheet") slot = "GALLERY";
    if (f.status === "REFUSED") slot = "SKIP";
    if (slot !== "GALLERY" && slot !== "SKIP") used.add(slot);
    documents.push({ fileId: f.id, name: f.name, slot, why: s(hit?.why, 200) });
  });

  let total = 0;
  const phases: DraftPhase[] = (Array.isArray(raw?.phases) ? raw.phases : []).slice(0, MAX_PHASES).map((p: any) => ({
    title: s(p?.title, 150) || "Phase",
    description: s(p?.description, 2000),
    stage: (STAGES as readonly string[]).includes(String(p?.stage).toUpperCase()) ? (String(p.stage).toUpperCase() as Stage) : null,
    features: (Array.isArray(p?.features) ? p.features : []).slice(0, MAX_FEATURES).map((f: any) => ({
      title: s(f?.title, 150) || "Feature",
      description: s(f?.description, 2000),
      priority: prioOf(f?.priority),
      estimateHours: hoursOf(f?.estimateHours),
      tasks: (Array.isArray(f?.tasks) ? f.tasks : [])
        .slice(0, MAX_TASKS)
        .map((t: any) => ({ title: s(t?.title, 200), priority: prioOf(t?.priority), estimateHours: hoursOf(t?.estimateHours) }))
        .filter((t: DraftTask) => t.title.length >= 3)
        .filter(() => ++total <= MAX_TOTAL_TASKS),
    })),
  }));

  const startIn = ["IDEA", "PLANNING", "IN_PROGRESS"].includes(String(raw?.startIn)) ? raw.startIn : "IDEA";
  return {
    title: s(raw?.title, 150),
    abstract: s(raw?.abstract, ABSTRACT_MAX),
    problemStatement: s(raw?.problemStatement, 3000),
    description: s(raw?.description, 5000),
    concept: { users: s(raw?.users, 1500), solution: s(raw?.solution, 3000), impact: s(raw?.impact, 1500) },
    techTags: [...new Set((Array.isArray(raw?.techTags) ? raw.techTags : []).map((t: unknown) => s(t, 40)).filter(Boolean))].slice(0, 10) as string[],
    categoryId: cat ? Number(cat.id) : null,
    category: cat?.name ?? "",
    kind: raw?.kind === "DELIVERY_STUDIO" ? "DELIVERY_STUDIO" : "INDIVIDUAL",
    customerName: s(raw?.customerName, 150),
    githubUrl: github(raw?.githubUrl),
    accessUrl: https(raw?.accessUrl),
    startDate: start,
    targetDate: target,
    stageEnds,
    startIn,
    documents,
    phases: phases.filter((p) => p.title),
    questions: (Array.isArray(raw?.questions) ? raw.questions : []).map((q: unknown) => s(q, 300)).filter(Boolean).slice(0, 5),
    assumptions: (Array.isArray(raw?.assumptions) ? raw.assumptions : []).map((q: unknown) => s(q, 300)).filter(Boolean).slice(0, 5),
    summary: s(raw?.summary, 600),
  };
}

/** What still needs the owner's eye before the wizard accepts it. */
export function issuesOf(d: Draft) {
  const out: Array<{ field: string; message: string }> = [];
  if (d.title.length < 3) out.push({ field: "title", message: "Add a title" });
  if (d.abstract.length < ABSTRACT_MIN) out.push({ field: "abstract", message: `The abstract needs ${ABSTRACT_MIN - d.abstract.length} more characters` });
  if (d.problemStatement.length < 30) out.push({ field: "problemStatement", message: "Describe the problem a little more" });
  const hasConceptFile = d.documents.some((x) => x.slot === "CONCEPT");
  if (!hasConceptFile && (d.concept.users.length < 10 || d.concept.solution.length < 30 || d.concept.impact.length < 10)) {
    out.push({ field: "concept", message: "The concept note needs more detail" });
  }
  return out;
}

// ---------------------------------------------------------------------------------- AI calls

export interface RunOptions {
  /** "auto" (default) or one provider name; a named provider still falls back to the others. */
  provider?: unknown;
  prompt?: unknown;
  message?: unknown;
  /** the owner's own edits to the plan, applied before the AI changes it */
  phases?: unknown;
  personal?: PersonalOption;
}

function orderFor(choice: unknown): string[] | undefined {
  const name = typeof choice === "string" ? choice.trim().toLowerCase() : "auto";
  if (!name || name === "auto") return undefined;
  const all = orderedProviders(undefined).filter((p) => p.isConfigured()).map((p) => p.name);
  if (!all.includes(name)) fail(400, "VALIDATION", "That AI isn't available: choose Auto", "provider");
  return [name, ...all.filter((n) => n !== name)];
}

async function run(userId: number, sess: Session, ask: string | null, opts: RunOptions) {
  const cats = (await categories()).map((c: any) => ({ id: Number(c.id), name: String(c.name) }));
  if (!sess.files.some((f) => f.status === "READ") && !sess.prompt.trim()) {
    fail(400, "NOTHING_TO_READ", "Add a document with text, or tell the AI about the project in the extra prompt", "prompt");
  }
  const providerOrder = orderFor(opts.provider);
  let out;
  try {
    out = await generateStructuredContent<any>(
      { prompt: buildPrompt(sess, cats, ask), schema: DRAFT_SCHEMA, schemaName: "project_setup", maxOutputTokens: 8192, disableThinking: true },
      { ...(providerOrder ? { providerOrder } : { role: "draft" }), feature: "side_project_ai_setup", actorUserId: userId, personal: opts.personal },
    );
  } catch (e: any) {
    if (e?.status === 403 || e?.statusCode === 403 || e?.code === "AI_DISABLED") throw e;
    fail(503, "AI_FAILED", friendlyAIErrorMessage(e) || "The AI couldn't answer just now. Try again in a minute");
  }
  const draft = normalise(out!.data, sess.files, cats);
  sess.draft = draft;
  sess.provider = out!.providerUsed;
  const reply = s(out!.data?.reply, 600) || (ask ? "Done: the draft is updated." : "Here is your project. Check it, then ask me for any change.");
  if (ask) sess.turns.push({ role: "user", text: ask, at: new Date().toISOString() });
  sess.turns.push({ role: "ai", text: reply, at: new Date().toISOString() });
  sess.turns = sess.turns.slice(-30);
  return {
    draft,
    issues: issuesOf(draft),
    reply,
    turns: sess.turns,
    provider: { name: out!.providerUsed, label: PROVIDER_LABELS[out!.providerUsed] ?? out!.providerUsed, model: out!.model ?? null },
    ai: out!.ai ?? null,
  };
}

/** First draft from every document plus the extra prompt. Starts the conversation over. */
export async function draftProject(userId: number, id: string, opts: RunOptions) {
  const sess = sessionOf(userId, id);
  sess.prompt = s(opts.prompt, 4000);
  sess.turns = [];
  return run(userId, sess, null, opts);
}

/** One conversational change ("make it 3 months", "drop the mobile app"). */
export async function refineProject(userId: number, id: string, opts: RunOptions) {
  const sess = sessionOf(userId, id);
  const ask = s(opts.message, 2000);
  if (ask.length < 2) fail(400, "VALIDATION", "Tell the AI what to change", "message");
  if (!sess.draft) return fail(400, "NO_DRAFT", "Let the AI set the project up first");
  if (Array.isArray(opts.phases)) sess.draft.phases = parsePlan(opts.phases);
  return run(userId, sess, ask, opts);
}

// ---------------------------------------------------------------------------------- apply the plan

/** The plan as the owner left it in the review (they may rename or remove anything). */
export function parsePlan(raw: unknown): DraftPhase[] {
  if (!Array.isArray(raw)) fail(400, "VALIDATION", "The plan is invalid", "phases");
  let total = 0;
  const phases = (raw as any[]).slice(0, MAX_PHASES).map((p) => ({
    title: s(p?.title, 150),
    description: s(p?.description, 2000),
    stage: (STAGES as readonly string[]).includes(String(p?.stage)) ? (p.stage as Stage) : null,
    features: (Array.isArray(p?.features) ? p.features : []).slice(0, MAX_FEATURES).map((f: any) => ({
      title: s(f?.title, 150),
      description: s(f?.description, 2000),
      priority: prioOf(f?.priority),
      estimateHours: hoursOf(f?.estimateHours),
      tasks: (Array.isArray(f?.tasks) ? f.tasks : [])
        .slice(0, MAX_TASKS)
        .map((t: any) => ({ title: s(t?.title, 200), priority: prioOf(t?.priority), estimateHours: hoursOf(t?.estimateHours) }))
        .filter((t: DraftTask) => t.title.length >= 3 && ++total <= MAX_TOTAL_TASKS),
    })),
  }));
  return phases.filter((p) => p.title.length >= 2).map((p) => ({ ...p, features: p.features.filter((f: DraftFeature) => f.title.length >= 2) }));
}

/**
 * Writes the reviewed plan into the new project: phases, their features, and each feature's
 * tasks (to the owner, as a teammate creating their own work). Only on a project with no plan
 * yet, so a retry can't double it.
 */
export async function applyPlan(a: ProjectAccess, by: number, raw: unknown, planIsEmpty: boolean) {
  if (!a.isOwner) fail(403, "NOT_OWNER", "Only the project's owner can apply the AI plan");
  if (!planIsEmpty) fail(409, "PLAN_EXISTS", "This project already has a plan");
  const phases = parsePlan(raw);
  let items = 0;
  let tasks = 0;
  for (const p of phases) {
    const phaseId = await createItem(a, by, { kind: "PHASE", title: p.title, description: p.description || undefined, stage: p.stage ?? undefined });
    items++;
    for (const f of p.features) {
      const fid = await createItem(a, by, { kind: "FEATURE", parentId: phaseId, title: f.title, description: f.description || undefined, priority: f.priority, stage: p.stage ?? undefined, estimateHours: f.estimateHours ?? undefined });
      items++;
      for (const t of f.tasks) {
        await createTask(a, by, { planItemId: fid, title: t.title, priority: t.priority, estimateHours: t.estimateHours ?? undefined, assigneeId: by });
        tasks++;
      }
    }
  }
  return { phases: phases.length, items, tasks };
}
