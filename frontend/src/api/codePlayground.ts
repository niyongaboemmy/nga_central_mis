import api from "../services/api";

/** Code Playground: lesson code runs on Task Mentor's code runner, relayed by the MIS. */

export interface RunnerLanguage {
  key: string;
  label: string;
  engine: string | null;
}

export interface RunnerLanguages {
  available: boolean;
  languages: RunnerLanguage[];
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

let languagesRequest: Promise<RunnerLanguages> | null = null;

/** The runner's languages, fetched once per page load (a failure is retried next time). */
export const getRunnerLanguages = (): Promise<RunnerLanguages> =>
  (languagesRequest ??= api
    .get<{ data: RunnerLanguages }>("/code-playground/languages", { timeout: 15000 })
    .then((r) => r.data.data)
    .catch(() => {
      languagesRequest = null;
      return { available: false, languages: [], message: "Couldn't reach the code runner." };
    }));

export async function runOnServer(body: { language: string; code: string; stdin?: string }, signal?: AbortSignal): Promise<PlaygroundRunResult> {
  try {
    const res = await api.post<{ data: PlaygroundRunResult }>("/code-playground/run", body, { timeout: 60000, signal });
    return res.data.data;
  } catch (e: any) {
    if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") throw new PlaygroundRunError("CANCELED", "Run stopped.");
    const data = e?.response?.data;
    if (data?.code || data?.message) throw new PlaygroundRunError(data.code ?? "RUN_FAILED", data.message ?? "The code couldn't be run.");
    if (e?.code === "ECONNABORTED") throw new PlaygroundRunError("TIMEOUT", "The run took too long. Check for an endless loop or waiting for input.");
    throw new PlaygroundRunError("NETWORK", "Couldn't reach the MIS. Check your connection and try again.");
  }
}
