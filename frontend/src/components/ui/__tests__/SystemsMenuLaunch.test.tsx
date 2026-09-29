import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SystemsMenu from "../SystemsMenu";
import { buildLaunchHref, buildLoginHref, resolveRedirectUri, withLaunchMarker } from "../appLaunch";
import { captureLaunchMarker, markLaunchInstallAsked, routeLaunch, shouldAskInstallFromLaunch } from "../../../reminders/pwa";

const auth = vi.hoisted(() => ({ authorizeSSO: vi.fn() }));
vi.mock("../../../api/auth", () => ({ authorizeSSO: auth.authorizeSSO }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const tm = {
  system_id: 1,
  name: "TaskMentor",
  client_id: "taskmentor_app",
  allowed_redirect_uris: "https://taskmentor.amashuri.com/sso/callback",
  home_url: "https://taskmentor.amashuri.com",
  icon_url: null,
} as any;
const ganzaa = { system_id: 2, name: "Ganzaa", client_id: null, allowed_redirect_uris: null, home_url: "https://ganzaa.org", icon_url: null } as any;

describe("launch helpers", () => {
  it("prefers a callback on this origin, then the first callback, then the home page", () => {
    expect(resolveRedirectUri({ allowed_redirect_uris: "https://a.x/cb, http://localhost/cb", home_url: null } as any, "http://localhost")).toBe("http://localhost/cb");
    expect(resolveRedirectUri({ allowed_redirect_uris: "https://a.x/cb", home_url: "https://a.x" } as any, "https://mis")).toBe("https://a.x/cb");
    expect(resolveRedirectUri({ allowed_redirect_uris: "", home_url: "https://a.x" } as any, "https://mis")).toBe("https://a.x");
  });

  it("marks links opened from the installed NGA app, and only then", () => {
    expect(withLaunchMarker("https://a.x/cb?code=1", true)).toBe("https://a.x/cb?code=1&nga_launch=app");
    expect(withLaunchMarker("https://a.x/cb?code=1", false)).toBe("https://a.x/cb?code=1");
  });

  it("builds the callback and MIS login links", () => {
    expect(buildLaunchHref("https://a.x/cb?x=1", "C0DE", "st")).toBe("https://a.x/cb?x=1&code=C0DE&state=st");
    const login = new URL(buildLoginHref("https://mis.x", "app", "https://a.x/cb", "st"));
    expect(login.pathname).toBe("/login");
    expect(Object.fromEntries(login.searchParams)).toEqual({ client_id: "app", redirect_uri: "https://a.x/cb", response_type: "code", state: "st" });
  });
});

describe("Apps menu tiles are real links (so Chrome can open the installed app)", () => {
  beforeEach(() => {
    auth.authorizeSSO.mockReset();
  });

  it("renders a new-tab, noopener link carrying a pre-minted SSO code", async () => {
    auth.authorizeSSO.mockResolvedValue({ code: "abc123", state: "s1" });
    render(<SystemsMenu isOpen onClose={vi.fn()} systems={[tm, ganzaa]} />);

    const tile = await screen.findByTitle("Open TaskMentor");
    await waitFor(() => expect(tile).toHaveAttribute("href", "https://taskmentor.amashuri.com/sso/callback?code=abc123&state=s1"));
    expect(tile.tagName).toBe("A");
    expect(tile).toHaveAttribute("target", "_blank");
    expect(tile.getAttribute("rel")).toContain("noopener");
    // The code is minted for the registered callback with a random state.
    expect(auth.authorizeSSO).toHaveBeenCalledWith("taskmentor_app", "https://taskmentor.amashuri.com/sso/callback", "code", expect.stringMatching(/^[0-9a-f]{32}$/));

    // Non-SSO systems link straight to their home page.
    expect(screen.getByTitle("Open Ganzaa")).toHaveAttribute("href", "https://ganzaa.org");
  });

  it("re-mints after a tile is used (codes are single-use) and closes the menu", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    auth.authorizeSSO.mockResolvedValueOnce({ code: "first" }).mockResolvedValueOnce({ code: "second" });
    const onClose = vi.fn();
    render(<SystemsMenu isOpen onClose={onClose} systems={[tm]} />);
    const tile = await screen.findByTitle("Open TaskMentor");
    await waitFor(() => expect(tile.getAttribute("href")).toContain("code=first"));

    fireEvent.click(tile);
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(tile.getAttribute("href")).toContain("code=second"));
    vi.useRealTimers();
  });

  it("sends a signed-out user to MIS sign-in, continuing to the app", async () => {
    auth.authorizeSSO.mockRejectedValue({ response: { status: 401 } });
    render(<SystemsMenu isOpen onClose={vi.fn()} systems={[tm]} />);
    const tile = await screen.findByTitle("Open TaskMentor");
    await waitFor(() => expect(tile.getAttribute("href")).toMatch(/\/login\?client_id=taskmentor_app/));
    expect(tile).not.toHaveAttribute("target");
  });

  it("falls back to the scripted launch while the code is still being minted", async () => {
    auth.authorizeSSO.mockReturnValue(new Promise(() => undefined));
    const popup = { location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(popup as any);
    render(<SystemsMenu isOpen onClose={vi.fn()} systems={[tm]} />);
    const tile = await screen.findByTitle("Open TaskMentor");
    fireEvent.click(tile);
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    open.mockRestore();
  });
});

describe("routeLaunch (Launch Handler into the open MIS window)", () => {
  it("routes same-origin launches inside the app and ignores others", () => {
    const pop = vi.fn();
    window.addEventListener("popstate", pop);
    expect(routeLaunch(`${window.location.origin}/reminders?source=link`)).toBe(true);
    expect(window.location.pathname).toBe("/reminders");
    expect(pop).toHaveBeenCalledTimes(1);
    expect(routeLaunch(`${window.location.origin}/reminders?source=link`)).toBe(false);
    expect(routeLaunch("https://evil.example/x")).toBe(false);
    expect(routeLaunch(undefined)).toBe(false);
    window.removeEventListener("popstate", pop);
  });
});

describe("opened from another installed NGA app", () => {
  it("remembers the marker, cleans the address, and asks only once per session", () => {
    try {
      sessionStorage.removeItem("nga.launchedFromApp");
      sessionStorage.removeItem("nga.launchInstallAsked");
    } catch {
      /* ignore */
    }
    window.history.replaceState(null, "", "/home?nga_launch=app&x=1");
    captureLaunchMarker();
    expect(window.location.search).toBe("?x=1");
    expect(shouldAskInstallFromLaunch()).toBe(true);
    markLaunchInstallAsked();
    expect(shouldAskInstallFromLaunch()).toBe(false);
  });
});
