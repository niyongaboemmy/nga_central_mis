import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Lock, Minimize2 } from "lucide-react";
import CodePlayground from "./CodePlayground";
import { languageById } from "./languages";
import { WEB_STARTER, type PlayFile } from "./project";
import { usePermissions } from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";

/**
 * /code-playground — the Code Playground as a page of the MIS (sidebar and top bar around it),
 * for any language it runs. ?lang=python picks the language (HTML, CSS & JavaScript by default);
 * each language keeps its own draft on this device. "Share" copies a link carrying the files
 * (#p=…, base64 JSON; older links #code=… carry one file), so a teacher can hand an example
 * to a class.
 *
 * "Expand" (Ctrl/⌘+Shift+E) lets it fill the window over the MIS bars; Esc comes back. Expanded,
 * "Full screen" hides the browser's own bars too. The same element only changes size, so the
 * code, a running program and its console carry on. Needs CODE_PLAYGROUND_USE (every role).
 */

/** A page made of HTML, CSS and JavaScript: what most students start with. */
const DEFAULT_LANGUAGE = "html";
const MAX_SHARED_CHARS = 12000;

/** UTF-8 safe base64 for the #code= part of a shared link. */
const encode = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (s: string): string | null => {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
};

/** The program a shared link carries: several files (#p=) or one (#code=). */
const sharedProgram = (): { code: string; entry?: string; files?: PlayFile[] } | null => {
  const p = window.location.hash.match(/(?:^#|&)p=([^&]+)/);
  if (p) {
    try {
      const d = JSON.parse(decode(p[1]) ?? "");
      const files: PlayFile[] = (Array.isArray(d?.files) ? d.files : []).filter((x: any) => typeof x?.path === "string" && typeof x?.content === "string");
      const main = files.find((x) => x.path === d.entry);
      if (main) return { code: main.content, entry: main.path, files: files.filter((x) => x !== main) };
    } catch {
      /* a broken link opens the starter */
    }
  }
  const m = window.location.hash.match(/(?:^#|&)code=([^&]+)/);
  const code = m ? decode(m[1]) : null;
  return code ? { code } : null;
};

const CodePlaygroundPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const [expanded, setExpanded] = useState(false);
  const [hint, setHint] = useState(false);
  const [params, setParams] = useSearchParams();
  const language = languageById(params.get("lang"))?.id ?? DEFAULT_LANGUAGE;
  // Shared code is read once, for the language in the link.
  const [shared] = useState(sharedProgram);
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);

  useEffect(() => {
    document.title = "Code Playground · NGA MIS";
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpanded((on) => {
      if (on && document.fullscreenElement) void document.exitFullscreen?.();
      return !on;
    });
  }, []);

  // Expanded: say how to come back for a moment, and keep the page behind from scrolling.
  useEffect(() => {
    if (!expanded) return;
    setHint(true);
    const t = window.setTimeout(() => setHint(false), 2600);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      setHint(false);
      document.body.style.overflow = overflow;
    };
  }, [expanded]);

  // Ctrl/⌘+Shift+E expands or comes back; Esc comes back (unless a menu, a dialog or the
  // editor used it — they mark the key handled).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        toggleExpanded();
      } else if (e.key === "Escape" && expanded && !e.defaultPrevented) {
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, toggleExpanded]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  const onLanguageChange = useCallback(
    (next: string) => {
      if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setParams({ lang: next }, { replace: true });
    },
    [setParams],
  );

  const onShare = useCallback(async ({ language: lang, files, entry }: { language: string; files: PlayFile[]; entry: string }) => {
    const size = files.reduce((n, x) => n + x.content.length, 0);
    const payload = files.length === 1 ? `#code=${encode(files[0].content)}` : `#p=${encode(JSON.stringify({ entry, files }))}`;
    const url = `${window.location.origin}/code-playground?lang=${encodeURIComponent(lang)}${size <= MAX_SHARED_CHARS ? payload : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, []);

  const program = useMemo(() => {
    if (shared && shared.code.trim()) return shared;
    // HTML, CSS & JavaScript opens as three linked files: index.html, style.css, script.js.
    if (language === "html") {
      const [main, ...rest] = WEB_STARTER.files;
      return { code: main.content, entry: WEB_STARTER.entry, files: rest };
    }
    return null;
  }, [shared, language]);

  if (!hasPermission(Permissions.CODE_PLAYGROUND_USE)) {
    return (
      <main className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <Lock className="w-8 h-8 mx-auto text-slate-400" />
          <h1 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">No access to the Code Playground</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Your role doesn't include it. Ask the school's administrator to add “Write and run code in the Code Playground”.</p>
          <Link to="/home" className="inline-block mt-4 text-sm font-medium text-brand-600 dark:text-brand-200 hover:underline">
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    // Normal: a card filling the page under the MIS top bar. Expanded: the same element over
    // everything (above the bars, under dialogs such as Save to Documents).
    <div className={expanded ? "" : "py-3 sm:py-4"}>
      <section
        aria-label="Code Playground"
        className={
          expanded
            ? "fixed inset-0 z-[900] bg-white dark:bg-[#0d1117] animate-expand-in motion-reduce:animate-none"
            : "relative h-[calc(100dvh-4rem-1.5rem)] sm:h-[calc(100dvh-4rem-2rem)] min-h-[520px] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-sm bg-white dark:bg-[#0d1117]"
        }
        data-testid="code-playground-route"
        data-view={expanded ? "expanded" : "normal"}
      >
        <CodePlayground
          variant="page"
          language={language}
          code={program?.code}
          entry={program?.entry}
          files={program?.files}
          source="Write, run and test code in any language"
          onLanguageChange={onLanguageChange}
          onShare={onShare}
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
          fullscreen={isFullscreen}
          onToggleFullscreen={expanded ? toggleFullscreen : undefined}
          className="h-full"
        />
        {hint && (
          <div role="status" className="pointer-events-none fixed bottom-12 left-1/2 -translate-x-1/2 z-[950] whitespace-nowrap inline-flex items-center gap-2 rounded-full bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 px-4 py-2 text-sm shadow-lg animate-fade-in" data-testid="playground-expanded-hint">
            <Minimize2 className="w-4 h-4" /> Expanded view · press <kbd className="font-sans font-semibold">Esc</kbd> to go back
          </div>
        )}
      </section>
    </div>
  );
};

export default CodePlaygroundPage;
