/**
 * Making lesson code look like real code.
 *
 * AI-written (and pasted) lessons sometimes arrive with a whole program squashed onto
 * one line — "// Array of car parts in inventoryconst parts = [ { id: 1, … }]; …" —
 * because the line breaks were lost on the way. Two passes repair that:
 *
 *  - tidyCode (sync, tiny): splits a comment from the code glued onto it, and when
 *    the code is squashed, re-lays it out one statement per line with indented
 *    blocks (formatBraces). Used by every lesson code window as it renders.
 *  - prettifyCode (async): Prettier for JavaScript/TypeScript/JSX/CSS/HTML/JSON
 *    (loaded on demand), the brace formatter for the other curly-brace languages.
 *    Used by the playground's Format button and to polish a squashed JS block.
 */

const INDENT = "    ";

/** Languages laid out by braces and semicolons. */
const BRACE_LANGS = new Set(["javascript", "typescript", "node", "react", "java", "c", "cpp", "arduino", "csharp", "php", "go", "rust", "kotlin", "swift", "css", "scss", "sql", "dart", "scala"]);

/** Code that starts right after a comment it was glued to ("inventoryconst parts = …"). */
const GLUED_CODE =
  /(?<=[a-z0-9.)\]])(?=(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|function\s+[A-Za-z_$][\w$]*\s*\(|class\s+[A-Z]\w*|return\b|if\s*\(|for\s*\(|while\s*\(|switch\s*\(|(?:public|private|protected)\s+\w|static\s+\w+\s|(?:int|void|double|float|char|bool|boolean|long|String|auto)\s+[A-Za-z_]\w*\s*[=(;[]|System\.out|console\.\w+\(|std::|printf\s*\(|cout\s*<<|print\(|echo\s|\$[A-Za-z_]\w*\s*=|def\s+\w+\s*\(|import\s+[\w{*]|#include\b)/;

/** Index of a `//` that starts a comment (not inside a string, not part of "://"). */
function lineCommentStart(line: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "/" && line[i + 1] === "/" && line[i - 1] !== ":") return i;
  }
  return -1;
}

/** "// note about partsconst x = 1;" → "// note about parts\nconst x = 1;" (repeatedly). */
export function splitGluedComments(code: string): string {
  const out: string[] = [];
  for (const raw of code.split("\n")) {
    let line = raw;
    for (let guard = 0; guard < 50; guard++) {
      const at = lineCommentStart(line);
      if (at < 0) break;
      const comment = line.slice(at + 2);
      const m = GLUED_CODE.exec(comment);
      if (!m) break;
      const indent = line.match(/^\s*/)![0];
      out.push(line.slice(0, at + 2 + m.index).trimEnd());
      line = indent + comment.slice(m.index);
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Statements ending in `;` outside strings and brackets, per line — a squashed line has several. */
function statementsOnLine(line: string): number {
  let n = 0;
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === "/" && line[i + 1] === "/") break;
    else if (c === ";" && depth === 0 && line.slice(i + 1).trim()) n++;
  }
  return n;
}

/** Whether code lost its line breaks: a long line holding several statements or a whole block. */
export function looksSquashed(code: string): boolean {
  return splitGluedComments(code).split("\n").some((line) => {
    if (line.length < 70) return false;
    const statements = statementsOnLine(line);
    return statements >= 2 || (statements >= 1 && /\{[^}]*;[^}]*\}/.test(line));
  });
}

/** The index just past the `}` matching the `{` at `open`, or -1. */
function matchingBrace(src: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

/**
 * Lay out curly-brace code: one statement per line, `{` ends a line and indents what
 * follows, `}` closes on its own line (keeping `} else {`, `});`, `},`). Short object
 * literals (no `;` inside) stay inline. Strings and comments are copied untouched.
 */
export function formatBraces(src: string, lang = ""): string {
  const out: string[] = [];
  let line = "";
  let depth = 0;
  let paren = 0;
  /** Paren depth outside each open block: `parts.map(p => { …; … })` breaks inside the block. */
  const parenStack: number[] = [];
  /** Each open block's first line, to tell a function/class body from an if/for body. */
  const headers: string[] = [];
  const cssLike = lang === "css" || lang === "scss";
  /** Paren depth where the current line started: inside an open `(` a line is a continuation. */
  let lineParen = 0;
  const push = (blankAfter = false) => {
    const t = line.trim();
    if (t) out.push(INDENT.repeat(Math.max(0, depth) + (lineParen > 0 && !/^[)\]}]/.test(t) ? 1 : 0)) + t);
    if (blankAfter && out.length && out[out.length - 1] !== "") out.push("");
    line = "";
    lineParen = paren;
  };
  const skipSpaces = (i: number) => {
    while (i < src.length && (src[i] === " " || src[i] === "\t")) i++;
    return i;
  };
  /** What comes next, ignoring spaces and line breaks. */
  const next = (i: number) => src.slice(i).replace(/^\s+/, "");

  let i = 0;
  while (i < src.length) {
    const c = src[i];
    // Strings and character literals.
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        if (src[j] === "\n" && c !== "`") break;
        j++;
      }
      line += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    // Comments.
    if (c === "/" && src[i + 1] === "/" && src[i - 1] !== ":") {
      const end = src.indexOf("\n", i);
      line += (line && !line.endsWith(" ") ? " " : "") + src.slice(i, end < 0 ? src.length : end);
      push();
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      line += src.slice(i, end < 0 ? src.length : end + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    // Preprocessor lines (#include <stdio.h>) and the PHP opening tag stand alone.
    if (!line.trim() && (/^#\s*[a-z]+/.test(src.slice(i, i + 12)) || src.startsWith("<?php", i))) {
      const m = src.slice(i).match(/^<\?php|^#\s*include\s*[<"][^>"\n]*[>"]|^#[^\n]*/)!;
      line = m[0];
      i += m[0].length;
      const rest = next(i);
      push(!rest.startsWith("#") && !rest.startsWith("\n") && rest.length > 0);
      continue;
    }
    if (c === "\n") {
      push();
      i++;
      continue;
    }
    if (c === "(" || c === "[") paren++;
    if (c === ")" || c === "]") paren = Math.max(0, paren - 1);

    if (c === "{") {
      const close = matchingBrace(src, i);
      const inner = close > 0 ? src.slice(i + 1, close - 1) : "";
      // `{ id: 1, name: "x" }`, `({ ...part, total: x })` and `{}` stay on the line.
      if (!cssLike && close > 0 && !/[;\n{]/.test(inner) && inner.length <= 80 && (paren > 0 || /[=:,(?]\s*$/.test(line) || !inner.trim())) {
        const flat = collapseSpaces(inner.trim());
        line += `{${flat ? ` ${flat} ` : ""}}`;
        i = close;
        continue;
      }
      line = `${line.trimEnd()} {`;
      headers.push(line.trim());
      parenStack.push(paren);
      paren = 0;
      push();
      depth++;
      i = skipSpaces(i + 1);
      continue;
    }
    if (c === "}") {
      push();
      depth = Math.max(0, depth - 1);
      paren = parenStack.pop() ?? 0;
      lineParen = 0;
      const header = headers.pop() ?? "";
      line = "}";
      i = skipSpaces(i + 1);
      const rest = next(i);
      if (/^(else|catch|finally|while)\b/.test(rest)) {
        line += " ";
        i = src.length - rest.length;
      } else if (!/^[;,)\]]/.test(rest)) {
        // A blank line after a function, method or class.
        const member = !CONTROL_HEADER.test(header) && (depth === 0 || MEMBER_HEADER.test(header));
        push(member && rest.length > 0 && !rest.startsWith("}"));
      }
      continue;
    }
    if (c === ";" && paren === 0) {
      line += ";";
      // `x = 1; // why` keeps its comment; `x = 1;// Next step` was glued on.
      const after = skipSpaces(i + 1);
      if (src.startsWith("//", after) && after > i + 1) {
        i = after;
        continue;
      }
      const rest = next(after);
      const isImport = /^\s*(import|using|package|require|include)\b/.test(line.trim());
      push(isImport && rest.length > 0 && !/^(import|using|package)\b/.test(rest));
      i = after;
      continue;
    }
    if ((c === " " || c === "\t") && (line.endsWith(" ") || !line.trim())) {
      i++;
      continue;
    }
    line += c;
    i++;
  }
  push();
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

const CONTROL_HEADER = /^(\}\s*)?(if|else|for|foreach|while|switch|try|catch|do|finally|case|default)\b/;
const MEMBER_HEADER = /^(public|private|protected|static|internal|override|abstract|final|func|fun|function|def|void|async|class|interface|enum|struct|impl|fn)\b|^[\w<>[\],.?\s]+\s+[A-Za-z_]\w*\s*\([^)]*\)\s*(throws\s+[\w,\s]+)?\s*\{$/;

/** Runs of spaces become one, outside strings. */
function collapseSpaces(s: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      out += c;
      if (c === "\\") out += s[++i] ?? "";
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    if (/\s/.test(c) && /\s$/.test(out)) continue;
    out += /\s/.test(c) ? " " : c;
  }
  return out;
}

/** Quick, synchronous repair for code as it renders: lines back, blocks indented. */
export function tidyCode(code: string, lang?: string | null): string {
  let out = code.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  if (out.includes("//")) out = splitGluedComments(out);
  if (lang && BRACE_LANGS.has(lang) && looksSquashed(out)) out = formatBraces(out, lang);
  return out;
}

type PrettierParser = "babel" | "typescript" | "css" | "html" | "json";

let prettierLoad: Promise<{ format: (code: string, parser: PrettierParser) => Promise<string> }> | null = null;
const loadPrettier = () =>
  (prettierLoad ??= Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
    import("prettier/plugins/typescript"),
    import("prettier/plugins/postcss"),
    import("prettier/plugins/html"),
  ]).then(([prettier, ...plugins]) => ({
    format: (code: string, parser: PrettierParser) =>
      prettier.format(code, { parser, plugins: plugins as any[], tabWidth: 4, printWidth: 90, singleQuote: false, htmlWhitespaceSensitivity: "ignore" }),
  })));

/**
 * The best layout we can give: Prettier where it knows the language, else the brace
 * formatter. Never throws — code Prettier can't parse (a fragment, a mistake the
 * student is fixing) comes back tidied instead.
 */
export async function prettifyCode(code: string, lang: string, parser?: PrettierParser | null): Promise<string> {
  const tidied = tidyCode(code, lang);
  if (parser) {
    try {
      const { format } = await loadPrettier();
      const source = parser === "html" || parser === "css" || parser === "json" ? tidied : splitGluedComments(tidied);
      return (await format(source, parser)).replace(/\n+$/, "\n");
    } catch {
      /* fall through */
    }
  }
  return BRACE_LANGS.has(lang) ? formatBraces(tidied, lang) + "\n" : tidied;
}
