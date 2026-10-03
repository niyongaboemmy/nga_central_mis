/**
 * Syntax highlighting for code in lessons. Loaded on demand by codeWindow.ts (a dynamic
 * import), so pages without code never download it. Only the languages taught at the
 * school are registered — the full highlight.js bundle is ~10x the size.
 */
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";

const LANGUAGES = { bash, c, cpp, csharp, css, go, java, javascript, json, kotlin, php, plaintext, python, scss, sql, typescript, xml };
for (const [name, def] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, def);

/** Guessing among every language makes short snippets come out as something exotic;
 *  these are the ones lessons are actually written in. */
const AUTO_SUBSET = ["javascript", "typescript", "python", "xml", "css", "sql", "java", "c", "cpp", "csharp", "php", "bash", "json"];

export interface Highlighted {
  html: string;
  /** highlight.js language id, or "" when it couldn't tell (shown as plain text). */
  language: string;
}

export function highlightCode(code: string, declared?: string | null): Highlighted {
  const lang = declared ? hljs.getLanguage(declared) && declared : null;
  if (lang) return { html: hljs.highlight(code, { language: lang, ignoreIllegals: true }).value, language: lang };
  const auto = hljs.highlightAuto(code, AUTO_SUBSET);
  // Low relevance means a guess on prose-like text — colouring it would mislead.
  if (!auto.language || auto.relevance < 4) return { html: hljs.highlight(code, { language: "plaintext" }).value, language: "" };
  return { html: auto.value, language: auto.language };
}
