import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LiveNowPanel from "../builder/LiveNowPanel";

const get = vi.fn();
vi.mock("../../../services/api", () => ({ apiService: { get: (...a: any[]) => get(...a) }, API_BASE_URL: "http://api.test" }));
vi.mock("../../../utils/auth", () => ({ getToken: () => "tok" }));

// A controllable EventSource so the test drives what the server "pushes".
class FakeES {
  static last: FakeES | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeES.last = this;
  }
  close() {
    this.closed = true;
  }
  push(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}
(globalThis as any).EventSource = FakeES;

describe("LiveNowPanel", () => {
  beforeEach(() => {
    get.mockResolvedValue({ data: { data: { watchers: [], recent: [] } } });
    FakeES.last = null;
  });

  it("subscribes with the session token and shows who is learning as events arrive", async () => {
    render(<LiveNowPanel courseId={7} />);
    expect(screen.getByText("nobody online")).toBeInTheDocument();
    await waitFor(() => expect(FakeES.last).toBeTruthy());
    // EventSource cannot send headers, so the token must ride in the query string.
    expect(FakeES.last!.url).toBe("http://api.test/elearning/courses/7/live?token=tok");

    FakeES.last!.onopen?.();
    FakeES.last!.push({
      type: "presence",
      watchers: [{ user_id: 5, name: "Aline Uwase", item_id: 9, item_title: "CSS selectors", item_type: "LESSON_NOTE", section_id: 2, section_title: "Week 2 — CSS", state: "IN_PROGRESS", seconds_spent: 3000, since: Date.now(), last_seen: Date.now(), active: true, dwell_seconds: 120 }],
    });
    expect(await screen.findByText("Aline Uwase")).toBeInTheDocument();
    expect(screen.getByText("1 online")).toBeInTheDocument();
    expect(screen.getByText(/CSS selectors/)).toBeInTheDocument();
    // The label reports this visit (dwell_seconds), not the lifetime total on the item —
    // a student returning to a page they already spent 50 minutes in has not been sitting
    // there for 50 minutes now.
    expect(screen.getByText("2 min on this")).toBeInTheDocument();
  });

  it("reports a student whose pings have stopped as away, not as learning now", async () => {
    render(<LiveNowPanel courseId={7} />);
    await waitFor(() => expect(FakeES.last).toBeTruthy());
    FakeES.last!.onopen?.();

    // Inside the stale window but no longer pinging: still listed, never called present.
    const stale = Date.now() - 62_000;
    FakeES.last!.push({
      type: "presence",
      watchers: [
        {
          user_id: 7,
          name: "Gone Student",
          item_id: 9,
          item_title: "javascript.info/",
          item_type: "LINK",
          section_id: 3,
          section_title: "Week 3 — Data Types",
          state: "IN_PROGRESS",
          seconds_spent: 20,
          since: stale,
          last_seen: stale,
          active: false,
          dwell_seconds: 0,
        },
      ],
      recent: [],
      at: Date.now(),
    });

    expect(await screen.findByText("Gone Student")).toBeInTheDocument();
    expect(screen.getByText(/away 1m/i)).toBeInTheDocument();
    expect(screen.queryByText(/under a minute|min on this/)).not.toBeInTheDocument();

    FakeES.last!.push({
      type: "progress",
      progress: { user_id: 5, name: "Aline Uwase", item_id: 9, item_title: "CSS selectors", item_type: "LESSON_NOTE", section_id: 2, section_title: "Week 2 — CSS", verb: "completed", at: Date.now() },
    });
    expect(await screen.findByText(/finished/)).toBeInTheDocument();
  });

  it("falls back to polling the snapshot when the stream can't connect", async () => {
    get.mockResolvedValue({ data: { data: { watchers: [{ user_id: 6, name: "Eric M", item_id: 1, item_title: "Intro", item_type: "PAGE", section_id: 1, section_title: "Week 1", state: "IN_PROGRESS", seconds_spent: 30, since: Date.now(), last_seen: Date.now(), active: true, dwell_seconds: 30 }], recent: [] } } });
    render(<LiveNowPanel courseId={7} />);
    await waitFor(() => expect(FakeES.last).toBeTruthy());
    FakeES.last!.onerror?.();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/elearning/courses/7/live/snapshot"));
    expect(await screen.findByText("Eric M")).toBeInTheDocument();
  });
});
