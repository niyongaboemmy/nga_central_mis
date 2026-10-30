import api, { API_BASE_URL } from "../services/api";
import { readSessionEvents, type SessionEvent } from "../vendor/nga-liveconsole";

/** Code Playground: lesson code runs on Task Mentor's code runner, relayed by the MIS. */

export interface RunnerLanguage {
  key: string;
  label: string;
  engine: string | null;
}

export interface RunnerLanguages {
  available: boolean;
  languages: RunnerLanguage[];
  /** The runner runs programs live (output as it comes, input while they wait). */
  interactive?: boolean;
  message?: string;
}

export interface PlaygroundRunResult {
  language: string;
  engine: string | null;
  verdict: string;
  stdout: string;
  stderr: string;
  compile_output: string;
  exit_code: number | null;
  time_ms: number | null;
  memory_kb: number | null;
  status: string | null;
}

export class PlaygroundRunError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let languagesRequest: { at: number; request: Promise<RunnerLanguages> } | null = null;
const LANGUAGES_TTL_MS = 60_000;

/**
 * The runner's languages, shared by every playground on the page for a minute. Not for the
 * whole visit: a language the runner gains (a toolchain installed) shows up without a reload.
 */
export const getRunnerLanguages = (): Promise<RunnerLanguages> => {
  if (languagesRequest && Date.now() - languagesRequest.at < LANGUAGES_TTL_MS) return languagesRequest.request;
  const request = api
    .get<{ data: RunnerLanguages }>("/code-playground/languages", { timeout: 15000 })
    .then((r) => r.data.data)
    .catch(() => {
      languagesRequest = null;
      return { available: false, languages: [], message: "Couldn't reach the code runner." };
    });
  languagesRequest = { at: Date.now(), request };
  return request;
};

/** Tests only. */
export const resetRunnerLanguages = () => {
  languagesRequest = null;
};

/**
 * One run: `code` is the main file (`entry`, a project path; named for the language when
 * left out), `files` the other files it uses (imports, includes, pages, data).
 */
export async function runOnServer(
  body: { language: string; code: string; entry?: string; files?: { path: string; content: string }[]; stdin?: string },
  signal?: AbortSignal,
): Promise<PlaygroundRunResult> {
  try {
    const res = await api.post<{ data: PlaygroundRunResult }>("/code-playground/run", body, { timeout: 60000, signal });
    return res.data.data;
  } catch (e: any) {
    if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") throw new PlaygroundRunError("CANCELED", "Run stopped.");
    const data = e?.response?.data;
    if (e?.response?.status === 403) throw new PlaygroundRunError("FORBIDDEN", "Your role doesn't include the Code Playground. Ask the school's administrator for access.");
    if (data?.code || data?.message) throw new PlaygroundRunError(data.code ?? "RUN_FAILED", data.message ?? "The code couldn't be run.");
    if (e?.code === "ECONNABORTED") throw new PlaygroundRunError("TIMEOUT", "The run took too long. Check for an endless loop or waiting for input.");
    throw new PlaygroundRunError("NETWORK", "Couldn't reach the MIS. Check your connection and try again.");
  }
}

// ---------------------------------------------------------------- live runs

/** What the runner says about a live run, as it happens. */
// The live run's events and their reader are nga-liveconsole's (shared with Task Mentor's grading).
export type { SessionEvent } from "../vendor/nga-liveconsole";

const errorOf = (e: any, fallback: string) => {
  if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") return new PlaygroundRunError("CANCELED", "Run stopped.");
  if (e?.response?.status === 403) return new PlaygroundRunError("FORBIDDEN", "Your role doesn't include the Code Playground. Ask the school's administrator for access.");
  const data = e?.response?.data;
  if (data?.code || data?.message) return new PlaygroundRunError(data.code ?? "RUN_FAILED", data.message ?? fallback);
  return new PlaygroundRunError("NETWORK", "Couldn't reach the MIS. Check your connection and try again.");
};

/** Start a program live; returns the session id. */
export async function startLiveRun(body: { language: string; code: string; entry?: string; files?: { path: string; content: string }[] }): Promise<string> {
  try {
    const res = await api.post<{ data: { id: string } }>("/code-playground/sessions", body, { timeout: 60000 });
    return res.data.data.id;
  } catch (e) {
    throw errorOf(e, "The program couldn't start.");
  }
}

/** A line typed by the student (with its newline), end of input, or Ctrl+C. */
export async function sendLiveInput(id: string, body: { data?: string; eof?: boolean; signal?: "SIGINT" }): Promise<void> {
  try {
    await api.post(`/code-playground/sessions/${id}/input`, body, { timeout: 15000 });
  } catch (e) {
    throw errorOf(e, "The input couldn't be sent.");
  }
}

export async function stopLiveRun(id: string): Promise<void> {
  await api.delete(`/code-playground/sessions/${id}`, { timeout: 10000 }).catch(() => undefined);
}

/**
 * The live run's events, read with fetch (not EventSource) so the session token travels in
 * the Authorization header, never in a URL. Resolves when the stream ends.
 */
export async function streamLiveRun(id: string, onEvent: (e: SessionEvent) => void, signal: AbortSignal): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem("token");
  } catch {
    token = null;
  }
  const res = await fetch(`${API_BASE_URL}/code-playground/sessions/${id}/events`, {
    headers: { Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: "include",
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new PlaygroundRunError(data?.code ?? "RUN_FAILED", data?.message ?? "The program's output couldn't be read.");
  }
  await readSessionEvents(res.body, onEvent);
}
