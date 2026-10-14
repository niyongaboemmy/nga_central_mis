import { useCallback, useEffect, useRef, useState } from "react";
import { getRunnerLanguages, PlaygroundRunError, runOnServer, type PlaygroundRunResult } from "../../api/codePlayground";
import {
  buildCssDocument,
  buildPageDocument,
  buildReactDocument,
  buildScriptDocument,
  listenToRun,
  looksLikeHtml,
  newRunId,
  phpRequestInput,
  PHP_ROUTER,
  PHP_ROUTER_PATH,
  resolvePath,
  type ConsoleEntry,
  type NavRequest,
} from "./browserRun";
import type { PlaygroundLanguage } from "./languages";
import { htmlFiles, startPage, type PlayProject } from "./project";

/** Running code, wherever it runs: one state shape for the browser frame and the server. */

export type RunPhase = "idle" | "running" | "done";

export interface RunMeta {
  /** ok | compile-error | runtime-error | time-limit | memory-limit | output-limit | internal-error | refused */
  verdict: string;
  where: "browser" | "server";
  engine?: string | null;
  time_ms?: number | null;
  memory_kb?: number | null;
  exit_code?: number | null;
}

export interface RunState {
  phase: RunPhase;
  entries: ConsoleEntry[];
  meta: RunMeta | null;
  /** The program's own output (stdout / console.log), for "Check". */
  output: string;
  /** srcdoc of the preview frame (web pages, React, browser JS, a PHP page). */
  doc: string | null;
  runId: string | null;
  /** The project path of the page in the preview (web projects). */
  page: string | null;
  /** Pages visited before it (Back in the preview). */
  history: string[];
}

const IDLE: RunState = { phase: "idle", entries: [], meta: null, output: "", doc: null, runId: null, page: null, history: [] };
const BROWSER_TIMEOUT_MS = 6000;

/** The runner's languages (null until known), asked again whenever a playground opens. */
export function useRunnerLanguages(): { keys: Set<string> | null; available: boolean | null; message?: string } {
  const [state, setState] = useState<{ keys: Set<string> | null; available: boolean | null; message?: string }>({ keys: null, available: null });
  useEffect(() => {
    let alive = true;
    getRunnerLanguages().then((r) => {
      if (alive) setState({ keys: new Set(r.languages.map((l) => l.key)), available: r.available, message: r.message });
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** Server answer → console lines. */
function serverEntries(r: PlaygroundRunResult, showStdout = true): ConsoleEntry[] {
  const entries: ConsoleEntry[] = [];
  if (r.compile_output && r.verdict === "compile-error") entries.push({ level: "error", text: r.compile_output });
  else if (r.compile_output) entries.push({ level: "warn", text: r.compile_output });
  if (showStdout && r.stdout) entries.push({ level: "log", text: r.stdout.replace(/\n$/, "") });
  if (r.stderr) entries.push({ level: r.verdict === "ok" ? "warn" : "error", text: r.stderr.replace(/\n$/, "") });
  return entries;
}

const serverMeta = (r: PlaygroundRunResult): RunMeta => ({ verdict: r.verdict, where: "server", engine: r.engine, time_ms: r.time_ms, memory_kb: r.memory_kb, exit_code: r.exit_code });

export function useRunner() {
  const [state, setState] = useState<RunState>(IDLE);
  const abort = useRef<AbortController | null>(null);
  const startedAt = useRef(0);
  /** What the last run ran: navigation in its pages uses the same files. */
  const last = useRef<{ lang: PlaygroundLanguage; project: PlayProject } | null>(null);

  const finishBrowser = useCallback((runId: string) => {
    setState((s) => {
      if (s.runId !== runId || s.phase !== "running") return s;
      const failed = s.entries.some((e) => e.level === "error");
      return { ...s, phase: "done", meta: { verdict: failed ? "runtime-error" : "ok", where: "browser", time_ms: Math.round(performance.now() - startedAt.current) } };
    });
  }, []);

  /** Shows a page in the preview: an HTML file as is, a .php file run on the code runner. */
  const openPage = useCallback(
    async (path: string, method: "GET" | "POST", query: string, fields: [string, string][], from: string | null) => {
      const ctx = last.current;
      if (!ctx) return;
      const files = ctx.project.files;
      const file = files.find((f) => f.path === path);
      const runId = newRunId();
      const history = (s: RunState) => (from ? [...s.history, from].slice(-30) : s.history);
      if (!file) {
        setState((s) => ({ ...s, entries: [...s.entries, { level: "error", text: `Page not found: ${path}` }] }));
        return;
      }
      if (/\.html?$/i.test(path)) {
        const { doc, missing } = buildPageDocument(file.content, path, files, runId, "");
        startedAt.current = performance.now();
        setState((s) => ({
          ...s,
          phase: "running",
          doc,
          runId,
          page: path,
          history: history(s),
          entries: [...s.entries, ...missing.map((m) => ({ level: "warn" as const, text: `${path}: links to ${m}, which isn't one of the files` }))],
        }));
        return;
      }
      if (/\.php$/i.test(path)) {
        const controller = new AbortController();
        abort.current?.abort();
        abort.current = controller;
        setState((s) => ({ ...s, phase: "running", runId, entries: [...s.entries, { level: "info", text: `${method} ${path}${query ? `?${query}` : ""}${fields.length ? ` (${fields.length} field${fields.length === 1 ? "" : "s"})` : ""}` }] }));
        try {
          const r = await runOnServer(
            { language: "php", code: PHP_ROUTER, entry: PHP_ROUTER_PATH, files, stdin: phpRequestInput(path, method, query, fields) },
            controller.signal,
          );
          const { doc } = buildPageDocument(r.stdout || "<p></p>", path, files, runId, "");
          startedAt.current = performance.now();
          setState((s) =>
            s.runId !== runId ? s : { ...s, phase: r.verdict === "ok" ? "running" : "done", doc, page: path, history: history(s), meta: serverMeta(r), entries: [...s.entries, ...serverEntries(r, false)] },
          );
        } catch (e) {
          const err = e instanceof PlaygroundRunError ? e : new PlaygroundRunError("RUN_FAILED", "The page couldn't be run.");
          if (err.code === "CANCELED") return;
          setState((s) => (s.runId !== runId ? s : { ...s, phase: "done", entries: [...s.entries, { level: "error", text: `${path}: ${err.message}` }], meta: { verdict: "refused", where: "server" } }));
        } finally {
          if (abort.current === controller) abort.current = null;
        }
        return;
      }
      setState((s) => ({ ...s, entries: [...s.entries, { level: "warn", text: `${path} isn't a page (only .html and .php files open in the preview).` }] }));
    },
    [],
  );

  /** A link followed / form sent in the preview. */
  const navigate = useCallback(
    (nav: NavRequest) => {
      const from = state.page ?? last.current?.project.entry ?? "index.html";
      const { path, query } = resolvePath(from, nav.href || from);
      void openPage(path, nav.method, query, nav.fields, from);
    },
    [state.page, openPage],
  );

  const back = useCallback(() => {
    const prev = state.history[state.history.length - 1];
    if (!prev) return;
    setState((s) => ({ ...s, history: s.history.slice(0, -1) }));
    void openPage(prev, "GET", "", [], null);
  }, [state.history, openPage]);

  // A browser run's console: listened to for as long as it is the current run (also after it
  // "finished" — a click on the page can still log). In an effect keyed on the run, so React's
  // remounts (StrictMode, a closed and reopened playground) re-attach it.
  const browserRunId = state.doc ? state.runId : null;
  const navRef = useRef(navigate);
  navRef.current = navigate;
  useEffect(() => {
    if (!browserRunId) return;
    const runId = browserRunId;
    const finish = () => finishBrowser(runId);
    const unlisten = listenToRun(
      runId,
      (entry) =>
        setState((s) =>
          s.runId !== runId
            ? s
            : {
                ...s,
                entries: [...s.entries, entry].slice(-1000),
                output: entry.level === "log" ? (s.output ? `${s.output}\n${entry.text}` : entry.text) : s.output,
              },
        ),
      finish,
      (nav) => navRef.current(nav),
    );
    // Pages keep running (timers, clicks): stop waiting after a while, keep listening.
    const timer = window.setTimeout(finish, BROWSER_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
      unlisten();
    };
  }, [browserRunId, finishBrowser]);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setState((s) =>
      s.phase === "running"
        ? { ...s, phase: "done", doc: s.doc && !s.meta ? null : s.doc, meta: s.meta ?? { verdict: "refused", where: s.doc ? "browser" : "server" }, entries: [...s.entries, { level: "warn", text: "Stopped." }] }
        : s,
    );
  }, []);

  const clear = useCallback(() => setState((s) => ({ ...IDLE, doc: s.doc, runId: s.runId, page: s.page, history: s.history, meta: s.meta && { ...s.meta } })), []);

  const run = useCallback(
    async (lang: PlaygroundLanguage, project: PlayProject, stdin: string) => {
      abort.current?.abort();
      abort.current = null;
      last.current = { lang, project };
      const entry = project.files.find((f) => f.path === project.entry);
      const others = project.files.filter((f) => f.path !== project.entry);

      if (lang.browser) {
        const runId = newRunId();
        startedAt.current = performance.now();
        if (lang.browser === "web") {
          const first = startPage(project);
          if (!first && lang.id === "css") {
            const css = project.files.filter((f) => /\.css$/i.test(f.path)).map((f) => f.content).join("\n");
            setState({ ...IDLE, phase: "running", doc: buildCssDocument(css, runId), runId, page: null });
            return;
          }
          if (!first) {
            setState({ ...IDLE, phase: "done", entries: [{ level: "error", text: "Add an .html page (index.html) to show." }], meta: { verdict: "refused", where: "browser" } });
            return;
          }
          setState({ ...IDLE, phase: "running", runId: null });
          await openPage(first, "GET", "", [], null);
          return;
        }
        const doc = lang.browser === "react" ? buildReactDocument(project, runId) : buildScriptDocument(project, runId, stdin);
        setState({ ...IDLE, phase: "running", doc, runId });
        return;
      }

      const runId = newRunId();
      const controller = new AbortController();
      abort.current = controller;
      setState({ ...IDLE, phase: "running", runId });
      try {
        // One file under the language's usual name: let the server name it (Java: after its public class).
        const named = others.length > 0 || project.entry !== lang.file;
        const r = await runOnServer({ language: lang.runner!, code: entry?.content ?? "", entry: named ? project.entry : undefined, files: others, stdin }, controller.signal);
        // PHP that prints a page (and a project with pages): show it, links and forms working.
        const page = lang.id === "php" && r.verdict === "ok" && looksLikeHtml(r.stdout) ? buildPageDocument(r.stdout, project.entry, project.files, runId, "").doc : null;
        startedAt.current = performance.now();
        setState((s) =>
          s.runId !== runId
            ? s
            : { ...s, phase: "done", entries: serverEntries(r), output: r.stdout, meta: serverMeta(r), doc: page, page: page ? project.entry : null },
        );
      } catch (e) {
        const err = e instanceof PlaygroundRunError ? e : new PlaygroundRunError("RUN_FAILED", "The code couldn't be run.");
        if (err.code === "CANCELED") return;
        setState((s) => (s.runId !== runId ? s : { ...s, phase: "done", entries: [{ level: "error", text: err.message }], meta: { verdict: "refused", where: "server" } }));
      } finally {
        if (abort.current === controller) abort.current = null;
      }
    },
    [openPage],
  );

  /** Pages the preview can go to (web projects): for the address bar's list. */
  const pages = last.current ? [...htmlFiles(last.current.project.files).map((f) => f.path), ...last.current.project.files.filter((f) => /\.php$/i.test(f.path)).map((f) => f.path)] : [];

  return { state, run, stop, clear, navigate, back, openPage: (path: string) => openPage(path, "GET", "", [], state.page), pages };
}
