/**
 * GAP-B: the registration site (amashuri.com) is the same frontend build as the MIS and
 * calls /activity/config and /activity/sync on the API cross-origin. Its origins are
 * always allowed (config/registrationSite.ts), whatever CORS_ORIGIN / ACTIVITY_ORIGINS say.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app";
import { registrationSiteOrigins, withRegistrationSiteOrigins } from "../config/registrationSite";
import { activityOrigins } from "../services/activity/apps";

const preflight = (path: string, origin: string, method = "GET", headers = "x-nga-device,content-type") =>
  request(app).options(path).set("Origin", origin).set("Access-Control-Request-Method", method).set("Access-Control-Request-Headers", headers);

afterEach(() => vi.unstubAllEnvs());

describe("GAP-B: registration-site CORS for visit analytics", () => {
  for (const origin of ["https://amashuri.com", "https://www.amashuri.com"]) {
    it(`GAP-B: preflight + GET /activity/config from ${origin} carry the CORS headers`, async () => {
      const pre = await preflight("/activity/config", origin);
      expect(pre.status).toBeLessThan(300);
      expect(pre.headers["access-control-allow-origin"]).toBe(origin);
      expect(String(pre.headers["access-control-allow-headers"]).toLowerCase()).toContain("x-nga-device");
      const get = await request(app).get("/activity/config").set("Origin", origin);
      expect(get.status).toBe(200);
      expect(get.headers["access-control-allow-origin"]).toBe(origin);
    });
  }

  it("GAP-B: preflight for POST /activity/sync from amashuri.com is allowed", async () => {
    const pre = await preflight("/activity/sync", "https://amashuri.com", "POST");
    expect(pre.status).toBeLessThan(300);
    expect(pre.headers["access-control-allow-origin"]).toBe("https://amashuri.com");
    expect(String(pre.headers["access-control-allow-methods"])).toContain("POST");
  });

  it("GAP-B: a random origin gets no CORS headers", async () => {
    const pre = await preflight("/activity/config", "https://evil.example");
    expect(pre.headers["access-control-allow-origin"]).toBeUndefined();
    const get = await request(app).get("/activity/config").set("Origin", "https://evil.example");
    expect(get.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("GAP-B: the activity origin allowlist always includes the registration site (anonymous batches)", () => {
    vi.stubEnv("ACTIVITY_ORIGINS", "https://mis.amashuri.com");
    vi.stubEnv("REGISTRATION_SITE_URL", "https://register.example.org/");
    const list = activityOrigins();
    expect(list).toEqual(expect.arrayContaining(["https://mis.amashuri.com", "https://amashuri.com", "https://www.amashuri.com", "https://register.example.org", "https://www.register.example.org"]));
    expect(list).not.toContain("https://evil.example");
  });

  it("GAP-B: REGISTRATION_SITE_URL adds its origin and www twin; bad values are ignored; duplicates collapse", () => {
    expect(registrationSiteOrigins({ REGISTRATION_SITE_URL: "https://www.school.example/path" })).toEqual(
      expect.arrayContaining(["https://www.school.example", "https://school.example"]),
    );
    expect(registrationSiteOrigins({ REGISTRATION_SITE_URL: "not a url" })).toEqual(["https://amashuri.com", "https://www.amashuri.com"]);
    expect(registrationSiteOrigins({ REGISTRATION_SITE_URL: "http://localhost:5173" })).toEqual(["https://amashuri.com", "https://www.amashuri.com", "http://localhost:5173"]);
    expect(withRegistrationSiteOrigins(["https://amashuri.com/", "https://mis.amashuri.com"], {})).toEqual(["https://amashuri.com", "https://mis.amashuri.com", "https://www.amashuri.com"]);
  });
});
