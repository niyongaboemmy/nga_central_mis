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
 * 1. Desktop: the login page links to `/desktop/signin?via=google`. The app
 *    intercepts it, keeps a PKCE verifier, listens once on a loopback port and
 *    opens the browser at `/desktop/signin?redirect_uri=http://127.0.0.1:<port>/signin&state=…&challenge=…`.
 * 2. Browser: with via=google, straight to Google's button (One Tap,
 *    auto-select), not MIS's whole form again; an existing session shows
 *    "Continue to the NGA app" (one click, as consent). MIS issues a one-time code bound to the
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

// ─── Google, by redirect (no extra page in between) ─────────────────────────
//
// With via=google and no MIS session, /desktop/signin goes straight to Google's
// own account chooser (OpenID Connect implicit flow, response_type=id_token).
// Google may only return to a registered address, which for MIS is the site
// root, so the desktop request (redirect_uri / state / challenge) travels in
// Google's `state`, with a one-time `nonce` kept in sessionStorage. Back on
// "/", main.tsx forwards to /desktop/signin, which checks the nonce and signs
// in with the existing POST /auth/google.

export const GOOGLE_STATE_PREFIX = "ngad.";
export const DESKTOP_NONCE_KEY = "nga.desktop.googleNonce";

export interface DesktopRequest {
  redirect: string;
  state: string;
  challenge: string;
}

const toB64Url = (s: string) =>
  btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64Url = (s: string) =>
  decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4))));

export const encodeGoogleState = (req: DesktopRequest) =>
  GOOGLE_STATE_PREFIX + toB64Url(JSON.stringify({ r: req.redirect, s: req.state, c: req.challenge }));

export const decodeGoogleState = (value: string | null): DesktopRequest | null => {
  if (!value?.startsWith(GOOGLE_STATE_PREFIX)) return null;
  try {
    const o = JSON.parse(fromB64Url(value.slice(GOOGLE_STATE_PREFIX.length)));
    const req = { redirect: String(o.r), state: String(o.s), challenge: String(o.c) };
    return validDesktopRedirect(req.redirect) && validDesktopState(req.state) && validDesktopChallenge(req.challenge) ? req : null;
  } catch {
    return null;
  }
};

export const googleAuthUrl = (
  clientId: string,
  returnUri: string,
  req: DesktopRequest,
  nonce: string,
  chooseAccount = false,
) => {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", returnUri);
  u.searchParams.set("response_type", "id_token");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("nonce", nonce);
  u.searchParams.set("state", encodeGoogleState(req));
  if (chooseAccount) u.searchParams.set("prompt", "select_account");
  return u.toString();
};

/**
 * Google came back to "/" for a desktop sign-in: where to continue, carrying
 * the id_token (or Google's error) in the fragment. Null for anything else.
 */
export const desktopGoogleReturn = (pathname: string, hash: string): string | null => {
  if (pathname !== "/" || !hash) return null;
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const req = decodeGoogleState(p.get("state"));
  if (!req) return null;
  const next = new URL("/desktop/signin", "https://x");
  next.searchParams.set("redirect_uri", req.redirect);
  next.searchParams.set("state", req.state);
  next.searchParams.set("challenge", req.challenge);
  next.searchParams.set("via", "google");
  const frag = new URLSearchParams();
  const idToken = p.get("id_token");
  if (idToken) frag.set("id_token", idToken);
  else frag.set("error", p.get("error") || "google_failed");
  return `${next.pathname}${next.search}#${frag.toString()}`;
};

/** The `nonce` claim of an id_token (to match the one this browser sent). */
export const idTokenNonce = (idToken: string): string | null => {
  try {
    return JSON.parse(fromB64Url(idToken.split(".")[1] ?? "")).nonce ?? null;
  } catch {
    return null;
  }
};
