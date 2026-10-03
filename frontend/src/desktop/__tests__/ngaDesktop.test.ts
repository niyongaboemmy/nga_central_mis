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
