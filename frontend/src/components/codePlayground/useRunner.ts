import { useCallback, useEffect, useRef, useState } from "react";
import { getRunnerLanguages, PlaygroundRunError, runOnServer } from "../../api/codePlayground";
import { buildDocument, CSS_SAMPLE_HTML, listenToRun, newRunId, type ConsoleEntry } from "./browserRun";
import type { PlaygroundLanguage } from "./languages";

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
  /** srcdoc of the preview frame (web pages, React, browser JS). */
  doc: string | null;
  runId: string | null;
}

const IDLE: RunState = { phase: "idle", entries: [], meta: null, output: "", doc: null, runId: null };
const BROWSER_TIMEOUT_MS = 6000;

/** The runner's languages (null until known). Shared across every playground on the page. */
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

export function useRunner() {
  const [state, setState] = useState<RunState>(IDLE);
  const abort = useRef<AbortController | null>(null);
  const startedAt = useRef(0);

  // A browser run's console: listened to for as long as it is the current run (also after
  // it "finished" — a click on the page can still log). In an effect keyed on the run, so
  // React's remounts (StrictMode, a closed and reopened playground) re-attach it.
  const browserRunId = state.meta?.where === "browser" || (state.phase === "running" && state.doc) ? state.runId : null;
  useEffect(() => {
    if (!browserRunId) return;
    const runId = browserRunId;
    const finish = () =>
      setState((s) => {
        if (s.runId !== runId || s.phase !== "running") return s;
        const failed = s.entries.some((e) => e.level === "error");
        return { ...s, phase: "done", meta: { verdict: failed ? "runtime-error" : "ok", where: "browser", time_ms: Math.round(performance.now() - startedAt.current) } };
      });
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
    );
    // Pages keep running (timers, clicks): stop waiting after a while, keep listening.
    const timer = window.setTimeout(finish, BROWSER_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
      unlisten();
    };
  }, [browserRunId]);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setState((s) =>
      s.phase === "running"
        ? { ...s, phase: "done", doc: s.doc && !s.meta ? null : s.doc, meta: s.meta ?? { verdict: "refused", where: s.doc ? "browser" : "server" }, entries: [...s.entries, { level: "warn", text: "Stopped." }] }
        : s,
    );
  }, []);

  const clear = useCallback(() => setState((s) => ({ ...IDLE, doc: s.doc, runId: s.runId, meta: s.meta && { ...s.meta } })), []);

  const run = useCallback(async (lang: PlaygroundLanguage, code: string, stdin: string) => {
    abort.current?.abort();
    abort.current = null;

    if (lang.browser) {
      const runId = newRunId();
      const files = lang.id === "css" ? { html: CSS_SAMPLE_HTML, css: code, js: "" } : lang.browser === "web" ? { html: code, css: "", js: "" } : { html: "", css: "", js: code };
      startedAt.current = performance.now();
      setState({ phase: "running", entries: [], meta: null, output: "", doc: buildDocument(lang.browser, files, runId, stdin), runId });
      return;
    }

    const runId = newRunId();
    const controller = new AbortController();
    abort.current = controller;
    setState({ phase: "running", entries: [], meta: null, output: "", doc: null, runId });
    try {
      const r = await runOnServer({ language: lang.runner!, code, stdin }, controller.signal);
      const entries: ConsoleEntry[] = [];
      if (r.compile_output && r.verdict === "compile-error") entries.push({ level: "error", text: r.compile_output });
      else if (r.compile_output) entries.push({ level: "warn", text: r.compile_output });
      if (r.stdout) entries.push({ level: "log", text: r.stdout.replace(/\n$/, "") });
      if (r.stderr) entries.push({ level: r.verdict === "ok" ? "warn" : "error", text: r.stderr.replace(/\n$/, "") });
      setState((s) =>
        s.runId !== runId
          ? s
          : {
              ...s,
              phase: "done",
              entries,
              output: r.stdout,
              meta: { verdict: r.verdict, where: "server", engine: r.engine, time_ms: r.time_ms, memory_kb: r.memory_kb, exit_code: r.exit_code },
            },
      );
    } catch (e) {
      const err = e instanceof PlaygroundRunError ? e : new PlaygroundRunError("RUN_FAILED", "The code couldn't be run.");
      if (err.code === "CANCELED") return;
      setState((s) => (s.runId !== runId ? s : { ...s, phase: "done", entries: [{ level: "error", text: err.message }], meta: { verdict: "refused", where: "server" } }));
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  }, []);

  return { state, run, stop, clear };
}
