import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReminderConfig, ReminderConnections, ReminderPreferences } from "../../../api/reminders";

const api = vi.hoisted(() => ({
  telegramLink: vi.fn(),
  telegramUnlink: vi.fn(),
  googleConnectUrl: vi.fn(),
  googleSync: vi.fn(),
  googleDisconnect: vi.fn(),
}));
const confirm = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());
vi.mock("../../../api/reminders", () => ({ remindersApi: api }));
vi.mock("../../../contexts/ConfirmContext", () => ({ useConfirm: () => confirm }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast }) }));

import { ChannelsPanel } from "../ChannelsPanel";

const prefs = (channels = { telegram: true, email: false, googleCalendar: true }) =>
  ({ enabled: true, channels } as unknown as ReminderPreferences);
const config = (on: boolean): ReminderConfig => ({
  push: { enabled: true, publicKey: "k" },
  dailyPushCap: 8,
  telegram: { enabled: on, bot: on ? "nga_bot" : null },
  googleCalendar: { enabled: on },
  email: { enabled: true, escalateAfterMinutes: 10 },
});

const renderPanel = (over: { config?: ReminderConfig; connections?: ReminderConnections; preferences?: ReminderPreferences } = {}) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onChanged = vi.fn();
  render(
    <ChannelsPanel
      config={over.config ?? config(true)}
      connections={over.connections ?? { telegram: null, googleCalendar: null }}
      preferences={over.preferences ?? prefs()}
      remindersOn
      onSave={onSave}
      onChanged={onChanged}
    />,
  );
  return { onSave, onChanged };
};

describe("ChannelsPanel", () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    confirm.mockReset();
    showToast.mockReset();
  });

  it("says plainly when the school hasn't set Telegram or Google up", () => {
    renderPanel({ config: config(false) });
    expect(screen.getAllByText(/Not set up on this server yet/)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Connect Telegram/ })).toBeNull();
  });

  it("switches email escalation on with a partial patch", async () => {
    const { onSave } = renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Email me when I miss an important reminder" }));
    });
    expect(onSave).toHaveBeenCalledWith({ channels: { telegram: true, email: true, googleCalendar: true } });
    expect(screen.getByText(/within 10 minutes/)).toBeInTheDocument();
  });

  it("opens the Telegram deep link and waits for the chat to be linked", async () => {
    api.telegramLink.mockResolvedValue({ url: "https://t.me/nga_bot?start=abc", expiresAt: "" });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Connect Telegram/ }));
    });
    expect(open).toHaveBeenCalledWith("https://t.me/nga_bot?start=abc", "_blank", "noopener");
    expect(screen.getByText(/Press/)).toHaveTextContent("Press Start in Telegram.");
    expect(screen.getByRole("link", { name: "Open again" })).toHaveAttribute("href", "https://t.me/nga_bot?start=abc");
  });

  it("in NGA Desktop, opens Google in the browser and waits for the connection", async () => {
    api.googleConnectUrl.mockResolvedValue({ url: "https://accounts.google.com/o/oauth2/v2/auth?x=1" });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 Safari/605.1.15 NGADesktop/0.2.0");
    vi.useFakeTimers();
    try {
      const { onChanged } = renderPanel();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Connect Google Calendar/ }));
      });
      expect(open).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?x=1", "_blank", "noopener");
      expect(screen.getByText(/Finish in your browser/)).toBeInTheDocument();
      // Not stuck on "Opening Google…": the page stayed, so the button is usable again.
      expect(screen.getByRole("button", { name: /Connect Google Calendar/ })).not.toBeDisabled();
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(onChanged).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      ua.mockRestore();
      open.mockRestore();
    }
  });

  it("in a browser, goes to Google in the same tab", async () => {
    api.googleConnectUrl.mockResolvedValue({ url: "https://accounts.google.com/o/oauth2/v2/auth?x=2" });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const assign = vi.fn();
    const loc = vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign } as unknown as Location);
    try {
      renderPanel();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Connect Google Calendar/ }));
      });
      expect(assign).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?x=2");
      expect(open).not.toHaveBeenCalled();
    } finally {
      loc.mockRestore();
      open.mockRestore();
    }
  });

  it("shows a linked chat, its switch, and disconnects only after confirming", async () => {
    confirm.mockResolvedValue(true);
    api.telegramUnlink.mockResolvedValue({ removed: true });
    const { onSave, onChanged } = renderPanel({
      connections: { telegram: { username: "aline", linked_at: null }, googleCalendar: null },
    });
    expect(screen.getByText("@aline")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Send reminders to Telegram" }));
    });
    expect(onSave).toHaveBeenCalledWith({ channels: { telegram: false, email: false, googleCalendar: true } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Disconnect/ }));
    });
    expect(confirm).toHaveBeenCalled();
    expect(api.telegramUnlink).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows Google sync state and a sync problem", async () => {
    api.googleSync.mockResolvedValue({ status: "active", last_sync_at: null, last_error: null });
    renderPanel({
      connections: {
        telegram: null,
        googleCalendar: { email: "aline@gmail.com", status: "active", last_sync_at: new Date().toISOString(), last_error: "quota" },
      },
    });
    expect(screen.getByText("aline@gmail.com")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Last sync had a problem: quota");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Sync now/ }));
    });
    expect(showToast).toHaveBeenCalledWith("Google Calendar is up to date", "success");
  });

  it("offers to reconnect when Google access was removed", () => {
    renderPanel({
      connections: { telegram: null, googleCalendar: { email: null, status: "revoked", last_sync_at: null, last_error: null } },
    });
    expect(screen.getByText(/Access was removed in your Google account/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect Google Calendar/ })).toBeInTheDocument();
  });
});
