/**
 * NGA Desktop (the Windows/macOS app that hosts MIS, Task Mentor, Tendo and
 * Tupo; repo nga-desktop) adds `NGADesktop/<version>` to its user agent.
 * Keep this file identical in every NGA web app.
 */
export const isNgaDesktop = (ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean =>
  /\bNGADesktop\/\d/.test(ua);

export const ngaDesktopVersion = (ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): string | null =>
  ua.match(/\bNGADesktop\/([\d.]+)/)?.[1] ?? null;

/**
 * Signing the desktop app in through the person's browser, like Postman's
 * desktop app (Google can't sign in inside an embedded app window):
 *
 * 1. Desktop: the login page links to `/desktop/signin` (no query). The app
 *    intercepts it, keeps a PKCE verifier, listens once on a loopback port and
 *    opens the browser at `/desktop/signin?redirect_uri=http://127.0.0.1:<port>/signin&state=…&challenge=…`.
 * 2. Browser: sign in to MIS as usual (Google, password + OTP, or an existing
 *    session → "Continue as …"). MIS issues a one-time code bound to the
 *    challenge (POST /auth/desktop-handoff) and form-POSTs `{code, state}` to
 *    the loopback address.
 * 3. Desktop: opens `/desktop/complete#code=…&verifier=…` in its MIS window,
 *    which redeems it (POST /auth/desktop-handoff/redeem) like a normal login.
 */
export const DESKTOP_SIGNIN_PATH = "/desktop/signin";

/** Only the desktop app's own loopback listener may receive a code. */
export const validDesktopRedirect = (value: string | null): value is string =>
  !!value && /^http:\/\/127\.0\.0\.1:\d{2,5}\/signin$/.test(value);

export const validDesktopState = (value: string | null): value is string => !!value && /^[a-f0-9]{32}$/.test(value);

/** PKCE S256 challenge: base64url of a SHA-256, 43 characters. */
export const validDesktopChallenge = (value: string | null): value is string => !!value && /^[A-Za-z0-9_-]{43}$/.test(value);

/** `#code=…&verifier=…` handed over by the desktop app on /desktop/complete. */
export const desktopHandback = (hash: string): { code: string; verifier: string } | null => {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const code = p.get("code");
  const verifier = p.get("verifier");
  if (!code || !verifier || !/^[\w.-]+$/.test(code) || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return null;
  return { code, verifier };
};
