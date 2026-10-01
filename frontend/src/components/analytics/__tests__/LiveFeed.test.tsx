import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { LiveEvent } from "../../../api/monitor";
import { EventFeed } from "../Realtime";
import { humanizeFeature } from "../common";

/** Realtime live events (alerts named, filterable, pausable, linked) and readable page names. */
vi.mock("../../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light" }) }));

const ev = (over: Partial<LiveEvent>): LiveEvent => ({
  at: new Date(Date.now() - 90_000).toISOString(),
  kind: "login_success",
  app: "mis",
  user_id: 5,
  user_name: "Ingabire Christine",
  user_type: "TEACHER",
  device_id: null,
  visitor_code: null,
  ip: "41.186.133.192",
  place: "Kigali, RW",
  isp: "MTN Rwandacell",
  detail: null,
  ...over,
});

const EVENTS: LiveEvent[] = [
  ev({ kind: "alert", user_id: 1, user_name: "Niyongabo Emmanuel", detail: { title: "Niyongabo Emmanuel signed in from a new device", severity: "warning" } }),
  ev({ kind: "login_failed", user_id: null, user_name: null, device_id: "AAAAAAAAAAAAAAAAAAAAAA", visitor_code: "V-K4U5A46", detail: { username_attempted: "admin", reason: "unknown_user" } }),
  ev({ kind: "login_success" }),
];

const renderFeed = (events: LiveEvent[]) =>
  render(
    <MemoryRouter>
      <EventFeed events={events} />
    </MemoryRouter>,
  );

describe("live event feed", () => {
  it("names alerts by their title and severity, never 'Someone alert'", () => {
    renderFeed(EVENTS);
    expect(screen.getByText("Niyongabo Emmanuel signed in from a new device")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.queryByText(/Someone/)).toBeNull();
    expect(screen.getAllByText(/ago/)[0]).toHaveTextContent("1 min ago");
  });

  it("links each event to the person, visitor or IP", () => {
    renderFeed(EVENTS);
    const links = within(screen.getByRole("list", { name: "Live events" })).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/analytics/users/1", "/analytics/visitors/AAAAAAAAAAAAAAAAAAAAAA", "/analytics/users/5"]);
  });

  it("filters by kind with counts", async () => {
    renderFeed(EVENTS);
    await userEvent.click(screen.getByRole("radio", { name: /Failed 1/ }));
    const items = within(screen.getByRole("list", { name: "Live events" })).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Visitor V-K4U5A46 failed sign-in as “admin” (unknown user)");
  });

  it("pauses the stream and says how many arrived meanwhile", async () => {
    const { rerender } = renderFeed(EVENTS);
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    rerender(
      <MemoryRouter>
        <EventFeed events={[ev({ kind: "logout", user_name: "Late Arrival" }), ...EVENTS]} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Late Arrival")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Resume (1 new)" }));
    expect(screen.getByText("Late Arrival")).toBeInTheDocument();
  });
});

describe("page names without a catalog entry", () => {
  it("reads as words, without the app prefix", () => {
    expect(humanizeFeature("tendo.attendance_calendar")).toBe("Attendance calendar");
    expect(humanizeFeature("tendo.sso_callback")).toBe("SSO callback");
    expect(humanizeFeature("tm.my_reports")).toBe("My reports");
    expect(humanizeFeature("tupo.chat.thread")).toBe("Chat thread");
  });
});
