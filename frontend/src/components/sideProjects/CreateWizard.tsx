import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Calendar, Check, Download, FileCheck2, FileUp, Github, Globe, Lightbulb, Link2, PenLine, Rocket, Sparkles, Target, Trash2, UserCheck, Users, Wand2,
} from "lucide-react";
import { failure, sideProjectsApi, type Category, type Status } from "../../api/sideProjects";
import { CategoryPicker, PersonPicker, TagInput, checkGithub, checkHttps } from "./fields";
import { Field, FormModal, FormSection, IconInput, OptionCards, TextArea } from "./form";
import { CATEGORY_ICON, Dropzone, ProgressRing, STATUS_META, Spinner, fmtBytes, inputCls, primaryBtn, secondaryBtn, statusColor, useIsDark } from "./ui";

const DOC_ACCEPT = ".pdf,.doc,.docx,.odt,.md,.txt,.ppt,.pptx";
const STEPS = [
  { key: "basics", icon: Lightbulb, label: "The idea", caption: "Title, problem, category" },
  { key: "concept", icon: FileCheck2, label: "Concept note", caption: "Upload or write it" },
  { key: "launch", icon: Rocket, label: "Links & plan", caption: "All optional" },
] as const;

export interface WizardProps {
  open: boolean;
  initialStatus?: Status;
  categories: Category[];
  onClose: () => void;
  onCreated: (id: number) => void;
}

type Errors = Partial<Record<string, string>>;

const addMonths = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

/** Step band: three segments that fill as you go, each a button back to a finished step. */
const StepBand: React.FC<{ step: number; onGo: (i: number) => void }> = ({ step, onGo }) => (
  <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
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
              <motion.span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-600 to-sky-500" initial={false} animate={{ width: state === "next" ? "0%" : "100%" }} transition={{ duration: 0.35 }} />
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
                <span className={`block truncate text-xs font-semibold ${state === "next" ? "text-slate-400 dark:text-gray-500" : "text-slate-800 group-hover:text-blue-700 dark:text-gray-100"}`}>{s.label}</span>
                <span className="hidden truncate text-[11px] text-slate-500 sm:block dark:text-gray-400">{s.caption}</span>
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
}> = ({ title, category, tags, status, conceptReady, hasGithub, hasLive, target, checks }) => {
  const dark = useIsDark();
  const Icon = CATEGORY_ICON[category?.icon ?? "sparkles"] ?? Sparkles;
  const accent = category?.color ?? statusColor(status, dark);
  const S = STATUS_META[status];
  const done = checks.filter((c) => c.ok).length;
  return (
    <aside className="space-y-4" aria-label="Preview">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Preview</p>
      <motion.div layout className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft dark:border-gray-700/40 dark:bg-gray-800/40">
        <div className="relative h-28 overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}0d)` }}>
          <motion.div key={category?.id ?? "none"} initial={{ scale: 0.6, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} className="flex h-full items-center justify-center">
            <Icon className="h-12 w-12" style={{ color: accent }} aria-hidden />
          </motion.div>
          <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full" style={{ backgroundColor: `${accent}1f` }} aria-hidden />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold shadow-sm dark:bg-gray-900/80" style={{ color: statusColor(status, dark) }}>
            <S.icon className="h-3 w-3" aria-hidden /> {S.label}
          </span>
        </div>
        <div className="space-y-2.5 p-4">
          <p className={`line-clamp-2 text-sm font-bold ${title ? "text-slate-900 dark:text-white" : "italic text-slate-500 dark:text-gray-400"}`}>{title || "Your project title"}</p>
          <div className="flex min-h-[22px] flex-wrap gap-1">
            {(tags.length ? tags : ["Tech", "Stack"]).slice(0, 4).map((t) => (
              <span key={t} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tags.length ? "bg-slate-100 text-slate-600 dark:bg-gray-700/60 dark:text-gray-300" : "border border-dashed border-slate-300 text-slate-500 dark:border-gray-600 dark:text-gray-400"}`}>
                {t}
              </span>
            ))}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-700/60">
            <motion.div className="h-full rounded-full" style={{ backgroundColor: statusColor(status, dark) }} animate={{ width: status === "IN_PROGRESS" ? "10%" : "0%" }} />
          </div>
          <div className="flex items-center justify-between text-slate-500 dark:text-gray-400">
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-lg ${conceptReady ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 dark:bg-gray-700/60"}`} title="Concept note">
              <FileCheck2 className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="flex items-center gap-2">
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

      <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 dark:border-gray-700/40 dark:bg-gray-800/30">
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
                className={`flex h-5 w-5 items-center justify-center rounded-full ${c.ok ? "bg-emerald-500 text-white" : "border-2 border-slate-300 dark:border-gray-600"}`}
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

/** New project in three steps. The concept note (a file or the short written form) is required. */
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
  const [written, setWritten] = useState({ users: "", solution: "", impact: "" });
  const [github, setGithub] = useState("");
  const [access, setAccess] = useState("");
  const [target, setTarget] = useState("");
  const [supervisor, setSupervisor] = useState<{ id: number; name: string } | null>(null);
  const [status, setStatus] = useState<Status>(initialStatus);
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
      setWritten({ users: "", solution: "", impact: "" });
      setGithub("");
      setAccess("");
      setTarget("");
      setSupervisor(null);
      setStatus(initialStatus === "COMPLETED" ? "IN_PROGRESS" : initialStatus);
      setErrors({});
      setDone(false);
    }
  }, [open, initialStatus]);

  const conceptReady = mode === "upload" ? !!file : written.users.trim().length >= 10 && written.solution.trim().length >= 30 && written.impact.trim().length >= 10;
  const checks = [
    { label: "A title", ok: title.trim().length >= 3 },
    { label: "The problem it solves", ok: problem.trim().length >= 30 },
    { label: "A concept note", ok: conceptReady },
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
    if (s === 2) {
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
    const all = { ...check(0), ...check(1), ...check(2) };
    setErrors(all);
    if (Object.keys(all).length) {
      if (all.title || all.problemStatement) setStep(0);
      else if (Object.keys(all).some((k) => k.startsWith("concept"))) setStep(1);
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
        targetDate: target || undefined,
        supervisorId: supervisor?.id,
        status,
      };
      if (mode === "write") fields.conceptWritten = { problem: problem.trim(), ...written };
      const r = await sideProjectsApi.create(fields, mode === "upload" ? file : null, setProgress);
      setDone(true);
      setTimeout(() => onCreated(r.id), 1100);
    } catch (e) {
      const f = failure(e);
      setErrors({ [f.field ?? "form"]: f.message });
      if (f.field === "title" || f.field === "problemStatement") setStep(0);
      else if (f.field?.startsWith("concept") || f.field === "file") setStep(1);
    } finally {
      setBusy(false);
    }
  };

  const err = (k: string) => errors[k];
  const variants = useMemo(() => ({ enter: (d: number) => ({ x: d * 32, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: d * -32, opacity: 0 }) }), []);
  const category = categories.find((c) => c.id === categoryId) ?? null;
  const quickDates: Array<[string, string]> = [
    ["1 month", addMonths(1)],
    ["3 months", addMonths(3)],
    ["6 months", addMonths(6)],
  ];

  const footer = done ? null : (
    <>
      <button type="button" className={secondaryBtn} onClick={() => (step === 0 ? onClose() : go(step - 1))} disabled={busy}>
        <ArrowLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
      </button>
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-slate-500 sm:inline dark:text-gray-400">Step {step + 1} of 3</span>
        {step < 2 ? (
          <button type="button" className={primaryBtn} onClick={() => go(step + 1)}>
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" className={primaryBtn} onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Spinner className="h-4 w-4" /> {progress < 100 && mode === "upload" ? `Uploading ${progress}%` : "Creating"}
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
      subtitle={done ? "All set" : "Three quick steps. Only the idea and the concept note are required."}
      band={done ? undefined : <StepBand step={step} onGo={go} />}
      footer={footer}
    >
      {done ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative flex flex-col items-center gap-4 py-12 text-center">
          {[...Array(10)].map((_, i) => (
            <motion.span
              key={i}
              className="absolute h-2 w-2 rounded-full"
              style={{ backgroundColor: ["#2563eb", "#0ea5e9", "#10b981", "#f59e0b", "#eb6834"][i % 5], top: "45%", left: "50%" }}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: Math.cos((i / 10) * Math.PI * 2) * 140, y: Math.sin((i / 10) * Math.PI * 2) * 90, opacity: 0 }}
              transition={{ duration: 1 }}
              aria-hidden
            />
          ))}
          <motion.span initial={{ rotate: -45, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 12 }} className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
            <Check className="h-10 w-10" />
          </motion.span>
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{title}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Added to {STATUS_META[status].label}</p>
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
                              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-md shadow-emerald-500/30">
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
                        <a href="/templates/projects/concept-note.md" download className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-gray-700/60 dark:bg-gray-800/40 dark:text-gray-300">
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
                    <FormSection title="Plan" icon={Calendar}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Target date" htmlFor="sp-target">
                          <IconInput id="sp-target" icon={Calendar} type="date" value={target} onChange={(e) => setTarget(e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
                          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick dates">
                            {quickDates.map(([label, d]) => (
                              <button key={label} type="button" onClick={() => setTarget(d)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${target === d ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-gray-700/60 dark:text-gray-300"}`}>
                                + {label}
                              </button>
                            ))}
                          </div>
                        </Field>
                        <Field label="Supervisor" icon={UserCheck}>
                          <PersonPicker value={supervisor} onChange={(p) => setSupervisor(p)} search={sideProjectsApi.supervisors} placeholder="Search a teacher" error={err("supervisorId")} />
                        </Field>
                      </div>
                    </FormSection>
                    <FormSection title="Start in" icon={Rocket}>
                      <OptionCards
                        label="Start in"
                        value={status}
                        onChange={setStatus}
                        options={(["IDEA", "IN_PROGRESS"] as Status[]).map((s) => ({
                          value: s,
                          title: STATUS_META[s].label,
                          caption: s === "IDEA" ? "Still planning" : "Work has started",
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
              <Preview title={title.trim()} category={category} tags={tags} status={status} conceptReady={conceptReady} hasGithub={!!github.trim()} hasLive={!!access.trim()} target={target} checks={checks} />
            </div>
          </div>
        </div>
      )}
    </FormModal>
  );
};

export default CreateWizard;
