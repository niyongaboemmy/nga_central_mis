import { afterEach, describe, expect, it, vi } from "vitest";
import { isRegistrationSite, misHref, registerSchoolHref } from "../registrationSite";

describe("registration site", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off when no registration site is configured", () => {
    vi.stubEnv("VITE_REGISTRATION_SITE_URL", "");
    expect(isRegistrationSite("amashuri.com")).toBe(false);
    expect(registerSchoolHref()).toBe("/register-school");
    expect(misHref("/login")).toBe("/login");
  });

  it("recognises the apex and www hosts only", () => {
    vi.stubEnv("VITE_REGISTRATION_SITE_URL", "https://amashuri.com/");
    expect(isRegistrationSite("amashuri.com")).toBe(true);
    expect(isRegistrationSite("WWW.amashuri.com")).toBe(true);
    expect(isRegistrationSite("mis.amashuri.com")).toBe(false);
  });

  it("sends the MIS login to the registration site", () => {
    vi.stubEnv("VITE_REGISTRATION_SITE_URL", "https://amashuri.com");
    vi.stubEnv("VITE_MIS_APP_URL", "https://mis.amashuri.com");
    // jsdom runs on localhost: not the registration site
    expect(registerSchoolHref()).toBe("https://amashuri.com/register");
    expect(misHref("/login")).toBe("/login");
  });
});
