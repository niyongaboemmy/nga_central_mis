import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Sign-in page stuck on "Checking session..." (2026-11-27): the browser's saved
 * token had expired while the shared session cookie was still good. The session
 * check succeeded, Home refused (no token) and sent the person back, forever.
 * The server now answers a cookie-only check with the session's token, and the
 * check saves it.
 */
const get = vi.fn();
vi.mock("../../services/api", () => ({ default: { get: (...a: unknown[]) => get(...a) }, API_BASE_URL: "" }));

import { checkSession } from "../auth";

beforeEach(() => {
  localStorage.clear();
  get.mockReset();
});

describe("checkSession", () => {
  it("saves the token a cookie-only session answers with", async () => {
    get.mockResolvedValue({ data: { data: { user: { user_id: 15 }, token: "cookie-token" } } });
    await checkSession();
    expect(localStorage.getItem("token")).toBe("cookie-token");
  });

  it("never replaces a token this browser already has", async () => {
    localStorage.setItem("token", "mine");
    get.mockResolvedValue({ data: { data: { user: { user_id: 15 }, token: "other" } } });
    await checkSession();
    expect(localStorage.getItem("token")).toBe("mine");
  });

  it("leaves storage alone when the answer has no token", async () => {
    get.mockResolvedValue({ data: { data: { user: { user_id: 15 } } } });
    await checkSession();
    expect(localStorage.getItem("token")).toBeNull();
  });
});
