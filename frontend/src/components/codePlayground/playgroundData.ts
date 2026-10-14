import { languageById } from "./languages";
import { MAX_FILES, pathProblem, type PlayFile } from "./project";

/**
 * A Code Playground block inside a lesson note: an example students run and change, or
 * an exercise they solve and check. Saved in the note HTML as
 *   <div data-type="code-playground" data-playground="{json}"><pre><code class="language-x">…</code></pre></div>
 * — the <pre> is the readable fallback (print, PDF, the editor's own HTML).
 */
export interface PlaygroundBlock {
  mode: "example" | "exercise";
  title: string;
  /** Playground language id (languages.ts). */
  language: string;
  /** The code students start from: the main file's text. */
  code: string;
  /** The main file's name ("" = the language's usual one, e.g. main.py). */
  entry: string;
  /** Other files of the program (modules, headers, pages, stylesheets, PHP actions…). */
  files: PlayFile[];
  /** What to do (plain text; blank lines start paragraphs). */
  instructions: string;
  /** Input given to the program (stdin / prompt()). */
  stdin: string;
  /** Exercise: the output a correct program prints; empty = no automatic check. */
  expected: string;
  hint: string;
  solution: string;
}

export const DEFAULT_BLOCK: PlaygroundBlock = {
  mode: "example",
  title: "",
  language: "html",
  code: languageById("html")!.starter,
  entry: "",
  files: [],
  instructions: "",
  stdin: "",
  expected: "",
  hint: "",
  solution: "",
};

const MAX = { title: 120, code: 20000, instructions: 2000, stdin: 4000, expected: 4000, hint: 600, solution: 20000 };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function parseBlock(raw: unknown): PlaygroundBlock {
  let d: any = raw;
  if (typeof raw === "string") {
    try {
      d = JSON.parse(raw);
    } catch {
      d = null;
    }
  }
  if (!d || typeof d !== "object") return { ...DEFAULT_BLOCK };
  const language = languageById(d.language) ? String(d.language) : DEFAULT_BLOCK.language;
  const entry = typeof d.entry === "string" && !pathProblem(d.entry, []) ? d.entry : "";
  const files: PlayFile[] = [];
  for (const x of Array.isArray(d.files) ? d.files.slice(0, MAX_FILES) : []) {
    if (x && typeof x.path === "string" && typeof x.content === "string" && x.path !== entry && !pathProblem(x.path, files)) files.push({ path: x.path, content: x.content.slice(0, MAX.code) });
  }
  return {
    mode: d.mode === "exercise" ? "exercise" : "example",
    title: str(d.title, MAX.title),
    language,
    code: typeof d.code === "string" ? d.code.slice(0, MAX.code) : languageById(language)!.starter,
    entry,
    files,
    instructions: str(d.instructions, MAX.instructions),
    stdin: str(d.stdin, MAX.stdin),
    expected: str(d.expected, MAX.expected),
    hint: str(d.hint, MAX.hint),
    solution: str(d.solution, MAX.solution),
  };
}

/** Compact JSON: empty fields are left out. */
export function serializeBlock(b: PlaygroundBlock): string {
  const out: Record<string, string> = { mode: b.mode, language: b.language, code: b.code };
  if (b.entry && b.entry === languageById(b.language)?.file) b = { ...b, entry: "" };
  for (const k of ["title", "instructions", "stdin", "expected", "hint", "solution", "entry"] as const) if (b[k].trim()) out[k] = b[k];
  return JSON.stringify(b.files.length ? { ...out, files: b.files } : out);
}

/** Output comparison for "Check": trailing spaces and blank lines at the end don't count. */
export const normalizeOutput = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "")
    .replace(/^\n+/, "");

export const outputMatches = (actual: string, expected: string) => normalizeOutput(actual) === normalizeOutput(expected);
