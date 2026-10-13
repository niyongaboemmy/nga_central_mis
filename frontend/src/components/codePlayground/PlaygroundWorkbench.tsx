import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  Globe,
  Keyboard,
  Lightbulb,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Save,
  Server,
  Square,
  Terminal,
  Trash2,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import CodeEditor from "./CodeEditor";
import { LANGUAGES, isRunnable, languageById, type PlaygroundLanguage } from "./languages";
import { outputMatches, normalizeOutput, type PlaygroundBlock } from "./playgroundData";
import { prettifyCode } from "./format";
import { useRunner, useRunnerLanguages } from "./useRunner";
import { useDarkMode } from "./useDarkMode";

/**
 * The Code Playground: write, run and check code from a lesson. One component, two
 * sizes — the full-screen modal (CodePlaygroundModal) and the compact block inside a
 * lesson (inline). Server languages run on Task Mentor's code runner; web pages,
 * browser JavaScript and React run in a sandboxed frame here.
 */

export interface WorkbenchProps {
  block: PlaygroundBlock;
  variant: "modal" | "inline";
  autoRun?: boolean;
  source?: string;
  onClose?: () => void;
  onExpand?: (current: PlaygroundBlock) => void;
  onSave?: (block: PlaygroundBlock) => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

type Pane = "output" | "preview" | "input";

const VERDICT: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  ok: { label: "Finished", tone: "ok" },
  "compile-error": { label: "Didn't compile", tone: "bad" },
  "runtime-error": { label: "Error while running", tone: "bad" },
  "time-limit": { label: "Took too long", tone: "warn" },
  "memory-limit": { label: "Used too much memory", tone: "warn" },
  "output-limit": { label: "Printed too much", tone: "warn" },
  "package-not-available": { label: "Library not available", tone: "warn" },
  "internal-error": { label: "Runner problem", tone: "warn" },
  refused: { label: "Couldn't run", tone: "warn" },
};

const VERDICT_HELP: Record<string, string> = {
  "compile-error": "Read the first error: it names the line and what the compiler expected.",
  "time-limit": "The program ran past the time limit — look for a loop that never ends, or code waiting for input that isn't in the Input panel.",
  "memory-limit": "The program kept growing — look for a list or string that never stops getting bigger.",
};

/** A short stable key for drafts kept on this device. */
const draftKey = (b: PlaygroundBlock) => {
  let h = 0;
  const s = `${b.language}\u0000${b.code}\u0000${b.title}`;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `nga.playground.draft.${(h >>> 0).toString(36)}`;
};

const readDraft = (key: string): { language: string; code: string; stdin: string } | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return typeof d?.code === "string" && typeof d?.language === "string" ? { language: d.language, code: d.code, stdin: typeof d.stdin === "string" ? d.stdin : "" } : null;
  } catch {
    return null;
  }
};

const writeDraft = (key: string, value: { language: string; code: string; stdin: string } | null) => {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* private mode / storage full: drafts are a convenience */
  }
};

const formatMs = (ms?: number | null) => (ms == null ? null : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);
const formatKb = (kb?: number | null) => (kb == null || kb <= 0 ? null : kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`);

const PlaygroundWorkbench: React.FC<WorkbenchProps> = ({ block, variant, autoRun, source, onClose, onExpand, onSave, fullscreen, onToggleFullscreen }) => {
  const modal = variant === "modal";
  const dark = useDarkMode();
  const runner = useRunnerLanguages();
  const { state, run, stop, clear } = useRunner();
  const key = useMemo(() => draftKey(block), [block]);
  const saved = useMemo(() => (onSave ? null : readDraft(key)), [key, onSave]);

  const [langId, setLangId] = useState(saved?.language && languageById(saved.language) ? saved.language : block.language);
  const [code, setCode] = useState(saved?.code ?? block.code);
  const [stdin, setStdin] = useState(saved?.stdin ?? block.stdin);
  const [pane, setPane] = useState<Pane>("output");
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [checked, setChecked] = useState<null | boolean>(null);
  const [split, setSplit] = useState(0.56);
  const bodyRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const lang = languageById(langId) ?? LANGUAGES[0];
  const exercise = block.mode === "exercise";
  const runnable = isRunnable(lang, runner.keys);
  const browserRun = !!lang.browser;
  const hasPreview = lang.browser === "web" || lang.browser === "react";
  const dirty = code !== block.code || langId !== block.language || stdin !== block.stdin;

  // Keep the student's work on this device (not for the teacher editing the block).
  useEffect(() => {
    if (onSave) return;
    const t = window.setTimeout(() => writeDraft(key, dirty ? { language: langId, code, stdin } : null), 400);
    return () => window.clearTimeout(t);
  }, [key, langId, code, stdin, dirty, onSave]);

  const doRun = useCallback(() => {
    if (!runnable || !code.trim()) return;
    setChecked(null);
    setPane(hasPreview ? "preview" : "output");
    void run(lang, code, stdin);
  }, [runnable, code, hasPreview, run, lang, stdin]);

  // "Run" on a lesson's code: run once as soon as the playground opens.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoRun || autoRan.current) return;
    if (!lang.browser && runner.keys === null) return; // wait to know the runner has it
    autoRan.current = true;
    doRun();
  }, [autoRun, doRun, lang.browser, runner.keys]);

  // Check an exercise when its run finishes.
  useEffect(() => {
    if (!exercise || !block.expected.trim() || state.phase !== "done" || !state.meta) return;
    setChecked(state.meta.verdict === "ok" && outputMatches(state.output, block.expected));
  }, [exercise, block.expected, state.phase, state.meta, state.output]);

  const doFormat = useCallback(async () => {
    setFormatting(true);
    try {
      const out = await prettifyCode(code, lang.id === "node" ? "javascript" : lang.id, lang.prettier ?? null);
      setCode(out);
    } finally {
      setFormatting(false);
    }
  }, [code, lang]);

  const reset = () => {
    setLangId(block.language);
    setCode(block.code);
    setStdin(block.stdin);
    setChecked(null);
    setShowSolution(false);
    clear();
    writeDraft(key, null);
  };

  const switchLanguage = (next: PlaygroundLanguage) => {
    setMenuOpen(false);
    if (next.id === lang.id) return;
    // Untouched starter code follows the language; the student's own code stays.
    if (!code.trim() || code === lang.starter || code === block.code) setCode(next.id === block.language ? block.code : next.starter);
    setLangId(next.id);
    setPane("output");
    clear();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the code is selectable in the editor */
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = lang.file;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Close the language menu on an outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setMenuOpen(false));
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menuOpen]);

  // Drag the divider between the editor and the output (modal, wide screens).
  const startDrag = (e: React.PointerEvent) => {
    const box = bodyRef.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const move = (ev: PointerEvent) => setSplit(Math.min(0.8, Math.max(0.25, (ev.clientX - box.left) / box.width)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const running = state.phase === "running";
  const meta = state.meta;
  const verdict = meta ? VERDICT[meta.verdict] ?? { label: meta.verdict, tone: "warn" as const } : null;
  const lineCount = code.split("\n").length;

  // ------------------------------------------------------------------ pieces

  const iconBtn = "inline-flex items-center justify-center gap-1.5 h-8 min-w-[32px] px-2 rounded-lg text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors";

  const languageMenu = (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        title="Change language"
        className="inline-flex items-center gap-2 h-8 pl-2 pr-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-semibold text-slate-800 dark:text-slate-100 hover:border-brand-500 transition-colors"
      >
        <span className="inline-flex items-center justify-center h-5 min-w-[22px] px-1 rounded bg-brand-50 dark:bg-brand-500/20 text-[10px] font-bold text-brand-700 dark:text-brand-200">{lang.short}</span>
        <span className="hidden sm:inline max-w-[160px] truncate">{lang.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
      </button>
      {menuOpen && (
        <div role="listbox" aria-label="Language" className="absolute z-30 mt-1.5 left-0 w-[260px] max-h-[60vh] overflow-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161b22] shadow-xl p-1.5">
          {[
            { title: "Runs in your browser", items: LANGUAGES.filter((l) => l.browser) },
            { title: "Runs on the code runner", items: LANGUAGES.filter((l) => !l.browser) },
          ].map((g) => (
            <div key={g.title} className="py-1">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{g.title}</p>
              {g.items.map((l) => {
                const ok = isRunnable(l, runner.keys);
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="option"
                    aria-selected={l.id === lang.id}
                    onClick={() => switchLanguage(l)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[13px] ${l.id === lang.id ? "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-200" : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"}`}
                  >
                    <span className="inline-flex items-center justify-center h-5 min-w-[30px] px-1 rounded bg-slate-100 dark:bg-white/10 text-[10px] font-bold">{l.short}</span>
                    <span className="flex-1 truncate">{l.label}</span>
                    {!ok && <span className="text-[10px] text-slate-500 dark:text-slate-400">not on runner yet</span>}
                    {l.id === lang.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const runButton = (
    <button
      type="button"
      onClick={running ? stop : doRun}
      disabled={!running && (!runnable || !code.trim())}
      title={running ? "Stop" : runnable ? "Run (Ctrl/⌘ + Enter)" : `${lang.label} isn't on the code runner yet`}
      className={`inline-flex items-center gap-2 h-9 pl-3 pr-4 rounded-lg text-sm font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
        running ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900 hover:opacity-90" : "bg-success-700 hover:bg-green-800 text-white active:scale-[0.98]"
      }`}
      data-testid="playground-run"
    >
      {running ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
      {running ? "Stop" : exercise && block.expected.trim() ? "Run & check" : "Run"}
    </button>
  );

  const toolbar = (
    <div className="flex items-center gap-0.5">
      <button type="button" className={iconBtn} onClick={doFormat} disabled={formatting || !code.trim()} title="Format code (Shift+Alt+F)" aria-label="Format code">
        {formatting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        {modal && <span className="hidden lg:inline">Format</span>}
      </button>
      <button type="button" className={iconBtn} onClick={reset} disabled={!dirty && state.phase === "idle"} title="Back to the lesson's code" aria-label="Reset code">
        <RotateCcw className="w-4 h-4" />
        {modal && <span className="hidden lg:inline">Reset</span>}
      </button>
      <button type="button" className={iconBtn} onClick={copy} title="Copy code" aria-label="Copy code">
        {copied ? <Check className="w-4 h-4 text-success-500" /> : <Copy className="w-4 h-4" />}
      </button>
      {modal && (
        <button type="button" className={iconBtn} onClick={download} title={`Download ${lang.file}`} aria-label="Download code">
          <Download className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  const instructions = (block.instructions.trim() || block.title.trim()) && (exercise || block.instructions.trim()) && (
    <div className={`${modal ? "mx-3 mt-3" : "mx-3 mt-3"} rounded-xl border border-brand-100 dark:border-brand-500/20 bg-brand-50/60 dark:bg-brand-500/[0.07] px-3.5 py-2.5`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-200">{exercise ? "Your task" : "Try this"}</p>
      {block.instructions
        .trim()
        .split(/\n{2,}/)
        .map((para, i) => (
          <p key={i} className="mt-1 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line">
            {para}
          </p>
        ))}
      {exercise && (block.hint.trim() || block.solution.trim()) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {block.hint.trim() && (
            <button type="button" onClick={() => setShowHint((s) => !s)} className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline">
              <Lightbulb className="w-3.5 h-3.5" /> {showHint ? "Hide hint" : "Show a hint"}
            </button>
          )}
          {block.solution.trim() && (
            <button
              type="button"
              onClick={() => setShowSolution((s) => !s)}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline"
            >
              {showSolution ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {showSolution ? "Hide solution" : "See a solution"}
            </button>
          )}
        </div>
      )}
      {showHint && block.hint.trim() && <p className="mt-2 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{block.hint}</p>}
      {showSolution && block.solution.trim() && (
        <div className="mt-2 rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-white/5 text-xs text-slate-500">
            <span>A possible solution — try your own first</span>
            <button type="button" className="font-medium text-brand-600 dark:text-brand-200 hover:underline" onClick={() => setCode(block.solution)}>
              Use it
            </button>
          </div>
          <div className="p-3 text-[12.5px] leading-relaxed overflow-auto max-h-56 font-mono whitespace-pre bg-white dark:bg-[#0d1117] text-slate-800 dark:text-slate-100">{block.solution}</div>
        </div>
      )}
    </div>
  );

  const checkBanner = checked !== null && (
    <div
      role="status"
      className={`mx-3 mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${
        checked ? "bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-500" : "bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500"
      }`}
      data-testid="playground-check"
    >
      {checked ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
      <div className="min-w-0">
        <p className="font-semibold">{checked ? "Correct — your program prints the expected output." : "Not yet — the output is different from what's expected."}</p>
        {!checked && (
          <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <p className="font-medium opacity-80">Expected</p>
              <div className="mt-0.5 p-2 rounded-lg bg-white/70 dark:bg-black/30 whitespace-pre-wrap font-mono max-h-32 overflow-auto">{normalizeOutput(block.expected) || "(nothing)"}</div>
            </div>
            <div>
              <p className="font-medium opacity-80">Your output</p>
              <div className="mt-0.5 p-2 rounded-lg bg-white/70 dark:bg-black/30 whitespace-pre-wrap font-mono max-h-32 overflow-auto">{normalizeOutput(state.output) || "(nothing)"}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const paneTab = (id: Pane, label: string, icon: React.ReactNode, badge?: React.ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={pane === id}
      onClick={() => setPane(id)}
      className={`relative inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium transition-colors ${
        pane === id ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
      }`}
    >
      {icon}
      {label}
      {badge}
      {pane === id && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-brand-500" />}
    </button>
  );

  const errorCount = state.entries.filter((e) => e.level === "error").length;

  const outputPane = (
    <div className="flex-1 min-h-0 overflow-auto font-mono text-[12.5px] leading-relaxed px-3 py-2.5" aria-live="polite" data-testid="playground-output">
      {state.phase === "idle" && !state.entries.length ? (
        <div className="h-full min-h-[90px] flex flex-col items-center justify-center text-center gap-2 text-slate-500 dark:text-slate-400 font-sans">
          <Terminal className="w-6 h-6" />
          <p className="text-sm">
            Press <span className="font-semibold text-slate-600 dark:text-slate-300">Run</span> to see what this code does.
          </p>
          {modal && (
            <p className="text-xs inline-flex items-center gap-1">
              <Keyboard className="w-3.5 h-3.5" /> Ctrl/⌘ + Enter runs · Shift + Alt + F formats
            </p>
          )}
        </div>
      ) : (
        <>
          {running && !state.entries.length && (
            <p className="flex items-center gap-2 text-slate-500 font-sans text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> {browserRun ? "Running…" : "Running on the code runner…"}
            </p>
          )}
          {state.entries.map((e, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-words py-0.5 ${
                e.level === "error"
                  ? "text-danger-700 dark:text-red-400 bg-danger-100/60 dark:bg-red-500/10 -mx-3 px-3 border-l-2 border-danger-500"
                  : e.level === "warn"
                    ? "text-warning-700 dark:text-amber-300"
                    : e.level === "info"
                      ? "text-slate-500 dark:text-slate-400 italic"
                      : "text-slate-800 dark:text-slate-100"
              }`}
            >
              {e.text || "\u00a0"}
            </div>
          ))}
          {state.phase === "done" && !state.entries.length && <p className="text-slate-500 dark:text-slate-400 font-sans text-sm">The program finished without printing anything.</p>}
          {meta && VERDICT_HELP[meta.verdict] && <p className="mt-2 font-sans text-xs text-slate-500 dark:text-slate-400">{VERDICT_HELP[meta.verdict]}</p>}
        </>
      )}
    </div>
  );

  const previewPane = hasPreview && (
    <div className={`flex-1 min-h-0 bg-white ${pane === "preview" ? "" : "hidden"}`}>
      {state.doc ? (
        <iframe
          key={state.runId ?? "none"}
          title="Preview of your page"
          sandbox="allow-scripts allow-modals allow-forms allow-popups"
          srcDoc={state.doc}
          className="w-full h-full min-h-[220px] border-0 bg-white"
          data-testid="playground-preview"
        />
      ) : (
        <div className="h-full min-h-[160px] flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
          <Globe className="w-6 h-6" /> Run to see the page here.
        </div>
      )}
    </div>
  );

  // Browser JavaScript runs in a hidden frame; only its console shows.
  const hiddenFrame = !hasPreview && browserRun && state.doc && (
    <iframe key={state.runId ?? "none"} title="JavaScript runner" sandbox="allow-scripts allow-modals" srcDoc={state.doc} className="hidden" aria-hidden="true" tabIndex={-1} />
  );

  const inputPane = (
    <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
      <label htmlFor={`stdin-${key}`} className="text-xs text-slate-500 dark:text-slate-400">
        {lang.browser === "js" ? "Each line answers one prompt() call, in order." : "What the program reads (input / Scanner / cin / readline), one value per line."}
      </label>
      <textarea
        id={`stdin-${key}`}
        value={stdin}
        onChange={(e) => setStdin(e.target.value)}
        placeholder={"e.g.\nAline\n25"}
        spellCheck={false}
        className="flex-1 min-h-[90px] w-full resize-none rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1117] p-2.5 font-mono text-[13px] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      />
    </div>
  );

  const statusBar = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-[34px] px-3 py-1.5 border-t border-slate-200 dark:border-white/10 text-[11.5px] text-slate-500 dark:text-slate-400">
      <span className="inline-flex items-center gap-1.5">
        {browserRun ? <Globe className="w-3.5 h-3.5" /> : <Server className="w-3.5 h-3.5" />}
        {browserRun ? "Runs in your browser" : runner.available === false ? "Code runner offline" : "Runs on the school code runner"}
      </span>
      {verdict && (
        <span
          className={`inline-flex items-center gap-1 font-semibold ${verdict.tone === "ok" ? "text-success-700 dark:text-success-500" : verdict.tone === "bad" ? "text-danger-700 dark:text-red-400" : "text-warning-700 dark:text-amber-300"}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${verdict.tone === "ok" ? "bg-success-500" : verdict.tone === "bad" ? "bg-danger-500" : "bg-warning-500"}`} />
          {verdict.label}
          {meta?.exit_code != null && meta.exit_code !== 0 && meta.verdict !== "compile-error" ? ` (exit ${meta.exit_code})` : ""}
        </span>
      )}
      {formatMs(meta?.time_ms) && <span>{formatMs(meta?.time_ms)}</span>}
      {formatKb(meta?.memory_kb) && <span>{formatKb(meta?.memory_kb)}</span>}
      <span className="ml-auto">
        {lineCount} line{lineCount === 1 ? "" : "s"} · {lang.file}
      </span>
    </div>
  );

  const editor = (
    <CodeEditor
      value={code}
      onChange={setCode}
      language={lang.id}
      dark={dark}
      onRun={doRun}
      onFormat={doFormat}
      ariaLabel={`${lang.label} code`}
      autoFocus={modal && !autoRun}
      className={modal ? "h-full" : "max-h-[420px] min-h-[120px] overflow-auto"}
    />
  );

  const outputTabs = (
    <div className="flex items-center border-b border-slate-200 dark:border-white/10 pr-1.5 bg-slate-50/80 dark:bg-white/[0.02]">
      <div role="tablist" aria-label="Results" className="flex items-center">
      {paneTab("output", "Output", <Terminal className="w-3.5 h-3.5" />, errorCount ? <span className="ml-0.5 px-1.5 rounded-full bg-danger-500 text-white text-[10px] leading-4">{errorCount}</span> : null)}
      {hasPreview && paneTab("preview", "Preview", <Globe className="w-3.5 h-3.5" />)}
      {lang.stdin && paneTab("input", "Input", <Keyboard className="w-3.5 h-3.5" />, stdin.trim() ? <span className="w-1.5 h-1.5 rounded-full bg-brand-500" /> : null)}
      </div>
      <span className="flex-1" />
      {state.entries.length > 0 && (
        <button type="button" className={iconBtn} onClick={clear} title="Clear output" aria-label="Clear output">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  const results = (
    <div className="flex flex-col min-h-0 flex-1">
      {outputTabs}
      <div className={`flex-1 min-h-0 flex flex-col ${pane === "output" ? "" : "hidden"}`}>{outputPane}</div>
      {previewPane}
      {pane === "input" && inputPane}
    </div>
  );

  // ------------------------------------------------------------------ inline

  if (!modal) {
    return (
      <div className="code-playground not-prose my-5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1117] shadow-soft overflow-hidden" data-testid="code-playground">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161b22]">
          <Code2 className="w-4 h-4 text-brand-500 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">{block.title || (exercise ? "Coding exercise" : "Try it yourself")}</p>
          </div>
          {languageMenu}
          {onExpand && (
            <button type="button" className={iconBtn} onClick={() => onExpand({ ...block, language: langId, code, stdin })} title="Open in the full playground" aria-label="Open in the full playground">
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
        {instructions}
        {checkBanner}
        <div className="mt-0">{editor}</div>
        <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02]">
          {runButton}
          {!runnable && <span className="text-xs text-slate-500">{lang.label} isn't on the code runner yet.</span>}
          <span className="flex-1" />
          <span className="hidden md:inline text-[11px] text-slate-500 dark:text-slate-400 mr-1">Ctrl/⌘ + Enter</span>
          {toolbar}
        </div>
        {(state.phase !== "idle" || state.entries.length > 0 || pane === "input") && (
          <div className={`${hasPreview ? "h-[320px]" : "min-h-[140px] max-h-[320px]"} flex flex-col border-t border-slate-200 dark:border-white/10`}>{results}</div>
        )}
        {state.phase === "idle" && lang.stdin && pane !== "input" && (
          <button type="button" onClick={() => setPane("input")} className="w-full text-left px-3 py-1.5 text-[11.5px] text-slate-500 hover:text-brand-600 border-t border-slate-200 dark:border-white/10">
            <Keyboard className="inline w-3.5 h-3.5 mr-1" /> Give the program some input{stdin.trim() ? " (set)" : ""}
          </button>
        )}
        {hiddenFrame}
      </div>
    );
  }

  // ------------------------------------------------------------------ modal

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-[#0d1117] text-slate-900 dark:text-slate-100" data-testid="code-playground-modal">
      <header className="flex items-center gap-2 px-3 sm:px-4 h-14 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161b22] flex-shrink-0">
        <span className="hidden sm:inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-indigo-500 text-white shadow-sm">
          <Code2 className="w-4 h-4" />
        </span>
        <div className="min-w-0 mr-1">
          <h2 id="code-playground-title" className="text-sm font-semibold truncate">
            {block.title || (exercise ? "Coding exercise" : "Code Playground")}
          </h2>
          <p className="hidden sm:block text-[11px] text-slate-500 dark:text-slate-400 truncate">{source || "Write, run and test code"}</p>
        </div>
        {languageMenu}
        <span className="flex-1" />
        <div className="hidden md:block">{toolbar}</div>
        {onSave && (
          <button type="button" onClick={() => onSave({ ...block, language: langId, code, stdin })} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-white/10 text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/10">
            <Save className="w-4 h-4" /> Save to block
          </button>
        )}
        {runButton}
        {onToggleFullscreen && (
          <button type="button" className={`${iconBtn} hidden sm:inline-flex`} onClick={onToggleFullscreen} title={fullscreen ? "Exit full screen" : "Full screen"} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        )}
        {onClose && (
          <button type="button" className={iconBtn} onClick={onClose} title="Close (Esc)" aria-label="Close playground" data-testid="playground-close">
            <X className="w-5 h-5" />
          </button>
        )}
      </header>
      <div className="md:hidden flex items-center justify-end px-2 py-1 border-b border-slate-200 dark:border-white/10">{toolbar}</div>
      {instructions}
      {checkBanner}
      {runner.available === false && !browserRun && (
        <p className="mx-3 mt-3 mb-0 rounded-lg bg-warning-100 dark:bg-warning-500/10 text-warning-700 dark:text-amber-300 text-xs px-3 py-2">
          {runner.message || "The code runner can't be reached right now."} Web pages, browser JavaScript and React still run here.
        </p>
      )}
      <div ref={bodyRef} className={`flex-1 min-h-0 flex flex-col lg:flex-row border-t border-slate-200 dark:border-white/10 ${instructions || checkBanner || (runner.available === false && !browserRun) ? "mt-3" : "border-t-0"}`}>
        <div className="min-h-[220px] lg:min-h-0 flex-1 lg:flex-none lg:w-[var(--pg-split)] flex flex-col" style={{ "--pg-split": `${Math.round(split * 1000) / 10}%` } as React.CSSProperties}>
          <div className="flex items-center h-9 px-3 border-b border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.02] text-[12px]">
            <span className="inline-flex items-center gap-1.5 h-9 px-1 font-medium text-slate-700 dark:text-slate-200 border-b-2 border-brand-500">
              <Code2 className="w-3.5 h-3.5 text-brand-500" /> {lang.file}
            </span>
            {dirty && <span className="ml-2 w-1.5 h-1.5 rounded-full bg-amber-400" title="Changed" />}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">{editor}</div>
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize editor and output"
          onPointerDown={startDrag}
          className="hidden lg:block w-1.5 flex-shrink-0 cursor-col-resize bg-slate-200/70 dark:bg-white/5 hover:bg-brand-500/40 active:bg-brand-500/60 transition-colors"
        />
        <div className="flex-1 min-h-[220px] lg:min-h-0 flex flex-col border-t lg:border-t-0 border-slate-200 dark:border-white/10">{results}</div>
      </div>
      {statusBar}
      {hiddenFrame}
    </div>
  );
};

export default PlaygroundWorkbench;
