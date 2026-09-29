import { useCallback, useEffect, useRef, useState } from "react";
import { authorizeSSO } from "../../api/auth";
import type { System } from "../../api/systems";

/**
 * Launching another NGA app so it opens in its *installed* app window.
 *
 * Chrome (139+ on Windows/Mac/Linux; Android via WebAPK) sends a navigation
 * into an installed web app only when it is a real link that opens a new
 * top-level page -- `<a target="_blank" rel="noopener">` -- and never for a
 * scripted `window.open()` (an "auxiliary browsing context"). The old menu
 * opened `about:blank` first and pointed it at the app once the SSO code came
 * back, so every launch landed in a plain browser tab even with the app
 * installed. See docs/APP_LAUNCH.md.
 *
 * So the codes are minted *before* the click: when the menu opens, each SSO
 * app gets a fresh single-use code (5-minute lifetime on the server), and the
 * tile is an ordinary link to `callback?code=&state=`. Codes are refreshed
 * before they expire and re-minted after a tile is used.
 */

/** Refresh before the server's 5-minute code lifetime runs out. */
export const CODE_REFRESH_MS = 4 * 60_000;

export type LaunchLink =
  | { status: "ready"; href: string }
  | { status: "pending" }
  | { status: "signed-out"; loginHref: string }
  | { status: "error"; href: string };

/** Which registered callback to use: one on this origin first, else the first, else the home page. */
export const resolveRedirectUri = (system: Pick<System, "allowed_redirect_uris" | "home_url">, origin: string) => {
  const callbacks = system.allowed_redirect_uris
    ? system.allowed_redirect_uris.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return callbacks.find((cb) => cb.startsWith(origin)) || callbacks[0] || system.home_url || null;
};

export const buildLaunchHref = (redirectUri: string, code: string, state?: string) => {
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  return url.toString();
};

/** Is MIS itself running as the installed app (its own window)? */
export const runningAsInstalledApp = () =>
  typeof window !== "undefined" &&
  (Boolean((navigator as any).standalone) ||
    ["standalone", "window-controls-overlay", "fullscreen", "minimal-ui"].some(
      (m) => window.matchMedia?.(`(display-mode: ${m})`).matches,
    ));

/**
 * Tell the target app it was opened from the installed NGA app, so -- if it
 * lands in a browser tab because it isn't installed yet -- it asks to be
 * installed straight away (Task Mentor / Tupo: src/pwa/ngaInstall.tsx).
 */
export const withLaunchMarker = (href: string, installedApp = runningAsInstalledApp()) => {
  if (!installedApp) return href;
  try {
    const url = new URL(href);
    url.searchParams.set("nga_launch", "app");
    return url.toString();
  } catch {
    return href;
  }
};

/** MIS's own sign-in page, continuing to the app afterwards (used when the MIS session expired). */
export const buildLoginHref = (origin: string, clientId: string, redirectUri: string, state: string) => {
  const url = new URL("/login", origin);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
};

const newState = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Launch links for `systems`, kept fresh while `active` (the menu is open).
 * `consume(id)` must be called when a tile is used: its code is single-use.
 */
export const useLaunchLinks = (systems: System[], active: boolean) => {
  const [links, setLinks] = useState<Record<number, LaunchLink>>({});
  const alive = useRef(true);

  const mint = useCallback(async (system: System) => {
    const origin = window.location.origin;
    const redirectUri = resolveRedirectUri(system, origin);
    if (!redirectUri) return;
    if (!system.client_id) {
      setLinks((l) => ({ ...l, [system.system_id]: { status: "ready", href: withLaunchMarker(redirectUri) } }));
      return;
    }
    const state = newState();
    setLinks((l) => (l[system.system_id]?.status === "ready" ? l : { ...l, [system.system_id]: { status: "pending" } }));
    try {
      const result = await authorizeSSO(system.client_id, redirectUri, "code", state);
      if (!alive.current) return;
      const link: LaunchLink =
        result && result.code
          ? { status: "ready", href: withLaunchMarker(buildLaunchHref(redirectUri, result.code, result.state)) }
          : { status: "error", href: withLaunchMarker(redirectUri) };
      setLinks((l) => ({ ...l, [system.system_id]: link }));
    } catch (error: any) {
      if (!alive.current) return;
      const link: LaunchLink =
        error?.response?.status === 401
          ? { status: "signed-out", loginHref: buildLoginHref(origin, system.client_id, redirectUri, state) }
          : { status: "error", href: withLaunchMarker(redirectUri) };
      setLinks((l) => ({ ...l, [system.system_id]: link }));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const key = systems.map((s) => s.system_id).join(",");
  useEffect(() => {
    if (!active || systems.length === 0) return;
    systems.forEach((s) => void mint(s));
    const timer = window.setInterval(() => systems.forEach((s) => void mint(s)), CODE_REFRESH_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, mint]);

  /** A tile was used: its code is spent, so mint the next one right away. */
  const consume = useCallback(
    (systemId: number) => {
      const system = systems.find((s) => s.system_id === systemId);
      // Deferred: the browser must follow the link's current href first.
      if (system?.client_id) window.setTimeout(() => void mint(system), 500);
    },
    [systems, mint],
  );

  return { links, consume };
};
