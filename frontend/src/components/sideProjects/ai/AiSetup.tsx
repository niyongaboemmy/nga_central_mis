import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle, ArrowRight, Bot, CalendarRange, Check, ChevronDown, CircleHelp, FileText, Image as ImageIcon, ListChecks, Loader2, MessageSquare, PenLine, RotateCcw, Rocket, Send, Sparkles, Trash2, Wand2, X,
} from "lucide-react";
import { aiSetupApi, failure, type AiDocSlot, type AiDraft, type AiDraftPhase, type AiDraftResult, type AiProviders, type AiSetupFile, type AiTurn } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import SelectField from "../../ui/SelectField";
import { TextArea } from "../form";
import { Dropzone, Skeleton, Spinner, fmtBytes, inputCls, primaryBtn, secondaryBtn } from "../ui";

/**
 * "Set up with AI" (migration 140, never for students). Drop every document about the project,
 * add an extra prompt, pick Auto (or one AI), and the AI fills in the whole project. Then review it,
 * fix the plan, move files between slots and talk to it until it is right.
 */

export const AI_ACCEPT = ".pdf,.doc,.docx,.odt,.md,.txt,.rtf,.ppt,.pptx,.xls,.xlsx,.csv,.json,image/png,image/jpeg,image/webp";
const MAX_FILES = 12;

export interface AiApplied {
  draft: AiDraft;
  /** fileId → the browser's File, for the wizard's normal uploads */
  files: Record<string, File>;
  slots: Record<string, AiDocSlot>;
  phases: AiDraftPhase[];
  provider: string;
}

type Row = { key: string; file: File; state: "uploading" | "done" | "failed"; progress: number; info?: AiSetupFile; error?: string };

const SLOT_LABEL: Record<AiDocSlot, string> = {
  CONCEPT: "Concept note",
  SRS: "SRS",
  IMPLEMENTATION_PLAN: "Implementation plan",
  GALLERY: "Gallery",
  SKIP: "Don't attach",
};
const DOC_LIKE = ["pdf", "word", "markdown", "text", "slides", "sheet"];
/** Slots this kind of file may take (the server's document rules). */
export const slotsFor = (kind: string | null): AiDocSlot[] => {
  const k = String(kind);
  if (!DOC_LIKE.includes(k)) return ["GALLERY", "SKIP"];
  if (k === "sheet") return ["IMPLEMENTATION_PLAN", "GALLERY", "SKIP"];
  if (k === "slides") return ["CONCEPT", "IMPLEMENTATION_PLAN", "GALLERY", "SKIP"];
  return ["CONCEPT", "SRS", "IMPLEMENTATION_PLAN", "GALLERY", "SKIP"];
};

const PROMPT_IDEAS = [
  "This is a customer project for …",
  "Plan it for 3 months, starting next Monday",
  "We are a team of 3: a developer, a designer and a tester",
  "Focus the first release on the mobile app",
  "Keep tasks small: no task over 8 hours",
];

const WORK_STEPS = ["Reading your documents", "Understanding the idea", "Writing the concept note", "Choosing dates and stages", "Planning phases, features and tasks", "Sorting your files"];

const fmtChars = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
const fmtDay = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

const FileRow: React.FC<{ row: Row; onRemove: () => void; disabled?: boolean }> = ({ row, onRemove, disabled }) => {
  const i = row.info;
  const tone =
    row.state === "failed" || i?.status === "REFUSED"
      ? "border-red-200 bg-red-50/70 dark:border-red-500/30 dark:bg-red-500/10"
      : i?.status === "NO_TEXT"
        ? "border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10"
        : "border-slate-900/[0.07] bg-white dark:border-white/10 dark:bg-gray-800/40";
  const Icon = row.file.type.startsWith("image/") ? ImageIcon : FileText;
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} className={`flex items-center gap-3 rounded-2xl border p-3 ${tone}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
        {row.state === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{row.file.name}</span>
        <span className="block text-[11px] text-slate-600 dark:text-gray-300">
          {row.state === "uploading"
            ? row.progress < 100
              ? `Uploading · ${row.progress}%`
              : "Reading…"
            : row.state === "failed"
              ? row.error
              : i?.status === "READ"
                ? `${fmtBytes(row.file.size)} · ${i.pages ? `${i.pages} page${i.pages > 1 ? "s" : ""} · ` : ""}${fmtChars(i.chars)} characters read`
                : i?.note}
        </span>
        {row.state === "uploading" && (
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-700">
            <motion.span className="block h-full rounded-full bg-blue-500" animate={{ width: row.progress < 100 ? `${row.progress}%` : ["30%", "90%", "30%"] }} transition={row.progress < 100 ? { duration: 0.2 } : { duration: 1.4, repeat: Infinity }} />
          </span>
        )}
      </span>
      {row.state === "done" && i?.status === "READ" && <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Read" />}
      {(i?.status === "NO_TEXT" || i?.status === "REFUSED" || row.state === "failed") && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />}
      <button type="button" disabled={disabled || row.state === "uploading"} onClick={onRemove} aria-label={`Remove ${row.file.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-red-600 disabled:opacity-40 dark:hover:bg-gray-800">
        <Trash2 className="h-4 w-4" />
      </button>
    </motion.li>
  );
};

/** The waiting screen: the steps tick over while the AI works, so it never looks frozen. */
const Working: React.FC<{ files: number; refining?: boolean }> = ({ files, refining }) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => Math.min(x + 1, WORK_STEPS.length - 1)), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="mx-auto max-w-md py-8" role="status" aria-live="polite">
      <div className="flex flex-col items-center text-center">
        <motion.span animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.06, 1] }} transition={{ duration: 2.2, repeat: Infinity }} className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-600 text-white">
          <Sparkles className="h-8 w-8" aria-hidden />
        </motion.span>
        <p className="mt-4 text-base font-bold text-slate-900 dark:text-white">{refining ? "Updating your project" : "Setting up your project"}</p>
        <p className="text-xs text-slate-500 dark:text-gray-400">{files ? `${files} document${files > 1 ? "s" : ""}` : "Your instructions"} · this can take up to a minute</p>
      </div>
      <ol className="mt-6 space-y-2">
        {WORK_STEPS.map((s, i) => (
          <motion.li key={s} initial={{ opacity: 0 }} animate={{ opacity: i <= n ? 1 : 0.4 }} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm dark:bg-gray-800/40">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${i < n ? "bg-emerald-500 text-white" : i === n ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500 dark:bg-gray-700"}`}>
              {i < n ? <Check className="h-3.5 w-3.5" /> : i === n ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
            </span>
            <span className={i <= n ? "font-medium text-slate-800 dark:text-gray-100" : "text-slate-500 dark:text-gray-400"}>{s}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
};

const Filled: React.FC<{ ok: boolean; label: string; value?: React.ReactNode }> = ({ ok, label, value }) => (
  <li className="flex items-start gap-2.5 py-1.5 text-xs">
    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${ok ? "bg-emerald-500 text-white" : "bg-amber-400 text-white"}`}>{ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}</span>
    <span className="min-w-0">
      <span className="font-semibold text-slate-800 dark:text-gray-100">{label}</span>
      {value && <span className="block text-slate-600 dark:text-gray-300">{value}</span>}
    </span>
  </li>
);

/** The plan, editable: rename or remove phases, features and tasks before anything is created. */
const PlanTree: React.FC<{ phases: AiDraftPhase[]; onChange: (p: AiDraftPhase[]) => void }> = ({ phases, onChange }) => {
  const [open, setOpen] = useState<number | null>(0);
  const set = (fn: (p: AiDraftPhase[]) => void) => {
    const next = structuredClone(phases);
    fn(next);
    onChange(next);
  };
  const cell = "w-full rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-slate-800 hover:border-slate-900/10 focus:border-blue-500 focus:outline-none dark:text-gray-100 dark:hover:border-white/10";
  if (!phases.length) return <p className="rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:bg-gray-800/40 dark:text-gray-400">No plan. Ask the AI below to "add a plan".</p>;
  return (
    <ul className="space-y-2">
      {phases.map((p, pi) => {
        const tasks = p.features.reduce((n, f) => n + f.tasks.length, 0);
        return (
          <li key={pi} className="rounded-2xl border border-slate-900/[0.07] dark:border-white/10">
            <div className="flex items-center gap-2 px-2.5 py-2">
              <button type="button" onClick={() => setOpen(open === pi ? null : pi)} aria-expanded={open === pi} aria-label={`Show ${p.title}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800">
                <ChevronDown className={`h-4 w-4 transition ${open === pi ? "" : "-rotate-90"}`} />
              </button>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-[10px] font-bold text-white">{pi + 1}</span>
              <input aria-label="Phase title" value={p.title} onChange={(e) => set((x) => void (x[pi].title = e.target.value))} className={`${cell} text-sm font-semibold`} />
              <span className="hidden shrink-0 text-[11px] text-slate-500 sm:inline dark:text-gray-400">{p.features.length} features · {tasks} tasks</span>
              <button type="button" aria-label={`Remove ${p.title}`} onClick={() => set((x) => void x.splice(pi, 1))} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <AnimatePresence initial={false}>
              {open === pi && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1.5 overflow-hidden px-3 pb-3">
                  {p.features.map((f, fi) => (
                    <li key={fi} className="rounded-xl bg-slate-50 p-2 dark:bg-gray-800/40">
                      <div className="flex items-center gap-1.5">
                        <ListChecks className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden />
                        <input aria-label="Feature title" value={f.title} onChange={(e) => set((x) => void (x[pi].features[fi].title = e.target.value))} className={`${cell} text-xs font-semibold`} />
                        <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-gray-900 dark:text-gray-300">{f.priority}</span>
                        <button type="button" aria-label={`Remove ${f.title}`} onClick={() => set((x) => void x[pi].features.splice(fi, 1))} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-red-600">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <ul className="mt-1 space-y-0.5 pl-5">
                        {f.tasks.map((t, ti) => (
                          <li key={ti} className="flex items-center gap-1.5 text-xs">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-gray-600" aria-hidden />
                            <input aria-label="Task title" value={t.title} onChange={(e) => set((x) => void (x[pi].features[fi].tasks[ti].title = e.target.value))} className={cell} />
                            {t.estimateHours ? <span className="shrink-0 text-[10px] tabular-nums text-slate-500 dark:text-gray-400">{t.estimateHours}h</span> : null}
                            <button type="button" aria-label={`Remove ${t.title}`} onClick={() => set((x) => void x[pi].features[fi].tasks.splice(ti, 1))} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-red-600">
                              <X className="h-3 w-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
};

export interface AiSetupProps {
  /** Fill the wizard. "review" goes through the steps, "create" creates straight away. */
  onApply: (a: AiApplied, then: "review" | "create") => void;
  onManual: () => void;
  canClassify?: boolean;
}

const AiSetup: React.FC<AiSetupProps> = ({ onApply, onManual, canClassify }) => {
  const { showToast } = useToast();
  const [sid, setSid] = useState<string | null>(null);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [providers, setProviders] = useState<AiProviders | null>(null);
  const [provider, setProvider] = useState("auto");
  const [rows, setRows] = useState<Row[]>([]);
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<"gather" | "working" | "review">("gather");
  const [result, setResult] = useState<AiDraftResult | null>(null);
  const [plan, setPlan] = useState<AiDraftPhase[]>([]);
  const [slots, setSlots] = useState<Record<string, AiDocSlot>>({});
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [message, setMessage] = useState("");
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    Promise.all([aiSetupApi.start(), aiSetupApi.providers()])
      .then(([s, p]) => {
        if (!live) return;
        setSid(s.id);
        setProviders(p);
      })
      .catch((e) => live && setStartErr(failure(e, "AI setup isn't available right now").message));
    return () => {
      live = false;
    };
  }, []);
  // Scroll the conversation only (never the modal) to its latest message.
  useEffect(() => {
    const el = chatBox.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, refining]);

  const addFiles = (list: File[]) => {
    if (!sid) return;
    const room = MAX_FILES - rows.length;
    if (room <= 0) return showToast(`At most ${MAX_FILES} documents`, "warning");
    const fresh = list.filter((f) => !rows.some((r) => r.file.name === f.name && r.file.size === f.size)).slice(0, room);
    if (fresh.length < list.length) showToast(list.length - fresh.length === 1 ? "One file was already added or over the limit" : "Some files were already added or over the limit", "info");
    const added = fresh.map((file) => ({ key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, file, state: "uploading" as const, progress: 0 }));
    setRows((r) => [...r, ...added]);
    added.forEach(async (row) => {
      try {
        const info = await aiSetupApi.addFile(sid, row.file, (p) => setRows((r) => r.map((x) => (x.key === row.key ? { ...x, progress: p } : x))));
        setRows((r) => r.map((x) => (x.key === row.key ? { ...x, state: "done", progress: 100, info } : x)));
        if (info.status === "READ") showToast(`Read ${row.file.name}`, "success");
        else showToast(`${row.file.name}: ${info.note ?? "no text"}`, "warning");
      } catch (e) {
        const msg = failure(e, "Couldn't read this file").message;
        setRows((r) => r.map((x) => (x.key === row.key ? { ...x, state: "failed", error: msg } : x)));
        showToast(`${row.file.name}: ${msg}`, "error");
      }
    });
  };

  const removeRow = async (row: Row) => {
    setRows((r) => r.filter((x) => x.key !== row.key));
    if (sid && row.info) {
      try {
        await aiSetupApi.removeFile(sid, row.info.id);
        showToast(`Removed ${row.file.name}`, "info");
      } catch (e) {
        showToast(failure(e).message, "error");
      }
    }
  };

  const readable = rows.filter((r) => r.info?.status === "READ").length;
  const uploading = rows.some((r) => r.state === "uploading");
  const canRun = !!sid && !uploading && (readable > 0 || prompt.trim().length >= 20);

  const take = (r: AiDraftResult, keepSlots = false) => {
    setResult(r);
    setPlan(r.draft.phases);
    // A refinement keeps the owner's own choices of where each file goes.
    if (!keepSlots) setSlots(Object.fromEntries(r.draft.documents.map((d) => [d.fileId, d.slot])));
    setTurns(r.turns);
  };

  const run = async () => {
    if (!sid) return;
    setError(null);
    setPhase("working");
    try {
      const r = await aiSetupApi.draft(sid, { prompt: prompt.trim(), provider });
      take(r);
      setPhase("review");
      showToast(`Your project is ready to review · ${r.provider.label}`, "success");
    } catch (e) {
      const f = failure(e, "The AI couldn't set the project up. Try again");
      setError(f.message);
      setPhase("gather");
      showToast(f.message, "error");
    }
  };

  const refine = async (text = message) => {
    const ask = text.trim();
    if (!sid || ask.length < 2 || refining) return;
    setRefining(true);
    setMessage("");
    setTurns((t) => [...t, { role: "user", text: ask, at: new Date().toISOString() }]);
    try {
      // The owner's own edits to the plan go along, so the AI changes their version.
      const edited = JSON.stringify(plan) !== JSON.stringify(result?.draft.phases);
      const r = await aiSetupApi.refine(sid, { message: ask, provider, ...(edited ? { phases: plan } : {}) });
      take(r, true);
      showToast("Draft updated", "success");
    } catch (e) {
      const msg = failure(e, "The AI couldn't make that change").message;
      setTurns((t) => [...t, { role: "ai", text: `Sorry: ${msg}`, at: new Date().toISOString() }]);
      showToast(msg, "error");
    } finally {
      setRefining(false);
    }
  };

  const setSlot = (fileId: string, slot: AiDocSlot) =>
    setSlots((s) => {
      const next = { ...s };
      // One file per document slot: the one holding it goes to the gallery.
      if (slot === "CONCEPT" || slot === "SRS" || slot === "IMPLEMENTATION_PLAN") for (const k of Object.keys(next)) if (next[k] === slot) next[k] = "GALLERY";
      next[fileId] = slot;
      return next;
    });

  const apply = (then: "review" | "create") => {
    if (!result) return;
    const files: Record<string, File> = {};
    rows.forEach((r) => r.info && (files[r.info.id] = r.file));
    onApply({ draft: { ...result.draft, phases: plan }, files, slots, phases: plan, provider: result.provider.label }, then);
  };

  const order = useMemo(() => (providers?.list ?? []).map((p) => p.label).join(" → "), [providers]);
  const d = result?.draft;
  const tasks = plan.reduce((n, p) => n + p.features.reduce((m, f) => m + f.tasks.length, 0), 0);
  const features = plan.reduce((n, p) => n + p.features.length, 0);
  const hasConceptFile = Object.values(slots).includes("CONCEPT");
  const issues = (result?.issues ?? []).filter((i) => !(i.field === "concept" && hasConceptFile));

  if (startErr)
    return (
      <div className="space-y-4 py-6 text-center">
        <p role="alert" className="mx-auto max-w-md rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{startErr}</p>
        <button type="button" className={secondaryBtn} onClick={onManual}>
          <PenLine className="h-4 w-4" /> Fill it in myself
        </button>
      </div>
    );
  if (!sid || !providers)
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-1/2" />
      </div>
    );

  if (phase === "working") return <Working files={readable} />;

  if (phase === "review" && d)
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-2xl bg-blue-50 p-4 dark:bg-blue-500/10">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 dark:text-white">{d.title || "Your project"}</p>
            <p className="mt-0.5 text-xs text-slate-700 dark:text-gray-200">{d.summary}</p>
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-gray-900 dark:text-blue-300">
              <Bot className="h-3 w-3" aria-hidden /> Answered by {result!.provider.label}
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section aria-label="What the AI filled in" className="rounded-2xl border border-slate-900/[0.07] p-4 dark:border-white/10">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Filled in for you</p>
            <ul className="divide-y divide-slate-900/[0.05] dark:divide-white/5">
              <Filled ok={d.title.length >= 3} label="Title" value={d.title} />
              <Filled ok={d.abstract.length >= 40} label="Abstract" value={<span className="line-clamp-2">{d.abstract}</span>} />
              <Filled ok={d.problemStatement.length >= 30} label="Problem it solves" value={<span className="line-clamp-2">{d.problemStatement}</span>} />
              <Filled ok={hasConceptFile || (d.concept.solution.length >= 30 && d.concept.users.length >= 10 && d.concept.impact.length >= 10)} label="Concept note" value={hasConceptFile ? "Your uploaded file" : "Written from your documents"} />
              <Filled ok label="Dates" value={<span className="inline-flex items-center gap-1"><CalendarRange className="h-3 w-3" aria-hidden /> {fmtDay(d.startDate)} → {fmtDay(d.targetDate)}{d.stageEnds ? " · stages set" : ""}</span>} />
              <Filled ok={features > 0} label="Plan" value={`${plan.length} phases · ${features} features · ${tasks} tasks`} />
              {d.category && <Filled ok label="Category" value={d.category} />}
              {d.techTags.length > 0 && <Filled ok label="Technologies" value={d.techTags.join(", ")} />}
              {canClassify && <Filled ok label="Project type" value={d.kind === "DELIVERY_STUDIO" ? "NGA Delivery Studio" : "Individual"} />}
              {d.customerName && <Filled ok label="Customer" value={`${d.customerName}: confirm it in Links & team`} />}
              {(d.githubUrl || d.accessUrl) && <Filled ok label="Links" value={[d.githubUrl, d.accessUrl].filter(Boolean).join(" · ")} />}
            </ul>
            {issues.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                {issues.map((i) => (
                  <li key={i.field} className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {i.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Your files" className="rounded-2xl border border-slate-900/[0.07] p-4 dark:border-white/10">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Where your files go</p>
            {rows.filter((r) => r.info).length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-gray-400">No files: the concept note is written for you.</p>
            ) : (
              <ul className="space-y-2">
                {rows
                  .filter((r) => r.info)
                  .map((r) => {
                    const id = r.info!.id;
                    const why = d.documents.find((x) => x.fileId === id)?.why;
                    return (
                      <li key={r.key} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-slate-800 dark:text-gray-100">{r.file.name}</span>
                          {why && <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">{why}</span>}
                        </span>
                        <SelectField aria-label={`Where ${r.file.name} goes`} value={slots[id] ?? "GALLERY"} onChange={(e) => setSlot(id, e.target.value as AiDocSlot)} className={`${inputCls} !w-44 !py-1.5 text-xs`}>
                          {slotsFor(r.info!.kind).map((s) => (
                            <option key={s} value={s}>{SLOT_LABEL[s]}</option>
                          ))}
                        </SelectField>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        </div>

        <section aria-label="Plan" className="rounded-2xl border border-slate-900/[0.07] p-4 dark:border-white/10">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Plan · click a name to rename it</p>
            <span className="text-[11px] tabular-nums text-slate-500 dark:text-gray-400">{tasks} tasks, all assigned to you</span>
          </div>
          <PlanTree phases={plan} onChange={setPlan} />
        </section>

        <section aria-label="Talk to the AI" className="rounded-2xl border border-slate-900/[0.07] dark:border-white/10">
          <p className="flex items-center gap-1.5 border-b border-slate-900/[0.06] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-white/5 dark:text-gray-400">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Ask for any change
          </p>
          <div ref={chatBox} className="max-h-64 space-y-2 overflow-y-auto px-4 py-3" aria-live="polite">
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-xs ${t.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800 dark:bg-gray-800 dark:text-gray-100"}`}>{t.text}</p>
              </div>
            ))}
            {refining && (
              <div className="flex justify-start">
                <span className="inline-flex items-center gap-1 rounded-2xl bg-slate-100 px-3 py-2.5 dark:bg-gray-800" aria-label="AI is writing">
                  {[0, 1, 2].map((i) => (
                    <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
                  ))}
                </span>
              </div>
            )}
          </div>
          {(d.questions.length > 0 || d.assumptions.length > 0) && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {d.questions.map((q) => (
                <button key={q} type="button" disabled={refining} onClick={() => setMessage(`${q} → `)} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-2.5 py-1 text-left text-[11px] font-medium text-blue-700 transition hover:bg-blue-50 dark:border-blue-500/30 dark:bg-gray-900 dark:text-blue-300">
                  <CircleHelp className="h-3 w-3 shrink-0" aria-hidden /> {q}
                </button>
              ))}
              {d.assumptions.map((a) => (
                <span key={a} title="An assumption the AI made" className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 dark:bg-gray-800 dark:text-gray-300">Assumed: {a}</span>
              ))}
            </div>
          )}
          <form
            className="flex items-end gap-2 border-t border-slate-900/[0.06] p-3 dark:border-white/5"
            onSubmit={(e) => {
              e.preventDefault();
              refine();
            }}
          >
            <TextArea
              aria-label="Ask the AI for a change"
              rows={1}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  refine();
                }
              }}
              placeholder='e.g. "Make it 2 months" or "Add a testing phase"'
              className="min-h-[40px] flex-1 resize-none"
              disabled={refining}
            />
            <button type="submit" className={`${primaryBtn} !px-3`} disabled={refining || message.trim().length < 2} aria-label="Send">
              {refining ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </section>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-900/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/5">
          <button type="button" className={secondaryBtn} onClick={() => (setPhase("gather"), setResult(null))} disabled={refining}>
            <RotateCcw className="h-4 w-4" /> Change documents
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className={secondaryBtn} onClick={() => apply("review")} disabled={refining}>
              Review each step <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" className={primaryBtn} onClick={() => apply("create")} disabled={refining || issues.length > 0} title={issues.length ? "Fix the items above first, or review each step" : undefined}>
              <Rocket className="h-4 w-4" /> Create project
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-2xl bg-blue-50 p-4 dark:bg-blue-500/10">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 dark:bg-gray-800 dark:text-blue-300">
          <Wand2 className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-sm text-slate-700 dark:text-gray-200">
          Add <span className="font-semibold">every document</span> about the project: proposal, requirements, plan, contract, notes, screenshots. The AI reads them and fills in the whole project, plan and tasks included. You check everything before it is created.
        </p>
      </div>

      <div className="space-y-3">
        <Dropzone multiple onFiles={addFiles} accept={AI_ACCEPT} label="Drop the project's documents here" hint={`or click to browse · PDF, Word, PowerPoint, Excel, Markdown, images · up to ${MAX_FILES}`} disabled={rows.length >= MAX_FILES} />
        {rows.length > 0 && (
          <ul className="space-y-2" aria-label="Documents">
            <AnimatePresence initial={false}>
              {rows.map((r) => (
                <FileRow key={r.key} row={r} onRemove={() => removeRow(r)} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div>
        <label htmlFor="ai-extra" className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 dark:text-gray-200">
          <MessageSquare className="h-4 w-4 text-slate-500" aria-hidden /> Extra prompt
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-gray-800 dark:text-gray-300">Optional</span>
        </label>
        <TextArea id="ai-extra" rows={3} value={prompt} maxLength={4000} onChange={(e) => setPrompt(e.target.value)} placeholder="Anything the documents don't say: the customer, the deadline, the team, what to build first…" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PROMPT_IDEAS.map((idea) => (
            <button key={idea} type="button" onClick={() => setPrompt((p) => (p.trim() ? `${p.trim()}\n${idea}` : idea))} className="rounded-full border border-slate-900/[0.07] px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-white/10 dark:text-gray-300">
              + {idea}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-slate-700 dark:text-gray-200">AI</p>
        {!providers.auto ? (
          <p role="alert" className="rounded-2xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">No AI is set up for the school yet. Fill the project in yourself for now.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Which AI answers">
            <button type="button" role="radio" aria-checked={provider === "auto"} onClick={() => setProvider("auto")} title={`Tries ${order} until one answers`} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${provider === "auto" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-900/[0.07] text-slate-600 hover:border-blue-300 dark:border-white/10 dark:text-gray-300"}`}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Auto
            </button>
            {providers.list.map((p) => (
              <button
                key={p.name}
                type="button"
                role="radio"
                aria-checked={provider === p.name}
                onClick={() => setProvider(p.name)}
                title={p.ready ? `${p.label} first, then the others` : `${p.label} is resting: the others answer first`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${provider === p.name ? "border-blue-600 bg-blue-600 text-white" : "border-slate-900/[0.07] text-slate-600 hover:border-blue-300 dark:border-white/10 dark:text-gray-300"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${p.ready ? "bg-emerald-500" : "bg-amber-400"}`} aria-hidden /> {p.label}
              </button>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-gray-400">Auto uses whichever school AI is free right now ({order || "none"}) and moves on if one is busy.</p>
      </div>

      {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

      <div className="flex flex-col-reverse gap-2 border-t border-slate-900/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/5">
        <button type="button" className={secondaryBtn} onClick={onManual}>
          <PenLine className="h-4 w-4" /> Fill it in myself
        </button>
        <button type="button" className={primaryBtn} onClick={run} disabled={!canRun || !providers.auto}>
          {uploading ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {uploading ? "Reading documents…" : "Let AI set it up"}
        </button>
      </div>
      {!canRun && !uploading && <p className="-mt-3 text-right text-[11px] text-slate-500 dark:text-gray-400">Add a document with text, or write at least 20 characters in the extra prompt.</p>}
    </div>
  );
};

export default AiSetup;
