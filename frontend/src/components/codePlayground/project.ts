import type { PlaygroundLanguage } from "./languages";

/**
 * A playground program as files: one main file (what runs) and the files it uses, linked the
 * way its language links them — imports and modules (Python, JS/TS, Rust, Go, Kotlin, Swift),
 * includes and headers (C, C++, PHP), classes in their own files (Java, C#), `source` (Bash),
 * and for web pages `<link>`/`<script src>`, links between pages and forms posting to PHP.
 */
export interface PlayFile {
  path: string;
  content: string;
}

export interface PlayProject {
  files: PlayFile[];
  /** The main file: what runs (server languages, browser JS, React) or the first page shown (web). */
  entry: string;
}

export const MAX_FILES = 20;
export const MAX_PROJECT_CHARS = 200_000;

export const extOf = (path: string) => (path.match(/\.([^./]+)$/)?.[1] ?? "").toLowerCase();
export const baseName = (path: string) => path.split("/").pop() ?? path;

/** Why a file name can't be used (null when it can): no folders above the project, no odd characters. */
export function pathProblem(path: string, files: PlayFile[], current?: string): string | null {
  const p = path.trim();
  if (!p) return "Give the file a name.";
  if (p.length > 120) return "That name is too long.";
  if (p.startsWith("/") || p.split("/").some((s) => !s || s === "." || s === "..")) return "Use a name like utils.py or lib/maths.php.";
  if (!/^[\w.-]+(\/[\w.-]+){0,3}$/.test(p)) return "Use letters, numbers, dots, dashes and underscores (and / for a folder).";
  if (!extOf(p)) return "Add an extension, like .py, .js or .html.";
  if (p.startsWith("_nga_")) return "Names starting with _nga_ are reserved.";
  if (files.some((f) => f.path === p && f.path !== current)) return "There is already a file with that name.";
  return null;
}

/** CodeEditor language for a file, from its extension (falls back to the project's language). */
export function editorLanguageFor(path: string, fallback: string): string {
  const map: Record<string, string> = {
    html: "html",
    htm: "html",
    css: "css",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "javascript",
    jsx: "react",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    java: "java",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    go: "go",
    rs: "rust",
    kt: "kotlin",
    rb: "ruby",
    swift: "swift",
    sh: "bash",
    sql: "sql",
    md: "",
    txt: "",
    csv: "",
  };
  const ext = extOf(path);
  return ext in map ? map[ext] : fallback;
}

export const singleFile = (lang: PlaygroundLanguage, code: string): PlayProject => ({ files: [{ path: lang.file, content: code }], entry: lang.file });

/** The project's size check (the runner takes up to 1 MB; lessons stay far below). */
export function projectProblem(p: PlayProject): string | null {
  if (p.files.length > MAX_FILES) return `At most ${MAX_FILES} files.`;
  if (p.files.reduce((n, f) => n + f.content.length, 0) > MAX_PROJECT_CHARS) return "The files are too large to run here.";
  if (!p.files.some((f) => f.path === p.entry)) return "Pick the main file.";
  return null;
}

/** A name for the next new file, in the language's style. */
export function suggestName(lang: PlaygroundLanguage, files: PlayFile[]): string {
  const base: Record<string, string> = {
    python: "helpers.py",
    node: "utils.js",
    javascript: "utils.js",
    typescript: "utils.ts",
    react: "Button.jsx",
    java: "Calculator.java",
    c: "maths.h",
    cpp: "calc.hpp",
    csharp: "Calculator.cs",
    php: "functions.php",
    go: "util.go",
    rust: "util.rs",
    kotlin: "Util.kt",
    ruby: "helper.rb",
    swift: "util.swift",
    bash: "lib.sh",
    sql: "seed.sql",
    html: "about.html",
    css: "about.html",
  };
  const name = base[lang.id] ?? `file.${extOf(lang.file) || "txt"}`;
  if (!files.some((f) => f.path === name)) return name;
  const dot = name.lastIndexOf(".");
  for (let i = 2; i < 100; i++) {
    const n = `${name.slice(0, dot)}${i}${name.slice(dot)}`;
    if (!files.some((f) => f.path === n)) return n;
  }
  return `file${Date.now()}.${extOf(name)}`;
}

/** A starting text for a new file, shaped by its extension (a class named after a Java file…). */
export function newFileContent(path: string): string {
  const stem = baseName(path).replace(/\.[^.]+$/, "");
  const Cls = stem.replace(/(^|[-_.])(\w)/g, (_m, _s, c: string) => c.toUpperCase()).replace(/[^\w]/g, "") || "Helper";
  const guard = `${stem.replace(/\W/g, "_").toUpperCase()}_H`;
  switch (extOf(path)) {
    case "py":
      return "def helper():\n    return 42\n";
    case "js":
    case "mjs":
      return "export function helper() {\n    return 42;\n}\n";
    case "cjs":
      return "module.exports = { helper: () => 42 };\n";
    case "ts":
      return "export function helper(): number {\n    return 42;\n}\n";
    case "jsx":
      return `export default function ${Cls}() {\n    return <p>${Cls}</p>;\n}\n`;
    case "java":
      return `public class ${Cls} {\n    public static int helper() {\n        return 42;\n    }\n}\n`;
    case "h":
      return `#ifndef ${guard}\n#define ${guard}\n\nint helper(void);\n\n#endif\n`;
    case "hpp":
      return "#pragma once\n\nint helper();\n";
    case "c":
      return "int helper(void) {\n    return 42;\n}\n";
    case "cpp":
    case "cc":
      return "int helper() {\n    return 42;\n}\n";
    case "cs":
      return `public static class ${Cls}\n{\n    public static int Helper() => 42;\n}\n`;
    case "php":
      return "<?php\n\nfunction helper(): int {\n    return 42;\n}\n";
    case "go":
      return "package main\n\nfunc helper() int {\n\treturn 42\n}\n";
    case "rs":
      return "pub fn helper() -> i32 {\n    42\n}\n";
    case "kt":
      return "fun helper(): Int = 42\n";
    case "rb":
      return "def helper\n  42\nend\n";
    case "swift":
      return "func helper() -> Int {\n    return 42\n}\n";
    case "sh":
      return "helper() {\n    echo 42\n}\n";
    case "html":
    case "htm":
      return `<!doctype html>\n<html>\n<head>\n    <meta charset="utf-8">\n    <title>${Cls}</title>\n    <link rel="stylesheet" href="style.css">\n</head>\n<body>\n    <h1>${Cls}</h1>\n    <p><a href="index.html">Back home</a></p>\n</body>\n</html>\n`;
    case "css":
      return "body {\n    font-family: system-ui, sans-serif;\n}\n";
    case "json":
      return "{\n    \"name\": \"value\"\n}\n";
    default:
      return "";
  }
}

const f = (path: string, content: string): PlayFile => ({ path, content });

const WEB_EXAMPLE: PlayProject = {
  entry: "index.html",
  files: [
    f(
      "index.html",
      `<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>Garage</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <h1>Kigali Garage</h1>
    <p>Parts in stock: <span id="count">0</span></p>
    <button id="add">Add a part</button>

    <form action="greet.php" method="post">
        <label>Your name <input name="name" value="Aline"></label>
        <button type="submit">Send to greet.php</button>
    </form>

    <p><a href="about.html">About us</a></p>
    <script src="script.js"></script>
</body>
</html>
`,
    ),
    f(
      "style.css",
      `body {
    font-family: system-ui, sans-serif;
    margin: 24px;
}

h1 {
    color: #2444ad;
}

form {
    margin-top: 16px;
    display: flex;
    gap: 8px;
    align-items: center;
}
`,
    ),
    f(
      "script.js",
      `let count = 0;

document.getElementById("add").addEventListener("click", () => {
    count += 1;
    document.getElementById("count").textContent = count;
    console.log("Parts:", count);
});
`,
    ),
    f(
      "about.html",
      `<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>About</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <h1>About us</h1>
    <p>We fix cars in Kigali since 2010.</p>
    <p><a href="index.html">Back home</a></p>
</body>
</html>
`,
    ),
    f(
      "greet.php",
      `<?php
// Runs on the code runner when the form is sent: $_POST holds the fields.
$name = htmlspecialchars($_POST["name"] ?? "visitor");
?>
<!doctype html>
<html>
<head>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <h1>Hello, <?= $name ?>!</h1>
    <p>Method: <?= $_SERVER["REQUEST_METHOD"] ?></p>
    <p><a href="index.html">Back home</a></p>
</body>
</html>
`,
    ),
  ],
};

/** A small program split over files, wired the language's way — for "Multi-file example". */
export function exampleProject(langId: string): PlayProject | null {
  switch (langId) {
    case "html":
    case "css":
      return WEB_EXAMPLE;
    case "javascript":
      return {
        entry: "script.js",
        files: [
          f("script.js", 'import { total } from "./utils.js";\n\nconst prices = [5000, 12000, 3000];\nconsole.log("Total:", total(prices));\n'),
          f("utils.js", "export function total(values) {\n    return values.reduce((sum, v) => sum + v, 0);\n}\n"),
        ],
      };
    case "react":
      return {
        entry: "App.jsx",
        files: [
          f("App.jsx", 'import Counter from "./Counter.jsx";\n\nexport default function App() {\n    return (\n        <div>\n            <h1>Garage stock</h1>\n            <Counter label="Oil filters" start={25} />\n        </div>\n    );\n}\n'),
          f(
            "Counter.jsx",
            'import { useState } from "react";\n\nexport default function Counter({ label, start }) {\n    const [count, setCount] = useState(start);\n    return (\n        <p>\n            {label}: {count} <button onClick={() => setCount(count - 1)}>Sell one</button>\n        </p>\n    );\n}\n',
          ),
        ],
      };
    case "node":
      return {
        entry: "main.js",
        files: [
          f("main.js", 'const { total } = require("./utils");\n\nconsole.log("Total:", total([5000, 12000, 3000]));\n'),
          f("utils.js", "function total(values) {\n    return values.reduce((sum, v) => sum + v, 0);\n}\n\nmodule.exports = { total };\n"),
        ],
      };
    case "typescript":
      return {
        entry: "main.ts",
        files: [
          f("main.ts", 'import { total } from "./utils";\n\nconsole.log("Total:", total([5000, 12000, 3000]));\n'),
          f("utils.ts", "export function total(values: number[]): number {\n    return values.reduce((sum, v) => sum + v, 0);\n}\n"),
        ],
      };
    case "python":
      return {
        entry: "main.py",
        files: [
          f("main.py", 'from helpers import total\n\nprices = [5000, 12000, 3000]\nprint("Total:", total(prices))\n'),
          f("helpers.py", "def total(values):\n    return sum(values)\n"),
        ],
      };
    case "java":
      return {
        entry: "Main.java",
        files: [
          f("Main.java", 'public class Main {\n    public static void main(String[] args) {\n        int[] prices = {5000, 12000, 3000};\n        System.out.println("Total: " + Calculator.total(prices));\n    }\n}\n'),
          f("Calculator.java", "public class Calculator {\n    public static int total(int[] values) {\n        int sum = 0;\n        for (int v : values) {\n            sum += v;\n        }\n        return sum;\n    }\n}\n"),
        ],
      };
    case "c":
      return {
        entry: "main.c",
        files: [
          f("main.c", '#include <stdio.h>\n#include "maths.h"\n\nint main(void) {\n    int prices[] = {5000, 12000, 3000};\n    printf("Total: %d\\n", total(prices, 3));\n    return 0;\n}\n'),
          f("maths.h", "#ifndef MATHS_H\n#define MATHS_H\n\nint total(const int *values, int n);\n\n#endif\n"),
          f("maths.c", '#include "maths.h"\n\nint total(const int *values, int n) {\n    int sum = 0;\n    for (int i = 0; i < n; i++) {\n        sum += values[i];\n    }\n    return sum;\n}\n'),
        ],
      };
    case "cpp":
      return {
        entry: "main.cpp",
        files: [
          f("main.cpp", '#include <iostream>\n#include <vector>\n#include "calc.hpp"\n\nint main() {\n    std::vector<int> prices = {5000, 12000, 3000};\n    std::cout << "Total: " << total(prices) << std::endl;\n}\n'),
          f("calc.hpp", "#pragma once\n#include <vector>\n\nint total(const std::vector<int>& values);\n"),
          f("calc.cpp", '#include "calc.hpp"\n\nint total(const std::vector<int>& values) {\n    int sum = 0;\n    for (int v : values) sum += v;\n    return sum;\n}\n'),
        ],
      };
    case "csharp":
      return {
        entry: "Program.cs",
        files: [
          f("Program.cs", 'int[] prices = { 5000, 12000, 3000 };\nConsole.WriteLine($"Total: {Calculator.Total(prices)}");\n'),
          f("Calculator.cs", "public static class Calculator\n{\n    public static int Total(int[] values) => values.Sum();\n}\n"),
        ],
      };
    case "php":
      return {
        entry: "main.php",
        files: [
          f("main.php", "<?php\nrequire_once __DIR__ . '/lib/maths.php';\n\necho 'Total: ' . total([5000, 12000, 3000]) . \"\\n\";\n"),
          f("lib/maths.php", "<?php\n\nfunction total(array $values): int {\n    return array_sum($values);\n}\n"),
        ],
      };
    case "go":
      return {
        entry: "main.go",
        files: [
          f("main.go", 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Total:", total([]int{5000, 12000, 3000}))\n}\n'),
          f("util.go", "package main\n\nfunc total(values []int) int {\n\tsum := 0\n\tfor _, v := range values {\n\t\tsum += v\n\t}\n\treturn sum\n}\n"),
        ],
      };
    case "rust":
      return {
        entry: "main.rs",
        files: [
          f("main.rs", 'mod util;\n\nfn main() {\n    println!("Total: {}", util::total(&[5000, 12000, 3000]));\n}\n'),
          f("util.rs", "pub fn total(values: &[i32]) -> i32 {\n    values.iter().sum()\n}\n"),
        ],
      };
    case "kotlin":
      return {
        entry: "Main.kt",
        files: [f("Main.kt", 'fun main() {\n    println("Total: ${total(listOf(5000, 12000, 3000))}")\n}\n'), f("Util.kt", "fun total(values: List<Int>): Int = values.sum()\n")],
      };
    case "ruby":
      return {
        entry: "main.rb",
        files: [f("main.rb", "require_relative 'helper'\n\nputs \"Total: #{total([5000, 12000, 3000])}\"\n"), f("helper.rb", "def total(values)\n  values.sum\nend\n")],
      };
    case "swift":
      return {
        entry: "main.swift",
        files: [f("main.swift", 'print("Total: \\(total([5000, 12000, 3000]))")\n'), f("util.swift", "func total(_ values: [Int]) -> Int {\n    return values.reduce(0, +)\n}\n")],
      };
    case "bash":
      return {
        entry: "main.sh",
        files: [f("main.sh", 'source "$(dirname "$0")/lib.sh"\n\necho "Total: $(total 5000 12000 3000)"\n'), f("lib.sh", "total() {\n    local sum=0\n    for v in \"$@\"; do sum=$((sum + v)); done\n    echo \"$sum\"\n}\n")],
      };
    default:
      return null;
  }
}

/** Whether the project is a web site: pages, plus PHP pages/actions when a PHP file is there. */
export const isWebLanguage = (lang: PlaygroundLanguage) => lang.browser === "web";
export const htmlFiles = (files: PlayFile[]) => files.filter((x) => /\.html?$/i.test(x.path));
export const phpFiles = (files: PlayFile[]) => files.filter((x) => /\.php$/i.test(x.path));

/** The first page of a web project: the main file when it is a page, else index.html, else any page. */
export function startPage(p: PlayProject): string | null {
  if (/\.(html?|php)$/i.test(p.entry)) return p.entry;
  return htmlFiles(p.files).find((x) => /(^|\/)index\.html?$/i.test(x.path))?.path ?? htmlFiles(p.files)[0]?.path ?? null;
}

