import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import CodePlayground from "./CodePlayground";
import { languageById } from "./languages";
import type { PlayFile } from "./project";
import { usePermissions } from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";

/**
 * /code-playground — the Code Playground on its own, filling the screen (no sidebar or
 * top bar), for any language it runs. ?lang=python picks the language; each language
 * keeps its own draft on this device. "Share" copies a link carrying the files
 * (#p=…, base64 JSON; older links #code=… carry one file), so a teacher can hand an example
 * to a class. Full screen hides
 * the browser's own bars too. Needs CODE_PLAYGROUND_USE (every role by default).
 */

const DEFAULT_LANGUAGE = "python";
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
  const navigate = useNavigate();
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

  const onBack = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    if (window.history.length > 1) navigate(-1);
    else navigate("/home");
  }, [navigate]);

  const program = useMemo(() => (shared && shared.code.trim() ? shared : null), [shared]);

  if (!hasPermission(Permissions.CODE_PLAYGROUND_USE)) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center p-6 bg-slate-50 dark:bg-[#0d1117]">
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
    <main className="fixed inset-0 z-40 bg-white dark:bg-[#0d1117]" data-testid="code-playground-route">
      <CodePlayground
        variant="page"
        language={language}
        code={program?.code}
        entry={program?.entry}
        files={program?.files}
        source="Write, run and test code in any language"
        onLanguageChange={onLanguageChange}
        onShare={onShare}
        onBack={onBack}
        fullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        className="h-full"
      />
    </main>
  );
};

export default CodePlaygroundPage;
