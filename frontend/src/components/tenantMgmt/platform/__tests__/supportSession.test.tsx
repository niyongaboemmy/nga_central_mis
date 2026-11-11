import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { beginSupportSession, endSupportSession, parseSupportHash, readSupportSession, supportSessionUrl } from "../supportSession";
import { SupportSessionChip } from "../SupportSessionChip";

const future = () => new Date(Date.now() + 3600_000).toISOString();

beforeEach(() => localStorage.clear());

describe("support session", () => {
  it("round-trips the landing link", () => {
    const exp = future();
    const url = supportSessionUrl({ token: "a.b+c/d=", tid: 7, expiresAt: exp }, { mode: "READ", schoolName: "Green Hills" });
    const parsed = parseSupportHash(url.split("#")[1]);
    expect(parsed).toEqual({ token: "a.b+c/d=", tid: 7, expiresAt: exp, mode: "READ", schoolName: "Green Hills" });
    expect(parseSupportHash("#tid=7")).toBeNull();
  });

  it("stores the token as the MIS session and End puts the platform token back", () => {
    localStorage.setItem("token", "platform-token");
    beginSupportSession("support-token", 7, future(), { mode: "WRITE" });
    expect(localStorage.getItem("token")).toBe("support-token");
    expect(readSupportSession()?.tid).toBe(7);
    expect(endSupportSession()).toBe("/platform/support");
    expect(localStorage.getItem("token")).toBe("platform-token");
    expect(readSupportSession()).toBeNull();
  });

  it("the chip shows only during a support session", () => {
    const { container, rerender } = render(<SupportSessionChip />);
    expect(container).toBeEmptyDOMElement();
    beginSupportSession("support-token", 7, future(), { mode: "READ", schoolName: "Green Hills" });
    rerender(<SupportSessionChip />);
    expect(screen.getByRole("status", { name: "Support session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /End/ })).toBeInTheDocument();
    // a normal sign-in since then ends it
    localStorage.setItem("token", "someone-else");
    expect(readSupportSession()).toBeNull();
    vi.restoreAllMocks();
  });
});
