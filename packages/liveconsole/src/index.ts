/**
 * nga-liveconsole: a program run live on the code runner, the way the MIS Code
 * Playground runs it. The program starts in a session, its output streams in
 * as Server-Sent Events, and what is typed goes to its stdin while it waits.
 *
 * This file is the framework-free core: the event shapes, the SSE reader, the
 * console transcript, and one driver for a run's life (start, input typed in
 * advance, the event stream, the end). Each app brings a transport for its own
 * endpoints: the MIS relays to Task Mentor; Task Mentor's grading page talks
 * to its own /projects/:id/sessions. useLiveRun.ts (React state) and
 * LiveConsole.tsx (the console) build on it.
 *
 * Source of truth: nga_central_mis/packages/liveconsole/src. Apps get a
 * sha256-stamped copy through sync.mjs; never edit a copy.
 */

/** One piece of a live run's console: what the program printed, its errors, what was typed, our notes. */
export interface ConsoleChunk {
  kind: "out" | "err" | "in" | "note";
  text: string;
}

/** The runner's exit event. */
export interface LiveExit {
  code: number | null;
  signal: string | null;
  /** ok | compile-error | runtime-error | time-limit | memory-limit | output-limit | internal-error */
  verdict: string;
  time_ms: number | null;
  memory_kb: number | null;
}

export type SessionEvent =
  | { event: "stage"; data: { name: "build" | "run" } }
  | { event: "stdout" | "stderr"; data: { data: string } }
  | { event: "exit"; data: LiveExit }
  | { event: "error"; data: { message: string } };

export interface LiveInput {
  data?: string;
  eof?: boolean;
  signal?: "SIGINT";
}

/**
 * How an app reaches its sessions. `start` answers the session id, or throws
 * an error with a `code` (INTERACTIVE_UNAVAILABLE: this runner has no live
 * runs) and a plain `message`. `stream` resolves when the events end.
 */
export interface LiveTransport<Req> {
  start(req: Req): Promise<string>;
  stream(id: string, onEvent: (e: SessionEvent) => void, signal: AbortSignal): Promise<void>;
  input(id: string, body: LiveInput): Promise<void>;
  stop(id: string): Promise<void>;
}

export const CONSOLE_MAX = 400_000;

/** Adds to a transcript, joining runs of the same kind (and keeping it bounded). */
export function appendChunk(chunks: ConsoleChunk[], c: ConsoleChunk): ConsoleChunk[] {
  if (!c.text) return chunks;
  const last = chunks[chunks.length - 1];
  const next = last && last.kind === c.kind && c.kind !== "note" ? [...chunks.slice(0, -1), { ...last, text: last.text + c.text }] : [...chunks, c];
  let total = next.reduce((n, x) => n + x.text.length, 0);
  while (total > CONSOLE_MAX && next.length > 1) total -= next.shift()!.text.length;
  return next;
}

const EVENTS = ["stage", "stdout", "stderr", "exit", "error"];

/** Reads a session's Server-Sent Events (split anywhere across network chunks) until the stream ends. */
export async function readSessionEvents(body: ReadableStream<Uint8Array>, onEvent: (e: SessionEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (!data.length || !EVENTS.includes(event)) continue;
      try {
        onEvent({ event, data: JSON.parse(data.join("\n")) } as SessionEvent);
      } catch {
        /* a malformed event is skipped */
      }
    }
  }
}

/** The live part of a run's state (an app's state may hold more). */
export interface LiveFields {
  console: ConsoleChunk[] | null;
  /** The live run in progress: its session and stage. */
  live: { id: string | null; stage: "build" | "run" | null } | null;
  /** When the program last printed something ("is it waiting for me?"). */
  lastOutputAt: number;
  /** The program's own output (stdout). */
  output: string;
}

/** What a stage, output or error event does to the live state (exit: see exitNote). */
export function applyEvent<S extends LiveFields>(s: S, ev: SessionEvent, id: string): S {
  if (ev.event === "stage") {
    const note = ev.data.name === "build" ? "Building your program…" : s.live?.stage === "build" ? "Running…" : "";
    return { ...s, live: { id, stage: ev.data.name }, lastOutputAt: Date.now(), console: note ? appendChunk(s.console ?? [], { kind: "note", text: note }) : s.console };
  }
  if (ev.event === "stdout" || ev.event === "stderr") {
    const text = ev.data.data;
    return {
      ...s,
      console: appendChunk(s.console ?? [], { kind: ev.event === "stdout" ? "out" : "err", text }),
      output: ev.event === "stdout" ? s.output + text : s.output,
      lastOutputAt: Date.now(),
    };
  }
  if (ev.event === "error") return { ...s, console: appendChunk(s.console ?? [], { kind: "err", text: `${ev.data.message}\n` }) };
  return s;
}

/** The console's last word on how the program ended ("" when it ended normally or didn't compile). */
export function exitNote(d: LiveExit): string {
  if (d.signal) return `Stopped (${d.signal}).`;
  if (d.verdict === "time-limit") return "Stopped: it ran too long (or waited for input too long).";
  if (d.verdict === "compile-error") return "";
  return d.code ? `Exited with code ${d.code}.` : "";
}

export interface DriveHandlers {
  /** Aborts the event stream (stop, a new run, leaving the page). */
  signal: AbortSignal;
  /** Whether this run is still the one on screen. */
  current: () => boolean;
  /** Input typed before the program started (sent as soon as it does). */
  prefill?: string;
  /** The session started (its id). */
  started: (id: string) => void;
  /** The prefilled input, as it goes to the program (for the transcript). */
  typed: (text: string) => void;
  event: (ev: SessionEvent) => void;
  /** It couldn't start (the transport's error). */
  failed: (error: unknown) => void;
  /** The stream broke before the program ended. */
  lost: (error: unknown) => void;
  /** The stream is over: `exited` when the program's exit was seen. */
  ended: (exited: boolean) => void;
}

/**
 * One live run from start to end. A run superseded while it was starting is
 * stopped at once; the stream's end always reports `ended`.
 */
export async function driveLiveRun<Req>(transport: LiveTransport<Req>, req: Req, h: DriveHandlers): Promise<void> {
  let id: string;
  try {
    id = await transport.start(req);
  } catch (e) {
    if (h.current()) h.failed(e);
    return;
  }
  if (!h.current()) {
    void transport.stop(id);
    return;
  }
  h.started(id);
  const prefill = h.prefill ?? "";
  if (prefill.trim()) {
    const text = prefill.endsWith("\n") ? prefill : `${prefill}\n`;
    h.typed(text);
    void transport.input(id, { data: text }).catch(() => undefined);
  }
  let exited = false;
  try {
    await transport.stream(
      id,
      (ev) => {
        if (ev.event === "exit") exited = true;
        h.event(ev);
      },
      h.signal,
    );
  } catch (e) {
    if (!h.signal.aborted) h.lost(e);
  } finally {
    h.ended(exited);
  }
}

// ─── The console's look (LiveConsole.tsx): Tailwind classes and words an app may replace ───

export interface LiveConsoleTheme {
  out: string;
  err: string;
  in: string;
  note: string;
  starting: string;
  /** The input box while the program asks. */
  asking: string;
  input: string;
  /** The status bar while the program asks / otherwise. */
  barAsking: string;
  bar: string;
  status: string;
  waiting: string;
  eof: string;
  interrupt: string;
}

export const PLAYGROUND_THEME: LiveConsoleTheme = {
  out: "text-slate-800 dark:text-slate-100",
  err: "text-danger-700 dark:text-red-400",
  in: "text-brand-700 dark:text-brand-200 font-semibold",
  note: "text-slate-500 dark:text-slate-400",
  starting: "text-slate-500 dark:text-slate-400",
  asking: "bg-brand-50 dark:bg-brand-500/15 ring-1 ring-brand-500/50",
  input: "text-brand-700 dark:text-brand-200 font-semibold caret-brand-500",
  barAsking: "border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10",
  bar: "border-slate-200 dark:border-white/10",
  status: "text-slate-600 dark:text-slate-300",
  waiting: "text-brand-700 dark:text-brand-200",
  eof: "text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10",
  interrupt: "text-danger-700 dark:text-red-400 hover:bg-danger-100/60 dark:hover:bg-red-500/10",
};

export interface LiveConsoleTexts {
  starting: string;
  waiting: string;
  quiet: string;
  inputLabel: string;
}

export const PLAYGROUND_TEXTS: LiveConsoleTexts = {
  starting: "Starting your program…",
  waiting: "Your program is waiting for input — type it above and press Enter",
  quiet: "If your program is reading input, type it above and press Enter",
  inputLabel: "Input for your program — type and press Enter",
};
