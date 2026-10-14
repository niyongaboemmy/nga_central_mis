import { configuredApps } from "../home/apps";

// ============================================================================
// Code Playground <- Task Mentor's code runner.
//
// Lesson code (notes, e-learning pages, exercises) runs on the runner Task
// Mentor already operates (tm-judge, Judge0 as fallback): the MIS backend relays
// to Task Mentor's /api/integration/code/* with the user's own MIS token, like
// the Home relay, so the browser needs no CORS entries or app URLs and every
// answer is reshaped here before it reaches the page. Web pages (HTML, CSS,
// React, browser JavaScript) never come here: the page runs them in a
// sandboxed frame.
// ============================================================================

export interface RunnerLanguage {
  key: string;
  label: string;
  engine: string | null;
}

export interface PlaygroundRunInput {
  language: string;
  code: string;
  /** The main file's path (a project of several files); named for the language when absent. */
  entry?: string | null;
  stdin: string;
  /** Extra files next to the main one (helpers, data). */
  files: { path: string; content: string }[];
}

export interface PlaygroundRunResult {
  language: string;
  engine: string | null;
  /** "ok" (it ran), or what stopped it: compile-error, runtime-error, time-limit, ... */
  verdict: string;
  stdout: string;
  stderr: string;
  compile_output: string;
  exit_code: number | null;
  time_ms: number | null;
  memory_kb: number | null;
  status: string | null;
}

export class RunnerError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** File the code is saved as: the name each runner expects for a one-file program. */
const MAIN_FILE: Record<string, string> = {
  python: "main.py",
  javascript: "main.js",
  typescript: "main.ts",
  c: "main.c",
  cpp: "main.cpp",
  csharp: "Program.cs",
  go: "main.go",
  rust: "main.rs",
  php: "main.php",
  ruby: "main.rb",
  kotlin: "Main.kt",
  swift: "main.swift",
  sql: "main.sql",
  bash: "main.sh",
  lua: "main.lua",
  r: "main.R",
  scala: "Main.scala",
  dart: "main.dart",
};

/** Java needs the file named after its public class. */
export function mainFileFor(language: string, code: string): string {
  if (language === "java") {
    const cls = code.match(/\bpublic\s+(?:final\s+|abstract\s+)*class\s+([A-Za-z_]\w*)/)?.[1];
    return `${cls ?? "Main"}.java`;
  }
  return MAIN_FILE[language] ?? `main.${language}`;
}

const taskMentor = () => configuredApps().find((a) => a.source === "taskmentor") ?? null;
const timeoutMs = () => Number(process.env.CODE_PLAYGROUND_TIMEOUT_MS) || 45_000;

async function call(path: string, token: string, init: { method: "GET" | "POST" | "DELETE"; body?: unknown }): Promise<any> {
  const tm = taskMentor();
  if (!tm) throw new RunnerError(503, "RUNNER_NOT_CONNECTED", "The code runner is not connected to the MIS yet.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), path.endsWith("/run") ? timeoutMs() : 8000);
  let res: Response;
  try {
    res = await fetch(`${tm.apiBaseUrl}/api/integration/code${path}`, {
      method: init.method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
  } catch (e: any) {
    throw new RunnerError(
      503,
      e?.name === "AbortError" ? "RUNNER_TIMEOUT" : "RUNNER_UNAVAILABLE",
      e?.name === "AbortError" ? "The code runner took too long to answer. Try again." : "The code runner can't be reached right now. Try again in a moment.",
    );
  } finally {
    clearTimeout(timer);
  }
  const json: any = await res.json().catch(() => null);
  if (res.status === 204) return null;
  if (res.ok && json?.success !== false) return json?.data ?? null;

  const code = typeof json?.code === "string" ? json.code : "RUN_FAILED";
  const message = typeof json?.message === "string" ? json.message.slice(0, 300) : "The code couldn't be run. Try again.";
  if (res.status === 401) throw new RunnerError(401, "SESSION_EXPIRED", "Your session expired. Sign in again to run code.");
  if (res.status === 429) throw new RunnerError(429, "RATE_LIMITED", message);
  if (res.status === 413) throw new RunnerError(413, "TOO_LARGE", message);
  if (res.status === 404 || res.status === 409) throw new RunnerError(res.status, code, message);
  if (res.status >= 400 && res.status < 500) throw new RunnerError(422, code, message);
  throw new RunnerError(503, code, message);
}

let languageCache: { at: number; languages: RunnerLanguage[]; interactive: boolean } | null = null;

/** The languages the runner runs now, and whether it runs programs live (cached a minute). */
export async function runnerLanguages(token: string): Promise<{ languages: RunnerLanguage[]; interactive: boolean }> {
  if (languageCache && Date.now() - languageCache.at < 60_000) return languageCache;
  const data = await call("/languages", token, { method: "GET" });
  const languages: RunnerLanguage[] = (Array.isArray(data?.languages) ? data.languages : [])
    .filter((l: any) => l && typeof l.key === "string")
    .map((l: any) => ({ key: String(l.key).slice(0, 40), label: String(l.label ?? l.key).slice(0, 60), engine: typeof l.engine === "string" ? l.engine : null }));
  languageCache = { at: Date.now(), languages, interactive: data?.interactive === true };
  return languageCache;
}

/** Tests only. */
export const clearRunnerLanguageCache = () => {
  languageCache = null;
};

const text = (v: unknown, max = 64 * 1024) => (typeof v === "string" ? v.slice(0, max) : "");
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** One run of the code with the given input; the answer reshaped for the page. */
export async function runCode(token: string, input: PlaygroundRunInput): Promise<PlaygroundRunResult> {
  const main = input.entry || mainFileFor(input.language, input.code);
  const extra = input.files.filter((f) => f.path !== main);
  const data = await call("/run", token, {
    method: "POST",
    body: {
      language: input.language,
      entry: main,
      files: [{ path: main, content: input.code }, ...extra],
      tests: [{ id: "run", input: input.stdin }],
    },
  });
  const test = Array.isArray(data?.tests) ? data.tests[0] : null;
  const compile = data?.compile && typeof data.compile === "object" ? data.compile : null;
  const compileFailed = compile && compile.ok === false;
  return {
    language: typeof data?.language === "string" ? data.language : input.language,
    engine: typeof data?.engine === "string" ? data.engine : null,
    verdict: compileFailed ? "compile-error" : text(test?.verdict, 40) || (data?.error ? "internal-error" : "ok"),
    stdout: text(test?.stdout),
    stderr: text(test?.stderr) || text(data?.error?.message, 2000),
    compile_output: compile ? text(compile.output) : "",
    exit_code: numOrNull(test?.exit_code),
    time_ms: numOrNull(test?.time_ms),
    memory_kb: numOrNull(test?.memory_kb),
    status: typeof test?.status === "string" ? test.status.slice(0, 120) : null,
  };
}

// ---------------------------------------------------------------- live runs (sessions)
//
// A program that asks for input runs live: Task Mentor starts it on the runner, its output
// streams back as Server-Sent Events, and what the student types goes to its stdin while
// it waits (Task Mentor /api/integration/code/sessions).

const SESSION_ID = /^[a-f0-9]{8,64}$/;
export const validSessionId = (id: string) => SESSION_ID.test(id);

/** Start a live run of a project (the main file under `entry`). Returns Task Mentor's session id. */
export async function startSession(token: string, input: Omit<PlaygroundRunInput, "stdin">): Promise<string> {
  const main = input.entry || mainFileFor(input.language, input.code);
  const extra = input.files.filter((f) => f.path !== main);
  const data = await call("/sessions", token, {
    method: "POST",
    body: { language: input.language, entry: main, files: [{ path: main, content: input.code }, ...extra] },
  });
  const id = typeof data?.id === "string" ? data.id : "";
  if (!validSessionId(id)) throw new RunnerError(503, "RUN_FAILED", "The live run couldn't start. Try again.");
  return id;
}

/** A line of input, end of input, or Ctrl+C for a live run. */
export async function sessionInput(token: string, id: string, body: { data?: string; eof?: boolean; signal?: "SIGINT" | "SIGTERM" }) {
  await call(`/sessions/${id}/input`, token, { method: "POST", body });
}

export async function stopSession(token: string, id: string) {
  await call(`/sessions/${id}`, token, { method: "DELETE" }).catch(() => undefined);
}

/** The live run's event stream from Task Mentor (null when it isn't there any more). */
export async function openSessionEvents(token: string, id: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array> | null> {
  const tm = taskMentor();
  if (!tm) throw new RunnerError(503, "RUNNER_NOT_CONNECTED", "The code runner is not connected to the MIS yet.");
  let res: Response;
  try {
    res = await fetch(`${tm.apiBaseUrl}/api/integration/code/sessions/${id}/events`, { headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" }, signal });
  } catch {
    throw new RunnerError(503, "RUNNER_UNAVAILABLE", "The code runner can't be reached right now. Try again in a moment.");
  }
  if (res.status === 404) return null;
  if (!res.ok || !res.body) throw new RunnerError(503, "RUN_FAILED", "The live run's output couldn't be read.");
  return res.body;
}
