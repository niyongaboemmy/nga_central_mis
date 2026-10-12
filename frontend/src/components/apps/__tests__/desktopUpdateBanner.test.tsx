import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DesktopUpdateBanner, { SNOOZE_KEY } from "../DesktopUpdateBanner";

const release = (version: string) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, data: { version } }), { status: 200 }));

const setBridge = (b: unknown) => Object.defineProperty(window, "ngaDesktop", { value: b, configurable: true, writable: true });

describe("DesktopUpdateBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, "", "/dashboard");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setBridge(undefined);
  });

  it("shows nothing in a browser (no desktop bridge)", async () => {
    const f = release("0.16.0");
    render(<DesktopUpdateBanner />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("desktop-update-banner")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("shows nothing when the desktop is current", async () => {
    setBridge({ version: "0.16.0", installUpdate: vi.fn() });
    release("0.16.0");
    render(<DesktopUpdateBanner />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("desktop-update-banner")).toBeNull();
  });

  it("offers one-click update to an old desktop, and installs it", async () => {
    const installUpdate = vi.fn().mockReturnValue(new Promise(() => {}));
    setBridge({ version: "0.8.0", installUpdate });
    release("0.16.0");
    render(<DesktopUpdateBanner />);
    const banner = await screen.findByTestId("desktop-update-banner");
    expect(banner).toHaveTextContent("NGA Desktop 0.16.0 is ready (you have 0.8.0)");
    fireEvent.click(screen.getByText("Update now"));
    expect(installUpdate).toHaveBeenCalledOnce();
    expect(banner).toHaveTextContent("Updating NGA");
  });

  it("explains a busy refusal (quiz or meeting open)", async () => {
    setBridge({ version: "0.8.0", installUpdate: vi.fn().mockRejectedValue("busy: finish the Task Mentor quiz or meeting first") });
    release("0.16.0");
    render(<DesktopUpdateBanner />);
    fireEvent.click(await screen.findByText("Update now"));
    await waitFor(() => expect(screen.getByTestId("desktop-update-banner")).toHaveTextContent("finish the Task Mentor quiz or meeting first."));
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("Later hides it for a day", async () => {
    setBridge({ version: "0.8.0", installUpdate: vi.fn() });
    release("0.16.0");
    const { unmount } = render(<DesktopUpdateBanner />);
    fireEvent.click(await screen.findByLabelText("Later"));
    expect(screen.queryByTestId("desktop-update-banner")).toBeNull();
    expect(Number(localStorage.getItem(SNOOZE_KEY))).toBeGreaterThan(Date.now() + 23 * 3600_000);
    unmount();
    const f = release("0.16.0");
    f.mockClear();
    render(<DesktopUpdateBanner />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("desktop-update-banner")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("stays off /apps, which has its own update card", async () => {
    window.history.pushState({}, "", "/apps");
    setBridge({ version: "0.8.0", installUpdate: vi.fn() });
    release("0.16.0");
    render(<DesktopUpdateBanner />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("desktop-update-banner")).toBeNull();
  });
});
