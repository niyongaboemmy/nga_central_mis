import { useCallback, useEffect, useRef, useState } from "react";
import { appendChunk, applyEvent, driveLiveRun, exitNote, type ConsoleChunk, type LiveExit, type LiveFields, type LiveTransport } from "./index";

/**
 * A live run as React state, for a page that only runs programs live (Task
 * Mentor's grading Console). The MIS Code Playground keeps its own state
 * (pages, browser runs, Arduino) and drives runs with driveLiveRun directly;
 * both read the same events the same way.
 */

export type LivePhase = "idle" | "running" | "done";

export interface LiveRunState extends LiveFields {
  phase: LivePhase;
  console: ConsoleChunk[];
  /** How the program ended (null while running, or when it never started). */
  exit: LiveExit | null;
  /** Why it couldn't start, said plainly. */
  error: { code: string | null; message: string } | null;
  /** Stopped by the person (Stop), not by the program. */
  stopped: boolean;
}

export const IDLE_LIVE: LiveRunState = { phase: "idle", console: [], live: null, lastOutputAt: 0, output: "", exit: null, error: null, stopped: false };

const messageOf = (e: unknown, fallback: string) => {
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === "string" && m ? m : fallback;
};
const codeOf = (e: unknown) => {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === "string" ? c : null;
};

export interface UseLiveRunOptions {
  /** The runner has no live runs (start failed with INTERACTIVE_UNAVAILABLE). */
  onUnavailable?: (message: string) => void;
}

export function useLiveRun<Req>(transport: LiveTransport<Req>, opts: UseLiveRunOptions = {}) {
  const [state, setState] = useState<LiveRunState>(IDLE_LIVE);
  const run = useRef<{ id: string | null; runId: number; stream: AbortController } | null>(null);
  const seq = useRef(0);
  const t = useRef(transport);
  t.current = transport;
  const o = useRef(opts);
  o.current = opts;

  const end = useCallback(() => {
    const r = run.current;
    run.current = null;
    if (!r) return;
    r.stream.abort();
    if (r.id) void t.current.stop(r.id);
  }, []);
  useEffect(() => () => end(), [end]);

  const start = useCallback(
    async (req: Req, prefill = "") => {
      end();
      const runId = ++seq.current;
      const stream = new AbortController();
      run.current = { id: null, runId, stream };
      const mine = () => run.current?.runId === runId;
      setState({ ...IDLE_LIVE, phase: "running", live: { id: null, stage: null }, lastOutputAt: Date.now() });
      let sessionId = "";
      await driveLiveRun(t.current, req, {
        signal: stream.signal,
        current: mine,
        prefill,
        started: (id) => {
          sessionId = id;
          run.current!.id = id;
          setState((s) => ({ ...s, live: { id, stage: s.live?.stage ?? null } }));
        },
        typed: (text) => setState((s) => ({ ...s, console: appendChunk(s.console, { kind: "in", text }) })),
        event: (ev) => {
          if (!mine()) return;
          if (ev.event === "exit") {
            const note = exitNote(ev.data);
            setState((s) => ({ ...s, phase: "done", live: null, exit: ev.data, console: note ? appendChunk(s.console, { kind: "note", text: note }) : s.console }));
          } else setState((s) => applyEvent(s, ev, sessionId) as LiveRunState);
        },
        failed: (e) => {
          run.current = null;
          const message = messageOf(e, "The program couldn't start.");
          if (codeOf(e) === "INTERACTIVE_UNAVAILABLE") o.current.onUnavailable?.(message);
          setState((s) => ({ ...s, phase: "done", live: null, error: { code: codeOf(e), message } }));
        },
        lost: (e) => {
          if (!mine()) return;
          setState((s) => ({ ...s, console: appendChunk(s.console, { kind: "err", text: `${messageOf(e, "The connection to the program was lost.")}\n` }) }));
        },
        ended: (exited) => {
          if (!mine()) return;
          run.current = null;
          if (!exited) setState((s) => (s.phase === "running" ? { ...s, phase: "done", live: null } : s));
        },
      });
    },
    [end],
  );

  const send = useCallback((body: { data?: string; eof?: boolean; signal?: "SIGINT" }, note?: string) => {
    const r = run.current;
    if (!r?.id) return;
    if (note) setState((s) => ({ ...s, console: appendChunk(s.console, { kind: "note", text: note }) }));
    void t.current.input(r.id, body).catch((e) => {
      if (body.data !== undefined && run.current?.runId === r.runId) {
        setState((s) => ({ ...s, console: appendChunk(s.console, { kind: "err", text: `${messageOf(e, "The input couldn't be sent.")}\n` }) }));
      }
    });
  }, []);

  /** A line typed into the console (sent with its newline). */
  const sendLine = useCallback(
    (text: string) => {
      if (!run.current?.id) return;
      const data = `${text}\n`;
      setState((s) => ({ ...s, console: appendChunk(s.console, { kind: "in", text: data }), lastOutputAt: Date.now() }));
      send({ data });
    },
    [send],
  );
  /** End of input (Ctrl+D): a program reading until the end stops waiting. */
  const sendEof = useCallback(() => send({ eof: true }, "End of input sent."), [send]);
  /** Ctrl+C: interrupt the program. */
  const interrupt = useCallback(() => send({ signal: "SIGINT" }), [send]);

  /** Stops the program (and its stream). */
  const stop = useCallback(() => {
    const was = run.current;
    end();
    if (was) setState((s) => (s.phase === "running" ? { ...s, phase: "done", live: null, stopped: true, console: appendChunk(s.console, { kind: "note", text: "Stopped." }) } : s));
  }, [end]);

  /** Clears the transcript (a running program keeps going). */
  const clear = useCallback(() => setState((s) => (s.phase === "running" ? { ...s, console: [] } : IDLE_LIVE)), []);

  return { state, start, sendLine, sendEof, interrupt, stop, clear };
}
