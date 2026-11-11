import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Cloudflare Turnstile / hCaptcha (free tiers), loaded on demand only when
 * publicApi.captchaConfig names a provider (§6.1 abuse protection).
 */
export type CaptchaProvider = "turnstile" | "hcaptcha";

const SCRIPTS: Record<CaptchaProvider, { src: string; global: string }> = {
  turnstile: { src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", global: "turnstile" },
  hcaptcha: { src: "https://js.hcaptcha.com/1/api.js?render=explicit", global: "hcaptcha" },
};

const loading: Partial<Record<CaptchaProvider, Promise<void>>> = {};

const loadScript = (p: CaptchaProvider): Promise<void> => {
  const { src, global } = SCRIPTS[p];
  if ((window as any)[global]) return Promise.resolve();
  if (!loading[p]) {
    loading[p] = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.defer = true;
      s.onload = () => {
        // render=explicit scripts define the global slightly after load
        const wait = (n: number) => ((window as any)[global] ? resolve() : n > 50 ? reject(new Error("captcha")) : window.setTimeout(() => wait(n + 1), 100));
        wait(0);
      };
      s.onerror = () => {
        delete loading[p];
        reject(new Error("captcha"));
      };
      document.head.appendChild(s);
    });
  }
  return loading[p]!;
};

const Captcha: React.FC<{ provider: CaptchaProvider; siteKey: string; onToken: (t: string | null) => void }> = ({ provider, siteKey, onToken }) => {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const cb = useRef(onToken);
  cb.current = onToken;
  useEffect(() => {
    let widget: unknown = null;
    let gone = false;
    loadScript(provider)
      .then(() => {
        if (gone || !box.current) return;
        const api = (window as any)[SCRIPTS[provider].global];
        const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
        widget = api.render(box.current, {
          sitekey: siteKey,
          theme,
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
        setState("ready");
      })
      .catch(() => !gone && setState("error"));
    return () => {
      gone = true;
      try {
        const api = (window as any)[SCRIPTS[provider].global];
        if (widget !== null && api?.remove) api.remove(widget);
      } catch {
        /* ignore */
      }
    };
  }, [provider, siteKey]);
  return (
    <div className="flex min-h-[65px] items-center">
      {state === "loading" && <Loader2 className="h-5 w-5 animate-spin text-slate-500" aria-label="Loading check" />}
      {state === "error" && <span className="text-sm text-red-600 dark:text-red-400">Check unavailable · reload</span>}
      <div ref={box} />
    </div>
  );
};

export default Captcha;
