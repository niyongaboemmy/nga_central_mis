import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import CodePlayground from "./CodePlayground";
import { languageById } from "./languages";
import { usePermissions } from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";

/**
 * /code-playground — the Code Playground on its own, filling the screen (no sidebar or
 * top bar), for any language it runs. ?lang=python picks the language; each language
 * keeps its own draft on this device. "Share" copies a link carrying the code
 * (#code=…, base64), so a teacher can hand an example to a class. Full screen hides
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

const sharedCode = () => {
  const m = window.location.hash.match(/(?:^#|&)code=([^&]+)/);
  return m ? decode(m[1]) : null;
};

const CodePlaygroundPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const language = languageById(params.get("lang"))?.id ?? DEFAULT_LANGUAGE;
  // Shared code is read once, for the language in the link.
  const [shared] = useState(sharedCode);
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

  const onShare = useCallback(async ({ language: lang, code }: { language: string; code: string }) => {
    const url = `${window.location.origin}/code-playground?lang=${encodeURIComponent(lang)}${code.length <= MAX_SHARED_CHARS ? `#code=${encode(code)}` : ""}`;
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

  const code = useMemo(() => (shared != null && shared.trim() ? shared : undefined), [shared]);

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
        code={code}
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
