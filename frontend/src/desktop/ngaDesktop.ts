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
 * Google sign-in for the desktop app (Google refuses to sign in inside an
 * embedded app window, so it happens in the person's browser):
 *
 * 1. Desktop: MIS's login page shows a link to `/desktop/google` (no query).
 *    The desktop app intercepts it, listens on a one-time loopback port and
 *    opens the browser at `/desktop/google?redirect_uri=http://127.0.0.1:<port>/google&state=<hex>`.
 * 2. Browser: that page signs in with Google as usual and POSTs
 *    `{credential, state}` to the loopback address.
 * 3. Desktop: opens `/login?desktop_google=1#credential=…`, and the login page
 *    finishes with the existing `POST /auth/google`.
 */
export const DESKTOP_GOOGLE_PATH = "/desktop/google";

/** Only the desktop app's own loopback listener may receive a credential. */
export const validDesktopRedirect = (value: string | null): value is string =>
  !!value && /^http:\/\/127\.0\.0\.1:\d{2,5}\/google$/.test(value);

export const validDesktopState = (value: string | null): value is string => !!value && /^[a-f0-9]{32}$/.test(value);

/** `#credential=<jwt>` handed over by the desktop app, if this is that hand-over. */
export const desktopGoogleCredential = (search: string, hash: string): string | null => {
  if (!new URLSearchParams(search).has("desktop_google")) return null;
  const credential = new URLSearchParams(hash.replace(/^#/, "")).get("credential");
  return credential && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(credential) ? credential : null;
};
