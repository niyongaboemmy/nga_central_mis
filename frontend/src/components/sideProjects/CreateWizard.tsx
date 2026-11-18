import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Download, FileUp, Flag, Github, Globe, Lightbulb, PenLine, Rocket, Trash2, Calendar, UserCheck } from "lucide-react";
import Modal from "../ui/Modal";
import { failure, sideProjectsApi, type Category, type Status } from "../../api/sideProjects";
import { CategoryPicker, CharMeter, PersonPicker, TagInput, checkGithub, checkHttps } from "./fields";
import { Dropzone, FieldError, fmtBytes, inputCls, inputErrCls, labelCls, primaryBtn, secondaryBtn, Spinner, STATUS_META } from "./ui";

const DOC_ACCEPT = ".pdf,.doc,.docx,.odt,.md,.txt,.ppt,.pptx";
const STEPS = [
  { key: "basics", icon: Lightbulb, label: "Idea" },
  { key: "concept", icon: FileUp, label: "Concept" },
  { key: "launch", icon: Rocket, label: "Links" },
] as const;

export interface WizardProps {
  open: boolean;
  initialStatus?: Status;
  categories: Category[];
  onClose: () => void;
  onCreated: (id: number) => void;
}

type Errors = Partial<Record<string, string>>;

/** New project in three steps. The concept note (a file or the short written form) is required. */
const CreateWizard: React.FC<WizardProps> = ({ open, initialStatus = "IDEA", categories, onClose, onCreated }) => {
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
      setTimeout(() => onCreated(r.id), 900);
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
  const variants = useMemo(
    () => ({ enter: (d: number) => ({ x: d * 40, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: d * -40, opacity: 0 }) }),
    [],
  );

  return (
    <Modal isOpen={open} onClose={() => !busy && onClose()} title="New project" size="xl">
      {done ? (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3 py-10">
          <motion.span initial={{ rotate: -30 }} animate={{ rotate: 0 }} className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-float">
            <Check className="h-10 w-10" />
          </motion.span>
          <p className="text-lg font-bold text-slate-800 dark:text-white">{title}</p>
        </motion.div>
      ) : (
        <div className="space-y-5">
          {/* Stepper */}
          <ol className="flex items-center gap-2" aria-label="Steps">
            {STEPS.map((s, i) => {
              const state = i < step ? "done" : i === step ? "now" : "next";
              return (
                <li key={s.key} className="flex flex-1 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => i < step && go(i)}
                    aria-current={state === "now" ? "step" : undefined}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                      state === "done" ? "bg-emerald-500 text-white" : state === "now" ? "bg-brand-600 text-white shadow-glow" : "bg-slate-100 text-slate-400 dark:bg-slate-700"
                    }`}
                  >
                    {state === "done" ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                    <span className="sr-only">{s.label}</span>
                  </button>
                  <span className={`hidden text-xs font-semibold sm:inline ${state === "now" ? "text-slate-800 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>{s.label}</span>
                  {i < STEPS.length - 1 && <span className={`h-0.5 flex-1 rounded ${i < step ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-700"}`} />}
                </li>
              );
            })}
          </ol>

          <div className="relative min-h-[20rem] overflow-hidden">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div key={step} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} className="space-y-4">
                {step === 0 && (
                  <>
                    <div>
                      <div className="flex items-center justify-between">
                        <label htmlFor="sp-title" className={labelCls}>Title</label>
                        <CharMeter value={title} min={3} max={150} />
                      </div>
                      <input id="sp-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputCls} text-base font-semibold ${err("title") ? inputErrCls : ""}`} placeholder="Smart irrigation for school gardens" />
                      <FieldError message={err("title")} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label htmlFor="sp-problem" className={labelCls}>Problem it solves</label>
                        <CharMeter value={problem} min={30} max={3000} />
                      </div>
                      <textarea id="sp-problem" rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} className={`${inputCls} ${err("problemStatement") ? inputErrCls : ""}`} placeholder="Who has the problem, and why it matters…" />
                      <FieldError message={err("problemStatement")} />
                    </div>
                    <div>
                      <span className={labelCls}>Category</span>
                      <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
                    </div>
                    <div>
                      <span className={labelCls}>Technologies</span>
                      <TagInput value={tags} onChange={setTags} />
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="How to add the concept">
                      {([
                        ["upload", FileUp, "Upload"],
                        ["write", PenLine, "Write it here"],
                      ] as const).map(([k, Icon, label]) => (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={mode === k}
                          onClick={() => setMode(k)}
                          className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition ${mode === k ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-slate-200 hover:border-slate-300 dark:border-slate-600"}`}
                        >
                          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${mode === k ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-700"}`}>
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{label}</span>
                        </button>
                      ))}
                    </div>
                    {mode === "upload" ? (
                      <>
                        {file ? (
                          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white"><Check className="h-5 w-5" /></span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{file.name}</p>
                              <p className="text-xs text-slate-600 dark:text-slate-300">{fmtBytes(file.size)}</p>
                            </div>
                            <button type="button" aria-label="Remove file" onClick={() => setFile(null)} className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-red-600 dark:hover:bg-slate-800">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <Dropzone onFiles={(f) => (setFile(f[0]), setErrors((e) => ({ ...e, concept: undefined })))} accept={DOC_ACCEPT} label="Drop the concept note" hint="PDF · Word · Markdown" error={err("concept") ?? err("file")} />
                        )}
                        <a href="/templates/projects/concept-note.md" download className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-200">
                          <Download className="h-3.5 w-3.5" /> Template
                        </a>
                      </>
                    ) : (
                      <div className="space-y-3">
                        {([
                          ["users", "Who it helps", 10, 1500, 2],
                          ["solution", "Proposed solution", 30, 3000, 3],
                          ["impact", "Expected impact", 10, 1500, 2],
                        ] as const).map(([k, label, min, max, rows]) => (
                          <div key={k}>
                            <div className="flex items-center justify-between">
                              <label htmlFor={`sp-w-${k}`} className={labelCls}>{label}</label>
                              <CharMeter value={written[k]} min={min} max={max} />
                            </div>
                            <textarea id={`sp-w-${k}`} rows={rows} value={written[k]} onChange={(e) => setWritten((w) => ({ ...w, [k]: e.target.value }))} className={`${inputCls} ${err(`concept.${k}`) ? inputErrCls : ""}`} />
                            <FieldError message={err(`concept.${k}`)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="sp-gh" className={labelCls}><Github className="mr-1 inline h-3.5 w-3.5" />GitHub</label>
                        <input id="sp-gh" value={github} onChange={(e) => setGithub(e.target.value)} placeholder="https://github.com/you/project" className={`${inputCls} ${err("githubUrl") ? inputErrCls : ""}`} />
                        <FieldError message={err("githubUrl")} />
                      </div>
                      <div>
                        <label htmlFor="sp-live" className={labelCls}><Globe className="mr-1 inline h-3.5 w-3.5" />Live link</label>
                        <input id="sp-live" value={access} onChange={(e) => setAccess(e.target.value)} placeholder="https://…" className={`${inputCls} ${err("accessUrl") ? inputErrCls : ""}`} />
                        <FieldError message={err("accessUrl")} />
                      </div>
                      <div>
                        <label htmlFor="sp-target" className={labelCls}><Calendar className="mr-1 inline h-3.5 w-3.5" />Target date</label>
                        <input id="sp-target" type="date" value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <span className={labelCls}><UserCheck className="mr-1 inline h-3.5 w-3.5" />Supervisor</span>
                        <PersonPicker value={supervisor} onChange={(p) => setSupervisor(p)} search={sideProjectsApi.supervisors} placeholder="Search a teacher" error={err("supervisorId")} />
                      </div>
                    </div>
                    <div>
                      <span className={labelCls}><Flag className="mr-1 inline h-3.5 w-3.5" />Start in</span>
                      <div className="flex gap-2" role="radiogroup" aria-label="Start in">
                        {(["IDEA", "IN_PROGRESS"] as Status[]).map((s) => {
                          const M = STATUS_META[s];
                          return (
                            <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${status === s ? `${M.soft} ${M.text} border-transparent ring-2 ${M.ring}` : "border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300"}`}>
                              <M.icon className="h-4 w-4" /> {M.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <FieldError message={err("form")} />
          <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-700">
            <button type="button" className={secondaryBtn} onClick={() => (step === 0 ? onClose() : go(step - 1))} disabled={busy}>
              <ArrowLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
            </button>
            {step < 2 ? (
              <button type="button" className={primaryBtn} onClick={() => go(step + 1)}>
                Next <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" className={primaryBtn} onClick={submit} disabled={busy}>
                {busy ? <><Spinner className="h-4 w-4" /> {progress < 100 && mode === "upload" ? `${progress}%` : "Saving"}</> : <><Rocket className="h-4 w-4" /> Create</>}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default CreateWizard;
