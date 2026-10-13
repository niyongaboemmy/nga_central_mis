/**
 * The Code Playground's languages. Two kinds of run:
 *
 *  - server: Task Mentor's code runner (tm-judge, Judge0 as fallback) through the MIS
 *    relay (/code-playground/run). `runner` is the runner's language key; whether it
 *    is switched on right now comes from /code-playground/languages.
 *  - browser: a sandboxed frame on this page (HTML/CSS pages, browser JavaScript and
 *    React). Instant, no quota, works when the runner is away.
 */

export type BrowserKind = "js" | "web" | "react";

export interface PlaygroundLanguage {
  id: string;
  label: string;
  /** Short name on chips and the file tab. */
  short: string;
  /** Task Mentor runner key for server runs. */
  runner?: string;
  browser?: BrowserKind;
  /** highlight.js language id (lesson code windows). */
  hljs: string;
  /** File name shown on the editor tab. */
  file: string;
  /** Prettier parser, when Prettier formats it; else the brace formatter does. */
  prettier?: "babel" | "typescript" | "css" | "html" | "json";
  /** Reads input (stdin) — shows the Input panel. */
  stdin: boolean;
  starter: string;
}

const L = (l: PlaygroundLanguage) => l;

export const LANGUAGES: PlaygroundLanguage[] = [
  L({
    id: "javascript",
    label: "JavaScript (browser)",
    short: "JS",
    browser: "js",
    hljs: "javascript",
    file: "script.js",
    prettier: "babel",
    stdin: true,
    starter: 'const name = prompt("Your name?") || "student";\nconsole.log(`Hello, ${name}!`);\n',
  }),
  L({
    id: "node",
    label: "Node.js",
    short: "Node",
    runner: "javascript",
    hljs: "javascript",
    file: "main.js",
    prettier: "babel",
    stdin: true,
    starter:
      'const lines = require("fs").readFileSync(0, "utf8").trim().split("\\n");\nconsole.log(`Hello, ${lines[0] || "student"}!`);\n',
  }),
  L({
    id: "typescript",
    label: "TypeScript",
    short: "TS",
    runner: "typescript",
    hljs: "typescript",
    file: "main.ts",
    prettier: "typescript",
    stdin: true,
    starter: 'const greet = (name: string): string => `Hello, ${name}!`;\nconsole.log(greet("student"));\n',
  }),
  L({
    id: "python",
    label: "Python",
    short: "Py",
    runner: "python",
    hljs: "python",
    file: "main.py",
    stdin: true,
    starter: 'import sys\n\nname = sys.stdin.readline().strip() or "student"\nprint(f"Hello, {name}!")\n',
  }),
  L({
    id: "java",
    label: "Java",
    short: "Java",
    runner: "java",
    hljs: "java",
    file: "Main.java",
    stdin: true,
    starter:
      'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        String line = in.hasNextLine() ? in.nextLine().trim() : "";\n        String name = line.isEmpty() ? "student" : line;\n        System.out.println("Hello, " + name + "!");\n    }\n}\n',
  }),
  L({
    id: "c",
    label: "C",
    short: "C",
    runner: "c",
    hljs: "c",
    file: "main.c",
    stdin: true,
    starter: '#include <stdio.h>\n\nint main(void) {\n    char name[64] = "student";\n    scanf("%63s", name);\n    printf("Hello, %s!\\n", name);\n    return 0;\n}\n',
  }),
  L({
    id: "cpp",
    label: "C++",
    short: "C++",
    runner: "cpp",
    hljs: "cpp",
    file: "main.cpp",
    stdin: true,
    starter:
      '#include <iostream>\n#include <string>\n\nint main() {\n    std::string name;\n    if (!std::getline(std::cin, name) || name.empty()) name = "student";\n    std::cout << "Hello, " << name << "!" << std::endl;\n    return 0;\n}\n',
  }),
  L({
    id: "csharp",
    label: "C#",
    short: "C#",
    runner: "csharp",
    hljs: "csharp",
    file: "Program.cs",
    stdin: true,
    starter: 'using System;\n\nclass Program {\n    static void Main() {\n        var name = Console.ReadLine();\n        if (string.IsNullOrWhiteSpace(name)) name = "student";\n        Console.WriteLine($"Hello, {name}!");\n    }\n}\n',
  }),
  L({
    id: "php",
    label: "PHP",
    short: "PHP",
    runner: "php",
    hljs: "php",
    file: "main.php",
    stdin: true,
    starter: '<?php\n$name = trim(fgets(STDIN)) ?: "student";\necho "Hello, $name!\\n";\n',
  }),
  L({ id: "go", label: "Go", short: "Go", runner: "go", hljs: "go", file: "main.go", stdin: true, starter: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, student!")\n}\n' }),
  L({ id: "rust", label: "Rust", short: "Rust", runner: "rust", hljs: "rust", file: "main.rs", stdin: true, starter: 'fn main() {\n    println!("Hello, student!");\n}\n' }),
  L({ id: "kotlin", label: "Kotlin", short: "Kt", runner: "kotlin", hljs: "kotlin", file: "Main.kt", stdin: true, starter: 'fun main() {\n    println("Hello, student!")\n}\n' }),
  L({ id: "ruby", label: "Ruby", short: "Ruby", runner: "ruby", hljs: "ruby", file: "main.rb", stdin: true, starter: 'name = gets.to_s.strip\nname = "student" if name.empty?\nputs "Hello, #{name}!"\n' }),
  L({ id: "swift", label: "Swift", short: "Swift", runner: "swift", hljs: "swift", file: "main.swift", stdin: true, starter: 'print("Hello, student!")\n' }),
  L({ id: "bash", label: "Bash", short: "Bash", runner: "bash", hljs: "bash", file: "main.sh", stdin: true, starter: 'read -r name\necho "Hello, ${name:-student}!"\n' }),
  L({
    id: "sql",
    label: "SQL (SQLite)",
    short: "SQL",
    runner: "sql",
    hljs: "sql",
    file: "main.sql",
    stdin: false,
    starter: "CREATE TABLE parts (id INTEGER PRIMARY KEY, name TEXT, price INTEGER);\nINSERT INTO parts (name, price) VALUES ('Oil filter', 5000), ('Brake pad', 12000);\nSELECT name, price FROM parts ORDER BY price DESC;\n",
  }),
  L({
    id: "html",
    label: "HTML, CSS & JavaScript",
    short: "Web",
    browser: "web",
    hljs: "xml",
    file: "index.html",
    prettier: "html",
    stdin: false,
    starter: '<h1>Hello, student!</h1>\n<button id="btn">Click me</button>\n\n<script>\n    document.getElementById("btn").addEventListener("click", () => {\n        console.log("Clicked!");\n    });\n</script>\n',
  }),
  L({
    id: "css",
    label: "CSS",
    short: "CSS",
    browser: "web",
    hljs: "css",
    file: "style.css",
    prettier: "css",
    stdin: false,
    starter: "h1 {\n    color: #3b6cff;\n}\n\n.card {\n    padding: 16px;\n    border-radius: 12px;\n    box-shadow: 0 8px 24px -12px rgba(0, 0, 0, 0.3);\n}\n",
  }),
  L({
    id: "react",
    label: "React (JSX)",
    short: "React",
    browser: "react",
    hljs: "javascript",
    file: "App.jsx",
    prettier: "babel",
    stdin: false,
    starter:
      'function App() {\n    const [count, setCount] = React.useState(0);\n    return (\n        <div>\n            <h1>Clicked {count} times</h1>\n            <button onClick={() => setCount(count + 1)}>Click me</button>\n        </div>\n    );\n}\n',
  }),
];

const BY_ID = new Map(LANGUAGES.map((l) => [l.id, l]));

export const languageById = (id: string | null | undefined): PlaygroundLanguage | null => (id ? BY_ID.get(id) ?? null : null);

/** Lesson code-window / editor language names → playground language. */
const ALIAS: Record<string, string> = {
  js: "javascript",
  javascript: "javascript",
  mjs: "javascript",
  jsx: "react",
  react: "react",
  tsx: "typescript",
  ts: "typescript",
  typescript: "typescript",
  node: "node",
  nodejs: "node",
  py: "python",
  python: "python",
  python3: "python",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  "c++": "cpp",
  cc: "cpp",
  cs: "csharp",
  csharp: "csharp",
  "c#": "csharp",
  php: "php",
  go: "go",
  golang: "go",
  rust: "rust",
  rs: "rust",
  kotlin: "kotlin",
  kt: "kotlin",
  ruby: "ruby",
  rb: "ruby",
  swift: "swift",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  sql: "sql",
  mysql: "sql",
  sqlite: "sql",
  html: "html",
  xml: "html",
  css: "css",
  scss: "css",
};

/** Code that needs Node (files, modules, stdin, process) rather than a browser tab. */
const NODE_ONLY = /\brequire\s*\(|\bprocess\.(argv|stdin|stdout|env|exit)|\bimport\s+[\w{}*\s,]+\s+from\s+["'](fs|path|os|readline|http|node:)|\bmodule\.exports\b|\b__dirname\b/;
/** JSX: a tag inside JavaScript (return <div>…, = <App />). */
const JSX = /(return|=>|=)\s*\(?\s*<([A-Z][\w.]*|div|span|h[1-6]|p|ul|li|button|section|main|form|input|>)/;

/**
 * The playground language for code shown in a lesson. `declared` is the language a
 * teacher/AI or highlight.js named (class="language-x" or detection); the code itself
 * refines JavaScript: Node-only APIs → Node.js, JSX → React.
 */
export function resolveLanguage(declared: string | null | undefined, code = ""): PlaygroundLanguage | null {
  const key = (declared || "").trim().toLowerCase();
  const id = ALIAS[key];
  if (!id) return null;
  if (id === "javascript" || id === "react") {
    if (JSX.test(code)) return BY_ID.get("react")!;
    if (NODE_ONLY.test(code)) return BY_ID.get("node")!;
    return BY_ID.get("javascript")!;
  }
  if (id === "html" && /^\s*[^<\s]/.test(code)) return null; // xml-ish config, not a page
  return BY_ID.get(id) ?? null;
}

/** Whether this language runs here now: browser ones always; server ones when the runner has them. */
export function isRunnable(lang: PlaygroundLanguage, runnerKeys: Set<string> | null): boolean {
  if (lang.browser) return true;
  // Before the list loads (null) assume yes: the run itself explains a refusal.
  return !!lang.runner && (runnerKeys === null || runnerKeys.has(lang.runner));
}
