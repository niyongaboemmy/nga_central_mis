import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BellRing, Database, Info, KeyRound, Menu, Search, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import ThemeToggle from "../ui/ThemeToggle";
import { AmashuriLogo } from "../brand/AmashuriLogo";
import { misHref } from "../../utils/registrationSite";
import { ALL_SECTIONS, GROUPS } from "./content";
import { CODE_STYLES, CodeTabs, DEFAULT_VALUES, DevValues, ENVIRONMENTS, Inline, MethodBadge, PrefsContext, SERVER_LANGS, cx } from "./parts";
import type { Block, Endpoint, Lang, Method, Param, Section } from "./types";

/**
 * /developers -- the public guide to integrating with Amashuri: single
 * sign-on, single sign-out, data sync, learning events and reminders.
 *
 * The page is rendered from content.ts. Readers pick a language once (it
 * applies to every sample) and can type their own client ID and callback
 * address, which are filled into the samples and kept in this browser only.
 */

const VALUES_KEY = "amashuri.developers.values";
const LANG_KEY = "amashuri.developers.lang";

const readStored = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...(fallback as object), ...JSON.parse(raw) } as T : fallback;
  } catch {
    return fallback;
  }
};

/* ---------------------------------------------------------------- */
/* Search                                                            */
/* ---------------------------------------------------------------- */

interface Hit {
  id: string;
  title: string;
  /** Section the hit sits in (for an endpoint). */
  where?: string;
  method?: Method;
  haystack: string;
}

const INDEX: Hit[] = ALL_SECTIONS.flatMap((s) => {
  const endpoints = s.blocks.flatMap((b) => (b.kind === "endpoint" ? [b.endpoint] : []));
  return [
    { id: s.id, title: s.title, haystack: `${s.title} ${s.lead ?? ""} ${s.keywords ?? ""}`.toLowerCase() },
    ...endpoints.map((e) => ({
      id: e.id,
      title: e.path,
      where: e.summary,
      method: e.method,
      haystack: `${e.method} ${e.path} ${e.summary}`.toLowerCase(),
    })),
  ];
});

const search = (q: string): Hit[] => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return INDEX.filter((h) => words.every((w) => h.haystack.includes(w))).slice(0, 8);
};

const SearchBox: React.FC = () => {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => search(q), [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (hit: Hit) => {
    setOpen(false);
    setQ("");
    input.current?.blur();
    window.location.hash = hit.id;
  };

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        ref={input}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setCursor(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter" && hits[cursor]) {
            go(hits[cursor]);
          } else if (e.key === "Escape") {
            setOpen(false);
            input.current?.blur();
          }
        }}
        placeholder="Search the guide"
        aria-label="Search the guide"
        role="combobox"
        aria-expanded={open && q.trim().length > 0}
        aria-controls="devdocs-search-results"
        className="h-9 w-full rounded-full border border-gray-200 bg-gray-50 pl-9 pr-12 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700/40 dark:bg-gray-900/60 dark:text-white dark:placeholder-gray-500"
      />
      {!q && (
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-gray-200 px-1.5 text-[10px] font-medium text-gray-400 sm:block dark:border-gray-700/40">
          /
        </kbd>
      )}
      {open && q.trim() && (
        <ul
          id="devdocs-search-results"
          role="listbox"
          className="absolute inset-x-0 top-11 z-50 overflow-hidden rounded-2xl border border-gray-200 bg-white p-1 dark:border-gray-700/40 dark:bg-gray-900"
        >
          {hits.length === 0 && <li className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">Nothing matches “{q.trim()}”.</li>}
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === cursor}>
              <a
                href={`#${h.id}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(h);
                }}
                onMouseEnter={() => setCursor(i)}
                className={cx("flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm", i === cursor ? "bg-blue-50 dark:bg-blue-500/15" : "")}
              >
                {h.method && <MethodBadge method={h.method} small />}
                <span className={cx("truncate text-gray-900 dark:text-white", h.method && "font-mono text-[13px]")}>{h.title}</span>
                {h.where && <span className="ml-auto hidden truncate pl-3 text-xs text-gray-500 sm:block dark:text-gray-400">{h.where}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------- */
/* Navigation                                                        */
/* ---------------------------------------------------------------- */

const NavList: React.FC<{ active: string; onPick?: () => void }> = ({ active, onPick }) => (
  <nav aria-label="Guide">
    {GROUPS.map((g) => (
      <div key={g.title} className="mb-6">
        <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{g.title}</p>
        <ul>
          {g.sections.map((s) => {
            const on = active === s.id;
            const endpoints = s.blocks.flatMap((b) => (b.kind === "endpoint" ? [b.endpoint] : []));
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={onPick}
                  aria-current={on ? "location" : undefined}
                  className={cx(
                    "block rounded-xl px-3 py-1.5 text-sm transition-colors",
                    on
                      ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-white",
                  )}
                >
                  {s.title}
                </a>
                {on && endpoints.length > 1 && (
                  <ul className="my-1 ml-3 border-l border-gray-200 pl-2 dark:border-gray-700/30">
                    {endpoints.map((e) => (
                      <li key={e.id}>
                        <a
                          href={`#${e.id}`}
                          onClick={onPick}
                          className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                        >
                          <MethodBadge method={e.method} small />
                          <span className="truncate font-mono">{e.path.replace(/^\/(integrations|reminders)/, "")}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    ))}
  </nav>
);

/** The section whose heading last crossed the top of the viewport. */
function useActiveSection(): string {
  const [active, setActive] = useState(ALL_SECTIONS[0].id);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current = ALL_SECTIONS[0].id;
      for (const s of ALL_SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= 120) current = s.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return active;
}

/* ---------------------------------------------------------------- */
/* Blocks                                                            */
/* ---------------------------------------------------------------- */

const prose = "text-[15px] leading-7 text-gray-600 dark:text-gray-300";

const Table: React.FC<{ head: string[]; rows: string[][] }> = ({ head, rows }) => (
  <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700/40">
    <table className="w-full min-w-[34rem] text-left text-sm">
      <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
        <tr>
          {head.map((h) => (
            <th key={h} scope="col" className="px-4 py-2.5">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/30">
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={cx("px-4 py-2.5 align-top", j === 0 ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-300")}>
                <Inline text={c} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Note: React.FC<{ tone: "info" | "warn"; title?: string; text: string }> = ({ tone, title, text }) => {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <aside
      className={cx(
        "flex gap-3 rounded-2xl px-4 py-3.5 text-sm leading-6",
        tone === "warn" ? "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100" : "bg-blue-50 text-blue-900 dark:bg-blue-500/10 dark:text-blue-100",
      )}
    >
      <Icon className={cx("mt-0.5 h-4 w-4 shrink-0", tone === "warn" ? "text-amber-600 dark:text-amber-300" : "text-blue-600 dark:text-blue-300")} aria-hidden />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <p>
          <Inline text={text} />
        </p>
      </div>
    </aside>
  );
};

const Steps: React.FC<{ steps: Array<{ title: string; text: string }> }> = ({ steps }) => (
  <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {steps.map((s, i) => (
      <li key={s.title} className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/50">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">{i + 1}</span>
        <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">{s.title}</p>
        <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
          <Inline text={s.text} />
        </p>
      </li>
    ))}
  </ol>
);

const IN_LABEL: Record<Param["in"], string> = { query: "Query", body: "Body", header: "Header", path: "Path" };

const Params: React.FC<{ params: Param[] }> = ({ params }) => (
  <div>
    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Parameters</h4>
    <ul className="divide-y divide-gray-100 dark:divide-gray-700/30">
      {params.map((p) => (
        <li key={p.name} className="py-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <code className="font-mono text-[13px] font-semibold text-gray-900 dark:text-white">{p.name}</code>
            <span className="text-xs text-gray-500 dark:text-gray-400">{p.type}</span>
            <span className="rounded-md bg-gray-100 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">{IN_LABEL[p.in]}</span>
            {p.required && <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Required</span>}
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
            <Inline text={p.description} />
          </p>
        </li>
      ))}
    </ul>
  </div>
);

const EndpointCard: React.FC<{ endpoint: Endpoint }> = ({ endpoint: e }) => (
  <article id={e.id} className="scroll-mt-20 rounded-2xl border border-gray-200 dark:border-gray-700/40">
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 px-4 py-3 sm:px-5 dark:border-gray-700/30">
      <MethodBadge method={e.method} />
      <code className="break-all font-mono text-sm font-semibold text-gray-900 dark:text-white">{e.path}</code>
      <a href={`#${e.id}`} className="ml-auto text-xs text-gray-400 hover:text-blue-600 dark:hover:text-blue-400" aria-label={`Link to ${e.method} ${e.path}`}>
        #
      </a>
    </header>
    <div className="grid gap-6 p-4 sm:p-5 xl:grid-cols-2">
      <div className="min-w-0 space-y-5">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{e.summary}</h3>
          {e.description && (
            <p className={cx(prose, "mt-1.5")}>
              <Inline text={e.description} />
            </p>
          )}
        </div>
        <p className="flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
          <span>
            <span className="font-medium text-gray-900 dark:text-white">Sign the call with: </span>
            <Inline text={e.auth} />
          </span>
        </p>
        {e.params && e.params.length > 0 && <Params params={e.params} />}
        {e.errors && e.errors.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Errors</h4>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/30">
              {e.errors.map((er, i) => (
                <li key={i} className="flex gap-3 py-2 text-sm">
                  <span className="w-9 shrink-0 font-mono font-semibold text-gray-900 dark:text-white">{er.status}</span>
                  <span className="leading-6 text-gray-600 dark:text-gray-300">
                    {er.code && (
                      <>
                        <Inline text={`\`${er.code}\``} />{" "}
                      </>
                    )}
                    <Inline text={er.meaning} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
        <CodeTabs samples={e.samples} title="Request" />
        {e.response && <CodeTabs samples={[{ lang: "json", label: `Response · ${e.response.status}`, code: e.response.body }]} />}
      </div>
    </div>
  </article>
);

const BlockView: React.FC<{ block: Block }> = ({ block }) => {
  switch (block.kind) {
    case "p":
      return (
        <p className={cx(prose, "max-w-3xl")}>
          <Inline text={block.text} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={cx(prose, "max-w-3xl space-y-2 pl-5", block.ordered ? "list-decimal" : "list-disc", "marker:text-gray-400")}>
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} />
            </li>
          ))}
        </Tag>
      );
    }
    case "note":
      return (
        <div className="max-w-3xl">
          <Note tone={block.tone} title={block.title} text={block.text} />
        </div>
      );
    case "table":
      return <Table head={block.head} rows={block.rows} />;
    case "steps":
      return <Steps steps={block.steps} />;
    case "code":
      return <CodeTabs samples={block.samples} title={block.title} className="max-w-3xl" />;
    case "endpoint":
      return <EndpointCard endpoint={block.endpoint} />;
  }
};

const SectionView: React.FC<{ section: Section }> = ({ section }) => (
  <section id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-20 border-t border-gray-100 py-12 first:border-t-0 dark:border-gray-700/30">
    <h2 id={`${section.id}-title`} className="group text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
      {section.title}
      <a href={`#${section.id}`} className="ml-2 text-gray-300 opacity-0 transition-opacity hover:text-blue-600 group-hover:opacity-100 focus:opacity-100 dark:text-gray-600" aria-label={`Link to ${section.title}`}>
        #
      </a>
    </h2>
    {section.lead && <p className="mt-2 max-w-3xl text-base leading-7 text-gray-500 dark:text-gray-400">{section.lead}</p>}
    <div className="mt-6 space-y-6">
      {section.blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  </section>
);

/* ---------------------------------------------------------------- */
/* Hero + the reader's values                                        */
/* ---------------------------------------------------------------- */

const QUICK = [
  { href: "#sso-flow", icon: KeyRound, title: "Sign in with Amashuri", text: "Add school sign-in to your app in five steps." },
  { href: "#sync", icon: Database, title: "Read school data", text: "Users, classes, subjects and timetables in a few calls." },
  { href: "#reminders", icon: BellRing, title: "Send reminders", text: "Deadlines and meetings, delivered to the right people." },
];

const LANG_NAMES: Partial<Record<Lang, string>> = { curl: "cURL", node: "Node.js", python: "Python", php: "PHP" };

const field =
  "h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700/40 dark:bg-gray-900/60 dark:text-white dark:placeholder-gray-500";

const ValuesPanel: React.FC<{ values: DevValues; onChange: (v: DevValues) => void; lang: Lang; onLang: (l: Lang) => void }> = ({ values, onChange, lang, onLang }) => {
  const set = <K extends keyof DevValues>(k: K, v: DevValues[K]) => onChange({ ...values, [k]: v });
  return (
    <section aria-labelledby="devdocs-values" className="rounded-2xl bg-gray-50 p-4 sm:p-5 dark:bg-gray-800/50">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />
        <h2 id="devdocs-values" className="text-sm font-semibold text-gray-900 dark:text-white">
          Your values
        </h2>
      </div>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Fill these in and every sample on the page uses them. They stay in this browser. Do not type a secret here.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Environment</span>
          <div className="flex h-9 rounded-full bg-gray-200/70 p-0.5 dark:bg-gray-900/60" role="radiogroup" aria-label="Environment">
            {(Object.keys(ENVIRONMENTS) as Array<DevValues["env"]>).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={values.env === k}
                onClick={() => set("env", k)}
                className={cx(
                  "flex-1 rounded-full text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  values.env === k ? "bg-white text-gray-900 dark:bg-gray-700 dark:text-white" : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white",
                )}
              >
                {ENVIRONMENTS[k].label}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Client ID</span>
          <input className={field} value={values.clientId} onChange={(e) => set("clientId", e.target.value)} placeholder="your_client_id" autoComplete="off" spellCheck={false} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Callback address</span>
          <input className={field} value={values.redirectUri} onChange={(e) => set("redirectUri", e.target.value)} placeholder="https://your-app.example/sso/callback" autoComplete="off" spellCheck={false} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">School number</span>
          <input className={field} value={values.tenant} onChange={(e) => set("tenant", e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="1" inputMode="numeric" autoComplete="off" />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Samples in</span>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Sample language">
          {SERVER_LANGS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lang === l}
              onClick={() => onLang(l)}
              className={cx(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                lang === l ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:text-gray-900 dark:bg-gray-900/60 dark:text-gray-300 dark:hover:text-white",
              )}
            >
              {LANG_NAMES[l]}
            </button>
          ))}
        </div>
        <code className="ml-auto truncate font-mono text-xs text-gray-500 dark:text-gray-400">{ENVIRONMENTS[values.env].base}</code>
      </div>
    </section>
  );
};

/* ---------------------------------------------------------------- */
/* Page                                                              */
/* ---------------------------------------------------------------- */

const DevelopersPage: React.FC = () => {
  const [values, setValues] = useState<DevValues>(() => readStored(VALUES_KEY, DEFAULT_VALUES));
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const l = window.localStorage.getItem(LANG_KEY) as Lang | null;
      return l && SERVER_LANGS.includes(l) ? l : "curl";
    } catch {
      return "curl";
    }
  });
  const [menu, setMenu] = useState(false);
  const active = useActiveSection();

  const saveValues = useCallback((v: DevValues) => {
    setValues(v);
    try {
      window.localStorage.setItem(VALUES_KEY, JSON.stringify(v));
    } catch {
      /* private mode: the values simply do not persist */
    }
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      /* see above */
    }
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = "Developers · Amashuri";
    return () => {
      document.title = prev;
    };
  }, []);

  // Arriving with #section: the page is lazy, so the browser's own jump ran before the target existed.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const prefs = useMemo(() => ({ values, lang, setLang }), [values, lang, setLang]);

  return (
    <PrefsContext.Provider value={prefs}>
      <style>{CODE_STYLES}</style>
      <div className="min-h-screen scroll-smooth bg-white text-gray-900 dark:bg-black dark:text-white">
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-700/40 dark:bg-black/80">
          <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-3 px-4">
            <button
              type="button"
              onClick={() => setMenu(true)}
              aria-label="Open the guide menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:hidden dark:text-gray-300 dark:hover:bg-gray-800/60"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <a href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Amashuri home">
              <AmashuriLogo size={26} textClass="text-gray-900 dark:text-white hidden sm:inline" />
            </a>
            <span className="hidden shrink-0 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 sm:inline dark:bg-blue-500/15 dark:text-blue-300">Developers</span>
            <div className="flex flex-1 justify-center">
              <SearchBox />
            </div>
            <ThemeToggle />
            <a
              href={misHref("/login")}
              className="hidden shrink-0 rounded-full bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:inline dark:focus-visible:ring-offset-black"
            >
              Sign in
            </a>
          </div>
        </header>

        {menu && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Guide menu">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMenu(false)} aria-hidden />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto border-r border-gray-200 bg-white p-3 dark:border-gray-700/40 dark:bg-gray-950">
              <div className="mb-3 flex items-center justify-between px-3">
                <span className="text-sm font-semibold">Guide</span>
                <button
                  type="button"
                  onClick={() => setMenu(false)}
                  aria-label="Close the menu"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-800/60"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <NavList active={active} onPick={() => setMenu(false)} />
            </div>
          </div>
        )}

        <div className="mx-auto flex max-w-[90rem] gap-8 px-4">
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto py-8 lg:block">
            <NavList active={active} />
          </aside>

          <main className="min-w-0 flex-1 pb-24">
            <div className="py-10 sm:py-14">
              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Amashuri for developers</p>
              <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Build on the school's own system.</h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-gray-500 dark:text-gray-400">
                One sign-in for every app, the school's people and classes from one API, and reminders that reach the right person. Every example on this page is ready to copy.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {QUICK.map((q) => (
                  <a
                    key={q.href}
                    href={q.href}
                    className="group rounded-2xl border border-gray-200 p-4 transition-colors hover:border-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700/40 dark:hover:border-blue-500"
                  >
                    <q.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" strokeWidth={1.75} aria-hidden />
                    <p className="mt-3 flex items-center gap-1 text-sm font-semibold">
                      {q.title}
                      <ArrowRight className="h-3.5 w-3.5 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden />
                    </p>
                    <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{q.text}</p>
                  </a>
                ))}
              </div>
              <div className="mt-6">
                <ValuesPanel values={values} onChange={saveValues} lang={lang} onLang={setLang} />
              </div>
            </div>

            {ALL_SECTIONS.map((s) => (
              <SectionView key={s.id} section={s} />
            ))}

            <footer className="mt-8 border-t border-gray-100 pt-6 text-sm text-gray-500 dark:border-gray-700/30 dark:text-gray-400">
              Amashuri · School activities management. Credentials and scopes are issued by a platform administrator under Systems.
            </footer>
          </main>
        </div>
      </div>
    </PrefsContext.Provider>
  );
};

export default DevelopersPage;
