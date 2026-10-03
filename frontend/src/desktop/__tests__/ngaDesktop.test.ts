import { describe, expect, it } from "vitest";
import { desktopHandback, isNgaDesktop, ngaDesktopVersion, validDesktopChallenge, validDesktopRedirect, validDesktopState } from "../ngaDesktop";

describe("ngaDesktop", () => {
  it("detects the desktop app from its user agent", () => {
    const ua = "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15 NGADesktop/0.2.0";
    expect(isNgaDesktop(ua)).toBe(true);
    expect(ngaDesktopVersion(ua)).toBe("0.2.0");
    expect(isNgaDesktop("Mozilla/5.0 Chrome/140")).toBe(false);
  });

  it("only hands a code to the desktop app's loopback listener", () => {
    expect(validDesktopRedirect("http://127.0.0.1:53211/signin")).toBe(true);
    expect(validDesktopRedirect("http://127.0.0.1.evil.io:53211/signin")).toBe(false);
    expect(validDesktopRedirect("https://evil.example/signin")).toBe(false);
    expect(validDesktopRedirect("http://127.0.0.1:53211/signin?x=1")).toBe(false);
    expect(validDesktopState("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(validDesktopState("x")).toBe(false);
    expect(validDesktopChallenge("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(true);
    expect(validDesktopChallenge("short")).toBe(false);
  });

  it("reads the code and verifier the desktop app hands back", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(desktopHandback(`#code=aa.bb.cc&verifier=${verifier}`)).toEqual({ code: "aa.bb.cc", verifier });
    expect(desktopHandback("#code=aa.bb.cc")).toBeNull();
    expect(desktopHandback(`#code=<script>&verifier=${verifier}`)).toBeNull();
  });
});

import { decodeGoogleState, desktopGoogleReturn, encodeGoogleState, googleAuthUrl, idTokenNonce } from "../ngaDesktop";

describe("desktop Google sign-in by redirect", () => {
  const req = { redirect: "http://127.0.0.1:53211/signin", state: "0123456789abcdef0123456789abcdef", challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" };

  it("carries the desktop request through Google's state", () => {
    expect(decodeGoogleState(encodeGoogleState(req))).toEqual(req);
    expect(decodeGoogleState("something-else")).toBeNull();
    // A tampered request (redirect elsewhere) is refused.
    expect(decodeGoogleState(encodeGoogleState({ ...req, redirect: "https://evil.example/signin" }))).toBeNull();
  });

  it("asks Google for an id_token back at the site root", () => {
    const u = new URL(googleAuthUrl("cid.apps.googleusercontent.com", "https://mis.amashuri.com", req, "n0nce"));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("redirect_uri")).toBe("https://mis.amashuri.com");
    expect(u.searchParams.get("response_type")).toBe("id_token");
    expect(u.searchParams.get("nonce")).toBe("n0nce");
    expect(decodeGoogleState(u.searchParams.get("state"))).toEqual(req);
  });

  it("forwards Google's return on / to the desktop page, and nothing else", () => {
    const state = encodeURIComponent(encodeGoogleState(req));
    const next = desktopGoogleReturn("/", `#state=${state}&id_token=aa.bb.cc`)!;
    expect(next.startsWith("/desktop/signin?")).toBe(true);
    const u = new URL(next, "https://mis.amashuri.com");
    expect(u.searchParams.get("redirect_uri")).toBe(req.redirect);
    expect(u.searchParams.get("via")).toBe("google");
    expect(u.hash).toBe("#id_token=aa.bb.cc");
    expect(desktopGoogleReturn("/", `#state=${state}&error=access_denied`)).toContain("#error=access_denied");
    expect(desktopGoogleReturn("/home", `#state=${state}&id_token=a.b.c`)).toBeNull();
    expect(desktopGoogleReturn("/", "#state=other&id_token=a.b.c")).toBeNull();
  });

  it("reads the nonce claim of an id_token", () => {
    const payload = btoa(JSON.stringify({ nonce: "abc", aud: "x" })).replace(/=+$/, "");
    expect(idTokenNonce(`h.${payload}.s`)).toBe("abc");
    expect(idTokenNonce("garbage")).toBeNull();
  });
});
