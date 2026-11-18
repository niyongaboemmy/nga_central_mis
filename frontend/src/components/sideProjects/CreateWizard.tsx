import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Calendar, CalendarRange, Check, Flag, GanttChartSquare, Clock, Download, FileCheck2, FileText, FileUp, Github, Globe, Image as ImageIcon, Lightbulb, Link2, Paperclip, PenLine, Rocket, Sparkles, Target, Trash2, UserCheck, Users, Wand2, X,
} from "lucide-react";
import { failure, sideProjectsApi, type Category, type Kind, type Status } from "../../api/sideProjects";
import { useSpMe } from "./useMe";
import { CustomerField } from "./customers/CustomerParts";
import type { Customer } from "../../api/sideProjects";
import { CategoryPicker, PersonPicker, TagInput, checkGithub, checkHttps } from "./fields";
import { Field, FormModal, FormSection, IconInput, OptionCards, TextArea } from "./form";
import PlanEditor, { MIN_PROJECT_DAYS, addDays, clampEnds, defaultEnds, endsToDates, spanDays } from "./PlanEditor";
import { KIND_META, KINDS, CATEGORY_ICON, Dropzone, ProgressRing, STATUS_META, Spinner, fmtBytes, inputCls, primaryBtn, secondaryBtn, statusColor, useIsDark } from "./ui";

const DOC_ACCEPT = ".pdf,.doc,.docx,.odt,.md,.txt,.ppt,.pptx";
const STEPS = [
  { key: "basics", icon: Lightbulb, label: "The idea", caption: "Title, problem, category" },
  { key: "concept", icon: FileCheck2, label: "Concept note", caption: "Upload or write it" },
  { key: "attachments", icon: Paperclip, label: "Attachments", caption: "Optional · now or later" },
  { key: "timeline", icon: GanttChartSquare, label: "Timeline", caption: "Start, closing, stages" },
  { key: "launch", icon: Rocket, label: "Links & team", caption: "All optional" },
] as const;

export interface WizardProps {
  open: boolean;
  initialStatus?: Status;
  categories: Category[];
  onClose: () => void;
  onCreated: (id: number) => void;
}

type Errors = Partial<Record<string, string>>;

const todayIso = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
};
/** The same day n months after `from` (end of month when it doesn't exist), minus one day. */
const plusMonths = (from: string, n: number) => {
  const d = new Date(`${from}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return addDays(d.toISOString().slice(0, 10), -1);
};
/** Where a new project may start (the server takes Idea, Planning or Building). */
const START_IN: Status[] = ["IDEA", "PLANNING", "IN_PROGRESS"];
const startable = (s: Status): Status => (START_IN.includes(s) ? s : "IN_PROGRESS");

/** Step band: three segments that fill as you go, each a button back to a finished step. */
const StepBand: React.FC<{ step: number; onGo: (i: number) => void }> = ({ step, onGo }) => (
  <ol className="grid grid-cols-5 gap-2" aria-label="Steps">
    {STEPS.map((s, i) => {
      const state = i < step ? "done" : i === step ? "now" : "next";
      return (
        <li key={s.key}>
          <button
            type="button"
            onClick={() => i < step && onGo(i)}
            disabled={i >= step}
            aria-current={state === "now" ? "step" : undefined}
            className="group w-full text-left focus:outline-none disabled:cursor-default"
          >
            <span className="relative block h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-gray-700/60">
              <motion.span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-600 to-blue-500" initial={false} animate={{ width: state === "next" ? "0%" : "100%" }} transition={{ duration: 0.35 }} />
            </span>
            <span className="mt-2 flex items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition ${
                  state === "done" ? "bg-emerald-500 text-white" : state === "now" ? "bg-blue-600 text-white ring-4 ring-blue-600/15" : "bg-slate-100 text-slate-400 dark:bg-gray-800 dark:text-gray-500"
                }`}
              >
                {state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`hidden truncate text-xs font-semibold sm:block ${state === "next" ? "text-slate-400 dark:text-gray-500" : "text-slate-800 group-hover:text-blue-700 dark:text-gray-100"}`}>{s.label}</span>
                <span className="hidden truncate text-[11px] text-slate-500 lg:block dark:text-gray-400">{s.caption}</span>
              </span>
            </span>
          </button>
        </li>
      );
    })}
  </ol>
);

/** Live preview: the card exactly as it will look on the board, plus what is still missing. */
const Preview: React.FC<{
  title: string;
  category: Category | null;
  tags: string[];
  status: Status;
  conceptReady: boolean;
  hasGithub: boolean;
  hasLive: boolean;
  target: string;
  checks: Array<{ label: string; ok: boolean }>;
  srs?: boolean;
  plan?: boolean;
  mediaCount?: number;
  cover?: string | null;
}> = ({ title, category, tags, status, conceptReady, hasGithub, hasLive, target, checks, srs, plan, mediaCount = 0, cover }) => {
  const dark = useIsDark();
  const Icon = CATEGORY_ICON[category?.icon ?? "sparkles"] ?? Sparkles;
  const accent = category?.color ?? statusColor(status, dark);
  const S = STATUS_META[status];
  const done = checks.filter((c) => c.ok).length;
  return (
    <aside className="space-y-4" aria-label="Preview">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Preview</p>
      <motion.div layout className="overflow-hidden rounded-2xl border border-slate-900/[0.07] bg-white dark:border-white/[0.06] dark:bg-gray-800/40">
        <div className="relative h-28 overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}0d)` }}>
          {cover && <motion.img key={cover} src={cover} alt="" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 h-full w-full object-cover" />}
          <motion.div key={category?.id ?? "none"} initial={{ scale: 0.6, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} className="flex h-full items-center justify-center">
            <Icon className="h-12 w-12" style={{ color: accent }} aria-hidden />
          </motion.div>
          <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full" style={{ backgroundColor: `${accent}1f` }} aria-hidden />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold dark:bg-gray-900/80" style={{ color: statusColor(status, dark) }}>
            <S.icon className="h-3 w-3" aria-hidden /> {S.label}
          </span>
        </div>
        <div className="space-y-2.5 p-4">
          <p className={`line-clamp-2 text-sm font-bold ${title ? "text-slate-900 dark:text-white" : "italic text-slate-500 dark:text-gray-400"}`}>{title || "Your project title"}</p>
          <div className="flex min-h-[22px] flex-wrap gap-1">
            {(tags.length ? tags : ["Tech", "Stack"]).slice(0, 4).map((t) => (
              <span key={t} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tags.length ? "bg-slate-100 text-slate-600 dark:bg-gray-700/60 dark:text-gray-300" : "border border-dashed border-slate-900/10 text-slate-500 dark:border-gray-600 dark:text-gray-400"}`}>
                {t}
              </span>
            ))}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-700/60">
            <motion.div className="h-full rounded-full" style={{ backgroundColor: statusColor(status, dark) }} animate={{ width: status === "IN_PROGRESS" ? "40%" : status === "PLANNING" ? "15%" : "0%" }} />
          </div>
          <div className="flex items-center justify-between text-slate-500 dark:text-gray-400">
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-lg ${conceptReady ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 dark:bg-gray-700/60"}`} title="Concept note">
              <FileCheck2 className="h-3.5 w-3.5" aria-hidden />
            </span>
            {([["SRS", srs], ["Plan", plan]] as const).map(([l, on]) => (
              <span key={l} className={`ml-1 inline-flex h-6 items-center rounded-lg px-1.5 text-[10px] font-bold ${on ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-gray-700/60 dark:text-gray-300"}`} title={l}>
                {l}
              </span>
            ))}
            <span className="ml-auto flex items-center gap-2">
              {mediaCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold" title="Files">
                  <ImageIcon className="h-3 w-3" aria-hidden />
                  {mediaCount}
                </span>
              )}
              {target && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold">
                  <Calendar className="h-3 w-3" aria-hidden />
                  {new Date(`${target}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })}
                </span>
              )}
              {hasGithub && <Github className="h-3.5 w-3.5 text-slate-600 dark:text-gray-300" aria-label="GitHub" />}
              {hasLive && <Globe className="h-3.5 w-3.5 text-slate-600 dark:text-gray-300" aria-label="Live link" />}
            </span>
          </div>
        </div>
      </motion.div>

      <div className="rounded-2xl border border-slate-900/[0.07] bg-slate-50/70 p-4 dark:border-white/[0.06] dark:bg-gray-800/30">
        <div className="flex items-center gap-3">
          <ProgressRing value={Math.round((done / checks.length) * 100)} size={48} stroke={5} color={done === checks.length ? "#10b981" : "#2563eb"}>
            {done}/{checks.length}
          </ProgressRing>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-gray-100">{done === checks.length ? "Ready to create" : "Required"}</p>
            <p className="text-xs text-slate-500 dark:text-gray-400">Everything else can wait</p>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-xs">
              <motion.span
                animate={{ scale: c.ok ? [1, 1.25, 1] : 1 }}
                className={`flex h-5 w-5 items-center justify-center rounded-full ${c.ok ? "bg-emerald-500 text-white" : "border-2 border-slate-900/10 dark:border-gray-600"}`}
              >
                {c.ok && <Check className="h-3 w-3" />}
              </motion.span>
              <span className={c.ok ? "text-slate-700 dark:text-gray-200" : "text-slate-500 dark:text-gray-400"}>{c.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
};

/** An optional brand image: drop or pick, see it at once, remove it. PNG/JPG/WebP up to 10 MB. */
const ImageSlot: React.FC<{ label: string; hint: string; file: File | null; onFile: (f: File | null) => void; shape: "square" | "wide" }> = ({ label, hint, file, onFile, shape }) => {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  const [err, setErr] = useState<string | null>(null);
  const take = (fs: File[]) => {
    const f = fs[0];
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return setErr("Use a PNG, JPG or WebP image");
    if (f.size > 10 * 1048576) return setErr("At most 10 MB");
    setErr(null);
    onFile(f);
  };
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-slate-700 dark:text-gray-200">
        {label} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-gray-800 dark:text-gray-300">Optional</span>
      </p>
      {url ? (
        <div className={`group relative overflow-hidden rounded-2xl border border-slate-900/[0.07] bg-slate-50 dark:border-white/10 dark:bg-gray-800 ${shape === "square" ? "aspect-square" : "aspect-[3/1]"}`}>
          <img src={url} alt={`${label} preview`} className="h-full w-full object-cover" />
          <button type="button" aria-label={`Remove ${label.toLowerCase()}`} onClick={() => onFile(null)} className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 transition hover:text-red-600 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:text-red-400">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className={shape === "square" ? "aspect-square" : "aspect-[3/1]"}>
          <Dropzone compact onFiles={take} accept="image/png,image/jpeg,image/webp" label={`Add a ${label.toLowerCase()}`} hint={hint} icon={ImageIcon} error={err} />
        </div>
      )}
    </div>
  );
};

/** One optional document: a compact dropzone, or the chosen file with a remove button. */
const DocSlot: React.FC<{ label: string; file: File | null; onFile: (f: File | null) => void; accept: string; template: string }> = ({ label, file, onFile, accept, template }) => (
  <div>
    <p className="mb-1.5 text-[13px] font-semibold text-slate-700 dark:text-gray-200">{label}</p>
    <AnimatePresence mode="wait">
      {file ? (
        <motion.div key="f" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
            <Check className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{file.name}</span>
            <span className="text-[11px] text-slate-600 dark:text-gray-300">{fmtBytes(file.size)}</span>
          </span>
          <button type="button" aria-label={`Remove ${label}`} onClick={() => onFile(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-red-600 dark:hover:bg-gray-800">
            <Trash2 className="h-4 w-4" />
          </button>
        </motion.div>
      ) : (
        <motion.div key="d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Dropzone compact onFiles={(f) => onFile(f[0])} accept={accept} label={`Add the ${label}`} hint="PDF · Word · Markdown" />
        </motion.div>
      )}
    </AnimatePresence>
    <a href={template} download className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-300">
      <Download className="h-3 w-3" /> Template
    </a>
  </div>
);

/** New project in four steps. The concept note (a file or the short written form) is required. */
const CreateWizard: React.FC<WizardProps> = ({ open, initialStatus = "IDEA", categories, onClose, onCreated }) => {
  const dark = useIsDark();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [mode, setMode] = useState<"upload" | "write">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [srs, setSrs] = useState<File | null>(null);
  const [plan, setPlan] = useState<File | null>(null);
  const [media, setMedia] = useState<File[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [mediaErr, setMediaErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [attachNote, setAttachNote] = useState<string | null>(null);
  const [written, setWritten] = useState({ users: "", solution: "", impact: "" });
  const [github, setGithub] = useState("");
  const [access, setAccess] = useState("");
  const [start, setStart] = useState(todayIso);
  const [target, setTarget] = useState("");
  const [ends, setEnds] = useState<number[]>([]);
  const [supervisor, setSupervisor] = useState<{ id: number; name: string } | null>(null);
  const [status, setStatus] = useState<Status>(initialStatus);
  const me = useSpMe();
  const [kind, setKind] = useState<Kind>("INDIVIDUAL");
  const [customerMode, setCustomerMode] = useState<"OWN" | "CUSTOMER">("OWN");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setTitle("");
      setProblem("");
      setCategoryId(null);
      setTags([]);
      setMode("upload");
      setFile(null);
      setSrs(null);
      setPlan(null);
      setMedia([]);
      setLogoFile(null);
      setCoverFile(null);
      setMediaErr(null);
      setPhase(null);
      setAttachNote(null);
      setWritten({ users: "", solution: "", impact: "" });
      setGithub("");
      setAccess("");
      setStart(todayIso());
      setTarget("");
      setEnds([]);
      setSupervisor(null);
      setStatus(startable(initialStatus));
      setKind("INDIVIDUAL");
      setCustomerMode("OWN");
      setCustomer(null);
      setErrors({});
      setDone(false);
    }
  }, [open, initialStatus]);

  const conceptReady = mode === "upload" ? !!file : written.users.trim().length >= 10 && written.solution.trim().length >= 30 && written.impact.trim().length >= 10;
  const checks = [
    { label: "A title", ok: title.trim().length >= 3 },
    { label: "The problem it solves", ok: problem.trim().length >= 30 },
    { label: "A concept note", ok: conceptReady },
    { label: "Start and closing dates", ok: !!start && spanDays(start, target) >= MIN_PROJECT_DAYS },
  ];

  const check = (s: number): Errors => {
    const e: Errors = {};
    if (s === 0) {
      if (title.trim().length < 3) e.title = "At least 3 characters";
      if (title.trim().length > 150) e.title = "At most 150 characters";
      if (problem.trim().length < 30) e.problemStatement = `${30 - problem.trim().length} more characters`;
    }
    if (s === 1) {
      if (mode === "upload" && !file) e.concept = "Add the concept note";
      if (mode === "write") {
        if (written.users.trim().length < 10) e["concept.users"] = "At least 10 characters";
        if (written.solution.trim().length < 30) e["concept.solution"] = "At least 30 characters";
        if (written.impact.trim().length < 10) e["concept.impact"] = "At least 10 characters";
      }
    }
    if (s === 3) {
      if (!start) e.startDate = "Choose the start date";
      if (!target) e.targetDate = "Choose the closing date";
      else if (start && spanDays(start, target) < MIN_PROJECT_DAYS) e.targetDate = `At least ${MIN_PROJECT_DAYS} days after the start`;
    }
    if (s === 4) {
      if (customerMode === "CUSTOMER" && !customer) e.customerId = "Choose or register the customer";
      const g = checkGithub(github);
      if (g) e.githubUrl = g;
      const a = checkHttps(access);
      if (a) e.accessUrl = a;
    }
    return e;
  };

  const go = (to: number) => {
    if (to > step) {
      const e = check(step);
      setErrors(e);
      if (Object.keys(e).length) return;
    }
    setDir(to > step ? 1 : -1);
    setStep(to);
  };

  const submit = async () => {
    const all = { ...check(0), ...check(1), ...check(3), ...check(4) };
    setErrors(all);
    if (Object.keys(all).length) {
      if (all.title || all.problemStatement) setStep(0);
      else if (Object.keys(all).some((k) => k.startsWith("concept"))) setStep(1);
      else if (all.startDate || all.targetDate) setStep(3);
      else setStep(4);
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const fields: Record<string, unknown> = {
        title: title.trim(),
        problemStatement: problem.trim(),
        categoryId,
        techTags: tags,
        githubUrl: github.trim() || undefined,
        accessUrl: access.trim() || undefined,
        startDate: start,
        targetDate: target,
        stagePlan: ends.length === 3 ? endsToDates(start, ends) : undefined,
        supervisorId: supervisor?.id,
        status,
        ...(me?.classify ? { kind } : {}),
        customerMode,
        customerId: customerMode === "CUSTOMER" ? customer?.id : undefined,
      };
      if (mode === "write") fields.conceptWritten = { problem: problem.trim(), ...written };
      setPhase(mode === "upload" ? "Uploading the concept" : "Creating");
      const r = await sideProjectsApi.create(fields, mode === "upload" ? file : null, setProgress);
      // Attachments go up right after the project exists; a failed one never undoes the project.
      const jobs: Array<[string, () => Promise<unknown>]> = [
        ...(srs ? ([["SRS", () => sideProjectsApi.uploadDocument(r.id, "SRS", srs, setProgress)]] as Array<[string, () => Promise<unknown>]>) : []),
        ...(plan ? ([["implementation plan", () => sideProjectsApi.uploadDocument(r.id, "IMPLEMENTATION_PLAN", plan, setProgress)]] as Array<[string, () => Promise<unknown>]>) : []),
        ...(media.length ? ([[`${media.length} file${media.length > 1 ? "s" : ""}`, () => sideProjectsApi.uploadMedia(r.id, media, setProgress)]] as Array<[string, () => Promise<unknown>]>) : []),
        ...(logoFile ? ([["logo", () => sideProjectsApi.setBranding(r.id, "logo", logoFile, setProgress)]] as Array<[string, () => Promise<unknown>]>) : []),
        ...(coverFile ? ([["cover", () => sideProjectsApi.setBranding(r.id, "cover", coverFile, setProgress)]] as Array<[string, () => Promise<unknown>]>) : []),
      ];
      const failed: string[] = [];
      for (const [i, [label, run]] of jobs.entries()) {
        setPhase(`Attachments ${i + 1}/${jobs.length}`);
        setProgress(0);
        try {
          await run();
        } catch (e) {
          failed.push(`${label} (${failure(e).message})`);
        }
      }
      if (failed.length) setAttachNote(`Couldn't attach: ${failed.join("; ")}. Add it from the project's tabs.`);
      setDone(true);
      setTimeout(() => onCreated(r.id), failed.length ? 3500 : 1100);
    } catch (e) {
      const f = failure(e);
      setErrors({ [f.field ?? "form"]: f.message });
      if (f.field === "title" || f.field === "problemStatement") setStep(0);
      else if (f.field?.startsWith("concept") || f.field === "file") setStep(1);
      else if (f.field === "startDate" || f.field === "targetDate" || f.field?.startsWith("plan")) setStep(3);
    } finally {
      setBusy(false);
      setPhase(null);
    }
  };

  const attachCount = (srs ? 1 : 0) + (plan ? 1 : 0) + media.length + (logoFile ? 1 : 0) + (coverFile ? 1 : 0);
  const addMedia = (files: File[]) => {
    setMediaErr(null);
    const video = files.find((f) => /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(f.name));
    if (video) setMediaErr("Videos aren't uploaded: add them as a Video link.");
    const ok = files.filter((f) => f !== video && !media.some((m) => m.name === f.name && m.size === f.size));
    const next = [...media, ...ok];
    if (next.length > 10) setMediaErr("Up to 10 files at once. Add more later from the Gallery.");
    setMedia(next.slice(0, 10));
  };
  const previews = useMemo(() => media.map((m) => (m.type.startsWith("image/") ? URL.createObjectURL(m) : null)), [media]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);
  const brandCover = useMemo(() => (coverFile ? URL.createObjectURL(coverFile) : null), [coverFile]);
  useEffect(() => () => void (brandCover && URL.revokeObjectURL(brandCover)), [brandCover]);
  const coverPreview = brandCover ?? previews.find(Boolean) ?? null;

  const err = (k: string) => errors[k];
  const variants = useMemo(() => ({ enter: (d: number) => ({ x: d * 32, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: d * -32, opacity: 0 }) }), []);
  const category = categories.find((c) => c.id === categoryId) ?? null;
  const quickDates: Array<[string, string]> = start
    ? [
        ["2 weeks", addDays(start, 13)],
        ["1 month", plusMonths(start, 1)],
        ["3 months", plusMonths(start, 3)],
        ["6 months", plusMonths(start, 6)],
      ]
    : [];
  /** New dates keep the stage proportions the person chose. */
  const redate = (s0: string, t0: string) => {
    const oldTotal = spanDays(start, target);
    const total = spanDays(s0, t0);
    if (total < MIN_PROJECT_DAYS) return setEnds([]);
    if (ends.length === 3 && oldTotal >= MIN_PROJECT_DAYS) setEnds(clampEnds(ends.map((e) => ((e + 1) / oldTotal) * total - 1), total));
    else setEnds(defaultEnds(total));
  };
  const LAST = STEPS.length - 1;

  const footer = done ? null : (
    <>
      <button type="button" className={secondaryBtn} onClick={() => (step === 0 ? onClose() : go(step - 1))} disabled={busy}>
        <ArrowLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
      </button>
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-slate-500 sm:inline dark:text-gray-400">Step {step + 1} of {STEPS.length}</span>
        {step === 2 && attachCount === 0 ? (
          <button type="button" className={primaryBtn} onClick={() => go(step + 1)}>
            <Clock className="h-4 w-4" /> Do it later &amp; continue
          </button>
        ) : step < LAST ? (
          <button type="button" className={primaryBtn} onClick={() => go(step + 1)}>
            Continue{step === 2 ? ` with ${attachCount}` : ""} <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" className={primaryBtn} onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Spinner className="h-4 w-4" /> {phase ?? "Creating"}{progress > 0 && progress < 100 ? ` · ${progress}%` : ""}
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" /> Create project
              </>
            )}
          </button>
        )}
      </div>
    </>
  );

  return (
    <FormModal
      open={open}
      onClose={() => !busy && onClose()}
      busy={busy}
      size="xl"
      icon={Wand2}
      title="New project"
      subtitle={done ? "All set" : "Five quick steps. The idea, the concept note and the dates are required."}
      band={done ? undefined : <StepBand step={step} onGo={go} />}
      footer={footer}
    >
      {done ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative flex flex-col items-center gap-4 py-12 text-center">
          {[...Array(10)].map((_, i) => (
            <motion.span
              key={i}
              className="absolute h-2 w-2 rounded-full"
              style={{ backgroundColor: ["#2563eb", "#2563eb", "#10b981", "#f59e0b", "#eb6834"][i % 5], top: "45%", left: "50%" }}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: Math.cos((i / 10) * Math.PI * 2) * 140, y: Math.sin((i / 10) * Math.PI * 2) * 90, opacity: 0 }}
              transition={{ duration: 1 }}
              aria-hidden
            />
          ))}
          <motion.span initial={{ rotate: -45, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 12 }} className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white ">
            <Check className="h-10 w-10" />
          </motion.span>
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{title}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Added to {STATUS_META[status].label}{attachCount && !attachNote ? ` with ${attachCount} attachment${attachCount > 1 ? "s" : ""}` : ""}</p>
            {attachNote && <p role="alert" className="mx-auto mt-3 max-w-md rounded-2xl bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">{attachNote}</p>}
          </div>
        </motion.div>
      ) : (
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="relative min-w-0">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div key={step} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.18 }} className="space-y-6">
                {step === 0 && (
                  <>
                    <Field label="Project title" htmlFor="sp-title" counter={{ value: title, min: 3, max: 150 }} error={err("title")}>
                      <input id="sp-title" data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputCls} text-base font-semibold ${err("title") ? "!border-red-400" : ""}`} placeholder="e.g. Smart irrigation for school gardens" />
                    </Field>
                    <Field label="Problem it solves" htmlFor="sp-problem" counter={{ value: problem, min: 30, max: 3000 }} error={err("problemStatement")} hint="Who has the problem, and why it matters.">
                      <TextArea id="sp-problem" rows={4} value={problem} onChange={(e) => setProblem(e.target.value)} invalid={!!err("problemStatement")} placeholder="Describe the problem in a few sentences…" />
                    </Field>
                    {me?.classify ? (
                      <Field label="Project type">
                        <OptionCards
                          label="Project type"
                          value={kind}
                          onChange={setKind}
                          options={KINDS.map((k) => ({ value: k, title: KIND_META[k].short, caption: KIND_META[k].hint, icon: KIND_META[k].icon }))}
                        />
                      </Field>
                    ) : (
                      me && (
                        <p className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:bg-gray-800/40 dark:text-gray-300">
                          {React.createElement(KIND_META.STUDENT.icon, { className: "h-4 w-4 text-slate-500", "aria-hidden": true })}
                          This will be a <span className="font-semibold text-slate-800 dark:text-gray-100">Student project</span>.
                        </p>
                      )
                    )}
                    <Field label="Category" optional>
                      <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
                    </Field>
                    <Field label="Technologies" optional hint="Press Enter or a comma after each one.">
                      <TagInput value={tags} onChange={setTags} />
                    </Field>
                  </>
                )}

                {step === 1 && (
                  <>
                    <OptionCards
                      label="How to add the concept note"
                      value={mode}
                      onChange={setMode}
                      options={[
                        { value: "upload", title: "Upload a file", caption: "PDF, Word or Markdown", icon: FileUp },
                        { value: "write", title: "Write it here", caption: "Four short answers", icon: PenLine },
                      ]}
                    />
                    {mode === "upload" ? (
                      <div className="space-y-3">
                        <AnimatePresence mode="wait">
                          {file ? (
                            <motion.div key="file" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white ">
                                <Check className="h-6 w-6" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{file.name}</p>
                                <p className="text-xs text-slate-600 dark:text-gray-300">{fmtBytes(file.size)} · ready</p>
                              </div>
                              <button type="button" aria-label="Remove file" onClick={() => setFile(null)} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-red-600 dark:hover:bg-gray-800">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </motion.div>
                          ) : (
                            <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                              <Dropzone onFiles={(f) => (setFile(f[0]), setErrors((e) => ({ ...e, concept: undefined })))} accept={DOC_ACCEPT} label="Drop the concept note here" hint="or click to browse · PDF, Word, Markdown" error={err("concept") ?? err("file")} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <a href="/templates/projects/concept-note.md" download className="inline-flex items-center gap-2 rounded-full border border-slate-900/[0.07] bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-white/10 dark:bg-gray-800/40 dark:text-gray-300">
                          <Download className="h-3.5 w-3.5" /> Download the template
                        </a>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {([
                          ["users", "Who it helps", Users, 10, 1500, 2, "Students, teachers, families…"],
                          ["solution", "Proposed solution", Lightbulb, 30, 3000, 3, "What you will build and how it works"],
                          ["impact", "Expected impact", Target, 10, 1500, 2, "What changes when it works"],
                        ] as const).map(([k, label, Icon, min, max, rows, ph]) => (
                          <Field key={k} label={label} icon={Icon} htmlFor={`sp-w-${k}`} counter={{ value: written[k], min, max }} error={err(`concept.${k}`)}>
                            <TextArea id={`sp-w-${k}`} rows={rows} value={written[k]} onChange={(e) => setWritten((w) => ({ ...w, [k]: e.target.value }))} invalid={!!err(`concept.${k}`)} placeholder={ph} className="min-h-[72px]" />
                          </Field>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-blue-50 to-blue-50 p-4 dark:from-blue-500/10 dark:to-blue-500/10">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 dark:bg-gray-800 dark:text-blue-300">
                        <Lightbulb className="h-5 w-5" aria-hidden />
                      </span>
                      <p className="text-sm text-slate-700 dark:text-gray-200">
                        <span className="font-semibold">Optional.</span> Skip it now and add them anytime from the project's <span className="font-semibold">Documents</span> and <span className="font-semibold">Gallery</span> tabs.
                      </p>
                    </div>
                    <FormSection title="Logo & cover" icon={ImageIcon}>
                      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                        <ImageSlot label="Logo" hint="Square works best" file={logoFile} onFile={setLogoFile} shape="square" />
                        <ImageSlot label="Cover image" hint="Wide, at least 1200 px" file={coverFile} onFile={setCoverFile} shape="wide" />
                      </div>
                    </FormSection>
                    <FormSection title="Documents" icon={FileText}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <DocSlot label="SRS" file={srs} onFile={setSrs} accept=".pdf,.doc,.docx,.odt,.md,.txt" template="/templates/projects/srs.md" />
                        <DocSlot label="Implementation plan" file={plan} onFile={setPlan} accept=".pdf,.doc,.docx,.odt,.md,.txt,.xls,.xlsx,.ppt,.pptx" template="/templates/projects/implementation-plan.md" />
                      </div>
                    </FormSection>
                    <FormSection title="Screenshots & files" icon={ImageIcon} aside={<span className="text-xs font-semibold tabular-nums text-slate-500 dark:text-gray-400">{media.length}/10</span>}>
                      <Dropzone multiple compact onFiles={addMedia} accept="image/*,.pdf,.ppt,.pptx,.xls,.xlsx,.csv,.zip,.md,.txt,.json,.py,.js,.ts,.html,.css,.sql" label="Drop screenshots, diagrams, files" hint="The first image becomes the cover" error={mediaErr} disabled={media.length >= 10} />
                      {media.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                          <AnimatePresence initial={false}>
                            {media.map((m, i) => (
                              <motion.div key={`${m.name}-${m.size}`} layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} className="group relative aspect-square overflow-hidden rounded-2xl border border-slate-900/[0.07] bg-slate-50 dark:border-white/[0.06] dark:bg-gray-800/40">
                                {previews[i] ? (
                                  <img src={previews[i] as string} alt={m.name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center">
                                    <FileText className="h-7 w-7 text-blue-500" aria-hidden />
                                    <span className="line-clamp-2 text-[10px] font-semibold text-slate-600 dark:text-gray-300">{m.name}</span>
                                  </div>
                                )}
                                {i === previews.findIndex(Boolean) && <span className="absolute left-1.5 top-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white ">Cover</span>}
                                <button type="button" aria-label={`Remove ${m.name}`} onClick={() => setMedia((x) => x.filter((_, j) => j !== i))} className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-600 opacity-0 transition hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:bg-gray-900/90 dark:text-gray-300">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      )}
                    </FormSection>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Start date" htmlFor="sp-start" error={err("startDate")}>
                        <IconInput
                          id="sp-start"
                          icon={CalendarRange}
                          type="date"
                          value={start}
                          invalid={!!err("startDate")}
                          onChange={(e) => (setStart(e.target.value), redate(e.target.value, target), setErrors((x) => ({ ...x, startDate: undefined })))}
                          className="[color-scheme:light] dark:[color-scheme:dark]"
                        />
                      </Field>
                      <Field label="Closing date" htmlFor="sp-target" error={err("targetDate")}>
                        <IconInput
                          id="sp-target"
                          icon={Flag}
                          type="date"
                          value={target}
                          min={start || undefined}
                          invalid={!!err("targetDate")}
                          onChange={(e) => (setTarget(e.target.value), redate(start, e.target.value), setErrors((x) => ({ ...x, targetDate: undefined })))}
                          className="[color-scheme:light] dark:[color-scheme:dark]"
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick durations">
                          {quickDates.map(([label, d]) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => (setTarget(d), redate(start, d), setErrors((x) => ({ ...x, targetDate: undefined })))}
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${target === d ? "border-blue-600 bg-blue-600 text-white" : "border-slate-900/[0.07] text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-white/10 dark:text-gray-300"}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </Field>
                    </div>
                    <FormSection title="Stages" icon={GanttChartSquare}>
                      <p className="-mt-1 text-xs text-slate-500 dark:text-gray-400">Drag the handles to give each stage its days. You can change this later.</p>
                      <PlanEditor start={start} target={target} ends={ends} onChange={setEnds} disabled={busy} />
                    </FormSection>
                  </>
                )}

                {step === 4 && (
                  <>
                    <FormSection title="Links" icon={Link2}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="GitHub repository" htmlFor="sp-gh" error={err("githubUrl")}>
                          <IconInput id="sp-gh" icon={Github} value={github} onChange={(e) => setGithub(e.target.value)} invalid={!!err("githubUrl")} placeholder="github.com/you/project" />
                        </Field>
                        <Field label="Live link" htmlFor="sp-live" error={err("accessUrl")}>
                          <IconInput id="sp-live" icon={Globe} value={access} onChange={(e) => setAccess(e.target.value)} invalid={!!err("accessUrl")} placeholder="https://…" />
                        </Field>
                      </div>
                    </FormSection>
                    <FormSection title="Who is it for?" icon={Users}>
                      <CustomerField mode={customerMode} customer={customer} error={err("customerId")} onChange={(m, c) => (setCustomerMode(m), c !== undefined && setCustomer(c), setErrors((x) => ({ ...x, customerId: undefined })))} />
                    </FormSection>
                    <FormSection title="Supervision" icon={UserCheck}>
                      <Field label="Supervisor" optional>
                        <PersonPicker value={supervisor} onChange={(p) => setSupervisor(p)} search={sideProjectsApi.supervisors} placeholder="Search a teacher" error={err("supervisorId")} />
                      </Field>
                    </FormSection>
                    <FormSection title="Start in" icon={Rocket}>
                      <OptionCards
                        label="Start in"
                        value={status}
                        onChange={setStatus}
                        options={START_IN.map((s) => ({
                          value: s,
                          title: STATUS_META[s].label,
                          caption: s === "IDEA" ? "Shaping the idea" : s === "PLANNING" ? "Designing the solution" : "Work has started",
                          icon: STATUS_META[s].icon,
                          color: statusColor(s, dark),
                        }))}
                      />
                    </FormSection>
                  </>
                )}
                {err("form") && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err("form")}</p>}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="hidden md:block">
            <div className="sticky top-0">
              <Preview title={title.trim()} category={category} tags={tags} status={status} conceptReady={conceptReady} hasGithub={!!github.trim()} hasLive={!!access.trim()} target={target} checks={checks} srs={!!srs} plan={!!plan} mediaCount={media.length} cover={coverPreview} />
            </div>
          </div>
        </div>
      )}
    </FormModal>
  );
};

export default CreateWizard;
