import { describe, expect, it } from "vitest";
import { desktopGoogleCredential, isNgaDesktop, ngaDesktopVersion, validDesktopRedirect, validDesktopState } from "../ngaDesktop";

describe("ngaDesktop", () => {
  it("detects the desktop app from its user agent", () => {
    const ua = "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15 NGADesktop/0.2.0";
    expect(isNgaDesktop(ua)).toBe(true);
    expect(ngaDesktopVersion(ua)).toBe("0.2.0");
    expect(isNgaDesktop("Mozilla/5.0 Chrome/140")).toBe(false);
  });

  it("only hands a credential to the desktop app's loopback listener", () => {
    expect(validDesktopRedirect("http://127.0.0.1:53211/google")).toBe(true);
    expect(validDesktopRedirect("http://127.0.0.1.evil.io:53211/google")).toBe(false);
    expect(validDesktopRedirect("https://evil.example/google")).toBe(false);
    expect(validDesktopRedirect("http://127.0.0.1:53211/google?x=1")).toBe(false);
    expect(validDesktopState("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(validDesktopState("x")).toBe(false);
  });

  it("reads the credential the desktop app hands back", () => {
    expect(desktopGoogleCredential("?desktop_google=1", "#credential=aa.bb.cc")).toBe("aa.bb.cc");
    expect(desktopGoogleCredential("", "#credential=aa.bb.cc")).toBeNull();
    expect(desktopGoogleCredential("?desktop_google=1", "#credential=<script>")).toBeNull();
  });
});
