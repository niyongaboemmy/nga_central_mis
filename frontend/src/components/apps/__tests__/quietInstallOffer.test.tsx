import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

/**
 * The install offer is quiet: an ordinary visit gets a small bar (never a
 * blocking sheet), and "Not now" keeps it away for weeks, not one session.
 */
const state = vi.hoisted(() => ({ forced: false, token: "t" as string | null }));

vi.mock("../../../utils/auth", () => ({ getToken: () => state.token }));
vi.mock("../../reminders/InstallGuide", () => ({ InstallGuide: () => <p>install steps</p> }));
vi.mock("../../../reminders/pwa", async (orig) => ({
  ...(await orig<typeof import("../../../reminders/pwa")>()),
  usePwa: () => ({ installed: false, linksOpenInBrowser: false, canPrompt: false, platform: { installMethod: "prompt" } }),
  checkInstalledHere: () => Promise.resolve(false),
  installRequested: () => state.forced,
  shouldAskInstallFromLaunch: () => false,
  installReturnUrl: () => null,
}));

import { AutoInstallPrompt } from "../AutoInstallPrompt";
import { AUTO_DISMISS_DAYS, autoPromptSnoozed, snoozeInstallPrompt } from "../../../reminders/pwa";

const renderPrompt = () =>
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <AutoInstallPrompt />
    </MemoryRouter>,
  );

beforeEach(() => {
  state.forced = false;
  state.token = "t";
  localStorage.clear();
  sessionStorage.clear();
});

describe("quiet install offer", () => {
  it("offers a small bar, not a blocking sheet, on an ordinary visit", async () => {
    renderPrompt();
    expect(await screen.findByRole("region", { name: "Install NGA MIS" })).toBeInTheDocument();
    expect(screen.queryByText("install steps")).toBeNull();
  });

  it("opens the full guide from the bar's Install button", async () => {
    renderPrompt();
    await userEvent.click(await screen.findByRole("button", { name: "Install" }));
    expect(screen.getByText("install steps")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Install NGA MIS" })).toBeNull();
  });

  it("'Not now' keeps it away for weeks, across browser sessions", async () => {
    renderPrompt();
    await userEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("region", { name: "Install NGA MIS" })).toBeNull();
    sessionStorage.clear(); // a new browser session
    expect(autoPromptSnoozed()).toBe(true);
    expect(autoPromptSnoozed(Date.now() + (AUTO_DISMISS_DAYS + 1) * 86_400_000)).toBe(false);
  });

  it("honours a dismissed browser install dialog (the 'two weeks' promise)", () => {
    snoozeInstallPrompt();
    expect(autoPromptSnoozed()).toBe(true);
  });

  it("says nothing on the sign-in page", async () => {
    state.token = null;
    renderPrompt();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("region", { name: "Install NGA MIS" })).toBeNull();
  });

  it("still opens the full sheet when the NGA installer asks, despite 'Not now'", async () => {
    state.forced = true;
    localStorage.setItem("nga.pwa.installOfferDismissedUntil", String(Date.now() + 86_400_000));
    renderPrompt();
    await waitFor(() => expect(screen.getByText("install steps")).toBeInTheDocument());
  });
});
