/**
 * Code in lessons, shown like an editor window instead of a grey box of text.
 *
 * Lesson HTML (teacher notes, AI-generated weeks, tutor answers) is injected with
 * dangerouslySetInnerHTML, so this works on the rendered DOM — the same way
 * hydrateInlineChecks brings inline quizzes to life — and every place that shows lesson
 * content calls it after rendering. Each <pre> becomes:
 *
 *   title bar   ● ● ●  JavaScript · 12 lines            [Explain] [Wrap] [Copy]
 *   body        numbered lines, syntax-coloured, scrolls sideways on its own
 *   footer      "Show all 40 lines" when a long block starts folded
 *
 * Line numbers are drawn from data attributes (CSS ::before), so they are never copied,
 * found by find-in-note, or read out as text. Highlighting loads on demand; until it
 * arrives (or if it fails) the code shows plain, already laid out in lines.
 */

export interface CodeWindowOptions {
  /** Adds an "Explain" button (the reader's Study Assistant). */
  onExplain?: (code: string, language: string) => void;
  /** Blocks longer than this start folded. 0 disables folding. */
  foldAfter?: number;
}

const ENHANCED = "data-code-window";
const DEFAULT_FOLD = 18;

const LABELS: Record<string, string> = {
  javascript: "JavaScript",
  js: "JavaScript",
  jsx: "JavaScript",
  typescript: "TypeScript",
  ts: "TypeScript",
  tsx: "TypeScript",
  python: "Python",
  py: "Python",
  xml: "HTML",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  sql: "SQL",
  java: "Java",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  cs: "C#",
  php: "PHP",
  bash: "Terminal",
  sh: "Terminal",
  shell: "Terminal",
  json: "JSON",
  go: "Go",
  kotlin: "Kotlin",
  plaintext: "Text",
  text: "Text",
};
const ALIASES: Record<string, string> = { js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", py: "python", html: "xml", sh: "bash", shell: "bash", cs: "csharp", text: "plaintext" };

const ICON = {
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  wrap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h15a3 3 0 1 1 0 6h-4"/><path d="m16 16-2 2 2 2"/><path d="M3 18h7"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const languageLabel = (lang: string) => LABELS[lang] || (lang ? lang[0].toUpperCase() + lang.slice(1) : "Code");

/** The language a teacher or the editor declared: class="language-js" / "lang-js". */
const declaredLanguage = (pre: HTMLElement): string | null => {
  const cls = `${pre.className} ${pre.querySelector("code")?.className ?? ""}`;
  const m = cls.match(/(?:^|\s)(?:language|lang)-([\w#+-]+)/i);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  return ALIASES[raw] || raw;
};

/**
 * Split highlighted HTML into one string per line, closing the spans that are open at
 * each line break and reopening them on the next line — a multi-line comment or string
 * stays coloured on every line it covers.
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let line = "";
  const re = /<span[^>]*>|<\/span>|[^<]+|</g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const tok = m[0];
    if (tok.startsWith("<span")) {
      open.push(tok);
      line += tok;
    } else if (tok === "</span>") {
      open.pop();
      line += tok;
    } else {
      const parts = tok.split("\n");
      parts.forEach((part, i) => {
        if (i > 0) {
          lines.push(line + "</span>".repeat(open.length));
          line = open.join("");
        }
        line += part;
      });
    }
  }
  lines.push(line + "</span>".repeat(open.length));
  return lines;
}

const renderLines = (lines: string[]) =>
  lines
    .map((l, i) => `<span class="cw-line" data-line="${i + 1}"><span class="cw-ln" data-n="${i + 1}" aria-hidden="true"></span><span class="cw-code">${l}</span></span>`)
    .join("");

const button = (cls: string, label: string, icon: string, text: string, extra = "") =>
  `<button type="button" class="cw-btn ${cls}" aria-label="${label}" title="${label}" ${extra}>${icon}<span class="cw-btn__text">${text}</span></button>`;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and non-secure contexts: the textarea fallback still works there.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

let highlighter: Promise<typeof import("./highlight")> | null = null;
const loadHighlighter = () => (highlighter ??= import("./highlight"));

/** Turn every <pre> under root into a code window. Safe to call again on the same root. */
export function enhanceCodeBlocks(root: HTMLElement | null, options: CodeWindowOptions = {}): void {
  if (!root) return;
  const pres = Array.from(root.querySelectorAll("pre")).filter((p) => !p.closest(`[${ENHANCED}]`));
  if (!pres.length) return;
  const foldAfter = options.foldAfter ?? DEFAULT_FOLD;

  for (const pre of pres) {
    const code = (pre.querySelector("code") ?? pre).textContent?.replace(/\n$/, "") ?? "";
    if (!code.trim()) continue;
    const declared = declaredLanguage(pre);
    const lines = code.split("\n");
    const count = lines.length;
    const folds = foldAfter > 0 && count > foldAfter + 4;

    const win = document.createElement("figure");
    win.className = `code-window${folds ? " is-folded" : ""}`;
    win.setAttribute(ENHANCED, "");
    win.style.setProperty("--cw-digits", String(String(count).length));
    win.style.setProperty("--cw-fold-lines", String(foldAfter));
    const label = declared ? languageLabel(declared) : "Code";
    win.innerHTML =
      `<div class="code-window__bar" data-code-chrome>` +
      `<span class="code-window__dots" aria-hidden="true"><i></i><i></i><i></i></span>` +
      `<span class="code-window__title"><span class="code-window__lang">${escapeHtml(label)}</span><span class="code-window__meta">${count} line${count === 1 ? "" : "s"}</span></span>` +
      `<span class="code-window__actions">` +
      (options.onExplain ? button("cw-explain", "Explain this code", ICON.spark, "Explain") : "") +
      button("cw-wrap", "Wrap long lines", ICON.wrap, "Wrap", 'aria-pressed="false"') +
      button("cw-copy", "Copy code", ICON.copy, "Copy") +
      `</span></div>` +
      `<pre class="code-window__body" tabindex="0"><code class="hljs">${renderLines(lines.map(escapeHtml))}</code></pre>` +
      (folds
        ? `<button type="button" class="code-window__more" data-code-chrome aria-expanded="false">${ICON.chevron}<span>Show all ${count} lines</span></button>`
        : "") +
      `<span class="cw-sr" role="status" aria-live="polite"></span>`;
    pre.replaceWith(win);

    const body = win.querySelector<HTMLElement>(".code-window__body")!;
    const codeEl = body.querySelector("code")!;
    const status = win.querySelector<HTMLElement>(".cw-sr")!;
    const setLabel = (lang: string) => {
      body.setAttribute("aria-label", `${languageLabel(lang)} code, ${count} line${count === 1 ? "" : "s"}`);
      win.dataset.lang = lang || "plaintext";
    };
    setLabel(declared || "");

    win.querySelector<HTMLButtonElement>(".cw-copy")!.addEventListener("click", async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      const ok = await copyText(code);
      btn.classList.toggle("is-done", ok);
      btn.innerHTML = `${ok ? ICON.check : ICON.copy}<span class="cw-btn__text">${ok ? "Copied" : "Copy failed"}</span>`;
      status.textContent = ok ? "Code copied" : "Couldn't copy — select the code instead";
      window.setTimeout(() => {
        btn.classList.remove("is-done");
        btn.innerHTML = `${ICON.copy}<span class="cw-btn__text">Copy</span>`;
      }, 1800);
    });
    win.querySelector<HTMLButtonElement>(".cw-wrap")!.addEventListener("click", (e) => {
      const on = win.classList.toggle("is-wrapped");
      (e.currentTarget as HTMLButtonElement).setAttribute("aria-pressed", String(on));
    });
    win.querySelector<HTMLButtonElement>(".cw-explain")?.addEventListener("click", () =>
      options.onExplain?.(code, languageLabel(win.dataset.lang === "plaintext" ? "" : win.dataset.lang || "")),
    );
    win.querySelector<HTMLButtonElement>(".code-window__more")?.addEventListener("click", (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      const folded = win.classList.toggle("is-folded");
      btn.setAttribute("aria-expanded", String(!folded));
      btn.querySelector("span")!.textContent = folded ? `Show all ${count} lines` : "Show less";
      if (folded) win.scrollIntoView({ block: "nearest" });
    });
    // Point at a line while discussing it: click its number to mark it.
    codeEl.addEventListener("click", (e) => {
      const ln = (e.target as HTMLElement).closest(".cw-ln");
      ln?.parentElement?.classList.toggle("is-marked");
    });

    loadHighlighter()
      .then(({ highlightCode }) => {
        if (!win.isConnected) return;
        const out = highlightCode(code, declared);
        codeEl.innerHTML = renderLines(splitHighlightedLines(out.html));
        if (!declared) {
          win.querySelector(".code-window__lang")!.textContent = out.language ? languageLabel(out.language) : "Code";
        }
        setLabel(declared || out.language);
      })
      .catch(() => {
        /* plain lines are already on screen — highlighting is a nicety */
      });
  }
}
