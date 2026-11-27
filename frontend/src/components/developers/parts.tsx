import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { highlightCode } from "../codeWindow/highlight";
import { useToast } from "../../contexts/ToastContext";
import type { Lang, Method, Sample } from "./types";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ */
/* Reader's values: fill the samples with their own host and client.   */
/* ------------------------------------------------------------------ */

export interface DevValues {
  env: "production" | "local";
  clientId: string;
  redirectUri: string;
  tenant: string;
}

export const ENVIRONMENTS: Record<DevValues["env"], { label: string; base: string; login: string }> = {
  production: { label: "Production", base: "https://api.amashuri.com", login: "https://mis.amashuri.com/login" },
  local: { label: "Local", base: "http://localhost:3000", login: "http://localhost:5173/login" },
};

export const DEFAULT_VALUES: DevValues = { env: "production", clientId: "", redirectUri: "", tenant: "" };

/** Languages the reader chooses once for the whole page. */
export const SERVER_LANGS: Lang[] = ["curl", "node", "python", "php"];

interface Prefs {
  values: DevValues;
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const PrefsContext = createContext<Prefs>({ values: DEFAULT_VALUES, lang: "curl", setLang: () => undefined });

/** Replace {{PLACEHOLDERS}} with the reader's values (or a readable stand-in). */
export function fillSample(code: string, v: DevValues): string {
  const e = ENVIRONMENTS[v.env];
  const map: Record<string, string> = {
    BASE: e.base,
    LOGIN: e.login,
    CLIENT_ID: v.clientId.trim() || "your_client_id",
    REDIRECT_URI: v.redirectUri.trim() || "https://your-app.example/sso/callback",
    TENANT: v.tenant.trim() || "1",
  };
  return code.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => map[k] ?? m);
}

/* ------------------------------------------------------------------ */
/* Inline text: `code`, **bold** and [links](#anchor).                 */
/* ------------------------------------------------------------------ */

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

export const Inline: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(INLINE).map((part, i) => {
      if (!part) return null;
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-800 dark:bg-gray-800/70 dark:text-gray-200">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-gray-900 dark:text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
      if (link) {
        return (
          <a key={i} href={link[2]} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            <Inline text={link[1]} />
          </a>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    })}
  </>
);

/* ------------------------------------------------------------------ */
/* Method badge                                                        */
/* ------------------------------------------------------------------ */

const METHOD_TONE: Record<Method, string> = {
  GET: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  POST: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  PUT: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  DELETE: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

export const MethodBadge: React.FC<{ method: Method; small?: boolean }> = ({ method, small }) => (
  <span
    className={cx(
      "inline-flex shrink-0 items-center justify-center rounded-md font-mono font-semibold tracking-wide",
      small ? "min-w-[2.6rem] px-1 py-px text-[10px]" : "min-w-[3.4rem] px-2 py-1 text-xs",
      METHOD_TONE[method],
    )}
  >
    {small && method === "DELETE" ? "DEL" : method}
  </span>
);

/* ------------------------------------------------------------------ */
/* Code samples                                                        */
/* ------------------------------------------------------------------ */

const LANG_LABEL: Record<Lang, string> = {
  curl: "cURL",
  node: "Node.js",
  python: "Python",
  php: "PHP",
  browser: "JavaScript",
  json: "JSON",
  http: "HTTP",
  env: ".env",
  text: "Text",
};

/** highlight.js language for each sample language (codeWindow/highlight.ts registers these). */
const HLJS: Record<Lang, string> = {
  curl: "bash",
  node: "javascript",
  python: "python",
  php: "php",
  browser: "javascript",
  json: "json",
  http: "bash",
  env: "bash",
  text: "plaintext",
};

/** Syntax colours for the samples. The panel is dark in both themes. */
export const CODE_STYLES = `
.devdocs-code { color: #e5e7eb; }
.devdocs-code .hljs-keyword, .devdocs-code .hljs-literal, .devdocs-code .hljs-type, .devdocs-code .hljs-meta { color: #60a5fa; }
.devdocs-code .hljs-string, .devdocs-code .hljs-regexp { color: #6ee7b7; }
.devdocs-code .hljs-number, .devdocs-code .hljs-symbol { color: #fcd34d; }
.devdocs-code .hljs-comment, .devdocs-code .hljs-quote { color: #9ca3af; font-style: italic; }
.devdocs-code .hljs-title, .devdocs-code .hljs-title.function_, .devdocs-code .hljs-section { color: #93c5fd; }
.devdocs-code .hljs-attr, .devdocs-code .hljs-attribute, .devdocs-code .hljs-property { color: #bfdbfe; }
.devdocs-code .hljs-variable, .devdocs-code .hljs-params, .devdocs-code .hljs-subst { color: #e5e7eb; }
.devdocs-code .hljs-built_in { color: #fdba74; }
.devdocs-code ::selection { background: rgba(96, 165, 250, 0.35); }
`;

export const CodeTabs: React.FC<{ samples: Sample[]; title?: string; className?: string }> = ({ samples, title, className }) => {
  const { values, lang, setLang } = useContext(PrefsContext);
  const { showToast } = useToast();
  const [picked, setPicked] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // A language chosen anywhere applies everywhere it exists.
  useEffect(() => setPicked(null), [lang]);

  const preferred = samples.findIndex((s) => s.lang === lang);
  const active = picked ?? (preferred >= 0 ? preferred : 0);
  const sample = samples[active] ?? samples[0];
  const code = useMemo(() => fillSample(sample.code, values), [sample, values]);
  const html = useMemo(() => highlightCode(code, HLJS[sample.lang]).html, [code, sample.lang]);

  const choose = (i: number) => {
    const l = samples[i].lang;
    if (SERVER_LANGS.includes(l) && l !== lang) setLang(l);
    setPicked(i);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      showToast("Copied", "success");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      showToast("Could not copy. Select the text and copy it.", "error");
    }
  };

  return (
    <figure className={cx("overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 dark:border-gray-700/40", className)}>
      <figcaption className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role={samples.length > 1 ? "tablist" : undefined} aria-label={title}>
          {samples.length > 1 ? (
            samples.map((s, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === active}
                onClick={() => choose(i)}
                className={cx(
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  i === active ? "bg-white/15 text-white" : "text-gray-400 hover:text-gray-200",
                )}
              >
                {s.label ?? LANG_LABEL[s.lang]}
              </button>
            ))
          ) : (
            <span className="truncate px-1 text-xs font-medium text-gray-400">{title ?? sample.label ?? LANG_LABEL[sample.lang]}</span>
          )}
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="devdocs-code max-h-[32rem] overflow-auto p-4 text-[13px] leading-relaxed" tabIndex={0}>
        <code className="font-mono" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </figure>
  );
};
